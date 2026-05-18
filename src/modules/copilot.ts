import type { Context } from '@devvit/public-api'
import type { CopilotSignals } from '../ai/gemini.js'
import { copilotRecommend, copilotChat, rewriteSlashCommand } from '../ai/gemini.js'
import { Keys } from '../redis/keys.js'
import type { CopilotRecommendation, CopilotChatMessage, CopilotItemContext } from '../shared/messages.js'
import { getModeratorSet } from '../auth/isModerator.js'
import { withTimeout as withTimeoutShared } from './_util.js'

const APPLIED_FLAG = '__APPLIED__'

// Thin wrapper to preserve the [Copilot] log prefix in this module
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return withTimeoutShared(p, ms, fallback, label, 'Copilot')
}

export async function handleCopilotRecommend(
  itemId: string,
  context: Context,
  opts: { force?: boolean } = {}
): Promise<CopilotRecommendation> {
  console.log(`[Copilot] start itemId=${itemId} force=${!!opts.force}`)
  const redis = context.redis
  const t0 = Date.now()

  // Honor sticky "applied" state unless caller forces a fresh recommendation.
  if (!opts.force) {
    const applied = await redis.get(Keys.copilotApplied(itemId))
    if (applied) {
      const cached = await redis.get(Keys.copilot(itemId))
      if (cached) {
        console.log('[Copilot] returning applied cached')
        const rec = JSON.parse(cached) as CopilotRecommendation
        return { ...rec, applied: true }
      }
    }
  } else {
    // Forced fresh — clear stale applied flag so we compute again
    await redis.del(Keys.copilotApplied(itemId))
  }

  const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
  if (!apiKey) {
    console.log('[Copilot] no api key')
    return safeFallback('AI key not configured — review manually.')
  }

  // ─── Phase 1: fetch item + subreddit + edit record in parallel ───────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let item: any = null
  let isComment = false
  let editRecord: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subreddit: any = null
  try {
    const fullId = itemId.startsWith('t1_') || itemId.startsWith('t3_') ? itemId : `t3_${itemId}`
    isComment = itemId.startsWith('t1_')
    const [itemRes, subRes, editRes] = await Promise.all([
      withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (isComment ? context.reddit.getCommentById(fullId) : context.reddit.getPostById(fullId)) as Promise<any>,
        8000,
        null,
        'getItem'
      ),
      withTimeout(context.reddit.getCurrentSubreddit(), 5000, null, 'getCurrentSubreddit'),
      withTimeout(redis.hGetAll(Keys.editRecord(itemId)), 3000, {} as Record<string, string>, 'editRecord'),
    ])
    item = itemRes
    subreddit = subRes
    editRecord = editRes ?? {}
    console.log(`[Copilot] phase1 done in ${Date.now() - t0}ms (comment=${isComment}, item=${!!item}, sub=${!!subreddit})`)
  } catch (err) {
    console.error('[Copilot] phase1 failed:', err instanceof Error ? err.message : err)
    return safeFallback('Could not load item from Reddit.')
  }

  if (!item) {
    return safeFallback('Could not load item from Reddit (timed out).')
  }
  if (!subreddit) {
    return safeFallback('Could not load subreddit context.')
  }

  const title: string = isComment ? '(comment)' : (item?.title ?? '')
  const body: string = isComment ? (item?.body ?? '') : (item?.selftext ?? '')
  const authorName: string = item?.authorName ?? editRecord['author'] ?? 'unknown'
  const subName: string = subreddit?.name ?? ''
  // Item context surfaced in the Copilot panel header so the mod always
  // knows which post/comment they're discussing.
  const itemContext: CopilotItemContext = {
    title: isComment ? (body.slice(0, 80) || '(comment)') : (title || '(no title)'),
    author: authorName,
    type: isComment ? 'comment' : 'post',
    subName,
    url: item?.permalink ? `https://www.reddit.com${item.permalink}` : undefined,
  }

  // ─── Phase 2: fan out all remaining lookups in parallel with timeouts ────
  // Each call has its own deadline; phase 2 will never block longer than the longest
  // individual timeout (8s). Slow APIs degrade gracefully to fallback values.
  const t1 = Date.now()
  const [
    user,
    modSet,
    userItemsRaw,
    sentinelRemovedMap,
    editFeedRaw,
    appealRecord,
  ] = await Promise.all([
    authorName !== 'unknown'
      ? withTimeout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.reddit.getUserByUsername(authorName) as Promise<any>,
          5000,
          null,
          'getUserByUsername'
        )
      : Promise.resolve(null),
    subName
      ? withTimeout(getModeratorSet(subName, context), 8000, new Set<string>(), 'getModeratorSet')
      : Promise.resolve(new Set<string>()),
    subName && authorName !== 'unknown'
      ? withTimeout(
          redis.zRange(Keys.userItems(subName, authorName), 0, -1),
          3000,
          [] as Array<{ score: number; member: string }>,
          'userItems'
        )
      : Promise.resolve([] as Array<{ score: number; member: string }>),
    subName
      ? withTimeout(
          redis.hGetAll(Keys.sentinelRemoved(subName)),
          3000,
          {} as Record<string, string>,
          'sentinelRemoved'
        )
      : Promise.resolve({} as Record<string, string>),
    subName
      ? withTimeout(
          redis.zRange(Keys.editFeed(subName), 0, -1),
          3000,
          [] as Array<{ score: number; member: string }>,
          'editFeed'
        )
      : Promise.resolve([] as Array<{ score: number; member: string }>),
    authorName !== 'unknown'
      ? withTimeout(
          redis.hGetAll(Keys.appeal(authorName)),
          2000,
          {} as Record<string, string>,
          'appeal'
        )
      : Promise.resolve({} as Record<string, string>),
  ])
  console.log(`[Copilot] phase2 done in ${Date.now() - t1}ms (user=${!!user}, modSetSize=${modSet.size})`)

  // ─── Hard guard: author is a mod ─────────────────────────────────────────
  if (authorName !== 'unknown' && modSet.has(authorName)) {
    const rec: CopilotRecommendation = {
      action: 'approve',
      confidence: 'high',
      reason: 'Author is a moderator of this subreddit — approve by policy.',
      draftMessage: '',
      signalsUsed: ['author=moderator'],
      generatedAt: Date.now(),
      itemContext,
    }
    await redis.set(Keys.copilot(itemId), JSON.stringify(rec), {
      expiration: new Date(Date.now() + 86400 * 1000),
    })
    console.log(`[Copilot] mod-guard short-circuit in ${Date.now() - t0}ms`)
    return rec
  }

  // Author metadata from user fetch
  let accountAgeDays = 0
  let authorKarma: number | null = null
  if (user) {
    accountAgeDays = Math.floor((Date.now() - (user.createdAt?.getTime?.() ?? Date.now())) / 86400000)
    authorKarma = (user.linkKarma ?? 0) + (user.commentKarma ?? 0)
  }

  // AIGC from cached editRecord
  const aigcScoreStr = editRecord['aigcScore']
  const aigcScore = aigcScoreStr ? parseInt(aigcScoreStr, 10) : null
  const aigcHeuristics = (() => {
    try { return JSON.parse(editRecord['aigcHeuristics'] ?? '[]') as string[] }
    catch { return [] }
  })()

  // Reports from live item
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userReports: Array<[string, number]> = (item?.userReports as any) ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modReports: Array<[string, string]> = (item?.modReports as any) ?? []
  const reportCount = userReports.length + modReports.length
  const reportReasons = [
    ...userReports.map((r) => r[0]).filter(Boolean),
    ...modReports.map((r) => r[0]).filter(Boolean),
  ].slice(0, 3)

  // Removal rate (30d) — intersect userItems with sentinelRemoved
  const cutoff = Date.now() - 30 * 86400 * 1000
  const recentIds = userItemsRaw.filter((r) => r.score >= cutoff).map((r) => r.member)
  const totalItems30d = recentIds.length
  const removalCount30d = recentIds.filter((id) => sentinelRemovedMap?.[id] === 'mod').length

  // Edit Watch evasion count
  let evasionCount = 0
  for (const e of editFeedRaw) {
    try {
      const data = JSON.parse(e.member) as Record<string, string>
      if (data['author'] === authorName && data['status'] === 'flagged') evasionCount++
    } catch {}
  }

  // Prior appeal
  const prevAppealStatus: string | null = appealRecord?.['status'] ?? null

  // Item age
  const createdAtMs = item?.createdAt?.getTime?.() ?? Date.now()
  const itemAgeHours = Math.floor((Date.now() - createdAtMs) / 3600000)

  const signals: CopilotSignals = {
    subName,
    title,
    body,
    author: authorName,
    accountAgeDays,
    authorKarma,
    aigcScore,
    aigcHeuristics,
    reportCount,
    reportReasons,
    removalCount30d,
    totalItems30d,
    evasionCount,
    prevAppealStatus,
    itemAgeHours,
  }

  // Cheap path: nothing flagged → skip Gemini
  if (
    (aigcScore == null || aigcScore < 30) &&
    reportCount === 0 &&
    removalCount30d === 0 &&
    evasionCount === 0
  ) {
    const rec: CopilotRecommendation = {
      action: 'approve',
      confidence: 'high',
      reason: 'No risk signals — author has clean recent history and content is not flagged.',
      draftMessage: '',
      signalsUsed: ['no-aigc', 'no-reports', 'clean-author'],
      generatedAt: Date.now(),
      itemContext,
    }
    await redis.set(Keys.copilot(itemId), JSON.stringify(rec), {
      expiration: new Date(Date.now() + 86400 * 1000),
    })
    console.log(`[Copilot] clean-signals short-circuit in ${Date.now() - t0}ms`)
    return rec
  }

  console.log('[Copilot] calling Gemini with signals', JSON.stringify({
    aigcScore, reportCount, removalCount30d, totalItems30d, evasionCount,
  }))
  try {
    const result = await copilotRecommend(signals, redis, apiKey)
    console.log(`[Copilot] Gemini returned in ${Date.now() - t0}ms: action=${result.action}, confidence=${result.confidence}`)
    const rec: CopilotRecommendation = {
      ...result,
      signalsUsed: buildSignalsUsed(signals),
      generatedAt: Date.now(),
      itemContext,
    }
    await redis.set(Keys.copilot(itemId), JSON.stringify(rec), {
      expiration: new Date(Date.now() + 86400 * 1000),
    })
    return rec
  } catch (err) {
    console.error('[Copilot] Gemini failed:', err instanceof Error ? err.message : err)
    return safeFallback('AI temporarily unavailable — review manually.')
  }
}

