import type { ModActionDefinition } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

const ACTION_TYPE_MAP: Record<string, string> = {
  removelink: 'removal',
  removecomment: 'removal',
  approvelink: 'approval',
  approvecomment: 'approval',
  banuser: 'ban',
  unbanuser: 'ban',
  addnote: 'mod_note',
  distinguish: 'approval',
  marknsfw: 'removal',
}

export const onModAction: ModActionDefinition = {
  event: 'ModAction',
  async onEvent(event, context) {
    const modName = event.moderator?.name
    if (!modName) return

    const redis = context.redis
    const actionType = ACTION_TYPE_MAP[event.action ?? ''] ?? 'other'
    const now = Date.now()

    const actionId = `${actionType}:${now}:${Math.random().toString(36).slice(2)}`
    await redis.zAdd(Keys.modActions(modName), { score: now, member: actionId })
    await redis.hIncrBy(Keys.modCounts(modName), actionType, 1)

    // Prune entries older than 90 days
    const cutoff = now - 90 * 24 * 60 * 60 * 1000
    await redis.zRemRangeByScore(Keys.modActions(modName), 0, cutoff)
  },
}
