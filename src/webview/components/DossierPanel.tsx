import { useEffect, useState } from 'react'
import type { ClientMessage, DossierState, DossierSummary } from '../../shared/messages'

interface Props {
  username: string | null
  data: DossierState | null
  summary: DossierSummary | null
  loading: boolean
  send: (msg: ClientMessage) => void
  onClose: () => void
}

const RISK_STYLES: Record<DossierSummary['riskTag'], string> = {
  low: 'bg-green-900/40 border-green-700/50 text-green-300',
  medium: 'bg-yellow-900/40 border-yellow-700/50 text-yellow-300',
  high: 'bg-red-900/40 border-red-700/50 text-red-300',
}

const ACTION_STYLES: Record<string, string> = {
  remove: 'text-red-400',
  edit_remove: 'text-red-400',
  ban: 'text-red-500',
  temp_ban: 'text-orange-400',
  approve: 'text-green-400',
  edit_innocent: 'text-green-400',
  appeal_accept: 'text-green-400',
  unban: 'text-green-400',
  appeal_deny: 'text-gray-500',
  edit_ignore: 'text-gray-500',
}

const MIN_WIDTH = 360
const MAX_WIDTH = 720
const DEFAULT_WIDTH = 420
const WIDTH_KEY = 'mc-dossier-width'

