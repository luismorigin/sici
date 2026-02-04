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
  // Nuevos campos para informe premium v3
  estacionamientos?: number | null
  baulera?: boolean | null
  equipamiento_detectado?: string[]
  // Datos del asesor para contacto
  asesor_nombre?: string | null
  asesor_wsp?: string | null
  asesor_inmobiliaria?: string | null
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
  // Nuevos campos Level 2 para personalización
  necesita_parqueo?: boolean
  necesita_baulera?: boolean
  pareja_alineados?: boolean
  mascotas?: boolean
}

interface Analisis {
  precio_m2_promedio: number
  dias_mediana: number
  total_analizadas: number
}

interface LeadData {
  leadId: number
  codigoRef: string
  nombre: string
  whatsapp: string
}

interface InformeRequest {
  propiedades: Propiedad[]
  datosUsuario: DatosUsuario
  analisis: Analisis
  leadData?: LeadData  // Datos del lead (beta tester con feedback)
}

// Helpers
const fmt = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(n)) return '0'
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// Helper para construir URL de contacto broker (redirect-based, funciona desde blob URLs)
// Usa URL absoluta porque el informe se abre en blob: URL donde relativas no funcionan
const buildContactarUrl = (baseHost: string, params: {
  leadId?: number | null
  nombre?: string
  whatsapp?: string
  propId: number
  posicion: number
  proyecto: string
  precio: number
  dormitorios: number
  broker: string
  brokerWsp: string
  inmobiliaria?: string
  codigoRef?: string
  preguntas?: string[] // Preguntas personalizadas del checklist
}): string => {
  const queryParams = new URLSearchParams()

  if (params.leadId) queryParams.set('leadId', String(params.leadId))
  if (params.nombre) queryParams.set('nombre', params.nombre)
  if (params.whatsapp) queryParams.set('whatsapp', params.whatsapp)
  queryParams.set('propId', String(params.propId))
  queryParams.set('posicion', String(params.posicion))
  queryParams.set('proyecto', params.proyecto)
  queryParams.set('precio', String(params.precio))
  queryParams.set('dormitorios', String(params.dormitorios))
  queryParams.set('broker', params.broker)
  queryParams.set('brokerWsp', params.brokerWsp)
  if (params.inmobiliaria) queryParams.set('inmobiliaria', params.inmobiliaria)
  if (params.codigoRef) queryParams.set('codigoRef', params.codigoRef)
  if (params.preguntas && params.preguntas.length > 0) {
    queryParams.set('preguntas', JSON.stringify(params.preguntas))
  }

  return `${baseHost}/api/abrir-whatsapp?${queryParams.toString()}`
}

