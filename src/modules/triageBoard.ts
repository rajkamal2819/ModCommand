import type { Context } from '@devvit/public-api'
import type { ModQueueItem, ComboAction } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'
import { getModeratorSet } from '../auth/isModerator.js'
import { recordAudit, type AuditAction } from './audit.js'
import { recordSentinelSample } from './adaptiveThreshold.js'
import { invalidateDossierCache } from './dossier.js'

function ttl(seconds: number): { expiration: Date } {
  return { expiration: new Date(Date.now() + seconds * 1000) }
}

const PENDING_TTL_SECONDS = 24 * 60 * 60 // pending actions expire after 24h
const DONE_WINDOW_MS = 60 * 60 * 1000 // show last hour of done actions
const DONE_KEEP = 50 // keep at most 50 done entries per sub

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// A perm-ban (no banDuration) is the only action that needs second-mod sign-off
// in this MVP. Approve, remove-only, and temp bans go through immediately.
function needsSecondApproval(action: ComboAction, modCount: number): boolean {
  if (action.approve) return false
  if (!action.ban) return false
  if (action.banDuration && action.banDuration > 0) return false
  return modCount >= 2 // solo-mod subs always self-execute
}

async function recordDone(
  subName: string,
  itemId: string,
  action: ComboAction,
  executedBy: string,
  meta: { title: string; author: string; url: string; type: 'post' | 'comment'; reportReason: string },
  redis: Context['redis']
): Promise<void> {
  const member = JSON.stringify({
    itemId,
    action,
    executedBy,
    executedAt: Date.now(),
    title: meta.title,
    author: meta.author,
    url: meta.url,
    type: meta.type,
    reportReason: meta.reportReason,
  })
  await redis.zAdd(Keys.recentDone(subName), { score: Date.now(), member })
  // Trim by count + age
  const total = await redis.zCard(Keys.recentDone(subName))
  if (total > DONE_KEEP) {
    await redis.zRemRangeByRank(Keys.recentDone(subName), 0, total - DONE_KEEP - 1)
  }
  await redis.zRemRangeByScore(Keys.recentDone(subName), 0, Date.now() - DONE_WINDOW_MS)
}

// ─────────────────────────────────────────────────────────────────────────────
// Triage init — fetches modqueue + spam, overlays pending + done
// ─────────────────────────────────────────────────────────────────────────────

