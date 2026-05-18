# ModCommand

### Stop tab-hopping. Start moderating.

ModCommand turns your subreddit into a moderation command center. Reports, AI-spam detection, edit-evasion, ban appeals, team workload, and an AI co-investigator — **inside one Reddit post**. No external dashboards. No logins. No API keys.

🔗 **[View source on GitHub](https://github.com/rajkamal2819/ModCommand)** &nbsp;·&nbsp; **[Report an issue](https://github.com/rajkamal2819/ModCommand/issues)** &nbsp;·&nbsp; Built for the [Reddit Mod Tools Hackathon](https://www.reddit.com/r/devvit/)

---

## Sound familiar?

You open modqueue. Three reports. One looks like AI spam — open a separate AI-detector tab. Another is from a user who's been banned before — dig through modmail to remember why. The third was edited five minutes after being reported, but you'd never know unless you compared revisions manually. Meanwhile your co-mod is about to action the same post you're looking at.

**Five tools. One decision.** Multiply by 80 reports a day.

## What changes when you install

> *One post on your sub. Click it. Every signal you need to make a call — visible, claimed, audited.*

- A mod opens the dashboard. The triage board claims their seat — no one else can action the same item.
- An AI-flagged post catches their eye. They click 🤖 and get a verdict in 2 seconds, with the user's full history one click away.
- A draft removal reason is ready. They edit two words, hit Apply, and it's gone. Mod note logged. Audit trail recorded.
- 30 seconds. Next report.

---

## Install in 30 seconds

1. Click **Add to community** at the top of this page → pick your subreddit
2. On your sub, open the mod menu → **Open ModCommand**
3. Click **Open Dashboard**

That's it. **AI features work on day one** — no Gemini key, no settings, no setup.

---

## What's inside

### 🗂 Triage Board — never collide with another mod
Kanban-style queue with **real-time claim locks**. Cards surface report reason, AI-generated score, and edit-evasion in a glance. **One-click combo actions** remove + ban + write the mod note in a single press. Permanent bans need a second mod's signoff so nobody bans alone in anger.

### 🤖 Mod Copilot — chat with AI about any report
Click 🤖 on any flagged item. Get a verdict with confidence, the signals it weighed, and a draft removal reason — then **keep the conversation going**. Ask follow-ups, request drafts (`/removal-reason`, `/modmail`, `/sticky`, `/rule-cite`), or click suggested next questions. The chat persists 24 hours per item.

### 🔍 User Dossier — entire user history in one click
Click any `u/X` chip. Get instant context: account age, karma, recent items with removal status, edit-evasion incidents, appeal history, and **every mod action ever taken against this user**. AI behavioral summary at the top. Pin troublesome users so they surface across the dashboard.

### 🛡 AI Sentinel — catch AI-generated posts before they spread
Live feed of posts and comments scored against an AI-text detector. Adjustable threshold via slider. After 50+ of your team's mod decisions, **the system suggests a threshold** based on where your team actually draws the line — no more guessing.

### ✂️ Edit Watch — see what users edited after you reported them
When someone edits a reported post or comment, you get a **side-by-side diff** and a suspicion score based on speed and content delta. Restore the original + remove, mark innocent, or ignore — without leaving the dashboard.

### 📬 Appeal Desk — turn modmail chaos into a triage queue
Banned users sending modmail get auto-replied with a **structured appeal form**. Completed appeals land here with account history, ban context, and an AI risk assessment. Decide in seconds, not minutes.

### 📊 Workload Wall — see your team before it burns out
Per-mod action counts, live queue pressure, **click-to-expand drill-down** of each mod's last 50 audit-log actions, and a color-coded action mix (approve / remove / ban ratio). Weekly digest auto-delivered to the head mod's DMs.

---

## Frequently asked

**Will it ever ban a user without my approval?**
No. Every AI verdict requires a human click. Permanent bans require a *second* mod's confirmation. There is no auto-moderation mode — by design.

**What does it send to Google's AI?**
The text content of the specific post or comment being analyzed. Nothing else — not user metadata, not account info, not other comments. Responses are cached 24 hours per content hash. The shared Gemini key is managed by the developer during the public beta; bring-your-own-key is on the roadmap.

**Does it work without the AI features?**
Yes — fully. Triage, claim locks, appeal intake, edit-evasion diffs, workload metrics, and audit logging all run without AI. The AI just adds a fast second opinion.

**Can non-mods see it?**
No. The dashboard is moderator-gated. Anyone else who opens the post sees a "Moderators Only" lock screen. The mod check is enforced server-side on every request.

**What happens to my data if I uninstall?**
It stays inside Reddit's platform. Nothing is exported to external services. The Redis state for your sub becomes unreachable when the install is removed.

**Can I see exactly what code is running?**
Yes. Every line is open source: [github.com/rajkamal2819/ModCommand](https://github.com/rajkamal2819/ModCommand). MIT licensed. Fork it, audit it, contribute.

**How heavy is it on my sub's resources?**
Lightweight. The dashboard is one custom post. There are no background jobs that hit Reddit's API on your sub. Triggers fire only on the events that matter (post submitted, edited, reported, mod action). Caches keep AI calls under typical free-tier quotas.

---

## Privacy in one paragraph

ModCommand stores moderator actions and content metadata inside your sub's Redis namespace. Public Reddit info (account age, karma) is read when displaying a user. Post/comment text is sent to Google Gemini at `generativelanguage.googleapis.com` for AI scoring (cached 24h). Audit logs capped at 500 entries per sub. Dossier panel cache: 60 seconds. No personal profiling. No cross-sub aggregation. No data leaves Reddit's platform except for the explicit Gemini calls listed above.

---

## Optional settings

Tune via **Mod Tools → Apps → ModCommand → Settings**:

| Setting | What it does | Default |
|---|---|---|
| `aigcThreshold` | AI-detection threshold (0–100). Also live-adjustable from the AI Sentinel slider — that value wins. | 70 |
| `appealFormEnabled` | Auto-reply to modmail with the appeal form | on |
| `digestDay` | Day of the week for the workload digest DM | Monday |

---

## Built with

[Devvit](https://developers.reddit.com/) · TypeScript · React · Tailwind · Google Gemini 2.5 Flash · Redis

---

## Ready to try it?

Click **Add to community** at the top of this page and pick your subreddit. The first dashboard appears as soon as you open the mod menu and click **Open ModCommand**.

**Source · feedback · contribute**
🔗 [github.com/rajkamal2819/ModCommand](https://github.com/rajkamal2819/ModCommand) — MIT licensed. Open issues, send PRs, audit every line.
