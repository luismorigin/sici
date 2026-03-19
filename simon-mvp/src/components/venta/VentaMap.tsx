import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { displayZona } from '@/lib/zonas'

interface VentaMapProperty {
  id: number
  proyecto: string
  zona: string
  dormitorios: number
  precio_usd: number
  precio_m2: number
  area_m2: number
  latitud: number | null
  longitud: number | null
}

interface VentaMapProps {
  properties: VentaMapProperty[]
  onSelectProperty: (id: number) => void
  selectedId?: number | null
}

function formatPricePin(price: number): string {
  if (price >= 1000000) return `$us ${(price / 1000000).toFixed(1)}M`
  if (price >= 1000) return `$us ${Math.round(price / 1000)}k`
  return `$us ${price}`
}

export default function VentaMap({ properties, onSelectProperty, selectedId }: VentaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())

  const makeIcon = useCallback((price: string, isSelected: boolean) => {
    return L.divIcon({
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
      iconSize: [90, 28],
      iconAnchor: [45, 14],
    })
  }, [])

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
      const priceLabel = formatPricePin(p.precio_usd)
      const icon = makeIcon(priceLabel, p.id === selectedId)

      const marker = L.marker([p.latitud!, p.longitud!], { icon })
        .addTo(map)
        .on('click', () => onSelectProperty(p.id))

      const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
      marker.bindTooltip(`
        <div style="font-family:'Manrope',sans-serif;font-size:12px;line-height:1.4;">
          <strong style="font-size:13px;">${p.proyecto}</strong><br/>
          <span style="color:#666;">${displayZona(p.zona)} · ${dorms} · ${Math.round(p.area_m2)}m²</span><br/>
          <span style="color:#b8942e;font-weight:600;">$us ${Math.round(p.precio_usd).toLocaleString('en-US')}</span>
          <span style="color:#999;font-size:11px;"> · $us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²</span>
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
      .venta-map .leaflet-tile { filter: brightness(0.7) contrast(1.1) saturate(0.3); }
      .venta-map .leaflet-control-zoom a { background: #1a1a1a !important; color: #c9a959 !important; border-color: rgba(255,255,255,0.1) !important; }
      .venta-map .leaflet-tooltip { background: #fff; border: none; border-radius: 8px; padding: 8px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
      .venta-map .leaflet-tooltip-top::before { border-top-color: #fff; }
    `
    mapRef.current.appendChild(style)

    setTimeout(() => map.invalidateSize(), 100)
  }, [properties, onSelectProperty, selectedId, makeIcon])

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

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const p = properties.find(x => x.id === id)
      if (!p) return
      marker.setIcon(makeIcon(formatPricePin(p.precio_usd), id === selectedId))
    })
  }, [selectedId, properties, makeIcon])

  return <div ref={mapRef} className="venta-map" style={{ width: '100%', height: '100%' }} />
}