export async function handleTriageInit(context: Context): Promise<{
  items: ModQueueItem[]
  currentMod: string
}> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()
  const subName = subreddit.name
  const currentMod = (await context.reddit.getCurrentUsername()) ?? 'unknown'

  // Pre-warm the mod-list cache in the background so the first Copilot call later
  // doesn't pay the cold-start tax on getModerators().all().
  getModeratorSet(subName, context).catch(() => {})

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queue: any[] = []

  // Try mod queue (includes reports + spam-filtered items)
  try {
    const modQueue = await subreddit.getModQueue().all()
    queue = modQueue
  } catch (err) {
    console.error('[Triage] getModQueue failed:', err instanceof Error ? err.message : err)
  }

  // Also try the spam queue — Reddit's auto-filter dumps here, and depending on
  // the Devvit version this may not be fully merged into modQueue.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spam = await (subreddit as any).getSpam?.()?.all?.()
    if (Array.isArray(spam) && spam.length > 0) {
      const knownIds = new Set(queue.map((q) => q.id))
      for (const s of spam) {
        if (!knownIds.has(s.id)) queue.push(s)
      }
    }
  } catch {
    // getSpam may not exist on this Devvit version — ignore
  }

  // Dev/playtest fallback: if nothing in the queue, show recent posts so the board
  // isn't empty during demos
  if (queue.length === 0) {
    try {
      const recentPosts = await context.reddit.getNewPosts({ subredditName: subName, limit: 25 }).all()
      queue = recentPosts.filter((p: { id: string }) => p.id !== context.postId)
    } catch {}
  }

  const items: ModQueueItem[] = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queue.map(async (item: any) => {
      const itemId = item.id
      const [claimedBy, editRecord, pendingHash] = await Promise.all([
        redis.get(Keys.claimLock(itemId)),
        redis.hGetAll(Keys.editRecord(itemId)),
        redis.hGetAll(Keys.pendingAction(itemId)),
      ])

      const aigcScore = editRecord?.['aigcScore'] ? parseInt(editRecord['aigcScore'], 10) : null
      const evasionScore = (editRecord?.['score'] as 'HIGH' | 'MEDIUM' | 'LOW' | undefined) ?? null
      const hasEdit = Boolean(editRecord?.['edited'])

      const isComment = 'postId' in item
      const reportReason =
        (item.modReportReasons?.[0] ?? item.userReportReasons?.[0] ?? 'Pending review')

      const hasPending = pendingHash && pendingHash['action']
      let status: ModQueueItem['status']
      if (hasPending) status = 'action_pending'
      else if (claimedBy) status = 'in_review'
      else status = 'unclaimed'

      const base: ModQueueItem = {
        id: itemId,
        title: isComment
          ? `Comment by u/${item.authorName ?? 'unknown'}`
          : (item as { title?: string }).title ?? `Post ${itemId}`,
        author: item.authorName ?? 'unknown',
        subreddit: subName,
        reportReason,
        reportedAt: item.createdAt instanceof Date ? item.createdAt.getTime() : Date.now(),
        createdAt: item.createdAt instanceof Date ? item.createdAt.getTime() : Date.now(),
        url: `https://reddit.com${item.permalink ?? ''}`,
        type: isComment ? 'comment' : 'post',
        claimedBy: claimedBy ?? null,
        claimedAt: null,
        aigcScore,
        editEvasionScore: hasEdit ? (evasionScore ?? null) : null,
        status,
      }

      if (hasPending) {
        try {
          base.pendingAction = JSON.parse(pendingHash['action']) as ComboAction
          base.pendingInitiator = pendingHash['initiator']
          base.pendingAt = pendingHash['createdAt'] ? parseInt(pendingHash['createdAt'], 10) : Date.now()
        } catch {
          // malformed — ignore
        }
      }

      return base
    })
  )

  // Pending items whose underlying Reddit post is no longer in the queue (e.g.
  // post got removed elsewhere) still need to render — pull them in from the
  // pending index and reconstruct cards from the stored hash.
  const knownIds = new Set(items.map((i) => i.id))
  try {
    const cutoff = Date.now() - PENDING_TTL_SECONDS * 1000
    const pendingEntries = await redis.zRange(Keys.pendingIndex(subName), cutoff, Date.now(), {
      by: 'score',
    } as unknown as { by: 'score' })
    for (const entry of (pendingEntries ?? [])) {
      const pid = (entry as { member: string }).member
      if (knownIds.has(pid)) continue
      const hash = await redis.hGetAll(Keys.pendingAction(pid))
      if (!hash || !hash['action']) continue
      try {
        items.push({
          id: pid,
          title: hash['title'] ?? `Item ${pid}`,
          author: hash['author'] ?? 'unknown',
          subreddit: subName,
          reportReason: hash['reportReason'] ?? 'Pending review',
          reportedAt: hash['createdAt'] ? parseInt(hash['createdAt'], 10) : Date.now(),
          createdAt: hash['createdAt'] ? parseInt(hash['createdAt'], 10) : Date.now(),
          url: hash['url'] ?? '',
          type: (hash['type'] as 'post' | 'comment') ?? 'post',
          claimedBy: null,
          claimedAt: null,
          aigcScore: null,
          editEvasionScore: null,
          status: 'action_pending',
          pendingAction: JSON.parse(hash['action']) as ComboAction,
          pendingInitiator: hash['initiator'],
          pendingAt: hash['createdAt'] ? parseInt(hash['createdAt'], 10) : Date.now(),
        })
      } catch {}
    }
  } catch (err) {
    console.error('[Triage] pending index read failed:', err instanceof Error ? err.message : err)
  }

  // Recently completed actions — last hour
  try {
    const minScore = Date.now() - DONE_WINDOW_MS
    const doneEntries = await redis.zRange(Keys.recentDone(subName), minScore, Date.now(), {
      by: 'score',
    } as unknown as { by: 'score' })
    for (const entry of (doneEntries ?? [])) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = JSON.parse((entry as { member: string }).member) as any
        items.push({
          id: data.itemId,
          title: data.title,
          author: data.author,
          subreddit: subName,
          reportReason: data.reportReason ?? '',
          reportedAt: data.executedAt,
          createdAt: data.executedAt,
          url: data.url,
          type: data.type,
          claimedBy: null,
          claimedAt: null,
          aigcScore: null,
          editEvasionScore: null,
          status: 'done',
          doneAction: data.action,
          doneBy: data.executedBy,
          doneAt: data.executedAt,
        })
      } catch {}
    }
  } catch (err) {
    console.error('[Triage] recent done read failed:', err instanceof Error ? err.message : err)
  }

  return { items, currentMod }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim / release
// ─────────────────────────────────────────────────────────────────────────────

export async function handleClaim(
  itemId: string,
  modName: string,
  context: Context
): Promise<{ claimedBy: string }> {
  const redis = context.redis

  const existing = await redis.get(Keys.claimLock(itemId))
  if (existing && existing !== modName) {
    throw new Error(`Already claimed by u/${existing}`)
  }

  await redis.set(Keys.claimLock(itemId), modName, ttl(300))
  return { claimedBy: modName }
}

