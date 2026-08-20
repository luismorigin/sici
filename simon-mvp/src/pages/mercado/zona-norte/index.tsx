// /mercado/zona-norte — envoltorio delgado del hub de mercado.
import type { GetStaticProps } from 'next'
import { ZONA_NORTE } from '@/lib/macrozonas'
import PaginaMercadoHub, { getPropsMercadoHub, type PaginaMercadoHubProps } from '@/components/mercado/PaginaMercadoHub'

const MACROZONA = ZONA_NORTE

type Props = Omit<PaginaMercadoHubProps, 'macrozona'>

export default function MercadoZonaNorteHub(props: Props) {
  return <PaginaMercadoHub macrozona={MACROZONA} {...props} />
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: await getPropsMercadoHub(MACROZONA),
  revalidate: 21600, // 6 horas
})
