import { useState } from 'react'
import type { ModQueueItem, ClientMessage, ComboAction } from '../../shared/messages'
import ItemCard from '../components/ItemCard'

interface Props {
  items: ModQueueItem[]
  currentMod: string
  send: (msg: ClientMessage) => void
  onCopilot?: (id: string) => void
  onDossier?: (username: string) => void
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
  type Decision = 'remove' | 'approve'
  const [decision, setDecision] = useState<Decision>('remove')
  const [ban, setBan] = useState(false)
  const [removalReason, setRemovalReason] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState<string>('')

  const isApprove = decision === 'approve'

  function submit() {
    if (isApprove) {
      onSubmit({
        approve: true,
        remove: false,
        ban: false,
        removalReason: '',
        banReason: '',
      })
    } else {
      onSubmit({
        approve: false,
        remove: true,
        ban,
        removalReason,
        banReason,
        banDuration: banDuration ? parseInt(banDuration, 10) : undefined,
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 w-full max-w-md">
        <h3 className="text-gray-100 font-semibold mb-4">Take Action</h3>

        {/* Decision radio: Approve OR Remove (+ optional ban) */}
        <div className="space-y-2 mb-4">
          <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-700/50">
            <input
              type="radio"
              name="decision"
              checked={isApprove}
              onChange={() => setDecision('approve')}
              className="w-4 h-4 mt-0.5 accent-green-500"
            />
            <div>
              <div className="text-sm text-gray-200 font-medium">Approve (mark innocent)</div>
              <div className="text-xs text-gray-500">Clears reports, keeps post visible.</div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-700/50">
            <input
              type="radio"
              name="decision"
              checked={!isApprove}
              onChange={() => setDecision('remove')}
              className="w-4 h-4 mt-0.5 accent-orange-500"
            />
            <div>
              <div className="text-sm text-gray-200 font-medium">Remove post/comment</div>
              <div className="text-xs text-gray-500">Takes the content down; optionally ban the author.</div>
            </div>
          </label>
        </div>

        {/* Remove-only options */}
        {!isApprove && (
          <>
            <label className="flex items-center gap-3 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ban}
                onChange={(e) => setBan(e.target.checked)}
                className="w-4 h-4 accent-orange-500"
              />
              <span className="text-sm text-gray-300">Also ban user</span>
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
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={submit}
            className={`flex-1 text-white text-sm py-2 rounded-lg font-medium transition-colors ${
              isApprove
                ? 'bg-green-700 hover:bg-green-600'
                : 'bg-orange-600 hover:bg-orange-500'
            }`}
          >
            {isApprove ? 'Approve' : 'Execute'}
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

function PendingCard({
  item,
  currentMod,
  send,
  onDossier,
}: {
  item: ModQueueItem
  currentMod: string
  send: (msg: ClientMessage) => void
  onDossier?: (username: string) => void
}) {
  const isInitiator = item.pendingInitiator === currentMod
  const action = item.pendingAction
  const summary = action
    ? action.approve
      ? 'Approve'
      : action.ban && (!action.banDuration || action.banDuration === 0)
      ? '⚠ Permanent ban + remove'
      : action.ban
      ? `Ban (${action.banDuration}d) + remove`
      : 'Remove'
    : 'Pending action'

  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-yellow-700/60">
      <div className="flex items-start justify-between gap-2 mb-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-gray-100 hover:text-orange-400 line-clamp-2 flex-1"
        >
          {item.title}
        </a>
      </div>

      <div className="text-xs text-gray-400 mb-2">
        {onDossier ? (
          <button onClick={() => onDossier(item.author)} className="hover:text-orange-400 transition-colors">u/{item.author}</button>
        ) : (
          <>u/{item.author}</>
        )}
      </div>

      <div className="bg-yellow-900/30 border border-yellow-700/50 rounded px-2 py-1.5 mb-2">
        <div className="text-xs text-yellow-300 font-medium">{summary}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Proposed by{' '}
          {onDossier && item.pendingInitiator ? (
            <button onClick={() => onDossier(item.pendingInitiator!)} className="hover:text-orange-400 transition-colors">u/{item.pendingInitiator}</button>
          ) : (
            <>u/{item.pendingInitiator}</>
          )}
        </div>
        {action?.banReason && (
          <div className="text-xs text-gray-400 mt-1 italic">"{action.banReason}"</div>
        )}
      </div>

      {isInitiator ? (
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500 italic">
            Awaiting confirmation from another moderator
          </div>
          <button
            onClick={() => send({ type: 'PENDING_REJECT', itemId: item.id })}
            className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded transition-colors"
          >
            Cancel my request
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => send({ type: 'PENDING_CONFIRM', itemId: item.id })}
            className="flex-1 text-xs bg-green-700 hover:bg-green-600 text-white py-1.5 rounded font-medium transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={() => send({ type: 'PENDING_REJECT', itemId: item.id })}
            className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

function DoneCard({ item, onDossier }: { item: ModQueueItem; onDossier?: (username: string) => void }) {
  const action = item.doneAction
  const summary = action
    ? action.approve
      ? '✓ Approved'
      : action.ban && (!action.banDuration || action.banDuration === 0)
      ? '⊘ Removed + perma-banned'
      : action.ban
      ? `⊘ Removed + banned ${action.banDuration}d`
      : '⊘ Removed'
    : 'Actioned'
  const ageMin = item.doneAt ? Math.floor((Date.now() - item.doneAt) / 60000) : 0
  return (
    <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700 opacity-90">
      <div className="text-sm text-gray-300 line-clamp-2 mb-1.5">{item.title}</div>
      <div className="text-xs text-gray-500 mb-2">
        {onDossier ? (
          <button onClick={() => onDossier(item.author)} className="hover:text-orange-400 transition-colors">u/{item.author}</button>
        ) : (
          <>u/{item.author}</>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className={action?.approve ? 'text-green-400' : 'text-red-400'}>{summary}</span>
        <span className="text-gray-600">
          {onDossier && item.doneBy ? (
            <button onClick={() => onDossier(item.doneBy!)} className="hover:text-orange-400 transition-colors">u/{item.doneBy}</button>
          ) : (
            <>u/{item.doneBy}</>
          )}
          {' · '}{ageMin}m ago
        </span>
      </div>
    </div>
  )
}

export default function TriageBoard({ items, currentMod, send, onCopilot, onDossier }: Props) {
  const [comboTarget, setComboTarget] = useState<string | null>(null)

  const grouped: Record<Column, ModQueueItem[]> = {
    unclaimed: items.filter((i) => i.status === 'unclaimed'),
    in_review: items.filter((i) => i.status === 'in_review'),
    action_pending: items.filter((i) => i.status === 'action_pending'),
    done: items.filter((i) => i.status === 'done'),
  }

  function renderCard(item: ModQueueItem) {
    if (item.status === 'action_pending') {
      return <PendingCard key={item.id} item={item} currentMod={currentMod} send={send} onDossier={onDossier} />
    }
    if (item.status === 'done') {
      return <DoneCard key={item.id} item={item} onDossier={onDossier} />
    }
    return (
      <ItemCard
        key={item.id}
        item={item}
        currentMod={currentMod}
        onClaim={(id) => send({ type: 'CLAIM', itemId: id })}
        onRelease={(id) => send({ type: 'RELEASE', itemId: id })}
        onComboAction={(id) => setComboTarget(id)}
        onCopilot={onCopilot}
        onDossier={onDossier}
      />
    )
  }

  // Per-column empty placeholder: a short tip about what lives there so empty
  // columns still feel intentional rather than broken.
  const EMPTY_HINT: Record<Column, string> = {
    unclaimed: 'Reported items will appear here',
    in_review: 'Items you or other mods claim show here',
    action_pending: 'Permanent bans awaiting second-mod confirmation',
    done: 'Recent actions (last hour) appear here',
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
                <div className="flex items-center justify-center h-full border border-dashed border-gray-800 rounded-lg p-4 text-center">
                  <div className="text-xs text-gray-600 leading-relaxed">{EMPTY_HINT[col.id]}</div>
                </div>
              ) : (
                grouped[col.id].map(renderCard)
              )}
            </div>
          </div>
        ))}
      </div>

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
