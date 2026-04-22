import { ZONAS_POLYGONS, type ZonaPolygon } from './zonas-geojson.js'
import type { BaselineResult } from '../types-baseline.js'
import { zonaLong } from './labels.js'

// Colores coordinados con la paleta del reporte.
// Cada zona canónica tiene un color único y sobrio.
const ZONA_COLOR: Record<string, { fill: string; stroke: string }> = {
  'Equipetrol Centro': { fill: '#3A6A48', stroke: '#2A4F35' }, // salvia (core)
  'Sirari':            { fill: '#7BA687', stroke: '#5E8568' }, // salvia-light (premium)
  'Equipetrol Norte':  { fill: '#C08A2E', stroke: '#936823' }, // amber (financiero)
  'Villa Brigida':     { fill: '#A4654F', stroke: '#7B4A3A' }, // terracota (entry)
  'Equipetrol Oeste':  { fill: '#6B5B95', stroke: '#4E4270' }, // lila-gris (mixto)
  'Eq. 3er Anillo':    { fill: '#B0AFA6', stroke: '#858479' }, // gris (comercial)
}

// Cálculo de centroide simple (promedio de vértices — para etiquetado, no area-weighted)
function centroide(coords: Array<[number, number]>): [number, number] {
  const n = coords.length - 1 // último es igual al primero
  let sumLon = 0, sumLat = 0
  for (let i = 0; i < n; i++) {
    sumLon += coords[i][0]
    sumLat += coords[i][1]
  }
  return [sumLon / n, sumLat / n]
}

/**
 * Renderiza un mapa SVG de los 7 polígonos con proyección equirectangular
 * (aproximación válida a escala de barrio ~2km²).
 *
 * Escala la vista al bbox común + padding. Incluye labels por zona
 * posicionadas en el centroide del polígono.
 *
 * Recibe `data.panorama.byZona` para mostrar el inventario como stat
 * junto al nombre en cada label.
 */
export function renderMapa(data: BaselineResult): string {
  // Bbox global de todos los polígonos
  const allPoints = ZONAS_POLYGONS.flatMap(z => z.coords)
  const minLon = Math.min(...allPoints.map(p => p[0]))
  const maxLon = Math.max(...allPoints.map(p => p[0]))
  const minLat = Math.min(...allPoints.map(p => p[1]))
  const maxLat = Math.max(...allPoints.map(p => p[1]))

  // SVG canvas: ancho fijo, alto proporcional al aspect del bbox
  const W = 840
  const pad = 32
  const innerW = W - pad * 2
  // Ajuste de aspect: en esta latitud (~17.76°S), 1° lon ≈ 0.952 × 1° lat
  const latSpan = maxLat - minLat
  const lonSpan = maxLon - minLon
  const aspectCorr = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) // ≈ 0.952
  const innerH = innerW * (latSpan / (lonSpan * aspectCorr))
  const H = innerH + pad * 2

  // Proyección: lon → x, lat → y (invertida porque SVG y++)
  const proj = (lon: number, lat: number): [number, number] => {
    const x = pad + ((lon - minLon) / lonSpan) * innerW
    const y = pad + ((maxLat - lat) / latSpan) * innerH
    return [x, y]
  }

  const toPath = (coords: Array<[number, number]>): string => {
    return coords
      .map(([lon, lat], i) => {
        const [x, y] = proj(lon, lat)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ') + ' Z'
  }

  // Agrupar por nombreCanonico (Norte viene en 2 features que comparten color)
  const byCanon = new Map<string, ZonaPolygon[]>()
  for (const z of ZONAS_POLYGONS) {
    const arr = byCanon.get(z.nombreCanonico) ?? []
    arr.push(z)
    byCanon.set(z.nombreCanonico, arr)
  }

  // Render de paths (un <path> por feature, coloreados por canónica)
  const paths = ZONAS_POLYGONS.map(z => {
    const color = ZONA_COLOR[z.nombreCanonico] ?? { fill: '#8A8A8A', stroke: '#555' }
    return `  <path d="${toPath(z.coords)}" fill="${color.fill}" fill-opacity="0.65" stroke="${color.stroke}" stroke-width="1.2" stroke-linejoin="round"/>`
  }).join('\n')

  // Stats por zona canónica para los labels
  const statMap = new Map(data.panorama.byZona.map(z => [z.zona, z]))

  // Labels: uno por canónica, al centroide del feature más grande
  const labels: string[] = []
  for (const [canon, features] of byCanon) {
    // Usar el feature con más vértices como "principal" (aproximación al más grande)
    const main = features.reduce((a, b) => (a.coords.length > b.coords.length ? a : b))
    const [cLon, cLat] = centroide(main.coords)
    const [cx, cy] = proj(cLon, cLat)
    const stat = statMap.get(canon)
    const udsText = stat ? `${stat.inventario} uds` : ''
    const shortName = zonaLong(canon)

    labels.push(`  <g class="mapa-label" transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">
    <text text-anchor="middle" class="mapa-label-name">${shortName}</text>
    ${udsText ? `<text text-anchor="middle" y="14" class="mapa-label-uds">${udsText}</text>` : ''}
  </g>`)
  }

  // Leyenda inferior: solo las zonas canónicas (no los 2 de Norte)
  const canonicalZonas = [...byCanon.keys()]
  const legend = canonicalZonas.map(canon => {
    const color = ZONA_COLOR[canon] ?? { fill: '#8A8A8A', stroke: '#555' }
    return `<span class="mapa-leg-item"><span class="mapa-leg-sw" style="background:${color.fill};border:1px solid ${color.stroke}"></span>${zonaLong(canon)}</span>`
  }).join('')

  return `
<div class="mapa-wrap">
  <div class="mapa-title">Los polígonos de los submercados</div>
  <div class="mapa-subtitle">Delimitación GPS usada para asignar cada listing a una zona · orientación norte arriba</div>
  <svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" class="mapa-svg" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de los 6 submercados de Equipetrol">
    <rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="#F5F1E5"/>
${paths}
${labels.join('\n')}
    <g class="mapa-compass" transform="translate(${(W - 48).toFixed(0)},${(pad + 16).toFixed(0)})">
      <circle cx="0" cy="0" r="14" fill="white" stroke="#8A8A8A" stroke-width="0.8"/>
      <path d="M 0 -10 L 3 0 L 0 -2 L -3 0 Z" fill="#141414"/>
      <text x="0" y="-16" text-anchor="middle" style="font-size:8px;fill:#5A5A5A;font-family:'Figtree',sans-serif;font-weight:600;letter-spacing:0.1em;">N</text>
    </g>
  </svg>
  <div class="mapa-legend">${legend}</div>
</div>
`
}
