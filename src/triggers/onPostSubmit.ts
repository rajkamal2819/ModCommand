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

    console.log(`[Sentinel] PostSubmit fired: ${post.id} by ${authorName}`)
    try {
      const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
      const threshold = ((await context.settings.get('aigcThreshold')) as number | undefined) ?? 70
      console.log(`[Sentinel] apiKey present: ${!!apiKey}, threshold: ${threshold}`)
      if (!apiKey) {
        console.log('[Sentinel] No API key set; skipping')
        return
      }

      console.log(`[Sentinel] Calling Gemini for ${post.id}, content length: ${content.length}`)
      const result = await scoreContent(content, redis, apiKey)
      console.log(`[Sentinel] Score: ${result.score}, heuristics:`, result.heuristics)

      await redis.hSet(Keys.editRecord(post.id), {
        aigcScore: result.score.toString(),
        aigcHeuristics: JSON.stringify(result.heuristics),
      })

      if (result.score >= threshold) {
        const subredditName = event.subreddit?.name ?? ''
        console.log(`[Sentinel] Score ${result.score} >= threshold ${threshold}; writing to feed for r/${subredditName}`)
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

        try {
          const fullPost = await context.reddit.getPostById(`t3_${post.id}`)
          await context.reddit.report(fullPost, {
            reason: `AI Sentinel: ${result.score}% likelihood — ${result.heuristics[0]}`,
          })
          console.log('[Sentinel] Auto-reported post to mod queue')
        } catch (reportErr) {
          console.error('[Sentinel] Failed to auto-report:', reportErr)
        }
      } else {
        console.log(`[Sentinel] Score ${result.score} below threshold ${threshold}; not flagging`)
      }
    } catch (err) {
      console.error('[Sentinel] Error in onPostSubmit:', err instanceof Error ? err.message : err)
      console.error('[Sentinel] Stack:', err instanceof Error ? err.stack : 'no stack')
    }
  },
}