export async function handleRelease(itemId: string, context: Context): Promise<void> {
  await context.redis.del(Keys.claimLock(itemId))
}

// ─────────────────────────────────────────────────────────────────────────────
// Combo action — main action handler. Routes high-stakes actions to pending.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComboResult {
  status: 'executed' | 'pending_approval'
  message: string
}

export async function handleComboAction(
  itemId: string,
  action: ComboAction,
  context: Context
): Promise<ComboResult> {
  const subreddit = await context.reddit.getCurrentSubreddit()
  const subName = subreddit.name
  const redis = context.redis
  const record = await redis.hGetAll(Keys.editRecord(itemId))
  const authorName = record?.['author'] ?? 'unknown'

  // Approve path — clears reports, keeps post visible. Always executes.
  if (action.approve) {
    try {
      await context.reddit.approve(itemId)
      await redis.hDel(Keys.sentinelRemoved(subName), [itemId])
    } catch (err) {
      console.error('[Triage] approve failed:', err instanceof Error ? err.message : err)
    }
    const modName = (await context.reddit.getCurrentUsername()) ?? 'unknown'
    await recordAuditFor(subName, itemId, 'approve', modName, authorName, record, context)
    await recordSampleIfScored(subName, itemId, 'approved', record, context)
    await invalidateDossierCache(subName, authorName, context)
    await recordDoneFromAction(subName, itemId, action, context, record)
    await handleRelease(itemId, context)
    return { status: 'executed', message: 'Post approved — reports cleared' }
  }

  // Second-mod approval required?
  const modSet = await getModeratorSet(subName, context).catch(() => new Set<string>())
  if (needsSecondApproval(action, modSet.size)) {
    const initiator = (await context.reddit.getCurrentUsername()) ?? 'unknown'
    const meta = await snapshotItemMeta(itemId, context, record)
    await redis.hSet(Keys.pendingAction(itemId), {
      action: JSON.stringify(action),
      initiator,
      createdAt: Date.now().toString(),
      title: meta.title,
      author: meta.author,
      url: meta.url,
      type: meta.type,
      reportReason: meta.reportReason,
    })
    // Expire the pending hash after 24h if no one confirms or rejects
    await redis.expire(Keys.pendingAction(itemId), PENDING_TTL_SECONDS)
    await redis.zAdd(Keys.pendingIndex(subName), { score: Date.now(), member: itemId })
    await handleRelease(itemId, context) // free the claim so another mod can confirm
    return {
      status: 'pending_approval',
      message: 'Permanent ban requires a second mod to confirm — moved to Action Pending',
    }
  }

  // Execute immediately
  await executeAction(itemId, action, subName, authorName, context)
  const modName = (await context.reddit.getCurrentUsername()) ?? 'unknown'
  if (action.remove) {
    await recordAuditFor(subName, itemId, 'remove', modName, authorName, record, context)
    await recordSampleIfScored(subName, itemId, 'removed', record, context)
  }
  if (action.ban) {
    const banAction: AuditAction = action.banDuration && action.banDuration > 0 ? 'temp_ban' : 'ban'
    await recordAuditFor(subName, itemId, banAction, modName, authorName, record, context, action.banReason)
  }
  await invalidateDossierCache(subName, authorName, context)
  await recordDoneFromAction(subName, itemId, action, context, record)
  await handleRelease(itemId, context)
  return { status: 'executed', message: 'Action completed successfully' }
}

// Helper: write an audit entry with consistent fields
async function recordAuditFor(
  subName: string,
  itemId: string,
  action: AuditAction,
  mod: string,
  targetUser: string,
  _record: Record<string, string>,
  context: Context,
  reason?: string
): Promise<void> {
  await recordAudit(
    subName,
    { action, mod, itemId, targetUser, reason },
    context
  )
}

// Helper: record an AIGC threshold sample if the item had a Sentinel score
async function recordSampleIfScored(
  subName: string,
  itemId: string,
  decision: 'approved' | 'removed',
  record: Record<string, string>,
  context: Context
): Promise<void> {
  const scoreStr = record?.['aigcScore']
  if (!scoreStr) return
  const aigc = parseInt(scoreStr, 10)
  if (Number.isNaN(aigc)) return
  await recordSentinelSample(subName, itemId, aigc, decision, context)
}

