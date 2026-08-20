// /mercado/zona-norte/ventas — envoltorio delgado.
//
// Todo lo que se ve vive en `components/mercado/PaginaMercadoVentas.tsx`, que es
// el mismo componente para todas las macrozonas. Acá quedan las dos cosas que sí
// son de esta página: de qué zona trae los datos, y su ISR.
//
// 🔑 Agregar una macrozona = declarar su entrada en `lib/macrozonas.ts` + copiar
// este archivo cambiando la constante. Nada más.
import type { GetStaticProps } from 'next'
import { ZONA_NORTE } from '@/lib/macrozonas'
import { fetchMercadoData } from '@/lib/mercado-data'
import { fetchSerieMensualVentas, fetchVentasShadowExtra } from '@/lib/mercado-shadow-data'
import { supabase } from '@/lib/supabase'
import PaginaMercadoVentas, { type PaginaMercadoVentasProps } from '@/components/mercado/PaginaMercadoVentas'

const MACROZONA = ZONA_NORTE

export default function MercadoZonaNorteVentas(props: Omit<PaginaMercadoVentasProps, 'macrozona'>) {
  return <PaginaMercadoVentas macrozona={MACROZONA} {...props} />
}

export const getStaticProps: GetStaticProps<Omit<PaginaMercadoVentasProps, 'macrozona'>> = async () => {
  const [data, serie, extraRaw, tcRes] = await Promise.all([
    fetchMercadoData(MACROZONA),
    fetchSerieMensualVentas(MACROZONA.nombre),
    fetchVentasShadowExtra(MACROZONA.nombre),
    supabase
      ? supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single()
      : Promise.resolve({ data: null }),
  ])
  const tcHoy = tcRes?.data ? parseFloat((tcRes.data as { valor: string }).valor) || null : null
  const { kpis, tipologias, zonas, generatedAt } = data
  // El spread preventa/entrega ya no se muestra (el pozo real se vende por canales
  // internos; los portales ven un recorte sesgado — decisión founder 22-jul).
  // Se anula para no serializar data que la página no usa.
  const extra = extraRaw ? { ...extraRaw, spread: null } : null
  return {
    props: { kpis, tipologias, zonas, generatedAt, serie, extra, tcHoy } as Omit<PaginaMercadoVentasProps, 'macrozona'>,
    revalidate: 21600, // 6 horas (la data se refresca con el cron nocturno)
  }
}

