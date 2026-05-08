import type { CommentSubmitDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'
import { scoreContent } from '../ai/gemini.js'

export const onCommentSubmit: CommentSubmitDefinition = {
  event: 'CommentSubmit',
  async onEvent(event, context) {
    const comment = event.comment
    if (!comment) return

    const redis = context.redis
    const content = comment.body ?? ''

    await redis.hSet(Keys.editRecord(comment.id), {
      original: content,
      type: 'comment',
      author: comment.author ?? 'unknown',
      title: `Comment by u/${comment.author ?? 'unknown'}`,
      url: `https://reddit.com${comment.permalink ?? ''}`,
      postId: comment.postId,
      createdAt: Date.now().toString(),
    })

    try {
      const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
      const threshold = ((await context.settings.get('aigcThreshold')) as number | undefined) ?? 70
      if (!apiKey || content.length < 100) return

      const result = await scoreContent(content, redis, apiKey)

      await redis.hSet(Keys.editRecord(comment.id), {
        aigcScore: result.score.toString(),
        aigcHeuristics: JSON.stringify(result.heuristics),
      })

      if (result.score >= threshold) {
        const subredditName = event.subreddit?.name ?? ''
        const entry = JSON.stringify({
          id: comment.id,
          title: `Comment by u/${comment.author ?? 'unknown'}`,
          author: comment.author ?? 'unknown',
          url: `https://reddit.com${comment.permalink ?? ''}`,
          type: 'comment',
          score: result.score,
          heuristics: result.heuristics,
          scoredAt: Date.now(),
        })
        await redis.zAdd(Keys.sentinelFeed(subredditName), { score: Date.now(), member: entry })
        await redis.zRemRangeByRank(Keys.sentinelFeed(subredditName), 0, -101)

        const fullComment = await context.reddit.getCommentById(`t1_${comment.id}`)
        await context.reddit.report(fullComment, {
          reason: `AI Sentinel: ${result.score}% likelihood — ${result.heuristics[0]}`,
        })
      }
    } catch {
      // AI scoring is non-critical
    }
  },
}
