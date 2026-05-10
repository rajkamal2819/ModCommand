import type { Context } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

const TTL_SECONDS = 60

export async function isCurrentUserModerator(context: Context): Promise<boolean> {
  try {
    const username = await context.reddit.getCurrentUsername()
    if (!username) return false

    const subreddit = await context.reddit.getCurrentSubreddit()
    const cacheKey = Keys.modCheck(subreddit.name, username)

    const cached = await context.redis.get(cacheKey)
    if (cached === '1') return true
    if (cached === '0') return false

    const mods = await context.reddit.getModerators({ subredditName: subreddit.name }).all()
    const isMod = mods.some((m) => m.username === username)

    await context.redis.set(cacheKey, isMod ? '1' : '0', { expiration: new Date(Date.now() + TTL_SECONDS * 1000) })
    return isMod
  } catch {
    return false
  }
}
