export const Keys = {
  // Triage Board — claim locks (TTL 5 min)
  claimLock:    (itemId: string)  => `lock:${itemId}`,

  // Edit Watch — content snapshots and report timestamps
  editRecord:   (postId: string)  => `edit:${postId}`,
  reportedAt:   (itemId: string)  => `reported:${itemId}`,
  editFeed:     (subName: string) => `editfeed:${subName}`,

  // AppealDesk — per-user appeal data + subreddit queue
  appeal:       (userId: string)  => `appeal:${userId}`,
  appealQueue:  (subName: string) => `appealq:${subName}`,

  // AI Sentinel — scored content cache + feed list
  aiScore:         (hash: string)    => `ai:${hash}`,
  sentinelFeed:    (subName: string) => `sentinel:${subName}`,
  sentinelRemoved: (subName: string) => `sentinel:removed:${subName}`,

  // Workload Wall — per-mod sorted sets and hash counts
  modActions:   (modName: string) => `mod:${modName}:actions`,
  modCounts:    (modName: string) => `mod:${modName}:counts`,

  // App metadata
  installedAt:  (subId: string)   => `installed:${subId}`,
  settings:     (subId: string)   => `settings:${subId}`,

  // Mod check cache (60s TTL)
  modCheck:     (subName: string, username: string) => `modcheck:${subName}:${username}`,
  // Full mod list cache (5 min TTL) — shared by access control + Copilot
  modList:      (subName: string) => `modlist:${subName}`,

  // Marks that a report was fired by AI Sentinel (not a human), TTL 5 min
  aiAutoReport: (itemId: string) => `aireport:${itemId}`,

  // Mod Copilot — cached recommendations + applied flag
  copilot:        (itemId: string) => `copilot:${itemId}`,
  copilotApplied: (itemId: string) => `copilot:applied:${itemId}`,
  // Multi-turn chat history per item (JSON array of ChatMessage, TTL 24h)
  copilotChat:    (itemId: string) => `copilot:chat:${itemId}`,

  // Reverse index per user (used by Copilot signals + future Dossier)
  // Sorted set: {score: createdAt, member: itemId}
  userItems:      (subName: string, username: string) => `useritems:${subName}:${username}`,

  // Pending high-stakes actions awaiting second-mod approval (Action Pending column)
  // Hash: { action (JSON ComboAction), initiator, createdAt, title, author, url, type, reportReason, aigcScore? }
  // TTL: 24h. Per-item key so we can read pending state when reconstructing the board.
  pendingAction:  (itemId: string) => `pending:${itemId}`,
  // Index of pending itemIds for a sub — sorted set, score = createdAt
  pendingIndex:   (subName: string) => `pending:idx:${subName}`,

  // Recently completed actions (Done column) — sorted set, score = executedAt
  // Each entry stores the full done snapshot so we can render even after the
  // underlying Reddit post is gone. Trimmed to 50 entries + 1h age cutoff.
  recentDone:     (subName: string) => `done:${subName}`,

  // Persistent reference to the dashboard custom post for a sub.
  // Used by the "Open ModCommand" menu so we navigate to the existing one
  // instead of creating a duplicate each time.
  dashboardPost:  (subName: string) => `dashboard:post:${subName}`,

  // ─── User Dossier ────────────────────────────────────────────────────────
  // Hot cache of the aggregated dossier payload — avoids re-pulling 30 items
  // + Reddit getUserByUsername on every panel open. 60s TTL.
  dossierCache:   (subName: string, username: string) => `dossier:cache:${subName}:${username}`,
  // AI behavioral summary (24h TTL, only refreshed when dossier signals change).
  dossierSummary: (subName: string, username: string) => `dossier:summary:${subName}:${username}`,
  // Mods can "pin" a user → 🔍 badge surfaces wherever they appear. Stretch feature.
  dossierPinned:  (subName: string) => `dossier:pinned:${subName}`,

  // ─── Adaptive Threshold ──────────────────────────────────────────────────
  // Each sample = `{itemId}:{decision}` where decision ∈ approved|removed.
  // Sorted set, score = AIGC score (0-100). Capped at 500 entries.
  sentinelSamples: (subName: string) => `sentinel:samples:${subName}`,

  // ─── Audit log ───────────────────────────────────────────────────────────
  // Every mod action (approve/remove/ban/unban/threshold_change/...) recorded
  // here for the Dossier "actions on this user" section + future audit views.
  // Sorted set, score = timestamp, member = JSON entry. Capped at 500 entries.
  audit:          (subName: string) => `audit:${subName}`,
}
