# ModCommand

**Your subreddit's moderation command center — without leaving Reddit.**

Triage reports, review appeals, catch AI-generated spam, spot edit-evasion, track team workload, and chat with an AI co-investigator. All in one custom post inside your subreddit. No external dashboards, no logins, no API keys.

🔗 **[View source on GitHub →](https://github.com/rajkamal2819/ModCommand)** &nbsp;·&nbsp; [Report an issue](https://github.com/rajkamal2819/ModCommand/issues) &nbsp;·&nbsp; Built for the [Reddit Mod Tools and Migrated Apps Hackathon](https://www.reddit.com/r/devvit/)

---

## The problem

Modern moderation is fragmented. Reports live in modqueue. AI-generated spam needs separate detection. Edit-evasion is invisible. Ban appeals show up in modmail with no context about the user. Workload is invisible until somebody burns out.

You end up cross-referencing five tools to make one decision.

## The fix

**One Reddit post that opens into a moderation dashboard.** Every signal in one place, every action one click, every decision backed by an audit trail. AI is included — not as auto-moderation, but as a second pair of eyes that you can ignore, override, or follow.

---

## Install in 30 seconds

1. Click **Add to community** at the top of this page → pick your subreddit
2. On your sub, open the mod menu → **Open ModCommand**
3. Click **Open Dashboard**

That's it. AI features work out of the box — no Gemini key needed, no settings to configure. Start using it on day one.

---

## What you get

### 🗂 Triage Board
Kanban-style mod queue with **real-time claim locks** so two mods never fight over the same report. Each card surfaces report reason, AI-generated score, and edit-evasion badge at a glance. **One-click combo actions**: remove + ban + mod note in a single press. Permanent bans require a second mod to confirm.

### 🤖 Mod Copilot — chat with AI about any report
Click 🤖 on any flagged item → an AI verdict with confidence, signals it weighed, and a draft removal reason. Then **keep the conversation going**: ask follow-ups, request drafts (`/removal-reason`, `/modmail`, `/sticky`, `/rule-cite`), or click suggested next questions. Conversation persists 24h. Resizable.

### 🔍 User Dossier — full user history on click
Click any `u/X` chip anywhere in the dashboard → instant breakdown of that user's footprint in your sub: account age, karma, recent items with removal status, edit-evasion incidents, appeal history, and **every mod action ever taken against them**. AI risk summary at top. Pin users to keep them on your radar.

### 🛡 AI Sentinel — AI-generated content detection
Live feed of posts and comments scored against an AI-generated text detector. Adjustable threshold per sub via slider. After 50+ mod decisions, the system **suggests a threshold** based on where your team actually draws the line.

### ✂️ Edit Watch — catch users editing after reports
When someone edits their post or comment after being reported, you get a side-by-side diff and a suspicion score. Restore the original + remove, mark innocent, or ignore — all from the dashboard.

### 📬 Appeal Desk — structured ban appeals
Banned users sending modmail get auto-replied with a structured appeal form. Completed appeals appear with account history, ban context, and an AI risk assessment so you can decide in seconds, not minutes.

### 📊 Workload Wall — see your team's health
Per-mod action breakdown, live queue snapshot, click-to-expand drill-down showing each mod's last 50 audit-log actions. Color-coded action mix per mod. Weekly digest delivered to the head mod's DMs.

---

## Why mods trust it

- **🔒 Moderator-only.** Non-mods who open the dashboard see a "Moderators Only" lock screen. The whole UI is gated.
- **🤝 No auto-moderation.** Every AI recommendation requires a human click. There is no "ban automatically" mode. AI is advisory.
- **🪞 Full audit log.** Every mod action is recorded with timestamp, mod, and target user. Surfaces in the User Dossier and Workload Wall.
- **🌐 Open source.** Read every line of code. We don't ship anything we'd be uncomfortable showing you. [github.com/rajkamal2819/ModCommand](https://github.com/rajkamal2819/ModCommand)
- **🚪 Zero lock-in.** Uninstall any time. No exported data lives outside Reddit's platform.

---

## Privacy & data handling

- **No personal profiling.** ModCommand tracks moderator behavior (actions taken) and content metadata. Public Reddit info (account age, karma) is read when needed; nothing private is stored.
- **AI calls.** Content being analyzed (post/comment text only) is sent to Google Gemini at `generativelanguage.googleapis.com`. Cached 24h per content hash to minimize traffic.
- **Shared AI access during beta.** A single shared Gemini key is bundled — moderators don't need to bring their own. Per-sub API keys are on the roadmap.
- **Data retention.** Audit log capped at 500 entries per sub. Per-item caches expire in 24h. Dossier cache expires in 60s.

---

## Optional configuration

Once installed, you can fine-tune via **Mod Tools → Apps → ModCommand → Settings**:

| Setting | What it does | Default |
|---|---|---|
| `aigcThreshold` | AIGC detection threshold (0–100) — also adjustable from the AI Sentinel slider | 70 |
| `appealFormEnabled` | Auto-reply to modmail with the appeal form | true |
| `digestDay` | Day of the week for the workload digest DM | Monday |

---

## Built with

[Devvit](https://developers.reddit.com/) 0.12 · TypeScript · React · Tailwind · Google Gemini 2.5 Flash · Redis

## Source, issues, feedback

- **GitHub:** [github.com/rajkamal2819/ModCommand](https://github.com/rajkamal2819/ModCommand)
- **Bugs & feature requests:** [open an issue](https://github.com/rajkamal2819/ModCommand/issues)
- **MIT licensed** — fork, study, contribute.
