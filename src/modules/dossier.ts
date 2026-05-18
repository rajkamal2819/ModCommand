import type { Context } from '@devvit/public-api'
import type { DossierState, DossierItem, DossierSummary } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'
import { getModeratorSet } from '../auth/isModerator.js'
import { withTimeout as withTimeoutShared } from './_util.js'
import { readAuditByUser } from './audit.js'
import { dossierSummary as aiDossierSummary } from '../ai/gemini.js'

const CACHE_TTL_SECONDS = 60
const ITEM_FEED_CAP = 30
const EDIT_FEED_SCAN_CAP = 200

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return withTimeoutShared(p, ms, fallback, label, 'Dossier')
}

export async function handleDossierLoad(
  username: string,
  context: Context
): Promise<DossierState> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()
  const subName = subreddit.name
  const t0 = Date.now()

  // ─── Cache check ────────────────────────────────────────────────────────
  const cached = await redis.get(Keys.dossierCache(subName, username))
  if (cached) {
    try {
      console.log(`[Dossier] cache hit for ${username}`)
      return JSON.parse(cached) as DossierState
    } catch {}
  }

  // ─── Mod-on-mod short-circuit ───────────────────────────────────────────
  const modSet = await withTimeout(
    getModeratorSet(subName, context),
    5000,
    new Set<string>(),
    'getModeratorSet'
  )
  if (modSet.has(username)) {
    const state: DossierState = {
      username,
      accountAgeDays: null,
      karma: null,
      isModerator: true,
      isDeleted: false,
      installedAt: null,
      recentItems: [],
      evasionCount: 0,
      appealStatus: null,
      appealAt: null,
      auditOnUser: [],
      pinned: false,
    }
    // Cache for short window so repeated clicks are instant
    await redis.set(Keys.dossierCache(subName, username), JSON.stringify(state), {
      expiration: new Date(Date.now() + CACHE_TTL_SECONDS * 1000),
    })
    console.log(`[Dossier] mod short-circuit for ${username} in ${Date.now() - t0}ms`)
    return state
  }

  // ─── Parallel data fetch ────────────────────────────────────────────────
  const subId = context.subredditId ?? ''
  const [
    user,
    userItemsRaw,
    sentinelRemovedMap,
    editFeedRaw,
    appealRecord,
    installedAtRaw,
    pinnedSet,
    auditOnUser,
  ] = await Promise.all([
    withTimeout(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context.reddit.getUserByUsername(username) as Promise<any>,
      5000,
      null,
      'getUserByUsername'
    ),
    withTimeout(
      redis.zRange(Keys.userItems(subName, username), 0, -1),
      3000,
      [] as Array<{ score: number; member: string }>,
      'userItems'
    ),
    withTimeout(
      redis.hGetAll(Keys.sentinelRemoved(subName)),
      3000,
      {} as Record<string, string>,
      'sentinelRemoved'
    ),
    withTimeout(
      redis.zRange(Keys.editFeed(subName), 0, -1),
      3000,
      [] as Array<{ score: number; member: string }>,
      'editFeed'
    ),
    withTimeout(
      redis.hGetAll(Keys.appeal(username)),
      2000,
      {} as Record<string, string>,
      'appeal'
    ),
    subId
      ? withTimeout(redis.get(Keys.installedAt(subId)), 1000, null, 'installedAt')
      : Promise.resolve(null),
    withTimeout(
      redis.hGetAll(Keys.dossierPinned(subName)),
      1000,
      {} as Record<string, string>,
      'dossierPinned'
    ),
    withTimeout(
      readAuditByUser(subName, username, context, 20),
      3000,
      [] as Array<{ ts: number; action: string; mod: string; itemId?: string; reason?: string }>,
      'audit'
    ),
  ])

  // ─── Recent items (last N from userItems index) ─────────────────────────
  // Sorted set is by createdAt ascending — take the tail (newest)
  const recentRaw = userItemsRaw.slice(-ITEM_FEED_CAP).reverse()
  const recentItems: DossierItem[] = []
  for (const r of recentRaw) {
    const itemId = r.member
    let title = `${itemId}`
    let type: 'post' | 'comment' = itemId.startsWith('t1_') ? 'comment' : 'post'
    let aigcScore: number | null = null
    let evasion: 'HIGH' | 'MEDIUM' | 'LOW' | null = null
    try {
      const editRecord = await withTimeout(
        redis.hGetAll(Keys.editRecord(itemId)),
        500,
        {} as Record<string, string>,
        `editRecord:${itemId}`
      )
      if (editRecord?.['title']) title = editRecord['title']
      if (editRecord?.['type'] === 'comment') type = 'comment'
      if (editRecord?.['aigcScore']) aigcScore = parseInt(editRecord['aigcScore'], 10)
      if (editRecord?.['score']) evasion = editRecord['score'] as 'HIGH' | 'MEDIUM' | 'LOW'
    } catch {}
    const removedByRaw = sentinelRemovedMap?.[itemId]
    const removedBy: 'mod' | 'user' | null =
      removedByRaw === 'mod' ? 'mod' : removedByRaw === 'user' ? 'user' : null
    recentItems.push({
      id: itemId,
      title,
      type,
      aigcScore,
      removedBy,
      scoredAt: r.score,
      evasionScore: evasion,
    })
  }

  // ─── Evasion count (filter editFeed by author) ──────────────────────────
  let evasionCount = 0
  const editScan = editFeedRaw.slice(-EDIT_FEED_SCAN_CAP)
  for (const e of editScan) {
    try {
      const data = JSON.parse(e.member) as Record<string, string>
      if (data['author'] === username && data['status'] === 'flagged') evasionCount++
    } catch {}
  }

  // ─── Account metadata ───────────────────────────────────────────────────
  let accountAgeDays: number | null = null
  let karma: number | null = null
  let isDeleted = !user
  if (user) {
    const createdAt = user.createdAt?.getTime?.() ?? null
    if (createdAt) {
      accountAgeDays = Math.floor((Date.now() - createdAt) / 86400000)
    }
    karma = (user.linkKarma ?? 0) + (user.commentKarma ?? 0)
  }

  // ─── Appeal status ──────────────────────────────────────────────────────
  let appealStatus: 'pending' | 'accepted' | 'denied' | null = null
  let appealAt: number | null = null
  const rawStatus = appealRecord?.['status']
  if (rawStatus === 'pending' || rawStatus === 'accepted' || rawStatus === 'denied') {
    appealStatus = rawStatus
    appealAt = appealRecord['submittedAt'] ? parseInt(appealRecord['submittedAt'], 10) : null
  }

  // ─── Installed at ───────────────────────────────────────────────────────
  const installedAt = installedAtRaw ? parseInt(installedAtRaw, 10) : null

  // ─── Pinned ─────────────────────────────────────────────────────────────
  const pinned = !!pinnedSet?.[username]

  const state: DossierState = {
    username,
    accountAgeDays,
    karma,
    isModerator: false,
    isDeleted,
    installedAt,
    recentItems,
    evasionCount,
    appealStatus,
    appealAt,
    auditOnUser,
    pinned,
  }

  await redis.set(Keys.dossierCache(subName, username), JSON.stringify(state), {
    expiration: new Date(Date.now() + CACHE_TTL_SECONDS * 1000),
  })
  console.log(`[Dossier] loaded ${username} in ${Date.now() - t0}ms (items=${recentItems.length}, evasion=${evasionCount})`)
  return state
}

