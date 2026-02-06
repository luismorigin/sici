import { UnidadReal } from '@/lib/supabase'

interface FavoritesProgressBarPremiumProps {
  selectedCount: number
  maxSelected: number
  selectedProperties: UnidadReal[]
  onViewAnalysis: () => void
  onClearSelection: () => void
  hasScrolled?: boolean
}

export default function FavoritesProgressBarPremium({
  selectedCount,
  maxSelected,
  selectedProperties,
  onViewAnalysis,
  onClearSelection,
  hasScrolled = false
}: FavoritesProgressBarPremiumProps) {
  const isComplete = selectedCount >= maxSelected

  // Estado vacío: mostrar CTA solo después de scroll
  if (selectedCount === 0) {
    if (!hasScrolled) return null

    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a] border-t border-[#c9a959]/30 animate-[fadeInBounce_0.4s_ease-out]">
        <div className="max-w-6xl mx-auto px-8 py-4">
          <div className="flex items-center justify-center gap-3">
            <svg className="w-5 h-5 text-[#c9a959]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span className="text-white/70 text-sm">
              Selecciona 2+ departamentos para comparar gratis
            </span>
            <svg className="w-4 h-4 text-[#c9a959] animate-bounce" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0a] border-t border-white/10">
      <div className="max-w-6xl mx-auto px-8 py-4">
        <div className="flex items-center justify-between gap-6">
          {/* Progress info */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-sm">
                {selectedCount === 1 && 'Bien! Elegi 2 mas para comparar'}
                {selectedCount === 2 && 'Una mas y listo!'}
                {isComplete && 'Listo para tu analisis!'}
              </span>
              <span className="text-[#c9a959] font-display text-xl">{selectedCount}/{maxSelected}</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#c9a959] transition-all duration-300"
                style={{ width: `${(selectedCount / maxSelected) * 100}%` }}
              />
            </div>
          </div>

          {/* Selected thumbnails */}
          <div className="hidden md:flex items-center gap-2">
            {selectedProperties.slice(0, 3).map((prop, i) => (
              <div key={prop.id} className="w-10 h-10 bg-white/10 overflow-hidden border border-[#c9a959]/30">
                {prop.fotos_urls?.[0] ? (
                  <img src={prop.fotos_urls[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">{i + 1}</div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClearSelection}
              className="text-white/40 hover:text-white text-sm transition-colors"
            >
              Limpiar
            </button>
            {isComplete && (
              <button
                onClick={onViewAnalysis}
                className="bg-white text-[#0a0a0a] px-6 py-2.5 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] hover:text-white transition-all"
              >
                Ver Analisis
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
