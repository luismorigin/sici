import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
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
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)

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
    clusterGroupRef.current = null

    const validProps = properties.filter(p => p.latitud && p.longitud)
    if (validProps.length === 0) return

    const centerLat = validProps.reduce((s, p) => s + p.latitud!, 0) / validProps.length
    const centerLng = validProps.reduce((s, p) => s + p.longitud!, 0) / validProps.length

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([centerLat, centerLng], 15)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<div style="
            background:#141414;
            color:#EDE8DC;
            width:36px;height:36px;
            border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            font-size:13px;font-weight:600;
            font-family:'DM Sans',sans-serif;
            box-shadow:0 2px 8px rgba(0,0,0,0.25);
            border:2px solid #D8D0BC;
          ">${count}</div>`,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        })
      },
    })

    validProps.forEach(p => {
      const priceLabel = formatPricePin(p.precio_usd)
      const icon = makeIcon(priceLabel, false)

      const marker = L.marker([p.latitud!, p.longitud!], { icon })
        .on('click', () => onSelectProperty(p.id))

      const dorms = p.dormitorios === 0 ? 'Mono' : `${p.dormitorios} dorm`
      marker.bindTooltip(`
        <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.4;">
          <strong style="font-family:'Figtree',sans-serif;font-size:14px;font-weight:500;">${p.proyecto}</strong><br/>
          <span style="color:#7A7060;">${displayZona(p.zona)} · ${dorms} · ${Math.round(p.area_m2)}m²</span><br/>
          <span style="color:#141414;font-weight:600;font-variant-numeric:tabular-nums;">$us ${Math.round(p.precio_usd).toLocaleString('en-US')}</span>
          <span style="color:#7A7060;font-size:11px;"> · $us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²</span>
        </div>
      `, { direction: 'top', offset: [0, -10] })

      clusterGroup.addLayer(marker)
      markersRef.current.set(p.id, marker)
    })

    map.addLayer(clusterGroup)
    clusterGroupRef.current = clusterGroup

    if (validProps.length > 1) {
      const bounds = L.latLngBounds(validProps.map(p => [p.latitud!, p.longitud!] as [number, number]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }

    mapInstance.current = map

    const style = document.createElement('style')
    style.textContent = `
      .venta-map .leaflet-tile { filter: brightness(1.05) saturate(0.4) sepia(0.15); }
      .venta-map .leaflet-control-zoom a { background: #FAFAF8 !important; color: #141414 !important; border-color: #D8D0BC !important; }
      .venta-map .leaflet-tooltip { background: #FAFAF8; border: 1px solid #D8D0BC; border-radius: 14px; padding: 10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .venta-map .leaflet-tooltip-top::before { border-top-color: #FAFAF8; }
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

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const p = properties.find(x => x.id === id)
      if (!p) return
      marker.setIcon(makeIcon(formatPricePin(p.precio_usd), id === selectedId))
    })
  }, [selectedId, properties, makeIcon])

  return <div ref={mapRef} className="venta-map" style={{ width: '100%', height: '100%' }} />
}
