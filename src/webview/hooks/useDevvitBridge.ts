import { useEffect, useRef, useState, useCallback } from 'react'
import type { ClientMessage, ServerMessage } from '../../shared/messages'

interface Bridge {
  send: (msg: ClientMessage) => void
  lastMessage: ServerMessage | null
}

export function useDevvitBridge(): Bridge {
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null)
  const ready = useRef(false)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Devvit shell wraps server-sent messages as { type: 'devvit-message', data: { message: <payload> } }
      if (event.data?.type !== 'devvit-message') return
      const msg = event.data?.data?.message
      if (msg && typeof msg === 'object' && 'type' in msg) {
        setLastMessage(msg as ServerMessage)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    // Webview -> server: send the raw message; the Reddit shell adds the proto envelope.
    window.parent.postMessage(msg, '*')
  }, [])

  // Signal ready to parent on mount
  useEffect(() => {
    if (!ready.current) {
      ready.current = true
      send({ type: 'INIT' })
    }
  }, [send])

  return { send, lastMessage }
}
