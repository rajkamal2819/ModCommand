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

export default function DossierPanel({ username, data, summary, loading, send, onClose }: Props) {
  const [timedOut, setTimedOut] = useState(false)

  // Auto-request dossier when a user is selected
  useEffect(() => {
    setTimedOut(false)
    if (username && !data && !loading) {
      send({ type: 'DOSSIER_LOAD', username })
    }
  }, [username]) // eslint-disable-line

  // Resilience: silent retry after 1s, visible timeout after 60s
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

  return (
    <div className="absolute top-0 right-0 bottom-0 w-[380px] bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col z-20 animate-[slide-in_0.2s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-orange-500 text-base">🔍</span>
          <span className="font-semibold text-gray-100 text-sm truncate">u/{username}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Pin toggle — always visible in the header so the feature is
              discoverable on first open. Filled star = pinned. */}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading dossier…</span>
            </div>
          )
        ) : data.isModerator ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-6">
            <span className="text-4xl">🛡️</span>
            <div className="text-sm text-gray-200 font-medium">u/{username} is a moderator</div>
            <div className="text-xs text-gray-500">Mod actions are exempt from automatic recommendations.</div>
          </div>
        ) : (
          <>
            {/* AI Behavioral Summary (renders only when present) */}
            {summary && (
              <div className={`rounded-lg p-3 border ${RISK_STYLES[summary.riskTag]}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs uppercase tracking-wide font-semibold">🧠 Behavioral pattern</span>
                  <span className="text-xs uppercase tracking-wide font-bold">{summary.riskTag} risk</span>
                </div>
                <p className="text-xs leading-relaxed text-gray-200">{summary.summary}</p>
              </div>
            )}

            {/* Header card with account meta */}
            <div className="bg-gray-800 rounded-lg p-3 space-y-1">
              {data.isDeleted ? (
                <div className="text-sm text-gray-400">Account deleted or suspended</div>
              ) : (
                <>
                  <div className="text-xs text-gray-500">
                    Account age: <span className="text-gray-200">
                      {data.accountAgeDays !== null ? `${data.accountAgeDays} days` : 'unknown'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Karma: <span className="text-gray-200">{data.karma !== null ? data.karma.toLocaleString() : 'unknown'}</span>
                  </div>
                </>
              )}
              <div className="text-xs text-gray-500">
                Evasion edits: <span className={data.evasionCount > 0 ? 'text-red-400 font-medium' : 'text-gray-200'}>
                  {data.evasionCount}
                </span>
              </div>
              {data.appealStatus && (
                <div className="text-xs text-gray-500">
                  Appeal: <span className={`font-medium ${
                    data.appealStatus === 'accepted' ? 'text-green-400' :
                    data.appealStatus === 'denied' ? 'text-red-400' :
                    'text-yellow-400'
                  }`}>
                    {data.appealStatus}
                  </span>
                </div>
              )}
            </div>

            {/* Recent items */}
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                Recent items ({data.recentItems.length})
              </div>
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
                      className={`text-xs bg-gray-800 rounded px-2 py-1.5 border border-gray-700 ${
                        item.removedBy ? 'opacity-60' : ''
                      }`}
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
                </div>
              )}
            </div>

            {/* Audit on user */}
            {data.auditOnUser.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  Mod actions on this user (30d)
                </div>
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer — pinned-state context so the star action makes sense */}
      {data && !loading && !data.isModerator && data.pinned && (
        <div className="border-t border-gray-800 p-2.5 text-xs text-orange-300 bg-orange-950/30 text-center">
          ⭐ This user is pinned — they'll surface in the audit log.
        </div>
      )}
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
