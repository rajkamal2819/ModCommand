import type { Context } from '@devvit/public-api'
import type { EditWatchEntry, DiffChunk } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'

export async function handleEditWatchLoad(context: Context): Promise<EditWatchEntry[]> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()

  // zRange returns { member, score }[] — sorted oldest to newest by default
  const [rawEntries, removedMap] = await Promise.all([
    redis.zRange(Keys.editFeed(subreddit.name), 0, -1),
    redis.hGetAll(Keys.sentinelRemoved(subreddit.name)),
  ])
  const removed = removedMap ?? {}

  const entries: EditWatchEntry[] = rawEntries
    .map((item) => {
      try {
        const data = JSON.parse(item.member) as Record<string, string>
        const itemId = data['itemId'] ?? data['id'] ?? ''
        const removedBy = removed[itemId]
        return {
          itemId,
          postId: data['postId'] ?? data['itemId'] ?? data['id'] ?? '',
          title: data['title'] ?? 'Unknown',
          author: data['author'] ?? 'unknown',
          url: data['url'] ?? '',
          type: (data['type'] ?? 'post') as 'post' | 'comment',
          original: data['original'] ?? '',
          edited: data['edited'] ?? '',
          diffChunks: JSON.parse(data['diff'] ?? '[]') as DiffChunk[],
          reportedAt: parseInt(data['reportedAt'] ?? '0', 10),
          editedAt: parseInt(data['editedAt'] ?? '0', 10),
          deltaMinutes: parseInt(data['deltaMinutes'] ?? '0', 10),
          score: (data['score'] ?? 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
          status: (data['status'] ?? 'flagged') as 'flagged' | 'innocent' | 'ignored',
          removed: !!removedBy,
          removedBy: removedBy === 'mod' ? ('mod' as const) : removedBy === 'user' ? ('user' as const) : undefined,
        } as EditWatchEntry
      } catch {
        return null
      }
    })
    .filter((e): e is EditWatchEntry => e !== null)

  // Dedupe: keep only the latest entry per itemId (in case of historical duplicate writes)
  const byId = new Map<string, EditWatchEntry>()
  for (const e of entries) {
    const existing = byId.get(e.itemId)
    if (!existing || e.editedAt > existing.editedAt) byId.set(e.itemId, e)
  }
  const deduped = Array.from(byId.values())

  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  return deduped.sort((a, b) => order[a.score] - order[b.score])
}

export async function handleEditWatchAction(
  itemId: string,
  action: 'restore_remove' | 'innocent' | 'ignore',
  context: Context
): Promise<void> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()

  await redis.hSet(Keys.editRecord(itemId), {
    status: action === 'innocent' ? 'innocent' : 'ignored',
  })

  // Update status in the sorted set by finding and replacing the member
  const allEntries = await redis.zRange(Keys.editFeed(subreddit.name), 0, -1)
  for (const item of allEntries) {
    try {
      const data = JSON.parse(item.member) as Record<string, string>
      if ((data['itemId'] ?? data['id']) === itemId) {
        // Remove old, re-insert with updated status
        await redis.zRem(Keys.editFeed(subreddit.name), [item.member])
        data['status'] = action === 'innocent' ? 'innocent' : 'ignored'
        await redis.zAdd(Keys.editFeed(subreddit.name), {
          score: item.score,
          member: JSON.stringify(data),
        })
        break
      }
    } catch {}
  }

  if (action === 'restore_remove') {
    const record = await redis.hGetAll(Keys.editRecord(itemId))
    if (record?.['original']) {
      try {
        await context.reddit.remove(itemId, false)
      } catch {}

      if (record['author']) {
        try {
          await context.reddit.addModNote({
            subreddit: subreddit.name,
            user: record['author'],
            note: `Removed: edit evasion confirmed. Original content preserved in ModCommand diff.`,
            label: 'ABUSE_WARNING',
            redditId: `t3_${itemId}`,
          })
        } catch {}
      }
    }
  }
}
