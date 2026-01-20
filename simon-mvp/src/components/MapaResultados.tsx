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
  fotos_urls: string[] // Array de fotos
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

// Rangos de precio predefinidos
const RANGOS_PRECIO = [
  { id: 'cualquiera', label: 'Cualquier precio', min: 0, max: Infinity },
  { id: '0-100', label: '$0 - $100k', min: 0, max: 100000 },
  { id: '100-200', label: '$100k - $200k', min: 100000, max: 200000 },
  { id: '200-300', label: '$200k - $300k', min: 200000, max: 300000 },
  { id: '300+', label: '$300k+', min: 300000, max: Infinity },
]

// Top 13 = 3 recomendadas + 10 alternativas
const TOP_13_COUNT = 13

// Categorías MOAT
type CategoriaFiltro = 'oportunidad' | 'justo' | 'premium'
type ConjuntoBase = 'top13' | 'todas'

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
    return { bg: '#10B981', text: '#FFFFFF', name: 'emerald' }
  }
  if (diferencia_pct >= 10 || categoria === 'premium' || categoria === 'sobre_promedio') {
    return { bg: '#3B82F6', text: '#FFFFFF', name: 'blue' }
  }
  return { bg: '#64748B', text: '#FFFFFF', name: 'slate' }
}

// Obtener categoría MOAT de una propiedad
function getCategoriaMOAT(diferencia_pct: number | null, categoria: string | null): CategoriaFiltro | null {
  if (diferencia_pct === null) return null
  if (diferencia_pct <= -10 || categoria === 'oportunidad' || categoria === 'bajo_promedio') {
    return 'oportunidad'
  }
  if (diferencia_pct >= 10 || categoria === 'premium' || categoria === 'sobre_promedio') {
    return 'premium'
  }
  return 'justo'
}

