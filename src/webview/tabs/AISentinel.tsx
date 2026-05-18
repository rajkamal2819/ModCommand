import { useState } from 'react'
import type { SentinelEntry, ClientMessage, ThresholdSuggestion } from '../../shared/messages'

interface Props {
  entries: SentinelEntry[]
  threshold: number
  send: (msg: ClientMessage) => void
  onCopilot?: (id: string) => void
  onDossier?: (username: string) => void
  suggestion?: ThresholdSuggestion | null
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 80
      ? 'bg-red-600 text-white'
      : score >= 60
      ? 'bg-orange-500 text-white'
      : 'bg-yellow-500 text-gray-900'
  return (
    <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${cls}`}>
      {score}%
    </span>
  )
}

export default function AISentinel({ entries, threshold, send, onCopilot, onDossier, suggestion }: Props) {
  const [localThreshold, setLocalThreshold] = useState(threshold)
  const [expanded, setExpanded] = useState<string | null>(null)

  function applyThreshold(val: number) {
    setLocalThreshold(val)
    send({ type: 'SENTINEL_THRESHOLD_UPDATE', threshold: val })
  }

  // Filter visible entries by current threshold (live, no server roundtrip needed)
  const visibleEntries = entries.filter((e) => e.score >= localThreshold)

  // Show the adaptive-threshold banner only when:
  // - we have a suggestion (i.e. ≥50 mod decisions in the bucket history)
  // - it's meaningfully different from the current threshold (±2 deadband)
  const showSuggestion =
    suggestion != null && Math.abs(suggestion.suggested - localThreshold) > 2

  function applySuggestion() {
    if (!suggestion) return
    setLocalThreshold(suggestion.suggested)
    applyThreshold(suggestion.suggested)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Threshold control */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <span className="text-xs text-gray-400 shrink-0">Flag threshold:</span>
        <input
          type="range"
          min={0}
          max={100}
          value={localThreshold}
          onChange={(e) => setLocalThreshold(parseInt(e.target.value, 10))}
          onMouseUp={() => applyThreshold(localThreshold)}
          onTouchEnd={() => applyThreshold(localThreshold)}
          className="flex-1 accent-orange-500"
        />
        <span className="text-xs font-mono text-orange-400 w-8 text-right shrink-0">
          {localThreshold}
        </span>
        <span className="text-xs text-gray-500 shrink-0">
          {visibleEntries.length} of {entries.length} flagged
        </span>
      </div>

      {/* Adaptive threshold banner */}
      {showSuggestion && suggestion && (
        <div className="flex items-center gap-3 px-4 py-2 bg-orange-950/40 border-b border-orange-900/50 shrink-0">
          <span className="text-xs">💡</span>
          <div className="flex-1 text-xs">
            <span className="text-orange-300 font-medium">Suggested: {suggestion.suggested}</span>
            <span className="text-gray-400">
              {' — based on '}{suggestion.sampleCount}{' mod decision'}{suggestion.sampleCount === 1 ? '' : 's'}
              {' · '}{suggestion.aboveRemoved} of {suggestion.aboveRemoved + suggestion.aboveApproved} above the line were removed
            </span>
          </div>
          <button
            onClick={applySuggestion}
            className="text-xs bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded transition-colors font-medium"
          >
            Apply
          </button>
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {visibleEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600">
            <div className="text-center">
              <div className="text-3xl mb-2">🤖</div>
              <div className="text-sm">No content above threshold yet</div>
              <div className="text-xs mt-1 text-gray-700">
                Posts and comments are scored automatically
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {visibleEntries.map((entry) => (
              <div key={entry.id} className={`px-4 py-3 ${entry.removed ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <ScoreBadge score={entry.score} />
                  <div className="flex-1 min-w-0">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-sm hover:text-orange-400 line-clamp-2 font-medium ${
                        entry.removed ? 'text-gray-500 line-through' : 'text-gray-200'
                      }`}
                    >
                      {entry.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      {entry.removed && entry.removedBy === 'mod' && (
                        <span className="text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">
                          Removed by mod
                        </span>
                      )}
                      {entry.removed && entry.removedBy === 'user' && (
                        <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">
                          Deleted by user
                        </span>
                      )}
                      {entry.removed && !entry.removedBy && (
                        <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded font-medium uppercase tracking-wide">
                          Removed
                        </span>
                      )}
                      {onDossier ? (
                        <button
                          onClick={() => onDossier(entry.author)}
                          className="text-xs text-gray-500 hover:text-orange-400 transition-colors"
                          title="Open user dossier"
                        >
                          u/{entry.author}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">u/{entry.author}</span>
                      )}
                      <span className="text-xs text-gray-600">
                        {entry.type === 'comment' ? 'comment' : 'post'}
                      </span>
                      <span className="text-xs text-gray-600">
                        {new Date(entry.scoredAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onCopilot && (
                      <button
                        onClick={() => onCopilot(entry.id)}
                        title="Get AI recommendation from Mod Copilot"
                        className="text-xs bg-orange-900/60 hover:bg-orange-800/60 border border-orange-500/40 text-orange-300 px-2.5 py-1 rounded-md transition-colors font-medium flex items-center gap-1"
                      >
                        <span className="text-sm">🤖</span>
                        <span>Copilot</span>
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                      className="text-xs text-gray-500 hover:text-gray-300 px-1"
                    >
                      {expanded === entry.id ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {expanded === entry.id && (
                  <div className="mt-2 ml-12 space-y-1">
                    <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                      Heuristics
                    </div>
                    {entry.heuristics.map((h, i) => (
                      <div key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                        <span className="text-orange-500 shrink-0">•</span>
                        {h}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
