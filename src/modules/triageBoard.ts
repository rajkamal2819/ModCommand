import type { Context } from '@devvit/public-api'
import type { ModQueueItem, ComboAction } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'

function ttl(seconds: number): { expiration: Date } {
  return { expiration: new Date(Date.now() + seconds * 1000) }
}

export async function handleTriageInit(context: Context): Promise<{
  items: ModQueueItem[]
  currentMod: string
}> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()
  const currentMod = (await context.reddit.getCurrentUsername()) ?? 'unknown'

  const queue = await subreddit.getModQueue().all()

  const items: ModQueueItem[] = await Promise.all(
    queue.map(async (item) => {
      const itemId = item.id
      const [claimedBy, editRecord] = await Promise.all([
        redis.get(Keys.claimLock(itemId)),
        redis.hGetAll(Keys.editRecord(itemId)),
      ])

      const aigcScore = editRecord?.['aigcScore'] ? parseInt(editRecord['aigcScore'], 10) : null
      const evasionScore = (editRecord?.['score'] as 'HIGH' | 'MEDIUM' | 'LOW' | undefined) ?? null
      const hasEdit = Boolean(editRecord?.['edited'])

      const isComment = 'postId' in item
      const reportReason =
        (item.modReportReasons?.[0] ?? item.userReportReasons?.[0] ?? 'No reason given')

      return {
        id: itemId,
        title: isComment
          ? `Comment by u/${item.authorName ?? 'unknown'}`
          : (item as { title?: string }).title ?? `Post ${itemId}`,
        author: item.authorName ?? 'unknown',
        subreddit: subreddit.name,
        reportReason,
        reportedAt: item.createdAt instanceof Date ? item.createdAt.getTime() : Date.now(),
        createdAt: item.createdAt instanceof Date ? item.createdAt.getTime() : Date.now(),
        url: `https://reddit.com${item.permalink ?? ''}`,
        type: isComment ? 'comment' : 'post',
        claimedBy: claimedBy ?? null,
        claimedAt: null,
        aigcScore,
        editEvasionScore: hasEdit ? (evasionScore ?? null) : null,
        status: claimedBy ? 'in_review' : 'unclaimed',
      } satisfies ModQueueItem
    })
  )

  return { items, currentMod }
}

export async function handleClaim(
  itemId: string,
  modName: string,
  context: Context
): Promise<{ claimedBy: string }> {
  const redis = context.redis

  const existing = await redis.get(Keys.claimLock(itemId))
  if (existing && existing !== modName) {
    throw new Error(`Already claimed by u/${existing}`)
  }

  await redis.set(Keys.claimLock(itemId), modName, ttl(300))
  return { claimedBy: modName }
}

export async function handleRelease(itemId: string, context: Context): Promise<void> {
  await context.redis.del(Keys.claimLock(itemId))
}

export async function handleComboAction(
  itemId: string,
  action: ComboAction,
  context: Context
): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubreddit()
  const subName = subreddit.name

  const redis = context.redis
  const record = await redis.hGetAll(Keys.editRecord(itemId))
  const authorName = record?.['author']

  if (action.remove) {
    try {
      await context.reddit.remove(itemId, false)
    } catch {}
  }

  if (action.ban && authorName) {
    try {
      await context.reddit.banUser({
        subredditName: subName,
        username: authorName,
        reason: action.banReason || 'Rule violation',
        message: action.banReason || 'You have been banned from this community.',
        duration: action.banDuration,
      })
    } catch {}
  }

  if (action.removalReason && authorName) {
    try {
      await context.reddit.addModNote({
        subreddit: subName,
        user: authorName,
        note: action.removalReason,
        label: 'SPAM_WARNING',
        redditId: `t3_${itemId}`,
      })
    } catch {}
  }

  await handleRelease(itemId, context)
}
