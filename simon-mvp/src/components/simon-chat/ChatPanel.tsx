import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage as ChatMessageType, ChatApiResponse } from './chat-types'
import type { UnidadAlquiler } from '@/lib/supabase'
import ChatMessage from './ChatMessage'
import ChatQuickReplies from './ChatQuickReplies'
import ChatTypingIndicator from './ChatTypingIndicator'
import { WELCOME_MESSAGE } from './chat-constants'
import { getSessionId, generateMsgId, trackChatEvent, parseSearchIntent } from './chat-utils'
import { colors, spacing } from '@/lib/simon-design-tokens'

interface Props {
  properties: UnidadAlquiler[]
  onClose: () => void
  onOpenDetail?: (id: number) => void
}

const STORAGE_KEY = 'simon_chat_messages'
const STORAGE_STRIKES = 'simon_chat_strikes'

function loadMessages(): ChatMessageType[] {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {}
  return [{
    id: generateMsgId(),
    role: 'assistant',
    text: WELCOME_MESSAGE.text,
    quick_replies: WELCOME_MESSAGE.quick_replies,
    timestamp: Date.now(),
  }]
}

function loadStrikes(): number {
  try {
    return parseInt(sessionStorage.getItem(STORAGE_STRIKES) || '0', 10)
  } catch { return 0 }
}

export default function ChatPanel({ properties, onClose, onOpenDetail }: Props) {
  const [messages, setMessages] = useState<ChatMessageType[]>(loadMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [blocked, setBlocked] = useState(() => loadStrikes() >= 3)
  const strikeCount = useRef(loadStrikes())
  const MAX_STRIKES = 3
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Persist messages to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch {}
  }, [messages])

  // Back button closes chat instead of navigating away (mobile)
  useEffect(() => {
    history.pushState({ simonChat: true }, '')
    const onPop = (e: PopStateEvent) => {
      if (e.state?.simonChat) return // ignore our own push
      onClose()
      history.pushState({ simonChat: true }, '') // re-push so back works again
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onClose])

  // iOS keyboard: scroll input into view when focused
  useEffect(() => {
    const vv = (window as any).visualViewport
    if (!vv) return
    const onResize = () => {
      inputRef.current?.scrollIntoView({ block: 'nearest' })
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  // Auto-scroll on new message (skip initial welcome)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading || blocked) return

    // Add user message
    const userMsg: ChatMessageType = {
      id: generateMsgId(),
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    trackChatEvent('chat_message', { message_length: trimmed.length })
    const searchIntent = parseSearchIntent(trimmed)
    if (searchIntent) trackChatEvent('chat_search', searchIntent)

    try {
      // Build history (last 10 turns, text only)
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.text }))

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)

      const res = await fetch('/api/chat-alquileres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          session_id: getSessionId(),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data: ChatApiResponse = await res.json()

      const botMsg: ChatMessageType = {
        id: generateMsgId(),
        role: 'assistant',
        text: data.response.text,
        property_ids: data.response.property_ids,
        action: data.response.action,
        whatsapp_context: data.response.whatsapp_context,
        quick_replies: data.response.quick_replies,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, botMsg])

      // Check abuse warning — 3 strikes and blocked
      if (data.response.abuse_warning) {
        strikeCount.current++
        try { sessionStorage.setItem(STORAGE_STRIKES, String(strikeCount.current)) } catch {}
        if (strikeCount.current >= MAX_STRIKES) {
          setBlocked(true)
          const blockMsg: ChatMessageType = {
            id: generateMsgId(),
            role: 'assistant',
            text: 'El chat fue desactivado. Si necesitás buscar alquiler, usá los filtros de la página.',
            timestamp: Date.now(),
          }
          setMessages(prev => [...prev, blockMsg])
        }
      }

      // Handle WhatsApp action + register lead
      if (data.response.action === 'open_whatsapp' && data.response.whatsapp_context) {
        const { property_id, broker_phone, message } = data.response.whatsapp_context
        const phone = broker_phone.replace(/[^0-9]/g, '')
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
        window.open(waUrl, '_blank')

        // Fire-and-forget lead registration
        const prop = properties.find(p => p.id === property_id)
        if (prop) {
          fetch('/api/lead-alquiler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body: JSON.stringify({
              phone: broker_phone,
              msg: message,
              prop_id: prop.id,
              nombre: prop.nombre_edificio || prop.nombre_proyecto || '',
              zona: prop.zona,
              precio: prop.precio_mensual_bob,
              dorms: prop.dormitorios,
              broker_nombre: prop.agente_nombre || '',
              fuente: 'chat-bot',
              sid: getSessionId(),
            }),
          }).catch(() => {}) // fire-and-forget
          trackChatEvent('chat_lead', { property_id: prop.id, zona: prop.zona, fuente: 'chat-bot' })
        }
      }

    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError'
      const errorMsg: ChatMessageType = {
        id: generateMsgId(),
        role: 'assistant',
        text: isTimeout
          ? 'La respuesta tardó demasiado. Intentá de nuevo o usá los filtros de la página.'
          : 'No pude procesar tu mensaje. Intentá de nuevo.',
        quick_replies: ['Intentar de nuevo', 'Ver todas las opciones'],
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }, [loading, messages])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  // Get quick replies from last bot message
  const lastBotMsg = [...messages].reverse().find(m => m.role === 'assistant')
  const quickReplies = lastBotMsg?.quick_replies || []

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: colors.arena,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        borderBottom: `1px solid ${colors.arenaMid}`,
        background: colors.blanco,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: colors.salvia, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14, fontWeight: 600,
          }}>S</div>
          <div>
            <div style={{ fontFamily: "'Figtree', sans-serif", fontSize: 15, fontWeight: 500, color: colors.negro }}>
              Simón
            </div>
            <div style={{ fontSize: 11, color: colors.piedra, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: colors.salvia, display: 'inline-block',
              }} />
              Asesor de alquileres
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: colors.piedra, padding: 4,
            lineHeight: 1,
          }}
          aria-label="Cerrar chat"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 16,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            message={msg}
            properties={properties}
            onOpenDetail={(id) => {
              const prop = properties.find(p => p.id === id)
              trackChatEvent('chat_click_property', {
                property_id: id,
                property_name: prop?.nombre_edificio || prop?.nombre_proyecto || '',
                zona: prop?.zona || '',
              })
              onOpenDetail?.(id)
            }}
          />
        ))}
        {loading && <ChatTypingIndicator />}
        {/* Quick replies inside messages area — right after last message */}
        {!loading && !blocked && quickReplies.length > 0 && (
          <ChatQuickReplies replies={quickReplies} onSelect={sendMessage} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: 8, padding: '12px 16px',
        borderTop: `1px solid ${colors.arenaMid}`,
        background: colors.blanco,
        flexShrink: 0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={blocked}
          placeholder={blocked ? 'Chat desactivado' : 'Escribí tu consulta...'}
          rows={1}
          style={{
            flex: 1,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14, color: colors.negro,
            background: colors.arena,
            border: `1px solid ${colors.arenaMid}`,
            borderRadius: spacing.borderRadius.container,
            padding: '10px 14px',
            outline: 'none',
            resize: 'none',
            lineHeight: 1.4,
            maxHeight: 100,
          }}
          onInput={(e) => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 100) + 'px'
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading || blocked}
          style={{
            width: 42, height: 42, borderRadius: spacing.borderRadius.button,
            background: input.trim() && !loading ? colors.negro : colors.arenaMid,
            border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, alignSelf: 'flex-end',
            transition: 'background 0.2s',
          }}
          aria-label="Enviar mensaje"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={colors.arena}>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
