'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Síntesis fiduciaria (mismo formato que en resultados)
interface SintesisFiduciaria {
  headline: string
  detalles: string
  accion: string
  tipo: 'oportunidad' | 'premium' | 'justo' | 'sospechoso'
}

interface PropiedadMapa {
  id: number
  proyecto: string
  precio_usd: number
  dormitorios: number
  area_m2: number
  latitud: number | null
  longitud: number | null
  foto_url: string | null
  diferencia_pct: number | null
  categoria_precio: string | null
  sintesisFiduciaria: SintesisFiduciaria | null
}

interface MapaResultadosProps {
  propiedades: PropiedadMapa[]
  selectedIds: Set<number>
  maxSelected: number
  onClose: () => void
  onToggleSelected: (id: number) => void
}

// Colores MOAT alineados con landing (emerald=oportunidad, blue=premium, slate=justo)
function getColorMOAT(diferencia_pct: number | null, categoria: string | null): { fill: string, name: string } {
  if (diferencia_pct === null) return { fill: '#64748B', name: 'gray' } // slate-500
  if (diferencia_pct <= -10 || categoria === 'oportunidad' || categoria === 'bajo_promedio') {
    return { fill: '#10B981', name: 'emerald' } // emerald-500
  }
  if (diferencia_pct >= 10 || categoria === 'premium' || categoria === 'sobre_promedio') {
    return { fill: '#3B82F6', name: 'blue' } // blue-500
  }
  return { fill: '#64748B', name: 'slate' } // slate-500 - precio justo
}

function getIconoMOAT(diferencia_pct: number | null, categoria: string | null, isSelected: boolean): string {
  const { fill: color } = getColorMOAT(diferencia_pct, categoria)

  // Si está seleccionado: pin más grande, borde dorado, corazón relleno
  if (isSelected) {
    return `
      <svg width="40" height="50" viewBox="0 0 40 50" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <path d="M20 0C8.954 0 0 8.954 0 20c0 11.046 20 30 20 30s20-18.954 20-30C40 8.954 31.046 0 20 0z"
              fill="${color}" stroke="#F59E0B" stroke-width="3" filter="url(#glow)"/>
        <path d="M20 12c-1.4-1.6-3.6-2.5-5.6-2.5C11.2 9.5 8.5 12 8.5 15.1c0 4.7 11.5 11.9 11.5 11.9s11.5-7.2 11.5-11.9c0-3.1-2.7-5.6-5.9-5.6-2 0-4.2.9-5.6 2.5z"
              fill="#EF4444" stroke="white" stroke-width="1.5"/>
      </svg>
    `
  }

  // No seleccionado: pin normal con círculo blanco
  return `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="white" opacity="0.9"/>
    </svg>
  `
}

