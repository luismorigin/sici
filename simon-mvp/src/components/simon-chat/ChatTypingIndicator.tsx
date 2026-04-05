import { colors } from '@/lib/simon-design-tokens'

export default function ChatTypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: colors.salvia, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, flexShrink: 0, color: '#fff', fontWeight: 600,
      }}>S</div>
      <div style={{
        background: colors.blanco, border: `1px solid ${colors.arenaMid}`,
        borderRadius: '14px 14px 14px 4px', padding: '10px 14px',
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: colors.piedra,
            animation: `chatBounce 1.2s infinite ${i * 0.2}s`,
          }} />
        ))}
      </div>
      <style jsx>{`
        @keyframes chatBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