// Cache invalidation — called after any combo action against an author so a
// fresh dossier picks up the new status next time it's opened.
export async function invalidateDossierCache(
  subName: string,
  username: string,
  context: Context
): Promise<void> {
  try {
    await context.redis.del(Keys.dossierCache(subName, username))
  } catch {}
}

// Two-stage rendering: the panel paints data immediately from handleDossierLoad,
// then this fires the AI summary as a follow-up message.
// Returns null if Gemini is unavailable or the user has no signals worth summarizing.
export async function handleDossierSummary(
  username: string,
  data: DossierState,
  context: Context
): Promise<DossierSummary | null> {
  if (data.isModerator || data.isDeleted) return null
  if (data.recentItems.length === 0 && data.evasionCount === 0 && !data.appealStatus) {
    // Nothing meaningful to summarize
    return null
  }

  const subreddit = await context.reddit.getCurrentSubreddit()
  // Check the server-side per-user cache first (24h)
  const cached = await context.redis.get(Keys.dossierSummary(subreddit.name, username))
  if (cached) {
    try {
      console.log(`[Dossier] summary cache hit for ${username}`)
      return JSON.parse(cached) as DossierSummary
    } catch {}
  }

  const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
  if (!apiKey) {
    console.log('[Dossier] no Gemini key — skipping summary')
    return null
  }

  const removedCount = data.recentItems.filter((i) => i.removedBy === 'mod').length

  try {
    const result = await aiDossierSummary(
      {
        username,
        accountAgeDays: data.accountAgeDays,
        karma: data.karma,
        recentItemCount: data.recentItems.length,
        removedCount,
        evasionCount: data.evasionCount,
        appealStatus: data.appealStatus,
        recentTitles: data.recentItems.slice(0, 5).map((i) => i.title),
      },
      context.redis,
      apiKey
    )
    const summary: DossierSummary = {
      summary: result.summary,
      riskTag: result.riskTag,
      generatedAt: Date.now(),
    }
    // Cache server-side too so re-opens within 24h are instant
    await context.redis.set(
      Keys.dossierSummary(subreddit.name, username),
      JSON.stringify(summary),
      { expiration: new Date(Date.now() + 86400 * 1000) }
    )
    return summary
  } catch (err) {
    console.error('[Dossier] summary generation failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// Stretch feature: pin/unpin a user → 🔍 badge surfaces wherever they appear
export async function handleDossierPinToggle(
  username: string,
  context: Context
): Promise<{ pinned: boolean }> {
  const subreddit = await context.reddit.getCurrentSubreddit()
  const key = Keys.dossierPinned(subreddit.name)
  const current = await context.redis.hGet(key, username)
  if (current) {
    await context.redis.hDel(key, [username])
    await invalidateDossierCache(subreddit.name, username, context)
    return { pinned: false }
  }
  await context.redis.hSet(key, { [username]: Date.now().toString() })
  await invalidateDossierCache(subreddit.name, username, context)
  return { pinned: true }
}
