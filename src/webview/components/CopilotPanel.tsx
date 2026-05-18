import { useEffect, useRef, useState } from 'react'
import type { ClientMessage, CopilotRecommendation, ComboAction, CopilotChatMessage } from '../../shared/messages'

interface Props {
  itemId: string | null
  recommendation: CopilotRecommendation | null
  loading: boolean
  chatMessages: CopilotChatMessage[]
  chatThinking: boolean
  send: (msg: ClientMessage) => void
  onClose: () => void
}

const ACTION_STYLES: Record<string, string> = {
  approve: 'bg-green-700 text-white',
  remove: 'bg-red-700 text-white',
  ban: 'bg-red-900 text-white',
  escalate: 'bg-yellow-600 text-white',
}

const ACTION_LABEL: Record<string, string> = {
  approve: 'Approve',
  remove: 'Remove',
  ban: 'Remove + Ban',
  escalate: 'Escalate',
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: 'text-green-400',
  medium: 'text-yellow-400',
  low: 'text-gray-400',
}

const SLASH_COMMANDS: { cmd: string; hint: string }[] = [
  { cmd: '/removal-reason', hint: 'Draft a public removal comment' },
  { cmd: '/modmail', hint: 'Draft a modmail reply to the user' },
  { cmd: '/sticky', hint: 'Draft a sticky comment under the post' },
  { cmd: '/rule-cite', hint: 'Explain which rule pattern applies' },
]

const MIN_WIDTH = 340
const MAX_WIDTH = 820
const DEFAULT_WIDTH = 440
const WIDTH_KEY = 'mc-copilot-width'

