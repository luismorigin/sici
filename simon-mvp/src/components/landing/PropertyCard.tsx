'use client'

import { useState } from 'react'
import type { UnidadReal } from '@/lib/supabase'

// Formateo consistente de números (evita hydration mismatch)
const formatPrice = (n: number) => n.toLocaleString('en-US')

// Iconos de amenidades para mostrar
const AMENITY_ICONS: Record<string, string> = {
  'Piscina': '🏊',
  'Gimnasio': '🏋️',
  'Seguridad 24/7': '🔒',
  'Churrasquera': '🍖',
  'Salón de Eventos': '🎉',
  'Sauna/Jacuzzi': '🧖',
  'Área Social': '👥',
  'Parque Infantil': '🛝',
  'Co-working': '💻',
  'Pet Friendly': '🐕',
  'Terraza/Balcón': '🌅',
  'Ascensor': '🛗'
}

// Props legacy (para ReportExample y demos)
interface LegacyProps {
  nombre: string
  precio: number
  dormitorios: number
  area: number
  matchScore: number
  confianza?: number
  fotoUrl?: string
}

// Props nuevos (para resultados reales)
interface NewProps {
  propiedad: UnidadReal
  matchScore?: number
  sintesisFiduciaria?: {
    headline: string
    detalles: string
    tipo: 'oportunidad' | 'premium' | 'justo' | 'sospechoso'
  }
  onContactar?: () => void
}

type PropertyCardProps = LegacyProps | NewProps

// Type guard para detectar si son props legacy
function isLegacyProps(props: PropertyCardProps): props is LegacyProps {
  return 'nombre' in props && !('propiedad' in props)
}