export default function MapaResultados({ propiedades, selectedIds, maxSelected, onClose, onToggleSelected }: MapaResultadosProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const [selectedProp, setSelectedProp] = useState<PropiedadMapa | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [showLimitToast, setShowLimitToast] = useState(false)

  // Filtrar propiedades con GPS válido
  const propsConGPS = propiedades.filter(p => p.latitud && p.longitud)

  // Función para actualizar todos los iconos de markers
  const updateMarkerIcons = () => {
    markersRef.current.forEach((marker, propId) => {
      const prop = propiedades.find(p => p.id === propId)
      if (prop) {
        const isSelected = selectedIds.has(propId)
        const icon = L.divIcon({
          html: getIconoMOAT(prop.diferencia_pct, prop.categoria_precio, isSelected),
          className: 'custom-marker',
          // Pins seleccionados son más grandes
          iconSize: isSelected ? [40, 50] : [32, 40],
          iconAnchor: isSelected ? [20, 50] : [16, 40]
        })
        marker.setIcon(icon)
      }
    })
  }

  // Manejar toggle con límite y toast MOAT
  const handleToggleSelected = (id: number) => {
    const isCurrentlySelected = selectedIds.has(id)
    if (!isCurrentlySelected && selectedIds.size >= maxSelected) {
      // Mostrar toast MOAT
      setShowLimitToast(true)
      return
    }
    onToggleSelected(id)
  }

  // Actualizar iconos cuando cambia la selección o el mapa está listo
  useEffect(() => {
    if (mapReady) {
      updateMarkerIcons()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, mapReady])

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    if (propsConGPS.length === 0) return

    // Centro inicial: promedio de todas las propiedades o Equipetrol
    const centerLat = propsConGPS.reduce((sum, p) => sum + (p.latitud || 0), 0) / propsConGPS.length || -17.7833
    const centerLng = propsConGPS.reduce((sum, p) => sum + (p.longitud || 0), 0) / propsConGPS.length || -63.1821

    // Crear mapa
    const map = L.map(mapRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: false
    })

    // Agregar tiles de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    // Controles de zoom en posición mobile-friendly
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Crear markers para cada propiedad (inicialmente sin selección, se actualizará después)
    propsConGPS.forEach(prop => {
      const icon = L.divIcon({
        html: getIconoMOAT(prop.diferencia_pct, prop.categoria_precio, false),
        className: 'custom-marker',
        iconSize: [32, 40],
        iconAnchor: [16, 40]
      })

      const marker = L.marker([prop.latitud!, prop.longitud!], { icon })
        .addTo(map)
        .on('click', () => {
          setSelectedProp(prop)
        })

      markersRef.current.set(prop.id, marker)
    })

    // Ajustar bounds para mostrar todos los markers
    if (propsConGPS.length > 1) {
      const bounds = L.latLngBounds(propsConGPS.map(p => [p.latitud!, p.longitud!]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }

    mapInstanceRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapInstanceRef.current = null
      markersRef.current.clear()
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsConGPS.length])

  // Formatear número
  const formatNum = (n: number) => n.toLocaleString('en-US')

  // Check if can select more
  const canSelectMore = selectedIds.size < maxSelected
  const isSelected = selectedProp ? selectedIds.has(selectedProp.id) : false

  // Colores para síntesis
  const getColoresSintesis = (tipo: string) => {
    switch (tipo) {
      case 'oportunidad':
        return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', action: 'text-green-700' }
      case 'sospechoso':
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', action: 'text-amber-700' }
      case 'premium':
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', action: 'text-red-700' }
      default:
        return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-800', action: 'text-slate-700' }
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b">
        <div>
          <h2 className="font-bold text-gray-900">Mapa de Resultados</h2>
          <p className="text-xs text-gray-500">{propsConGPS.length} propiedades · {selectedIds.size}/{maxSelected} seleccionadas</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200"
        >
          ✕
        </button>
      </div>

      {/* Leyenda MOAT */}
      <div className="absolute top-20 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 text-xs shadow">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
          <span>Oportunidad</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-slate-500"></span>
          <span>Precio justo</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-blue-500"></span>
          <span>Premium</span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-1">
          <span className="w-3 h-3 rounded-full bg-amber-400 ring-2 ring-amber-400/50"></span>
          <span>Seleccionado</span>
        </div>
      </div>

      {/* Mapa */}
      <div ref={mapRef} className="w-full h-full pt-16" />

      {/* Card de propiedad seleccionada - Expandido con síntesis */}
      {selectedProp && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[70vh] overflow-y-auto">
          {/* Header del card con foto y datos básicos */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex gap-3">
              {/* Foto */}
              <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                {selectedProp.foto_url ? (
                  <img
                    src={selectedProp.foto_url}
                    alt={selectedProp.proyecto}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                    🏢
                  </div>
                )}
              </div>

              {/* Info básica */}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900 truncate">{selectedProp.proyecto}</h3>
                <p className="text-xl font-bold text-gray-900">
                  ${formatNum(selectedProp.precio_usd)}
                </p>
                <p className="text-sm text-gray-500">
                  {selectedProp.dormitorios}d · {selectedProp.area_m2}m² · ${Math.round(selectedProp.precio_usd / selectedProp.area_m2)}/m²
                </p>
              </div>

              {/* Botón favorito */}
              <button
                onClick={() => handleToggleSelected(selectedProp.id)}
                className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-red-50'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <svg
                  className={`w-6 h-6 transition-all ${
                    isSelected
                      ? 'fill-red-500 stroke-red-500'
                      : 'fill-transparent stroke-gray-400'
                  }`}
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Síntesis Fiduciaria */}
          {selectedProp.sintesisFiduciaria && (
            <div className="p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Síntesis Fiduciaria</h4>
              {(() => {
                const sintesis = selectedProp.sintesisFiduciaria!
                const colores = getColoresSintesis(sintesis.tipo)
                return (
                  <div className={`rounded-lg p-3 ${colores.bg} border ${colores.border}`}>
                    <p className={`font-semibold text-sm mb-2 ${colores.text}`}>
                      {sintesis.headline}
                    </p>
                    {sintesis.detalles && (
                      <div className="text-xs text-gray-600 space-y-1 mb-2">
                        {sintesis.detalles.split('\n').map((linea, i) => (
                          <p key={i}>{linea}</p>
                        ))}
                      </div>
                    )}
                    <p className={`text-xs font-medium ${colores.action}`}>
                      → {sintesis.accion}
                    </p>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Botón cerrar */}
          <div className="p-4 pt-0">
            <button
              onClick={() => setSelectedProp(null)}
              className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Mensaje si no hay GPS */}
      {propsConGPS.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center p-6">
            <span className="text-4xl mb-4 block">📍</span>
            <p className="text-gray-600">No hay propiedades con ubicación GPS disponible</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-800 text-white rounded-lg"
            >
              Volver a resultados
            </button>
          </div>
        </div>
      )}

      {/* Toast MOAT - Límite de selección alcanzado */}
      {showLimitToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[1001] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-gray-900 text-white px-5 py-4 rounded-xl shadow-xl max-w-sm relative">
            <button
              onClick={() => setShowLimitToast(false)}
              className="absolute top-2 right-2 text-gray-400 hover:text-white p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="font-semibold text-sm mb-1 pr-6">¿Por qué solo {maxSelected}?</p>
            <p className="text-xs text-gray-300 leading-relaxed">
              Más opciones = peores decisiones. Con {maxSelected} propiedades analizamos cada detalle a fondo: costos ocultos, historial de precios, y riesgos reales.
              <span className="block mt-2 text-purple-300">El premium ya incluye +10 alternativas como contexto comparativo.</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">Quitá una para agregar esta →</p>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        :global(.custom-marker) {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  )
}
