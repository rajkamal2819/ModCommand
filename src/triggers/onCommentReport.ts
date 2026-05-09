import type { CommentReportDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

export const onCommentReport: CommentReportDefinition = {
  event: 'CommentReport',
  async onEvent(event, context) {
    const comment = event.comment
    if (!comment) return

    const redis = context.redis
    const existing = await redis.get(Keys.reportedAt(comment.id))
    if (!existing) {
      await redis.set(Keys.reportedAt(comment.id), Date.now().toString(), {
        expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    }
  },
}
