/**
 * API Route: Informe Fiduciario Premium v2
 *
 * Opción B: Recibe datos completos por POST desde resultados.tsx
 * Genera HTML con el template v3 completo (9 secciones + mapa)
 *
 * POST /api/informe
 * Body: { propiedades, datosUsuario, analisis }
 */

import type { NextApiRequest, NextApiResponse } from 'next'

// Tipos
interface Propiedad {
  id: number
  proyecto: string
  desarrollador: string | null
  zona: string
  dormitorios: number
  banos: number | null
  precio_usd: number
  precio_m2: number
  area_m2: number
  dias_en_mercado: number | null
  fotos_urls: string[]
  amenities_confirmados: string[]
  amenities_por_verificar: string[]
  razon_fiduciaria: string | null
  posicion_mercado: {
    categoria: string
    diferencia_pct: number
  } | null
  posicion_precio_edificio: number | null
  unidades_en_edificio: number | null
  estado_construccion: string
  lat?: number
  lng?: number
}

interface DatosUsuario {
  presupuesto: number
  dormitorios: number | null
  zonas: string[]
  estado_entrega: string
  innegociables: string[]
  deseables: string[]
  ubicacion_vs_metros: number  // 1-5
  calidad_vs_precio: number    // 1-5
  quienes_viven: string
}

interface Analisis {
  precio_m2_promedio: number
  dias_mediana: number
  total_analizadas: number
}

interface InformeRequest {
  propiedades: Propiedad[]
  datosUsuario: DatosUsuario
  analisis: Analisis
}

// Helpers
const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '0'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const getCategoria = (p: Propiedad): { clase: string; texto: string; pct: number; badgeClass: string } => {
  // Usar posicion_mercado pre-calculado de BD (compara vs promedio de SU zona específica)
  const diff = p.posicion_mercado?.diferencia_pct || 0

  if (diff <= -10) {
    return { clase: 'good', texto: `${Math.abs(Math.round(diff))}% bajo su zona`, pct: diff, badgeClass: 'oportunidad' }
  } else if (diff >= 10) {
    return { clase: 'high', texto: `${Math.round(diff)}% sobre su zona`, pct: diff, badgeClass: 'premium' }
  }
  return { clase: 'fair', texto: 'Precio de mercado', pct: diff, badgeClass: 'justo' }
}

const getNegociacion = (dias: number | null): { texto: string; clase: string } => {
  if (!dias) return { texto: 'Media', clase: '' }
  if (dias > 90) return { texto: 'ALTA', clase: 'high' }
  if (dias > 60) return { texto: 'Media-Alta', clase: '' }
  return { texto: 'Media', clase: '' }
}

const getDescuento = (dias: number | null): string => {
  if (!dias || dias < 30) return '2-4%'
  if (dias < 60) return '4-6%'
  if (dias < 90) return '5-8%'
  if (dias < 180) return '8-12%'
  return '10-15%'
}

const amenityEmojis: Record<string, string> = {
  'piscina': '🏊', 'gimnasio': '💪', 'gym': '💪', 'churrasquera': '🍖', 'quincho': '🍖',
  'ascensor': '🛗', 'seguridad': '👮', 'parqueo': '🅿️', 'estacionamiento': '🅿️',
  'área social': '🎉', 'salon': '🎉', 'baulera': '📦', 'deposito': '📦',
  'roof garden': '🌳', 'terraza': '☀️', 'balcon': '☀️', 'lavandería': '🧺',
  'default': '✓'
}

const getAmenityEmoji = (amenity: string): string => {
  const lower = amenity.toLowerCase()
  for (const [key, emoji] of Object.entries(amenityEmojis)) {
    if (lower.includes(key)) return emoji
  }
  return amenityEmojis.default
}

const getTradeOffLabel = (value: number, left: string, right: string): string => {
  if (value <= 2) return `Priorizás ${left} (${value * 20}%)`
  if (value >= 4) return `Priorizás ${right} (${value * 20}%)`
  return `Balance equilibrado (50%)`
}

