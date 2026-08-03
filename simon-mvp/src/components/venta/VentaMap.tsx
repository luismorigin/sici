import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import { displayZona } from '@/lib/zonas'
import { dormLabelOrNull } from '@/lib/format-utils'

interface VentaMapProperty {
  id: number
  proyecto: string
  zona: string
  dormitorios: number | null   // null = el aviso no lo declara (ver dormLabel)
  precio_usd: number
  precio_m2: number
  area_m2: number
  latitud: number | null
  longitud: number | null
}

// Encuadre visible del mapa, en grados (para el filtro "Buscar en esta zona").
export interface MapViewBounds {
  north: number
  south: number
  east: number
  west: number
}

interface VentaMapProps {
  properties: VentaMapProperty[]
  onSelectProperty: (id: number) => void
  selectedId?: number | null
  // Emite el encuadre tras cada movimiento del USUARIO (drag/zoom/cluster).
  // Los movimientos programáticos (fitBounds por cambio de filtro, panTo del
  // highlight, invalidateSize) NO emiten — si emitieran, el botón "Buscar en
  // esta zona" aparecería solo. Opcional: broker/mobile/modal no lo pasan.
  onUserMove?: (bounds: MapViewBounds) => void
}

// Teardown seguro: si el mapa muere en plena animación (unmount por toggle de
// vista), Leaflet puede disparar _onZoomTransitionEnd sobre un pane ya
// removido → "_leaflet_pos undefined". stop() corta animaciones en curso y el
// try/catch traga cualquier resto.
function safeRemoveMap(map: L.Map | null) {
  if (!map) return
  try { map.stop() } catch { /* ya detenido */ }
  try { map.remove() } catch { /* ya removido */ }
}

const TILES_CALLE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

function formatPricePin(price: number): string {
  if (price >= 1000000) return `$us ${(price / 1000000).toFixed(1)}M`
  if (price >= 1000) return `$us ${Math.round(price / 1000)}k`
  return `$us ${price}`
}

