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
        let subredditName = event.subreddit?.name
        if (!subredditName) {
          try {
            const sub = await context.reddit.getCurrentSubreddit()
            subredditName = sub.name
          } catch (subErr) {
            console.error('[Sentinel] Failed to fetch subreddit:', subErr)
          }
        }
        if (!subredditName) {
          console.error('[Sentinel] No subreddit name available; aborting feed write')
          return
        }
        console.log(`[Sentinel] Score ${result.score} >= threshold ${threshold}; writing to feed key sentinel:${subredditName}`)
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
        const feedKey = Keys.sentinelFeed(subredditName)
        await redis.zAdd(feedKey, { score: Date.now(), member: entry })
        const countAfterAdd = await redis.zCard(feedKey)
        console.log(`[Sentinel] zCard after add: ${countAfterAdd}`)
        if (countAfterAdd > 100) {
          await redis.zRemRangeByRank(feedKey, 0, countAfterAdd - 101)
        }
        const countAfterTrim = await redis.zCard(feedKey)
        console.log(`[Sentinel] zCard after trim: ${countAfterTrim}`)

        try {
          // post.id may or may not include the t3_ prefix; normalize
          const fullId = post.id.startsWith('t3_') ? post.id : `t3_${post.id}`
          const fullPost = await context.reddit.getPostById(fullId)
          // Reddit caps report reason at 100 chars
          const fullReason = `AI Sentinel: ${result.score}% — ${result.heuristics[0]}`
          await context.reddit.report(fullPost, {
            reason: fullReason.slice(0, 99),
          })
          console.log('[Sentinel] Auto-reported post to mod queue')
        } catch (reportErr) {
          console.error('[Sentinel] Failed to auto-report:', reportErr instanceof Error ? reportErr.message : reportErr)
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