export default function PropertyCard(props: PropertyCardProps) {
  const [fotoActual, setFotoActual] = useState(0)
  const [showDescripcion, setShowDescripcion] = useState(false)
  const [showAmenities, setShowAmenities] = useState(false)
  const [showMoatDetalle, setShowMoatDetalle] = useState(false)

  // ========== MODO LEGACY (para demos) ==========
  if (isLegacyProps(props)) {
    const { nombre, precio, dormitorios, area, matchScore, confianza = 89, fotoUrl } = props
    return (
      <div className="border border-slate-200 rounded-2xl overflow-hidden hover:border-brand-primary hover:-translate-y-1 transition-all bg-white">
        {fotoUrl && (
          <div className="relative h-36 bg-slate-100 overflow-hidden">
            <img
              src={fotoUrl}
              alt={nombre}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <span className="absolute top-2 right-2 text-xs font-bold bg-emerald-500 text-white px-2 py-1 rounded shadow">
              {matchScore}% Match
            </span>
          </div>
        )}
        {!fotoUrl && (
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
            <span className="font-bold text-brand-dark">{nombre}</span>
            <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded">
              {matchScore}% Match
            </span>
          </div>
        )}
        <div className="p-4">
          {fotoUrl && <h4 className="font-bold text-brand-dark mb-1 truncate">{nombre}</h4>}
          <div className="text-xl font-bold text-brand-dark mb-2">${precio.toLocaleString('en-US')}</div>
          <div className="flex gap-2 text-sm mb-3">
            <span className="bg-slate-100 px-2 py-1 rounded-full">🛏️ {dormitorios}d</span>
            <span className="bg-slate-100 px-2 py-1 rounded-full">📐 {area}m²</span>
          </div>
          <div className="flex justify-between text-xs pt-3 border-t border-slate-100 text-slate-400">
            <span>Confianza Datos</span>
            <span className={`font-semibold ${confianza >= 85 ? 'text-emerald-600' : 'text-slate-600'}`}>
              {confianza}%
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ========== MODO COMPLETO (para resultados reales) ==========
  const { propiedad, matchScore, sintesisFiduciaria, onContactar } = props

  const fotos = propiedad.fotos_urls || []
  const tieneGPS = propiedad.latitud && propiedad.longitud
  const googleMapsUrl = tieneGPS
    ? `https://maps.google.com/?q=${propiedad.latitud},${propiedad.longitud}`
    : null

  // Color del badge según tipo de síntesis
  const getBadgeColor = (tipo: string) => {
    switch (tipo) {
      case 'oportunidad': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'premium': return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'sospechoso': return 'bg-amber-100 text-amber-700 border-amber-200'
      default: return 'bg-slate-100 text-slate-700 border-slate-200'
    }
  }

  // Obtener icono de posición mercado
  const getPosicionIcon = () => {
    const cat = propiedad.posicion_mercado?.categoria
    if (cat === 'oportunidad' || cat === 'bajo_promedio') return '📉'
    if (cat === 'sobre_promedio' || cat === 'premium') return '📈'
    return '📊'
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      {/* ========== ABOVE THE FOLD ========== */}

      {/* Galería de fotos - 60% de altura en mobile */}
      {fotos.length > 0 ? (
        <div className="relative h-56 md:h-64 bg-slate-100">
          <img
            src={fotos[fotoActual]}
            alt={propiedad.proyecto}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/placeholder-property.jpg'
            }}
          />

          {/* Navegación fotos */}
          {fotos.length > 1 && (
            <>
              <button
                onClick={() => setFotoActual(prev => prev > 0 ? prev - 1 : fotos.length - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center"
              >
                ‹
              </button>
              <button
                onClick={() => setFotoActual(prev => prev < fotos.length - 1 ? prev + 1 : 0)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-8 h-8 rounded-full flex items-center justify-center"
              >
                ›
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                {fotoActual + 1} / {fotos.length}
              </div>
            </>
          )}

          {/* Match Score badge */}
          {matchScore && (
            <span className="absolute top-2 right-2 text-sm font-bold bg-emerald-500 text-white px-3 py-1 rounded-full shadow">
              {matchScore}% Match
            </span>
          )}
        </div>
      ) : (
        <div className="h-32 bg-slate-100 flex items-center justify-center text-slate-400">
          Sin fotos
        </div>
      )}

      {/* Nombre + Precio + Match (1 línea) */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-brand-dark truncate">{propiedad.proyecto}</h3>
            <p className="text-sm text-slate-500">{propiedad.desarrollador || propiedad.zona}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-bold text-brand-dark">
              ${propiedad.precio_usd.toLocaleString('en-US')}
            </div>
            <div className="text-xs text-slate-500">
              ${Math.round(propiedad.precio_m2).toLocaleString('en-US')}/m²
            </div>
          </div>
        </div>
      </div>

      {/* Pills inline: 🛏️3d 🚿2b 📐120m² 🚗2p */}
      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="bg-slate-100 px-2 py-1 rounded-full">
            🛏️ {propiedad.dormitorios}d
          </span>
          {propiedad.banos && (
            <span className="bg-slate-100 px-2 py-1 rounded-full">
              🚿 {propiedad.banos}b
            </span>
          )}
          <span className="bg-slate-100 px-2 py-1 rounded-full">
            📐 {Math.round(propiedad.area_m2)}m²
          </span>
          {propiedad.estacionamientos && propiedad.estacionamientos > 0 && (
            <span className="bg-slate-100 px-2 py-1 rounded-full">
              🚗 {propiedad.estacionamientos}p
            </span>
          )}
        </div>
      </div>

      {/* ========== FIRST SCROLL ========== */}

      {/* Ubicación + Link Maps */}
      <div className="px-4 py-3 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">
            📍 {propiedad.zona}{propiedad.microzona && propiedad.microzona !== propiedad.zona ? ` • ${propiedad.microzona}` : ''}
          </span>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-primary hover:underline"
            >
              Ver en Maps →
            </a>
          )}
        </div>
      </div>

      {/* Síntesis Fiduciaria - HEADLINE */}
      {(sintesisFiduciaria || propiedad.posicion_mercado) && (
        <div className="px-4 py-3 border-t border-slate-100">
          <div className={`rounded-lg p-3 border ${getBadgeColor(sintesisFiduciaria?.tipo || 'justo')}`}>
            <div className="flex items-start gap-2">
              <span className="text-lg">{getPosicionIcon()}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {sintesisFiduciaria?.headline || propiedad.posicion_mercado?.posicion_texto || 'Precio de mercado'}
                </p>
                {sintesisFiduciaria?.detalles && (
                  <p className="text-xs mt-1 opacity-80">
                    {sintesisFiduciaria.detalles}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========== SECOND SCROLL - COLAPSABLES ========== */}

      <div className="border-t border-slate-100">
        {/* Descripción [colapsable] */}
        {propiedad.descripcion && (
          <div className="border-b border-slate-100">
            <button
              onClick={() => setShowDescripcion(!showDescripcion)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-700">📋 Descripción</span>
              <span className="text-slate-400">{showDescripcion ? '▼' : '▶'}</span>
            </button>
            {showDescripcion && (
              <div className="px-4 pb-4">
                <p className="text-sm text-slate-600 whitespace-pre-line">
                  {propiedad.descripcion.slice(0, 500)}
                  {propiedad.descripcion.length > 500 && '...'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Amenities [colapsable] */}
        {(propiedad.amenities_confirmados?.length > 0 || propiedad.amenities_por_verificar?.length > 0) && (
          <div className="border-b border-slate-100">
            <button
              onClick={() => setShowAmenities(!showAmenities)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-700">
                🏊 Amenities
                {propiedad.amenities_confirmados?.length > 0 && (
                  <span className="text-xs text-slate-500 ml-1">
                    ({propiedad.amenities_confirmados.length} confirmados)
                  </span>
                )}
              </span>
              <span className="text-slate-400">{showAmenities ? '▼' : '▶'}</span>
            </button>
            {showAmenities && (
              <div className="px-4 pb-4">
                {/* Confirmados */}
                {propiedad.amenities_confirmados?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-slate-500 mb-2">Confirmados:</p>
                    <div className="flex flex-wrap gap-2">
                      {propiedad.amenities_confirmados.map((amenity, i) => (
                        <span key={i} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-1 rounded-full">
                          {AMENITY_ICONS[amenity] || '✓'} {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Por verificar */}
                {propiedad.amenities_por_verificar?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Por verificar:</p>
                    <div className="flex flex-wrap gap-2">
                      {propiedad.amenities_por_verificar.map((amenity, i) => (
                        <span key={i} className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full">
                          {AMENITY_ICONS[amenity] || '?'} {amenity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Equipamiento detectado */}
                {propiedad.equipamiento_detectado?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-500 mb-2">Equipamiento mencionado:</p>
                    <div className="flex flex-wrap gap-2">
                      {propiedad.equipamiento_detectado.map((equip, i) => (
                        <span key={i} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
                          {equip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MOAT Detallado [colapsable] */}
        {propiedad.posicion_mercado && (
          <div className="border-b border-slate-100">
            <button
              onClick={() => setShowMoatDetalle(!showMoatDetalle)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-700">📊 Análisis de mercado</span>
              <span className="text-slate-400">{showMoatDetalle ? '▼' : '▶'}</span>
            </button>
            {showMoatDetalle && (
              <div className="px-4 pb-4 space-y-3">
                {/* Posición en edificio */}
                {propiedad.unidades_en_edificio && propiedad.unidades_en_edificio > 1 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Posición en {propiedad.proyecto}</p>
                    <p className="text-sm font-medium">
                      #{propiedad.posicion_precio_edificio} de {propiedad.unidades_en_edificio} unidades
                      {propiedad.posicion_precio_edificio === 1 && ' (la más barata)'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Rango: ${propiedad.precio_min_edificio?.toLocaleString('en-US')} - ${propiedad.precio_max_edificio?.toLocaleString('en-US')}
                    </p>
                  </div>
                )}

                {/* Posición por tipología */}
                {propiedad.unidades_misma_tipologia && propiedad.unidades_misma_tipologia > 1 && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">De {propiedad.dormitorios} dormitorios</p>
                    <p className="text-sm font-medium">
                      #{propiedad.posicion_en_tipologia} de {propiedad.unidades_misma_tipologia} similares
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Rango: ${propiedad.precio_min_tipologia?.toLocaleString('en-US')} - ${propiedad.precio_max_tipologia?.toLocaleString('en-US')}
                    </p>
                  </div>
                )}

                {/* Días en mercado */}
                {propiedad.dias_en_mercado !== null && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Tiempo publicado</p>
                    <p className="text-sm font-medium">
                      {propiedad.dias_en_mercado} días
                      {propiedad.dias_en_mercado > 90 && (
                        <span className="text-amber-600 ml-2">⚠️ Mucho tiempo</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Score calidad */}
                {propiedad.score_calidad && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Confianza de datos</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            propiedad.score_calidad >= 80 ? 'bg-emerald-500' :
                            propiedad.score_calidad >= 60 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${propiedad.score_calidad}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{propiedad.score_calidad}%</span>
                    </div>
                  </div>
                )}

                {/* Razón fiduciaria original */}
                {propiedad.razon_fiduciaria && (
                  <div className="bg-brand-light rounded-lg p-3">
                    <p className="text-xs text-brand-primary mb-1">💡 Insight</p>
                    <p className="text-sm text-brand-dark">{propiedad.razon_fiduciaria}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CTA Contactar */}
      {propiedad.asesor_wsp && (
        <div className="p-4">
          <a
            href={`https://wa.me/${propiedad.asesor_wsp.replace(/\D/g, '')}?text=Hola, me interesa ${propiedad.proyecto}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-emerald-500 hover:bg-emerald-600 text-white text-center py-3 rounded-xl font-semibold transition-colors"
          >
            Contactar por WhatsApp
          </a>
          {propiedad.asesor_nombre && (
            <p className="text-xs text-slate-500 text-center mt-2">
              {propiedad.asesor_nombre}
              {propiedad.asesor_inmobiliaria && ` • ${propiedad.asesor_inmobiliaria}`}
            </p>
          )}
        </div>
      )}

      {/* Link a publicación original */}
      {propiedad.url && (
        <div className="px-4 pb-4">
          <a
            href={propiedad.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Ver publicación original →
          </a>
        </div>
      )}
    </div>
  )
}
