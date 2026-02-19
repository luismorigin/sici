import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Property {
  id: number
  nombre_edificio: string | null
  nombre_proyecto: string | null
  zona: string
  dormitorios: number
  precio_mensual_bob: number
  area_m2: number
  amoblado: string | null
  latitud: number | null
  longitud: number | null
  fotos_urls: string[]
}

interface AlquilerMapMultiProps {
  properties: Property[]
  onSelectProperty: (id: number) => void
  selectedId?: number | null
}

export default function AlquilerMapMulti({ properties, onSelectProperty, selectedId }: AlquilerMapMultiProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])

  const dormLabel = (d: number) => d === 0 ? 'Estudio' : d + ' dorm'

  const buildMap = useCallback(() => {
    if (!mapRef.current) return

    // Clean up
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }
    markersRef.current = []

    const validProps = properties.filter(p => p.latitud && p.longitud)
    if (validProps.length === 0) return

    // Center on Equipetrol
    const centerLat = validProps.reduce((s, p) => s + p.latitud!, 0) / validProps.length
    const centerLng = validProps.reduce((s, p) => s + p.longitud!, 0) / validProps.length

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([centerLat, centerLng], 15)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    // Add markers
    validProps.forEach(p => {
      const isSelected = p.id === selectedId
      const name = p.nombre_edificio || p.nombre_proyecto || 'Depto'
      const price = 'Bs ' + p.precio_mensual_bob.toLocaleString('es-BO')

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${isSelected ? '#c9a959' : '#0a0a0a'};
          color:${isSelected ? '#0a0a0a' : '#c9a959'};
          border:2px solid #c9a959;
          padding:4px 10px;
          border-radius:20px;
          font-size:11px;
          font-weight:600;
          font-family:'Manrope',sans-serif;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.5);
          cursor:pointer;
          transition:all 0.2s;
        ">${price}</div>`,
        iconSize: [80, 28],
        iconAnchor: [40, 14],
      })

      const marker = L.marker([p.latitud!, p.longitud!], { icon })
        .addTo(map)
        .on('click', () => onSelectProperty(p.id))

      // Tooltip on hover
      marker.bindTooltip(`
        <div style="font-family:'Manrope',sans-serif;font-size:12px;line-height:1.4;">
          <strong style="font-size:13px;">${name}</strong><br/>
          <span style="color:#666;">${p.zona} · ${dormLabel(p.dormitorios)} · ${p.area_m2}m²</span><br/>
          <span style="color:#b8942e;font-weight:600;">${price}/mes</span>
        </div>
      `, { direction: 'top', offset: [0, -10] })

      markersRef.current.push(marker)
    })

    // Fit bounds
    if (validProps.length > 1) {
      const bounds = L.latLngBounds(validProps.map(p => [p.latitud!, p.longitud!] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }

    mapInstance.current = map

    // Dark tiles
    const style = document.createElement('style')
    style.textContent = `
      .alq-map-multi .leaflet-tile { filter: brightness(0.7) contrast(1.1) saturate(0.3); }
      .alq-map-multi .leaflet-control-zoom a { background: #1a1a1a !important; color: #c9a959 !important; border-color: rgba(255,255,255,0.1) !important; }
      .alq-map-multi .leaflet-tooltip { background: #fff; border: none; border-radius: 8px; padding: 8px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
      .alq-map-multi .leaflet-tooltip-top::before { border-top-color: #fff; }
    `
    mapRef.current.appendChild(style)

    // Recalculate after render
    setTimeout(() => map.invalidateSize(), 100)
  }, [properties, selectedId, onSelectProperty])

  useEffect(() => {
    const timer = setTimeout(buildMap, 200)
    return () => {
      clearTimeout(timer)
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
  }, [buildMap])

  return <div ref={mapRef} className="alq-map-multi" style={{ width: '100%', height: '100%' }} />
}
