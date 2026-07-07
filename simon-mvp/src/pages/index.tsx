// simonbo.com (/) = Home principal de Simon (switch 7-jul-2026).
// La landing premium anterior queda en /landing-v2. El componente vive en
// home.tsx; acá se declara getStaticProps directo (Next no detecta bien un
// getStaticProps re-exportado — lección refactor S1-S6).
import HomePrincipal from './home'
import type { GetStaticProps } from 'next'
import {
  fetchSuperficiesData,
  fetchDestacadosHome,
  fetchContextoVenta,
  type SuperficiesMarketData,
  type DestacadoHome,
  type ContextoVenta,
} from '@/lib/superficies-data'

export default HomePrincipal

export const getStaticProps: GetStaticProps<{
  market: SuperficiesMarketData
  destacados: DestacadoHome[]
  contexto: ContextoVenta | null
}> = async () => {
  const [market, destacados] = await Promise.all([fetchSuperficiesData(), fetchDestacadosHome()])
  const mkV = destacados.find(d => d.operacion === 'venta') ?? destacados[0] ?? null
  const contexto =
    mkV && mkV.operacion === 'venta' && mkV.areaM2
      ? await fetchContextoVenta(mkV.zona, mkV.dormitorios)
      : null
  return { props: { market, destacados, contexto }, revalidate: 21600 } // 6 horas
}