const zonaDisplay = (zona: string): string => {
  const mapeo: Record<string, string> = {
    'equipetrol': 'Equipetrol',
    'equipetrol_norte': 'Equipetrol Norte',
    'las_palmas': 'Las Palmas',
    'urubo': 'Urubó',
    'downtown': 'Centro/Downtown'
  }
  return mapeo[zona?.toLowerCase()] || zona || 'Sin zona'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    const { propiedades, datosUsuario, analisis } = req.body as InformeRequest

    if (!propiedades || propiedades.length === 0) {
      return res.status(400).json({ error: 'No hay propiedades para generar el informe' })
    }

    const fav = propiedades[0]
    const comp1 = propiedades[1]
    const comp2 = propiedades[2]
    const todas = propiedades
    const top3 = propiedades.slice(0, 3)

    const fechaHoy = new Date().toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })
    const precioM2Promedio = analisis?.precio_m2_promedio || Math.round(todas.reduce((s, p) => s + p.precio_m2, 0) / todas.length)
    const favCat = getCategoria(fav)

    // Generar barras del gráfico (pre-computado para evitar template literals anidados)
    // Colores simplificados: Verde=elegidas, Azul=alternativas, Gris oscuro=promedio
    const generarBarrasChart = (): string => {
      const propsParaChart = todas.slice(0, 6)
      const propsOrdenadas = [...propsParaChart].sort((a, b) => a.precio_m2 - b.precio_m2)

      interface BarraData { html: string; precio_m2: number }
      const barrasProps: BarraData[] = propsOrdenadas.map(p => {
        const height = Math.max(40, Math.min(180, (p.precio_m2 / precioM2Promedio) * 100))
        const originalIndex = todas.findIndex(t => t.id === p.id)
        const isElegida = originalIndex < 3
        // Verde para elegidas, Azul para alternativas
        const barClass = isElegida ? 'selected' : ''
        const nameClass = isElegida ? 'selected' : ''
        const label = originalIndex === 0 ? ' (tuya)' : originalIndex < 3 ? ' (#' + (originalIndex + 1) + ')' : ''
        return {
          html: '<div class="chart-bar"><div class="bar ' + barClass + '" style="height: ' + height + 'px;"><span class="bar-label">$' + fmt(p.precio_m2) + '</span></div><div class="bar-name ' + nameClass + '">' + p.proyecto.substring(0, 10) + label + '</div></div>',
          precio_m2: p.precio_m2
        }
      })

      // Barra de PROMEDIO - gris oscuro para contraste
      const heightPromedio = 100
      const barraPromedio: BarraData = {
        html: '<div class="chart-bar"><div class="bar" style="height: ' + heightPromedio + 'px; background: var(--gray-600);"><span class="bar-label">$' + fmt(precioM2Promedio) + '</span></div><div class="bar-name" style="font-weight: 700; color: var(--gray-600);">PROMEDIO</div></div>',
        precio_m2: precioM2Promedio
      }

      // Combinar y ordenar por precio
      const todasBarras = [...barrasProps, barraPromedio].sort((a, b) => a.precio_m2 - b.precio_m2)
      return todasBarras.map(b => b.html).join('')
    }
    const barrasChartHTML = generarBarrasChart()

    // CSS completo del template v3
    const css = `
        :root {
            --primary: #1a365d;
            --primary-light: #2c5282;
            --accent: #38a169;
            --accent-light: #48bb78;
            --warning: #d69e2e;
            --danger: #e53e3e;
            --heart: #e53e3e;
            --oportunidad: #38a169;
            --justo: #64748b;
            --premium: #7c3aed;
            --gray-50: #f7fafc;
            --gray-100: #edf2f7;
            --gray-200: #e2e8f0;
            --gray-300: #cbd5e0;
            --gray-600: #718096;
            --gray-700: #4a5568;
            --gray-800: #2d3748;
            --gray-900: #1a202c;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: var(--gray-800); background: var(--gray-50); }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        /* Hero */
        .hero { position: relative; height: 450px; overflow: hidden; }
        .hero img { width: 100%; height: 100%; object-fit: cover; }
        .hero-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, #1a365d, #2c5282); display: flex; align-items: center; justify-content: center; font-size: 4rem; }
        .hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(0,0,0,0.85)); padding: 60px 20px 30px; color: white; }
        .hero-overlay .logo { font-size: 1.6rem; font-weight: 700; margin-bottom: 12px; }
        .hero-overlay .logo span { color: var(--accent-light); }
        .hero-title { font-size: 2rem; font-weight: 700; margin-bottom: 8px; }
        .hero-subtitle { opacity: 0.9; font-size: 1.1rem; margin-bottom: 15px; }
        .hero-badges { display: flex; gap: 10px; flex-wrap: wrap; }
        .hero-badge { background: rgba(255,255,255,0.2); padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; backdrop-filter: blur(10px); }
        .hero-badge.heart { background: var(--heart); }
        .hero-badge.oportunidad { background: var(--oportunidad); }
        .hero-badge.justo { background: var(--justo); }
        .hero-badge.premium { background: var(--premium); }

        /* Search Summary */
        .search-summary { background: white; margin: -30px 20px 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); padding: 25px 30px; position: relative; z-index: 10; }
        .search-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 15px; margin-top: 15px; }
        .search-item { text-align: center; padding: 12px; background: var(--gray-50); border-radius: 8px; }
        .search-item .value { font-size: 1.2rem; font-weight: 700; color: var(--primary); }
        .search-item .label { font-size: 0.75rem; color: var(--gray-600); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
        .search-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--gray-200); }
        .search-tag { background: var(--accent); color: white; padding: 5px 12px; border-radius: 15px; font-size: 0.85rem; font-weight: 500; }
        .search-tag.optional { background: var(--gray-200); color: var(--gray-700); }

        /* Section styles */
        .section { background: white; margin: 30px 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); overflow: hidden; }
        .section-header { background: var(--primary); color: white; padding: 20px 30px; display: flex; align-items: center; gap: 15px; }
        .section-number { background: rgba(255,255,255,0.2); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.2rem; }
        .section-title { font-size: 1.3rem; font-weight: 600; }
        .section-content { padding: 30px; }

        /* Profile Grid */
        .profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .profile-card { background: var(--gray-50); border-radius: 12px; padding: 20px; }
        .profile-card h4 { color: var(--primary); margin-bottom: 12px; font-size: 0.9rem; }
        .slider-visual { margin: 12px 0; }
        .slider-labels { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--gray-600); margin-bottom: 6px; }
        .slider-bar { height: 8px; background: var(--gray-200); border-radius: 4px; }
        .slider-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--accent)); border-radius: 4px; }
        .slider-value { text-align: center; font-weight: 600; color: var(--primary); margin-top: 8px; font-size: 0.9rem; }

        /* Specs */
        .spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
        @media (max-width: 768px) { .spec-grid { grid-template-columns: 1fr; } }
        .spec-card { background: var(--gray-50); border-radius: 8px; padding: 20px; }
        .spec-card h4 { color: var(--gray-600); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px; }
        .spec-list { list-style: none; }
        .spec-list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--gray-200); }
        .spec-list li:last-child { border-bottom: none; }
        .spec-list .label { color: var(--gray-600); }
        .spec-list .value { font-weight: 600; color: var(--gray-800); }

        /* Price Cards */
        .price-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; }
        .price-card { border-radius: 12px; padding: 20px; text-align: center; }
        .price-card.primary { background: linear-gradient(135deg, var(--oportunidad) 0%, var(--accent-light) 100%); color: white; }
        .price-card.secondary { background: var(--gray-100); border: 2px solid var(--gray-200); }
        .price-card.warning { background: linear-gradient(135deg, var(--warning) 0%, #ecc94b 100%); color: white; }
        .price-card .label-top { font-size: 0.8rem; opacity: 0.9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .price-card .price-main { font-size: 1.8rem; font-weight: 700; margin-bottom: 4px; }
        .price-card .price-detail { font-size: 0.85rem; opacity: 0.9; }
        .price-card .badge-position { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: rgba(255,255,255,0.25); }

        /* Amenities */
        .amenities-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; }
        .amenity-item { display: flex; align-items: center; gap: 12px; padding: 14px; background: var(--gray-50); border-radius: 8px; }
        .amenity-icon { width: 36px; height: 36px; background: var(--primary); color: white; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
        .amenity-details .name { font-weight: 600; color: var(--gray-800); font-size: 0.9rem; }
        .amenity-details .vs-market { font-size: 0.75rem; color: var(--accent); font-weight: 500; }
        .amenity-details .vs-market.standard { color: var(--gray-600); }
        .amenity-details .vs-market.warning { color: var(--warning); }

        /* Alert */
        .alert { padding: 18px; border-radius: 8px; margin-top: 20px; display: flex; gap: 12px; align-items: flex-start; }
        .alert.success { background: #c6f6d5; border-left: 4px solid var(--accent); }
        .alert.warning { background: #fef3c7; border-left: 4px solid var(--warning); }
        .alert.info { background: #bee3f8; border-left: 4px solid #3182ce; }
        .alert-icon { font-size: 1.3rem; }
        .alert-content h4 { color: var(--gray-800); margin-bottom: 4px; font-size: 0.95rem; }
        .alert-content p { color: var(--gray-700); font-size: 0.9rem; }

        /* Photos */
        .photos-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 20px; }
        .photos-grid img { width: 100%; height: 110px; object-fit: cover; border-radius: 8px; }

        /* Market Position */
        .market-position { background: var(--gray-50); border-radius: 12px; padding: 25px; margin-top: 25px; }
        .market-position h4 { color: var(--primary); margin-bottom: 20px; }
        .position-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; }
        .position-item { background: white; border-radius: 8px; padding: 18px; text-align: center; border: 1px solid var(--gray-200); }
        .position-item .metric { font-size: 1.6rem; font-weight: 700; color: var(--primary); }
        .position-item .metric.good { color: var(--oportunidad); }
        .position-item .metric.warning { color: var(--warning); }
        .position-item .metric-label { font-size: 0.8rem; color: var(--gray-600); margin-top: 4px; }
        .position-item .metric-context { font-size: 0.7rem; color: var(--gray-500); margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--gray-200); }

        /* Chart */
        .price-chart { margin-top: 30px; padding: 25px; background: var(--gray-50); border-radius: 12px; }
        .price-chart h4 { text-align: center; color: var(--gray-700); margin-bottom: 25px; }
        .chart-container { position: relative; height: 250px; display: flex; align-items: flex-end; gap: 8px; }
        .chart-bar { flex: 1; display: flex; flex-direction: column; align-items: center; height: 210px; justify-content: flex-end; }
        .bar { width: 100%; max-width: 60px; background: var(--primary); border-radius: 4px 4px 0 0; position: relative; min-height: 20px; }
        .bar.selected { background: var(--oportunidad); }
        .bar.warning { background: var(--warning); }
        .bar-label { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 0.65rem; font-weight: 700; color: var(--gray-700); white-space: nowrap; }
        .bar-name { margin-top: 8px; font-size: 0.6rem; color: var(--gray-600); text-align: center; max-width: 70px; height: 30px; }
        .bar-name.selected { font-weight: 700; color: var(--oportunidad); }
        .chart-legend { display: flex; justify-content: center; gap: 20px; margin-top: 15px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--gray-700); }
        .legend-color { width: 14px; height: 14px; border-radius: 3px; }

        /* Comparables */
        .comparable-card { border: 1px solid var(--gray-200); border-radius: 12px; overflow: hidden; margin-bottom: 25px; }
        .comparable-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); flex-wrap: wrap; gap: 12px; }
        .comparable-name { display: flex; align-items: center; gap: 12px; }
        .comparable-number { background: var(--primary); color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; }
        .comparable-number.heart { background: var(--heart); }
        .comparable-name h3 { font-size: 1.1rem; color: var(--gray-800); }
        .comparable-name .subtitle { font-size: 0.8rem; color: var(--gray-600); }
        .comparable-badges { display: flex; gap: 8px; flex-wrap: wrap; }
        .badge { padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
        .badge.price-good { background: var(--oportunidad); color: white; }
        .badge.price-fair { background: var(--justo); color: white; }
        .badge.price-high { background: var(--premium); color: white; }
        .badge.days { background: var(--gray-200); color: var(--gray-700); }
        .badge.days.high { background: #fef3c7; color: #92400e; }
        .badge.negotiation { background: var(--primary); color: white; }
        .badge.negotiation.high { background: var(--oportunidad); }

        .comparable-body { display: grid; grid-template-columns: 280px 1fr; gap: 0; }
        @media (max-width: 768px) { .comparable-body { grid-template-columns: 1fr; } }
        .comparable-gallery { position: relative; height: 220px; overflow: hidden; }
        .comparable-gallery img { width: 100%; height: 100%; object-fit: cover; }
        .comparable-gallery-placeholder { width: 100%; height: 100%; background: var(--gray-200); display: flex; align-items: center; justify-content: center; font-size: 3rem; color: var(--gray-400); }
        .comparable-details { padding: 20px; }
        .detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        @media (max-width: 600px) { .detail-grid { grid-template-columns: repeat(2, 1fr); } }
        .detail-item { text-align: center; padding: 12px 8px; background: var(--gray-50); border-radius: 8px; }
        .detail-item .value { font-size: 1.1rem; font-weight: 700; color: var(--primary); }
        .detail-item .value.good { color: var(--oportunidad); }
        .detail-item .value.warning { color: var(--warning); }
        .detail-item .label { font-size: 0.7rem; color: var(--gray-600); text-transform: uppercase; }

        .includes-list { margin-top: 15px; }
        .includes-list h4 { font-size: 0.85rem; color: var(--gray-600); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        .includes-list ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
        .includes-list li { background: var(--gray-100); padding: 5px 12px; border-radius: 15px; font-size: 0.8rem; color: var(--gray-700); }
        .includes-list li.highlight { background: var(--oportunidad); color: white; }
        .includes-list li.warning { background: #fef3c7; color: #92400e; }

        .comparable-conclusion { margin-top: 15px; padding: 15px; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%); color: white; border-radius: 8px; }
        .comparable-conclusion strong { display: block; margin-bottom: 5px; font-size: 0.8rem; opacity: 0.9; }

        /* Table */
        .summary-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.85rem; }
        .summary-table th { background: var(--primary); color: white; padding: 12px 10px; text-align: left; font-weight: 600; }
        .summary-table td { padding: 12px 10px; border-bottom: 1px solid var(--gray-200); }
        .summary-table tr:nth-child(even) { background: var(--gray-50); }
        .summary-table tr.highlighted { background: #fef2f2; }
        .table-heart { color: var(--heart); margin-right: 4px; }
        .position-badge { display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
        .position-badge.good { background: #c6f6d5; color: #22543d; }
        .position-badge.fair { background: var(--gray-200); color: var(--gray-700); }
        .position-badge.high { background: #e9d5ff; color: #6b21a8; }

        /* Checklist */
        .checklist { list-style: none; margin-top: 15px; }
        .checklist li { padding: 12px 0; border-bottom: 1px solid var(--gray-200); display: flex; align-items: flex-start; gap: 12px; }
        .checklist li:last-child { border-bottom: none; }
        .checkbox { width: 22px; height: 22px; border: 2px solid var(--gray-300); border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
        .checklist .question { font-weight: 500; color: var(--gray-800); }
        .checklist .why { font-size: 0.85rem; color: var(--gray-600); margin-top: 3px; }

        /* Negotiation */
        .negotiation-card { background: var(--gray-50); border-radius: 12px; padding: 22px; margin-top: 20px; }
        .negotiation-card h4 { color: var(--primary); margin-bottom: 12px; }
        .negotiation-card blockquote { background: white; border-left: 4px solid var(--oportunidad); padding: 12px 18px; margin: 12px 0; font-style: italic; color: var(--gray-700); border-radius: 0 8px 8px 0; font-size: 0.9rem; }

        /* Recommendation */
        .recommendation-box { background: linear-gradient(135deg, var(--oportunidad) 0%, #2f855a 100%); color: white; border-radius: 12px; padding: 30px; margin-top: 25px; }
        .recommendation-box h3 { font-size: 1.3rem; margin-bottom: 18px; display: flex; align-items: center; gap: 10px; }
        .recommendation-table { width: 100%; border-collapse: collapse; }
        .recommendation-table th { text-align: left; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.2); font-weight: 500; opacity: 0.9; }
        .recommendation-table td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .recommendation-table td:last-child { font-weight: 600; }

        /* Disclaimer */
        .disclaimer-box { background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 1px solid #7dd3fc; border-radius: 10px; padding: 18px 20px; margin-top: 20px; display: flex; gap: 12px; align-items: flex-start; }
        .disclaimer-box .icon { font-size: 1.3rem; }
        .disclaimer-box strong { color: var(--primary); display: block; margin-bottom: 4px; }
        .disclaimer-box p { font-size: 0.9rem; color: var(--gray-700); margin: 0; }

        /* Footer */
        .footer { background: var(--gray-900); color: white; padding: 40px 0; margin-top: 50px; }
        .footer-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; }
        .footer .logo { font-size: 1.8rem; font-weight: 700; }
        .footer .logo span { color: var(--accent-light); }
        .footer-meta { text-align: right; font-size: 0.9rem; opacity: 0.8; }
        .confidence-badge { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); padding: 8px 16px; border-radius: 20px; font-weight: 600; margin-top: 10px; }

        @media print {
            .hero { height: 350px; }
            .section { break-inside: avoid; }
            .comparable-card { break-inside: avoid; }
        }
    `

    // Generar HTML
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informe Fiduciario Premium - ${fav.proyecto} | Simón</title>
    <style>${css}</style>
