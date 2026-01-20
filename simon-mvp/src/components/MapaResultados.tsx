'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
}

interface MapaResultadosProps {
  propiedades: PropiedadMapa[]
  onClose: () => void
  onVerDetalle: (id: number) => void
}

// Colores MOAT para los pins
function getColorMOAT(diferencia_pct: number | null, categoria: string | null): string {
  if (diferencia_pct === null) return '#6B7280' // gray
  if (diferencia_pct <= -10 || categoria === 'oportunidad') return '#22C55E' // green
  if (diferencia_pct >= 10 || categoria === 'premium' || categoria === 'sobre_promedio') return '#EF4444' // red
  return '#F59E0B' // yellow - precio justo
}

function getIconoMOAT(diferencia_pct: number | null, categoria: string | null): string {
  const color = getColorMOAT(diferencia_pct, categoria)
  return `
    <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 8.837 16 24 16 24s16-15.163 16-24C32 7.163 24.837 0 16 0z" fill="${color}" stroke="white" stroke-width="2"/>
      <circle cx="16" cy="16" r="8" fill="white"/>
    </svg>
  `
}

export default function MapaResultados({ propiedades, onClose, onVerDetalle }: MapaResultadosProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [selectedProp, setSelectedProp] = useState<PropiedadMapa | null>(null)

  // Filtrar propiedades con GPS válido
  const propsConGPS = propiedades.filter(p => p.latitud && p.longitud)

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

    // Crear markers para cada propiedad
    propsConGPS.forEach(prop => {
      const icon = L.divIcon({
        html: getIconoMOAT(prop.diferencia_pct, prop.categoria_precio),
        className: 'custom-marker',
        iconSize: [32, 40],
        iconAnchor: [16, 40]
      })

      const marker = L.marker([prop.latitud!, prop.longitud!], { icon })
        .addTo(map)
        .on('click', () => {
          setSelectedProp(prop)
        })
    })

    // Ajustar bounds para mostrar todos los markers
    if (propsConGPS.length > 1) {
      const bounds = L.latLngBounds(propsConGPS.map(p => [p.latitud!, p.longitud!]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [propsConGPS])

  // Formatear número
  const formatNum = (n: number) => n.toLocaleString('en-US')

  // Obtener badge MOAT
  const getBadgeMOAT = (diferencia_pct: number | null, categoria: string | null) => {
    if (diferencia_pct === null) return null
    const esBajo = diferencia_pct < 0
    const color = getColorMOAT(diferencia_pct, categoria)
    const bgColor = color === '#22C55E' ? 'bg-green-100 text-green-700'
                  : color === '#EF4444' ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${bgColor}`}>
        {Math.abs(Math.round(diferencia_pct))}% {esBajo ? 'bajo' : 'sobre'}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b">
        <div>
          <h2 className="font-bold text-gray-900">Mapa de Resultados</h2>
          <p className="text-xs text-gray-500">{propsConGPS.length} propiedades con ubicación</p>
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
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
          <span>Oportunidad</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
          <span>Precio justo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span>Premium</span>
        </div>
      </div>

      {/* Mapa */}
      <div ref={mapRef} className="w-full h-full pt-16" />

      {/* Card de propiedad seleccionada */}
      {selectedProp && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-2xl shadow-2xl p-4 animate-slide-up">
          <div className="flex gap-3">
            {/* Foto */}
            <div className="w-24 h-24 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
              {selectedProp.foto_url ? (
                <img
                  src={selectedProp.foto_url}
                  alt={selectedProp.proyecto}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  📷
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-gray-900 truncate">{selectedProp.proyecto}</h3>
                {getBadgeMOAT(selectedProp.diferencia_pct, selectedProp.categoria_precio)}
              </div>
              <p className="text-xl font-bold text-gray-900 mt-1">
                ${formatNum(selectedProp.precio_usd)}
              </p>
              <p className="text-sm text-gray-500">
                {selectedProp.dormitorios}d · {selectedProp.area_m2}m²
              </p>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setSelectedProp(null)}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium"
            >
              Cerrar
            </button>
            <button
              onClick={() => {
                onVerDetalle(selectedProp.id)
                onClose()
              }}
              className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium"
            >
              Ver análisis
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
