import type { PostSubmitDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'
import { scoreContent } from '../ai/gemini.js'

export const onPostSubmit: PostSubmitDefinition = {
  event: 'PostSubmit',
  async onEvent(event, context) {
    const post = event.post
    if (!post) return

    const redis = context.redis
    const content = [post.title, post.selftext ?? ''].filter(Boolean).join('\n')

    const authorName = event.author?.name ?? 'unknown'
    await redis.hSet(Keys.editRecord(post.id), {
      original: content,
      type: 'post',
      author: authorName,
      title: post.title,
      url: `https://reddit.com${post.permalink}`,
      createdAt: Date.now().toString(),
    })

    try {
      const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
      const threshold = ((await context.settings.get('aigcThreshold')) as number | undefined) ?? 70
      if (!apiKey) return

      const result = await scoreContent(content, redis, apiKey)

      await redis.hSet(Keys.editRecord(post.id), {
        aigcScore: result.score.toString(),
        aigcHeuristics: JSON.stringify(result.heuristics),
      })

      if (result.score >= threshold) {
        const subredditName = event.subreddit?.name ?? ''
        const entry = JSON.stringify({
          id: post.id,
          title: post.title,
          author: authorName,
          url: `https://reddit.com${post.permalink}`,
          type: 'post',
          score: result.score,
          heuristics: result.heuristics,
          scoredAt: Date.now(),
        })
        await redis.zAdd(Keys.sentinelFeed(subredditName), { score: Date.now(), member: entry })
        await redis.zRemRangeByRank(Keys.sentinelFeed(subredditName), 0, -101)

        const fullPost = await context.reddit.getPostById(`t3_${post.id}`)
        await context.reddit.report(fullPost, {
          reason: `AI Sentinel: ${result.score}% likelihood — ${result.heuristics[0]}`,
        })
      }
    } catch {
      // AI scoring is non-critical
    }
  },
}
