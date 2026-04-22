// Pagina /broker/[slug] — renderiza VentasPage con modo broker activo.
// Reemplaza el rewrite previo en next.config.js, que causaba bug Next
// "attempted to hard navigate to the same URL" al interactuar con filtros.
// Ver docs/broker/PRD.md F1.

import VentasPage, { getStaticProps as ventasGetStaticProps } from '../ventas'
import { BROKERS_DEMO, isValidBrokerSlug } from '@/lib/brokers-demo'
import type { GetStaticPaths, GetStaticProps } from 'next'

export default VentasPage

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: Object.keys(BROKERS_DEMO).map(slug => ({ params: { slug } })),
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps = async (context) => {
  const slug = context.params?.slug as string | undefined

  if (!isValidBrokerSlug(slug)) {
    return { notFound: true }
  }

  // Delegar a getStaticProps de ventas para obtener SEO + initial properties
  const ventasResult = await ventasGetStaticProps(context)

  if ('props' in ventasResult) {
    return {
      props: {
        ...(ventasResult.props as object),
        brokerSlug: slug,
      },
      revalidate: (ventasResult as { revalidate?: number }).revalidate ?? 21600,
    }
  }

  return ventasResult
}