// El mapa se construye UNA vez (cuando llega el primer dataset con GPS) y solo
// se destruye al desmontar. Los cambios de `properties` repueblan los markers
// sin tocar la instancia Leaflet: antes, cualquier cambio de identidad del
// array o del handler reconstruía el mapa entero y el fitBounds reseteaba
// zoom/centro (deuda 24-jun, y bloqueante para el filtro por área del mapa).
export default function VentaMap({ properties, onSelectProperty, selectedId, onUserMove }: VentaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  // Anillo de resalte (hover en la card): marca el punto EXACTO por encima de
  // los clusters, así se ubica la propiedad aunque su pin esté agrupado.
  const highlightRef = useRef<L.Marker | null>(null)
  // Los markers llaman siempre la versión más reciente del handler: su
  // identidad deja de importar (los feeds lo pasan como arrow inline).
  const onSelectRef = useRef(onSelectProperty)
  onSelectRef.current = onSelectProperty
  // Firma de lo ya dibujado: si los avisos (id+precio) no cambiaron, un array
  // nuevo con el mismo contenido no redibuja ni re-encuadra nada.
  const drawnKeyRef = useRef<string | null>(null)
  const onUserMoveRef = useRef(onUserMove)
  onUserMoveRef.current = onUserMove
  // Ventana de supresión para movimientos programáticos: moveend no distingue
  // usuario de código, así que antes de cada fitBounds/setView/panTo se abre
  // una ventana corta en la que el listener no emite. Timestamp (no contador):
  // un setView a la misma vista puede NO disparar moveend y un contador
  // quedaría desincronizado tragándose el próximo movimiento real.
  const suppressUntilRef = useRef(0)
  const suppressMoves = useCallback((ms: number) => {
    suppressUntilRef.current = Math.max(suppressUntilRef.current, Date.now() + ms)
  }, [])

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

  // Construcción base (una vez): instancia, tiles, cluster vacío, estilos.
  const buildBase = useCallback((validProps: VentaMapProperty[]) => {
    if (!mapRef.current) return null

    const centerLat = validProps.reduce((s, p) => s + p.latitud!, 0) / validProps.length
    const centerLng = validProps.reduce((s, p) => s + p.longitud!, 0) / validProps.length

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
      // Sin animación CSS de zoom: elimina la clase entera de crashes
      // _onZoomTransitionEnd/_leaflet_pos cuando el mapa se desmonta en medio
      // de un zoom (feed re-renderiza seguido).
      zoomAnimation: false,
      markerZoomAnimation: false,
    }).setView([centerLat, centerLng], 15)

    L.tileLayer(TILES_CALLE, { maxZoom: 20 }).addTo(map)

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

    map.addLayer(clusterGroup)
    clusterGroupRef.current = clusterGroup
    mapInstance.current = map

    // Toda la secuencia de construcción (setView inicial + populate + fitBounds
    // + invalidateSize, repartida en timers) es programática: ventana ancha.
    suppressMoves(1500)

    map.on('moveend', () => {
      if (Date.now() < suppressUntilRef.current) return
      const emit = onUserMoveRef.current
      if (!emit) return
      const b = map.getBounds()
      emit({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
    })

    const style = document.createElement('style')
    style.textContent = `
      .venta-map .leaflet-tile { filter: brightness(1.05) saturate(0.4) sepia(0.15); }
      .venta-map .leaflet-control-zoom a { background: #FAFAF8 !important; color: #141414 !important; border-color: #D8D0BC !important; }
      .venta-map .leaflet-tooltip { background: #FAFAF8; border: 1px solid #D8D0BC; border-radius: 14px; padding: 10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .venta-map .leaflet-tooltip-top::before { border-top-color: #FAFAF8; }
    `
    mapRef.current.appendChild(style)

    setTimeout(() => {
      suppressMoves(400)
      map.invalidateSize()
      // Una sola propiedad (mapa del modal de detalle): tras recalcular el
      // tamaño real del contenedor, re-centrar EXACTO en el pin y acercar un
      // poco (si no, el invalidateSize deja el pin descentrado).
      if (validProps.length === 1) {
        map.setView([validProps[0].latitud!, validProps[0].longitud!], 16)
      }
    }, 100)

    return map
  }, [suppressMoves])

  // Sincronización de markers: limpia y repuebla el cluster cuando cambia el
  // dataset. NO reconstruye el mapa; re-encuadra (fitBounds) solo cuando los
  // avisos realmente cambiaron (filtro/refetch), nunca por re-renders.
  useEffect(() => {
    const validProps = properties.filter(p => p.latitud && p.longitud)
    const key = validProps.map(p => `${p.id}:${p.precio_usd}`).join('|')
    if (key === drawnKeyRef.current && mapInstance.current) return

    let cancelled = false
    const draw = () => {
      if (cancelled || !mapRef.current) return

      if (validProps.length === 0) {
        // Filtro sin resultados: pins fuera, el encuadre se queda donde estaba.
        clusterGroupRef.current?.clearLayers()
        markersRef.current.clear()
        drawnKeyRef.current = key
        return
      }

      if (!mapInstance.current) buildBase(validProps)
      const map = mapInstance.current
      const clusterGroup = clusterGroupRef.current
      if (!map || !clusterGroup) return

      clusterGroup.clearLayers()
      markersRef.current.clear()

      // Mapa del modal de detalle (una sola propiedad): pin clásico de gota que
      // apunta EXACTO al punto (la punta), en vez del bocadillo de precio.
      const singleProperty = validProps.length === 1
      const pinIcon = L.divIcon({
        className: '',
        html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26C32 7.2 24.8 0 16 0z" fill="#3A6A48" stroke="#2C5138" stroke-width="1"/>
          <circle cx="16" cy="16" r="5.5" fill="#FBFAF7"/>
        </svg>`,
        iconSize: [32, 42],
        iconAnchor: [16, 42],
      })

      validProps.forEach(p => {
        const priceLabel = formatPricePin(p.precio_usd)
        const icon = singleProperty ? pinIcon : makeIcon(priceLabel, false)

        const marker = L.marker([p.latitud!, p.longitud!], { icon })
          .on('click', () => onSelectRef.current(p.id))

        // Sin dato de tipología se OMITE el segmento (antes imprimía "null dorm" en el globo).
        const dorms = dormLabelOrNull(p.dormitorios)
        marker.bindTooltip(`
          <div style="font-family:'DM Sans',sans-serif;font-size:13px;line-height:1.4;">
            <strong style="font-family:'Figtree',sans-serif;font-size:14px;font-weight:500;">${p.proyecto}</strong><br/>
            <span style="color:#7A7060;">${displayZona(p.zona)}${dorms ? ` · ${dorms}` : ''} · ${Math.round(p.area_m2)}m²</span><br/>
            <span style="color:#141414;font-weight:600;font-variant-numeric:tabular-nums;">$us ${Math.round(p.precio_usd).toLocaleString('en-US')}</span>
            <span style="color:#7A7060;font-size:11px;"> · $us ${Math.round(p.precio_m2).toLocaleString('en-US')}/m²</span>
          </div>
        `, { direction: 'top', offset: [0, -10] })

        clusterGroup.addLayer(marker)
        markersRef.current.set(p.id, marker)
      })

      suppressMoves(400)
      if (validProps.length > 1) {
        const bounds = L.latLngBounds(validProps.map(p => [p.latitud!, p.longitud!] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40] })
      } else {
        map.setView([validProps[0].latitud!, validProps[0].longitud!], 16)
      }

      drawnKeyRef.current = key
    }

    // La primera construcción espera a que el contenedor tenga tamaño real;
    // los redibujados posteriores son inmediatos.
    const timer = setTimeout(draw, mapInstance.current ? 0 : 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [properties, makeIcon, buildBase, suppressMoves])

  // Teardown SOLO al desmontar.
  useEffect(() => {
    const markers = markersRef.current
    return () => {
      if (mapInstance.current) {
        // map.stop() puede disparar un último moveend en el mapa moribundo →
        // emitiría un falso "movimiento de usuario" justo al cambiar de vista.
        suppressUntilRef.current = Number.MAX_SAFE_INTEGER
        safeRemoveMap(mapInstance.current)
        mapInstance.current = null
        clusterGroupRef.current = null
        highlightRef.current = null
        markers.clear()
        drawnKeyRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // Una sola propiedad (modal): usa pin de gota fijo, no re-iconar con el
    // bocadillo de precio al cambiar selectedId.
    if (properties.filter(p => p.latitud && p.longitud).length <= 1) return
    markersRef.current.forEach((marker, id) => {
      const p = properties.find(x => x.id === id)
      if (!p) return
      marker.setIcon(makeIcon(formatPricePin(p.precio_usd), id === selectedId))
    })
    // Ubicar la propiedad seleccionada (hover en la card): anillo de resalte en
    // el punto EXACTO (por encima de clusters) + pan suave. Sin rebuild.
    const map = mapInstance.current
    if (!map) return
    const sel = selectedId != null ? properties.find(x => x.id === selectedId) : null
    if (sel && sel.latitud && sel.longitud) {
      const ll: [number, number] = [sel.latitud, sel.longitud]
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:42px;height:42px;border-radius:50%;background:rgba(58,106,72,0.22);border:2px solid #3A6A48;box-shadow:0 0 0 5px rgba(58,106,72,0.12)"></div>`,
        iconSize: [42, 42], iconAnchor: [21, 21],
      })
      if (!highlightRef.current) {
        highlightRef.current = L.marker(ll, { icon, zIndexOffset: 2000, interactive: false }).addTo(map)
      } else {
        highlightRef.current.setLatLng(ll).setIcon(icon)
        if (!map.hasLayer(highlightRef.current)) highlightRef.current.addTo(map)
      }
      // Solo re-centra si el punto está fuera de vista (evita paneos bruscos
      // al recorrer la lista cuando la propiedad ya se ve en el mapa).
      try { if (!map.getBounds().contains(ll)) { suppressMoves(900); map.panTo(ll, { animate: true, duration: 0.35 }) } } catch { /* best-effort */ }
    } else if (highlightRef.current && map.hasLayer(highlightRef.current)) {
      map.removeLayer(highlightRef.current)
    }
  }, [selectedId, properties, makeIcon, suppressMoves])

  return <div ref={mapRef} className="venta-map" style={{ width: '100%', height: '100%' }} />
}
