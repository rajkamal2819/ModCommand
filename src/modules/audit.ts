import type { Context } from '@devvit/public-api'
import { Keys } from '../redis/keys.js'

const MAX_ENTRIES = 500
const WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000

export type AuditAction =
  | 'remove'
  | 'approve'
  | 'ban'
  | 'unban'
  | 'temp_ban'
  | 'edit_remove'
  | 'edit_innocent'
  | 'edit_ignore'
  | 'appeal_deny'
  | 'appeal_accept'
  | 'threshold_change'

export interface AuditWrite {
  action: AuditAction
  mod: string
  itemId?: string
  targetUser?: string
  reason?: string
  extra?: Record<string, string | number | boolean>
}

// Append one entry. Best-effort: never throws into the caller's hot path.
export async function recordAudit(
  subName: string,
  entry: AuditWrite,
  context: Context
): Promise<void> {
  try {
    const member = JSON.stringify({ ts: Date.now(), ...entry })
    const key = Keys.audit(subName)
    await context.redis.zAdd(key, { score: Date.now(), member })
    const total = await context.redis.zCard(key)
    if (total > MAX_ENTRIES) {
      await context.redis.zRemRangeByRank(key, 0, total - MAX_ENTRIES - 1)
    }
  } catch (err) {
    console.error('[Audit] write failed:', err instanceof Error ? err.message : err)
  }
}

// Read recent audit entries filtered by targetUser (used by Dossier panel).
export async function readAuditByUser(
  subName: string,
  username: string,
  context: Context,
  limit = 20
): Promise<Array<{ ts: number; action: string; mod: string; itemId?: string; reason?: string }>> {
  try {
    const since = Date.now() - WINDOW_30D_MS
    // Sorted set: pull entries since timestamp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = await context.redis.zRange(Keys.audit(subName), since, Date.now(), {
      by: 'score',
    } as unknown as { by: 'score' })
    const out: Array<{ ts: number; action: string; mod: string; itemId?: string; reason?: string }> = []
    for (const e of entries ?? []) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = JSON.parse((e as { member: string }).member) as any
        if (data.targetUser === username) {
          out.push({ ts: data.ts, action: data.action, mod: data.mod, itemId: data.itemId, reason: data.reason })
        }
      } catch {}
    }
    // newest first
    out.sort((a, b) => b.ts - a.ts)
    return out.slice(0, limit)
  } catch (err) {
    console.error('[Audit] read failed:', err instanceof Error ? err.message : err)
    return []
  }
}
