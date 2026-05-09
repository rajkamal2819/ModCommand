import { Devvit, useWebView } from '@devvit/public-api'
import type { JSONValue } from '@devvit/public-api'
import type { ClientMessage, ServerMessage } from './shared/messages.js'

// Triggers
import { onPostSubmit } from './triggers/onPostSubmit.js'
import { onCommentSubmit } from './triggers/onCommentSubmit.js'
import { onPostUpdate } from './triggers/onPostUpdate.js'
import { onCommentUpdate } from './triggers/onCommentUpdate.js'
import { onPostReport } from './triggers/onPostReport.js'
import { onModAction } from './triggers/onModAction.js'
import { onModmail } from './triggers/onModmail.js'

// Module handlers
import { handleTriageInit, handleClaim, handleRelease, handleComboAction } from './modules/triageBoard.js'
import { handleEditWatchLoad, handleEditWatchAction } from './modules/editWatch.js'
import { handleSentinelLoad, handleSentinelThresholdUpdate } from './modules/aiSentinel.js'
import { handleAppealLoad, handleAppealResolve } from './modules/appealDesk.js'
import { handleWorkloadLoad, runWeeklyDigest } from './modules/workloadWall.js'
import { Keys } from './redis/keys.js'

// ─── App config ────────────────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
})

// ─── Triggers ──────────────────────────────────────────────────────────────────

Devvit.addTrigger(onPostSubmit)
Devvit.addTrigger(onCommentSubmit)
Devvit.addTrigger(onPostUpdate)
Devvit.addTrigger(onCommentUpdate)
Devvit.addTrigger(onPostReport)
Devvit.addTrigger(onModAction)
Devvit.addTrigger(onModmail)

// ─── App install handler ───────────────────────────────────────────────────────

Devvit.addTrigger({
  event: 'AppInstall',
  async onEvent(event, context) {
    const subredditId = event.subreddit?.id ?? context.subredditId
    if (subredditId) {
      await context.redis.set(Keys.installedAt(subredditId), Date.now().toString())
    }
  },
})

// ─── Weekly digest scheduler ───────────────────────────────────────────────────

Devvit.addSchedulerJob({
  name: 'weeklyDigest',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRun: async (_event, context: any) => {
    await runWeeklyDigest(context)
  },
})

// ─── Subreddit menu item ───────────────────────────────────────────────────────

Devvit.addMenuItem({
  label: 'Create ModCommand Dashboard',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit()
    const post = await context.reddit.submitPost({
      title: 'ModCommand Dashboard',
      subredditName: subreddit.name,
      preview: (
        <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#030712">
          <text color="#f97316">Loading ModCommand...</text>
        </vstack>
      ),
    })
    context.ui.navigateTo(post)
  },
})

// ─── Custom post type — ModCommand Dashboard ───────────────────────────────────

Devvit.addCustomPostType({
  name: 'ModCommand Dashboard',
  height: 'tall',
  render: (context) => {
    const webView = useWebView({
      url: 'index.html',

      async onMessage(rawMessage, hook) {
        const message = rawMessage as unknown as ClientMessage
        const send = (msg: ServerMessage) =>
          hook.postMessage(msg as unknown as JSONValue)

        try {
          switch (message.type) {
            case 'INIT':
            case 'TRIAGE_REFRESH': {
              const data = await handleTriageInit(context)
              send({ type: 'TRIAGE_STATE', ...data })
              break
            }
            case 'CLAIM': {
              const modName = (await context.reddit.getCurrentUsername()) ?? 'unknown'
              const result = await handleClaim(message.itemId, modName, context)
              send({ type: 'CLAIM_UPDATE', itemId: message.itemId, claimedBy: result.claimedBy })
              break
            }
            case 'RELEASE': {
              await handleRelease(message.itemId, context)
              send({ type: 'CLAIM_UPDATE', itemId: message.itemId, claimedBy: null })
              break
            }
            case 'COMBO_ACTION': {
              await handleComboAction(message.itemId, message.action, context)
              send({ type: 'ACTION_SUCCESS', message: 'Action completed successfully' })
              const triageData = await handleTriageInit(context)
              send({ type: 'TRIAGE_STATE', ...triageData })
              break
            }
            case 'APPEAL_LOAD': {
              const appeals = await handleAppealLoad(context)
              send({ type: 'APPEAL_STATE', appeals })
              break
            }
            case 'APPEAL_RESOLVE': {
              await handleAppealResolve(message.userId, message.action, message.duration, context)
              const appeals = await handleAppealLoad(context)
              send({ type: 'APPEAL_STATE', appeals })
              break
            }
            case 'SENTINEL_LOAD': {
              const sentinelData = await handleSentinelLoad(context)
              send({ type: 'SENTINEL_STATE', ...sentinelData })
              break
            }
            case 'SENTINEL_THRESHOLD_UPDATE': {
              await handleSentinelThresholdUpdate(message.threshold, context)
              const sentinelData = await handleSentinelLoad(context)
              send({ type: 'SENTINEL_STATE', ...sentinelData })
              break
            }
            case 'EDITWATCH_LOAD': {
              const entries = await handleEditWatchLoad(context)
              send({ type: 'EDITWATCH_STATE', entries })
              break
            }
            case 'EDITWATCH_ACTION': {
              await handleEditWatchAction(message.itemId, message.action, context)
              const entries = await handleEditWatchLoad(context)
              send({ type: 'EDITWATCH_STATE', entries })
              break
            }
            case 'WORKLOAD_LOAD': {
              const mods = await handleWorkloadLoad(message.period, context)
              send({ type: 'WORKLOAD_STATE', mods, period: message.period })
              break
            }
          }
        } catch (err) {
          send({
            type: 'ERROR',
            message: err instanceof Error ? err.message : 'An unexpected error occurred',
          })
        }
      },
    })

    return (
      <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#030712">
        <vstack alignment="center middle" gap="medium">
          <text style="heading" size="xxlarge" color="#f97316">ModCommand</text>
          <text color="secondary" size="medium">Unified Moderation Dashboard</text>
          <button appearance="primary" size="large" onPress={() => webView.mount()}>
            Open Dashboard
          </button>
        </vstack>
      </vstack>
    )
  },
})

export default Devvit
