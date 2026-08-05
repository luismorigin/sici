import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import { dormLabel } from '@/lib/format-utils'
import type { MapViewBounds } from '@/components/venta/VentaMap'

export type { MapViewBounds }

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
  // Emite el encuadre tras cada movimiento del USUARIO (drag/zoom/cluster).
  // Los movimientos programáticos (fitBounds por cambio de filtro, panTo del
  // highlight, invalidateSize, teardown) NO emiten. Opcional: broker/mobile
  // no lo pasan. Espejo de VentaMap.
  onUserMove?: (bounds: MapViewBounds) => void
  // Como onUserMove, pero además emite el encuadre INICIAL (una vez, tras
  // dibujar). Lo usa el carrusel mobile. Respeta la misma supresión: el panTo
  // del highlight movería el mapa → nuevo encuadre → nueva lista → nuevo
  // highlight → panTo… (bucle real, detectado el 3-ago).
  onViewportChange?: (bounds: MapViewBounds) => void
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

// El mapa se construye UNA vez (cuando llega el primer dataset con GPS) y solo
// se destruye al desmontar. Los cambios de `properties` repueblan los markers
// sin tocar la instancia Leaflet: antes, cualquier cambio de identidad del
// array o del handler reconstruía el mapa entero y el fitBounds reseteaba
// zoom/centro (deuda 24-jun, y bloqueante para el filtro por área del mapa).
export default function AlquilerMapMulti({ properties, onSelectProperty, selectedId, onUserMove, onViewportChange }: AlquilerMapMultiProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<number, L.Marker>>(new Map())
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
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
  const onViewportRef = useRef(onViewportChange)
  onViewportRef.current = onViewportChange
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
      iconSize: [80, 28],
      iconAnchor: [40, 14],
    })
  }, [])

  // Construcción base (una vez): instancia, tiles, cluster vacío, estilos.
  const buildBase = useCallback((validProps: Property[]) => {
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

    L.tileLayer(TILES_CALLE).addTo(map)

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
      const b = map.getBounds()
      const box = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
      onViewportRef.current?.(box)
      onUserMoveRef.current?.(box)
    })

    const style = document.createElement('style')
    style.textContent = `
      .alq-map-multi .leaflet-tile { filter: brightness(1.05) saturate(0.4) sepia(0.15); }
      .alq-map-multi .leaflet-control-zoom a { background: #FAFAF8 !important; color: #141414 !important; border-color: #D8D0BC !important; }
      .alq-map-multi .leaflet-tooltip { background: #FAFAF8; border: 1px solid #D8D0BC; border-radius: 14px; padding: 10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
      .alq-map-multi .leaflet-tooltip-top::before { border-top-color: #FAFAF8; }
    `
    mapRef.current.appendChild(style)

    setTimeout(() => { suppressMoves(400); map.invalidateSize() }, 100)

    return map
  }, [suppressMoves])

  // Sincronización de markers: limpia y repuebla el cluster cuando cambia el
  // dataset. NO reconstruye el mapa; re-encuadra (fitBounds) solo cuando los
  // avisos realmente cambiaron (filtro/refetch), nunca por re-renders.
  useEffect(() => {
    const validProps = properties.filter(p => p.latitud && p.longitud)
    const key = validProps.map(p => `${p.id}:${p.precio_mensual_bob}`).join('|')
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

      validProps.forEach(p => {
        const name = p.nombre_edificio || p.nombre_proyecto || 'Depto'
        const price = 'Bs ' + p.precio_mensual_bob.toLocaleString('es-BO')

        const icon = makeIcon(price, false)

        const marker = L.marker([p.latitud!, p.longitud!], { icon })
          .on('click', () => onSelectRef.current(p.id))

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

      suppressMoves(400)
      if (validProps.length > 1) {
        const bounds = L.latLngBounds(validProps.map(p => [p.latitud!, p.longitud!] as [number, number]))
        map.fitBounds(bounds, { padding: [40, 40] })
      } else {
        map.setView([validProps[0].latitud!, validProps[0].longitud!], 16)
      }

      drawnKeyRef.current = key

      // Encuadre inicial para quien se actualiza solo (carrusel mobile).
      if (onViewportRef.current) {
        setTimeout(() => {
          if (cancelled || !mapInstance.current) return
          const b = mapInstance.current.getBounds()
          onViewportRef.current?.({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
        }, 160)
      }
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

  // Update marker icons when selection changes (no map rebuild)
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const p = properties.find(x => x.id === id)
      if (!p) return
      const price = 'Bs ' + p.precio_mensual_bob.toLocaleString('es-BO')
      marker.setIcon(makeIcon(price, id === selectedId))
    })
    // Ubicar la propiedad seleccionada (hover en la card): anillo de resalte en
    // el punto EXACTO (por encima de clusters) + pan suave si está fuera de vista.
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
      try { if (!map.getBounds().contains(ll)) { suppressMoves(900); map.panTo(ll, { animate: true, duration: 0.35 }) } } catch { /* best-effort */ }
    } else if (highlightRef.current && map.hasLayer(highlightRef.current)) {
      map.removeLayer(highlightRef.current)
    }
  }, [selectedId, properties, makeIcon, suppressMoves])

  return <div ref={mapRef} className="alq-map-multi" style={{ width: '100%', height: '100%' }} />
}