</head>
<body>
    <!-- Hero -->
    <section class="hero">
        ${fav.fotos_urls?.[0]
          ? `<img src="${fav.fotos_urls[0]}" alt="${fav.proyecto}">`
          : '<div class="hero-placeholder">🏠</div>'}
        <div class="hero-overlay">
            <div class="container">
                <div class="logo">Simón<span>.</span></div>
                <h1 class="hero-title">Tu Favorita: ${fav.proyecto.toUpperCase()}</h1>
                <p class="hero-subtitle">Informe Fiduciario Premium | ${zonaDisplay(fav.zona)}, ${Math.round(fav.area_m2)} m², ${fav.dormitorios} Dormitorios</p>
                <div class="hero-badges">
                    <span class="hero-badge heart">❤️ Tu #1</span>
                    <span class="hero-badge ${favCat.badgeClass}">${favCat.texto}</span>
                    ${fav.dias_en_mercado ? `<span class="hero-badge">${fav.dias_en_mercado} días publicado</span>` : ''}
                    <span class="hero-badge">${fechaHoy}</span>
                </div>
            </div>
        </div>
    </section>

    <!-- Tu Búsqueda -->
    <div class="container">
        <div class="search-summary">
            <h3 style="color: var(--primary); margin-bottom: 5px;">Tu Búsqueda</h3>
            <p style="color: var(--gray-600); font-size: 0.9rem;">Los filtros que usaste para encontrar estas propiedades</p>
            <div class="search-grid">
                <div class="search-item">
                    <div class="value">$${fmt(datosUsuario.presupuesto)}</div>
                    <div class="label">Presupuesto</div>
                </div>
                <div class="search-item">
                    <div class="value">${datosUsuario.dormitorios || 'Todos'}</div>
                    <div class="label">Dormitorios</div>
                </div>
                <div class="search-item">
                    <div class="value">${datosUsuario.zonas?.[0] ? zonaDisplay(datosUsuario.zonas[0]) : 'Todas'}</div>
                    <div class="label">Zona</div>
                </div>
                <div class="search-item">
                    <div class="value">${datosUsuario.estado_entrega === 'entrega_inmediata' ? 'Inmediata' : datosUsuario.estado_entrega === 'solo_preventa' ? 'Preventa' : 'Todas'}</div>
                    <div class="label">Entrega</div>
                </div>
                <div class="search-item">
                    <div class="value">${analisis?.total_analizadas || todas.length}</div>
                    <div class="label">Analizadas</div>
                </div>
                <div class="search-item">
                    <div class="value">${Math.min(3, todas.length)}</div>
                    <div class="label">Elegidas</div>
                </div>
            </div>
            ${datosUsuario.innegociables?.length > 0 || datosUsuario.deseables?.length > 0 ? `
            <div class="search-tags">
                ${datosUsuario.innegociables?.map(i => `<span class="search-tag">${i}</span>`).join('') || ''}
                ${datosUsuario.deseables?.map(d => `<span class="search-tag optional">${d} (opcional)</span>`).join('') || ''}
            </div>` : ''}
        </div>
    </div>

    <!-- Section 1: Tu Perfil de Compra -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">1</div>
                <div class="section-title">Tu Perfil de Compra</div>
            </div>
            <div class="section-content">
                <div class="profile-grid">
                    <div class="profile-card">
                        <h4>Quiénes Vivirán</h4>
                        <p style="font-size: 1.05rem; font-weight: 600; color: var(--primary);">${datosUsuario.quienes_viven || 'No especificado'}</p>
                        <p style="color: var(--gray-600); font-size: 0.85rem; margin-top: 6px;">Buscás espacio adecuado para tu situación.</p>
                    </div>
                    <div class="profile-card">
                        <h4>Ubicación vs Metros</h4>
                        <div class="slider-visual">
                            <div class="slider-labels">
                                <span>Ubicación</span>
                                <span>Metros²</span>
                            </div>
                            <div class="slider-bar">
                                <div class="slider-fill" style="width: ${(datosUsuario.ubicacion_vs_metros || 3) * 20}%;"></div>
                            </div>
                            <div class="slider-value">${getTradeOffLabel(datosUsuario.ubicacion_vs_metros || 3, 'ubicación', 'metros')}</div>
                        </div>
                    </div>
                    <div class="profile-card">
                        <h4>Calidad vs Precio</h4>
                        <div class="slider-visual">
                            <div class="slider-labels">
                                <span>Calidad</span>
                                <span>Precio</span>
                            </div>
                            <div class="slider-bar">
                                <div class="slider-fill" style="width: ${(datosUsuario.calidad_vs_precio || 3) * 20}%;"></div>
                            </div>
                            <div class="slider-value">${getTradeOffLabel(datosUsuario.calidad_vs_precio || 3, 'calidad', 'precio')}</div>
                        </div>
                    </div>
                    <div class="profile-card">
                        <h4>¿Por qué ${fav.proyecto} es tu #1?</h4>
                        <p style="font-size: 1.05rem; font-weight: 600; color: var(--primary);">${favCat.clase === 'good' ? 'Mejor relación precio/valor' : favCat.clase === 'high' ? 'Mejor ubicación/calidad' : 'Mejor balance general'}</p>
                        <p style="color: var(--gray-600); font-size: 0.85rem; margin-top: 6px;">Basado en tus preferencias y el análisis de mercado.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 2: Tu Favorita -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">2</div>
                <div class="section-title">Tu Favorita: ${fav.proyecto}</div>
            </div>
            <div class="section-content">
                <div class="spec-grid">
                    <div class="spec-card">
                        <h4>Especificaciones</h4>
                        <ul class="spec-list">
                            <li><span class="label">Proyecto</span><span class="value">${fav.proyecto}</span></li>
                            <li><span class="label">Superficie</span><span class="value">${Math.round(fav.area_m2)} m²</span></li>
                            <li><span class="label">Dormitorios</span><span class="value">${fav.dormitorios}</span></li>
                            <li><span class="label">Baños</span><span class="value">${fav.banos || '?'}</span></li>
                            <li><span class="label">Zona</span><span class="value">${zonaDisplay(fav.zona)}</span></li>
                            <li><span class="label">Estado</span><span class="value">${fav.estado_construccion === 'preventa' ? 'Preventa' : 'Entrega Inmediata'}</span></li>
                            ${fav.desarrollador ? `<li><span class="label">Desarrollador</span><span class="value">${fav.desarrollador}</span></li>` : ''}
                        </ul>
                    </div>
                    <div>
                        <h4 style="color: var(--gray-600); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px;">Análisis de Precio</h4>
                        <div class="price-cards">
                            <div class="price-card primary">
                                <div class="label-top">Precio Publicado</div>
                                <div class="price-main">$${fmt(fav.precio_usd)}</div>
                                <div class="price-detail">$${fmt(fav.precio_m2)} / m²</div>
                                <div class="badge-position">${favCat.texto}</div>
                            </div>
                            <div class="price-card secondary">
                                <div class="label-top">Promedio Zona</div>
                                <div class="price-main">$${fmt(precioM2Promedio)}</div>
                                <div class="price-detail">por m² (${fav.dormitorios} dorms)</div>
                            </div>
                            <div class="price-card warning">
                                <div class="label-top">Días Publicado</div>
                                <div class="price-main">${fav.dias_en_mercado || '?'}</div>
                                <div class="price-detail">días en mercado</div>
                                <div class="badge-position">Negociación: ${getNegociacion(fav.dias_en_mercado).texto}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <h4 style="margin-top: 30px; margin-bottom: 15px; color: var(--gray-700);">Amenidades Confirmadas</h4>
                <div class="amenities-grid">
                    ${(fav.amenities_confirmados || []).slice(0, 6).map(a => `
                    <div class="amenity-item">
                        <div class="amenity-icon">${getAmenityEmoji(a)}</div>
                        <div class="amenity-details">
                            <div class="name">${a}</div>
                            <div class="vs-market standard">Confirmado</div>
                        </div>
                    </div>`).join('')}
                    ${(fav.amenities_por_verificar || []).slice(0, 2).map(a => `
                    <div class="amenity-item">
                        <div class="amenity-icon">${getAmenityEmoji(a)}</div>
                        <div class="amenity-details">
                            <div class="name">${a}</div>
                            <div class="vs-market warning">⚠️ Por verificar</div>
                        </div>
                    </div>`).join('')}
                </div>

                ${fav.razon_fiduciaria ? `
                <div class="alert success">
                    <div class="alert-icon">✅</div>
                    <div class="alert-content">
                        <h4>Síntesis Fiduciaria</h4>
                        <p>${fav.razon_fiduciaria}</p>
                    </div>
                </div>` : ''}

                ${(fav.amenities_por_verificar || []).some(a => a.toLowerCase().includes('parqueo')) ? `
                <div class="alert warning">
                    <div class="alert-icon">⚠️</div>
                    <div class="alert-content">
                        <h4>Verificar Antes de Ofertar</h4>
                        <p>Confirmar si el <strong>parqueo está incluido</strong>. En esta zona suele venderse aparte (+$12,000 - $18,000).</p>
                    </div>
                </div>` : ''}

                ${(fav.fotos_urls || []).length > 1 ? `
                <h4 style="margin-top: 25px; margin-bottom: 12px; color: var(--gray-700);">Fotos de la Propiedad</h4>
                <div class="photos-grid">
                    ${fav.fotos_urls.slice(0, 4).map(f => `<img src="${f}" alt="${fav.proyecto}">`).join('')}
                </div>` : ''}
            </div>
        </div>
    </div>

    <!-- Section 3: Posición en el Mercado -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">3</div>
                <div class="section-title">Posición en el Mercado</div>
            </div>
            <div class="section-content">
                <p>Comparamos ${fav.proyecto} contra el mercado de <strong>${datosUsuario.dormitorios ? datosUsuario.dormitorios + ' dormitorios' : 'departamentos'} en ${datosUsuario.zonas?.length ? datosUsuario.zonas.map(z => zonaDisplay(z)).join(', ') : 'todas las zonas'}</strong>.</p>
                <div class="market-position">
                    <h4>Métricas Clave</h4>
                    <div class="position-grid">
                        <div class="position-item">
                            <div class="metric ${favCat.clase}">${Math.round(favCat.pct)}%</div>
                            <div class="metric-label">vs su zona</div>
                            <div class="metric-context">Promedio: $${fmt(precioM2Promedio)}/m² | ${fav.proyecto}: $${fmt(fav.precio_m2)}/m²</div>
                        </div>
                        <div class="position-item">
                            <div class="metric ${(fav.dias_en_mercado || 0) > 60 ? 'warning' : ''}">${fav.dias_en_mercado || '?'} días</div>
                            <div class="metric-label">En Mercado</div>
                            <div class="metric-context">Mediana zona: ${analisis?.dias_mediana || 45} días</div>
                        </div>
                        <div class="position-item">
                            <div class="metric">${analisis?.total_analizadas || todas.length}</div>
                            <div class="metric-label">Similares Disponibles</div>
                            <div class="metric-context">En tu rango de búsqueda</div>
                        </div>
                    </div>
                </div>

                <div class="price-chart">
                    <h4>Precio/m² - ${fav.proyecto} vs Alternativas</h4>
                    <div class="chart-container">
                        ${barrasChartHTML}
                    </div>
                    <div class="chart-legend">
                        <div class="legend-item"><div class="legend-color" style="background: var(--oportunidad);"></div><span>Tus elegidas</span></div>
                        <div class="legend-item"><div class="legend-color" style="background: var(--primary);"></div><span>Alternativas</span></div>
                        <div class="legend-item"><div class="legend-color" style="background: var(--gray-600);"></div><span>Promedio resultados</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 4: Comparables -->
    ${comp1 || comp2 ? `
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">4</div>
                <div class="section-title">Comparación con tus otras elegidas</div>
            </div>
            <div class="section-content">
                <p>Tus opciones #2 y #3 comparadas contra ${fav.proyecto}.</p>
                ${[comp1, comp2].filter(Boolean).map((p, i) => {
                  if (!p) return ''
                  const cat = getCategoria(p)
                  const neg = getNegociacion(p.dias_en_mercado)
                  const diffPrecio = p.precio_usd - fav.precio_usd
                  return `
                <div class="comparable-card" style="margin-top: 25px;">
                    <div class="comparable-header">
                        <div class="comparable-name">
                            <div class="comparable-number heart">${i + 2}</div>
                            <div>
                                <h3>${p.proyecto.toUpperCase()}</h3>
                                <div class="subtitle">Tu ${i === 0 ? 'segunda' : 'tercera'} elección</div>
                            </div>
                        </div>
                        <div class="comparable-badges">
                            <span class="badge price-${cat.clase === 'good' ? 'good' : cat.clase === 'high' ? 'high' : 'fair'}">$${fmt(p.precio_usd)}</span>
                            <span class="badge days ${(p.dias_en_mercado || 0) > 90 ? 'high' : ''}">${p.dias_en_mercado || '?'} días</span>
                            <span class="badge negotiation ${neg.clase}">Negociación: ${neg.texto}</span>
                        </div>
                    </div>
                    <div class="comparable-body">
                        <div class="comparable-gallery">
                            ${p.fotos_urls?.[0]
                              ? `<img src="${p.fotos_urls[0]}" alt="${p.proyecto}">`
                              : '<div class="comparable-gallery-placeholder">🏠</div>'}
                        </div>
                        <div class="comparable-details">
                            <div class="detail-grid">
                                <div class="detail-item">
                                    <div class="value">${Math.round(p.area_m2)} m²</div>
                                    <div class="label">Superficie</div>
                                </div>
                                <div class="detail-item">
                                    <div class="value ${cat.clase === 'good' ? 'good' : ''}">$${fmt(p.precio_m2)}</div>
                                    <div class="label">Precio/m²</div>
                                </div>
                                <div class="detail-item">
                                    <div class="value">${zonaDisplay(p.zona)}</div>
                                    <div class="label">Ubicación</div>
                                </div>
                                <div class="detail-item">
                                    <div class="value ${(p.dias_en_mercado || 0) > 90 ? 'warning' : ''}">${p.dias_en_mercado || '?'}</div>
                                    <div class="label">Días mercado</div>
                                </div>
                            </div>
                            <div class="includes-list">
                                <h4>Incluye</h4>
                                <ul>
                                    <li>${p.dormitorios} dormitorios</li>
                                    <li>${p.banos || '?'} baños</li>
                                    ${(p.amenities_confirmados || []).slice(0, 3).map(a => `<li>${a}</li>`).join('')}
                                    ${(p.amenities_por_verificar || []).slice(0, 1).map(a => `<li class="warning">⚠️ ${a}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="comparable-conclusion">
                                <strong>COMPARACIÓN VS ${fav.proyecto.toUpperCase()}</strong>
                                ${diffPrecio > 0
                                  ? `$${fmt(diffPrecio)} más cara.`
                                  : `$${fmt(Math.abs(diffPrecio))} más barata.`}
                                ${Math.round(p.area_m2) !== Math.round(fav.area_m2)
                                  ? ` ${Math.round(p.area_m2 - fav.area_m2) > 0 ? '+' : ''}${Math.round(p.area_m2 - fav.area_m2)}m² de diferencia.`
                                  : ''}
                                ${(p.dias_en_mercado || 0) > 90
                                  ? ' Mucho tiempo en mercado - investigar por qué.'
                                  : ''}
                            </div>
                        </div>
                    </div>
                </div>`
                }).join('')}
            </div>
        </div>
    </div>` : ''}

    <!-- Section 5: Tabla de Alternativas -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">5</div>
                <div class="section-title">Tus 3 Elegidas + Mejores Alternativas</div>
            </div>
            <div class="section-content">
                <p>Todas las opciones de <strong>${datosUsuario.dormitorios ? datosUsuario.dormitorios + ' dormitorios' : 'departamentos'} en ${datosUsuario.zonas?.length ? datosUsuario.zonas.map(z => zonaDisplay(z)).join(', ') : 'todas las zonas'} hasta $${fmt(datosUsuario.presupuesto)}</strong>.</p>
                <table class="summary-table">
                    <thead>
                        <tr>
                            <th>Propiedad</th>
                            <th>Precio</th>
                            <th>m²</th>
                            <th>$/m²</th>
                            <th>Días</th>
                            <th>vs su zona</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${todas.map((p, i) => {
                          const cat = getCategoria(p)
                          return `
                        <tr ${i < 3 ? 'class="highlighted"' : ''}>
                            <td>${i < 3 ? `<span class="table-heart">❤️${i+1}</span>` : ''}<strong>${p.proyecto}</strong></td>
                            <td>$${fmt(p.precio_usd)}</td>
                            <td>${Math.round(p.area_m2)}</td>
                            <td>$${fmt(p.precio_m2)}</td>
                            <td>${p.dias_en_mercado || '?'}</td>
                            <td><span class="position-badge ${cat.clase}">${cat.texto}</span></td>
                        </tr>`
                        }).join('')}
                    </tbody>
                </table>
                <div class="alert info" style="margin-top: 20px;">
                    <div class="alert-icon">📊</div>
                    <div class="alert-content">
                        <h4>Resumen del Mercado</h4>
                        <p>Promedio tus resultados: <strong>$${fmt(precioM2Promedio)}/m²</strong> | Tus elegidas promedian: <strong>$${fmt(Math.round(top3.reduce((s, p) => s + p.precio_m2, 0) / top3.length))}/m²</strong></p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 6: Checklist -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">6</div>
                <div class="section-title">Checklist: Preguntas Antes de Ofertar</div>
            </div>
            <div class="section-content">
                <h4 style="color: var(--primary); margin-bottom: 15px;">Crítico: Sobre el Precio</h4>
                <ul class="checklist">
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿El parqueo está incluido en el precio?</div>
                            <div class="why">En ${zonaDisplay(fav.zona)} suelen venderse aparte (+$12,000 - $18,000)</div>
                        </div>
                    </li>
                    ${fav.dias_en_mercado && fav.dias_en_mercado > 60 ? `
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Por qué ${fav.proyecto} lleva ${fav.dias_en_mercado} días publicado?</div>
                            <div class="why">Puede ser precio negociable o problema oculto.</div>
                        </div>
                    </li>` : ''}
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Precio en TC oficial o paralelo?</div>
                            <div class="why">Diferencia de ~15% en el valor real en Bolivia</div>
                        </div>
                    </li>
                </ul>

                <h4 style="color: var(--primary); margin: 25px 0 15px;">Sobre la Propiedad</h4>
                <ul class="checklist">
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿En qué piso está el departamento?</div>
                            <div class="why">No tenemos este dato. Pisos altos = mejor vista pero más espera de ascensor</div>
                        </div>
                    </li>
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Cuántos m² útiles vs totales?</div>
                            <div class="why">A veces inflan con balcones y muros</div>
                        </div>
                    </li>
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Orientación del departamento?</div>
                            <div class="why">Norte = más luz natural</div>
                        </div>
                    </li>
                </ul>

                ${(fav.amenities_por_verificar || []).length > 0 ? `
                <h4 style="color: var(--primary); margin: 25px 0 15px;">Equipamiento sin confirmar</h4>
                <ul class="checklist">
                    ${fav.amenities_por_verificar.map(a => `
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Tiene ${a}?</div>
                            <div class="why">No está confirmado en la publicación</div>
                        </div>
                    </li>`).join('')}
                </ul>` : ''}
            </div>
        </div>
    </div>

    <!-- Section 7: Negociación -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">7</div>
                <div class="section-title">Estrategia de Negociación para ${fav.proyecto}</div>
            </div>
            <div class="section-content">
                <p>Basado en <strong>${fav.dias_en_mercado || '?'} días en mercado</strong> y precio <strong>${favCat.texto}</strong>, tenés poder de negociación.</p>

                <div class="negotiation-card">
                    <h4>Argumento 1: Tiempo en mercado</h4>
                    <blockquote>
                        "Vi que la propiedad lleva ${fav.dias_en_mercado ? `más de ${Math.floor(fav.dias_en_mercado / 30)} mes${Math.floor(fav.dias_en_mercado / 30) > 1 ? 'es' : ''}` : 'un tiempo'} publicada. ¿Hay flexibilidad en el precio para cerrar rápido?"
                    </blockquote>
                </div>

                ${comp1 || comp2 ? `
                <div class="negotiation-card">
                    <h4>Argumento 2: Comparación con alternativas</h4>
                    <blockquote>
                        "Estoy viendo también ${comp2 ? `un departamento en ${comp2.proyecto} por $${fmt(comp2.precio_usd)}` : comp1 ? `otro en ${comp1.proyecto}` : 'otras opciones'}. ¿Pueden acercarse a ese rango?"
                    </blockquote>
                </div>` : ''}

                <div class="negotiation-card">
                    <h4>Argumento 3: Parqueo</h4>
                    <blockquote>
                        "Si el parqueo no está incluido, necesito descontar esos $15,000 de mi presupuesto. ¿Pueden incluirlo o ajustar?"
                    </blockquote>
                </div>

                <h4 style="color: var(--gray-700); margin: 25px 0 15px;">Contexto para tu Negociación</h4>
                <div style="background: var(--gray-50); border-radius: 10px; padding: 20px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; text-align: center;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary);">$${fmt(fav.precio_usd)}</div>
                            <div style="font-size: 0.85rem; color: var(--gray-600);">Precio publicado</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--oportunidad);">${getDescuento(fav.dias_en_mercado)}</div>
                            <div style="font-size: 0.85rem; color: var(--gray-600);">Descuento promedio en propiedades similares</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning);">$12-18k</div>
                            <div style="font-size: 0.85rem; color: var(--gray-600);">Costo parqueo si no está incluido</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 8: Conclusión -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">8</div>
                <div class="section-title">Conclusión y Recomendación</div>
            </div>
            <div class="section-content">
                <h4 style="color: var(--gray-700); margin-bottom: 15px;">Veredicto Fiduciario</h4>
                <p style="margin-bottom: 20px;">
                    <strong>${fav.proyecto}</strong> es una opción ${favCat.clase === 'good' ? 'sólida' : 'a evaluar'}: precio ${favCat.texto}, ${Math.round(fav.area_m2)}m², y ${fav.dias_en_mercado || '?'} días publicado te dan ${fav.dias_en_mercado && fav.dias_en_mercado > 45 ? 'poder de negociación' : 'poco margen de negociación'}.
                </p>

                <div class="recommendation-box">
                    <h3>✅ Recomendación Final</h3>
                    <table class="recommendation-table">
                        <thead>
                            <tr>
                                <th>Escenario</th>
                                <th>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Si ${fav.proyecto} incluye parqueo</td>
                                <td><strong>Excelente opción. Ofertar $${fmt(Math.round(fav.precio_usd * 0.95))}.</strong></td>
                            </tr>
                            <tr>
                                <td>Si ${fav.proyecto} NO incluye parqueo</td>
                                <td>${comp1 ? `Comparar con ${comp1.proyecto} ($${fmt(comp1.precio_usd)}). ` : ''}Pedir descuento a $${fmt(Math.round(fav.precio_usd * 0.90))}.</td>
                            </tr>
                            <tr>
                                <td>Si no hay flexibilidad</td>
                                <td>${comp2 ? `Considerar ${comp2.proyecto} ($${fmt(comp2.precio_usd)}) pero investigar.` : 'Evaluar otras alternativas de la lista.'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="alert success" style="margin-top: 25px;">
                    <div class="alert-icon">📱</div>
                    <div class="alert-content">
                        <h4>Próximo Paso</h4>
                        <p>Agendar visita a ${fav.proyecto} esta semana. Llevar este checklist impreso y confirmar los puntos pendientes antes de hacer una oferta.</p>
                    </div>
                </div>

                <div class="disclaimer-box">
                    <span class="icon">💡</span>
                    <div>
                        <strong>Los números son una guía, no una regla</strong>
                        <p>Los porcentajes y rangos de este informe son <strong>promedios del mercado</strong>. Cuando estés frente al vendedor, <strong>confiá en tu instinto</strong>: si sentís urgencia de su parte, podés ir más bajo. Si hay mucho interés de otros compradores, quizás convenga cerrar rápido. Simón te da el contexto, pero vos tomás la decisión.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Footer -->
    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div>
                    <div class="logo">Simón<span>.</span></div>
                    <p style="opacity: 0.7; margin-top: 10px;">Inteligencia inmobiliaria para decisiones seguras</p>
                </div>
                <div class="footer-meta">
                    <p><strong>Análisis basado en:</strong></p>
                    <p>${analisis?.total_analizadas || todas.length} propiedades analizadas</p>
                    <p>Datos de mercado: ${fechaHoy}</p>
                    <div class="confidence-badge">
                        <span>📊</span>
                        <span>Actualizado diariamente</span>
                    </div>
                </div>
            </div>
        </div>
    </footer>
</body>
</html>`

    // Responder con HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(html)

  } catch (err) {
    console.error('Error generando informe:', err)
    res.status(500).json({ error: 'Error interno', details: String(err) })
  }
}
