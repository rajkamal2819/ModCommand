import type { PostUpdateDefinition } from '@devvit/public-api'
import { diffLines } from 'diff'
import { Keys } from '../redis/keys.js'
import { classifyEdit } from '../ai/gemini.js'

export const onPostUpdate: PostUpdateDefinition = {
  event: 'PostUpdate',
  async onEvent(event, context) {
    const post = event.post
    if (!post) return

    console.log(`[EditWatch] PostUpdate fired: ${post.id}`)
    const redis = context.redis
    const record = await redis.hGetAll(Keys.editRecord(post.id))
    if (!record || !record['original']) {
      console.log(`[EditWatch] No editRecord for ${post.id}; skipping (post wasn't tracked at submit time)`)
      return
    }

    const original = record['original']
    const edited = [post.title, post.selftext ?? ''].filter(Boolean).join('\n')

    if (original === edited) {
      console.log(`[EditWatch] Content unchanged for ${post.id}; skipping`)
      return
    }

    // Devvit replays PostUpdate events; dedupe so we don't write the same edit multiple times
    if (record['edited'] === edited) {
      console.log(`[EditWatch] Already processed this exact edit for ${post.id}; skipping`)
      return
    }

    const now = Date.now()
    const reportedAtStr = await redis.get(Keys.reportedAt(post.id))
    const reportedAt = reportedAtStr ? parseInt(reportedAtStr, 10) : null
    console.log(`[EditWatch] reportedAt for ${post.id}: ${reportedAt ?? 'never reported'}`)

    if (!reportedAt || reportedAt > now) {
      console.log(`[EditWatch] No prior report for ${post.id}; not flagging as evasion`)
      return
    }

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

    await redis.hSet(Keys.editRecord(post.id), update)

    let subredditName = event.subreddit?.name
    if (!subredditName) {
      try {
        const sub = await context.reddit.getCurrentSubreddit()
        subredditName = sub.name
      } catch {}
    }
    if (!subredditName) {
      console.error('[EditWatch] No subreddit name; aborting feed write')
      return
    }
    const feedEntry = JSON.stringify({
      itemId: post.id,
      postId: post.id,
      ...update,
      original,
      author: record['author'],
      title: record['title'],
      url: record['url'],
      type: 'post',
    })
    const feedKey = Keys.editFeed(subredditName)
    await redis.zAdd(feedKey, { score: now, member: feedEntry })
    const cnt = await redis.zCard(feedKey)
    console.log(`[EditWatch] Wrote entry for ${post.id} (score=${score}, delta=${deltaMinutes}m); feed size now ${cnt}`)
    if (cnt > 100) {
      await redis.zRemRangeByRank(feedKey, 0, cnt - 101)
    }

    try {
      if (record['author']) {
        const noteId = (post.id.startsWith('t3_') ? post.id : `t3_${post.id}`) as `t3_${string}`
        await context.reddit.addModNote({
          subreddit: subredditName,
          user: record['author'],
          note: `Content edited ${deltaMinutes}m after report — evasion score: ${score}. Diff stored in ModCommand.`,
          label: 'ABUSE_WARNING',
          redditId: noteId,
        })
      }
    } catch (noteErr) {
      console.error('[EditWatch] Mod note failed:', noteErr instanceof Error ? noteErr.message : noteErr)
    }

    try {
      const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
      if (apiKey && score !== 'LOW') {
        const aiResult = await classifyEdit(original, edited, deltaMinutes, redis, apiKey)
        await redis.hSet(Keys.editRecord(post.id), {
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
