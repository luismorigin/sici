import { useEffect } from 'react'
import { UnidadReal } from '@/lib/supabase'
import { formatDorms } from '@/lib/format-utils'

interface OrderFavoritesPremiumProps {
  properties: UnidadReal[]
  onComplete: (orderedIds: number[], reason: string) => void
  onClose: () => void
}

export default function OrderFavoritesPremium({ properties, onComplete, onClose }: OrderFavoritesPremiumProps) {
  // Block body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const formatNum = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-'
    return Math.round(n).toLocaleString('es-BO')
  }

  const selectFavorite = (favId: number) => {
    // La favorita va primero, las otras 2 en orden original
    const rest = properties.filter(p => p.id !== favId).map(p => p.id)
    onComplete([favId, ...rest], 'intuicion')
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a0a0a] border border-white/10 max-w-md w-full p-8 relative max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center mb-8">
          <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="#c9a959" stroke="#c9a959" strokeWidth="1">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <h2 className="font-display text-2xl text-white">Cual es tu favorita?</h2>
          <p className="text-white/50 mt-2 text-sm">Tu informe se centrara en ella</p>
        </div>

        <div className="space-y-3">
          {properties.map(prop => (
            <button
              key={prop.id}
              onClick={() => selectFavorite(prop.id)}
              className="w-full flex items-center gap-4 p-4 border border-white/10 hover:border-[#c9a959] transition-colors text-left group"
            >
              <div className="w-16 h-16 bg-white/5 overflow-hidden flex-shrink-0">
                {prop.fotos_urls?.[0] ? (
                  <img src={prop.fotos_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">Sin foto</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-lg text-white truncate">{prop.proyecto}</p>
                <p className="text-[#c9a959] text-sm">${formatNum(prop.precio_usd)}</p>
                <p className="text-white/40 text-xs">{prop.area_m2}m2 · {formatDorms(prop.dormitorios)}</p>
              </div>
              <svg className="w-5 h-5 text-white/20 group-hover:text-[#c9a959] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
