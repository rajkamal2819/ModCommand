import { useState } from 'react'
import type { SentinelEntry, ClientMessage } from '../../shared/messages'

interface Props {
  entries: SentinelEntry[]
  threshold: number
  send: (msg: ClientMessage) => void
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

export default function AISentinel({ entries, threshold, send }: Props) {
  const [localThreshold, setLocalThreshold] = useState(threshold)
  const [expanded, setExpanded] = useState<string | null>(null)

  function applyThreshold(val: number) {
    setLocalThreshold(val)
    send({ type: 'SENTINEL_THRESHOLD_UPDATE', threshold: val })
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
          {entries.length} flagged
        </span>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
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
            {entries.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <ScoreBadge score={entry.score} />
                  <div className="flex-1 min-w-0">
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-gray-200 hover:text-orange-400 line-clamp-2 font-medium"
                    >
                      {entry.title}
                    </a>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">u/{entry.author}</span>
                      <span className="text-xs text-gray-600">
                        {entry.type === 'comment' ? 'comment' : 'post'}
                      </span>
                      <span className="text-xs text-gray-600">
                        {new Date(entry.scoredAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
                  >
                    {expanded === entry.id ? '▲' : '▼'}
                  </button>
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
