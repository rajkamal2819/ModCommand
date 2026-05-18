import { Devvit, useWebView, useState } from '@devvit/public-api'
import type { JSONValue } from '@devvit/public-api'
import type { ClientMessage, ServerMessage } from './shared/messages.js'

// Triggers
import { onPostSubmit } from './triggers/onPostSubmit.js'
import { onCommentSubmit } from './triggers/onCommentSubmit.js'
import { onPostUpdate } from './triggers/onPostUpdate.js'
import { onCommentUpdate } from './triggers/onCommentUpdate.js'
import { onPostReport } from './triggers/onPostReport.js'
import { onCommentReport } from './triggers/onCommentReport.js'
import { onPostDelete } from './triggers/onPostDelete.js'
import { onCommentDelete } from './triggers/onCommentDelete.js'
import { onModAction } from './triggers/onModAction.js'
import { onModmail } from './triggers/onModmail.js'

// Module handlers
import { handleTriageInit, handleClaim, handleRelease, handleComboAction, handlePendingConfirm, handlePendingReject } from './modules/triageBoard.js'
import { handleEditWatchLoad, handleEditWatchAction } from './modules/editWatch.js'
import { handleSentinelLoad, handleSentinelThresholdUpdate } from './modules/aiSentinel.js'
import { handleAppealLoad, handleAppealResolve } from './modules/appealDesk.js'
import { handleWorkloadLoad, handleWorkloadModActions, runWeeklyDigest } from './modules/workloadWall.js'
import { handleCopilotRecommend, markCopilotApplied, handleCopilotChatLoad, handleCopilotChatSend, seedChatWithVerdict } from './modules/copilot.js'
import { handleDossierLoad, handleDossierPinToggle, handleDossierSummary } from './modules/dossier.js'
import { Keys } from './redis/keys.js'
import { isCurrentUserModerator } from './auth/isModerator.js'

// ─── App config ────────────────────────────────────────────────────────────────

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
})

// ─── Settings ──────────────────────────────────────────────────────────────────

Devvit.addSettings([
  {
    type: 'string',
    name: 'geminiApiKey',
    label: 'Gemini API Key',
    isSecret: true,
    scope: 'app',
  },
  {
    type: 'number',
    name: 'aigcThreshold',
    label: 'AI Detection Threshold (0-100)',
    defaultValue: 70,
    scope: 'installation',
  },
  {
    type: 'boolean',
    name: 'appealFormEnabled',
    label: 'Enable Appeal Desk intake form',
    defaultValue: true,
    scope: 'installation',
  },
  {
    type: 'number',
    name: 'digestDay',
    label: 'Weekly digest day (0=Sunday, 1=Monday, 6=Saturday)',
    defaultValue: 1,
    scope: 'installation',
  },
])

// ─── Triggers ──────────────────────────────────────────────────────────────────

Devvit.addTrigger(onPostSubmit)
Devvit.addTrigger(onCommentSubmit)
Devvit.addTrigger(onPostUpdate)
Devvit.addTrigger(onCommentUpdate)
Devvit.addTrigger(onPostReport)
Devvit.addTrigger(onCommentReport)
Devvit.addTrigger(onPostDelete)
Devvit.addTrigger(onCommentDelete)
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

// Pin / unpin helpers — only invoked from explicit menu actions, never on auto-creation.
// Reddit has no "mod-only post" primitive: any pinned post is visible to all subreddit
// users (with our "Moderators Only" lock screen when they open it). So we default to
// NOT pinning, and let mods opt in via the explicit "Pin Dashboard" menu if they want
// the post visible at the top.
async function tryStickyPost(
  postId: string,
  context: Devvit.Context
): Promise<{ ok: boolean; error?: string }> {
  const fullId = postId.startsWith('t3_') ? postId : `t3_${postId}`
  try {
    const freshPost = await context.reddit.getPostById(fullId)
    await freshPost.sticky(1)
    return { ok: true }
  } catch (err1) {
    const msg1 = err1 instanceof Error ? err1.message : String(err1)
    console.error('[Dashboard] post.sticky(1) failed:', msg1)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = context.reddit as any
      if (typeof r.stickyPost === 'function') {
        await r.stickyPost(postId, 1)
        return { ok: true }
      }
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2)
      console.error('[Dashboard] stickyPost fallback failed:', msg2)
      return { ok: false, error: `${msg1} (fallback also: ${msg2})` }
    }
    return { ok: false, error: msg1 }
  }
}

