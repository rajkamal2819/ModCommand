import type { Context } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

const LIST_TTL_SECONDS = 300 // 5 min — full mod list cache (shared)

// Returns the set of moderator usernames for the given sub, cached for 5 min.
// Used by both isCurrentUserModerator and Copilot's author-is-mod guard.
export async function getModeratorSet(subName: string, context: Context): Promise<Set<string>> {
  const cacheKey = Keys.modList(subName)
  const cached = await context.redis.get(cacheKey)
  if (cached) {
    try {
      return new Set(JSON.parse(cached) as string[])
    } catch {
      // fall through and refetch
    }
  }
  const mods = await context.reddit.getModerators({ subredditName: subName }).all()
  const usernames = mods.map((m) => m.username)
  await context.redis.set(cacheKey, JSON.stringify(usernames), {
    expiration: new Date(Date.now() + LIST_TTL_SECONDS * 1000),
  })
  return new Set(usernames)
}

export async function isCurrentUserModerator(context: Context): Promise<boolean> {
  try {
    const [username, subreddit] = await Promise.all([
      context.reddit.getCurrentUsername(),
      context.reddit.getCurrentSubreddit(),
    ])
    if (!username) return false

    const modSet = await getModeratorSet(subreddit.name, context)
    return modSet.has(username)
  } catch {
    return false
  }
}