export default function CopilotPanel({ itemId, recommendation, loading, chatMessages, chatThinking, send, onClose }: Props) {
  const [timedOut, setTimedOut] = useState(false)
  const [input, setInput] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [verdictCollapsed, setVerdictCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem(WIDTH_KEY) ?? '', 10)
    return !isNaN(stored) && stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH
  })
  const [resizing, setResizing] = useState(false)
  // Optimistic UI: render the user's outgoing message + a typing bubble
  // immediately on send, before the server echoes back. Cleared when the
  // server's COPILOT_CHAT_STATE arrives (recognized by matching the content).
  const [pendingSend, setPendingSend] = useState<{ content: string; ts: number } | null>(null)

  useEffect(() => {
    setTimedOut(false)
    setInput('')
    setShowSlashMenu(false)
    setVerdictCollapsed(false)
    if (itemId && !recommendation && !loading) {
      send({ type: 'COPILOT_RECOMMEND', itemId, force: true })
    }
  }, [itemId]) // eslint-disable-line

  // Resilience: silent retry, visible timeout fallback
  useEffect(() => {
    if (!loading || !itemId) return
    const silentRetry = setTimeout(() => {
      console.log('[CopilotPanel] no response in 1s — silently re-sending')
      send({ type: 'COPILOT_RECOMMEND', itemId, force: true })
    }, 1000)
    const visibleTimeout = setTimeout(() => setTimedOut(true), 60000)
    return () => {
      clearTimeout(silentRetry)
      clearTimeout(visibleTimeout)
    }
  }, [loading, itemId]) // eslint-disable-line

  // Mouse-driven resize from the left edge handle.
  useEffect(() => {
    if (!resizing) return
    function onMove(e: MouseEvent) {
      const vw = window.innerWidth
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, vw - e.clientX))
      setWidth(next)
    }
    function onUp() {
      setResizing(false)
      localStorage.setItem(WIDTH_KEY, String(width))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing, width])

  useEffect(() => {
    if (!resizing) localStorage.setItem(WIDTH_KEY, String(width))
  }, [width, resizing])

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatMessages.length, chatThinking])

  // Clear the optimistic pending bubble once the server echoes it back in the
  // chat history. Matching by content + recency is loose but works since the
  // user can't double-send (button disabled while pending).
  useEffect(() => {
    if (!pendingSend) return
    const echoed = chatMessages.some(
      (m) => m.role === 'user' && m.content === pendingSend.content && m.ts >= pendingSend.ts - 1000
    )
    if (echoed) setPendingSend(null)
  }, [chatMessages, pendingSend])

  // Safety net: clear pendingSend if it sits for >30s with no echo — prevents
  // the input getting stuck disabled if a message somehow drops.
  useEffect(() => {
    if (!pendingSend) return
    const t = setTimeout(() => setPendingSend(null), 30000)
    return () => clearTimeout(t)
  }, [pendingSend])

  function retry() {
    if (!itemId) return
    setTimedOut(false)
    send({ type: 'COPILOT_RECOMMEND', itemId, force: true })
  }

  if (!itemId) return null

  function apply() {
    if (!itemId || !recommendation) return
    if (recommendation.action === 'approve') {
      const combo: ComboAction = { approve: true, remove: false, ban: false, removalReason: '', banReason: '' }
      send({ type: 'COMBO_ACTION', itemId, action: combo })
      send({ type: 'COPILOT_APPLY', itemId })
      onClose()
      return
    }
    const combo: ComboAction = {
      approve: false,
      remove: recommendation.action === 'remove' || recommendation.action === 'ban',
      ban: recommendation.action === 'ban',
      banReason: recommendation.banReason ?? '',
      removalReason: recommendation.draftMessage ?? '',
      banDuration: recommendation.banDuration,
    }
    send({ type: 'COMBO_ACTION', itemId, action: combo })
    send({ type: 'COPILOT_APPLY', itemId })
    onClose()
  }

  function sendChat(content?: string) {
    const payload = (content ?? input).trim()
    if (!payload || !itemId || chatThinking || pendingSend) return
    // Optimistic: paint the user bubble + typing indicator instantly.
    setPendingSend({ content: payload, ts: Date.now() })
    send({ type: 'COPILOT_CHAT_SEND', itemId, content: payload })
    setInput('')
    setShowSlashMenu(false)
  }

  function handleInputChange(value: string) {
    setInput(value)
    setShowSlashMenu(value.startsWith('/') && value.length <= 20)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).catch(() => { /* best-effort */ })
  }

  const applyDisabled = !recommendation || recommendation.confidence === 'low' || recommendation.action === 'escalate' || recommendation.applied

  const latestSuggestions = (() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      const m = chatMessages[i]
      if (m.role === 'assistant' && m.suggestions && m.suggestions.length > 0) return m.suggestions
    }
    if (recommendation) {
      if (recommendation.action === 'approve') return ['What would change your mind?', 'Any signals pointing the other way?', '/modmail']
      if (recommendation.action === 'escalate') return ['What would tip this to remove?', 'What would tip this to approve?', '/rule-cite']
      return ['/removal-reason', "Show me the user's recent pattern", 'Why not escalate instead?']
    }
    return [] as string[]
  })()

  // Show the "what to ask" hint when chat only has the seeded verdict (no user turns yet).
  const noUserTurnsYet = chatMessages.filter((m) => m.role === 'user').length === 0
  const hasChatStarted = chatMessages.length > 0

  return (
    <div
      className="absolute top-2 right-2 bottom-2 bg-gray-900 rounded-2xl border border-gray-800/70 ring-1 ring-orange-500/5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7),_0_8px_20px_-8px_rgba(0,0,0,0.5)] flex flex-col z-20 animate-[slide-in_0.2s_ease-out] overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle — sits on the left edge inside the rounded card */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setResizing(true) }}
        onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
        title="Drag to resize · double-click to reset"
        className={`absolute top-2 left-0 bottom-2 w-1 cursor-col-resize z-30 rounded-r transition-colors ${
          resizing ? 'bg-orange-500' : 'bg-gray-800/60 hover:bg-orange-500/70'
        }`}
        aria-label="Resize panel"
      />

      {/* Header — unified style with Dossier */}
      <div className="flex items-center justify-between h-12 px-4 border-b border-gray-800 bg-gray-950 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-orange-500 text-base">🤖</span>
          <span className="font-semibold text-gray-100 text-sm">Mod Copilot</span>
          {chatMessages.length > 1 && (
            <span className="text-xs text-gray-500 shrink-0">· {chatMessages.length} turns</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-200 text-lg leading-none px-2"
          aria-label="Close Copilot panel"
        >
          ×
        </button>
      </div>

      {/* Item context strip — always visible so the mod knows what they're discussing */}
      {recommendation?.itemContext && !loading && (
        <a
          href={recommendation.itemContext.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-start gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900/60 hover:bg-gray-900 transition-colors shrink-0"
          title={recommendation.itemContext.url ? 'Open on Reddit' : undefined}
        >
          <span className="text-xs mt-0.5">{recommendation.itemContext.type === 'post' ? '📝' : '💬'}</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-200 line-clamp-1 font-medium leading-tight">
              {recommendation.itemContext.title}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              u/{recommendation.itemContext.author}
              {recommendation.itemContext.subName ? ` · r/${recommendation.itemContext.subName}` : ''}
            </div>
          </div>
        </a>
      )}

      {/* Verdict header — collapsible after the conversation gets going */}
      {recommendation && !loading && (
        <div className="px-4 py-2.5 border-b border-gray-800 bg-gray-950/60 shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded ${ACTION_STYLES[recommendation.action] ?? 'bg-gray-700 text-white'}`}>
              {ACTION_LABEL[recommendation.action] ?? recommendation.action}
            </span>
            <span className={`text-xs font-medium ${CONFIDENCE_STYLES[recommendation.confidence]}`}>
              {recommendation.confidence}
            </span>
            {recommendation.applied && (
              <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">applied</span>
            )}
            <button
              onClick={apply}
              disabled={applyDisabled}
              className={`ml-auto text-xs px-2.5 py-1 rounded font-medium transition-colors ${
                applyDisabled
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-500 text-white'
              }`}
            >
              {recommendation.applied ? 'Applied' : 'Apply'}
            </button>
            {chatMessages.length > 2 && (
              <button
                onClick={() => setVerdictCollapsed((c) => !c)}
                aria-label={verdictCollapsed ? 'Show signal details' : 'Hide signal details'}
                className="text-xs text-gray-500 hover:text-gray-300 px-1"
                title={verdictCollapsed ? 'Show signal details' : 'Hide signal details'}
              >
                {verdictCollapsed ? '▾' : '▴'}
              </button>
            )}
          </div>
          {!verdictCollapsed && recommendation.signalsUsed.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {recommendation.signalsUsed.map((s, i) => (
                <span key={i} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded border border-gray-700">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading || !recommendation ? (
          timedOut ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 px-6 text-center">
              <span className="text-3xl">⏱️</span>
              <div className="text-sm">Taking longer than expected.</div>
              <div className="text-xs text-gray-500">Check playtest logs for [Copilot] entries.</div>
              <button
                onClick={retry}
                className="mt-2 bg-orange-600 hover:bg-orange-500 text-white text-xs px-4 py-1.5 rounded transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Analyzing signals…</span>
            </div>
          )
        ) : (
          <>
            {chatMessages.map((m, i) => (
              <ChatBubble key={i} message={m} onCopy={copyToClipboard} />
            ))}
            {/* Optimistic user bubble — paints instantly when the user sends,
                replaced once the server echoes the message back in the chat
                state. Sitting alongside the typing dots gives near-zero
                perceived latency. */}
            {pendingSend && (
              <div className="flex justify-end mc-bubble-enter">
                <div className="max-w-[85%] bg-gray-800 text-gray-100 text-sm rounded-2xl rounded-br-md px-3 py-2 whitespace-pre-wrap opacity-90">
                  {pendingSend.content}
                </div>
              </div>
            )}
            {(chatThinking || pendingSend) && <TypingBubble />}
            {/* Empty-state hint: only when chat has just the seeded verdict */}
            {hasChatStarted && noUserTurnsYet && !chatThinking && (
              <div className="text-[11px] text-gray-500 italic px-1 pt-1 border-t border-gray-800/60">
                Ask why · request a draft · try a slash command
              </div>
            )}
            {latestSuggestions.length > 0 && !chatThinking && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {latestSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendChat(s)}
                    className="text-xs bg-orange-900/40 hover:bg-orange-800/50 border border-orange-500/30 text-orange-300 px-2 py-1 rounded-full transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Slash command menu (typed `/`) */}
      {showSlashMenu && (
        <div className="border-t border-gray-800 bg-gray-950 shrink-0">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-500 font-medium">
            Slash commands
          </div>
          {SLASH_COMMANDS.filter((s) => s.cmd.startsWith(input.toLowerCase())).map((s) => (
            <button
              key={s.cmd}
              onClick={() => { setInput(s.cmd + ' '); setShowSlashMenu(false) }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-900 transition-colors flex items-baseline gap-2"
            >
              <span className="text-xs font-mono text-orange-400">{s.cmd}</span>
              <span className="text-xs text-gray-500">{s.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      {recommendation && !loading && (
        <div className="border-t border-gray-800 p-3 bg-gray-950/40 shrink-0">
          {!input.startsWith('/') && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-500 font-medium mr-0.5">Try</span>
              {SLASH_COMMANDS.map((s) => (
                <button
                  key={s.cmd}
                  onClick={() => { setInput(s.cmd + ' ') }}
                  title={s.hint}
                  className="text-[10px] font-mono bg-orange-900/30 hover:bg-orange-800/50 border border-orange-500/30 text-orange-300 px-1.5 py-0.5 rounded transition-colors"
                >
                  {s.cmd}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a follow-up, or type / for commands…"
              rows={1}
              className="flex-1 bg-gray-900 border border-gray-700 focus:border-orange-500/60 text-sm text-gray-100 placeholder-gray-500 rounded-md px-3 py-2 resize-none focus:outline-none"
              style={{ minHeight: '38px', maxHeight: '120px' }}
              disabled={chatThinking || !!pendingSend}
            />
            <button
              onClick={() => sendChat()}
              disabled={!input.trim() || chatThinking || !!pendingSend}
              className={`text-xs px-3 py-2 rounded-md font-medium transition-colors inline-flex items-center gap-1.5 ${
                !input.trim() || chatThinking || !!pendingSend
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-500 text-white'
              }`}
            >
              {(chatThinking || pendingSend) ? (
                <>
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Sending</span>
                </>
              ) : (
                'Send'
              )}
            </button>
          </div>
          <div className="text-[10px] text-gray-500 mt-1.5 px-0.5">
            Enter to send · Shift+Enter for newline
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────

function TypingBubble() {
  return (
    <div className="flex items-start gap-2 mc-bubble-enter">
      <div className="w-1 self-stretch bg-orange-500/60 rounded-full shrink-0" />
      <div className="bg-gray-900 border border-gray-800 rounded-2xl rounded-bl-md px-3 py-2.5 inline-flex items-center">
        <span className="mc-typing-dot" />
        <span className="mc-typing-dot" />
        <span className="mc-typing-dot" />
      </div>
    </div>
  )
}

function ChatBubble({ message, onCopy }: { message: CopilotChatMessage; onCopy: (text: string) => void }) {
  const isUser = message.role === 'user'
  const isVerdict = message.kind === 'verdict'
  const isDraft = message.kind === 'draft'

  if (isUser) {
    return (
      <div className="flex justify-end mc-bubble-enter">
        <div className="max-w-[85%] bg-gray-800 text-gray-100 text-sm rounded-2xl rounded-br-md px-3 py-2 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant bubble: orange accent bar on the left makes the two-party feel obvious.
  return (
    <div className="flex flex-col items-start mc-bubble-enter">
      {isVerdict && (
        <div className="text-[9px] uppercase tracking-wider text-orange-400 font-bold mb-1 ml-3 flex items-center gap-1">
          <span>🤖</span>
          <span>Initial verdict</span>
        </div>
      )}
      <div className="flex items-stretch gap-2 max-w-[85%]">
        <div className={`w-1 rounded-full shrink-0 ${isDraft ? 'bg-orange-500' : isVerdict ? 'bg-orange-500/80' : 'bg-orange-500/50'}`} />
        <div
          className={`text-sm rounded-2xl rounded-bl-md px-3 py-2 whitespace-pre-wrap ${
            isDraft
              ? 'bg-orange-950/30 border border-orange-500/30 text-orange-100'
              : isVerdict
              ? 'bg-orange-950/15 border border-orange-500/20 text-gray-100'
              : 'bg-gray-900 border border-gray-800 text-gray-200'
          }`}
        >
          {renderMarkdown(message.content)}
          {isDraft && (
            <div className="flex justify-end mt-2 pt-2 border-t border-orange-500/20">
              <button
                onClick={() => onCopy(message.content)}
                className="text-[10px] text-orange-300 hover:text-orange-200 uppercase tracking-wide font-medium"
              >
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Lightweight markdown renderer for chat content. Handles:
// - **bold**
// - `inline code`
// - bullet lists starting with "- " or "* "
// No external deps; minimal regex.
function renderMarkdown(text: string | null | undefined): React.ReactNode {
  if (typeof text !== 'string' || text.length === 0) return null
  const lines = text.split('\n')
  // Group consecutive bullet lines into a single <ul>; pass everything else
  // through as paragraphs.
  const blocks: React.ReactNode[] = []
  let bulletBuffer: string[] = []

  function flushBullets() {
    if (bulletBuffer.length === 0) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc list-inside space-y-0.5 my-1">
        {bulletBuffer.map((b, i) => (
          <li key={i} className="leading-snug">{renderInline(b)}</li>
        ))}
      </ul>
    )
    bulletBuffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^\s*[-*]\s+(.+)$/)
    if (m) {
      bulletBuffer.push(m[1])
    } else {
      flushBullets()
      // Preserve blank lines as a tiny vertical gap.
      if (line.trim() === '') {
        blocks.push(<div key={`gap-${i}`} className="h-1" />)
      } else {
        blocks.push(<div key={`p-${i}`}>{renderInline(line)}</div>)
      }
    }
  }
  flushBullets()
  return blocks
}

function renderInline(text: string): React.ReactNode {
  // Tokenize on **bold** and `code`; everything else is plain text.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} className="font-semibold text-gray-100">{p.slice(2, -2)}</strong>
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return (
        <code key={i} className="font-mono text-[12px] bg-gray-800 text-orange-300 px-1 py-0.5 rounded">
          {p.slice(1, -1)}
        </code>
      )
    }
    return <span key={i}>{p}</span>
  })
}
