import { useState } from 'react'

/**
 * Property photo gallery + lightbox overlay
 * Extracted from propiedades/[id].tsx lines 1502-1570, 3219-3294
 */

function SafeImg({ src, alt, className, onClick, title, draggable }: { src: string; alt: string; className: string; onClick?: React.MouseEventHandler<HTMLImageElement>; title?: string; draggable?: boolean }) {
  const [err, setErr] = useState(false)
  if (err) return <div className={className} style={{ background: '#e2e8f0' }} />
  return <img src={src} alt={alt} className={className} onClick={onClick} title={title} draggable={draggable} onError={() => setErr(true)} />
}

interface PropertyGalleryProps {
  fotos: string[]
  fotoActual: number
  setFotoActual: (n: number) => void
  lightboxIndex: number | null
  setLightboxIndex: (n: number | null) => void
}

export default function PropertyGallery({ fotos, fotoActual, setFotoActual, lightboxIndex, setLightboxIndex }: PropertyGalleryProps) {
  return (
    <>
      {/* Inline gallery */}
      <div className="w-64 flex-shrink-0">
        <div className="relative w-full h-48 bg-slate-200 rounded-lg overflow-hidden">
          {fotos.length > 0 ? (
            <>
              <SafeImg
                src={fotos[fotoActual]}
                alt={`Foto ${fotoActual + 1}`}
                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setLightboxIndex(fotoActual)}
                title="Click para ver en pantalla completa"
              />
              {fotos.length > 1 && (
                <>
                  <button
                    onClick={() => setFotoActual(fotoActual === 0 ? fotos.length - 1 : fotoActual - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setFotoActual(fotoActual === fotos.length - 1 ? 0 : fotoActual + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full flex items-center justify-center"
                  >
                    ›
                  </button>
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    {fotoActual + 1} / {fotos.length}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Sin fotos
              </div>
            </div>
          )}
        </div>
        {fotos.length > 1 && (
          <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
            {fotos.slice(0, 6).map((foto, idx) => (
              <button
                key={idx}
                onClick={() => setLightboxIndex(idx)}
                className={`w-12 h-12 flex-shrink-0 rounded overflow-hidden border-2 cursor-pointer hover:opacity-80 transition-opacity ${
                  idx === fotoActual ? 'border-amber-500' : 'border-transparent'
                }`}
                title="Click para ver en pantalla completa"
              >
                <SafeImg src={foto} alt={`Mini ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
            {fotos.length > 6 && (
              <button
                onClick={() => setLightboxIndex(6)}
                className="w-12 h-12 flex-shrink-0 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-xs text-slate-500 cursor-pointer transition-colors"
                title="Ver más fotos"
              >
                +{fotos.length - 6}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox overlay */}
      {lightboxIndex !== null && fotos.length > 0 && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-4xl font-light z-10"
          >
            ×
          </button>

          {fotos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex === 0 ? fotos.length - 1 : lightboxIndex - 1) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-5xl font-light z-10 w-16 h-16 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            >
              ‹
            </button>
          )}

          <SafeImg
            src={fotos[lightboxIndex]}
            alt={`Foto ${lightboxIndex + 1} de ${fotos.length}`}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {fotos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex === fotos.length - 1 ? 0 : lightboxIndex + 1) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-5xl font-light z-10 w-16 h-16 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            >
              ›
            </button>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
            {lightboxIndex + 1} / {fotos.length}
          </div>

          {fotos.length > 1 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto pb-2">
              {fotos.map((foto, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(idx) }}
                  className={`w-14 h-14 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                    idx === lightboxIndex ? 'border-white opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <SafeImg src={foto} alt={`Mini ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
