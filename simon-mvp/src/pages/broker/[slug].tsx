// Pagina /broker/[slug] — renderiza VentasPage con modo broker activo.
//
// Data del broker viene de tabla `simon_brokers` (migración 231, via
// lib/simon-brokers.ts). Antes venía de hardcoded `lib/brokers-demo.ts`.
//
// SSG con revalidate=60s → crear/pausar un broker en admin se refleja
// en la página pública en ≤60s (aceptable para activación en el momento
// del café con broker real).

import VentasPage, { getStaticProps as ventasGetStaticProps } from '../ventas'
import { listActiveSlugs, getBrokerBySlug, type Broker } from '@/lib/simon-brokers'
import { isDemoBrokerSlug, sanitizeVentasArrayForDemo } from '@/lib/demo-mode'
import type { UnidadVenta } from '@/lib/supabase'
import type { GetStaticPaths, GetStaticProps } from 'next'

export default VentasPage

export const getStaticPaths: GetStaticPaths = async () => {
  const slugs = await listActiveSlugs()
  return {
    paths: slugs.map(slug => ({ params: { slug } })),
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps = async (context) => {
  const slug = context.params?.slug as string | undefined
  const broker: Broker | null = await getBrokerBySlug(slug)

  if (!broker) {
    return { notFound: true, revalidate: 60 }
  }

  // Delegar a getStaticProps de ventas para obtener SEO + initial properties
  const ventasResult = await ventasGetStaticProps(context)

  if ('props' in ventasResult) {
    const baseProps = ventasResult.props as { initialProperties?: UnidadVenta[] } & Record<string, unknown>
    const isDemo = isDemoBrokerSlug(slug)

    // En modo demo borramos agente_nombre/telefono server-side antes de
    // hidratar para evitar extracción via __NEXT_DATA__. Ver lib/demo-mode.ts.
    const initialProperties = isDemo && Array.isArray(baseProps.initialProperties)
      ? sanitizeVentasArrayForDemo(baseProps.initialProperties)
      : baseProps.initialProperties

    return {
      props: {
        ...baseProps,
        initialProperties,
        brokerSlug: slug,
        broker,
        brokerDemoMode: isDemo,
      },
      revalidate: 60,
    }
  }

  return ventasResult
}
