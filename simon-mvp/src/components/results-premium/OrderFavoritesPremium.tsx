import { useState, useEffect } from 'react'
import { UnidadReal } from '@/lib/supabase'
import { formatDorms } from '@/lib/format-utils'

interface OrderFavoritesPremiumProps {
  properties: UnidadReal[]
  onComplete: (orderedIds: number[], reason: string) => void
  onClose: () => void
}

export default function OrderFavoritesPremium({ properties, onComplete, onClose }: OrderFavoritesPremiumProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [ordered, setOrdered] = useState<number[]>([])
  const [available, setAvailable] = useState<number[]>(properties.map(p => p.id))
  const [reason, setReason] = useState<string | null>(null)

  // Block body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const selectProperty = (propId: number) => {
    const newOrdered = [...ordered, propId]
    const newAvailable = available.filter(id => id !== propId)

    setOrdered(newOrdered)
    setAvailable(newAvailable)

    if (newOrdered.length >= 3) {
      setStep(3)
    } else if (newAvailable.length === 1) {
      // Auto-select last one
      setOrdered([...newOrdered, newAvailable[0]])
      setAvailable([])
      setStep(3)
    } else {
      setStep(2)
    }
  }

  const resetOrder = () => {
    setOrdered([])
    setAvailable(properties.map(p => p.id))
    setStep(1)
    setReason(null)
  }

  const reasons = [
    { value: 'precio', label: 'Precio', icon: '$' },
    { value: 'ubicacion', label: 'Ubicacion', icon: '◎' },
    { value: 'amenidades', label: 'Amenidades', icon: '★' },
    { value: 'intuicion', label: 'Intuicion', icon: '♡' },
  ]

  const formatNum = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '-'
    return Math.round(n).toLocaleString('es-BO')
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

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`w-8 h-1 transition-colors ${
                s <= step ? 'bg-[#c9a959]' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Pick favorite */}
        {step === 1 && available.length > 0 && (
          <>
            <div className="text-center mb-8">
              <span className="text-[#c9a959] text-5xl font-display">1</span>
              <h2 className="font-display text-2xl text-white mt-2">Cual es tu favorita?</h2>
              <p className="text-white/50 mt-2 text-sm">Toca la que mas te interesa</p>
            </div>

            <div className="space-y-3">
              {available.map(propId => {
                const prop = properties.find(p => p.id === propId)
                if (!prop) return null
                return (
                  <button
                    key={propId}
                    onClick={() => selectProperty(propId)}
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
                )
              })}
            </div>
          </>
        )}

        {/* Step 2: Pick second */}
        {step === 2 && available.length > 0 && (
          <>
            <div className="text-center mb-6">
              <span className="text-[#c9a959] text-5xl font-display">2</span>
              <h2 className="font-display text-2xl text-white mt-2">Y entre estas?</h2>
              <p className="text-white/50 mt-2 text-sm">Toca tu segunda opcion</p>
            </div>

            {/* Show #1 */}
            <div className="mb-6 p-4 border border-[#c9a959]/30 bg-[#c9a959]/5">
              <p className="text-[#c9a959] text-xs tracking-[2px] uppercase mb-1">Tu #1</p>
              <p className="font-display text-lg text-white">{properties.find(p => p.id === ordered[0])?.proyecto}</p>
            </div>

            <div className="space-y-3">
              {available.map(propId => {
                const prop = properties.find(p => p.id === propId)
                if (!prop) return null
                return (
                  <button
                    key={propId}
                    onClick={() => selectProperty(propId)}
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
                    </div>
                    <svg className="w-5 h-5 text-white/20 group-hover:text-[#c9a959] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )
              })}
            </div>

            <button onClick={resetOrder} className="w-full mt-6 py-2 text-white/40 hover:text-white text-sm transition-colors">
              Empezar de nuevo
            </button>
          </>
        )}

        {/* Step 3: Summary + Reason */}
        {step === 3 && ordered.length >= 2 && (
          <>
            <div className="text-center mb-6">
              <span className="text-[#c9a959] text-5xl font-display">3</span>
              <h2 className="font-display text-2xl text-white mt-2">Tu orden</h2>
            </div>

            {/* Summary */}
            <div className="space-y-2 mb-8">
              {ordered.map((propId, idx) => {
                const prop = properties.find(p => p.id === propId)
                if (!prop) return null
                return (
                  <div
                    key={propId}
                    className={`flex items-center gap-4 p-4 ${
                      idx === 0 ? 'border-2 border-[#c9a959] bg-[#c9a959]/10' : 'border border-white/10'
                    }`}
                  >
                    <span className="font-display text-2xl text-[#c9a959] w-8">{idx + 1}</span>
                    <div className="w-12 h-12 bg-white/5 overflow-hidden flex-shrink-0">
                      {prop.fotos_urls?.[0] ? (
                        <img src={prop.fotos_urls[0]} alt="" className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg text-white truncate">{prop.proyecto}</p>
                      <p className="text-white/50 text-sm">${formatNum(prop.precio_usd)}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Reason */}
            <div className="mb-8">
              <p className="text-white text-sm mb-4">
                Por que <span className="text-[#c9a959]">{properties.find(p => p.id === ordered[0])?.proyecto}</span> es tu #1?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {reasons.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setReason(r.value)}
                    className={`p-4 border text-sm transition-colors ${
                      reason === r.value
                        ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                        : 'border-white/10 text-white/60 hover:border-white/30'
                    }`}
                  >
                    <span className="block text-lg mb-1">{r.icon}</span>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <button
              onClick={() => reason && onComplete(ordered, reason)}
              disabled={!reason}
              className="w-full bg-[#c9a959] text-[#0a0a0a] py-4 text-xs tracking-[2px] uppercase hover:bg-[#b5935a] transition-all disabled:opacity-30 disabled:cursor-not-allowed font-semibold"
            >
              Ver Informe Premium
            </button>
            <button onClick={resetOrder} className="w-full mt-3 py-2 text-white/40 hover:text-white text-sm transition-colors">
              Cambiar orden
            </button>
          </>
        )}
      </div>
    </div>
  )
}