async function executeAction(
  itemId: string,
  action: ComboAction,
  subName: string,
  authorName: string,
  context: Context
): Promise<void> {
  const redis = context.redis
  if (action.remove) {
    try {
      await context.reddit.remove(itemId, false)
      await redis.hSet(Keys.sentinelRemoved(subName), { [itemId]: 'mod' })
    } catch (err) {
      console.error('[Triage] remove failed:', err instanceof Error ? err.message : err)
    }
  }
  if (action.ban && authorName && authorName !== 'unknown') {
    try {
      await context.reddit.banUser({
        subredditName: subName,
        username: authorName,
        reason: action.banReason || 'Rule violation',
        message: action.banReason || 'You have been banned from this community.',
        duration: action.banDuration,
      })
    } catch (err) {
      console.error('[Triage] ban failed:', err instanceof Error ? err.message : err)
    }
  }
  if (action.removalReason && authorName && authorName !== 'unknown') {
    try {
      await context.reddit.addModNote({
        subreddit: subName,
        user: authorName,
        note: action.removalReason,
        label: 'SPAM_WARNING',
        redditId: `t3_${itemId}`,
      })
    } catch {}
  }
}

async function snapshotItemMeta(
  itemId: string,
  context: Context,
  record: Record<string, string>
): Promise<{ title: string; author: string; url: string; type: 'post' | 'comment'; reportReason: string }> {
  // Prefer fresh Reddit metadata; fall back to editRecord
  let title = record?.['title'] ?? `Item ${itemId}`
  let author = record?.['author'] ?? 'unknown'
  let url = record?.['url'] ?? ''
  let type: 'post' | 'comment' = (record?.['type'] as 'post' | 'comment') ?? 'post'
  const reportReason = 'Pending mod approval'
  try {
    if (itemId.startsWith('t1_')) {
      const c = await context.reddit.getCommentById(itemId)
      author = c.authorName ?? author
      url = `https://reddit.com${c.permalink ?? ''}`
      title = `Comment by u/${author}`
      type = 'comment'
    } else {
      const fullId = itemId.startsWith('t3_') ? itemId : `t3_${itemId}`
      const p = await context.reddit.getPostById(fullId)
      title = p.title ?? title
      author = p.authorName ?? author
      url = `https://reddit.com${p.permalink ?? ''}`
      type = 'post'
    }
  } catch {}
  return { title, author, url, type, reportReason }
}

async function recordDoneFromAction(
  subName: string,
  itemId: string,
  action: ComboAction,
  context: Context,
  record: Record<string, string>
): Promise<void> {
  const meta = await snapshotItemMeta(itemId, context, record)
  const executedBy = (await context.reddit.getCurrentUsername()) ?? 'unknown'
  await recordDone(subName, itemId, action, executedBy, meta, context.redis)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending action confirm / reject
// ─────────────────────────────────────────────────────────────────────────────

export async function handlePendingConfirm(itemId: string, context: Context): Promise<ComboResult> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()
  const subName = subreddit.name

  const hash = await redis.hGetAll(Keys.pendingAction(itemId))
  if (!hash || !hash['action']) {
    throw new Error('No pending action found for this item')
  }
  const initiator = hash['initiator']
  const confirmer = (await context.reddit.getCurrentUsername()) ?? 'unknown'
  if (confirmer === initiator) {
    throw new Error('You cannot confirm your own pending action — needs a different mod')
  }

  const action = JSON.parse(hash['action']) as ComboAction
  const record = await redis.hGetAll(Keys.editRecord(itemId))
  const authorName = record?.['author'] ?? hash['author'] ?? 'unknown'

  await executeAction(itemId, action, subName, authorName, context)

  // Done snapshot reflects the confirming mod's action
  const meta = {
    title: hash['title'] ?? `Item ${itemId}`,
    author: authorName,
    url: hash['url'] ?? '',
    type: (hash['type'] as 'post' | 'comment') ?? 'post',
    reportReason: `Confirmed perm-ban (initiator: u/${initiator})`,
  }
  await recordDone(subName, itemId, action, confirmer, meta, redis)

  // Audit + sample collection + dossier cache invalidate
  if (action.remove) {
    await recordAuditFor(subName, itemId, 'remove', confirmer, authorName, record, context)
    await recordSampleIfScored(subName, itemId, 'removed', record, context)
  }
  if (action.ban) {
    const banAction: AuditAction = action.banDuration && action.banDuration > 0 ? 'temp_ban' : 'ban'
    await recordAuditFor(subName, itemId, banAction, confirmer, authorName, record, context, action.banReason)
  }
  await invalidateDossierCache(subName, authorName, context)

  // Clean up pending
  await redis.del(Keys.pendingAction(itemId))
  await redis.zRem(Keys.pendingIndex(subName), [itemId])

  return { status: 'executed', message: `Confirmed by u/${confirmer} — action executed` }
}

export async function handlePendingReject(itemId: string, context: Context): Promise<ComboResult> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()
  const subName = subreddit.name

  const hash = await redis.hGetAll(Keys.pendingAction(itemId))
  if (!hash) throw new Error('No pending action found')

  await redis.del(Keys.pendingAction(itemId))
  await redis.zRem(Keys.pendingIndex(subName), [itemId])
  return { status: 'executed', message: 'Pending action cancelled' }
}
