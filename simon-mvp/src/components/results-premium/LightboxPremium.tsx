import { useState, useEffect, useCallback } from 'react'
import { UnidadReal } from '@/lib/supabase'
import { formatDorms } from '@/lib/format-utils'

interface LightboxPremiumProps {
  propiedad: UnidadReal
  initialIndex?: number
  onClose: () => void
}

export default function LightboxPremium({ propiedad, initialIndex = 0, onClose }: LightboxPremiumProps) {
  const [photoIndex, setPhotoIndex] = useState(initialIndex)
  const [touchStart, setTouchStart] = useState<number | null>(null)

  const fotos = propiedad.fotos_urls || []

  const nextPhoto = useCallback(() => {
    if (fotos.length > 1) setPhotoIndex((prev) => (prev + 1) % fotos.length)
  }, [fotos.length])

  const prevPhoto = useCallback(() => {
    if (fotos.length > 1) setPhotoIndex((prev) => (prev - 1 + fotos.length) % fotos.length)
  }, [fotos.length])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') nextPhoto()
      if (e.key === 'ArrowLeft') prevPhoto()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, nextPhoto, prevPhoto])

  // Block body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      diff > 0 ? nextPhoto() : prevPhoto()
    }
    setTouchStart(null)
  }

  if (fotos.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0a0a0a] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 w-12 h-12 border border-white/20 hover:border-[#c9a959] text-white hover:text-[#c9a959] flex items-center justify-center transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Counter */}
      <div className="absolute top-6 left-6 z-10 text-white/60 text-sm tracking-[2px]">
        {photoIndex + 1} / {fotos.length}
      </div>

      {/* Project info */}
      <div className="absolute bottom-6 left-6 right-6 z-10 text-center pointer-events-none">
        <p className="font-display text-2xl text-white">{propiedad.proyecto}</p>
        <p className="text-white/60 text-sm mt-1">
          ${propiedad.precio_usd?.toLocaleString()} · {propiedad.area_m2}m2 · {formatDorms(propiedad.dormitorios)}
        </p>
      </div>

      {/* Main image */}
      <div
        className="w-full h-full flex items-center justify-center p-8 md:p-16"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={fotos[photoIndex]}
          alt={`${propiedad.proyecto} - Foto ${photoIndex + 1}`}
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      </div>

      {/* Navigation arrows */}
      {fotos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prevPhoto() }}
            className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-12 h-12 border border-white/20 hover:border-[#c9a959] text-white hover:text-[#c9a959] flex items-center justify-center transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); nextPhoto() }}
            className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 w-12 h-12 border border-white/20 hover:border-[#c9a959] text-white hover:text-[#c9a959] flex items-center justify-center transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}

      {/* Thumbnails */}
      {fotos.length > 1 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
          {fotos.slice(0, 8).map((foto, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setPhotoIndex(i) }}
              className={`w-12 h-12 border-2 overflow-hidden transition-colors ${
                i === photoIndex ? 'border-[#c9a959]' : 'border-white/20 hover:border-white/50'
              }`}
            >
              <img src={foto} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          {fotos.length > 8 && (
            <span className="text-white/40 text-xs">+{fotos.length - 8}</span>
          )}
        </div>
      )}

      {/* Swipe hint for mobile */}
      {fotos.length > 1 && (
        <p className="absolute bottom-28 left-0 right-0 text-center text-white/30 text-xs tracking-[1px] uppercase md:hidden">
          Desliza para ver mas
        </p>
      )}
    </div>
  )
}
