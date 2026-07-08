import { useEffect, useRef, useCallback, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
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

// Teardown seguro: si el mapa muere en plena animación (rebuild por cambio de
// properties, unmount por toggle de vista), Leaflet puede disparar
// _onZoomTransitionEnd sobre un pane ya removido → "_leaflet_pos undefined".
// stop() corta animaciones en curso y el try/catch traga cualquier resto.
function safeRemoveMap(map: L.Map | null) {
  if (!map) return
  try { map.stop() } catch { /* ya detenido */ }
  try { map.remove() } catch { /* ya removido */ }
}

// Capas de tiles: callejero (OSM) y satelital (Esri World Imagery, gratuita).
const TILES_CALLE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILES_SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export default function AlquilerMapMulti({ properties, onSelectProperty, selectedId }: AlquilerMapMultiProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  // Modo satélite RESILIENTE: la capa de calles (OSM) NUNCA se remueve — el
  // satélite se agrega ENCIMA (zIndex 2) y al volver solo se quita esa capa.
  // Si las tiles satelitales no cargan (red/firewall), el usuario sigue viendo
  // el mapa de calles en vez de un fondo vacío.
  const [satellite, setSatellite] = useState(false)
  const satelliteRef = useRef(false)
  const satLayerRef = useRef<L.TileLayer | null>(null)

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
      safeRemoveMap(mapInstance.current)
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
      // Sin animación CSS de zoom: elimina la clase entera de crashes
      // _onZoomTransitionEnd/_leaflet_pos cuando el mapa se reconstruye o
      // desmonta en medio de un zoom (feed re-renderiza seguido).
      zoomAnimation: false,
      markerZoomAnimation: false,
    }).setView([centerLat, centerLng], 15)

    L.tileLayer(TILES_CALLE).addTo(map)
    satLayerRef.current = satelliteRef.current ? L.tileLayer(TILES_SATELITE, { zIndex: 2 }).addTo(map) : null

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
      const name = p.nombre_edificio || p.nombre_proyecto || 'Depto'
      const price = 'Bs ' + p.precio_mensual_bob.toLocaleString('es-BO')

      const icon = makeIcon(price, false)

      const marker = L.marker([p.latitud!, p.longitud!], { icon })
        .on('click', () => onSelectProperty(p.id))

      marker.bindTooltip(`
        <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.4;">
          <strong style="font-family:'Figtree',sans-serif;font-size:14px;font-weight:500;">${name}</strong><br/>
          <span style="color:#7A7060;">${p.zona} · ${dormLabel(p.dormitorios)} · ${p.area_m2}m²</span><br/>
          <span style="color:#141414;font-weight:600;font-variant-numeric:tabular-nums;">${price}/mes</span>
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
      .alq-map-multi .leaflet-tile { filter: brightness(1.05) saturate(0.4) sepia(0.15); }
      .alq-map-multi.map-sat .leaflet-tile { filter: none; }
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
        safeRemoveMap(mapInstance.current)
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

  // Toggle satélite: agrega/quita SOLO la capa satelital (la base queda intacta)
  useEffect(() => {
    satelliteRef.current = satellite
    const map = mapInstance.current
    if (!map) return
    if (satellite) {
      if (!satLayerRef.current) {
        try { satLayerRef.current = L.tileLayer(TILES_SATELITE, { zIndex: 2 }).addTo(map) } catch { satLayerRef.current = null }
      }
    } else if (satLayerRef.current) {
      try { map.removeLayer(satLayerRef.current) } catch { /* mapa muerto */ }
      satLayerRef.current = null
    }
  }, [satellite])

  return (
    <div className="alq-map-multi-wrap" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} className={`alq-map-multi ${satellite ? 'map-sat' : ''}`} style={{ position: 'absolute', inset: 0 }} />
      <button type="button" aria-pressed={satellite} onClick={() => setSatellite(s => !s)}
        style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 1000, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(20,20,20,0.85)', color: '#EDE8DC', border: '1px solid rgba(237,232,220,0.25)', padding: '7px 13px', borderRadius: 100, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
        {satellite ? 'Mapa' : 'Satélite'}
      </button>
    </div>
  )
}
