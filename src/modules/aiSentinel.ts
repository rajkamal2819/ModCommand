import type { Context } from '@devvit/public-api'
import type { SentinelEntry } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'

export async function handleSentinelLoad(context: Context): Promise<{
  entries: SentinelEntry[]
  threshold: number
}> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()
  // Check Redis override first (set by SENTINEL_THRESHOLD_UPDATE), fall back to app settings
  const savedSettings = await redis.get(Keys.settings(subreddit.id))
  let threshold = 70
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings) as { aigcThreshold?: number }
      threshold = parsed.aigcThreshold ?? threshold
    } catch {}
  } else {
    threshold = ((await context.settings.get('aigcThreshold')) as number | undefined) ?? 70
  }

  // zRange returns entries ordered by score (timestamp); reverse to show newest first
  const rawEntries = await redis.zRange(Keys.sentinelFeed(subreddit.name), '+inf', '-inf', { by: 'score', reverse: true })

  const entries: SentinelEntry[] = rawEntries
    .map((item) => {
      try {
        return JSON.parse(item.member) as SentinelEntry
      } catch {
        return null
      }
    })
    .filter((e): e is SentinelEntry => e !== null)
    .sort((a, b) => b.score - a.score)

  return { entries, threshold }
}

export async function handleSentinelThresholdUpdate(
  threshold: number,
  context: Context
): Promise<void> {
  if (threshold < 0 || threshold > 100) return
  const subreddit = await context.reddit.getCurrentSubreddit()
  const redis = context.redis
  await redis.set(
    Keys.settings(subreddit.id),
    JSON.stringify({ aigcThreshold: threshold }),
    { expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  )
}
