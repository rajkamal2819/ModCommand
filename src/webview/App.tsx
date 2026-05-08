import { useState, useEffect } from 'react'
import { useDevvitBridge } from './hooks/useDevvitBridge'
import type { ServerMessage, ModQueueItem, Appeal, SentinelEntry, EditWatchEntry, ModStats } from '../shared/messages'
import TriageBoard from './tabs/TriageBoard'
import AppealDesk from './tabs/AppealDesk'
import AISentinel from './tabs/AISentinel'
import EditWatch from './tabs/EditWatch'
import WorkloadWall from './tabs/WorkloadWall'

type Tab = 'triage' | 'appeals' | 'sentinel' | 'editwatch' | 'workload'

const TABS: { id: Tab; label: string }[] = [
  { id: 'triage', label: 'Triage Board' },
  { id: 'appeals', label: 'AppealDesk' },
  { id: 'sentinel', label: 'AI Sentinel' },
  { id: 'editwatch', label: 'Edit Watch' },
  { id: 'workload', label: 'Workload Wall' },
]

export default function App() {
  const { send, lastMessage } = useDevvitBridge()
  const [activeTab, setActiveTab] = useState<Tab>('triage')

  // Global state managed here, passed down to tabs
  const [triageItems, setTriageItems] = useState<ModQueueItem[]>([])
  const [currentMod, setCurrentMod] = useState('')
  const [appeals, setAppeals] = useState<Appeal[]>([])
  const [sentinelEntries, setSentinelEntries] = useState<SentinelEntry[]>([])
  const [sentinelThreshold, setSentinelThreshold] = useState(70)
  const [editEntries, setEditEntries] = useState<EditWatchEntry[]>([])
  const [modStats, setModStats] = useState<ModStats[]>([])
  const [workloadPeriod, setWorkloadPeriod] = useState<'7d' | '30d'>('7d')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)

  // Handle tab switch — load data lazily
  useEffect(() => {
    switch (activeTab) {
      case 'appeals':
        send({ type: 'APPEAL_LOAD' })
        break
      case 'sentinel':
        send({ type: 'SENTINEL_LOAD' })
        break
      case 'editwatch':
        send({ type: 'EDITWATCH_LOAD' })
        break
      case 'workload':
        send({ type: 'WORKLOAD_LOAD', period: workloadPeriod })
        break
    }
  }, [activeTab]) // eslint-disable-line

  // Handle server messages
  useEffect(() => {
    if (!lastMessage) return

    const msg = lastMessage as ServerMessage
    switch (msg.type) {
      case 'TRIAGE_STATE':
        setTriageItems(msg.items)
        setCurrentMod(msg.currentMod)
        setLoading(false)
        break
      case 'CLAIM_UPDATE':
        setTriageItems((prev) =>
          prev.map((item) =>
            item.id === msg.itemId
              ? { ...item, claimedBy: msg.claimedBy, status: msg.claimedBy ? 'in_review' : 'unclaimed' }
              : item
          )
        )
        break
      case 'APPEAL_STATE':
        setAppeals(msg.appeals)
        setLoading(false)
        break
      case 'SENTINEL_STATE':
        setSentinelEntries(msg.entries)
        setSentinelThreshold(msg.threshold)
        setLoading(false)
        break
      case 'EDITWATCH_STATE':
        setEditEntries(msg.entries)
        setLoading(false)
        break
      case 'WORKLOAD_STATE':
        setModStats(msg.mods)
        setWorkloadPeriod(msg.period)
        setLoading(false)
        break
      case 'ACTION_SUCCESS':
        showToast(msg.message, 'success')
        break
      case 'ERROR':
        showToast(msg.message, 'error')
        setLoading(false)
        break
    }
  }, [lastMessage])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    setLoading(true)
    // Loading will be reset when data arrives or on error
    setTimeout(() => setLoading(false), 10000) // safety timeout
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <span className="font-bold text-orange-500 text-lg tracking-tight">ModCommand</span>
        <button
          onClick={() => { setLoading(true); send({ type: 'TRIAGE_REFRESH' }) }}
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-800 bg-gray-900 overflow-x-auto shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-orange-500 text-orange-400'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-gray-950/60 flex items-center justify-center z-10">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {activeTab === 'triage' && (
          <TriageBoard items={triageItems} currentMod={currentMod} send={send} />
        )}
        {activeTab === 'appeals' && (
          <AppealDesk appeals={appeals} send={send} />
        )}
        {activeTab === 'sentinel' && (
          <AISentinel entries={sentinelEntries} threshold={sentinelThreshold} send={send} />
        )}
        {activeTab === 'editwatch' && (
          <EditWatch entries={editEntries} send={send} />
        )}
        {activeTab === 'workload' && (
          <WorkloadWall mods={modStats} period={workloadPeriod} send={send} />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50 ${
            toast.type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}
