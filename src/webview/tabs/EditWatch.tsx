import { useState } from 'react'
import type { EditWatchEntry, ClientMessage } from '../../shared/messages'
import DiffViewer from '../components/DiffViewer'

interface Props {
  entries: EditWatchEntry[]
  send: (msg: ClientMessage) => void
}

const SCORE_STYLES = {
  HIGH: 'bg-red-600 text-white',
  MEDIUM: 'bg-orange-500 text-white',
  LOW: 'bg-yellow-500 text-gray-900',
}

export default function EditWatch({ entries, send }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  const flagged = entries.filter((e) => e.status === 'flagged')
  const resolved = entries.filter((e) => e.status !== 'flagged')

  function action(itemId: string, act: 'restore_remove' | 'innocent' | 'ignore') {
    send({ type: 'EDITWATCH_ACTION', itemId, action: act })
  }

  function renderEntry(entry: EditWatchEntry) {
    const isOpen = expanded === entry.itemId
    return (
      <div
        key={entry.itemId}
        className="border-b border-gray-800"
      >
        {/* Summary row */}
        <button
          className="w-full text-left px-4 py-3 hover:bg-gray-900/50 transition-colors"
          onClick={() => setExpanded(isOpen ? null : entry.itemId)}
        >
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${SCORE_STYLES[entry.score]}`}>
              {entry.score}
            </span>
            <span className="text-sm text-gray-200 flex-1 text-left line-clamp-1">
              {entry.title}
            </span>
            <span className="text-xs text-gray-600 shrink-0">
              edited {entry.deltaMinutes}m after report
            </span>
            <span className="text-xs text-gray-600">{isOpen ? '▲' : '▼'}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 ml-12">
            <span className="text-xs text-gray-500">u/{entry.author}</span>
            <span className="text-xs text-gray-600">{entry.type}</span>
            {entry.status !== 'flagged' && (
              <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
                {entry.status}
              </span>
            )}
          </div>
        </button>

        {/* Expanded diff */}
        {isOpen && (
          <div className="px-4 pb-4 space-y-3">
            <div className="text-xs text-gray-500 flex gap-4">
              <span>Reported: {new Date(entry.reportedAt).toLocaleString()}</span>
              <span>Edited: {new Date(entry.editedAt).toLocaleString()}</span>
            </div>

            <DiffViewer
              chunks={entry.diffChunks}
              original={entry.original}
              edited={entry.edited}
            />

            {entry.status === 'flagged' && (
              <div className="flex gap-2">
                <button
                  onClick={() => action(entry.itemId, 'restore_remove')}
                  className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs py-2 rounded-lg font-medium transition-colors"
                >
                  Remove Post
                </button>
                <button
                  onClick={() => action(entry.itemId, 'innocent')}
                  className="flex-1 bg-green-800 hover:bg-green-700 text-white text-xs py-2 rounded-lg transition-colors"
                >
                  Mark Innocent
                </button>
                <button
                  onClick={() => action(entry.itemId, 'ignore')}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-2 rounded-lg transition-colors"
                >
                  Ignore
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {entries.length === 0 ? (
        <div className="flex items-center justify-center h-full text-gray-600">
          <div className="text-center">
            <div className="text-3xl mb-2">👀</div>
            <div className="text-sm">No edit evasion detected</div>
            <div className="text-xs mt-1 text-gray-700">
              Edits made after reports will appear here
            </div>
          </div>
        </div>
      ) : (
        <>
          {flagged.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide font-medium bg-gray-900">
                Flagged ({flagged.length})
              </div>
              {flagged.map(renderEntry)}
            </div>
          )}
          {resolved.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide font-medium bg-gray-900">
                Resolved ({resolved.length})
              </div>
              {resolved.map(renderEntry)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