async function tryUnstickyPost(
  postId: string,
  context: Devvit.Context
): Promise<{ ok: boolean; error?: string }> {
  const fullId = postId.startsWith('t3_') ? postId : `t3_${postId}`
  try {
    const freshPost = await context.reddit.getPostById(fullId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = freshPost as any
    if (typeof p.unsticky === 'function') {
      await p.unsticky()
      return { ok: true }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = context.reddit as any
    if (typeof r.unstickyPost === 'function') {
      await r.unstickyPost(postId)
      return { ok: true }
    }
    return { ok: false, error: 'No unsticky method available in this Devvit version' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Dashboard] unsticky failed:', msg)
    return { ok: false, error: msg }
  }
}

// Primary entry point — opens the existing dashboard for this sub, or creates one if missing.
// Idempotent: if the saved post id no longer resolves (post deleted), falls through to create.
Devvit.addMenuItem({
  label: 'Open ModCommand',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit()
    const dashboardKey = Keys.dashboardPost(subreddit.name)

    // 1. Try to use the saved dashboard
    const savedId = await context.redis.get(dashboardKey)
    if (savedId) {
      try {
        const fullId = savedId.startsWith('t3_') ? savedId : `t3_${savedId}`
        const existing = await context.reddit.getPostById(fullId)
        if (existing && !(existing as { removed?: boolean }).removed) {
          context.ui.navigateTo(existing)
          return
        }
      } catch (err) {
        console.log(`[Dashboard] saved post ${savedId} not resolvable, will create new:`,
          err instanceof Error ? err.message : err)
      }
    }

    // 2. Create a new dashboard
    const post = await context.reddit.submitPost({
      title: 'ModCommand Dashboard',
      subredditName: subreddit.name,
      preview: (
        <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#030712">
          <text color="#f97316">Loading ModCommand...</text>
        </vstack>
      ),
    })

    // Persist the new post id so future menu clicks open this same dashboard
    await context.redis.set(dashboardKey, post.id)
    console.log(`[Dashboard] created and saved post id ${post.id}`)

    // Intentionally do NOT auto-pin. Reddit has no mod-only post primitive,
    // and pinning makes the dashboard visible to all subreddit users (with the
    // "Moderators Only" lock screen). Mods access via this menu — pinning is
    // opt-in via the separate "Pin Dashboard" menu item.
    context.ui.navigateTo(post)
  },
})

// Opt-in: pin Dashboard at top of sub (visible to all users with the lock screen).
Devvit.addMenuItem({
  label: 'Pin Dashboard (visible to all)',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit()
    const savedId = await context.redis.get(Keys.dashboardPost(subreddit.name))
    if (!savedId) {
      context.ui.showToast('No dashboard found — click "Open ModCommand" first to create one.')
      return
    }
    const result = await tryStickyPost(savedId, context)
    if (result.ok) {
      context.ui.showToast('Dashboard pinned to slot 1 ✓ (visible to all sub users)')
    } else {
      const friendly = (result.error ?? '').toLowerCase()
      let hint = result.error ?? 'Unknown error'
      if (friendly.includes('permission') || friendly.includes('forbidden')) {
        hint = 'Permission denied — the app needs "Manage Posts" mod permission. Edit the app in mod tools to grant it.'
      } else if (friendly.includes('sticky') && friendly.includes('full')) {
        hint = 'Both sticky slots are full. Unpin an existing sticky on Reddit first.'
      }
      context.ui.showToast({ text: `Pin failed: ${hint}`, appearance: 'neutral' })
    }
  },
})

// Recovery: unpin the dashboard so it's not visible in the public feed.
Devvit.addMenuItem({
  label: 'Unpin Dashboard from sub',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const subreddit = await context.reddit.getCurrentSubreddit()
    const savedId = await context.redis.get(Keys.dashboardPost(subreddit.name))
    if (!savedId) {
      context.ui.showToast('No dashboard found in this sub.')
      return
    }
    const result = await tryUnstickyPost(savedId, context)
    if (result.ok) {
      context.ui.showToast('Dashboard unpinned ✓ — mods still access via "Open ModCommand"')
    } else {
      context.ui.showToast({ text: `Unpin failed: ${result.error}`, appearance: 'neutral' })
    }
  },
})

// ─── Custom post type — ModCommand Dashboard ───────────────────────────────────

