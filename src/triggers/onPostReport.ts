import type { PostReportDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

export const onPostReport: PostReportDefinition = {
  event: 'PostReport',
  async onEvent(event, context) {
    const post = event.post
    if (!post) return

    const redis = context.redis

    // Skip if this report was filed by AI Sentinel — setting reportedAt here would
    // arm Edit Watch evasion detection for a post that was never human-reported.
    // Don't delete the flag: Devvit replays triggers, and a deleted flag on replay
    // would let reportedAt get set on the second invocation. Let TTL expire it.
    const isAiReport = await redis.get(Keys.aiAutoReport(post.id))
    if (isAiReport) return

    // Record first human report timestamp for Edit Watch evasion detection
    const existing = await redis.get(Keys.reportedAt(post.id))
    if (!existing) {
      await redis.set(Keys.reportedAt(post.id), Date.now().toString(), {
        expiration: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
    }
  },
}