// Helper para generar preguntas personalizadas basadas en preferencias del usuario y datos de la propiedad
// Estas preguntas deben coincidir con el checklist del informe (Sección 6)
const generarPreguntasPersonalizadas = (
  prop: Propiedad,
  datosUsuario: DatosUsuario,
  necesitaParqueo: boolean,
  necesitaBaulera: boolean
): string[] => {
  const preguntas: string[] = []

  // === SOBRE EL PRECIO ===
  // Parqueo
  const tieneParqueo = (prop.estacionamientos || 0) > 0
  if (necesitaParqueo && !tieneParqueo) {
    preguntas.push('¿El parqueo está incluido en el precio?')
  }

  // Baulera
  if (necesitaBaulera && !prop.baulera) {
    preguntas.push('¿La baulera está incluida en el precio?')
  }

  // === SOBRE LA PREVENTA ===
  if (prop.estado_construccion === 'preventa') {
    preguntas.push('¿Cuál es la fecha de entrega?')
    preguntas.push('¿Cuál es el plan de pagos?')
  }

  // === SOBRE LA PROPIEDAD ===
  // Piso (siempre útil saber)
  preguntas.push('¿En qué piso está el departamento?')

  // Expensas (siempre importante)
  preguntas.push('¿Cuánto es el pago de expensas mensuales?')

  // Pet-friendly (si tiene mascotas o está en innegociables)
  const petFriendlyConfirmado = (prop.amenities_confirmados || []).some((a: string) =>
    a.toLowerCase().includes('pet') || a.toLowerCase().includes('mascota')
  )
  const tieneMascotas = datosUsuario.mascotas === true
  const petEnInnegociables = (datosUsuario.innegociables || []).some(a =>
    a.toLowerCase().includes('pet') || a.toLowerCase().includes('mascota')
  )
  if ((tieneMascotas || petEnInnegociables) && !petFriendlyConfirmado) {
    preguntas.push('¿El edificio acepta mascotas?')
  }

  // === INNEGOCIABLES DEL USUARIO ===
  const innegociables = datosUsuario.innegociables || []
  if (innegociables.length > 0) {
    // Filtrar pet-friendly (ya lo preguntamos arriba si aplica)
    const amenitiesParaPreguntar = innegociables.filter(a =>
      !a.toLowerCase().includes('pet') && !a.toLowerCase().includes('mascota')
    )
    if (amenitiesParaPreguntar.length > 0) {
      // Formatear nombres bonitos
      const nombresFormateados = amenitiesParaPreguntar.map(a =>
        a.replace(/_/g, ' ').toLowerCase()
      )
      preguntas.push(`¿Tiene ${nombresFormateados.join(' y ')} funcionando?`)
    }
  }

  return preguntas
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

// Icono universal para todas las amenidades - checkmark dorado simple
const amenityIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2.5" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>'

const getAmenityEmoji = (): string => amenityIcon

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

// Formatear dormitorios: 0 = Monoambiente, 1 = 1 Dormitorio, 2+ = X Dormitorios
const formatDormitorios = (dorms: number | null | undefined, capitalize = true): string => {
  const num = Number(dorms) || 0
  if (num === 0) return capitalize ? 'Monoambiente' : 'monoambiente'
  if (num === 1) return capitalize ? '1 Dormitorio' : '1 dormitorio'
  return `${num} ${capitalize ? 'Dormitorios' : 'dormitorios'}`
}

// Costos estimados por dormitorios
const getCostosEstimados = (dormitorios: number) => {
  const costos: Record<number, { expensasMin: number; expensasMax: number; parqueoMin: number; parqueoMax: number; bauleraMin: number; bauleraMax: number }> = {
    0: { expensasMin: 50, expensasMax: 80, parqueoMin: 10000, parqueoMax: 14000, bauleraMin: 3000, bauleraMax: 5000 },
    1: { expensasMin: 60, expensasMax: 100, parqueoMin: 12000, parqueoMax: 16000, bauleraMin: 4000, bauleraMax: 6000 },
    2: { expensasMin: 80, expensasMax: 130, parqueoMin: 14000, parqueoMax: 18000, bauleraMin: 5000, bauleraMax: 8000 },
    3: { expensasMin: 100, expensasMax: 160, parqueoMin: 15000, parqueoMax: 20000, bauleraMin: 6000, bauleraMax: 10000 }
  }
  const key = dormitorios > 3 ? 3 : dormitorios
  return costos[key] || costos[2]
}

// Valor estimado del equipamiento detectado
const VALOR_EQUIPAMIENTO: Record<string, number> = {
  'Heladera': 550, 'Encimera': 300, 'Microondas': 100, 'Horno empotrado': 400,
  'Campana extractora': 150, 'Muebles cocina': 700, 'Cocina equipada': 1200,
  'Calefón': 220, 'Termotanque': 280, 'Box ducha': 300, 'Closets': 400,
  'Cortinas': 120, 'Aire acondicionado': 550, 'Lavadora': 400, 'Amoblado': 2500
}

const calcularValorEquipamiento = (items: string[]): number => {
  return items.reduce((total, item) => {
    for (const [key, valor] of Object.entries(VALOR_EQUIPAMIENTO)) {
      if (item.toLowerCase().includes(key.toLowerCase())) return total + valor
    }
    return total
  }, 0)
}

// Calcular precio real incluyendo extras faltantes
const calcularPrecioReal = (
  p: Propiedad,
  necesitaParqueo: boolean,
  necesitaBaulera: boolean
): { precioReal: number; extras: string[]; costoExtras: number } => {
  const costos = getCostosEstimados(p.dormitorios)
  const tieneParqueo = p.estacionamientos != null && p.estacionamientos > 0
  const tieneBaulera = p.baulera === true

  let costoExtras = 0
  const extras: string[] = []

  if (necesitaParqueo && !tieneParqueo) {
    costoExtras += Math.round((costos.parqueoMin + costos.parqueoMax) / 2)
    extras.push('parqueo')
  }
  if (necesitaBaulera && !tieneBaulera) {
    costoExtras += Math.round((costos.bauleraMin + costos.bauleraMax) / 2)
    extras.push('baulera')
  }

  return {
    precioReal: p.precio_usd + costoExtras,
    extras,
    costoExtras
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    // Obtener host para URLs absolutas (necesario porque el informe abre en blob: URL)
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
    const baseHost = `${protocol}://${host}`

    const { propiedades, datosUsuario, analisis, leadData } = req.body as InformeRequest

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

    // Preferencias del usuario (con defaults)
    const necesitaParqueo = datosUsuario.necesita_parqueo !== false
    const necesitaBaulera = datosUsuario.necesita_baulera === true

    // Cálculos para tabla comparativa
    const calcularDatosComparativos = (p: Propiedad) => {
      const costos = getCostosEstimados(p.dormitorios)
      const precioRealData = calcularPrecioReal(p, necesitaParqueo, necesitaBaulera)
      const valorEquip = calcularValorEquipamiento(p.equipamiento_detectado || [])
      const tieneParqueo = p.estacionamientos != null && p.estacionamientos > 0
      const tieneBaulera = p.baulera === true

      // Contar amenidades pedidas que tiene
      const amenidadesPedidas = datosUsuario.innegociables || []
      const amenidadesTiene = amenidadesPedidas.filter(a =>
        (p.amenities_confirmados || []).some(ac => ac.toLowerCase().includes(a.toLowerCase()))
      ).length

      return {
        precioPublicado: p.precio_usd,
        precioReal: precioRealData.precioReal,
        extrasNecesarios: precioRealData.extras,
        costoExtras: precioRealData.costoExtras,
        expensasMin: costos.expensasMin,
        expensasMax: costos.expensasMax,
        impacto5Anos: Math.round((costos.expensasMin + costos.expensasMax) / 2) * 60,
        diasMercado: p.dias_en_mercado || 0,
        rankingEdificio: p.posicion_precio_edificio,
        unidadesEdificio: p.unidades_en_edificio,
        amenidadesPedidas: amenidadesPedidas.length,
        amenidadesTiene,
        valorEquipamiento: valorEquip,
        tieneParqueo,
        tieneBaulera
      }
    }

    const datosFav = calcularDatosComparativos(fav)
    const datosComp1 = comp1 ? calcularDatosComparativos(comp1) : null
    const datosComp2 = comp2 ? calcularDatosComparativos(comp2) : null

    // Separar amenidades de edificio vs equipamiento del depto
    const AMENITIES_EDIFICIO = [
      'Piscina', 'Piscina infinita', 'Gimnasio', 'Cowork', 'Sala TV/Cine',
      'Jacuzzi', 'Sauna', 'Seguridad 24h', 'Cámaras seguridad', 'Sala de juegos',
      'Billar', 'Bar/Lounge', 'Churrasquera', 'Roof garden', 'Lobby/Recepción',
      'Jardín', 'Parque infantil', 'Canchas deportivas', 'Sala yoga',
      'Pet friendly', 'Ascensor', 'Salón de eventos'
    ]

    const separarEquipamiento = (p: Propiedad) => {
      const equipRaw = p.equipamiento_detectado || []
      const amenitiesFromEquip = equipRaw.filter(item => AMENITIES_EDIFICIO.includes(item))
      const equipamientoReal = equipRaw.filter(item => !AMENITIES_EDIFICIO.includes(item))
      const amenitiesConfirmados = p.amenities_confirmados || []
      const allAmenities = [...new Set([...amenitiesConfirmados, ...amenitiesFromEquip])]
      return { equipamientoReal, allAmenities }
    }

    const equipFav = separarEquipamiento(fav)
    const equipComp1 = comp1 ? separarEquipamiento(comp1) : null
    const equipComp2 = comp2 ? separarEquipamiento(comp2) : null

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
          html: '<div class="chart-bar"><div class="bar ' + barClass + '" style="height: ' + height + 'px;"><span class="bar-label">$' + fmt(p.precio_m2) + '</span></div><div class="bar-name ' + nameClass + '">' + (p.proyecto.length > 18 ? p.proyecto.substring(0, 16) + '...' : p.proyecto) + label + '</div></div>',
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
            --primary: #0a0a0a;
            --primary-light: #1a1a1a;
            --accent: #c9a959;
            --accent-light: #d4b96a;
            --warning: #c9a959;
            --danger: #ef4444;
            --heart: #c9a959;
            --oportunidad: #c9a959;
            --justo: #666666;
            --premium: #c9a959;
            --gold: #c9a959;
            --gold-light: #e8d59e;
            --gold-dark: #b5935a;
            --cream: #f8f6f3;
            --gray-50: #f8f6f3;
            --gray-100: #e8e6e3;
            --gray-200: rgba(201,169,89,0.2);
            --gray-300: rgba(201,169,89,0.3);
            --gray-600: rgba(248,246,243,0.6);
            --gray-700: rgba(248,246,243,0.7);
            --gray-800: #f8f6f3;
            --gray-900: #0a0a0a;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: var(--cream); background: var(--primary); }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }

        /* Hero - Premium Style */
        .hero { position: relative; height: 450px; overflow: hidden; }
        .hero img { width: 100%; height: 100%; object-fit: cover; }
        .hero-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, #0a0a0a, #1a1a1a); display: flex; align-items: center; justify-content: center; font-size: 4rem; color: var(--gold); }
        .hero-overlay { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, rgba(10,10,10,0.95)); padding: 60px 20px 30px; color: var(--cream); }
        .hero-overlay .logo { font-size: 1.6rem; font-weight: 700; margin-bottom: 12px; color: var(--cream); }
        .hero-overlay .logo span { color: var(--gold); }
        .hero-title { font-size: 2rem; font-weight: 700; margin-bottom: 8px; color: var(--cream); }
        .hero-subtitle { opacity: 0.9; font-size: 1.1rem; margin-bottom: 15px; color: var(--cream); }
        .hero-badges { display: flex; gap: 10px; flex-wrap: wrap; }
        .hero-badge { background: rgba(201,169,89,0.2); padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; backdrop-filter: blur(10px); color: var(--cream); border: 1px solid rgba(201,169,89,0.3); }
        .hero-badge.heart { background: var(--gold); color: #0a0a0a; border: none; }
        .hero-badge.oportunidad { background: var(--oportunidad); color: white; border: none; }
        .hero-badge.justo { background: var(--justo); color: white; border: none; }
        .hero-badge.premium { background: var(--gold); color: #0a0a0a; border: none; }

        /* Search Summary - Premium */
        .search-summary { background: #1a1a1a; margin: -30px 20px 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); padding: 25px 30px; position: relative; z-index: 10; border: 1px solid rgba(201,169,89,0.2); }
        .search-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 15px; margin-top: 15px; }
        .search-item { text-align: center; padding: 12px; background: #0a0a0a; border-radius: 8px; border: 1px solid rgba(201,169,89,0.2); }
        .search-item .value { font-size: 1.2rem; font-weight: 700; color: var(--gold); }
        .search-item .label { font-size: 0.75rem; color: rgba(248,246,243,0.6); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
        .search-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(201,169,89,0.2); }
        .search-tag { background: var(--gold); color: #0a0a0a; padding: 5px 12px; border-radius: 15px; font-size: 0.85rem; font-weight: 500; }
        .search-tag.optional { background: rgba(201,169,89,0.2); color: var(--cream); }

        /* Section styles - Premium */
        .section { background: #1a1a1a; margin: 30px 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid rgba(201,169,89,0.2); }
        .section-header { background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); color: var(--cream); padding: 20px 30px; display: flex; align-items: center; gap: 15px; border-bottom: 1px solid var(--gold); }
        .section-number { background: var(--gold); color: #0a0a0a; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.2rem; }
        .section-title { font-size: 1.3rem; font-weight: 600; color: var(--cream); }
        .section-content { padding: 30px; }

        /* Profile Grid - Premium */
        .profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .profile-card { background: #0a0a0a; border-radius: 12px; padding: 20px; border: 1px solid rgba(201,169,89,0.2); }
        .profile-card h4 { color: var(--gold); margin-bottom: 12px; font-size: 0.9rem; }
        .slider-visual { margin: 12px 0; }
        .slider-labels { display: flex; justify-content: space-between; font-size: 0.8rem; color: rgba(248,246,243,0.6); margin-bottom: 6px; }
        .slider-bar { height: 8px; background: #333333; border-radius: 4px; }
        .slider-fill { height: 100%; background: linear-gradient(90deg, var(--gold), var(--gold-light)); border-radius: 4px; }
        .slider-value { text-align: center; font-weight: 600; color: var(--gold); margin-top: 8px; font-size: 0.9rem; }

        /* Specs - Premium */
        .spec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; }
        @media (max-width: 768px) { .spec-grid { grid-template-columns: 1fr; } }
        .spec-card { background: #0a0a0a; border-radius: 8px; padding: 20px; border: 1px solid rgba(201,169,89,0.2); }
        .spec-card h4 { color: var(--gold); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 15px; }
        .spec-list { list-style: none; }
        .spec-list li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(201,169,89,0.15); }
        .spec-list li:last-child { border-bottom: none; }
        .spec-list .label { color: rgba(248,246,243,0.6); }
        .spec-list .value { font-weight: 600; color: var(--cream); }

        /* Price Cards - Premium */
        .price-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; }
        .price-card { border-radius: 12px; padding: 20px; text-align: center; }
        .price-card.primary { background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%); color: #0a0a0a; }
        .price-card.secondary { background: #0a0a0a; border: 1px solid rgba(201,169,89,0.3); color: var(--cream); }
        .price-card.warning { background: linear-gradient(135deg, var(--oportunidad) 0%, var(--accent-light) 100%); color: white; }
        .price-card .label-top { font-size: 0.8rem; opacity: 0.9; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .price-card .price-main { font-size: 1.8rem; font-weight: 700; margin-bottom: 4px; }
        .price-card .price-detail { font-size: 0.85rem; opacity: 0.9; }
        .price-card .badge-position { display: inline-block; margin-top: 8px; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; background: rgba(0,0,0,0.2); }

        /* Amenities - Premium */
        .amenities-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 20px; }
        .amenity-item { display: flex; align-items: center; gap: 12px; padding: 14px; background: rgba(201,169,89,0.1); border-radius: 8px; border: 1px solid rgba(201,169,89,0.2); }
        .amenity-icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .amenity-details .name { font-weight: 600; color: var(--cream); font-size: 0.9rem; }
        .amenity-details .vs-market { font-size: 0.75rem; color: var(--gold); font-weight: 500; }
        .amenity-details .vs-market.standard { color: rgba(248,246,243,0.6); }
        .amenity-details .vs-market.warning { color: var(--oportunidad); }

        /* Alert - Premium */
        .alert { padding: 18px; border-radius: 8px; margin-top: 20px; display: flex; gap: 12px; align-items: flex-start; }
        .alert.success { background: rgba(201,169,89,0.1); border-left: 4px solid var(--oportunidad); color: var(--oportunidad); }
        .alert.warning { background: rgba(201,169,89,0.1); border-left: 4px solid var(--gold); color: var(--gold); }
        .alert.info { background: rgba(201,169,89,0.05); border-left: 4px solid var(--gold); color: var(--cream); }
        .alert-icon { font-size: 1.3rem; }
        .alert-content h4 { color: var(--cream); margin-bottom: 4px; font-size: 0.95rem; }
        .alert-content p { color: rgba(248,246,243,0.8); font-size: 0.9rem; }

        /* Photos - Premium */
        .photos-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 20px; }
        .photos-grid img { width: 100%; height: 110px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(201,169,89,0.2); }

        /* Market Position - Premium */
        .market-position { background: #0a0a0a; border-radius: 12px; padding: 25px; margin-top: 25px; border: 1px solid rgba(201,169,89,0.2); }
        .market-position h4 { color: var(--gold); margin-bottom: 20px; }
        .position-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; }
        .position-item { background: #1a1a1a; border-radius: 8px; padding: 18px; text-align: center; border: 1px solid rgba(201,169,89,0.2); }
        .position-item .metric { font-size: 1.6rem; font-weight: 700; color: var(--gold); }
        .position-item .metric.good { color: var(--oportunidad); }
        .position-item .metric.warning { color: var(--gold); }
        .position-item .metric-label { font-size: 0.8rem; color: rgba(248,246,243,0.6); margin-top: 4px; }
        .position-item .metric-context { font-size: 0.7rem; color: rgba(248,246,243,0.5); margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(201,169,89,0.15); }

        /* Chart - Premium */
        .price-chart { margin-top: 30px; padding: 25px; background: #0a0a0a; border-radius: 12px; border: 1px solid rgba(201,169,89,0.2); }
        .price-chart h4 { text-align: center; color: var(--cream); margin-bottom: 25px; }
        .chart-container { position: relative; height: 250px; display: flex; align-items: flex-end; gap: 8px; }
        .chart-bar { flex: 1; display: flex; flex-direction: column; align-items: center; height: 210px; justify-content: flex-end; }
        .bar { width: 100%; max-width: 60px; background: #333333; border-radius: 4px 4px 0 0; position: relative; min-height: 20px; }
        .bar.selected { background: var(--gold); }
        .bar.warning { background: var(--oportunidad); }
        .bar-label { position: absolute; top: -18px; left: 50%; transform: translateX(-50%); font-size: 0.65rem; font-weight: 700; color: var(--cream); white-space: nowrap; }
        .bar-name { margin-top: 8px; font-size: 0.55rem; color: rgba(248,246,243,0.6); text-align: center; max-width: 90px; min-height: 32px; line-height: 1.2; word-wrap: break-word; }
        .bar-name.selected { font-weight: 700; color: var(--gold); }
        .chart-legend { display: flex; justify-content: center; gap: 20px; margin-top: 15px; flex-wrap: wrap; }
        .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: rgba(248,246,243,0.7); }
        .legend-color { width: 14px; height: 14px; border-radius: 3px; }

        /* Comparables - Premium */
        .comparable-card { border: 1px solid rgba(201,169,89,0.2); border-radius: 12px; overflow: hidden; margin-bottom: 25px; background: #1a1a1a; }
        .comparable-header { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; background: #0a0a0a; border-bottom: 1px solid rgba(201,169,89,0.2); flex-wrap: wrap; gap: 12px; }
        .comparable-name { display: flex; align-items: center; gap: 12px; }
        .comparable-number { background: var(--gold); color: #0a0a0a; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; }
        .comparable-number.heart { background: var(--gold); }
        .comparable-name h3 { font-size: 1.1rem; color: var(--cream); }
        .comparable-name .subtitle { font-size: 0.8rem; color: rgba(248,246,243,0.6); }
        .comparable-badges { display: flex; gap: 8px; flex-wrap: wrap; }
        .badge { padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
        .badge.price-good { background: var(--oportunidad); color: white; }
        .badge.price-fair { background: var(--justo); color: white; }
        .badge.price-high { background: var(--gold); color: #0a0a0a; }
        .badge.days { background: rgba(201,169,89,0.2); color: var(--cream); }
        .badge.days.high { background: rgba(201,169,89,0.3); color: var(--gold); }
        .badge.negotiation { background: var(--gold); color: #0a0a0a; }
        .badge.negotiation.high { background: var(--oportunidad); color: white; }

        .comparable-body { display: grid; grid-template-columns: 280px 1fr; gap: 0; }
        @media (max-width: 768px) { .comparable-body { grid-template-columns: 1fr; } }
        .comparable-gallery { position: relative; height: 220px; overflow: hidden; }
        .comparable-gallery img { width: 100%; height: 100%; object-fit: cover; }
        .comparable-gallery-placeholder { width: 100%; height: 100%; background: #333333; display: flex; align-items: center; justify-content: center; font-size: 3rem; color: rgba(248,246,243,0.3); }
        .comparable-details { padding: 20px; }
        .detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
        @media (max-width: 600px) { .detail-grid { grid-template-columns: repeat(2, 1fr); } }
        .detail-item { text-align: center; padding: 12px 8px; background: #0a0a0a; border-radius: 8px; border: 1px solid rgba(201,169,89,0.2); }
        .detail-item .value { font-size: 1.1rem; font-weight: 700; color: var(--gold); }
        .detail-item .value.good { color: var(--oportunidad); }
        .detail-item .value.warning { color: var(--gold); }
        .detail-item .label { font-size: 0.7rem; color: rgba(248,246,243,0.6); text-transform: uppercase; }

        .includes-list { margin-top: 15px; }
        .includes-list h4 { font-size: 0.85rem; color: var(--gold); margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
        .includes-list ul { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
        .includes-list li { background: rgba(201,169,89,0.1); padding: 5px 12px; border-radius: 15px; font-size: 0.8rem; color: var(--cream); border: 1px solid rgba(201,169,89,0.2); }
        .includes-list li.highlight { background: var(--oportunidad); color: white; border: none; }
        .includes-list li.warning { background: rgba(201,169,89,0.2); color: var(--gold); border: none; }

        .comparable-conclusion { margin-top: 15px; padding: 15px; background: linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%); color: #0a0a0a; border-radius: 8px; }
        .comparable-conclusion strong { display: block; margin-bottom: 5px; font-size: 0.8rem; opacity: 0.9; }

        /* Table - Premium */
        /* Table with horizontal scroll for mobile */
        .table-scroll-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 20px -15px; padding: 0 15px; }
        .table-scroll-wrapper::-webkit-scrollbar { height: 6px; }
        .table-scroll-wrapper::-webkit-scrollbar-track { background: #1a1a1a; border-radius: 3px; }
        .table-scroll-wrapper::-webkit-scrollbar-thumb { background: var(--gold); border-radius: 3px; }
        .summary-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; min-width: 600px; }
        .summary-table th { background: #0a0a0a; color: var(--gold); padding: 12px 10px; text-align: left; font-weight: 600; white-space: nowrap; border: 1px solid rgba(201,169,89,0.3); }
        .summary-table td { padding: 12px 10px; border-bottom: 1px solid rgba(201,169,89,0.15); white-space: nowrap; color: var(--cream); }
        .summary-table tr:nth-child(even) { background: rgba(201,169,89,0.05); }
        .summary-table tr.highlighted { background: rgba(201,169,89,0.15); }
        .table-heart { color: var(--gold); margin-right: 4px; }
        .position-badge { display: inline-block; padding: 3px 8px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; }
        .position-badge.good { background: rgba(201,169,89,0.2); color: var(--oportunidad); }
        .position-badge.fair { background: rgba(102,102,102,0.3); color: rgba(248,246,243,0.8); }
        .position-badge.high { background: rgba(201,169,89,0.2); color: var(--gold); }

        /* Checklist - Premium */
        .checklist { list-style: none; margin-top: 15px; }
        .checklist li { padding: 12px 0; border-bottom: 1px solid rgba(201,169,89,0.15); display: flex; align-items: flex-start; gap: 12px; }
        .checklist li:last-child { border-bottom: none; }
        .checkbox { width: 22px; height: 22px; border: 2px solid var(--gold); border-radius: 4px; flex-shrink: 0; margin-top: 2px; }
        .checklist .question { font-weight: 500; color: var(--cream); }
        .checklist .why { font-size: 0.85rem; color: rgba(248,246,243,0.6); margin-top: 3px; }

        /* Negotiation - Premium */
        .negotiation-card { background: #0a0a0a; border-radius: 12px; padding: 22px; margin-top: 20px; border: 1px solid rgba(201,169,89,0.2); }
        .negotiation-card h4 { color: var(--gold); margin-bottom: 12px; }
        .negotiation-card blockquote { background: #1a1a1a; border-left: 4px solid var(--gold); padding: 12px 18px; margin: 12px 0; font-style: italic; color: rgba(248,246,243,0.8); border-radius: 0 8px 8px 0; font-size: 0.9rem; }

        /* Recommendation - Premium */
        .recommendation-box { background: #0a0a0a; color: var(--cream); border-radius: 12px; padding: 30px; margin-top: 25px; border: 1px solid rgba(201,169,89,0.3); }
        .recommendation-box h3 { font-size: 1.3rem; margin-bottom: 18px; display: flex; align-items: center; gap: 10px; color: var(--gold); }
        .recommendation-table { width: 100%; border-collapse: collapse; }
        .recommendation-table th { text-align: left; padding: 10px; border-bottom: 1px solid rgba(201,169,89,0.2); font-weight: 500; color: var(--gold); }
        .recommendation-table td { padding: 10px; border-bottom: 1px solid rgba(201,169,89,0.1); color: rgba(248,246,243,0.9); }
        .recommendation-table td:last-child { font-weight: 600; color: var(--cream); }

        /* Disclaimer - Premium */
        .disclaimer-box { background: rgba(201,169,89,0.1); border: 1px solid rgba(201,169,89,0.3); border-radius: 10px; padding: 18px 20px; margin-top: 20px; display: flex; gap: 12px; align-items: flex-start; }
        .disclaimer-box .icon { font-size: 1.3rem; }
        .disclaimer-box strong { color: var(--gold); display: block; margin-bottom: 4px; }
        .disclaimer-box p { font-size: 0.9rem; color: rgba(248,246,243,0.7); margin: 0; }

        /* Footer - Premium */
        .footer { background: #0a0a0a; color: var(--cream); padding: 40px 0; margin-top: 50px; border-top: 1px solid var(--gold); }
        .footer-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; }
        .footer .logo { font-size: 1.8rem; font-weight: 700; color: var(--cream); }
        .footer .logo span { color: var(--gold); }
        .footer-meta { text-align: right; font-size: 0.9rem; opacity: 0.8; }
        .confidence-badge { display: inline-flex; align-items: center; gap: 8px; background: var(--gold); color: #0a0a0a; padding: 8px 16px; border-radius: 20px; font-weight: 600; margin-top: 10px; }

        /* ========== MOBILE RESPONSIVE ========== */
        @media (max-width: 768px) {
            .container { padding: 0 15px; }

            /* Hero mobile */
            .hero { height: 300px; }
            .hero-overlay { padding: 40px 15px 20px; }
            .hero-overlay .logo { font-size: 1.3rem; }
            .hero-title { font-size: 1.4rem; }
            .hero-subtitle { font-size: 0.9rem; }
            .hero-badge { padding: 4px 10px; font-size: 0.75rem; }

            /* Search summary mobile */
            .search-summary { margin: -20px 10px 20px; padding: 15px; }
            .search-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
            .search-item .value { font-size: 1rem; }
            .search-item .label { font-size: 0.65rem; }

            /* Sections mobile */
            .section { margin: 15px 10px; }
            .section-header { padding: 15px; gap: 10px; }
            .section-number { width: 32px; height: 32px; font-size: 1rem; }
            .section-title { font-size: 1.1rem; }
            .section-content { padding: 15px; }

            /* Price cards mobile */
            .price-cards { grid-template-columns: 1fr; gap: 10px; }
            .price-card { padding: 15px; }
            .price-card .price-main { font-size: 1.5rem; }

            /* Amenities mobile */
            .amenities-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
            .amenity-item { padding: 10px; gap: 8px; }
            .amenity-icon { width: 20px; height: 20px; }
            .amenity-details .name { font-size: 0.8rem; }

            /* Photos mobile */
            .photos-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
            .photos-grid img { height: 80px; }

            /* Comparable cards mobile */
            .comparable-card { margin-bottom: 15px; }
            .comparable-header { padding: 12px 15px; }
            .comparable-header h3 { font-size: 1rem; }
            .comparable-body { grid-template-columns: 1fr; padding: 15px; gap: 15px; }

            /* Footer mobile */
            .footer { padding: 25px 0; }
            .footer-content { flex-direction: column; text-align: center; }
            .footer-meta { text-align: center; }

            /* Buttons mobile */
            .btn-contactar { padding: 12px 20px; font-size: 0.9rem; }

            /* Tables mobile */
            .detail-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
            .detail-item { padding: 10px; }

            /* Profile grid mobile */
            .profile-grid { grid-template-columns: 1fr; }

            /* Alert mobile */
            .alert { padding: 12px; }
            .alert-content h4 { font-size: 0.85rem; }
            .alert-content p { font-size: 0.8rem; }
        }

        @media (max-width: 480px) {
            .hero { height: 250px; }
            .hero-title { font-size: 1.2rem; }
            .hero-badges { gap: 6px; }
            .hero-badge { padding: 3px 8px; font-size: 0.7rem; }

            .search-grid { grid-template-columns: repeat(2, 1fr); }
            .search-item { padding: 8px; }
            .search-item .value { font-size: 0.9rem; }

            .section-title { font-size: 1rem; }
            .section-content { padding: 12px; }

            .price-card .price-main { font-size: 1.3rem; }
            .price-card .label-top { font-size: 0.7rem; }
            .price-card .price-detail { font-size: 0.75rem; }

            .amenities-grid { grid-template-columns: 1fr; }

            .photos-grid { grid-template-columns: repeat(2, 1fr); }

            .btn-contactar { width: 100%; justify-content: center; }

            /* Checklist mobile */
            .checklist-item { padding: 10px; }
            .checklist-item label { font-size: 0.85rem; }

            /* Table scroll hint */
            .scroll-hint { display: block !important; text-align: center; }
            .table-scroll-wrapper { margin: 10px -12px; padding: 0 12px; }
            .summary-table { font-size: 0.75rem; }
            .summary-table th, .summary-table td { padding: 8px 6px; }
        }

        @media print {
            .hero { height: 350px; }
            .section { break-inside: avoid; }
            .comparable-card { break-inside: avoid; }
        }

        /* Toast notification - Premium */
        .toast-container {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            pointer-events: none;
        }
        .toast {
            background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
            color: var(--cream);
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border: 1px solid var(--gold);
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 600;
            font-size: 1rem;
            animation: toastSlideIn 0.4s ease-out, toastFadeOut 0.4s ease-in 3.5s forwards;
            pointer-events: auto;
        }
        .toast-icon {
            font-size: 1.5rem;
            color: var(--gold);
        }
        @keyframes toastSlideIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes toastFadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
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
    <script>
        function showToast(message, icon) {
            var container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                container.className = 'toast-container';
                document.body.appendChild(container);
            }
            var toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + message + '</span>';
            container.appendChild(toast);
            setTimeout(function() { toast.remove(); }, 4000);
        }
    </script>
    <!-- html2canvas + jsPDF para descarga PDF -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script>
        async function descargarPDF() {
            var btn = document.getElementById('btn-pdf');
            var originalText = btn.innerHTML;
            btn.innerHTML = 'Generando PDF...';
            btn.disabled = true;

            try {
                // Ocultar botón PDF y botones de contactar durante captura
                btn.style.display = 'none';
                var contactBtns = document.querySelectorAll('a[href*="abrir-whatsapp"]');
                contactBtns.forEach(function(b) { b.style.visibility = 'hidden'; });

                // Capturar todo el body
                var element = document.body;
                var canvas = await html2canvas(element, {
                    scale: 2, // Mayor calidad
                    useCORS: true, // Para imágenes externas
                    allowTaint: true,
                    backgroundColor: '#0a0a0a',
                    logging: false
                });

                // Restaurar botones
                btn.style.display = 'flex';
                contactBtns.forEach(function(b) { b.style.visibility = 'visible'; });

                // Crear PDF - Una sola página larga (scroll continuo)
                var { jsPDF } = window.jspdf;
                var imgData = canvas.toDataURL('image/jpeg', 0.85);

                // Calcular dimensiones - ancho fijo, alto proporcional
                var pdfWidth = 210; // mm (ancho A4)
                var imgHeight = (canvas.height * pdfWidth) / canvas.width;

                // Crear PDF con tamaño personalizado (una sola página larga)
                var pdf = new jsPDF('p', 'mm', [pdfWidth, imgHeight]);

                // Agregar imagen completa
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);

                // Descargar
                pdf.save('Informe-Simon-${fav.proyecto.replace(/[^a-zA-Z0-9]/g, '_')}.pdf');

                btn.innerHTML = originalText;
                btn.disabled = false;
                showToast('PDF descargado', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>');
            } catch (err) {
                console.error('Error generando PDF:', err);
                btn.style.display = 'flex';
                btn.innerHTML = originalText;
                btn.disabled = false;
                showToast('Error al generar PDF', '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b4557" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>');
            }
        }
    </script>
</head>
<body>
    <!-- Hero -->
    <section class="hero">
        ${fav.fotos_urls?.[0]
          ? `<img src="${fav.fotos_urls[0]}" alt="${fav.proyecto}">`
          : '<div class="hero-placeholder"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>'}
        <div class="hero-overlay">
            <div class="container">
                <div class="logo">Simón<span>.</span></div>
                <h1 class="hero-title">Tu Favorita: ${fav.proyecto.toUpperCase()}</h1>
                <p class="hero-subtitle">Informe Fiduciario Premium | ${zonaDisplay(fav.zona)}, ${Math.round(fav.area_m2)} m², ${formatDormitorios(fav.dormitorios)}</p>
                <div class="hero-badges">
                    <span class="hero-badge heart"><svg width="14" height="14" viewBox="0 0 24 24" fill="#c9a959" stroke="#c9a959" stroke-width="1" style="display: inline; vertical-align: middle;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Tu #1</span>
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
            <h3 style="color: var(--cream); margin-bottom: 5px;">Tu Búsqueda</h3>
            <p style="color: rgba(248,246,243,0.6); font-size: 0.9rem;">Los filtros que usaste para encontrar estas propiedades</p>
            <div class="search-grid">
                <div class="search-item">
                    <div class="value">$${fmt(datosUsuario.presupuesto)}</div>
                    <div class="label">Presupuesto</div>
                </div>
                <div class="search-item">
                    <div class="value">${datosUsuario.dormitorios !== null && datosUsuario.dormitorios !== undefined ? formatDormitorios(datosUsuario.dormitorios) : 'Todos'}</div>
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
                        <p style="font-size: 1.05rem; font-weight: 600; color: var(--cream);">${datosUsuario.quienes_viven || 'No especificado'}</p>
                        <p style="color: rgba(248,246,243,0.6); font-size: 0.85rem; margin-top: 6px;">Buscás espacio adecuado para tu situación.</p>
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
                        <p style="font-size: 1.05rem; font-weight: 600; color: var(--cream);">${favCat.clase === 'good' ? 'Mejor relación precio/valor' : favCat.clase === 'high' ? 'Mejor ubicación/calidad' : 'Mejor balance general'}</p>
                        <p style="color: rgba(248,246,243,0.6); font-size: 0.85rem; margin-top: 6px;">Basado en tus preferencias y el análisis de mercado.</p>
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
                            <li><span class="label">Dormitorios</span><span class="value">${formatDormitorios(fav.dormitorios)}</span></li>
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
                                <div class="price-detail">por m² (${formatDormitorios(fav.dormitorios, false)})</div>
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

                ${equipFav.allAmenities.length > 0 ? `
                <h4 style="margin-top: 30px; margin-bottom: 15px; color: var(--cream); display: flex; align-items: center; gap: 10px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--gold);"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg> Amenidades del Edificio</h4>
                <div class="amenities-grid">
                    ${equipFav.allAmenities.slice(0, 8).map(a => `
                    <div class="amenity-item">
                        <div class="amenity-icon">${getAmenityEmoji(a)}</div>
                        <div class="amenity-details">
                            <div class="name">${a}</div>
                            <div class="vs-market standard">Confirmado</div>
                        </div>
                    </div>`).join('')}
                </div>` : ''}

                ${equipFav.equipamientoReal.length > 0 ? `
                <h4 style="margin-top: 25px; margin-bottom: 15px; color: var(--cream); display: flex; align-items: center; gap: 10px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--gold);"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Equipamiento del Departamento</h4>
                <div style="background: #0a0a0a; border-radius: 10px; padding: 15px; border: 1px solid rgba(201,169,89,0.2);">
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                        ${equipFav.equipamientoReal.map(item => `
                        <span style="background: #1a1a1a; border: 1px solid rgba(201,169,89,0.3); padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; color: var(--cream);">
                            ${item}
                        </span>`).join('')}
                    </div>
                    <div style="font-size: 0.85rem; color: rgba(248,246,243,0.7); border-top: 1px solid rgba(201,169,89,0.2); padding-top: 10px;">
                        <strong style="color: var(--cream);">Valor estimado:</strong> ~$${fmt(calcularValorEquipamiento(equipFav.equipamientoReal))} USD
                        <span style="margin-left: 10px; color: var(--oportunidad);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Incluido en el precio</span>
                    </div>
                </div>` : `
                <div class="alert warning" style="margin-top: 25px;">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                    <div class="alert-content">
                        <h4>Equipamiento no especificado</h4>
                        <p>La publicación no detalla qué equipamiento incluye. <strong>Preguntá específicamente</strong> por: aire acondicionado, cocina equipada, closets, calefón.</p>
                    </div>
                </div>`}

                ${fav.razon_fiduciaria ? `
                <div class="alert success">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                    <div class="alert-content">
                        <h4>Síntesis Fiduciaria</h4>
                        <p>${fav.razon_fiduciaria}</p>
                    </div>
                </div>` : ''}

                ${(fav.amenities_por_verificar || []).some(a => a.toLowerCase().includes('parqueo')) ? `
                <div class="alert warning">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
                    <div class="alert-content">
                        <h4>Verificar Antes de Ofertar</h4>
                        <p>Confirmar si el <strong>parqueo está incluido</strong>. En esta zona suele venderse aparte (+$12,000 - $18,000).</p>
                    </div>
                </div>` : ''}

                ${(fav.fotos_urls || []).length > 1 ? `
                <h4 style="margin-top: 25px; margin-bottom: 12px; color: var(--cream);">Fotos de la Propiedad</h4>
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
                <p>Comparamos ${fav.proyecto} contra el mercado de <strong>${datosUsuario.dormitorios !== null && datosUsuario.dormitorios !== undefined ? formatDormitorios(datosUsuario.dormitorios, false) : 'departamentos'} en ${datosUsuario.zonas?.length ? datosUsuario.zonas.map(z => zonaDisplay(z)).join(', ') : 'todas las zonas'}</strong>.</p>
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
                        <div class="legend-item"><div class="legend-color" style="background: #333333;"></div><span>Alternativas</span></div>
                        <div class="legend-item"><div class="legend-color" style="background: var(--gray-600);"></div><span>Promedio resultados</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 4: Tabla Comparativa Lado a Lado -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">4</div>
                <div class="section-title">Comparación Lado a Lado</div>
            </div>
            <div class="section-content">
                <p>Todas las métricas importantes de tus 3 elegidas en una sola vista.</p>
                <div style="overflow-x: auto;">
                <table class="summary-table" style="margin-top: 20px;">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Criterio</th>
                            <th style="text-align: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="#c9a959" stroke="#c9a959" stroke-width="1" style="display: inline; vertical-align: middle;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> #1 ${fav.proyecto.substring(0, 12)}</th>
                            ${comp1 ? `<th style="text-align: center;">#2 ${comp1.proyecto.substring(0, 12)}</th>` : ''}
                            ${comp2 ? `<th style="text-align: center;">#3 ${comp2.proyecto.substring(0, 12)}</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 10h6M9 14h6"/></svg> Precio publicado</strong></td>
                            <td style="text-align: center;">$${fmt(fav.precio_usd)}</td>
                            ${comp1 ? `<td style="text-align: center;">$${fmt(comp1.precio_usd)}</td>` : ''}
                            ${comp2 ? `<td style="text-align: center;">$${fmt(comp2.precio_usd)}</td>` : ''}
                        </tr>
                        <tr style="background: rgba(201,169,89,0.12);">
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Precio REAL</strong><br><small style="color: #b87333;">(con extras que necesitás)</small></td>
                            <td style="text-align: center; font-weight: 700; color: ${datosFav.costoExtras > 0 ? '#b87333' : '#c9a959'};">
                                $${fmt(datosFav.precioReal)}
                                ${datosFav.costoExtras > 0 ? `<br><small>+$${fmt(datosFav.costoExtras)} (${datosFav.extrasNecesarios.join('+')})</small>` : '<br><small style="color: #c9a959;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Todo incluido</small>'}
                            </td>
                            ${datosComp1 ? `<td style="text-align: center; font-weight: 700; color: ${datosComp1.costoExtras > 0 ? '#b87333' : '#c9a959'};">
                                $${fmt(datosComp1.precioReal)}
                                ${datosComp1.costoExtras > 0 ? `<br><small>+$${fmt(datosComp1.costoExtras)} (${datosComp1.extrasNecesarios.join('+')})</small>` : '<br><small style="color: #c9a959;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Todo incluido</small>'}
                            </td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center; font-weight: 700; color: ${datosComp2.costoExtras > 0 ? '#b87333' : '#c9a959'};">
                                $${fmt(datosComp2.precioReal)}
                                ${datosComp2.costoExtras > 0 ? `<br><small>+$${fmt(datosComp2.costoExtras)} (${datosComp2.extrasNecesarios.join('+')})</small>` : '<br><small style="color: #c9a959;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Todo incluido</small>'}
                            </td>` : ''}
                        </tr>
                        <tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M21 21H3V3"/><rect x="7" y="11" width="6" height="10" fill="none"/></svg> Superficie</strong></td>
                            <td style="text-align: center;">${Math.round(fav.area_m2)} m²</td>
                            ${comp1 ? `<td style="text-align: center;">${Math.round(comp1.area_m2)} m²</td>` : ''}
                            ${comp2 ? `<td style="text-align: center;">${Math.round(comp2.area_m2)} m²</td>` : ''}
                        </tr>
                        <tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Costo mensual</strong><br><small>(expensas estimadas)</small></td>
                            <td style="text-align: center;">$${datosFav.expensasMin}-${datosFav.expensasMax}/mes</td>
                            ${datosComp1 ? `<td style="text-align: center;">$${datosComp1.expensasMin}-${datosComp1.expensasMax}/mes</td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center;">$${datosComp2.expensasMin}-${datosComp2.expensasMax}/mes</td>` : ''}
                        </tr>
                        <tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> Impacto 5 años</strong><br><small>(expensas acumuladas)</small></td>
                            <td style="text-align: center;">~$${fmt(datosFav.impacto5Anos)}</td>
                            ${datosComp1 ? `<td style="text-align: center;">~$${fmt(datosComp1.impacto5Anos)}</td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center;">~$${fmt(datosComp2.impacto5Anos)}</td>` : ''}
                        </tr>
                        <tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Días en mercado</strong></td>
                            <td style="text-align: center; color: ${datosFav.diasMercado > 90 ? '#b87333' : datosFav.diasMercado < 30 ? '#c9a959' : 'inherit'};">
                                ${datosFav.diasMercado || '?'} días
                                ${datosFav.diasMercado > 90 ? '<br><small style="color: #b87333;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#b87333" stroke="none" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/></svg> Negociable</small>' : datosFav.diasMercado < 30 ? '<br><small style="color: #c9a959;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#c9a959" stroke="none" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/></svg> Reciente</small>' : ''}
                            </td>
                            ${datosComp1 ? `<td style="text-align: center; color: ${datosComp1.diasMercado > 90 ? '#b87333' : datosComp1.diasMercado < 30 ? '#c9a959' : 'inherit'};">
                                ${datosComp1.diasMercado || '?'} días
                                ${datosComp1.diasMercado > 90 ? '<br><small style="color: #b87333;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#b87333" stroke="none" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/></svg> Negociable</small>' : datosComp1.diasMercado < 30 ? '<br><small style="color: #c9a959;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#c9a959" stroke="none" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/></svg> Reciente</small>' : ''}
                            </td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center; color: ${datosComp2.diasMercado > 90 ? '#b87333' : datosComp2.diasMercado < 30 ? '#c9a959' : 'inherit'};">
                                ${datosComp2.diasMercado || '?'} días
                                ${datosComp2.diasMercado > 90 ? '<br><small style="color: #b87333;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#b87333" stroke="none" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/></svg> Negociable</small>' : datosComp2.diasMercado < 30 ? '<br><small style="color: #c9a959;"><svg width="10" height="10" viewBox="0 0 24 24" fill="#c9a959" stroke="none" style="display: inline; vertical-align: middle;"><circle cx="12" cy="12" r="10"/></svg> Reciente</small>' : ''}
                            </td>` : ''}
                        </tr>
                        ${datosFav.rankingEdificio ? `<tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/></svg> Ranking edificio</strong></td>
                            <td style="text-align: center;">${datosFav.rankingEdificio}º de ${datosFav.unidadesEdificio || '?'}</td>
                            ${datosComp1 ? `<td style="text-align: center;">${datosComp1.rankingEdificio ? `${datosComp1.rankingEdificio}º de ${datosComp1.unidadesEdificio || '?'}` : '-'}</td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center;">${datosComp2.rankingEdificio ? `${datosComp2.rankingEdificio}º de ${datosComp2.unidadesEdificio || '?'}` : '-'}</td>` : ''}
                        </tr>` : ''}
                        ${datosFav.amenidadesPedidas > 0 ? `<tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Amenidades pedidas</strong></td>
                            <td style="text-align: center; color: ${datosFav.amenidadesTiene === datosFav.amenidadesPedidas ? '#c9a959' : '#b87333'};">
                                ${datosFav.amenidadesTiene}/${datosFav.amenidadesPedidas}
                                ${datosFav.amenidadesTiene === datosFav.amenidadesPedidas ? ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                            </td>
                            ${datosComp1 ? `<td style="text-align: center; color: ${datosComp1.amenidadesTiene === datosComp1.amenidadesPedidas ? '#c9a959' : '#b87333'};">
                                ${datosComp1.amenidadesTiene}/${datosComp1.amenidadesPedidas}
                                ${datosComp1.amenidadesTiene === datosComp1.amenidadesPedidas ? ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                            </td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center; color: ${datosComp2.amenidadesTiene === datosComp2.amenidadesPedidas ? '#c9a959' : '#b87333'};">
                                ${datosComp2.amenidadesTiene}/${datosComp2.amenidadesPedidas}
                                ${datosComp2.amenidadesTiene === datosComp2.amenidadesPedidas ? ' <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                            </td>` : ''}
                        </tr>` : ''}
                        <tr>
                            <td><strong>Equipamiento</strong><br><small style="color: var(--gold);">(del depto)</small></td>
                            <td style="text-align: center; font-size: 0.85rem;">
                                ${equipFav.equipamientoReal.length > 0
                                  ? `${equipFav.equipamientoReal.slice(0, 3).join(', ')}${equipFav.equipamientoReal.length > 3 ? '...' : ''}<br><small style="color: #c9a959;">~$${fmt(calcularValorEquipamiento(equipFav.equipamientoReal))}</small>`
                                  : '<span style="color: #b87333;">Sin info</span>'}
                            </td>
                            ${datosComp1 && equipComp1 ? `<td style="text-align: center; font-size: 0.85rem;">
                                ${equipComp1.equipamientoReal.length > 0
                                  ? `${equipComp1.equipamientoReal.slice(0, 3).join(', ')}${equipComp1.equipamientoReal.length > 3 ? '...' : ''}<br><small style="color: #c9a959;">~$${fmt(calcularValorEquipamiento(equipComp1.equipamientoReal))}</small>`
                                  : '<span style="color: #b87333;">Sin info</span>'}
                            </td>` : ''}
                            ${datosComp2 && equipComp2 ? `<td style="text-align: center; font-size: 0.85rem;">
                                ${equipComp2.equipamientoReal.length > 0
                                  ? `${equipComp2.equipamientoReal.slice(0, 3).join(', ')}${equipComp2.equipamientoReal.length > 3 ? '...' : ''}<br><small style="color: #c9a959;">~$${fmt(calcularValorEquipamiento(equipComp2.equipamientoReal))}</small>`
                                  : '<span style="color: #b87333;">Sin info</span>'}
                            </td>` : ''}
                        </tr>
                        <tr>
                            <td><strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M19 17h2l-2-6h-8l-2 6h2M7 17h10M5 17h2M17 17v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2M9 17v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/></svg> Parqueo</strong></td>
                            <td style="text-align: center; color: ${datosFav.tieneParqueo ? '#c9a959' : '#b87333'};">
                                ${datosFav.tieneParqueo ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Incluido (${fav.estacionamientos}p)` : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#b87333" stroke-width="2" style="display: inline; vertical-align: middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Preguntar'}
                            </td>
                            ${datosComp1 ? `<td style="text-align: center; color: ${datosComp1.tieneParqueo ? '#c9a959' : '#b87333'};">
                                ${datosComp1.tieneParqueo ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Incluido (${comp1?.estacionamientos}p)` : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#b87333" stroke-width="2" style="display: inline; vertical-align: middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Preguntar'}
                            </td>` : ''}
                            ${datosComp2 ? `<td style="text-align: center; color: ${datosComp2.tieneParqueo ? '#c9a959' : '#b87333'};">
                                ${datosComp2.tieneParqueo ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9a959" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg> Incluido (${comp2?.estacionamientos}p)` : '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#b87333" stroke-width="2" style="display: inline; vertical-align: middle;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Preguntar'}
                            </td>` : ''}
                        </tr>
                    </tbody>
                </table>
                </div>

                <div class="alert info" style="margin-top: 20px;">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18h6M10 22h4M12 2v1M12 6a5 5 0 0 1 3.54 8.46L14 16h-4l-1.54-1.54A5 5 0 0 1 12 6z"/></svg></div>
                    <div class="alert-content">
                        <h4>Lectura rápida</h4>
                        <p>
                            ${(() => {
                              // Encontrar la mejor opción según precio real
                              const opciones = [
                                { nombre: fav.proyecto, precioReal: datosFav.precioReal, dias: datosFav.diasMercado },
                                ...(datosComp1 ? [{ nombre: comp1!.proyecto, precioReal: datosComp1.precioReal, dias: datosComp1.diasMercado }] : []),
                                ...(datosComp2 ? [{ nombre: comp2!.proyecto, precioReal: datosComp2.precioReal, dias: datosComp2.diasMercado }] : [])
                              ]
                              const mejorPrecio = opciones.reduce((a, b) => a.precioReal < b.precioReal ? a : b)
                              const masNegociable = opciones.reduce((a, b) => a.dias > b.dias ? a : b)
                              return `<strong>Mejor precio real:</strong> ${mejorPrecio.nombre} ($${fmt(mejorPrecio.precioReal)}). <strong>Más negociable:</strong> ${masNegociable.nombre} (${masNegociable.dias} días).`
                            })()}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 5: Tabla de Alternativas -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">5</div>
                <div class="section-title">Tus 3 Elegidas + Mejores Alternativas</div>
            </div>
            <div class="section-content">
                <p>Todas las opciones de <strong>${datosUsuario.dormitorios !== null && datosUsuario.dormitorios !== undefined ? formatDormitorios(datosUsuario.dormitorios, false) : 'departamentos'} en ${datosUsuario.zonas?.length ? datosUsuario.zonas.map(z => zonaDisplay(z)).join(', ') : 'todas las zonas'} hasta $${fmt(datosUsuario.presupuesto)}</strong>.</p>
                <p class="scroll-hint" style="font-size: 0.75rem; color: var(--gray-500); margin-bottom: 8px; display: none;">← Deslizá para ver más →</p>
                <div class="table-scroll-wrapper">
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
                                <td>${i < 3 ? `<span class="table-heart"><svg width="12" height="12" viewBox="0 0 24 24" fill="#c9a959" stroke="#c9a959" stroke-width="1" style="display: inline; vertical-align: middle;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${i+1}</span>` : ''}<strong>${p.proyecto}</strong></td>
                                <td>$${fmt(p.precio_usd)}</td>
                                <td>${Math.round(p.area_m2)}</td>
                                <td>$${fmt(p.precio_m2)}</td>
                                <td>${p.dias_en_mercado || '?'}</td>
                                <td><span class="position-badge ${cat.clase}">${cat.texto}</span></td>
                            </tr>`
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="alert info" style="margin-top: 20px;">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></div>
                    <div class="alert-content">
                        <h4>Resumen del Mercado</h4>
                        <p>Promedio tus resultados: <strong>$${fmt(precioM2Promedio)}/m²</strong> | Tus elegidas promedian: <strong>$${fmt(Math.round(top3.reduce((s, p) => s + p.precio_m2, 0) / top3.length))}/m²</strong></p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 6: Checklist Personalizado -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">6</div>
                <div class="section-title">Checklist Personalizado: Preguntas Antes de Ofertar</div>
            </div>
            <div class="section-content">
                <div class="alert info" style="margin-bottom: 20px;">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></div>
                    <div class="alert-content">
                        <h4>Checklist basado en TU búsqueda</h4>
                        <p>Estas preguntas están personalizadas según lo que indicaste que necesitás.</p>
                    </div>
                </div>

                <h4 style="color: var(--gold); margin-bottom: 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h6M9 15h6"/></svg> Sobre el Precio</h4>
                <ul class="checklist">
                    ${necesitaParqueo && !datosFav.tieneParqueo ? `
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿El parqueo está incluido en el precio?</div>
                            <div class="why">Indicaste que necesitás parqueo y no está confirmado en la publicación</div>
                        </div>
                    </li>` : ''}
                    ${necesitaBaulera && !datosFav.tieneBaulera ? `
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿La baulera está incluida en el precio?</div>
                            <div class="why">Indicaste que necesitás baulera y no está confirmada en la publicación</div>
                        </div>
                    </li>` : ''}
                </ul>

                ${fav.estado_construccion === 'preventa' ? `
                <h4 style="color: var(--gold); margin: 25px 0 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20h20M5 20V8l7-5 7 5v12M9 20v-6h6v6"/></svg> Sobre la Preventa</h4>
                <ul class="checklist">
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Cuál es la fecha de entrega?</div>
                            <div class="why">Verificá que esté garantizada por contrato con penalidades por retraso</div>
                        </div>
                    </li>
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Cuál es el plan de pagos?</div>
                            <div class="why">Consultá montos y fechas de cada cuota hasta la entrega</div>
                        </div>
                    </li>
                </ul>` : ''}

                <h4 style="color: var(--gold); margin: 25px 0 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Sobre la Propiedad</h4>
                <ul class="checklist">
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿En qué piso está el departamento?</div>
                            <div class="why">Confirmá ubicación exacta dentro del edificio</div>
                        </div>
                    </li>
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿Cuánto es el pago de expensas mensuales?</div>
                            <div class="why">Costo fijo que tendrás que pagar todos los meses</div>
                        </div>
                    </li>
                    ${(() => {
                      const petFriendlyConfirmado = (fav.amenities_confirmados || []).some(a =>
                        a.toLowerCase().includes('pet') || a.toLowerCase().includes('mascota')
                      )
                      const petFriendlyEnInnegociables = (datosUsuario.innegociables || []).some(a =>
                        a.toLowerCase().includes('pet') || a.toLowerCase().includes('mascota')
                      )
                      const tieneMascotas = datosUsuario.mascotas === true

                      if ((tieneMascotas || petFriendlyEnInnegociables) && !petFriendlyConfirmado) {
                        return `
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">¿El edificio es pet-friendly?</div>
                            <div class="why">${tieneMascotas ? 'Indicaste que tenés mascotas' : 'Lo marcaste como innegociable'} - confirmá que permiten mascotas</div>
                        </div>
                    </li>`
                      }
                      return ''
                    })()}
                </ul>

                ${(datosUsuario.innegociables || []).length > 0 ? `
                <h4 style="color: var(--gold); margin: 25px 0 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Tus Innegociables</h4>
                <ul class="checklist">
                    <li>
                        <div class="checkbox"></div>
                        <div>
                            <div class="question">Confirmá que el edificio tiene: ${datosUsuario.innegociables.join(', ')}</div>
                            <div class="why">Los marcaste como innegociables - verificá que estén funcionando</div>
                        </div>
                    </li>
                </ul>` : ''}
            </div>
        </div>
    </div>

    <!-- Section 7: Negociación Personalizada -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">7</div>
                <div class="section-title">Estrategia de Negociación para ${fav.proyecto}</div>
            </div>
            <div class="section-content">
                ${(() => {
                  // Determinar nivel de agresividad según datos
                  const diasAlto = (fav.dias_en_mercado || 0) > 90
                  const diasMedio = (fav.dias_en_mercado || 0) > 45
                  const priorizaPrecio = datosUsuario.calidad_vs_precio >= 4
                  const priorizaCalidad = datosUsuario.calidad_vs_precio <= 2

                  const nivelNegociacion = diasAlto ? 'agresivo' : diasMedio ? 'moderado' : 'conservador'
                  const colorNivel = diasAlto ? 'var(--oportunidad)' : diasMedio ? 'var(--warning)' : 'var(--primary)'
                  const textoNivel = diasAlto ? 'ALTA oportunidad de negociar' : diasMedio ? 'Oportunidad moderada' : 'Poco margen - propiedad reciente'

                  return `
                <div class="alert ${diasAlto ? 'success' : diasMedio ? 'warning' : 'info'}" style="margin-bottom: 20px;">
                    <div class="alert-icon">${diasAlto ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18.5 3A2.5 2.5 0 0 1 21 5.5v5.5a9 9 0 1 1-18 0V5.5A2.5 2.5 0 0 1 5.5 3h13Z"/><path d="M12 10v5"/><path d="M9 14h6"/></svg>' : diasMedio ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 17a4 4 0 0 0 8 0c0-3-8-5-8-10a4 4 0 1 1 8 0"/><line x1="15" y1="22" x2="15" y2="22.01"/></svg>' : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'}</div>
                    <div class="alert-content">
                        <h4 style="color: ${colorNivel};">${textoNivel}</h4>
                        <p>${fav.dias_en_mercado || '?'} días en mercado + precio ${favCat.texto}. ${priorizaPrecio ? 'Priorizás precio → negociá firme.' : priorizaCalidad ? 'Priorizás calidad → no arriesgues perderlo por regatear mucho.' : ''}</p>
                    </div>
                </div>`
                })()}

                ${(fav.dias_en_mercado || 0) > 30 ? `
                <div class="negotiation-card">
                    <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Argumento 1: Tiempo en mercado</h4>
                    <blockquote>
                        "${(fav.dias_en_mercado || 0) > 90
                          ? `Vi que la propiedad lleva más de ${Math.floor((fav.dias_en_mercado || 0) / 30)} meses publicada. Entiendo que quieren vender - yo puedo cerrar rápido si llegamos a un acuerdo. ¿Qué flexibilidad tienen en el precio?`
                          : `Noté que llevan más de un mes con la propiedad publicada. ¿Hay margen para negociar si cierro esta semana?`}"
                    </blockquote>
                    <p style="font-size: 0.85rem; color: rgba(248,246,243,0.6); margin-top: 10px;">
                        <strong style="color: var(--gold);">Tip:</strong> ${(fav.dias_en_mercado || 0) > 90 ? 'Mucho tiempo = vendedor ansioso. Podés pedir 10-15% de descuento.' : 'Tiempo moderado. Apuntá a 5-8% de descuento.'}
                    </p>
                </div>` : `
                <div class="negotiation-card">
                    <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Argumento 1: Interés serio</h4>
                    <blockquote>
                        "Vi que la propiedad es nueva en el mercado. Estoy listo para avanzar rápido si el precio es el correcto. ¿Tienen algún incentivo por cierre rápido?"
                    </blockquote>
                    <p style="font-size: 0.85rem; color: rgba(248,246,243,0.6); margin-top: 10px;">
                        <strong style="color: var(--gold);">Tip:</strong> Propiedad reciente = vendedor con expectativas altas. Poco margen, pero podés pedir 2-4%.
                    </p>
                </div>`}

                ${comp1 || comp2 ? `
                <div class="negotiation-card">
                    <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Argumento 2: Tenés alternativas</h4>
                    <blockquote>
                        "Estoy evaluando también ${comp1 ? `${comp1.proyecto} por $${fmt(comp1.precio_usd)}` : ''}${comp1 && comp2 ? ' y ' : ''}${comp2 ? `${comp2.proyecto} por $${fmt(comp2.precio_usd)}` : ''}. Me gusta ${fav.proyecto} pero necesito que el precio sea competitivo."
                    </blockquote>
                    <p style="font-size: 0.85rem; color: rgba(248,246,243,0.6); margin-top: 10px;">
                        <strong style="color: var(--gold);">Tip:</strong> Mostrar que tenés opciones reales te da poder. No inventes - usá datos reales.
                    </p>
                </div>` : ''}

                ${necesitaParqueo && !datosFav.tieneParqueo ? `
                <div class="negotiation-card">
                    <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Argumento 3: El parqueo</h4>
                    <blockquote>
                        "Mi presupuesto es $${fmt(datosUsuario.presupuesto)} TODO INCLUIDO. Si el parqueo no está en ese precio, necesito que lo incluyan o ajusten para que entre en mi número."
                    </blockquote>
                    <p style="font-size: 0.85rem; color: rgba(248,246,243,0.6); margin-top: 10px;">
                        <strong style="color: var(--gold);">Tip:</strong> El parqueo vale $12-18k. Usá esto para negociar: "sin parqueo, mi oferta sería $${fmt(fav.precio_usd - 15000)}".
                    </p>
                </div>` : ''}

                ${datosUsuario.calidad_vs_precio >= 4 ? `
                <div class="negotiation-card" style="border-left: 4px solid var(--oportunidad);">
                    <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M9 18h6M10 22h4M12 2v1M12 6a5 5 0 0 1 3.54 8.46L14 16h-4l-1.54-1.54A5 5 0 0 1 12 6z"/></svg> Estrategia para vos (priorizás precio)</h4>
                    <p style="color: var(--cream);">Indicaste que priorizás precio sobre calidad. <strong>Negociá firme:</strong></p>
                    <ul style="margin: 10px 0 0 20px; font-size: 0.9rem; color: rgba(248,246,243,0.8);">
                        <li>Empezá oferando 15% menos del publicado</li>
                        <li>No muestres entusiasmo - mantené opciones abiertas</li>
                        <li>Pedí tiempo para "pensarlo" incluso si te gusta</li>
                    </ul>
                </div>` : datosUsuario.calidad_vs_precio <= 2 ? `
                <div class="negotiation-card" style="border-left: 4px solid var(--gold);">
                    <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M9 18h6M10 22h4M12 2v1M12 6a5 5 0 0 1 3.54 8.46L14 16h-4l-1.54-1.54A5 5 0 0 1 12 6z"/></svg> Estrategia para vos (priorizás calidad)</h4>
                    <p style="color: var(--cream);">Indicaste que priorizás calidad sobre precio. <strong>No arriesgues perderlo:</strong></p>
                    <ul style="margin: 10px 0 0 20px; font-size: 0.9rem; color: rgba(248,246,243,0.8);">
                        <li>Ofertá cerca del precio (5-8% menos máximo)</li>
                        <li>Mostrá interés genuino para que te tomen en serio</li>
                        <li>Si te gusta mucho, mejor asegurar que seguir regateando</li>
                    </ul>
                </div>` : ''}

                <h4 style="color: var(--cream); margin: 25px 0 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> Números para tu Negociación</h4>
                <div style="background: #0a0a0a; border-radius: 10px; padding: 20px; border: 1px solid rgba(201,169,89,0.2);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 20px; text-align: center;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--cream);">$${fmt(fav.precio_usd)}</div>
                            <div style="font-size: 0.85rem; color: rgba(248,246,243,0.6);">Precio publicado</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--oportunidad);">$${fmt(Math.round(fav.precio_usd * 0.92))}</div>
                            <div style="font-size: 0.85rem; color: rgba(248,246,243,0.6);">Oferta inicial sugerida (-8%)</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--gold);">$${fmt(Math.round(fav.precio_usd * 0.95))}</div>
                            <div style="font-size: 0.85rem; color: rgba(248,246,243,0.6);">Precio objetivo (-5%)</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: var(--danger);">$${fmt(datosFav.precioReal)}</div>
                            <div style="font-size: 0.85rem; color: rgba(248,246,243,0.6);">Tu precio real (con extras)</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 8: Conclusión Personalizada -->
    <div class="container">
        <div class="section">
            <div class="section-header">
                <div class="section-number">8</div>
                <div class="section-title">Conclusión y Recomendación Personalizada</div>
            </div>
            <div class="section-content">
                <h4 style="color: var(--cream); margin-bottom: 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> Veredicto Basado en TU Perfil</h4>

                ${(() => {
                  // Análisis personalizado según preferencias
                  const priorizaUbicacion = datosUsuario.ubicacion_vs_metros <= 2
                  const priorizaMetros = datosUsuario.ubicacion_vs_metros >= 4
                  const priorizaCalidad = datosUsuario.calidad_vs_precio <= 2
                  const priorizaPrecio = datosUsuario.calidad_vs_precio >= 4

                  // Encontrar la mejor opción para cada criterio
                  const opciones = [
                    { nombre: fav.proyecto, p: fav, datos: datosFav, num: 1 },
                    ...(comp1 && datosComp1 ? [{ nombre: comp1.proyecto, p: comp1, datos: datosComp1, num: 2 }] : []),
                    ...(comp2 && datosComp2 ? [{ nombre: comp2.proyecto, p: comp2, datos: datosComp2, num: 3 }] : [])
                  ]

                  const mejorPrecioReal = opciones.reduce((a, b) => a.datos.precioReal < b.datos.precioReal ? a : b)
                  const mejorMetros = opciones.reduce((a, b) => a.p.area_m2 > b.p.area_m2 ? a : b)
                  const masNegociable = opciones.reduce((a, b) => a.datos.diasMercado > b.datos.diasMercado ? a : b)
                  const mejorEquipada = opciones.reduce((a, b) => a.datos.valorEquipamiento > b.datos.valorEquipamiento ? a : b)

                  return `
                <div style="background: #0a0a0a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid rgba(201,169,89,0.2);">
                    <p style="margin-bottom: 15px; color: var(--cream);">
                        <strong style="color: var(--gold);">${fav.proyecto}</strong> es tu #1. Analizando tus preferencias:
                    </p>
                    <ul style="margin: 0 0 0 20px; line-height: 1.8; color: rgba(248,246,243,0.8);">
                        ${priorizaUbicacion ? `<li>Priorizás <strong style="color: var(--cream);">ubicación</strong> → ${fav.proyecto} está en ${zonaDisplay(fav.zona)} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg></li>` : ''}
                        ${priorizaMetros ? `<li>Priorizás <strong style="color: var(--cream);">metros</strong> → ${mejorMetros.nombre} tiene más m² (${Math.round(mejorMetros.p.area_m2)}m²) ${mejorMetros.num === 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : '- considerá #' + mejorMetros.num}</li>` : ''}
                        ${priorizaCalidad ? `<li>Priorizás <strong style="color: var(--cream);">calidad</strong> → ${mejorEquipada.nombre} tiene mejor equipamiento (~$${fmt(mejorEquipada.datos.valorEquipamiento)}) ${mejorEquipada.num === 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : '- considerá #' + mejorEquipada.num}</li>` : ''}
                        ${priorizaPrecio ? `<li>Priorizás <strong style="color: var(--cream);">precio</strong> → ${mejorPrecioReal.nombre} tiene mejor precio real ($${fmt(mejorPrecioReal.datos.precioReal)}) ${mejorPrecioReal.num === 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : '- considerá #' + mejorPrecioReal.num}</li>` : ''}
                        <li>Más <strong style="color: var(--cream);">negociable</strong>: ${masNegociable.nombre} (${masNegociable.datos.diasMercado} días) ${masNegociable.num === 1 ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="3" style="display: inline; vertical-align: middle;"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</li>
                    </ul>
                </div>`
                })()}

                <div class="recommendation-box">
                    <h3 style="display: flex; align-items: center; gap: 8px;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Recomendación según tu situación</h3>
                    <table class="recommendation-table">
                        <thead>
                            <tr>
                                <th>Si...</th>
                                <th>Entonces...</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${necesitaParqueo && !datosFav.tieneParqueo ? `
                            <tr>
                                <td>${fav.proyecto} incluye parqueo</td>
                                <td><strong>Excelente.</strong> Ofertá $${fmt(Math.round(fav.precio_usd * 0.95))} (-5%)</td>
                            </tr>
                            <tr>
                                <td>${fav.proyecto} NO incluye parqueo</td>
                                <td>Precio real = $${fmt(datosFav.precioReal)}. Ofertá $${fmt(Math.round(fav.precio_usd * 0.88))} pidiendo incluir parqueo.</td>
                            </tr>` : `
                            <tr>
                                <td>Querés asegurar ${fav.proyecto}</td>
                                <td><strong>Ofertá $${fmt(Math.round(fav.precio_usd * 0.95))}</strong> (-5%) para cerrar rápido</td>
                            </tr>
                            <tr>
                                <td>Querés negociar más</td>
                                <td>Empezá con $${fmt(Math.round(fav.precio_usd * 0.90))} (-10%) y subí gradualmente</td>
                            </tr>`}
                            ${comp1 && datosComp1 ? `
                            <tr>
                                <td>${fav.proyecto} no da flexibilidad</td>
                                <td>Considerá ${comp1.proyecto}: $${fmt(datosComp1.precioReal)} precio real${datosComp1.diasMercado > 60 ? ' + más negociable' : ''}</td>
                            </tr>` : ''}
                            ${datosUsuario.pareja_alineados === false ? `
                            <tr style="background: rgba(255,193,7,0.1);">
                                <td>No están 100% alineados</td>
                                <td><strong>Visiten juntos ANTES de ofertar.</strong> No comprometan sin consenso.</td>
                            </tr>` : ''}
                        </tbody>
                    </table>
                </div>

                ${(comp1 || comp2) ? `
                <h4 style="color: var(--cream); margin: 25px 0 15px; display: flex; align-items: center; gap: 8px;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg> ¿Cuál elegir según tus prioridades?</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div style="background: ${datosUsuario.calidad_vs_precio >= 4 ? 'var(--oportunidad)' : '#1a1a1a'}; color: ${datosUsuario.calidad_vs_precio >= 4 ? 'white' : 'var(--cream)'}; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid ${datosUsuario.calidad_vs_precio >= 4 ? 'transparent' : 'rgba(201,169,89,0.2)'};">
                        <div style="font-size: 0.8rem; opacity: 0.9;">Si priorizás PRECIO</div>
                        <div style="font-size: 1.1rem; font-weight: 700; margin-top: 5px;">${(() => {
                          const opciones = [
                            { nombre: fav.proyecto, precioReal: datosFav.precioReal },
                            ...(datosComp1 ? [{ nombre: comp1!.proyecto, precioReal: datosComp1.precioReal }] : []),
                            ...(datosComp2 ? [{ nombre: comp2!.proyecto, precioReal: datosComp2.precioReal }] : [])
                          ]
                          return opciones.reduce((a, b) => a.precioReal < b.precioReal ? a : b).nombre
                        })()}</div>
                    </div>
                    <div style="background: ${datosUsuario.ubicacion_vs_metros >= 4 ? 'var(--gold)' : '#1a1a1a'}; color: ${datosUsuario.ubicacion_vs_metros >= 4 ? '#0a0a0a' : 'var(--cream)'}; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid ${datosUsuario.ubicacion_vs_metros >= 4 ? 'transparent' : 'rgba(201,169,89,0.2)'};">
                        <div style="font-size: 0.8rem; opacity: 0.9;">Si priorizás METROS</div>
                        <div style="font-size: 1.1rem; font-weight: 700; margin-top: 5px;">${(() => {
                          const opciones = [
                            { nombre: fav.proyecto, area: fav.area_m2 },
                            ...(comp1 ? [{ nombre: comp1.proyecto, area: comp1.area_m2 }] : []),
                            ...(comp2 ? [{ nombre: comp2.proyecto, area: comp2.area_m2 }] : [])
                          ]
                          return opciones.reduce((a, b) => a.area > b.area ? a : b).nombre
                        })()}</div>
                    </div>
                    <div style="background: #1a1a1a; padding: 15px; border-radius: 10px; text-align: center; border: 1px solid rgba(201,169,89,0.2);">
                        <div style="font-size: 0.8rem; opacity: 0.9; color: rgba(248,246,243,0.8);">Más NEGOCIABLE</div>
                        <div style="font-size: 1.1rem; font-weight: 700; margin-top: 5px; color: var(--gold);">${(() => {
                          const opciones = [
                            { nombre: fav.proyecto, dias: datosFav.diasMercado },
                            ...(datosComp1 ? [{ nombre: comp1!.proyecto, dias: datosComp1.diasMercado }] : []),
                            ...(datosComp2 ? [{ nombre: comp2!.proyecto, dias: datosComp2.diasMercado }] : [])
                          ]
                          return opciones.reduce((a, b) => a.dias > b.dias ? a : b).nombre
                        })()}</div>
                    </div>
                </div>` : ''}

                <div class="alert success" style="margin-top: 25px;">
                    <div class="alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg></div>
                    <div class="alert-content">
                        <h4>Tu Próximo Paso</h4>
                        <p>
                            ${datosUsuario.pareja_alineados === false
                              ? `1. Alinear con tu pareja sobre prioridades. 2. Visitar ${fav.proyecto} juntos. 3. Usar el checklist de este informe.`
                              : `Agendar visita a ${fav.proyecto} esta semana. Llevá este informe impreso y confirmá los puntos del checklist antes de ofertar.`
                            }
                        </p>
                    </div>
                </div>

                <div class="disclaimer-box">
                    <span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5"><path d="M9 18h6M10 22h4M12 2v1M4.93 4.93l.7.7M2 12h1M19.07 4.93l-.7.7M22 12h-1M15.54 8.46a5 5 0 1 0-7.08 7.08L10 17h4l1.54-1.46a5 5 0 0 0 0-7.08Z"/></svg></span>
                    <div>
                        <strong>Los números son una guía, no una regla</strong>
                        <p>Este informe está personalizado según <strong>tus preferencias</strong>, pero vos conocés tu situación mejor que nadie. Confiá en tu instinto: si sentís urgencia del vendedor, negociá más fuerte. Si hay competencia, quizás convenga cerrar rápido. Simón te da el contexto, <strong>vos tomás la decisión</strong>.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Section 9: Contactar Broker - Premium -->
    <div class="container">
        <div class="section" style="background: #0a0a0a; border: 1px solid rgba(201,169,89,0.3);">
            <div class="section-header">
                <div class="section-number">9</div>
                <div class="section-title">¿Listo para dar el siguiente paso?</div>
            </div>
            <div class="section-content">
                <p style="text-align: center; opacity: 0.9; margin-bottom: 30px; font-size: 1.1rem; color: var(--cream);">
                    Contactá directamente al asesor de las propiedades que te interesan
                </p>

                <div style="display: grid; gap: 20px; ${comp1 || comp2 ? 'grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));' : ''}">
                    ${/* Favorita (#1) */ ''}
                    <div style="background: rgba(201,169,89,0.1); border: 1px solid rgba(201,169,89,0.3); border-radius: 16px; padding: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                            <span style="background: var(--gold); color: #0a0a0a; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="#0a0a0a" stroke="#0a0a0a" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> #1 FAVORITA</span>
                        </div>
                        <h4 style="font-size: 1.1rem; margin-bottom: 5px; color: var(--cream);">${fav.proyecto}</h4>
                        <p style="opacity: 0.8; font-size: 0.9rem; margin-bottom: 15px; color: var(--cream);">$${fmt(fav.precio_usd)} · ${Math.round(fav.area_m2)}m²</p>
                        ${fav.asesor_wsp ? `
                            <p style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 10px; color: var(--cream);">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${fav.asesor_nombre || 'Asesor'}${fav.asesor_inmobiliaria ? ` · ${fav.asesor_inmobiliaria}` : ''}
                            </p>
                            <a
                                href="${buildContactarUrl(baseHost, {
                                  leadId: leadData?.leadId,
                                  nombre: leadData?.nombre,
                                  whatsapp: leadData?.whatsapp,
                                  propId: fav.id,
                                  posicion: 1,
                                  proyecto: fav.proyecto,
                                  precio: fav.precio_usd,
                                  dormitorios: fav.dormitorios,
                                  broker: fav.asesor_nombre || 'Asesor',
                                  brokerWsp: fav.asesor_wsp || '',
                                  inmobiliaria: fav.asesor_inmobiliaria || undefined,
                                  codigoRef: leadData?.codigoRef,
                                  preguntas: generarPreguntasPersonalizadas(fav, datosUsuario, necesitaParqueo, necesitaBaulera)
                                })}"
                                target="_blank"
                                style="display: block; width: 100%; padding: 12px; background: var(--gold); color: #0a0a0a; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.95rem; text-align: center; text-decoration: none;"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> CONTACTAR
                            </a>
                        ` : `
                            <p style="opacity: 0.7; font-size: 0.85rem; text-align: center; color: rgba(248,246,243,0.6);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Contacto no disponible</p>
                        `}
                    </div>

                    ${comp1 ? `
                    ${/* Segunda opción (#2) */ ''}
                    <div style="background: rgba(201,169,89,0.05); border: 1px solid rgba(201,169,89,0.2); border-radius: 16px; padding: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                            <span style="background: rgba(201,169,89,0.2); color: var(--cream); padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M12 14v8M8 22h8"/></svg> #2</span>
                        </div>
                        <h4 style="font-size: 1.1rem; margin-bottom: 5px; color: var(--cream);">${comp1.proyecto}</h4>
                        <p style="opacity: 0.8; font-size: 0.9rem; margin-bottom: 15px; color: var(--cream);">$${fmt(comp1.precio_usd)} · ${Math.round(comp1.area_m2)}m²</p>
                        ${comp1.asesor_wsp ? `
                            <p style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 10px; color: var(--cream);">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${comp1.asesor_nombre || 'Asesor'}${comp1.asesor_inmobiliaria ? ` · ${comp1.asesor_inmobiliaria}` : ''}
                            </p>
                            <a
                                href="${buildContactarUrl(baseHost, {
                                  leadId: leadData?.leadId,
                                  nombre: leadData?.nombre,
                                  whatsapp: leadData?.whatsapp,
                                  propId: comp1.id,
                                  posicion: 2,
                                  proyecto: comp1.proyecto,
                                  precio: comp1.precio_usd,
                                  dormitorios: comp1.dormitorios,
                                  broker: comp1.asesor_nombre || 'Asesor',
                                  brokerWsp: comp1.asesor_wsp || '',
                                  inmobiliaria: comp1.asesor_inmobiliaria || undefined,
                                  codigoRef: leadData?.codigoRef,
                                  preguntas: generarPreguntasPersonalizadas(comp1, datosUsuario, necesitaParqueo, necesitaBaulera)
                                })}"
                                target="_blank"
                                style="display: block; width: 100%; padding: 12px; background: var(--gold); color: #0a0a0a; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.95rem; text-align: center; text-decoration: none;"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> CONTACTAR
                            </a>
                        ` : `
                            <p style="opacity: 0.7; font-size: 0.85rem; text-align: center; color: rgba(248,246,243,0.6);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Contacto no disponible</p>
                        `}
                    </div>
                    ` : ''}

                    ${comp2 ? `
                    ${/* Tercera opción (#3) */ ''}
                    <div style="background: rgba(201,169,89,0.05); border: 1px solid rgba(201,169,89,0.2); border-radius: 16px; padding: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                            <span style="background: rgba(201,169,89,0.2); color: var(--cream); padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cd7f32" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M12 14v8M8 22h8"/></svg> #3</span>
                        </div>
                        <h4 style="font-size: 1.1rem; margin-bottom: 5px; color: var(--cream);">${comp2.proyecto}</h4>
                        <p style="opacity: 0.8; font-size: 0.9rem; margin-bottom: 15px; color: var(--cream);">$${fmt(comp2.precio_usd)} · ${Math.round(comp2.area_m2)}m²</p>
                        ${comp2.asesor_wsp ? `
                            <p style="font-size: 0.85rem; opacity: 0.9; margin-bottom: 10px; color: var(--cream);">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${comp2.asesor_nombre || 'Asesor'}${comp2.asesor_inmobiliaria ? ` · ${comp2.asesor_inmobiliaria}` : ''}
                            </p>
                            <a
                                href="${buildContactarUrl(baseHost, {
                                  leadId: leadData?.leadId,
                                  nombre: leadData?.nombre,
                                  whatsapp: leadData?.whatsapp,
                                  propId: comp2.id,
                                  posicion: 3,
                                  proyecto: comp2.proyecto,
                                  precio: comp2.precio_usd,
                                  dormitorios: comp2.dormitorios,
                                  broker: comp2.asesor_nombre || 'Asesor',
                                  brokerWsp: comp2.asesor_wsp || '',
                                  inmobiliaria: comp2.asesor_inmobiliaria || undefined,
                                  codigoRef: leadData?.codigoRef,
                                  preguntas: generarPreguntasPersonalizadas(comp2, datosUsuario, necesitaParqueo, necesitaBaulera)
                                })}"
                                target="_blank"
                                style="display: block; width: 100%; padding: 12px; background: var(--gold); color: #0a0a0a; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.95rem; text-align: center; text-decoration: none;"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> CONTACTAR
                            </a>
                        ` : `
                            <p style="opacity: 0.7; font-size: 0.85rem; text-align: center; color: rgba(248,246,243,0.6);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Contacto no disponible</p>
                        `}
                    </div>
                    ` : ''}
                </div>

                <p style="text-align: center; opacity: 0.7; margin-top: 25px; font-size: 0.85rem; color: rgba(248,246,243,0.7);">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="1.5" style="display: inline; vertical-align: middle;"><path d="M9 18h6M10 22h4M12 2v1M12 6a5 5 0 0 1 3.54 8.46L14 16h-4l-1.54-1.54A5 5 0 0 1 12 6z"/></svg> Al contactar se generará un código de referencia único para tu seguimiento
                </p>
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
                        <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 20V10M12 20V4M6 20v-6"/></svg></span>
                        <span>Actualizado diariamente</span>
                    </div>
                </div>
            </div>
        </div>
    </footer>

    <!-- Botón flotante Descargar PDF - Premium -->
    <button
        id="btn-pdf"
        onclick="descargarPDF()"
        style="
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #c9a959 0%, #b5935a 100%);
            color: #0a0a0a;
            border: none;
            padding: 15px 25px;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(201, 169, 89, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
            z-index: 1000;
            transition: transform 0.2s, box-shadow 0.2s;
        "
        onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 20px rgba(201, 169, 89, 0.5)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 15px rgba(201, 169, 89, 0.4)';"
    >
        <span style="font-size: 1.2rem;">📥</span>
        Descargar PDF
    </button>

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
