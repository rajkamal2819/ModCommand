import type { Context } from '@devvit/public-api'
import type { ThresholdSuggestion } from '../shared/messages.js'
import { Keys } from '../redis/keys.js'

const MAX_SAMPLES = 500
const MIN_SAMPLES = 50
const MIN_BIN_SAMPLES = 5
const REMOVE_RATE_THRESHOLD = 0.7 // 70% removed within a bin → considered "this is the cutoff"
const BIN_SIZE = 5

export type ThresholdDecision = 'approved' | 'removed'

// Append one sample. Best-effort — never throws into the caller's hot path.
// Called from any path that takes an action on an item whose AIGC score is known.
export async function recordSentinelSample(
  subName: string,
  itemId: string,
  aigcScore: number,
  decision: ThresholdDecision,
  context: Context
): Promise<void> {
  try {
    if (aigcScore < 0 || aigcScore > 100) return
    const member = `${itemId}:${decision}`
    const key = Keys.sentinelSamples(subName)
    await context.redis.zAdd(key, { score: aigcScore, member })
    // Cap the set
    const total = await context.redis.zCard(key)
    if (total > MAX_SAMPLES) {
      await context.redis.zRemRangeByRank(key, 0, total - MAX_SAMPLES - 1)
    }
  } catch (err) {
    console.error('[AdaptiveThreshold] sample write failed:', err instanceof Error ? err.message : err)
  }
}

// Compute a threshold suggestion based on collected samples.
// Returns null if there's not enough signal (cold start, or no clear split).
export async function computeSuggestion(
  subName: string,
  context: Context
): Promise<ThresholdSuggestion | null> {
  try {
    const all = await context.redis.zRange(Keys.sentinelSamples(subName), 0, -1)
    if (!all || all.length < MIN_SAMPLES) return null

    // Bucket by BIN_SIZE
    type Bin = { score: number; approved: number; removed: number }
    const bins = new Map<number, Bin>()
    for (const s of all) {
      const member = (s as { member: string }).member
      const score = (s as { score: number }).score
      const bucket = Math.floor(score / BIN_SIZE) * BIN_SIZE
      let bin = bins.get(bucket)
      if (!bin) {
        bin = { score: bucket, approved: 0, removed: 0 }
        bins.set(bucket, bin)
      }
      if (member.endsWith(':removed')) bin.removed++
      else if (member.endsWith(':approved')) bin.approved++
    }

    // Walk bins low → high; the first bin with enough samples AND removed-rate ≥ threshold is the suggestion
    const sorted = Array.from(bins.values()).sort((a, b) => a.score - b.score)
    for (const bin of sorted) {
      const total = bin.approved + bin.removed
      if (total < MIN_BIN_SAMPLES) continue
      const removeRate = bin.removed / total
      if (removeRate >= REMOVE_RATE_THRESHOLD) {
        // Split summary at the suggested threshold
        let belowApproved = 0
        let belowRemoved = 0
        let aboveApproved = 0
        let aboveRemoved = 0
        for (const s of all) {
          const sample = s as { score: number; member: string }
          const isRemoved = sample.member.endsWith(':removed')
          if (sample.score < bin.score) {
            if (isRemoved) belowRemoved++
            else belowApproved++
          } else {
            if (isRemoved) aboveRemoved++
            else aboveApproved++
          }
        }
        return {
          suggested: bin.score,
          sampleCount: all.length,
          belowApproved,
          belowRemoved,
          aboveApproved,
          aboveRemoved,
        }
      }
    }
    return null
  } catch (err) {
    console.error('[AdaptiveThreshold] compute failed:', err instanceof Error ? err.message : err)
    return null
  }
}
