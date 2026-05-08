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
      // Devvit wraps postMessage in a data envelope
      const raw = event.data?.data ?? event.data
      if (raw && typeof raw === 'object' && 'type' in raw) {
        setLastMessage(raw as ServerMessage)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    // Devvit expects messages wrapped in { type: 'devvit-message', data: { message: ... } }
    window.parent.postMessage(
      { type: 'devvit-message', data: { message: msg } },
      '*'
    )
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
