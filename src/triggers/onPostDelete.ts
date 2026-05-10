import type { PostDeleteDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

export const onPostDelete: PostDeleteDefinition = {
  event: 'PostDelete',
  async onEvent(event, context) {
    const postId = event.postId
    const subName = event.subreddit?.name
    if (!postId || !subName) return

    const redis = context.redis
    // Only mark as 'user' if a mod removal hasn't already been recorded
    const existing = await redis.hGet(Keys.sentinelRemoved(subName), postId)
    if (existing === 'mod') return
    await redis.hSet(Keys.sentinelRemoved(subName), { [postId]: 'user' })
  },
}
