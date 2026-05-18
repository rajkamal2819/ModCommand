import type { Context } from '@devvit/public-api'
import type { Appeal } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'
import { summarizeAppeal } from '../ai/gemini.js'
import { recordAudit, type AuditAction } from './audit.js'
import { invalidateDossierCache } from './dossier.js'

export async function handleAppealLoad(context: Context): Promise<Appeal[]> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()

  // appealQueue is a sorted set with timestamp scores and userId members
  const queueItems = await redis.zRange(Keys.appealQueue(subreddit.name), 0, -1)
  const userIds = queueItems.map((item) => item.member)
  if (userIds.length === 0) return []

  const appeals: Appeal[] = []

  for (const userId of userIds) {
    try {
      const record = await redis.hGetAll(Keys.appeal(userId))
      if (!record || !record['username']) continue

      const username = record['username']
      let accountAge = 0
      let karma = 0

      try {
        const user = await context.reddit.getUserByUsername(username)
        const createdAt = user?.createdAt instanceof Date ? user.createdAt.getTime() : 0
        accountAge = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24))
        karma = (user?.linkKarma ?? 0) + (user?.commentKarma ?? 0)
      } catch {}

      const appeal: Appeal = {
        userId,
        username,
        banReason: record['banReason'] ?? 'Not specified',
        submittedAt: parseInt(record['submittedAt'] ?? '0', 10),
        status: (record['status'] ?? 'pending') as Appeal['status'],
        formAnswers: {
          whichRule: record['whichRule'] ?? '',
          whatDifferently: record['whatDifferently'] ?? '',
          acknowledged: record['acknowledged'] === 'true',
        },
        accountAge,
        karma,
      }

      try {
        const apiKey = (await context.settings.get('geminiApiKey')) as string | undefined
        if (apiKey) {
          const formText = [
            `Which rule: ${record['whichRule']}`,
            `What differently: ${record['whatDifferently']}`,
            `Acknowledged: ${record['acknowledged']}`,
          ].join('\n')

          const aiResult = await summarizeAppeal(
            record['banReason'] ?? '',
            accountAge,
            karma,
            formText,
            redis,
            apiKey
          )
          appeal.aiSummary = aiResult.summary
          appeal.aiRiskLevel = aiResult.riskLevel
          appeal.aiRiskReason = aiResult.riskReason
        }
      } catch {}

      appeals.push(appeal)
    } catch {}
  }

  return appeals
}

export async function handleAppealResolve(
  userId: string,
  action: 'unban' | 'deny' | 'temp_ban',
  duration: number | undefined,
  context: Context
): Promise<void> {
  const redis = context.redis
  const subreddit = await context.reddit.getCurrentSubreddit()

  const record = await redis.hGetAll(Keys.appeal(userId))
  const username = record?.['username']
  if (!username) return

  if (action === 'unban') {
    await context.reddit.unbanUser(username, subreddit.name)
    await redis.hSet(Keys.appeal(userId), { status: 'accepted' })

    try {
      await context.reddit.sendPrivateMessage({
        to: username,
        subject: 'Your ban appeal has been accepted',
        text: `Good news! Your ban appeal for r/${subreddit.name} has been accepted. You may now participate again. Please review the community rules before posting.`,
      })
    } catch {}
  } else if (action === 'temp_ban') {
    await context.reddit.banUser({
      subredditName: subreddit.name,
      username,
      reason: 'Reduced from permanent ban via appeal',
      duration: duration ?? 30,
    })
    await redis.hSet(Keys.appeal(userId), { status: 'accepted' })

    try {
      await context.reddit.sendPrivateMessage({
        to: username,
        subject: `Ban appeal decision — r/${subreddit.name}`,
        text: `Your ban has been reduced to ${duration ?? 30} days. Please review the community rules carefully.`,
      })
    } catch {}
  } else {
    await redis.hSet(Keys.appeal(userId), { status: 'denied' })

    try {
      await context.reddit.sendPrivateMessage({
        to: username,
        subject: `Ban appeal decision — r/${subreddit.name}`,
        text: `After review, your ban appeal for r/${subreddit.name} has been denied.`,
      })
    } catch {}
  }

  // Audit + dossier cache invalidate
  const auditAction: AuditAction =
    action === 'unban' ? 'appeal_accept' :
    action === 'temp_ban' ? 'temp_ban' :
    'appeal_deny'
  const modName = (await context.reddit.getCurrentUsername()) ?? 'unknown'
  await recordAudit(
    subreddit.name,
    { action: auditAction, mod: modName, targetUser: username },
    context
  )
  await invalidateDossierCache(subreddit.name, username, context)

  // Remove from queue
  await redis.zRem(Keys.appealQueue(subreddit.name), [userId])
}
