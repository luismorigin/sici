// Página /broker/[slug]/alquileres — renderiza AlquileresPage con modo broker activo.
//
// Mismo patrón que /broker/[slug].tsx (venta): data del broker de tabla
// `simon_brokers` (migración 231), SSG con revalidate=60s para que crear/pausar
// un broker desde admin se refleje rápido.
//
// Día 2 del plan Fase 2 (docs/broker/BACKLOG.md L53).

import AlquileresPage, { getStaticProps as alquileresGetStaticProps } from '../../alquileres'
import { listActiveSlugs, getBrokerBySlug, type Broker } from '@/lib/simon-brokers'
import { isDemoBrokerSlug, sanitizeAlquileresArrayForDemo } from '@/lib/demo-mode'
import type { UnidadAlquiler } from '@/lib/supabase'
import type { GetStaticPaths, GetStaticProps } from 'next'

export default AlquileresPage

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

  // Delegar a getStaticProps de alquileres para obtener seo + initial properties
  const alquileresResult = await alquileresGetStaticProps(context)

  if ('props' in alquileresResult) {
    const baseProps = alquileresResult.props as { initialProperties?: UnidadAlquiler[] } & Record<string, unknown>
    const isDemo = isDemoBrokerSlug(slug)

    // Sanitizar agente_nombre/telefono/whatsapp server-side en modo demo.
    const initialProperties = isDemo && Array.isArray(baseProps.initialProperties)
      ? sanitizeAlquileresArrayForDemo(baseProps.initialProperties)
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

  return alquileresResult
}
