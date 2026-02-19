import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface AlquilerMapProps {
  lat: number
  lng: number
}

export default function AlquilerMap({ lat, lng }: AlquilerMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const [ready, setReady] = useState(false)

  // Wait for container to be visible before initializing map
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!mapRef.current || !ready) return

    // Clean up previous map if it exists
    if (mapInstance.current) {
      mapInstance.current.remove()
      mapInstance.current = null
    }

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([lat, lng], 16)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    const goldIcon = L.divIcon({
      className: '',
      html: '<div style="width:24px;height:24px;background:#c9a959;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })

    L.marker([lat, lng], { icon: goldIcon }).addTo(map)
    mapInstance.current = map

    // Force recalculate size after animation settles
    setTimeout(() => map.invalidateSize(), 100)

    // Dark tiles styling
    const style = document.createElement('style')
    style.textContent = `
      .alq-map-wrap .leaflet-tile { filter: brightness(0.7) contrast(1.1) saturate(0.3); }
      .alq-map-wrap .leaflet-control-zoom a { background: #1a1a1a !important; color: #c9a959 !important; border-color: rgba(255,255,255,0.1) !important; }
    `
    mapRef.current.appendChild(style)

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [lat, lng, ready])

  return <div ref={mapRef} className="alq-map-wrap" style={{ width: '100%', height: '100%' }} />
}
