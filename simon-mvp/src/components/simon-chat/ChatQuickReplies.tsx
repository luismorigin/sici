import { colors, spacing } from '@/lib/simon-design-tokens'

interface Props {
  replies: string[]
  onSelect: (text: string) => void
}

export default function ChatQuickReplies({ replies, onSelect }: Props) {
  if (!replies.length) return null

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap',
      padding: '4px 0 8px',
    }}>
      {replies.map((text, i) => (
        <button
          key={i}
          onClick={() => onSelect(text)}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13, fontWeight: 400,
            color: colors.arena,
            background: colors.negro,
            border: 'none',
            borderRadius: spacing.borderRadius.pill,
            padding: '7px 14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
