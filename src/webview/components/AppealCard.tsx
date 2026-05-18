import type { Appeal } from '../../shared/messages'
import type { ClientMessage } from '../../shared/messages'

interface Props {
  appeal: Appeal
  send: (msg: ClientMessage) => void
  onDossier?: (username: string) => void
}

const RISK_COLORS = {
  low: 'bg-green-900 text-green-300',
  medium: 'bg-yellow-900 text-yellow-300',
  high: 'bg-red-900 text-red-300',
}

export default function AppealCard({ appeal, send, onDossier }: Props) {
  const accountAgeDisplay =
    appeal.accountAge < 30
      ? `${appeal.accountAge}d old`
      : appeal.accountAge < 365
      ? `${Math.floor(appeal.accountAge / 30)}mo old`
      : `${Math.floor(appeal.accountAge / 365)}y old`

  function resolve(action: 'unban' | 'deny' | 'temp_ban', duration?: number) {
    send({ type: 'APPEAL_RESOLVE', userId: appeal.userId, action, duration })
  }

  return (
    <div className="space-y-4">
      {/* User snapshot */}
      <div className="flex items-center gap-4 bg-gray-800 rounded-lg p-3">
        <div>
          {onDossier ? (
            <button
              onClick={() => onDossier(appeal.username)}
              className="font-medium text-gray-100 hover:text-orange-400 transition-colors"
              title="Open user dossier"
            >
              u/{appeal.username}
            </button>
          ) : (
            <div className="font-medium text-gray-100">u/{appeal.username}</div>
          )}
          <div className="text-xs text-gray-400 mt-0.5">
            {accountAgeDisplay} · {appeal.karma.toLocaleString()} karma
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-gray-500">Ban reason</div>
          <div className="text-sm text-gray-300">{appeal.banReason}</div>
        </div>
      </div>

      {/* Form answers */}
      <div className="bg-gray-800 rounded-lg p-3 space-y-2">
        <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
          Appeal Answers
        </div>
        <div>
          <div className="text-xs text-gray-500">Which rule did you break?</div>
          <div className="text-sm text-gray-200">{appeal.formAnswers.whichRule || '—'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">What will you do differently?</div>
          <div className="text-sm text-gray-200">{appeal.formAnswers.whatDifferently || '—'}</div>
        </div>
        <div className="text-xs text-gray-500">
          Rules acknowledged:{' '}
          <span className={appeal.formAnswers.acknowledged ? 'text-green-400' : 'text-red-400'}>
            {appeal.formAnswers.acknowledged ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      {/* AI summary */}
      {appeal.aiSummary && (
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
              AI Risk Assessment
            </div>
            {appeal.aiRiskLevel && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  RISK_COLORS[appeal.aiRiskLevel]
                }`}
              >
                {appeal.aiRiskLevel.toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-300">{appeal.aiSummary}</p>
          {appeal.aiRiskReason && (
            <p className="text-xs text-gray-500 mt-1">{appeal.aiRiskReason}</p>
          )}
        </div>
      )}

      {/* Actions */}
      {appeal.status === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => resolve('unban')}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white text-sm py-2 rounded-lg font-medium transition-colors"
          >
            Accept Unban
          </button>
          <button
            onClick={() => resolve('temp_ban', 30)}
            className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white text-sm py-2 rounded-lg font-medium transition-colors"
          >
            30-Day Ban
          </button>
          <button
            onClick={() => resolve('deny')}
            className="flex-1 bg-red-800 hover:bg-red-700 text-white text-sm py-2 rounded-lg font-medium transition-colors"
          >
            Deny
          </button>
        </div>
      )}

      {appeal.status !== 'pending' && (
        <div
          className={`text-center text-sm py-2 rounded-lg font-medium ${
            appeal.status === 'accepted'
              ? 'bg-green-900 text-green-300'
              : 'bg-red-900 text-red-300'
          }`}
        >
          {appeal.status === 'accepted' ? 'Accepted' : 'Denied'}
        </div>
      )}
    </div>
  )
}
