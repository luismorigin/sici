import { supabase, obtenerSnapshot24h, obtenerMicrozonas, type Snapshot24h, type MicrozonaData } from './supabase'

// Fallbacks con datos reales de Enero 2026 (se usan si Supabase falla en build)
const FALLBACK_SNAPSHOT: Snapshot24h = {
  nuevos: 8,
  retirados: 1,
  bajadas_precio: 0,
  tc_actual: 9.72,
  tc_variacion: 0.52,
  precio_m2_promedio: 2022,
  score_bajo: 18,
  props_tc_paralelo: 42,
  dias_mediana_equipetrol: 51,
  unidades_equipetrol_2d: 31,
  total_activas: 370,
  proyectos_monitoreados: 189
}

const FALLBACK_MICROZONAS: MicrozonaData[] = [
  { zona: 'Eq. Centro', total: 98, precio_promedio: 156709, precio_m2: 2098, proyectos: 41, categoria: 'standard' },
  { zona: 'Villa Brigida', total: 67, precio_promedio: 71838, precio_m2: 1495, proyectos: 16, categoria: 'value' },
  { zona: 'Sirari', total: 47, precio_promedio: 199536, precio_m2: 2258, proyectos: 13, categoria: 'premium' },
  { zona: 'Eq. Norte/Norte', total: 19, precio_promedio: 153354, precio_m2: 2340, proyectos: 11, categoria: 'premium' },
  { zona: 'Eq. Oeste (Busch)', total: 16, precio_promedio: 277350, precio_m2: 2122, proyectos: 9, categoria: 'premium' }
]

export interface HeroMetrics {
  propertyCount: number
  projectCount: number
  avgPriceM2: number
}

export interface LandingData {
  heroMetrics: HeroMetrics
  snapshot: Snapshot24h
  microzonas: MicrozonaData[]
}

export async function fetchLandingData(): Promise<LandingData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')

    // Query 1: Propiedades activas (mismos filtros que HeroPremium original)
    const { count: propertyCount } = await supabase
      .from('propiedades_v2')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)

    // Query 2: Proyectos activos
    const { count: projectCount } = await supabase
      .from('proyectos_master')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true)

    // Query 3: Precio promedio /m² (misma lógica que HeroPremium original)
    const { data: priceData } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .gte('precio_usd', 30000)

    let avgPriceM2: number | null = null
    if (priceData && priceData.length > 0) {
      const validPrices = priceData
        .filter((p: any) => p.precio_usd > 0 && p.area_total_m2 > 0)
        .map((p: any) => p.precio_usd / p.area_total_m2)
        .filter((pm2: number) => pm2 >= 800 && pm2 <= 5000)

      if (validPrices.length > 0) {
        avgPriceM2 = Math.round(validPrices.reduce((a: number, b: number) => a + b, 0) / validPrices.length)
      }
    }

    // Query 4+5: Snapshot + Microzonas (en paralelo)
    const [snapshot, microzonas] = await Promise.all([
      obtenerSnapshot24h(),
      obtenerMicrozonas()
    ])

    const heroMetrics: HeroMetrics = {
      propertyCount: propertyCount ?? FALLBACK_SNAPSHOT.total_activas,
      projectCount: projectCount ?? FALLBACK_SNAPSHOT.proyectos_monitoreados,
      avgPriceM2: avgPriceM2 ?? FALLBACK_SNAPSHOT.precio_m2_promedio,
    }

    // Alinear snapshot con heroMetrics para que ambas secciones muestren lo mismo
    const alignedSnapshot = snapshot
      ? {
          ...snapshot,
          total_activas: heroMetrics.propertyCount,
          proyectos_monitoreados: heroMetrics.projectCount,
          precio_m2_promedio: heroMetrics.avgPriceM2,
        }
      : FALLBACK_SNAPSHOT

    return {
      heroMetrics,
      snapshot: alignedSnapshot,
      microzonas: microzonas.length > 0 ? microzonas : FALLBACK_MICROZONAS,
    }
  } catch (error) {
    console.error('[landing-data] Error fetching data:', error)
    return {
      heroMetrics: {
        propertyCount: FALLBACK_SNAPSHOT.total_activas,
        projectCount: FALLBACK_SNAPSHOT.proyectos_monitoreados,
        avgPriceM2: FALLBACK_SNAPSHOT.precio_m2_promedio,
      },
      snapshot: FALLBACK_SNAPSHOT,
      microzonas: FALLBACK_MICROZONAS,
    }
  }
}
