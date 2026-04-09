import { useState, useRef, useEffect } from 'react'
import type { SimonChatWidgetProps } from './chat-types'
import ChatPanel from './ChatPanel'
import { colors, spacing } from '@/lib/simon-design-tokens'
import { Z_CHAT_BUBBLE, Z_CHAT_PANEL } from './chat-constants'
import { trackChatEvent } from './chat-utils'

export default function SimonChatWidget({ properties, onOpenDetail, onApplyFilters, sheetOpen }: SimonChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false) // mount once, keep alive
  const [openedFromChat, setOpenedFromChat] = useState(false) // track if sheet was opened from chat

  // Detect mobile (simple check, matches alquileres.tsx pattern)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  // When sheet closes and was opened from chat, reopen chat
  const prevSheetOpen = useRef(sheetOpen)
  useEffect(() => {
    if (prevSheetOpen.current && !sheetOpen && openedFromChat) {
      setOpen(true)
      setOpenedFromChat(false)
    }
    prevSheetOpen.current = sheetOpen
  }, [sheetOpen, openedFromChat])

  const handleOpen = () => {
    if (!mounted) setMounted(true)
    setOpen(true)
    trackChatEvent('chat_open')
  }

  // Hide chat when sheet is open (sheet shows on top)
  const visible = open && !sheetOpen

  return (
    <>
      {/* Chat panel — mounted once, hidden via display:none to preserve conversation */}
      {mounted && (
        <div style={{
          position: 'fixed',
          zIndex: Z_CHAT_PANEL,
          display: visible ? 'block' : 'none',
          // Mobile: full screen. Desktop: side panel
          ...(isMobile
            ? { inset: 0 }
            : { bottom: 0, right: 16, width: 400, height: 600, borderRadius: '16px 16px 0 0', overflow: 'hidden', boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }
          ),
        }}>
          <ChatPanel
            properties={properties}
            onClose={() => setOpen(false)}
            onOpenDetail={(id) => {
              setOpenedFromChat(true)
              onOpenDetail?.(id)
            }}
            onApplyFilters={(filters) => {
              setOpen(false)
              onApplyFilters?.(filters)
            }}
          />
        </div>
      )}

      {/* Floating bubble button (hidden when panel is open on mobile) */}
      {!(open && isMobile) && (
        <button
          onClick={() => open ? setOpen(false) : handleOpen()}
          style={{
            position: 'fixed',
            bottom: 80, right: 16,
            zIndex: Z_CHAT_BUBBLE,
            width: 56, height: 56,
            borderRadius: '50%',
            background: colors.negro,
            border: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08)'
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.22)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.18)'
          }}
          aria-label={open ? 'Cerrar chat' : 'Abrir chat con Simón'}
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill={colors.arena}>
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill={colors.arena}>
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
            </svg>
          )}
        </button>
      )}
    </>
  )
}