export async function markCopilotApplied(itemId: string, context: Context): Promise<void> {
  await context.redis.set(Keys.copilotApplied(itemId), APPLIED_FLAG, {
    expiration: new Date(Date.now() + 86400 * 1000),
  })
}

// ─── Multi-turn chat ───────────────────────────────────────────────────────

const CHAT_TTL_MS = 24 * 60 * 60 * 1000
const MAX_CHAT_TURNS = 40 // hard cap to keep prompts bounded

async function readChat(itemId: string, context: Context): Promise<CopilotChatMessage[]> {
  const raw = await context.redis.get(Keys.copilotChat(itemId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as CopilotChatMessage[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeChat(itemId: string, messages: CopilotChatMessage[], context: Context): Promise<void> {
  const trimmed = messages.slice(-MAX_CHAT_TURNS)
  await context.redis.set(Keys.copilotChat(itemId), JSON.stringify(trimmed), {
    expiration: new Date(Date.now() + CHAT_TTL_MS),
  })
}

// Build the human-friendly verdict turn from a recommendation. Used to seed
// the chat history after the initial recommendation is computed.
function verdictToChatTurn(rec: CopilotRecommendation): CopilotChatMessage {
  const labels: Record<string, string> = {
    approve: 'Approve',
    remove: 'Remove',
    ban: 'Remove + Ban',
    escalate: 'Escalate',
  }
  const lines: string[] = []
  lines.push(`**Verdict: ${labels[rec.action] ?? rec.action}** · ${rec.confidence} confidence`)
  lines.push('')
  lines.push(rec.reason)
  if (rec.action === 'ban' && rec.banReason) {
    lines.push('')
    lines.push(`Ban reason: ${rec.banReason}${rec.banDuration ? ` (${rec.banDuration} days)` : ' (permanent)'}`)
  }
  if (rec.draftMessage) {
    lines.push('')
    lines.push('**Draft message:**')
    lines.push(rec.draftMessage)
  }
  return {
    role: 'assistant',
    content: lines.join('\n'),
    ts: rec.generatedAt,
    kind: 'verdict',
    suggestions: defaultSuggestions(rec),
  }
}

function defaultSuggestions(rec: CopilotRecommendation): string[] {
  const s: string[] = []
  if (rec.action === 'remove' || rec.action === 'ban') {
    s.push('/removal-reason')
    s.push('Show me the user\'s recent pattern')
    s.push('Why not escalate instead?')
  } else if (rec.action === 'approve') {
    s.push('What would change your mind?')
    s.push('Draft a reply to the reporter')
    s.push('Any signals that point the other way?')
  } else {
    s.push('What would tip this to remove?')
    s.push('What would tip this to approve?')
    s.push('/modmail')
  }
  return s.slice(0, 3)
}

// Seed the chat with the verdict if it isn't already there. Idempotent — won't
// overwrite an in-progress conversation if one exists.
export async function seedChatWithVerdict(
  itemId: string,
  rec: CopilotRecommendation,
  context: Context
): Promise<void> {
  const existing = await readChat(itemId, context)
  if (existing.length > 0) return
  await writeChat(itemId, [verdictToChatTurn(rec)], context)
}

export async function handleCopilotChatLoad(
  itemId: string,
  context: Context
): Promise<CopilotChatMessage[]> {
  return await readChat(itemId, context)
}

// Fetch the same signals used by the initial recommendation. Reused across
// every chat turn so the model always answers from current item state.
async function gatherSignals(itemId: string, context: Context): Promise<CopilotSignals | null> {
  const redis = context.redis
  const fullId = itemId.startsWith('t1_') || itemId.startsWith('t3_') ? itemId : `t3_${itemId}`
  const isComment = itemId.startsWith('t1_')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let item: any = null
  let editRecord: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subreddit: any = null
  try {
    const [itemRes, subRes, editRes] = await Promise.all([
      withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (isComment ? context.reddit.getCommentById(fullId) : context.reddit.getPostById(fullId)) as Promise<any>,
        8000, null, 'chat.getItem'
      ),
      withTimeout(context.reddit.getCurrentSubreddit(), 5000, null, 'chat.getSub'),
      withTimeout(redis.hGetAll(Keys.editRecord(itemId)), 3000, {} as Record<string, string>, 'chat.editRecord'),
    ])
    item = itemRes
    subreddit = subRes
    editRecord = editRes ?? {}
  } catch {
    return null
  }
  if (!item || !subreddit) return null

  const title: string = isComment ? '(comment)' : (item?.title ?? '')
  const body: string = isComment ? (item?.body ?? '') : (item?.selftext ?? '')
  const authorName: string = item?.authorName ?? editRecord['author'] ?? 'unknown'
  const subName: string = subreddit?.name ?? ''

  const [user, userItemsRaw, sentinelRemovedMap, editFeedRaw, appealRecord] = await Promise.all([
    authorName !== 'unknown'
      ? withTimeout(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          context.reddit.getUserByUsername(authorName) as Promise<any>,
          5000, null, 'chat.getUser'
        )
      : Promise.resolve(null),
    subName && authorName !== 'unknown'
      ? withTimeout(redis.zRange(Keys.userItems(subName, authorName), 0, -1), 3000, [] as Array<{ score: number; member: string }>, 'chat.userItems')
      : Promise.resolve([] as Array<{ score: number; member: string }>),
    subName
      ? withTimeout(redis.hGetAll(Keys.sentinelRemoved(subName)), 3000, {} as Record<string, string>, 'chat.sentinelRemoved')
      : Promise.resolve({} as Record<string, string>),
    subName
      ? withTimeout(redis.zRange(Keys.editFeed(subName), 0, -1), 3000, [] as Array<{ score: number; member: string }>, 'chat.editFeed')
      : Promise.resolve([] as Array<{ score: number; member: string }>),
    authorName !== 'unknown'
      ? withTimeout(redis.hGetAll(Keys.appeal(authorName)), 2000, {} as Record<string, string>, 'chat.appeal')
      : Promise.resolve({} as Record<string, string>),
  ])

  let accountAgeDays = 0
  let authorKarma: number | null = null
  if (user) {
    accountAgeDays = Math.floor((Date.now() - (user.createdAt?.getTime?.() ?? Date.now())) / 86400000)
    authorKarma = (user.linkKarma ?? 0) + (user.commentKarma ?? 0)
  }
  const aigcScoreStr = editRecord['aigcScore']
  const aigcScore = aigcScoreStr ? parseInt(aigcScoreStr, 10) : null
  const aigcHeuristics = (() => {
    try { return JSON.parse(editRecord['aigcHeuristics'] ?? '[]') as string[] }
    catch { return [] }
  })()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userReports: Array<[string, number]> = (item?.userReports as any) ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modReports: Array<[string, string]> = (item?.modReports as any) ?? []
  const reportCount = userReports.length + modReports.length
  const reportReasons = [
    ...userReports.map((r) => r[0]).filter(Boolean),
    ...modReports.map((r) => r[0]).filter(Boolean),
  ].slice(0, 3)
  const cutoff = Date.now() - 30 * 86400 * 1000
  const recentIds = userItemsRaw.filter((r) => r.score >= cutoff).map((r) => r.member)
  const totalItems30d = recentIds.length
  const removalCount30d = recentIds.filter((id) => sentinelRemovedMap?.[id] === 'mod').length
  let evasionCount = 0
  for (const e of editFeedRaw) {
    try {
      const data = JSON.parse(e.member) as Record<string, string>
      if (data['author'] === authorName && data['status'] === 'flagged') evasionCount++
    } catch { /* ignore */ }
  }
  const prevAppealStatus: string | null = appealRecord?.['status'] ?? null
  const createdAtMs = item?.createdAt?.getTime?.() ?? Date.now()
  const itemAgeHours = Math.floor((Date.now() - createdAtMs) / 3600000)

  return {
    subName, title, body, author: authorName,
    accountAgeDays, authorKarma,
    aigcScore, aigcHeuristics,
    reportCount, reportReasons,
    removalCount30d, totalItems30d,
    evasionCount, prevAppealStatus, itemAgeHours,
  }
}

export async function handleCopilotChatSend(
  itemId: string,
  rawContent: string,
  context: Context
): Promise<CopilotChatMessage[]> {
  const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
  const history = await readChat(itemId, context)

  // Detect slash commands and rewrite to a directive instruction so the model
  // returns a clean draft instead of a meta-explanation.
  const { rewritten, isDraft } = rewriteSlashCommand(rawContent)
  const userTurn: CopilotChatMessage = {
    role: 'user',
    content: rawContent,
    ts: Date.now(),
  }
  const newHistory = [...history, userTurn]

  if (!apiKey) {
    const errTurn: CopilotChatMessage = {
      role: 'assistant',
      content: 'AI key not configured — ask the admin to set the Gemini key in app settings.',
      ts: Date.now(),
      kind: 'answer',
      suggestions: [],
    }
    const final = [...newHistory, errTurn]
    await writeChat(itemId, final, context)
    return final
  }

  const signals = await gatherSignals(itemId, context)
  if (!signals) {
    const errTurn: CopilotChatMessage = {
      role: 'assistant',
      content: 'Could not load the item from Reddit. It may have been deleted.',
      ts: Date.now(),
      kind: 'answer',
      suggestions: [],
    }
    const final = [...newHistory, errTurn]
    await writeChat(itemId, final, context)
    return final
  }

  try {
    // Pass the prior history (without the new user turn) plus the rewritten
    // prompt as the latest user message.
    const reply = await copilotChat(
      signals,
      history.map((m) => ({ role: m.role, content: m.content })),
      rewritten,
      apiKey
    )
    const assistantTurn: CopilotChatMessage = {
      role: 'assistant',
      content: reply.content,
      ts: Date.now(),
      kind: isDraft ? 'draft' : 'answer',
      suggestions: reply.suggestions,
    }
    const final = [...newHistory, assistantTurn]
    await writeChat(itemId, final, context)
    return final
  } catch (err) {
    console.error('[Copilot] chat failed:', err instanceof Error ? err.message : err)
    const errTurn: CopilotChatMessage = {
      role: 'assistant',
      content: 'AI temporarily unavailable — try again in a moment.',
      ts: Date.now(),
      kind: 'answer',
      suggestions: [],
    }
    const final = [...newHistory, errTurn]
    await writeChat(itemId, final, context)
    return final
  }
}

function safeFallback(reason: string): CopilotRecommendation {
  return {
    action: 'escalate',
    confidence: 'low',
    reason,
    draftMessage: '',
    signalsUsed: [],
    generatedAt: Date.now(),
  }
}

function buildSignalsUsed(s: CopilotSignals): string[] {
  const used: string[] = []
  if (s.aigcScore != null) used.push(`AIGC ${s.aigcScore}%`)
  if (s.reportCount > 0) used.push(`${s.reportCount} report${s.reportCount > 1 ? 's' : ''}`)
  if (s.totalItems30d > 0) {
    const pct = Math.round((s.removalCount30d / s.totalItems30d) * 100)
    used.push(`${pct}% removal rate (30d)`)
  }
  if (s.evasionCount > 0) used.push(`${s.evasionCount} prior evasion edits`)
  if (s.accountAgeDays < 30 && s.accountAgeDays > 0) used.push(`account ${s.accountAgeDays}d old`)
  if (s.prevAppealStatus) used.push(`prior appeal: ${s.prevAppealStatus}`)
  return used
}
