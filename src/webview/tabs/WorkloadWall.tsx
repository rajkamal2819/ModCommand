import type { ModStats, ClientMessage } from '../../shared/messages'
import { WorkloadBarChart, FairnessGauge } from '../components/StatChart'

interface Props {
  mods: ModStats[]
  period: '7d' | '30d'
  send: (msg: ClientMessage) => void
}

export default function WorkloadWall({ mods, period, send }: Props) {
  function setPeriod(p: '7d' | '30d') {
    send({ type: 'WORKLOAD_LOAD', period: p })
  }

  const totalActions = mods.reduce(
    (sum, m) => sum + (period === '7d' ? m.last7Days : m.last30Days),
    0
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Period toggle */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-200">Team Workload</div>
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => setPeriod('7d')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              period === '7d' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            7 days
          </button>
          <button
            onClick={() => setPeriod('30d')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              period === '30d' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            30 days
          </button>
        </div>
      </div>

      {mods.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-gray-600">
          <div className="text-center">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-sm">No mod activity tracked yet</div>
          </div>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total Actions" value={totalActions.toString()} />
            <StatCard label="Active Mods" value={mods.filter((m) => period === '7d' ? m.last7Days > 0 : m.last30Days > 0).length.toString()} />
            <StatCard
              label="Avg per Mod"
              value={mods.length > 0 ? Math.round(totalActions / mods.length).toString() : '0'}
            />
          </div>

          {/* Bar chart */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
              Actions per Moderator
            </div>
            <WorkloadBarChart mods={mods} period={period} />
          </div>

          {/* Fairness gauge */}
          <div className="bg-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">
              Workload Distribution
            </div>
            <FairnessGauge mods={mods} period={period} />
          </div>

          {/* Per-mod table */}
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-xs text-gray-500 font-medium px-4 py-2 uppercase tracking-wide">
                    Moderator
                  </th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2 uppercase tracking-wide">
                    Period
                  </th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2 uppercase tracking-wide">
                    Removals
                  </th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2 uppercase tracking-wide">
                    Bans
                  </th>
                  <th className="text-right text-xs text-gray-500 font-medium px-4 py-2 uppercase tracking-wide">
                    Last Active
                  </th>
                </tr>
              </thead>
              <tbody>
                {mods.map((mod, i) => (
                  <tr key={mod.username} className={i < mods.length - 1 ? 'border-b border-gray-700/50' : ''}>
                    <td className="px-4 py-2 text-gray-200">u/{mod.username}</td>
                    <td className="px-4 py-2 text-right text-gray-300 font-mono">
                      {period === '7d' ? mod.last7Days : mod.last30Days}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400 text-xs font-mono">
                      {mod.counts.removal}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-400 text-xs font-mono">
                      {mod.counts.ban}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500">
                      {mod.lastActive > 0
                        ? new Date(mod.lastActive).toLocaleDateString()
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-3 text-center">
      <div className="text-2xl font-bold text-gray-100">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}
