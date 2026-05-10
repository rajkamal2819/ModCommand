import type { CommentDeleteDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

export const onCommentDelete: CommentDeleteDefinition = {
  event: 'CommentDelete',
  async onEvent(event, context) {
    const commentId = event.commentId
    const subName = event.subreddit?.name
    if (!commentId || !subName) return

    const redis = context.redis
    const existing = await redis.hGet(Keys.sentinelRemoved(subName), commentId)
    if (existing === 'mod') return
    await redis.hSet(Keys.sentinelRemoved(subName), { [commentId]: 'user' })
  },
}
