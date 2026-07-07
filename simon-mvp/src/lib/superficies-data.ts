// Datos dinámicos compartidos por las superficies públicas nuevas:
// /home (banda de mercado), /whatsapp (dato contado por Simón) y /sobre-simon.
// Regla del proyecto: los números NUNCA van hardcodeados en producción — se leen
// de la BD en build (ISR) con fallbacks reales por si Supabase falla.
import { supabase, obtenerZonasAlquiler, obtenerMicrozonas } from './supabase'
import { ZONAS_EQUIPETROL_DB } from './zonas'

export interface SuperficiesMarketData {
  /** Deptos en venta activos en Equipetrol (filtros de calidad del feed) */
  ventasActivas: number
  /** Deptos en alquiler activos hoy (v_mercado_alquiler, Equipetrol) */
  alquileresActivos: number
  /** Mediana de renta mensual en Bs — Eq. Centro (o global si no hay base) */
  medianaAlquilerBob: number
  /** Zona a la que corresponde la mediana de alquiler (display) */
  medianaAlquilerZona: string
  /** USD/m² venta en Eq. Centro (para /whatsapp — "el dato contado") */
  precioM2Centro: number
  /** TC paralelo del día (config_global.tipo_cambio_paralelo) — el que usa el sistema */
  tcParalelo: number
}

// Snapshot real (jul 2026) — solo si Supabase falla en build
const FALLBACK: SuperficiesMarketData = {
  ventasActivas: 371,
  alquileresActivos: 121,
  medianaAlquilerBob: 3750,
  medianaAlquilerZona: 'Eq. Centro',
  precioM2Centro: 2244,
  tcParalelo: 9.72,
}

/** Redondeo para copy aproximado: 373 → "370+" (múltiplo de 10 inferior) */
export function aproximado(n: number): string {
  return `${Math.floor(n / 10) * 10}+`
}

export async function fetchSuperficiesData(): Promise<SuperficiesMarketData> {
  try {
    if (!supabase) throw new Error('Supabase not initialized')

    // Ventas activas — mismo patrón que fetchLandingData (grants anon verificados)
    const { count: ventasCount } = await supabase
      .from('propiedades_v2')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .is('duplicado_de', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .in('zona', ZONAS_EQUIPETROL_DB)

    // Alquileres + medianas por zona (v_mercado_alquiler ya filtra calidad y ≤150d)
    // + TC paralelo del día (mismo patrón que landing-data)
    const [zonasAlquiler, microzonas, tcRes] = await Promise.all([
      obtenerZonasAlquiler(),
      obtenerMicrozonas(),
      supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single(),
    ])
    const tcParalelo = parseFloat(tcRes.data?.valor) || FALLBACK.tcParalelo

    const alquileresActivos = zonasAlquiler.reduce((acc, z) => acc + z.total, 0)
    const centro = zonasAlquiler.find(z => z.zona === 'Equipetrol Centro')
    const zonaTop = centro ?? zonasAlquiler[0]

    const m2Centro = microzonas.find(m => m.zona === 'Eq. Centro')?.precio_m2

    return {
      ventasActivas: ventasCount ?? FALLBACK.ventasActivas,
      alquileresActivos: alquileresActivos > 0 ? alquileresActivos : FALLBACK.alquileresActivos,
      medianaAlquilerBob: zonaTop?.mediana_bob ?? FALLBACK.medianaAlquilerBob,
      medianaAlquilerZona: zonaTop
        ? (zonaTop.zona === 'Equipetrol Centro' ? 'Eq. Centro' : zonaTop.zona)
        : FALLBACK.medianaAlquilerZona,
      precioM2Centro: m2Centro ?? FALLBACK.precioM2Centro,
      tcParalelo,
    }
  } catch (error) {
    console.error('[superficies-data] Error fetching data:', error)
    return FALLBACK
  }
}