export default function DossierPanel({ username, data, summary, loading, send, onClose }: Props) {
  const [timedOut, setTimedOut] = useState(false)
  const [width, setWidth] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10)
    return !isNaN(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH
  })
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    setTimedOut(false)
    if (username && !data && !loading) {
      send({ type: 'DOSSIER_LOAD', username })
    }
  }, [username]) // eslint-disable-line

  useEffect(() => {
    if (!loading || !username) return
    const silentRetry = setTimeout(() => {
      console.log('[DossierPanel] no response in 1s — silently re-sending')
      send({ type: 'DOSSIER_LOAD', username })
    }, 1000)
    const visible = setTimeout(() => setTimedOut(true), 60000)
    return () => {
      clearTimeout(silentRetry)
      clearTimeout(visible)
    }
  }, [loading, username]) // eslint-disable-line

  // Resize handle, mirrors Copilot.
  useEffect(() => {
    if (!resizing) return
    function onMove(e: MouseEvent) {
      const vw = window.innerWidth
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, vw - e.clientX))
      setWidth(next)
    }
    function onUp() {
      setResizing(false)
      localStorage.setItem(WIDTH_KEY, String(width))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing, width])

  useEffect(() => {
    if (!resizing) localStorage.setItem(WIDTH_KEY, String(width))
  }, [width, resizing])

  function retry() {
    if (!username) return
    setTimedOut(false)
    send({ type: 'DOSSIER_LOAD', username })
  }

  function togglePin() {
    if (!username) return
    send({ type: 'DOSSIER_PIN_TOGGLE', username })
  }

  if (!username) return null

  // Risk score derived from concrete signals — pure heuristic, no AI required.
  const riskScore = data && !data.isModerator && !data.isDeleted ? computeRiskScore(data) : 0
  const riskLabel = RISK_LABELS[Math.min(riskScore, 4)]

  // "Clean record" empty state for users with zero negative signals.
  const isClean = data && !data.isModerator && !data.isDeleted &&
    data.recentItems.length > 0 &&
    data.evasionCount === 0 &&
    !data.appealStatus &&
    data.auditOnUser.length === 0 &&
    !data.recentItems.some((i) => i.removedBy === 'mod')

  return (
    <div
      className="absolute top-0 right-0 bottom-0 bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col z-20 animate-[slide-in_0.2s_ease-out]"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle — visible always */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setResizing(true) }}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        title="Drag to resize · double-click to reset"
        className={`absolute top-0 left-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${
          resizing ? 'bg-orange-500' : 'bg-gray-800 hover:bg-orange-500/60'
        }`}
        aria-label="Resize panel"
      />

      {/* Header — unified with Copilot */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-gray-800 bg-gray-950 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-orange-500 text-base">🔍</span>
          <span className="font-semibold text-gray-100 text-sm truncate">u/{username}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {data && !data.isModerator && (
            <button
              onClick={togglePin}
              aria-label={data.pinned ? `Unpin u/${username}` : `Pin u/${username} for quick access`}
              title={data.pinned ? 'Unpin user' : 'Pin user for quick access'}
              className={`text-sm leading-none px-2 py-1 rounded transition-colors ${
                data.pinned
                  ? 'bg-orange-700 text-white hover:bg-orange-600'
                  : 'text-gray-500 hover:text-orange-400 hover:bg-gray-800'
              }`}
            >
              {data.pinned ? '★' : '☆'}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-lg leading-none px-2"
            aria-label="Close dossier panel"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading || !data ? (
          timedOut ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 px-6 text-center">
              <span className="text-3xl">⏱️</span>
              <div className="text-sm">Taking longer than expected.</div>
              <button
                onClick={retry}
                className="mt-2 bg-orange-600 hover:bg-orange-500 text-white text-xs px-4 py-1.5 rounded transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <DossierSkeleton />
          )
        ) : data.isModerator ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6 mc-bubble-enter">
            <span className="text-4xl">🛡️</span>
            <div className="text-sm text-gray-200 font-medium">u/{username} is a moderator</div>
            <div className="text-xs text-gray-500">Mod actions are exempt from automatic recommendations.</div>
          </div>
        ) : (
          <>
            {/* Risk gauge — always-on, signal-derived */}
            <RiskGauge score={riskScore} label={riskLabel} />

            {/* AI Behavioral Summary */}
            {summary && (
              <div className={`rounded-lg p-3 border mc-bubble-enter ${RISK_STYLES[summary.riskTag]}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs uppercase tracking-wide font-semibold">🧠 Behavioral pattern</span>
                  <span className="text-xs uppercase tracking-wide font-bold">{summary.riskTag} risk</span>
                </div>
                <p className="text-xs leading-relaxed text-gray-200">{summary.summary}</p>
              </div>
            )}

            {/* Clean-record empty state — only when nothing's wrong */}
            {isClean && !summary && (
              <div className="rounded-lg p-3 border bg-green-900/30 border-green-700/50 text-green-300 mc-bubble-enter">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">✓</span>
                  <span className="text-xs uppercase tracking-wide font-semibold">Clean record</span>
                </div>
                <p className="text-xs leading-relaxed text-gray-300">
                  No flags in 30 days · no removals · no prior mod actions.
                </p>
              </div>
            )}

            {/* Account meta */}
            <Section title="Account">
              {data.isDeleted ? (
                <div className="text-sm text-gray-400">Account deleted or suspended</div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Age" value={data.accountAgeDays !== null ? `${data.accountAgeDays}d` : '—'} />
                  <Stat label="Karma" value={data.karma !== null ? data.karma.toLocaleString() : '—'} />
                  <Stat label="Evasion edits" value={data.evasionCount.toString()} highlight={data.evasionCount > 0 ? 'red' : null} />
                  <Stat
                    label="Appeal"
                    value={data.appealStatus ?? '—'}
                    highlight={
                      data.appealStatus === 'accepted' ? 'green' :
                      data.appealStatus === 'denied' ? 'red' :
                      data.appealStatus === 'pending' ? 'yellow' :
                      null
                    }
                  />
                </div>
              )}
            </Section>

            {/* Recent items */}
            <Section title={`Recent items (${data.recentItems.length})`}>
              {data.recentItems.length === 0 ? (
                <div className="text-xs text-gray-500 italic">
                  {data.installedAt
                    ? `No tracked activity since ModCommand install on ${new Date(data.installedAt).toLocaleDateString()}`
                    : 'No tracked activity'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {data.recentItems.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className={`text-xs bg-gray-800/70 rounded px-2 py-1.5 border border-gray-700/60 ${item.removedBy ? 'opacity-60' : ''}`}
                    >
                      <div className={`line-clamp-1 ${item.removedBy === 'mod' ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                        {item.title}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-gray-500">{item.type}</span>
                        {item.aigcScore !== null && item.aigcScore >= 40 && (
                          <span className={`px-1 rounded ${
                            item.aigcScore >= 80 ? 'bg-red-900/60 text-red-300' :
                            item.aigcScore >= 60 ? 'bg-orange-900/60 text-orange-300' :
                            'bg-yellow-900/60 text-yellow-300'
                          }`}>
                            AI {item.aigcScore}%
                          </span>
                        )}
                        {item.evasionScore && (
                          <span className="bg-red-900/40 text-red-300 px-1 rounded">
                            Edit {item.evasionScore}
                          </span>
                        )}
                        {item.removedBy === 'mod' && (
                          <span className="text-red-400 uppercase font-medium">Removed</span>
                        )}
                        {item.removedBy === 'user' && (
                          <span className="text-gray-500 uppercase font-medium">Deleted</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {data.recentItems.length > 10 && (
                    <div className="text-[10px] text-gray-500 italic text-center pt-1">
                      + {data.recentItems.length - 10} more (showing 10 most recent)
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Audit on user */}
            {data.auditOnUser.length > 0 && (
              <Section title="Mod actions on this user (30d)">
                <div className="space-y-1">
                  {data.auditOnUser.slice(0, 8).map((entry, i) => (
                    <div key={i} className="text-xs flex items-center gap-2">
                      <span className={`uppercase font-medium tracking-wide ${ACTION_STYLES[entry.action] ?? 'text-gray-400'}`}>
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-500">by u/{entry.mod}</span>
                      <span className="text-gray-500 ml-auto">{ageString(entry.ts)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      {/* Footer — action bar, always visible (not just when pinned) */}
      {data && !loading && !data.isModerator && (
        <div className="border-t border-gray-800 p-3 bg-gray-950/40 shrink-0 flex items-center gap-2">
          <a
            href={`https://www.reddit.com/user/${username}`}
            target="_blank"
            rel="noreferrer"
            className="flex-1 text-center text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 py-2 rounded-md font-medium transition-colors"
          >
            ↗ View on Reddit
          </a>
          <button
            onClick={togglePin}
            className={`text-xs px-3 py-2 rounded-md font-medium transition-colors ${
              data.pinned
                ? 'bg-orange-700 hover:bg-orange-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
            title={data.pinned ? 'Unpin' : 'Pin for quick access'}
          >
            {data.pinned ? '★ Pinned' : '☆ Pin'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

const RISK_LABELS = ['Clean', 'Minor concern', 'Moderate concern', 'High concern', 'Severe concern']

function computeRiskScore(d: DossierState): number {
  let score = 0
  // Account age — very new accounts skew risk up
  if (d.accountAgeDays !== null && d.accountAgeDays < 30) score++
  // Edit evasion incidents
  if (d.evasionCount > 0) score++
  if (d.evasionCount >= 3) score++
  // Removed items in recent history
  const removedCount = d.recentItems.filter((i) => i.removedBy === 'mod').length
  if (removedCount >= 2) score++
  if (removedCount >= 5) score++
  // Appeal flags
  if (d.appealStatus === 'denied') score++
  // High-volume mod actions on this user
  if (d.auditOnUser.length >= 3) score++
  return Math.min(score, 4)
}

function RiskGauge({ score, label }: { score: number; label: string }) {
  const color = score === 0 ? 'text-green-400' : score === 1 ? 'text-yellow-400' : score === 2 ? 'text-orange-400' : 'text-red-400'
  const dotColor = score === 0 ? 'bg-green-500' : score === 1 ? 'bg-yellow-500' : score === 2 ? 'bg-orange-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3 bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2.5 mc-bubble-enter">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold shrink-0">Risk</div>
      <div className="flex gap-1 shrink-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full ${i <= score ? dotColor : 'bg-gray-800'}`}
          />
        ))}
      </div>
      <div className={`text-xs font-semibold ${color}`}>{label}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 mc-bubble-enter">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{title}</div>
      <div>{children}</div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'green' | 'yellow' | null }) {
  const color =
    highlight === 'red' ? 'text-red-400' :
    highlight === 'green' ? 'text-green-400' :
    highlight === 'yellow' ? 'text-yellow-400' :
    'text-gray-200'
  return (
    <div className="bg-gray-800/70 rounded px-2.5 py-1.5 border border-gray-700/60">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium ${color}`}>{value}</div>
    </div>
  )
}

function DossierSkeleton() {
  // Lightweight gray placeholders shaped like the final sections — feels
  // 2× faster than a centered spinner.
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-10 bg-gray-800/60 rounded-lg" />
      <div className="h-16 bg-gray-800/60 rounded-lg" />
      <div className="space-y-1.5">
        <div className="h-3 w-20 bg-gray-800/60 rounded" />
        <div className="h-12 bg-gray-800/60 rounded-lg" />
        <div className="h-12 bg-gray-800/60 rounded-lg" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3 w-32 bg-gray-800/60 rounded" />
        <div className="h-8 bg-gray-800/60 rounded" />
        <div className="h-8 bg-gray-800/60 rounded" />
        <div className="h-8 bg-gray-800/60 rounded" />
      </div>
    </div>
  )
}

function ageString(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
