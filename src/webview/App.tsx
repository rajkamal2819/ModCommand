import { useState, useEffect } from 'react'
import { useDevvitBridge } from './hooks/useDevvitBridge'
import type { ServerMessage, ModQueueItem, Appeal, SentinelEntry, EditWatchEntry, ModStats, CopilotRecommendation, CopilotChatMessage, DossierState, DossierSummary, ThresholdSuggestion, WorkloadQueueContext, WorkloadModAction } from '../shared/messages'
import TriageBoard from './tabs/TriageBoard'
import AppealDesk from './tabs/AppealDesk'
import AISentinel from './tabs/AISentinel'
import EditWatch from './tabs/EditWatch'
import WorkloadWall from './tabs/WorkloadWall'
import CopilotPanel from './components/CopilotPanel'
import DossierPanel from './components/DossierPanel'

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
  const [workloadQueue, setWorkloadQueue] = useState<WorkloadQueueContext>({ unclaimed: 0, inReview: 0, pendingApproval: 0, doneRecent: 0 })
  const [workloadModActions, setWorkloadModActions] = useState<Record<string, WorkloadModAction[]>>({})
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [isDark, setIsDark] = useState(
    () => localStorage.getItem('mc-theme') !== 'light'
  )

  // Copilot panel state — global, opened by any tab
  const [copilotItemId, setCopilotItemId] = useState<string | null>(null)
  const [copilotRec, setCopilotRec] = useState<CopilotRecommendation | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [copilotChat, setCopilotChat] = useState<CopilotChatMessage[]>([])
  const [copilotChatThinking, setCopilotChatThinking] = useState(false)

  // Dossier panel state — global, opened by clicking any u/X
  const [dossierUser, setDossierUser] = useState<string | null>(null)
  const [dossierData, setDossierData] = useState<DossierState | null>(null)
  const [dossierSummary, setDossierSummary] = useState<DossierSummary | null>(null)
  const [dossierLoading, setDossierLoading] = useState(false)

  // Sentinel adaptive threshold suggestion
  const [thresholdSuggestion, setThresholdSuggestion] = useState<ThresholdSuggestion | null>(null)

  function openCopilot(itemId: string) {
    setCopilotItemId(itemId)
    setCopilotRec(null)
    setCopilotLoading(true)
    setCopilotChat([])
    setCopilotChatThinking(false)
    // Try to restore any existing chat while the fresh recommendation loads.
    send({ type: 'COPILOT_CHAT_LOAD', itemId })
  }
  function closeCopilot() {
    setCopilotItemId(null)
    setCopilotRec(null)
    setCopilotLoading(false)
    setCopilotChat([])
    setCopilotChatThinking(false)
  }
  function openDossier(username: string) {
    if (!username || username === 'unknown' || username === '[deleted]') return
    // If panel is already showing this user, close it (toggle behavior)
    if (dossierUser === username) {
      closeDossier()
      return
    }
    setDossierUser(username)
    setDossierData(null)
    setDossierSummary(null)
    setDossierLoading(true)
    // Also close copilot if open — only one panel at a time
    closeCopilot()
  }
  function closeDossier() {
    setDossierUser(null)
    setDossierData(null)
    setDossierSummary(null)
    setDossierLoading(false)
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('mc-theme', isDark ? 'dark' : 'light')
  }, [isDark])

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
        setThresholdSuggestion(msg.suggestion ?? null)
        setLoading(false)
        break
      case 'EDITWATCH_STATE':
        setEditEntries(msg.entries)
        setLoading(false)
        break
      case 'WORKLOAD_STATE':
        setModStats(msg.mods)
        setWorkloadPeriod(msg.period)
        setWorkloadQueue(msg.queueContext)
        // Reset the drill-down cache when the period changes — entries are period-scoped.
        setWorkloadModActions({})
        setLoading(false)
        break
      case 'WORKLOAD_MOD_ACTIONS_STATE':
        setWorkloadModActions((prev) => ({ ...prev, [msg.mod]: msg.actions }))
        break
      case 'ACTION_SUCCESS':
        showToast(msg.message, 'success')
        break
      case 'ACCESS_DENIED':
        setAccessDenied(true)
        setLoading(false)
        setCopilotLoading(false)
        setDossierLoading(false)
        break
      case 'COPILOT_STATE':
        if (msg.itemId === copilotItemId) {
          setCopilotRec(msg.recommendation)
          setCopilotLoading(false)
        }
        break
      case 'COPILOT_CHAT_STATE':
        if (msg.itemId === copilotItemId) {
          setCopilotChat(msg.messages)
          setCopilotChatThinking(!!msg.thinking)
        }
        break
      case 'DOSSIER_STATE':
        if (msg.username === dossierUser) {
          setDossierData(msg.data)
          setDossierLoading(false)
        }
        break
      case 'DOSSIER_SUMMARY':
        if (msg.username === dossierUser) {
          setDossierSummary(msg.summary)
        }
        break
      case 'ERROR':
        showToast(msg.message, 'error')
        setLoading(false)
        setCopilotLoading(false)
        setDossierLoading(false)
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

  if (accessDenied) {
    return (
      <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <div className="text-lg font-semibold text-gray-200">Moderators Only</div>
          <div className="text-sm text-gray-500">This dashboard is restricted to subreddit moderators.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <span className="font-bold text-orange-500 text-lg tracking-tight">ModCommand</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDark((d) => !d)}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className={`
              relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
              transition-colors duration-200 focus:outline-none
              ${isDark ? 'bg-gray-700' : 'bg-orange-400'}
            `}
          >
            <span
              className={`
                inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow
                transform transition-transform duration-200 text-[9px]
                ${isDark ? 'translate-x-0.5' : 'translate-x-[18px]'}
              `}
            >
              {isDark ? '🌙' : '☀️'}
            </span>
          </button>
          <button
            onClick={() => { setLoading(true); send({ type: 'TRIAGE_REFRESH' }) }}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
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
          <TriageBoard items={triageItems} currentMod={currentMod} send={send} onCopilot={openCopilot} onDossier={openDossier} />
        )}
        {activeTab === 'appeals' && (
          <AppealDesk appeals={appeals} send={send} onDossier={openDossier} />
        )}
        {activeTab === 'sentinel' && (
          <AISentinel entries={sentinelEntries} threshold={sentinelThreshold} send={send} onCopilot={openCopilot} onDossier={openDossier} suggestion={thresholdSuggestion} />
        )}
        {activeTab === 'editwatch' && (
          <EditWatch entries={editEntries} send={send} onCopilot={openCopilot} onDossier={openDossier} />
        )}
        {activeTab === 'workload' && (
          <WorkloadWall
            mods={modStats}
            period={workloadPeriod}
            queueContext={workloadQueue}
            modActions={workloadModActions}
            send={send}
            onDossier={openDossier}
          />
        )}

        <CopilotPanel
          itemId={copilotItemId}
          recommendation={copilotRec}
          loading={copilotLoading}
          chatMessages={copilotChat}
          chatThinking={copilotChatThinking}
          send={send}
          onClose={closeCopilot}
        />
        <DossierPanel
          username={dossierUser}
          data={dossierData}
          summary={dossierSummary}
          loading={dossierLoading}
          send={send}
          onClose={closeDossier}
        />
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
