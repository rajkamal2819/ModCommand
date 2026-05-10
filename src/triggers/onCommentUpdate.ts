import type { CommentUpdateDefinition } from '@devvit/public-api'
import { diffLines } from 'diff'
import { Keys } from '../redis/keys.js'
import { classifyEdit } from '../ai/gemini.js'

export const onCommentUpdate: CommentUpdateDefinition = {
  event: 'CommentUpdate',
  async onEvent(event, context) {
    const comment = event.comment
    if (!comment) return

    const redis = context.redis
    const record = await redis.hGetAll(Keys.editRecord(comment.id))
    if (!record || !record['original']) return

    const original = record['original']
    const edited = comment.body ?? ''

    if (original === edited) return
    if (record['edited'] === edited) return  // dedupe Devvit replays

    const now = Date.now()
    const reportedAtStr = await redis.get(Keys.reportedAt(comment.id))
    const reportedAt = reportedAtStr ? parseInt(reportedAtStr, 10) : null

    if (!reportedAt || reportedAt > now) return

    const deltaMinutes = Math.round((now - reportedAt) / 60000)
    const score = deltaMinutes <= 10 ? 'HIGH' : deltaMinutes <= 60 ? 'MEDIUM' : 'LOW'

    const chunks = diffLines(original, edited)

    const update: Record<string, string> = {
      edited,
      editedAt: now.toString(),
      reportedAt: reportedAt.toString(),
      deltaMinutes: deltaMinutes.toString(),
      diff: JSON.stringify(chunks),
      score,
      status: 'flagged',
    }

    await redis.hSet(Keys.editRecord(comment.id), update)

    const subredditName = event.subreddit?.name ?? ''
    const feedEntry = JSON.stringify({
      itemId: comment.id,
      postId: comment.postId,
      ...update,
      original,
      author: record['author'],
      title: record['title'],
      url: record['url'],
      type: 'comment',
    })
    await redis.zAdd(Keys.editFeed(subredditName), { score: now, member: feedEntry })
    await redis.zRemRangeByRank(Keys.editFeed(subredditName), 0, -101)

    try {
      if (record['author']) {
        await context.reddit.addModNote({
          subreddit: subredditName,
          user: record['author'],
          note: `Comment edited ${deltaMinutes}m after report — evasion score: ${score}. Diff stored in ModCommand.`,
          label: 'ABUSE_WARNING',
          redditId: `t1_${comment.id}`,
        })
      }
    } catch {
      // Mod notes are non-critical
    }

    try {
      const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
      if (apiKey && score !== 'LOW') {
        const aiResult = await classifyEdit(original, edited, deltaMinutes, redis, apiKey)
        await redis.hSet(Keys.editRecord(comment.id), {
          aiIntent: aiResult.intent,
          aiIntentConfidence: aiResult.confidence.toString(),
          aiIntentReason: aiResult.reason,
        })
      }
    } catch {
      // AI classification is non-critical
    }
  },
}