Devvit.addCustomPostType({
  name: 'ModCommand Dashboard',
  height: 'tall',
  render: (context) => {
    const [isMod] = useState(async () => isCurrentUserModerator(context))

    const webView = useWebView({
      url: 'index.html',

      async onMessage(rawMessage, hook) {
        const message = rawMessage as unknown as ClientMessage
        const send = (msg: ServerMessage) =>
          hook.postMessage(msg as unknown as JSONValue)

        const tMsg = Date.now()
        console.log(`[onMessage] received type=${message.type}`)

        // Gate all requests to moderators only — with a 5s deadline.
        // The dashboard's render-time mod check already gated entry to this UI,
        // so if the runtime mod check is slow/hangs we fail OPEN (assume mod) rather
        // than blocking legitimate messages behind a cold getModerators() fetch.
        const tGate = Date.now()
        const modCheck = await Promise.race([
          isCurrentUserModerator(context).then((r) => ({ ok: r, timedOut: false })),
          new Promise<{ ok: boolean; timedOut: boolean }>((resolve) =>
            setTimeout(() => resolve({ ok: true, timedOut: true }), 5000)
          ),
        ])
        console.log(`[onMessage] mod-gate done in ${Date.now() - tGate}ms (ok=${modCheck.ok}, timedOut=${modCheck.timedOut})`)
        if (!modCheck.ok) {
          send({ type: 'ACCESS_DENIED' })
          return
        }

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
              const result = await handleComboAction(message.itemId, message.action, context)
              send({ type: 'ACTION_SUCCESS', message: result.message })
              const triageData = await handleTriageInit(context)
              send({ type: 'TRIAGE_STATE', ...triageData })
              break
            }
            case 'PENDING_CONFIRM': {
              const result = await handlePendingConfirm(message.itemId, context)
              send({ type: 'ACTION_SUCCESS', message: result.message })
              const triageData = await handleTriageInit(context)
              send({ type: 'TRIAGE_STATE', ...triageData })
              break
            }
            case 'PENDING_REJECT': {
              const result = await handlePendingReject(message.itemId, context)
              send({ type: 'ACTION_SUCCESS', message: result.message })
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
              const { mods, queueContext } = await handleWorkloadLoad(message.period, context)
              send({ type: 'WORKLOAD_STATE', mods, period: message.period, queueContext })
              break
            }
            case 'WORKLOAD_MOD_ACTIONS_LOAD': {
              const actions = await handleWorkloadModActions(message.mod, message.period, context)
              send({ type: 'WORKLOAD_MOD_ACTIONS_STATE', mod: message.mod, actions })
              break
            }
            case 'COPILOT_RECOMMEND': {
              console.log(`[onMessage] dispatching COPILOT_RECOMMEND for ${message.itemId} (force=${!!message.force})`)
              const recommendation = await handleCopilotRecommend(message.itemId, context, { force: message.force })
              console.log(`[onMessage] COPILOT response ready, sending; total=${Date.now() - tMsg}ms`)
              send({ type: 'COPILOT_STATE', itemId: message.itemId, recommendation })
              // Seed chat with the verdict so the multi-turn panel has something
              // to show. Run inline (not as a detached IIFE) — Devvit's eval
              // context only stays valid during the synchronous run of this
              // handler, and a fire-and-forget closure can fail with
              // "setTimeout is not defined" when it tries to deferred-execute
              // after the handler returns. Inline keeps `context` in scope.
              try {
                await seedChatWithVerdict(message.itemId, recommendation, context)
                const messages = await handleCopilotChatLoad(message.itemId, context)
                send({ type: 'COPILOT_CHAT_STATE', itemId: message.itemId, messages })
              } catch (err) {
                console.error('[onMessage] seedChatWithVerdict failed:', err instanceof Error ? err.message : err)
              }
              break
            }
            case 'COPILOT_APPLY': {
              await markCopilotApplied(message.itemId, context)
              send({ type: 'ACTION_SUCCESS', message: 'Recommendation applied' })
              break
            }
            case 'COPILOT_CHAT_LOAD': {
              const messages = await handleCopilotChatLoad(message.itemId, context)
              send({ type: 'COPILOT_CHAT_STATE', itemId: message.itemId, messages })
              break
            }
            case 'COPILOT_CHAT_SEND': {
              // Echo "thinking" state immediately so UI can show typing indicator,
              // then send the final state once Gemini returns.
              const current = await handleCopilotChatLoad(message.itemId, context)
              const pendingUser = { role: 'user' as const, content: message.content, ts: Date.now() }
              send({
                type: 'COPILOT_CHAT_STATE',
                itemId: message.itemId,
                messages: [...current, pendingUser],
                thinking: true,
              })
              const messages = await handleCopilotChatSend(message.itemId, message.content, context)
              send({ type: 'COPILOT_CHAT_STATE', itemId: message.itemId, messages })
              break
            }
            case 'DOSSIER_LOAD': {
              console.log(`[onMessage] dispatching DOSSIER_LOAD for ${message.username}`)
              const data = await handleDossierLoad(message.username, context)
              send({ type: 'DOSSIER_STATE', username: message.username, data })
              // AI summary runs inline so Devvit's eval-context stays valid.
              // Fire-and-forget would let `context` go out of scope and trigger
              // `'setTimeout' is not defined` (or similar) from any internal
              // timer use in fetch/abort. Slight UX cost: data + summary land
              // together rather than data-first, but only when AI is enabled.
              try {
                const summary = await handleDossierSummary(message.username, data, context)
                if (summary) {
                  send({ type: 'DOSSIER_SUMMARY', username: message.username, summary })
                }
              } catch (err) {
                console.error('[onMessage] dossier summary failed:', err instanceof Error ? err.message : err)
              }
              break
            }
            case 'DOSSIER_PIN_TOGGLE': {
              const result = await handleDossierPinToggle(message.username, context)
              send({
                type: 'ACTION_SUCCESS',
                message: result.pinned ? `Pinned u/${message.username}` : `Unpinned u/${message.username}`,
              })
              // Refresh the dossier to reflect the new pinned state
              const data = await handleDossierLoad(message.username, context)
              send({ type: 'DOSSIER_STATE', username: message.username, data })
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

    if (!isMod) {
      return (
        <vstack height="100%" width="100%" alignment="center middle" backgroundColor="#030712" gap="small">
          <text size="xxlarge">🔒</text>
          <text style="heading" size="large" color="#f3f4f6">Moderators Only</text>
          <text color="secondary" size="medium">This dashboard is restricted to subreddit moderators.</text>
        </vstack>
      )
    }

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
