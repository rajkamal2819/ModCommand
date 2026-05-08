import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import type { ModStats } from '../../shared/messages'

interface BarProps {
  mods: ModStats[]
  period: '7d' | '30d'
}

const ACTION_COLORS: Record<string, string> = {
  removal: '#ef4444',
  approval: '#22c55e',
  ban: '#f97316',
  modmail_reply: '#3b82f6',
  mod_note: '#a855f7',
}

export function WorkloadBarChart({ mods, period }: BarProps) {
  const data = mods.map((m) => ({
    name: m.username.length > 10 ? m.username.slice(0, 10) + '…' : m.username,
    ...m.counts,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#f3f4f6' }}
          itemStyle={{ color: '#d1d5db' }}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
        <Bar dataKey="removal" stackId="a" fill={ACTION_COLORS.removal} name="Removals" />
        <Bar dataKey="approval" stackId="a" fill={ACTION_COLORS.approval} name="Approvals" />
        <Bar dataKey="ban" stackId="a" fill={ACTION_COLORS.ban} name="Bans" />
        <Bar dataKey="modmail_reply" stackId="a" fill={ACTION_COLORS.modmail_reply} name="Modmail" />
        <Bar dataKey="mod_note" stackId="a" fill={ACTION_COLORS.mod_note} name="Notes" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface PieProps {
  mods: ModStats[]
  period: '7d' | '30d'
}

const PIE_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#eab308', '#06b6d4']

export function FairnessGauge({ mods, period }: PieProps) {
  const total = mods.reduce(
    (sum, m) => sum + (period === '7d' ? m.last7Days : m.last30Days),
    0
  )

  const data = mods
    .map((m) => ({
      name: m.username,
      value: period === '7d' ? m.last7Days : m.last30Days,
      pct: total > 0 ? Math.round(((period === '7d' ? m.last7Days : m.last30Days) / total) * 100) : 0,
    }))
    .filter((d) => d.value > 0)

  if (data.length === 0) {
    return <div className="text-center text-gray-500 text-sm py-8">No data yet</div>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, pct }) => `${name} ${pct}%`}
          labelLine={false}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          formatter={(value: number, name: string) => [`${value} actions`, name]}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
