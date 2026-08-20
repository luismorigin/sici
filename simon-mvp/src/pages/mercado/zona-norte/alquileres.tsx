// /mercado/zona-norte/alquileres — envoltorio delgado.
//
// Todo lo que se ve vive en `components/mercado/PaginaMercadoAlquileres.tsx`, que
// es el mismo componente para todas las macrozonas.
import type { GetStaticProps } from 'next'
import { ZONA_NORTE } from '@/lib/macrozonas'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { fetchAlquilerShadowExtra } from '@/lib/mercado-shadow-data'
import { supabase } from '@/lib/supabase'
import PaginaMercadoAlquileres, { type PaginaMercadoAlquileresProps } from '@/components/mercado/PaginaMercadoAlquileres'

const MACROZONA = ZONA_NORTE

type Props = Omit<PaginaMercadoAlquileresProps, 'macrozona'>

export default function MercadoZonaNorteAlquileres(props: Props) {
  return <PaginaMercadoAlquileres macrozona={MACROZONA} {...props} />
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const [data, extra, tcRes] = await Promise.all([
    fetchMercadoAlquilerData(MACROZONA),
    fetchAlquilerShadowExtra(MACROZONA.nombre),
    supabase
      ? supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single()
      : Promise.resolve({ data: null }),
  ])
  const tcHoy = tcRes?.data ? parseFloat((tcRes.data as { valor: string }).valor) || null : null
  // `yieldData` no viaja: la página no lo usa (el yield por zona sale de `extra`).
  const { kpis, tipologias, zonas, generatedAt } = data
  return {
    props: { kpis, tipologias, zonas, generatedAt, extra, tcHoy } as Props,
    revalidate: 21600, // 6 horas
  }
}
