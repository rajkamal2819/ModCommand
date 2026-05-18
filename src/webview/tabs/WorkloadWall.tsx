import { useState } from 'react'
import type { ModStats, ClientMessage, WorkloadQueueContext, WorkloadModAction } from '../../shared/messages'
import { WorkloadBarChart, FairnessGauge } from '../components/StatChart'

interface Props {
  mods: ModStats[]
  period: '7d' | '30d'
  queueContext: WorkloadQueueContext
  modActions: Record<string, WorkloadModAction[]>
  send: (msg: ClientMessage) => void
  onDossier?: (username: string) => void
}

export default function WorkloadWall({ mods, period, queueContext, modActions, send, onDossier }: Props) {
  const [expandedMod, setExpandedMod] = useState<string | null>(null)

  function setPeriod(p: '7d' | '30d') {
    send({ type: 'WORKLOAD_LOAD', period: p })
  }

  function toggleMod(username: string) {
    if (expandedMod === username) {
      setExpandedMod(null)
      return
    }
    setExpandedMod(username)
    // Fetch drill-down if not already cached.
    if (!modActions[username]) {
      send({ type: 'WORKLOAD_MOD_ACTIONS_LOAD', mod: username, period })
    }
  }

  const totalActions = mods.reduce(
    (sum, m) => sum + (period === '7d' ? m.last7Days : m.last30Days),
    0
  )
  const activeMods = mods.filter((m) => (period === '7d' ? m.last7Days : m.last30Days) > 0).length
  const queueOpen = queueContext.unclaimed + queueContext.inReview + queueContext.pendingApproval

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Period toggle */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-200">Team Workload</div>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => setPeriod('7d')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              period === '7d' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            7 days
          </button>
          <button
            onClick={() => setPeriod('30d')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              period === '30d' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            30 days
          </button>
        </div>
      </div>

      {/* Live queue context — always shown, even when there's no historic data */}
      <QueueContextCard ctx={queueContext} queueOpen={queueOpen} />

      {mods.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-500">
          <div className="text-center">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm">No mod activity tracked yet</div>
          </div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Actions" value={totalActions.toString()} sub={`in last ${period}`} />
            <StatCard label="Active Mods" value={activeMods.toString()} sub={`of ${mods.length} total`} />
            <StatCard
              label="Avg per Mod"
              value={mods.length > 0 ? Math.round(totalActions / mods.length).toString() : '0'}
              sub="across team"
            />
          </div>

          {/* Bar chart */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
              Actions per Moderator
            </div>
            <WorkloadBarChart mods={mods} period={period} />
          </div>

          {/* Fairness gauge */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
              Workload Distribution
            </div>
            <FairnessGauge mods={mods} period={period} />
          </div>

          {/* Per-mod table with action-mix bars + expandable drill-down */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-gray-700 text-xs text-gray-500 font-medium uppercase tracking-wide">
              <div className="col-span-3">Moderator</div>
              <div className="col-span-1 text-right">{period}</div>
              <div className="col-span-5">Action mix</div>
              <div className="col-span-3 text-right">Last active</div>
            </div>
            {mods.map((mod) => {
              const isOpen = expandedMod === mod.username
              const periodCount = period === '7d' ? mod.last7Days : mod.last30Days
              return (
                <div key={mod.username} className="border-b border-gray-700/50 last:border-b-0">
                  <button
                    onClick={() => toggleMod(mod.username)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Collapse u/${mod.username} drill-down` : `Expand u/${mod.username} drill-down`}
                    className="w-full grid grid-cols-12 gap-2 items-center px-4 py-2.5 hover:bg-gray-900/40 transition-colors text-left"
                  >
                    <div className="col-span-3 flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-gray-500 shrink-0">{isOpen ? '▾' : '▸'}</span>
                      <span className="text-sm text-gray-200 truncate">u/{mod.username}</span>
                    </div>
                    <div className="col-span-1 text-right text-sm font-mono text-gray-300">
                      {periodCount}
                    </div>
                    <div className="col-span-5">
                      <ActionMixBar counts={mod.counts} />
                    </div>
                    <div className="col-span-3 text-right text-xs text-gray-500">
                      {mod.lastActive > 0 ? formatRelative(mod.lastActive) : 'Never'}
                    </div>
                  </button>
                  {isOpen && (
                    <ModDrillDown
                      actions={modActions[mod.username]}
                      onDossier={onDossier}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function QueueContextCard({ ctx, queueOpen }: { ctx: WorkloadQueueContext; queueOpen: number }) {
  // Color the border by queue pressure.
  const pressureClass =
    queueOpen >= 10 ? 'border-red-500/40 bg-red-950/20'
    : queueOpen >= 3 ? 'border-orange-500/30 bg-orange-950/20'
    : 'border-gray-700 bg-gray-800'
  return (
    <div className={`rounded-xl p-3 border ${pressureClass}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-400 uppercase tracking-wide font-medium">
          🔴 Live Queue
        </div>
        <div className="text-xs text-gray-500">right now</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <QueueStat label="Unclaimed" value={ctx.unclaimed} color="text-orange-400" />
        <QueueStat label="In Review" value={ctx.inReview} color="text-blue-400" />
        <QueueStat label="Pending Approval" value={ctx.pendingApproval} color="text-yellow-400" />
        <QueueStat label="Done (1h)" value={ctx.doneRecent} color="text-green-400" />
      </div>
    </div>
  )
}

function QueueStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3 text-center">
      <div className="text-2xl font-bold text-gray-100">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// Inline stacked bar showing approve / remove / ban composition.
function ActionMixBar({ counts }: { counts: ModStats['counts'] }) {
  const total = counts.approval + counts.removal + counts.ban
  if (total === 0) {
    return <div className="text-[10px] text-gray-500 italic">no actions yet</div>
  }
  const approvePct = (counts.approval / total) * 100
  const removePct = (counts.removal / total) * 100
  const banPct = (counts.ban / total) * 100
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-gray-900 flex">
        {approvePct > 0 && (
          <div
            className="bg-green-600 h-full"
            style={{ width: `${approvePct}%` }}
            title={`${counts.approval} approvals`}
          />
        )}
        {removePct > 0 && (
          <div
            className="bg-red-600 h-full"
            style={{ width: `${removePct}%` }}
            title={`${counts.removal} removals`}
          />
        )}
        {banPct > 0 && (
          <div
            className="bg-red-900 h-full"
            style={{ width: `${banPct}%` }}
            title={`${counts.ban} bans`}
          />
        )}
      </div>
      <div className="text-[10px] text-gray-500 font-mono whitespace-nowrap shrink-0 w-20 text-right">
        {counts.approval}·{counts.removal}·{counts.ban}
      </div>
    </div>
  )
}

function ModDrillDown({
  actions,
  onDossier,
}: {
  actions: WorkloadModAction[] | undefined
  onDossier?: (username: string) => void
}) {
  if (actions === undefined) {
    return (
      <div className="px-4 py-3 bg-gray-900/40 text-xs text-gray-500 flex items-center gap-2">
        <div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        Loading recent actions…
      </div>
    )
  }
  if (actions.length === 0) {
    return (
      <div className="px-4 py-3 bg-gray-900/40 text-xs text-gray-500">
        No audit-log entries for this mod in the selected period.
      </div>
    )
  }
  return (
    <div className="bg-gray-900/40 max-h-72 overflow-y-auto">
      <div className="px-4 py-2 text-[10px] uppercase tracking-wide text-gray-500 font-medium border-b border-gray-800">
        Recent actions ({actions.length})
      </div>
      <div className="divide-y divide-gray-800/70">
        {actions.map((a, i) => (
          <div key={i} className="px-4 py-2 flex items-center gap-3 text-xs">
            <ActionBadge action={a.action} />
            {a.targetUser && onDossier ? (
              <button
                onClick={() => onDossier(a.targetUser!)}
                className="text-gray-400 hover:text-orange-400 transition-colors"
                title="Open user dossier"
              >
                u/{a.targetUser}
              </button>
            ) : a.targetUser ? (
              <span className="text-gray-500">u/{a.targetUser}</span>
            ) : (
              <span className="text-gray-700 italic">—</span>
            )}
            {a.reason && (
              <span className="text-gray-500 truncate flex-1" title={a.reason}>
                {a.reason}
              </span>
            )}
            {!a.reason && <span className="flex-1" />}
            <span className="text-gray-500 whitespace-nowrap shrink-0">{formatRelative(a.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const ACTION_STYLES: Record<string, { label: string; cls: string }> = {
  remove: { label: 'remove', cls: 'bg-red-900/60 text-red-300 border-red-800' },
  approve: { label: 'approve', cls: 'bg-green-900/60 text-green-300 border-green-800' },
  ban: { label: 'ban', cls: 'bg-red-950 text-red-300 border-red-900' },
  unban: { label: 'unban', cls: 'bg-green-900/40 text-green-300 border-green-800' },
  temp_ban: { label: 'temp ban', cls: 'bg-orange-900/60 text-orange-300 border-orange-800' },
  edit_remove: { label: 'edit·rm', cls: 'bg-red-900/60 text-red-300 border-red-800' },
  edit_innocent: { label: 'edit·ok', cls: 'bg-green-900/60 text-green-300 border-green-800' },
  edit_ignore: { label: 'edit·skip', cls: 'bg-gray-700 text-gray-300 border-gray-600' },
  appeal_deny: { label: 'appeal·deny', cls: 'bg-red-900/60 text-red-300 border-red-800' },
  appeal_accept: { label: 'appeal·ok', cls: 'bg-green-900/60 text-green-300 border-green-800' },
  threshold_change: { label: 'threshold', cls: 'bg-blue-900/40 text-blue-300 border-blue-800' },
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_STYLES[action] ?? { label: action, cls: 'bg-gray-700 text-gray-300 border-gray-600' }
  return (
    <span
      className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${meta.cls}`}
    >
      {meta.label}
    </span>
  )
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}
