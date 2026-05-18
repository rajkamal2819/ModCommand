# ModCommand

A unified moderation dashboard for Reddit, built with [Devvit](https://developers.reddit.com/). ModCommand gives moderators a single command center to triage reports, review ban appeals, detect AI-generated content, catch edit evasion, track team workload, profile individual users, and converse with an AI co-investigator — all without leaving Reddit.

Built for the [Reddit Mod Tools and Migrated Apps Hackathon](https://www.reddit.com/r/devvit/).

> **Zero setup.** Install on your sub and everything works — AI features included. No API keys to configure, no external accounts to create. The dashboard ships with shared AI access (Google Gemini 2.5 Flash) so moderators can start using AIGC scoring, the Mod Copilot chat, and behavioral summaries immediately.

---

## Features

### 1. Triage Board
Kanban-style mod queue with real-time claim locks so two mods never action the same item simultaneously. Each card shows report reason, AIGC score badge, and edit-evasion badge. One-click **combo actions**: remove + ban + mod note in a single click. Five columns: Unclaimed → In Review → Action Pending (second-mod approval for permanent bans) → Done (last hour).

### 2. Appeal Desk
Ban appeal intake via modmail. When a banned user sends a modmail, ModCommand automatically replies with a structured form. Completed appeals appear in a split inbox/detail panel with account age, karma, ban reason, and a Gemini AI risk summary (low / medium / high).

### 3. AI Sentinel
Live feed of posts and comments that score above your configurable AIGC threshold. Each entry shows the score, up to 3 detection heuristics, and a link to the post. Threshold is adjustable per-subreddit with a slider. Scores are cached in Redis per content hash to avoid redundant API calls.

### 4. Edit Watch
Catches users who edit their content after it's been reported. Computes a side-by-side diff and assigns a suspicion score (HIGH / MEDIUM / LOW) based on how quickly the edit happened after the report and how substantive the change is. Actions: restore + remove, mark innocent, or ignore.

### 5. Workload Wall
Per-moderator dashboard with:
- **Live Queue card** at the top — Unclaimed / In Review / Pending Approval / Done last hour, with border color shifting by queue pressure
- **Stacked bar chart** of actions per moderator
- **Fairness gauge** showing workload distribution
- **Action-mix mini-bar** per row — green/red/dark-red showing approve / remove / ban composition
- **Click-to-expand drill-down** — each mod row opens to show their last 50 audit-log entries with clickable target users that open the User Dossier
- 7d / 30d toggle, weekly digest sent via DM to the head mod

### 6. Mod Copilot (chat)
Click 🤖 on any flagged item → a slide-in panel shows an AI verdict (approve / remove / ban / escalate) with confidence, signals, and a draft removal reason — then opens into a **full multi-turn chat**:
- Ask follow-ups in natural language ("why not escalate?", "what would change your mind?")
- Slash commands: `/removal-reason`, `/modmail`, `/sticky`, `/rule-cite` — drafts appear in copy-to-clipboard bubbles
- Clickable suggestion chips for proactive follow-ups
- Conversation persists 24h per item, restored on reopen
- Resizable panel — drag the left edge, double-click to reset

### 7. User Dossier
Click any `u/X` chip anywhere in the dashboard → slide-in panel showing that user's complete footprint in this sub:
- Account age + karma + moderator badge if applicable
- Last 30 tracked items with score badges and removal status
- Edit-evasion incident count
- Appeal status
- "Mod actions taken on this user" from the audit log (clickable to drill into specific items)
- AI behavioral summary at the top (risk tag: low / medium / high)
- Pin/unpin support — pinned users surface in the audit log

### 8. Adaptive AI Sentinel Threshold
After ≥50 mod decisions on AI-scored items, AI Sentinel suggests a threshold value based on where mod actions actually split (≥70% removal rate). Banner above the slider: *"Suggested: 83 — based on 142 mod decisions."* One click applies.

### 9. Audit Log
Every mod action (approve, remove, ban, edit-evasion resolution, appeal decision, threshold change) is appended to a per-sub sorted set with `{ ts, action, mod, targetUser, itemId, reason }`. Powers the User Dossier's "actions on this user" section and the Workload Wall's drill-down rows. Capped at 500 entries per sub.

### 10. Moderator-only access control
The dashboard is gated to moderators. Non-mod users who open it see a "Moderators Only" lock screen. Mod-list lookups are cached for 5 minutes via shared Redis to keep response time low.

### 11. Dark / Light theme toggle
Click the sun/moon switch in the header to flip themes. Preference persists in `localStorage`.

### 12. Dashboard entry points
- **"Open ModCommand"** menu item — opens the existing dashboard or creates one if missing (idempotent, tracks the canonical post in Redis)
- **"Pin Dashboard"** menu item — opt-in pinning at the top of the sub (visible to all users with the Moderators Only lock screen)
- **"Unpin Dashboard"** menu item — recovery if pinning is no longer wanted

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | [Devvit](https://developers.reddit.com/) 0.12.22 |
| Backend | TypeScript, Devvit Redis, Devvit Triggers |
| AI | Google Gemini 2.5 Flash (via OpenAI-compatible API) |
| Frontend | React 18, Tailwind CSS, Recharts |
| Build | Vite (webview), tsc (server) |

---

## Installation

### Prerequisites
- A Reddit account with moderator access to a subreddit

### For moderators installing the published app
1. Go to https://developers.reddit.com/apps/modcommand
2. Click **Add to community** → choose your subreddit
3. On your sub, open the **moderator menu** (top-right shield icon on old Reddit, three-dot menu on new) → **Open ModCommand** → click **Open Dashboard**

That's it — AI features work out of the box.

### For developers running locally
```bash
git clone https://github.com/rajkamal2819/ModCommand.git
cd ModCommand
npm install

npx devvit login
npx devvit upload
npx devvit playtest r/your_test_subreddit
```

### Configuration
In your subreddit's app settings (Mod Tools → Apps → ModCommand):

| Setting | Description | Default |
|---|---|---|
| `aigcThreshold` | AIGC detection threshold (0–100) — used by AI Sentinel | 70 |
| `appealFormEnabled` | Auto-reply to modmail with appeal form | true |
| `digestDay` | Day of week for weekly digest (0=Sun, 1=Mon, …) | 1 |

The AIGC threshold can also be adjusted live from the AI Sentinel tab via the slider — that value is persisted in Redis and takes priority over this setting.

---

## Privacy & data handling

- **No personal profiling.** ModCommand stores only mod action behavior, item metadata, and per-user activity *within the installed sub*. Account ages and karma are read from public Reddit profiles when needed.
- **External call:** AI features route through Google Gemini at `generativelanguage.googleapis.com`. The content of posts/comments being analyzed (text only) is sent. Responses are cached for 24h per content hash to minimize traffic and respect rate limits.
- **Shared AI access.** During the public beta the app uses a single shared Gemini key managed by the developer — moderators don't need to bring their own key. Per-sub API keys are on the roadmap for the general-availability release.
- **All AI is advisory.** Every recommendation requires a human mod to click. There is no auto-moderation.
- **Data retention.** Per-sub audit log is capped at 500 entries. Per-item caches expire after 24h. Dossier panel cache expires after 60s.

---

## Project Structure

```
src/
├── ai/
│   └── gemini.ts             # Gemini client — 6 prompts (AIGC, appeal, edit, copilot, copilot-chat, dossier-summary)
├── auth/
│   └── isModerator.ts        # Mod-gate + shared cached getModeratorSet()
├── modules/
│   ├── _util.ts              # withTimeout helper, shared across modules
│   ├── triageBoard.ts        # Mod queue + claim locks + combo actions + second-mod approval
│   ├── appealDesk.ts         # Ban appeal processing
│   ├── aiSentinel.ts         # AIGC feed + threshold + adaptive suggestion plumbing
│   ├── adaptiveThreshold.ts  # Sample collection + threshold suggestion algorithm
│   ├── editWatch.ts          # Edit diff tracking + actions
│   ├── workloadWall.ts       # Mod stats + live queue + drill-down + weekly digest
│   ├── copilot.ts            # Mod Copilot recommendation + multi-turn chat
│   ├── dossier.ts            # User Dossier aggregation + summary + pinning
│   └── audit.ts              # Per-sub mod-action audit log
├── redis/
│   └── keys.ts               # All Redis key patterns (one source of truth)
├── shared/
│   └── messages.ts           # postMessage types (Client ↔ Server)
├── triggers/                 # 10 Devvit triggers (PostSubmit, CommentSubmit, PostUpdate, …)
├── webview/
│   ├── tabs/                 # TriageBoard, AppealDesk, AISentinel, EditWatch, WorkloadWall
│   ├── components/           # ItemCard, DiffViewer, AppealCard, StatChart, CopilotPanel, DossierPanel
│   ├── hooks/
│   │   └── useDevvitBridge.ts  # postMessage bridge hook
│   └── App.tsx               # 5-tab shell + global Copilot/Dossier panel state
└── main.tsx                  # Devvit entrypoint — registers all triggers, menus, scheduler, post type
```

---

## Design Principles

- **Integration over silos.** Every tab is keyed by item, but real moderation is keyed by *user*. The User Dossier and Audit Log are connective tissue that link Triage ↔ Sentinel ↔ Edit Watch ↔ Workload through a shared user-centric view.
- **No auto-moderation.** Every AI result requires a human mod to click. AI is advisory only.
- **Claim locks.** Redis TTL-based locks prevent two mods actioning the same item simultaneously.
- **Cache-first AI.** All Gemini calls are cached by content hash for 24h. Each module uses a namespaced cache key.
- **Per-call deadlines.** Every Reddit API call has its own timeout via `withTimeout`. No single slow call blocks the dashboard.
- **Graceful degradation.** When the Gemini key isn't set, AI sections silently hide rather than erroring. The dashboard remains fully functional for triage, appeals, edit watch, and workload tracking.

---

## License

MIT
