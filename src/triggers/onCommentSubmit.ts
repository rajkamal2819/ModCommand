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

    // Reverse index per user for Copilot signal aggregation
    const subName = event.subreddit?.name ?? (await context.reddit.getCurrentSubreddit().catch(() => null))?.name
    if (subName && comment.author) {
      try {
        const userKey = Keys.userItems(subName, comment.author)
        await redis.zAdd(userKey, { score: Date.now(), member: comment.id })
        const cnt = await redis.zCard(userKey)
        if (cnt > 50) await redis.zRemRangeByRank(userKey, 0, cnt - 51)
      } catch {}
    }

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
        let subredditName = event.subreddit?.name
        if (!subredditName) {
          try {
            const sub = await context.reddit.getCurrentSubreddit()
            subredditName = sub.name
          } catch {}
        }
        if (!subredditName) return
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
        const feedKey = Keys.sentinelFeed(subredditName)
        await redis.zAdd(feedKey, { score: Date.now(), member: entry })
        const count = await redis.zCard(feedKey)
        if (count > 100) {
          await redis.zRemRangeByRank(feedKey, 0, count - 101)
        }

        try {
          const fullId = comment.id.startsWith('t1_') ? comment.id : `t1_${comment.id}`
          const fullComment = await context.reddit.getCommentById(fullId)
          const fullReason = `AI Sentinel: ${result.score}% — ${result.heuristics[0]}`
          await context.reddit.report(fullComment, {
            reason: fullReason.slice(0, 99),
          })
        } catch {}
      }
    } catch {
      // AI scoring is non-critical
    }
  },
}
