import type { ModQueueItem } from '../../shared/messages'

interface Props {
  item: ModQueueItem
  currentMod: string
  onClaim: (id: string) => void
  onRelease: (id: string) => void
  onComboAction: (id: string) => void
}

export default function ItemCard({ item, currentMod, onClaim, onRelease, onComboAction }: Props) {
  const isClaimedByMe = item.claimedBy === currentMod
  const isClaimedByOther = item.claimedBy && item.claimedBy !== currentMod
  const ageMinutes = Math.floor((Date.now() - item.reportedAt) / 60000)
  const ageDisplay = ageMinutes < 60 ? `${ageMinutes}m` : `${Math.floor(ageMinutes / 60)}h`

  return (
    <div
      className={`bg-gray-800 rounded-lg p-3 border transition-colors ${
        isClaimedByMe
          ? 'border-orange-500/50'
          : isClaimedByOther
          ? 'border-gray-600 opacity-70'
          : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-gray-100 hover:text-orange-400 line-clamp-2 flex-1"
        >
          {item.title}
        </a>
        <span className="text-xs text-gray-500 shrink-0">{ageDisplay}</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs text-gray-400">u/{item.author}</span>
        <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
          {item.reportReason}
        </span>
        {item.aigcScore !== null && item.aigcScore >= 40 && (
          <AigcBadge score={item.aigcScore} />
        )}
        {item.editEvasionScore && (
          <EvasionBadge score={item.editEvasionScore} />
        )}
      </div>

      {isClaimedByOther ? (
        <div className="text-xs text-gray-500">🔒 Claimed by u/{item.claimedBy}</div>
      ) : isClaimedByMe ? (
        <div className="flex gap-2">
          <button
            onClick={() => onComboAction(item.id)}
            className="flex-1 text-xs bg-orange-600 hover:bg-orange-500 text-white py-1.5 rounded transition-colors font-medium"
          >
            Take Action
          </button>
          <button
            onClick={() => onRelease(item.id)}
            className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded transition-colors"
          >
            Release
          </button>
        </div>
      ) : (
        <button
          onClick={() => onClaim(item.id)}
          className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 py-1.5 rounded transition-colors"
        >
          Claim
        </button>
      )}
    </div>
  )
}

function AigcBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-red-900 text-red-300' :
    score >= 60 ? 'bg-orange-900 text-orange-300' :
    'bg-yellow-900 text-yellow-300'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${color}`}>
      AI {score}%
    </span>
  )
}

function EvasionBadge({ score }: { score: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const color =
    score === 'HIGH' ? 'bg-red-900 text-red-300' :
    score === 'MEDIUM' ? 'bg-orange-900 text-orange-300' :
    'bg-yellow-900 text-yellow-300'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${color}`}>
      Edit {score}
    </span>
  )
}
