import { useState } from 'react'
import type { Appeal, ClientMessage } from '../../shared/messages'
import AppealCard from '../components/AppealCard'

interface Props {
  appeals: Appeal[]
  send: (msg: ClientMessage) => void
  onDossier?: (username: string) => void
}

type Filter = 'pending' | 'accepted' | 'denied'

export default function AppealDesk({ appeals, send, onDossier }: Props) {
  const [filter, setFilter] = useState<Filter>('pending')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = appeals.filter((a) => a.status === filter)
  const selectedAppeal = appeals.find((a) => a.userId === selected)

  const counts = {
    pending: appeals.filter((a) => a.status === 'pending').length,
    accepted: appeals.filter((a) => a.status === 'accepted').length,
    denied: appeals.filter((a) => a.status === 'denied').length,
  }

  return (
    <div className="flex h-full">
      {/* Left panel — inbox */}
      <div className="w-64 border-r border-gray-800 flex flex-col shrink-0">
        {/* Filter tabs */}
        <div className="flex border-b border-gray-800">
          {(['pending', 'accepted', 'denied'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? 'border-b-2 border-orange-500 text-orange-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f} {counts[f] > 0 && <span className="ml-0.5">({counts[f]})</span>}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-xs text-gray-600 text-center py-8">
              No {filter} appeals
            </div>
          ) : (
            filtered.map((appeal) => (
              <button
                key={appeal.userId}
                onClick={() => setSelected(appeal.userId)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-800 transition-colors ${
                  selected === appeal.userId
                    ? 'bg-gray-800'
                    : 'hover:bg-gray-900'
                }`}
              >
                <div className="text-sm text-gray-200 font-medium">u/{appeal.username}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">{appeal.banReason}</div>
                {appeal.aiRiskLevel && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${
                      appeal.aiRiskLevel === 'high'
                        ? 'bg-red-900 text-red-300'
                        : appeal.aiRiskLevel === 'medium'
                        ? 'bg-yellow-900 text-yellow-300'
                        : 'bg-green-900 text-green-300'
                    }`}
                  >
                    {appeal.aiRiskLevel} risk
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedAppeal ? (
          <AppealCard appeal={selectedAppeal} send={send} onDossier={onDossier} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            <div className="text-center">
              <div className="text-3xl mb-2">📬</div>
              <div className="text-sm">Select an appeal to review</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
