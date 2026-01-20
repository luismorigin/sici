'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'

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

// Formatear precio compacto
function formatPrecioCompacto(precio: number): string {
  if (precio >= 1000000) {
    return `$${(precio / 1000000).toFixed(1)}M`
  }
  return `$${Math.round(precio / 1000)}k`
}

// Colores MOAT alineados con landing
function getColorMOAT(diferencia_pct: number | null, categoria: string | null): { bg: string, text: string, name: string } {
  if (diferencia_pct === null) return { bg: '#64748B', text: '#FFFFFF', name: 'gray' }
  if (diferencia_pct <= -10 || categoria === 'oportunidad' || categoria === 'bajo_promedio') {
    return { bg: '#10B981', text: '#FFFFFF', name: 'emerald' } // emerald-500
  }
  if (diferencia_pct >= 10 || categoria === 'premium' || categoria === 'sobre_promedio') {
    return { bg: '#3B82F6', text: '#FFFFFF', name: 'blue' } // blue-500
  }
  return { bg: '#64748B', text: '#FFFFFF', name: 'slate' } // slate-500
}

// Crear pin tipo pill con precio
function crearPinConPrecio(precio: number, diferencia_pct: number | null, categoria: string | null, isSelected: boolean): L.DivIcon {
  const { bg } = getColorMOAT(diferencia_pct, categoria)
  const precioTexto = formatPrecioCompacto(precio)

  if (isSelected) {
    // Pin seleccionado: más grande, borde dorado, corazón
    const html = `
      <div class="pin-pill pin-selected">
        <span class="pin-precio">${precioTexto}</span>
        <span class="pin-heart">❤</span>
      </div>
    `
    return L.divIcon({
      html,
      className: 'custom-pin-container',
      iconSize: [90, 36],
      iconAnchor: [45, 36]
    })
  }

  // Pin normal con precio
  const html = `
    <div class="pin-pill" style="background-color: ${bg};">
      <span class="pin-precio">${precioTexto}</span>
    </div>
  `
  return L.divIcon({
    html,
    className: 'custom-pin-container',
    iconSize: [70, 30],
    iconAnchor: [35, 30]
  })
}

export default function MapaResultados({ propiedades, selectedIds, maxSelected, onClose, onToggleSelected }: MapaResultadosProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
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
        const icon = crearPinConPrecio(prop.precio_usd, prop.diferencia_pct, prop.categoria_precio, isSelected)
        marker.setIcon(icon)

        // Traer seleccionados al frente
        if (isSelected) {
          marker.setZIndexOffset(1000)
        } else {
          marker.setZIndexOffset(0)
        }
      }
    })
  }

  // Manejar toggle con límite y toast MOAT
  const handleToggleSelected = (id: number) => {
    const isCurrentlySelected = selectedIds.has(id)
    if (!isCurrentlySelected && selectedIds.size >= maxSelected) {
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

    // Centro inicial
    const centerLat = propsConGPS.reduce((sum, p) => sum + (p.latitud || 0), 0) / propsConGPS.length || -17.7833
    const centerLng = propsConGPS.reduce((sum, p) => sum + (p.longitud || 0), 0) / propsConGPS.length || -63.1821

    // Crear mapa
    const map = L.map(mapRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: false
    })

    // Tiles de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    // Controles de zoom
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Crear cluster group
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div class="cluster-icon">${count}</div>`,
          className: 'custom-cluster-container',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })
      }
    })

    // Crear markers
    propsConGPS.forEach(prop => {
      const icon = crearPinConPrecio(prop.precio_usd, prop.diferencia_pct, prop.categoria_precio, false)

      const marker = L.marker([prop.latitud!, prop.longitud!], { icon })
        .on('click', () => {
          setSelectedProp(prop)
        })

      clusterGroup.addLayer(marker)
      markersRef.current.set(prop.id, marker)
    })

    map.addLayer(clusterGroup)
    clusterGroupRef.current = clusterGroup

    // Ajustar bounds
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
      clusterGroupRef.current = null
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
        return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', action: 'text-emerald-700' }
      case 'sospechoso':
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', action: 'text-amber-700' }
      case 'premium':
        return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', action: 'text-blue-700' }
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
          <span className="w-3 h-3 rounded bg-emerald-500"></span>
          <span>Oportunidad</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded bg-slate-500"></span>
          <span>Precio justo</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded bg-blue-500"></span>
          <span>Premium</span>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-gray-200 mt-1">
          <span className="px-1.5 py-0.5 text-[10px] bg-amber-400 text-white rounded font-bold">$100k ❤</span>
          <span>Elegido</span>
        </div>
      </div>

      {/* Mapa */}
      <div ref={mapRef} className="w-full h-full pt-16" />

      {/* Card de propiedad seleccionada */}
      {selectedProp && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[70vh] overflow-y-auto">
          {/* Header del card */}
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

      {/* Toast MOAT */}
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
              Más opciones = peores decisiones. Con {maxSelected} propiedades analizamos cada detalle a fondo.
              <span className="block mt-2 text-purple-300">El premium incluye +10 alternativas como contexto.</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">Quitá una para agregar esta →</p>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        :global(.custom-pin-container) {
          background: transparent !important;
          border: none !important;
        }
        :global(.pin-pill) {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 12px;
          border-radius: 20px;
          color: white;
          font-weight: 600;
          font-size: 13px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          white-space: nowrap;
          border: 2px solid white;
        }
        :global(.pin-pill::after) {
          content: '';
          position: absolute;
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 8px solid currentColor;
        }
        :global(.pin-selected) {
          background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%) !important;
          border: 3px solid #FCD34D !important;
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.5), 0 4px 12px rgba(0,0,0,0.3);
          font-size: 14px;
          padding: 8px 14px;
        }
        :global(.pin-heart) {
          font-size: 12px;
        }
        :global(.custom-cluster-container) {
          background: transparent !important;
          border: none !important;
        }
        :global(.cluster-icon) {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        :global(.leaflet-marker-icon) {
          transition: transform 0.2s ease;
        }
        :global(.leaflet-marker-icon:hover) {
          transform: scale(1.1);
          z-index: 10000 !important;
        }
      `}</style>
    </div>
  )
}
