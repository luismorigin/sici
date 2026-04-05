import type { ChatMessage as ChatMessageType, ChatBotResponse } from './chat-types'
import type { UnidadAlquiler } from '@/lib/supabase'
import ChatPropertyCard from './ChatPropertyCard'
import { colors } from '@/lib/simon-design-tokens'

interface Props {
  message: ChatMessageType
  properties: UnidadAlquiler[]
  onOpenDetail?: (id: number) => void
  onApplyFilters?: (filters: ChatBotResponse['filter_context']) => void
}

// Simple **bold** parser
function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 500 }}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

export default function ChatMessage({ message, properties, onOpenDetail, onApplyFilters }: Props) {
  const isBot = message.role === 'assistant'

  const matchedProperties = (message.property_ids || [])
    .map(id => properties.find(p => p.id === id))
    .filter((p): p is UnidadAlquiler => p !== undefined)

  const totalResults = message.total_results || 0
  const showViewAll = totalResults > matchedProperties.length && message.filter_context

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isBot ? 'flex-start' : 'flex-end',
      gap: 4,
    }}>
      {/* Bubble — no avatar, WhatsApp style */}
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 14, lineHeight: 1.55,
        color: colors.negro,
        padding: '8px 12px',
        borderRadius: isBot ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        background: isBot ? colors.blanco : `${colors.salvia}18`,
        border: `1px solid ${isBot ? colors.arenaMid : `${colors.salvia}30`}`,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxWidth: '88%',
      }}>
        {renderText(message.text)}
      </div>

      {/* Property cards */}
      {matchedProperties.length > 0 && (
        <div style={{ width: '100%', maxWidth: '88%' }}>
          {matchedProperties.map(p => (
            <ChatPropertyCard key={p.id} property={p} onOpenDetail={onOpenDetail} />
          ))}

          {/* "Ver todas en el feed" button */}
          {showViewAll && (
            <button
              onClick={() => onApplyFilters?.(message.filter_context)}
              style={{
                width: '100%',
                marginTop: 8,
                padding: '10px 16px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14, fontWeight: 500,
                color: colors.arena,
                background: colors.negro,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Ver las {totalResults} en el feed
            </button>
          )}
        </div>
      )}
    </div>
  )
}
