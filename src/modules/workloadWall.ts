import type { Context } from '@devvit/public-api'
import type { ModStats } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'

export async function handleWorkloadLoad(
  period: '7d' | '30d',
  context: Context
): Promise<ModStats[]> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()

  let modUsernames: string[] = []
  try {
    const mods = await context.reddit.getModerators({ subredditName: subreddit.name }).all()
    modUsernames = mods.map((m) => m.username)
  } catch {
    return []
  }

  const now = Date.now()
  const sevenDayCutoff = now - 7 * 24 * 60 * 60 * 1000
  const thirtyDayCutoff = now - 30 * 24 * 60 * 60 * 1000

  const stats: ModStats[] = await Promise.all(
    modUsernames.map(async (username) => {
      const counts = await redis.hGetAll(Keys.modCounts(username))

      // Count actions in time windows using zRange with score filter
      const [sevenDayItems, thirtyDayItems, recentItems] = await Promise.all([
        redis.zRange(Keys.modActions(username), sevenDayCutoff, now, { by: 'score' }),
        redis.zRange(Keys.modActions(username), thirtyDayCutoff, now, { by: 'score' }),
        redis.zRange(Keys.modActions(username), -1, -1),
      ])

      const lastActive =
        recentItems.length > 0 ? (recentItems[0]?.score ?? 0) : 0

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
  )

  return stats.sort(
    (a, b) => (period === '7d' ? b.last7Days - a.last7Days : b.last30Days - a.last30Days)
  )
}

export async function runWeeklyDigest(context: Context): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubreddit()
  const stats = await handleWorkloadLoad('7d', context)

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
