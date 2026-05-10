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
}
