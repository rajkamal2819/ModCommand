# ModCommand

A unified moderation dashboard for Reddit, built with [Devvit](https://developers.reddit.com/). ModCommand gives moderators a single command center to triage reports, review ban appeals, detect AI-generated content, catch edit evasion, and track team workload — all without leaving Reddit.

Built for the [Reddit Mod Tools and Migrated Apps Hackathon](https://www.reddit.com/r/devvit/).

---

## Features

### Triage Board
Kanban-style mod queue with real-time claim locks so two mods never action the same item simultaneously. Each card shows report reason, AIGC score badge, and edit evasion badge. One-click combo actions: remove + ban + mod note in a single click.

### Appeal Desk
Ban appeal intake via modmail. When a banned user sends a modmail, ModCommand automatically replies with a structured form. Completed appeals appear in a split inbox/detail panel with account age, karma, ban reason, and a Gemini AI risk summary (low / medium / high).

### AI Sentinel
Live feed of posts and comments that score above your configurable AIGC threshold. Each entry shows the score, up to 3 detection heuristics, and a link to the post. Scores are cached in Redis to avoid redundant API calls. Threshold is adjustable per-subreddit with a slider.

### Edit Watch
Catches users who edit their content after it's been reported. Computes a side-by-side diff and assigns a suspicion score (HIGH / MEDIUM / LOW) based on how quickly the edit happened after the report. Actions: restore original + remove, mark innocent, or ignore.

### Workload Wall
Per-moderator action counts with stacked bar charts and a fairness pie chart. Toggle between last 7 days and last 30 days. Sends a weekly digest summary to the head moderator via private message.

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
- [Node.js](https://nodejs.org/) 18+
- A [Google AI Studio](https://aistudio.google.com/) API key (for AI features)

### Setup

```bash
# Install dependencies
npm install

# Authenticate with Devvit
npx devvit login

# Upload and install the app
npx devvit upload

# Start local playtest
npx devvit playtest r/your_subreddit
```

After uploading, go to your subreddit → create a new post → select **ModCommand Dashboard** as the post type → click **Open Dashboard**.

### Configuration

In your subreddit's app settings (Mod Tools → Apps → ModCommand):

| Setting | Description | Default |
|---|---|---|
| `geminiApiKey` | Google AI Studio API key | — |
| `aigcThreshold` | AIGC detection threshold (0–100) | 70 |
| `appealFormEnabled` | Auto-reply to modmail with appeal form | true |
| `digestDay` | Day of week for weekly digest (0=Sun) | 1 (Mon) |

---

## Project Structure

```
src/
├── ai/
│   └── gemini.ts          # Gemini API client — 3 prompts, Redis cache layer
├── modules/
│   ├── triageBoard.ts     # Mod queue + claim locks + combo actions
│   ├── appealDesk.ts      # Ban appeal processing
│   ├── aiSentinel.ts      # AIGC feed + threshold management
│   ├── editWatch.ts       # Edit diff tracking + actions
│   └── workloadWall.ts    # Mod stats + weekly digest
├── redis/
│   └── keys.ts            # All Redis key patterns
├── shared/
│   └── messages.ts        # postMessage types (Client ↔ Server)
├── triggers/
│   ├── onPostSubmit.ts    # Store original content + AIGC score
│   ├── onCommentSubmit.ts # Store original content + AIGC score
│   ├── onPostUpdate.ts    # Diff detection + evasion scoring
│   ├── onCommentUpdate.ts # Diff detection + evasion scoring
│   ├── onPostReport.ts    # Stamp report timestamp for delta calc
│   ├── onModAction.ts     # Track mod action counts
│   └── onModmail.ts       # Appeal intake form flow
├── webview/
│   ├── tabs/              # TriageBoard, AppealDesk, AISentinel, EditWatch, WorkloadWall
│   ├── components/        # ItemCard, DiffViewer, AppealCard, StatChart
│   ├── hooks/
│   │   └── useDevvitBridge.ts  # postMessage bridge hook
│   └── App.tsx            # 5-tab shell
└── main.tsx               # Devvit entrypoint — registers all triggers + post type
```

---

## Design Principles

- **No auto-moderation** — every AI result requires a human mod to click. AI is advisory only.
- **Claim locks** — Redis TTL-based locks prevent two mods actioning the same item simultaneously.
- **Cache-first AI** — all Gemini calls are cached by content hash (SHA-256) for 24 hours.
- **No personal profiling** — only mod action behavior is tracked, never user personal characteristics.

---

## License

MIT
