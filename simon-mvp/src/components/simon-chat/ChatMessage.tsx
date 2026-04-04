import type { ChatMessage as ChatMessageType } from './chat-types'
import type { UnidadAlquiler } from '@/lib/supabase'
import ChatPropertyCard from './ChatPropertyCard'
import { colors } from '@/lib/simon-design-tokens'

interface Props {
  message: ChatMessageType
  properties: UnidadAlquiler[]
  onOpenDetail?: (id: number) => void
}

// Simple **bold** parser — no full markdown needed
function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ fontWeight: 500 }}>{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

export default function ChatMessage({ message, properties, onOpenDetail }: Props) {
  const isBot = message.role === 'assistant'

  // Look up property objects by ID
  const matchedProperties = (message.property_ids || [])
    .map(id => properties.find(p => p.id === id))
    .filter((p): p is UnidadAlquiler => p !== undefined)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isBot ? 'flex-start' : 'flex-end',
      gap: 4,
      maxWidth: '85%',
      alignSelf: isBot ? 'flex-start' : 'flex-end',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: isBot ? 'flex-start' : 'flex-end' }}>
        {/* Bot avatar */}
        {isBot && (
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: colors.salvia, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, flexShrink: 0, color: '#fff', fontWeight: 600, marginTop: 2,
          }}>S</div>
        )}

        {/* Bubble */}
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 14, lineHeight: 1.55,
          color: colors.negro,
          padding: '10px 14px',
          borderRadius: isBot ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
          background: isBot ? colors.blanco : `${colors.salvia}18`,
          border: `1px solid ${isBot ? colors.arenaMid : `${colors.salvia}30`}`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {renderText(message.text)}
        </div>
      </div>

      {/* Property cards */}
      {matchedProperties.length > 0 && (
        <div style={{ width: '100%', paddingLeft: isBot ? 36 : 0 }}>
          {matchedProperties.map(p => (
            <ChatPropertyCard key={p.id} property={p} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </div>
  )
}
