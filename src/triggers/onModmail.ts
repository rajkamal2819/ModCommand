import type { ModMailDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

const INTAKE_FORM_REPLY = `
Hi there,

Your message has been received. To process your ban appeal, please answer the following questions by replying to this message with your answers numbered:

1. **Which rule did you break?** (Be specific about which community rule you violated)
2. **What will you do differently?** (How will you change your behavior if unbanned)
3. **Do you acknowledge the community rules?** (Reply "Yes, I acknowledge the rules" to confirm)

Your appeal will be reviewed by a moderator once you complete this form. Incomplete responses will not be considered.

*This is an automated message from ModCommand.*
`.trim()

export const onModmail: ModMailDefinition = {
  event: 'ModMail',
  async onEvent(event, context) {
    const messageAuthor = event.messageAuthor
    if (!messageAuthor) return

    const redis = context.redis
    const subredditName = event.conversationSubreddit?.name ?? ''
    const userId = messageAuthor.id
    const username = messageAuthor.name

    const formEnabled = (await context.settings.get('appealFormEnabled')) as boolean | undefined
    if (formEnabled === false) return

    // Check if user is banned
    let isBanned = false
    try {
      const bannedUsers = await context.reddit.getBannedUsers({ subredditName, username }).all()
      isBanned = bannedUsers.length > 0
    } catch {
      return
    }

    if (!isBanned) return

    const existingStatus = await redis.hGet(Keys.appeal(userId), 'status')
    if (existingStatus) return

    // Fetch the conversation to read the message body
    let body = ''
    try {
      const { conversation } = await context.reddit.modMail.getConversation({
        conversationId: event.conversationId,
        markRead: false,
      })
      const messages = conversation?.messages ?? {}
      const sorted = Object.values(messages).sort(
        (a, b) => new Date(b?.date ?? 0).getTime() - new Date(a?.date ?? 0).getTime()
      )
      body = sorted[0]?.bodyMarkdown ?? ''
    } catch {}

    const hasAnswers =
      body.includes('1.') ||
      (body.includes('2.') && body.toLowerCase().includes('yes, i acknowledge'))

    if (hasAnswers) {
      const lines = body.split('\n').map((l: string) => l.trim()).filter(Boolean)
      const whichRule = lines.find((l: string) => l.startsWith('1.'))?.slice(2).trim() ?? body
      const whatDifferently = lines.find((l: string) => l.startsWith('2.'))?.slice(2).trim() ?? ''
      const acknowledged = lines.some((l: string) => l.toLowerCase().includes('yes, i acknowledge'))

      const banReason = 'Not specified'

      await redis.hSet(Keys.appeal(userId), {
        userId,
        username,
        banReason,
        whichRule,
        whatDifferently,
        acknowledged: acknowledged.toString(),
        submittedAt: Date.now().toString(),
        status: 'pending',
      })

      await redis.zAdd(Keys.appealQueue(subredditName), {
        score: Date.now(),
        member: userId,
      })

      try {
        await context.reddit.sendPrivateMessage({
          to: username,
          subject: 'Appeal Received — ModCommand',
          text: 'Your appeal has been received and is under review. A moderator will respond shortly.',
        })
      } catch {}
    } else {
      try {
        await context.reddit.sendPrivateMessage({
          to: username,
          subject: 'Ban Appeal — Please Complete This Form',
          text: INTAKE_FORM_REPLY,
        })
      } catch {}
    }
  },
}
