import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dormLabel } from '@/lib/format-utils'

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
  const markersRef = useRef<Map<number, L.Marker>>(new Map())

  const makeIcon = useCallback((price: string, isSelected: boolean) => {
    return L.divIcon({
      className: '',
      html: `<div style="
        background:${isSelected ? '#141414' : '#FAFAF8'};
        color:${isSelected ? '#EDE8DC' : '#141414'};
        border:2px solid ${isSelected ? '#141414' : '#D8D0BC'};
        padding:4px 10px;
        border-radius:20px;
        font-size:12px;
        font-weight:600;
        font-family:'DM Sans',sans-serif;
        white-space:nowrap;
        box-shadow:0 2px 8px rgba(0,0,0,0.15);
        cursor:pointer;
        transition:all 0.2s;
        font-variant-numeric:tabular-nums;
      ">${price}</div>`,
      iconSize: [80, 28],
      iconAnchor: [40, 14],
    })
  }, [])

  // Build map only when properties change (NOT selectedId)
  const buildMap = useCallback(() => {
    if (!mapRef.current) return

    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }
    markersRef.current.clear()

    const validProps = properties.filter(p => p.latitud && p.longitud)
    if (validProps.length === 0) return

    const centerLat = validProps.reduce((s, p) => s + p.latitud!, 0) / validProps.length
    const centerLng = validProps.reduce((s, p) => s + p.longitud!, 0) / validProps.length

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([centerLat, centerLng], 15)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    validProps.forEach(p => {
      const name = p.nombre_edificio || p.nombre_proyecto || 'Depto'
      const price = 'Bs ' + p.precio_mensual_bob.toLocaleString('es-BO')

      const icon = makeIcon(price, false)

      const marker = L.marker([p.latitud!, p.longitud!], { icon })
        .addTo(map)
        .on('click', () => onSelectProperty(p.id))

      marker.bindTooltip(`
        <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.4;">
          <strong style="font-family:'Figtree',sans-serif;font-size:14px;font-weight:500;">${name}</strong><br/>
          <span style="color:#7A7060;">${p.zona} · ${dormLabel(p.dormitorios)} · ${p.area_m2}m²</span><br/>
          <span style="color:#141414;font-weight:600;font-variant-numeric:tabular-nums;">${price}/mes</span>
        </div>
      `, { direction: 'top', offset: [0, -10] })

      markersRef.current.set(p.id, marker)
    })

    if (validProps.length > 1) {
      const bounds = L.latLngBounds(validProps.map(p => [p.latitud!, p.longitud!] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }

    mapInstance.current = map

    const style = document.createElement('style')
    style.textContent = `
      .alq-map-multi .leaflet-tile { filter: brightness(1.05) saturate(0.4) sepia(0.15); }
      .alq-map-multi .leaflet-control-zoom a { background: #FAFAF8 !important; color: #141414 !important; border-color: #D8D0BC !important; }
      .alq-map-multi .leaflet-tooltip { background: #FAFAF8; border: 1px solid #D8D0BC; border-radius: 14px; padding: 10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .alq-map-multi .leaflet-tooltip-top::before { border-top-color: #FAFAF8; }
    `
    mapRef.current.appendChild(style)

    setTimeout(() => map.invalidateSize(), 100)
  }, [properties, onSelectProperty, makeIcon])

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

  // Update marker icons when selection changes (no map rebuild)
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const p = properties.find(x => x.id === id)
      if (!p) return
      const price = 'Bs ' + p.precio_mensual_bob.toLocaleString('es-BO')
      marker.setIcon(makeIcon(price, id === selectedId))
    })
  }, [selectedId, properties, makeIcon])

  return <div ref={mapRef} className="alq-map-multi" style={{ width: '100%', height: '100%' }} />
}
