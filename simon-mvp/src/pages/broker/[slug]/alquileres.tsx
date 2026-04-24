// Página /broker/[slug]/alquileres — renderiza AlquileresPage con modo broker activo.
//
// Mismo patrón que /broker/[slug].tsx (venta): data del broker de tabla
// `simon_brokers` (migración 231), SSG con revalidate=60s para que crear/pausar
// un broker desde admin se refleje rápido.
//
// Día 2 del plan Fase 2 (docs/broker/BACKLOG.md L53).

import AlquileresPage, { getStaticProps as alquileresGetStaticProps } from '../../alquileres'
import { listActiveSlugs, getBrokerBySlug, type Broker } from '@/lib/simon-brokers'
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
    return {
      props: {
        ...(alquileresResult.props as object),
        brokerSlug: slug,
        broker,
      },
      revalidate: 60,
    }
  }

  return alquileresResult
}
