import { useState } from 'react'
import { UnidadReal } from '@/lib/supabase'

interface PropertyCardPremiumProps {
  propiedad: UnidadReal
  rank?: number // 1, 2, 3 for TOP 3
  onContactar?: () => void
}

export default function PropertyCardPremium({ propiedad, rank, onContactar }: PropertyCardPremiumProps) {
  const [fotoIndex, setFotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const fotos = propiedad.fotos_urls || []
  const hasFotos = fotos.length > 0

  const nextFoto = () => {
    if (fotos.length > 1) {
      setFotoIndex((prev) => (prev + 1) % fotos.length)
    }
  }

  const prevFoto = () => {
    if (fotos.length > 1) {
      setFotoIndex((prev) => (prev - 1 + fotos.length) % fotos.length)
    }
  }

  return (
    <div className="bg-white border border-[#0a0a0a]/10 hover:border-[#c9a959]/30 transition-colors">
      {/* Image Section */}
      <div className="relative aspect-[16/10] bg-[#f8f6f3] overflow-hidden">
        {hasFotos ? (
          <>
            <img
              src={fotos[fotoIndex]}
              alt={propiedad.proyecto}
              className="w-full h-full object-cover"
            />

            {/* Navigation arrows */}
            {fotos.length > 1 && (
              <>
                <button
                  onClick={prevFoto}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  onClick={nextFoto}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </>
            )}

            {/* Photo counter */}
            <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1">
              {fotoIndex + 1} / {fotos.length}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#999999]">
            Sin fotos
          </div>
        )}

        {/* Rank badge */}
        {rank && (
          <div className="absolute top-3 left-3 bg-[#c9a959] text-[#0a0a0a] px-4 py-2 text-xs tracking-[2px] uppercase font-medium">
            TOP {rank}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-6">
        {/* Project name and developer */}
        <div className="mb-4">
          <h3 className="font-display text-2xl text-[#0a0a0a] font-light">
            {propiedad.proyecto}
          </h3>
          {propiedad.desarrollador && (
            <p className="text-[#999999] text-sm mt-1">
              por {propiedad.desarrollador}
            </p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-4 mb-4">
          <span className="font-display text-3xl text-[#0a0a0a]">
            ${propiedad.precio_usd.toLocaleString('es-BO')}
          </span>
          <span className="text-[#c9a959] text-sm">
            ${propiedad.precio_m2.toLocaleString('es-BO')}/m2
          </span>
        </div>

        {/* Specs */}
        <div className="flex items-center gap-4 text-[#666666] text-sm mb-4">
          <span className="flex items-center gap-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7" />
              <path d="M21 10H3" />
              <path d="M7 10V7a2 2 0 012-2h6a2 2 0 012 2v3" />
            </svg>
            {propiedad.dormitorios} dorm
          </span>
          {propiedad.banos && (
            <span className="flex items-center gap-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 12h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z" />
                <path d="M6 12V5a2 2 0 012-2h1" />
                <circle cx="9" cy="6" r="2" />
              </svg>
              {propiedad.banos} bano
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            {propiedad.area_m2}m2
          </span>
          {propiedad.estacionamientos && propiedad.estacionamientos > 0 && (
            <span className="flex items-center gap-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <circle cx="7" cy="17" r="2" />
                <circle cx="17" cy="17" r="2" />
                <path d="M5 11l2-5h10l2 5" />
              </svg>
              {propiedad.estacionamientos}
            </span>
          )}
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          {propiedad.solo_tc_paralelo && (
            <span className="bg-[#0a0a0a] text-[#c9a959] px-3 py-1 text-xs">
              TC Paralelo
            </span>
          )}
          {propiedad.precio_negociable && (
            <span className="bg-[#0a0a0a] text-white px-3 py-1 text-xs">
              Negociable
            </span>
          )}
          {propiedad.plan_pagos_desarrollador && (
            <span className="bg-[#c9a959]/20 text-[#0a0a0a] px-3 py-1 text-xs">
              Plan de pagos
            </span>
          )}
          {propiedad.descuento_contado_pct && propiedad.descuento_contado_pct > 0 && (
            <span className="bg-emerald-100 text-emerald-800 px-3 py-1 text-xs">
              -{propiedad.descuento_contado_pct}% contado
            </span>
          )}
        </div>

        {/* Razon fiduciaria */}
        {propiedad.razon_fiduciaria && (
          <div className="border-t border-[#0a0a0a]/10 pt-4 mb-4">
            <p className="text-[#666666] text-sm italic leading-relaxed">
              "{propiedad.razon_fiduciaria}"
            </p>
          </div>
        )}

        {/* Expanded amenities */}
        {expanded && propiedad.amenities_lista && propiedad.amenities_lista.length > 0 && (
          <div className="border-t border-[#0a0a0a]/10 pt-4 mb-4">
            <p className="text-[#999999] text-xs uppercase tracking-wide mb-2">Amenidades</p>
            <div className="flex flex-wrap gap-2">
              {propiedad.amenities_lista.slice(0, 8).map((amenity, i) => (
                <span key={i} className="text-xs text-[#666666] bg-[#f8f6f3] px-2 py-1">
                  {amenity}
                </span>
              ))}
              {propiedad.amenities_lista.length > 8 && (
                <span className="text-xs text-[#999999]">
                  +{propiedad.amenities_lista.length - 8} mas
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-[#0a0a0a]/10">
          <button
            onClick={onContactar}
            className="flex-1 bg-[#0a0a0a] text-white py-3 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] transition-colors"
          >
            Contactar
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-4 border border-[#0a0a0a]/20 text-[#666666] hover:border-[#c9a959] hover:text-[#c9a959] transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              {expanded ? (
                <path d="M18 15l-6-6-6 6" />
              ) : (
                <path d="M6 9l6 6 6-6" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
