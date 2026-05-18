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
  // Action Pending metadata — set when status === 'action_pending'
  pendingAction?: ComboAction
  pendingInitiator?: string
  pendingAt?: number
  // Done metadata — set when status === 'done'
  doneAction?: ComboAction
  doneBy?: string
  doneAt?: number
}

export interface ComboAction {
  approve?: boolean // when true: clear reports, keep post; mutually exclusive with remove/ban
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

// ─── User Dossier ───────────────────────────────────────────────────────────

export interface DossierItem {
  id: string
  title: string
  type: 'post' | 'comment'
  aigcScore: number | null
  removedBy: 'mod' | 'user' | null
  scoredAt: number
  evasionScore?: 'HIGH' | 'MEDIUM' | 'LOW' | null
}

export interface DossierAuditEntry {
  ts: number
  action: string // 'remove' | 'approve' | 'ban' | 'unban' | 'temp_ban' | 'edit_remove' | 'edit_innocent' | 'edit_ignore' | 'threshold_change'
  mod: string
  itemId?: string
  reason?: string
}

export interface DossierState {
  username: string
  accountAgeDays: number | null
  karma: number | null
  isModerator: boolean
  isDeleted: boolean
  installedAt: number | null
  recentItems: DossierItem[]
  evasionCount: number
  appealStatus: 'pending' | 'accepted' | 'denied' | null
  appealAt: number | null
  auditOnUser: DossierAuditEntry[] // mod actions taken against this user (last 30d)
  pinned: boolean
}

export interface DossierSummary {
  summary: string
  riskTag: 'low' | 'medium' | 'high'
  generatedAt: number
}

// ─── Adaptive Threshold ─────────────────────────────────────────────────────

export interface ThresholdSuggestion {
  suggested: number
  sampleCount: number
  belowApproved: number   // count of approves under the suggested threshold
  belowRemoved: number
  aboveApproved: number
  aboveRemoved: number
}

export interface CopilotRecommendation {
  action: 'approve' | 'remove' | 'ban' | 'escalate'
  confidence: 'high' | 'medium' | 'low'
  reason: string
  draftMessage: string
  banReason?: string
  banDuration?: number
  signalsUsed: string[]
  generatedAt: number
  applied?: boolean
}

// Multi-turn Copilot chat: stored per-item, 24h TTL.
// First entry is the verdict; subsequent entries are follow-ups (questions, drafts, etc).
export interface CopilotChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: number
  // Optional shape hints for the UI:
  // - 'verdict' = first assistant turn carrying the action recommendation
  // - 'draft'   = a draft message (removal reason, modmail, sticky comment) the mod can copy
  // - 'answer'  = generic conversational follow-up
  kind?: 'verdict' | 'draft' | 'answer'
  // Suggested next questions the mod can click to send (proactive prompts)
  suggestions?: string[]
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

// Live queue snapshot — drives the "what's happening right now" card on Workload Wall.
export interface WorkloadQueueContext {
  unclaimed: number
  inReview: number
  pendingApproval: number
  doneRecent: number // actions completed in last hour
}

// One audit-log entry surfaced in a mod's drill-down.
export interface WorkloadModAction {
  ts: number
  action: string
  itemId?: string
  targetUser?: string
  reason?: string
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
  | { type: 'WORKLOAD_MOD_ACTIONS_LOAD'; mod: string; period: '7d' | '30d' }
  | { type: 'COPILOT_RECOMMEND'; itemId: string; force?: boolean }
  | { type: 'COPILOT_APPLY'; itemId: string }
  | { type: 'COPILOT_CHAT_LOAD'; itemId: string }
  | { type: 'COPILOT_CHAT_SEND'; itemId: string; content: string }
  | { type: 'PENDING_CONFIRM'; itemId: string }
  | { type: 'PENDING_REJECT'; itemId: string }
  | { type: 'DOSSIER_LOAD'; username: string }
  | { type: 'DOSSIER_PIN_TOGGLE'; username: string }

// ─── Server → Client messages ─────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'TRIAGE_STATE'; items: ModQueueItem[]; currentMod: string }
  | { type: 'CLAIM_UPDATE'; itemId: string; claimedBy: string | null }
  | { type: 'APPEAL_STATE'; appeals: Appeal[] }
  | { type: 'SENTINEL_STATE'; entries: SentinelEntry[]; threshold: number; suggestion?: ThresholdSuggestion | null }
  | { type: 'EDITWATCH_STATE'; entries: EditWatchEntry[] }
  | { type: 'WORKLOAD_STATE'; mods: ModStats[]; period: '7d' | '30d'; queueContext: WorkloadQueueContext }
  | { type: 'WORKLOAD_MOD_ACTIONS_STATE'; mod: string; actions: WorkloadModAction[] }
  | { type: 'ACTION_SUCCESS'; message: string }
  | { type: 'ERROR'; message: string }
  | { type: 'ACCESS_DENIED' }
  | { type: 'COPILOT_STATE'; itemId: string; recommendation: CopilotRecommendation }
  | { type: 'COPILOT_CHAT_STATE'; itemId: string; messages: CopilotChatMessage[]; thinking?: boolean }
  | { type: 'DOSSIER_STATE'; username: string; data: DossierState }
  | { type: 'DOSSIER_SUMMARY'; username: string; summary: DossierSummary }
