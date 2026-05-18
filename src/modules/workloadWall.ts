import type { Context } from '@devvit/public-api'
import type { ModStats, WorkloadQueueContext, WorkloadModAction } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'
import { handleTriageInit } from './triageBoard.js'

export async function handleWorkloadLoad(
  period: '7d' | '30d',
  context: Context
): Promise<{ mods: ModStats[]; queueContext: WorkloadQueueContext }> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()

  let modUsernames: string[] = []
  try {
    const mods = await context.reddit.getModerators({ subredditName: subreddit.name }).all()
    modUsernames = mods.map((m) => m.username)
  } catch {
    return { mods: [], queueContext: { unclaimed: 0, inReview: 0, pendingApproval: 0, doneRecent: 0 } }
  }

  const now = Date.now()
  const sevenDayCutoff = now - 7 * 24 * 60 * 60 * 1000
  const thirtyDayCutoff = now - 30 * 24 * 60 * 60 * 1000

  // Per-mod stats + live queue snapshot in parallel.
  const [stats, queueContext] = await Promise.all([
    Promise.all(
      modUsernames.map(async (username) => {
        const counts = await redis.hGetAll(Keys.modCounts(username))
        const [sevenDayItems, thirtyDayItems, recentItems] = await Promise.all([
          redis.zRange(Keys.modActions(username), sevenDayCutoff, now, { by: 'score' }),
          redis.zRange(Keys.modActions(username), thirtyDayCutoff, now, { by: 'score' }),
          redis.zRange(Keys.modActions(username), -1, -1),
        ])
        const lastActive = recentItems.length > 0 ? (recentItems[0]?.score ?? 0) : 0
        return {
          username,
          lastActive,
          counts: {
            removal: parseInt(counts?.['removal'] ?? '0', 10),
            approval: parseInt(counts?.['approval'] ?? '0', 10),
            ban: parseInt(counts?.['ban'] ?? '0', 10),
            modmail_reply: parseInt(counts?.['modmail_reply'] ?? '0', 10),
            mod_note: parseInt(counts?.['mod_note'] ?? '0', 10),
          },
          last7Days: sevenDayItems.length,
          last30Days: thirtyDayItems.length,
        } satisfies ModStats
      })
    ),
    computeQueueContext(context),
  ])

  const sorted = stats.sort(
    (a, b) => (period === '7d' ? b.last7Days - a.last7Days : b.last30Days - a.last30Days)
  )

  return { mods: sorted, queueContext }
}

async function computeQueueContext(context: Context): Promise<WorkloadQueueContext> {
  try {
    const { items } = await handleTriageInit(context)
    let unclaimed = 0
    let inReview = 0
    let pendingApproval = 0
    let doneRecent = 0
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const it of items) {
      if (it.status === 'unclaimed') unclaimed++
      else if (it.status === 'in_review') inReview++
      else if (it.status === 'action_pending') pendingApproval++
      else if (it.status === 'done' && (it.doneAt ?? 0) >= oneHourAgo) doneRecent++
    }
    return { unclaimed, inReview, pendingApproval, doneRecent }
  } catch (err) {
    console.error('[Workload] queue context failed:', err instanceof Error ? err.message : err)
    return { unclaimed: 0, inReview: 0, pendingApproval: 0, doneRecent: 0 }
  }
}

// Drill-down: read audit log filtered by mod, within the period. Last 50 entries.
export async function handleWorkloadModActions(
  mod: string,
  period: '7d' | '30d',
  context: Context
): Promise<WorkloadModAction[]> {
  try {
    const subreddit = await context.reddit.getCurrentSubreddit()
    const windowMs = (period === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000
    const since = Date.now() - windowMs
    const entries = await context.redis.zRange(Keys.audit(subreddit.name), since, Date.now(), {
      by: 'score',
    } as unknown as { by: 'score' })
    const out: WorkloadModAction[] = []
    for (const e of entries ?? []) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = JSON.parse((e as { member: string }).member) as any
        if (data.mod === mod) {
          out.push({
            ts: data.ts,
            action: data.action,
            itemId: data.itemId,
            targetUser: data.targetUser,
            reason: data.reason,
          })
        }
      } catch { /* ignore */ }
    }
    out.sort((a, b) => b.ts - a.ts) // newest first
    return out.slice(0, 50)
  } catch (err) {
    console.error('[Workload] mod actions read failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export async function runWeeklyDigest(context: Context): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubreddit()
  const { mods: stats } = await handleWorkloadLoad('7d', context)

  if (stats.length === 0) return

  const totalActions = stats.reduce((sum, s) => sum + s.last7Days, 0)

  const lines = [
    `# ModCommand Weekly Digest — r/${subreddit.name}`,
    ``,
    `**Week ending ${new Date().toLocaleDateString()}**`,
    `Total mod actions this week: **${totalActions}**`,
    ``,
    `## Per-Moderator Breakdown`,
    ...stats.map((s) => {
      const pct = totalActions > 0 ? Math.round((s.last7Days / totalActions) * 100) : 0
      return `- u/${s.username}: ${s.last7Days} actions (${pct}% of team workload)`
    }),
    ``,
    `*Powered by ModCommand*`,
  ]

  try {
    const headMod = (await context.reddit.getModerators({ subredditName: subreddit.name }).all())[0]
    if (headMod) {
      await context.reddit.sendPrivateMessage({
        to: headMod.username,
        subject: `ModCommand Weekly Digest — ${new Date().toLocaleDateString()}`,
        text: lines.join('\n'),
      })
    }
  } catch {}
}
