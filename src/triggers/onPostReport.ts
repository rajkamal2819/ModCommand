import type { PostReportDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

export const onPostReport: PostReportDefinition = {
  event: 'PostReport',
  async onEvent(event, context) {
    const post = event.post
    if (!post) return

    const redis = context.redis
    // Record first report timestamp for Edit Watch evasion detection
    const existing = await redis.get(Keys.reportedAt(post.id))
    if (!existing) {
      await redis.set(Keys.reportedAt(post.id), Date.now().toString(), {
        expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    }
  },
}
