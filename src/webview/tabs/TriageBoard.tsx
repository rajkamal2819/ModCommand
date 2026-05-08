import { useState } from 'react'
import type { ModQueueItem, ClientMessage, ComboAction } from '../../shared/messages'
import ItemCard from '../components/ItemCard'

interface Props {
  items: ModQueueItem[]
  currentMod: string
  send: (msg: ClientMessage) => void
}

type Column = 'unclaimed' | 'in_review' | 'action_pending' | 'done'

const COLUMNS: { id: Column; label: string }[] = [
  { id: 'unclaimed', label: 'Unclaimed' },
  { id: 'in_review', label: 'In Review' },
  { id: 'action_pending', label: 'Action Pending' },
  { id: 'done', label: 'Done' },
]

interface ComboModalProps {
  itemId: string
  onSubmit: (action: ComboAction) => void
  onClose: () => void
}

function ComboModal({ itemId, onSubmit, onClose }: ComboModalProps) {
  const [remove, setRemove] = useState(true)
  const [ban, setBan] = useState(false)
  const [removalReason, setRemovalReason] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState<string>('')

  function submit() {
    onSubmit({
      remove,
      ban,
      removalReason,
      banReason,
      banDuration: banDuration ? parseInt(banDuration, 10) : undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 w-full max-w-md">
        <h3 className="text-gray-100 font-semibold mb-4">Take Action</h3>

        <label className="flex items-center gap-3 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={remove}
            onChange={(e) => setRemove(e.target.checked)}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-sm text-gray-300">Remove post/comment</span>
        </label>

        <label className="flex items-center gap-3 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ban}
            onChange={(e) => setBan(e.target.checked)}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-sm text-gray-300">Ban user</span>
        </label>

        {ban && (
          <div className="pl-7 space-y-2 mb-3">
            <input
              type="text"
              placeholder="Ban reason"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="w-full bg-gray-700 text-gray-200 text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500"
            />
            <input
              type="number"
              placeholder="Duration in days (leave blank for permanent)"
              value={banDuration}
              onChange={(e) => setBanDuration(e.target.value)}
              className="w-full bg-gray-700 text-gray-200 text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-orange-500"
            />
          </div>
        )}

        <textarea
          placeholder="Removal reason / mod note (optional)"
          value={removalReason}
          onChange={(e) => setRemovalReason(e.target.value)}
          rows={2}
          className="w-full bg-gray-700 text-gray-200 text-sm rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-orange-500 mb-4 resize-none"
        />

        <div className="flex gap-2">
          <button
            onClick={submit}
            className="flex-1 bg-orange-600 hover:bg-orange-500 text-white text-sm py-2 rounded-lg font-medium transition-colors"
          >
            Execute
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TriageBoard({ items, currentMod, send }: Props) {
  const [comboTarget, setComboTarget] = useState<string | null>(null)

  const grouped: Record<Column, ModQueueItem[]> = {
    unclaimed: items.filter((i) => i.status === 'unclaimed'),
    in_review: items.filter((i) => i.status === 'in_review'),
    action_pending: items.filter((i) => i.status === 'action_pending'),
    done: items.filter((i) => i.status === 'done'),
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 grid grid-cols-4 gap-3 p-3 overflow-hidden min-h-0">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {col.label}
              </span>
              <span className="text-xs bg-gray-700 text-gray-400 rounded-full px-2 py-0.5">
                {grouped[col.id].length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {grouped[col.id].length === 0 ? (
                <div className="text-xs text-gray-600 text-center py-6">Empty</div>
              ) : (
                grouped[col.id].map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    currentMod={currentMod}
                    onClaim={(id) => send({ type: 'CLAIM', itemId: id })}
                    onRelease={(id) => send({ type: 'RELEASE', itemId: id })}
                    onComboAction={(id) => setComboTarget(id)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {items.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-600">
          <div className="text-center">
            <div className="text-4xl mb-2">✅</div>
            <div className="text-sm">Mod queue is empty</div>
          </div>
        </div>
      )}

      {comboTarget && (
        <ComboModal
          itemId={comboTarget}
          onSubmit={(action) => send({ type: 'COMBO_ACTION', itemId: comboTarget, action })}
          onClose={() => setComboTarget(null)}
        />
      )}
    </div>
  )
}
