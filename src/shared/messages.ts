// Shared message types between webview (React) and Devvit server
// postMessage bridge is the ONLY communication channel

// ─── Data shapes ─────────────────────────────────────────────────────────────

export interface ModQueueItem {
  id: string
  title: string
  author: string
  subreddit: string
  reportReason: string
  reportedAt: number
  createdAt: number
  url: string
  type: 'post' | 'comment'
  claimedBy: string | null
  claimedAt: number | null
  aigcScore: number | null
  editEvasionScore: 'HIGH' | 'MEDIUM' | 'LOW' | null
  status: 'unclaimed' | 'in_review' | 'action_pending' | 'done'
}

export interface ComboAction {
  remove: boolean
  ban: boolean
  banReason: string
  removalReason: string
  banDuration?: number // days; undefined = permanent
}

export interface Appeal {
  userId: string
  username: string
  banReason: string
  submittedAt: number
  status: 'pending' | 'accepted' | 'denied'
  formAnswers: {
    whichRule: string
    whatDifferently: string
    acknowledged: boolean
  }
  accountAge: number // days
  karma: number
  aiSummary?: string
  aiRiskLevel?: 'low' | 'medium' | 'high'
  aiRiskReason?: string
}

export interface SentinelEntry {
  id: string
  title: string
  author: string
  url: string
  type: 'post' | 'comment'
  score: number
  heuristics: string[]
  scoredAt: number
  removed?: boolean
  removedBy?: 'mod' | 'user'
}

export interface EditWatchEntry {
  itemId: string
  postId: string
  title: string
  author: string
  url: string
  type: 'post' | 'comment'
  original: string
  edited: string
  diffChunks: DiffChunk[]
  reportedAt: number
  editedAt: number
  deltaMinutes: number
  score: 'HIGH' | 'MEDIUM' | 'LOW'
  status: 'flagged' | 'innocent' | 'ignored'
  removed?: boolean
  removedBy?: 'mod' | 'user'
}

export interface DiffChunk {
  added?: boolean
  removed?: boolean
  value: string
}

export interface ModStats {
  username: string
  lastActive: number
  counts: {
    removal: number
    approval: number
    ban: number
    modmail_reply: number
    mod_note: number
  }
  last7Days: number
  last30Days: number
}

// ─── Client → Server messages ─────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'INIT' }
  | { type: 'TRIAGE_REFRESH' }
  | { type: 'CLAIM'; itemId: string }
  | { type: 'RELEASE'; itemId: string }
  | { type: 'COMBO_ACTION'; itemId: string; action: ComboAction }
  | { type: 'APPEAL_LOAD' }
  | { type: 'APPEAL_RESOLVE'; userId: string; action: 'unban' | 'deny' | 'temp_ban'; duration?: number }
  | { type: 'SENTINEL_LOAD' }
  | { type: 'SENTINEL_THRESHOLD_UPDATE'; threshold: number }
  | { type: 'EDITWATCH_LOAD' }
  | { type: 'EDITWATCH_ACTION'; itemId: string; action: 'restore_remove' | 'innocent' | 'ignore' }
  | { type: 'WORKLOAD_LOAD'; period: '7d' | '30d' }

// ─── Server → Client messages ─────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'TRIAGE_STATE'; items: ModQueueItem[]; currentMod: string }
  | { type: 'CLAIM_UPDATE'; itemId: string; claimedBy: string | null }
  | { type: 'APPEAL_STATE'; appeals: Appeal[] }
  | { type: 'SENTINEL_STATE'; entries: SentinelEntry[]; threshold: number }
  | { type: 'EDITWATCH_STATE'; entries: EditWatchEntry[] }
  | { type: 'WORKLOAD_STATE'; mods: ModStats[]; period: '7d' | '30d' }
  | { type: 'ACTION_SUCCESS'; message: string }
  | { type: 'ERROR'; message: string }
  | { type: 'ACCESS_DENIED' }