// Crear pin tipo pill con precio
function crearPinConPrecio(precio: number, diferencia_pct: number | null, categoria: string | null, isSelected: boolean): L.DivIcon {
  const { bg } = getColorMOAT(diferencia_pct, categoria)
  const precioTexto = formatPrecioCompacto(precio)

  if (isSelected) {
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
  const selectedLayerRef = useRef<L.LayerGroup | null>(null)

  const [selectedProp, setSelectedProp] = useState<PropiedadMapa | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [showLimitToast, setShowLimitToast] = useState(false)

  // Estados para filtros
  const [conjuntoBase, setConjuntoBase] = useState<ConjuntoBase>('top13') // Por defecto Top 13
  const [filtrosCategorias, setFiltrosCategorias] = useState<Set<CategoriaFiltro>>(new Set())
  const [filtroPrecio, setFiltroPrecio] = useState<string>('cualquiera')
  const [showPrecioSheet, setShowPrecioSheet] = useState(false)

  // Estados para lightbox de fotos
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)

  // Filtrar propiedades con GPS válido
  const propsConGPS = propiedades.filter(p => p.latitud && p.longitud)

  // IDs del Top 13 (las primeras 13 propiedades ordenadas por MOAT score)
  const top13Ids = new Set(propiedades.slice(0, TOP_13_COUNT).map(p => p.id))
  const totalConGPS = propsConGPS.length

  // Aplicar filtros a las propiedades
  const propsFiltradas = propsConGPS.filter((prop, index) => {
    // Los elegidos siempre se muestran
    if (selectedIds.has(prop.id)) return true

    // Paso 1: Filtro por conjunto base (Top 13 vs Todas)
    if (conjuntoBase === 'top13') {
      // Solo mostrar si está en el Top 13
      if (!top13Ids.has(prop.id)) return false
    }

    // Paso 2: Filtro por categoría MOAT
    if (filtrosCategorias.size > 0) {
      const catProp = getCategoriaMOAT(prop.diferencia_pct, prop.categoria_precio)
      if (!catProp || !filtrosCategorias.has(catProp)) return false
    }

    // Paso 3: Filtro por precio
    if (filtroPrecio !== 'cualquiera') {
      const rango = RANGOS_PRECIO.find(r => r.id === filtroPrecio)
      if (rango && (prop.precio_usd < rango.min || prop.precio_usd > rango.max)) {
        return false
      }
    }

    return true
  })

  // Calcular cuántas hay en el conjunto base (para mostrar en UI)
  const totalConjuntoBase = conjuntoBase === 'top13'
    ? propsConGPS.filter(p => top13Ids.has(p.id)).length
    : totalConGPS

  // Calcular rango de precios de elegidos para leyenda dinámica
  const preciosElegidos = propiedades
    .filter(p => selectedIds.has(p.id))
    .map(p => p.precio_usd)
    .sort((a, b) => a - b)

  const getLeyendaElegidos = () => {
    if (preciosElegidos.length === 0) {
      return { texto: '❤ Elegí hasta 3', showPill: false }
    }
    if (preciosElegidos.length === 1) {
      return { texto: `${formatPrecioCompacto(preciosElegidos[0])} ❤ Elegido`, showPill: true }
    }
    const min = preciosElegidos[0]
    const max = preciosElegidos[preciosElegidos.length - 1]
    return { texto: `${formatPrecioCompacto(min)}-${formatPrecioCompacto(max)} ❤ Elegidos`, showPill: true }
  }

  // Toggle filtro de categoría
  const toggleCategoria = (cat: CategoriaFiltro) => {
    setFiltrosCategorias(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  // Limpiar todos los filtros (vuelve a Top 13 sin filtros MOAT/precio)
  const limpiarFiltros = () => {
    setConjuntoBase('top13')
    setFiltrosCategorias(new Set())
    setFiltroPrecio('cualquiera')
  }

  const hayFiltrosActivos = filtrosCategorias.size > 0 || filtroPrecio !== 'cualquiera'

  // Contar Top 13 con GPS para mostrar en el toggle
  const top13ConGPS = propsConGPS.filter(p => top13Ids.has(p.id)).length

  // Funciones de navegación de fotos
  const nextPhoto = () => {
    if (!selectedProp || selectedProp.fotos_urls.length <= 1) return
    setPhotoIndex(prev => (prev + 1) % selectedProp.fotos_urls.length)
  }

  const prevPhoto = () => {
    if (!selectedProp || selectedProp.fotos_urls.length <= 1) return
    setPhotoIndex(prev => (prev - 1 + selectedProp.fotos_urls.length) % selectedProp.fotos_urls.length)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextPhoto()
      else prevPhoto()
    }
    setTouchStart(null)
  }

  const openLightbox = () => {
    if (selectedProp && selectedProp.fotos_urls.length > 0) {
      setLightboxOpen(true)
    }
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
  }

  // Actualizar visibilidad de markers según filtros
  const updateMarkerVisibility = () => {
    if (!clusterGroupRef.current || !selectedLayerRef.current || !mapInstanceRef.current) return

    const filteredIds = new Set(propsFiltradas.map(p => p.id))

    markersRef.current.forEach((marker, propId) => {
      const prop = propiedades.find(p => p.id === propId)
      if (!prop) return

      const isSelected = selectedIds.has(propId)
      const shouldShow = filteredIds.has(propId)
      const icon = crearPinConPrecio(prop.precio_usd, prop.diferencia_pct, prop.categoria_precio, isSelected)
      marker.setIcon(icon)

      if (isSelected) {
        // Seleccionados siempre en su capa
        if (clusterGroupRef.current!.hasLayer(marker)) {
          clusterGroupRef.current!.removeLayer(marker)
        }
        if (!selectedLayerRef.current!.hasLayer(marker)) {
          selectedLayerRef.current!.addLayer(marker)
        }
        marker.setZIndexOffset(2000)
      } else if (shouldShow) {
        // Mostrar en cluster
        if (selectedLayerRef.current!.hasLayer(marker)) {
          selectedLayerRef.current!.removeLayer(marker)
        }
        if (!clusterGroupRef.current!.hasLayer(marker)) {
          clusterGroupRef.current!.addLayer(marker)
        }
        marker.setZIndexOffset(0)
      } else {
        // Ocultar
        if (clusterGroupRef.current!.hasLayer(marker)) {
          clusterGroupRef.current!.removeLayer(marker)
        }
        if (selectedLayerRef.current!.hasLayer(marker)) {
          selectedLayerRef.current!.removeLayer(marker)
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

  // Actualizar capas cuando cambia la selección, filtros o mapa está listo
  useEffect(() => {
    if (mapReady) {
      updateMarkerVisibility()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, mapReady, conjuntoBase, filtrosCategorias, filtroPrecio])

  // Reset photo index cuando cambia la propiedad seleccionada
  useEffect(() => {
    setPhotoIndex(0)
  }, [selectedProp?.id])

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    if (propsConGPS.length === 0) return

    const centerLat = propsConGPS.reduce((sum, p) => sum + (p.latitud || 0), 0) / propsConGPS.length || -17.7833
    const centerLng = propsConGPS.reduce((sum, p) => sum + (p.longitud || 0), 0) / propsConGPS.length || -63.1821

    const map = L.map(mapRef.current, {
      center: [centerLat, centerLng],
      zoom: 14,
      zoomControl: false
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

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

    const selectedLayer = L.layerGroup()

    propsConGPS.forEach(prop => {
      const isSelected = selectedIds.has(prop.id)
      const icon = crearPinConPrecio(prop.precio_usd, prop.diferencia_pct, prop.categoria_precio, isSelected)

      const marker = L.marker([prop.latitud!, prop.longitud!], { icon })
        .on('click', () => {
          setSelectedProp(prop)
        })

      if (isSelected) {
        selectedLayer.addLayer(marker)
        marker.setZIndexOffset(2000)
      } else {
        clusterGroup.addLayer(marker)
      }
      markersRef.current.set(prop.id, marker)
    })

    map.addLayer(clusterGroup)
    map.addLayer(selectedLayer)
    clusterGroupRef.current = clusterGroup
    selectedLayerRef.current = selectedLayer

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
      selectedLayerRef.current = null
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsConGPS.length])

  const formatNum = (n: number) => n.toLocaleString('en-US')
  const isSelected = selectedProp ? selectedIds.has(selectedProp.id) : false
  const rangoActivo = RANGOS_PRECIO.find(r => r.id === filtroPrecio)

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
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-white/95 backdrop-blur-sm border-b">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Mapa de Resultados</h2>
            <p className="text-xs text-gray-500">
              {propsFiltradas.length} de {totalConjuntoBase} props · {selectedIds.size}/{maxSelected} elegidas
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Chips de filtro - scroll horizontal */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
          {/* Toggle Conjunto Base: Top 13 / Todas */}
          <div className="flex-shrink-0 flex rounded-full border border-gray-300 overflow-hidden">
            <button
              onClick={() => setConjuntoBase('top13')}
              className={`px-3 py-2 text-sm font-medium transition-all ${
                conjuntoBase === 'top13'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600'
              }`}
            >
              Top {top13ConGPS}
            </button>
            <button
              onClick={() => setConjuntoBase('todas')}
              className={`px-3 py-2 text-sm font-medium transition-all ${
                conjuntoBase === 'todas'
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-gray-600'
              }`}
            >
              Todas {totalConGPS}
            </button>
          </div>

          {/* Separador visual */}
          <div className="flex-shrink-0 w-px bg-gray-300 my-1"></div>

          {/* Chip Oportunidad */}
          <button
            onClick={() => toggleCategoria('oportunidad')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all ${
              filtrosCategorias.has('oportunidad')
                ? 'bg-emerald-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${filtrosCategorias.has('oportunidad') ? 'bg-white' : 'bg-emerald-500'}`}></span>
            Oport.
          </button>

          {/* Chip Justo */}
          <button
            onClick={() => toggleCategoria('justo')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all ${
              filtrosCategorias.has('justo')
                ? 'bg-slate-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${filtrosCategorias.has('justo') ? 'bg-white' : 'bg-slate-500'}`}></span>
            Justo
          </button>

          {/* Chip Premium */}
          <button
            onClick={() => toggleCategoria('premium')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all ${
              filtrosCategorias.has('premium')
                ? 'bg-blue-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700'
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${filtrosCategorias.has('premium') ? 'bg-white' : 'bg-blue-500'}`}></span>
            Prem.
          </button>

          {/* Chip Precio */}
          <button
            onClick={() => setShowPrecioSheet(true)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all ${
              filtroPrecio !== 'cualquiera'
                ? 'bg-amber-500 text-white'
                : 'bg-white border border-gray-300 text-gray-700'
            }`}
          >
            💰 {filtroPrecio !== 'cualquiera' ? rangoActivo?.label : 'Precio'}
            {filtroPrecio !== 'cualquiera' && (
              <span
                onClick={(e) => { e.stopPropagation(); setFiltroPrecio('cualquiera') }}
                className="ml-1 text-white/80 hover:text-white"
              >
                ✕
              </span>
            )}
          </button>

          {/* Botón Limpiar */}
          {hayFiltrosActivos && (
            <button
              onClick={limpiarFiltros}
              className="flex-shrink-0 px-3 py-2 rounded-full text-sm font-medium text-red-600 bg-red-50 border border-red-200"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Leyenda MOAT */}
      <div className="absolute top-36 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg px-3 py-2 text-xs shadow">
        {(() => {
          const leyenda = getLeyendaElegidos()
          return (
            <div className="flex items-center gap-2">
              {leyenda.showPill ? (
                <span className="px-1.5 py-0.5 text-[10px] bg-amber-400 text-white rounded font-bold whitespace-nowrap">
                  {leyenda.texto}
                </span>
              ) : (
                <span className="text-amber-600 font-medium">{leyenda.texto}</span>
              )}
            </div>
          )
        })()}
      </div>

      {/* Mapa */}
      <div ref={mapRef} className="w-full h-full pt-28" />

      {/* Card de propiedad seleccionada */}
      {selectedProp && !lightboxOpen && (
        <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-white rounded-t-2xl shadow-2xl animate-slide-up max-h-[70vh] overflow-y-auto">
          {/* Header del card */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex gap-3">
              {/* Foto clickeable */}
              <div
                onClick={openLightbox}
                className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 relative cursor-pointer active:opacity-80"
              >
                {selectedProp.fotos_urls.length > 0 ? (
                  <>
                    <img
                      src={selectedProp.fotos_urls[0]}
                      alt={selectedProp.proyecto}
                      className="w-full h-full object-cover"
                    />
                    {/* Indicador de más fotos */}
                    {selectedProp.fotos_urls.length > 1 && (
                      <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                        1/{selectedProp.fotos_urls.length} 📷
                      </div>
                    )}
                  </>
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
                    : 'bg-gray-100 active:bg-gray-200'
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
              className="w-full py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium active:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Lightbox de fotos */}
      {lightboxOpen && selectedProp && selectedProp.fotos_urls.length > 0 && (
        <div
          className="fixed inset-0 z-[1100] bg-black flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Botón cerrar */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/20 active:bg-white/30 text-white rounded-full flex items-center justify-center text-2xl"
          >
            ✕
          </button>

          {/* Contador de fotos */}
          <div className="absolute top-4 left-4 z-10 bg-black/50 text-white text-sm px-3 py-1 rounded-full">
            {photoIndex + 1} / {selectedProp.fotos_urls.length}
          </div>

          {/* Nombre del proyecto */}
          <div className="absolute bottom-4 left-4 right-4 z-10 text-center">
            <p className="text-white font-semibold text-lg">{selectedProp.proyecto}</p>
            <p className="text-white/70 text-sm">${formatNum(selectedProp.precio_usd)} · {selectedProp.area_m2}m²</p>
          </div>

          {/* Imagen principal */}
          <div
            className="w-full h-full flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <img
              src={selectedProp.fotos_urls[photoIndex]}
              alt={`${selectedProp.proyecto} - Foto ${photoIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Navegación */}
          {selectedProp.fotos_urls.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto() }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 active:bg-white/30 text-white rounded-full flex items-center justify-center text-2xl"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto() }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 active:bg-white/30 text-white rounded-full flex items-center justify-center text-2xl"
              >
                ›
              </button>
            </>
          )}

          {/* Instrucción swipe */}
          {selectedProp.fotos_urls.length > 1 && (
            <p className="absolute bottom-20 left-0 right-0 text-center text-white/50 text-xs">
              ← Deslizá para ver más fotos →
            </p>
          )}
        </div>
      )}

      {/* Bottom sheet de precio */}
      {showPrecioSheet && (
        <div
          className="fixed inset-0 z-[1050] bg-black/50"
          onClick={() => setShowPrecioSheet(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900">Rango de precio</h3>
                <button
                  onClick={() => setShowPrecioSheet(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 space-y-2">
              {RANGOS_PRECIO.map(rango => (
                <button
                  key={rango.id}
                  onClick={() => {
                    setFiltroPrecio(rango.id)
                    setShowPrecioSheet(false)
                  }}
                  className={`w-full p-3 rounded-lg text-left font-medium transition-all ${
                    filtroPrecio === rango.id
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  {rango.label}
                </button>
              ))}
            </div>

            <div className="p-4 pt-0">
              <button
                onClick={() => setShowPrecioSheet(false)}
                className="w-full py-3 rounded-lg bg-gray-900 text-white font-medium active:bg-gray-800"
              >
                Aplicar
              </button>
            </div>
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
        <div className="fixed top-40 left-1/2 -translate-x-1/2 z-[1001] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-gray-900 text-white px-5 py-4 rounded-xl shadow-xl max-w-sm relative">
            <button
              onClick={() => setShowLimitToast(false)}
              className="absolute top-2 right-2 text-gray-400 active:text-white p-1"
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
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
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
