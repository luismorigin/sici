// /alquileres — el feed de ALQUILER de Equipetrol.
//
// 18-ago-2026: pasa a usar `components/feed/FeedAlquileres.tsx`, el mismo componente que
// Zona Norte. Aca queda solo lo PROPIO de Equipetrol: su SEO y su `getStaticProps`.
import Head from 'next/head'
import type { GetStaticProps } from 'next'
import FeedAlquileres from '@/components/feed/FeedAlquileres'
import type { AlquileresSEO } from '@/components/feed/FeedAlquileres'
import { formatMesAnioSEO, formatFechaCortaSEO, fmtBsSEO, DORM_LABELS_SEO } from '@/components/feed/FeedAlquileres'
import { EQUIPETROL } from '@/lib/macrozonas'
// El getStaticProps arma el SEO con sus propias consultas: necesita lo mismo que antes.
import type { UnidadAlquiler } from '@/lib/supabase'
import { buscarUnidadesAlquiler } from '@/lib/supabase'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { ZONAS_EQUIPETROL_DB } from '@/lib/zonas'

function AlquileresHead({ seo, brokerSlug = null, publicShareHash = null }: {
  seo: AlquileresSEO
  brokerSlug?: string | null
  publicShareHash?: string | null
}) {
  // En modo shortlist pública (/b/[hash]) el wrapper provee sus propios OG
  // personalizados con el nombre del broker y la cantidad de propiedades.
  // Renderizar AlquileresHead acá pisaría/duplicaría esos OG y WhatsApp termina
  // mostrando el preview genérico del feed en vez del personalizado. Skipeamos.
  if (publicShareHash) return null
  const mesAnio = formatMesAnioSEO(seo.fechaActualizacion)
  const fechaCorta = formatFechaCortaSEO(seo.fechaActualizacion)
  // URL canónica según contexto. Sin override, el share del browser/OS resuelve
  // og:url y termina compartiendo simonbo.com/alquileres (feed público)
  // aunque el broker esté en /broker/[slug]/alquileres o un cliente en /b/[hash].
  const url = publicShareHash
    ? `https://simonbo.com/b/${publicShareHash}`
    : brokerSlug
    ? `https://simonbo.com/broker/${brokerSlug}/alquileres`
    : 'https://simonbo.com/alquileres'

  const title = `${seo.totalUnidades} Alquileres en Equipetrol — Desde ${fmtBsSEO(seo.tipologias[0]?.rentaMedianaBs || 2500)}/mes | Simon`
  const description = `Departamentos en alquiler en Equipetrol, Santa Cruz, Bolivia. ${seo.totalUnidades} unidades disponibles. Renta mediana: ${fmtBsSEO(seo.rentaMedianaBs)}/mes. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz de la Sierra, Bolivia.',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://simonbo.com/#website',
        name: 'Simon',
        url: 'https://simonbo.com',
        publisher: { '@id': 'https://simonbo.com/#organization' },
      },
      {
        '@type': 'RealEstateListing',
        '@id': url,
        url,
        name: title,
        description,
        isPartOf: { '@id': 'https://simonbo.com/#website' },
        provider: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        inLanguage: 'es',
        about: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.764, longitude: -63.197 },
        },
        breadcrumb: { '@id': `${url}#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
          { '@type': 'ListItem', position: 2, name: 'Alquileres', item: url },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Alquileres de departamentos en Equipetrol — ${mesAnio}`,
        description: `${seo.totalUnidades} departamentos en alquiler en Equipetrol. Renta mediana: ${fmtBsSEO(seo.rentaMedianaBs)}/mes. Cobertura: 6 zonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        temporalCoverage: seo.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.78 -63.22 -17.75 -63.17' },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Renta mediana mensual', value: seo.rentaMedianaBs, unitText: 'BOB/mes' },
          { '@type': 'PropertyValue', name: 'Departamentos en alquiler', value: seo.totalUnidades, unitText: 'unidades' },
          { '@type': 'PropertyValue', name: 'Renta promedio por metro cuadrado', value: seo.bsM2Promedio, unitText: 'BOB/m2/mes' },
          ...seo.tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Alquiler mediano ${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}`,
            value: t.rentaMedianaBs,
            unitText: 'BOB/mes',
          })),
          ...seo.zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Renta por m² en ${z.zonaDisplay}`,
            value: z.bsM2Promedio,
            unitText: 'BOB/m2/mes',
          })),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Cuanto cuesta alquilar un departamento en Equipetrol, Santa Cruz?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El alquiler mediano en Equipetrol es ${fmtBsSEO(seo.rentaMedianaBs)}/mes (${mesAnio}). Hay ${seo.totalUnidades} departamentos disponibles. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/alquileres).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta el alquiler por tipo de departamento en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: seo.tipologias.map(t =>
                `${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}: ${fmtBsSEO(t.rentaMedianaBs)}/mes mediano (rango ${fmtBsSEO(t.rentaP25Bs)}–${fmtBsSEO(t.rentaP75Bs)}), ${t.unidades} unidades.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/alquileres.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es la zona mas barata para alquilar en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: (() => {
                const sorted = [...seo.zonas].sort((a, b) => a.bsM2Promedio - b.bsM2Promedio)
                return sorted.map((z, i) =>
                  `${i + 1}. ${z.zonaDisplay}: ${fmtBsSEO(Math.round(z.bsM2Promedio))}/m², renta mediana ${fmtBsSEO(z.rentaMedianaBs)}`
                ).join('. ') + `. Datos de ${mesAnio}. Fuente: simonbo.com/alquileres.`
              })(),
            },
          },
          {
            '@type': 'Question',
            name: 'Donde puedo ver alquileres verificados en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Simon (simonbo.com/alquileres) muestra ${seo.totalUnidades} departamentos en alquiler en Equipetrol con datos verificados de Century 21, Remax y Bien Inmuebles. Incluye filtros por zona, dormitorios y precio, con contacto directo por WhatsApp.`,
            },
          },
        ],
      },
    ],
  }

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#EDE8DC" />
      <link rel="canonical" href={url} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />
      <meta property="og:locale" content="es_BO" />

      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph).replace(/</g, '\\u003c') }}
      />
    </Head>
  )
}

// ===== getStaticProps — SEO data + first 8 properties for LCP =====

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// `pages/b/[hash].tsx` importa este tipo desde aca desde antes de la mudanza — se re-exporta
// para no tocar ese archivo (mismo patron que en `pages/ventas.tsx`).
export type { PublicShareDataAlquiler } from '@/components/feed/FeedAlquileres'

export default function AlquileresPage(props: any) {
  return (
    <FeedAlquileres
      macrozona={EQUIPETROL}
      head={
        <AlquileresHead
          seo={props.seo}
          brokerSlug={props.brokerSlug ?? null}
          publicShareHash={props.publicShare?.hash ?? null}
        />
      }
      {...props}
    />
  )
}

export const getStaticProps: GetStaticProps<{ seo: AlquileresSEO; initialProperties: UnidadAlquiler[] }> = async () => {
  // Cliente de SERVIDOR: pedía `shadow: true` y aun así servía 0 propiedades, porque la
  // clave pública no puede leer la tabla desde la mig 317 y la RPC fallaba adentro.
  // Ver docs/backlog/SSG_FEEDS_PRIMERA_PINTURA_2026-08-11.md.
  const { getServerSupabase } = await import('@/lib/supabase-server')
  const serverDb = getServerSupabase()
  const [data, initialProperties] = await Promise.all([
    fetchMercadoAlquilerData(EQUIPETROL),
    buscarUnidadesAlquiler(
      { orden: 'recientes', limite: 8, solo_con_fotos: true, zonas_permitidas: ZONAS_EQUIPETROL_DB },
      { shadow: true, client: serverDb ?? undefined },
    ).catch(() => [] as UnidadAlquiler[]),
  ])
  return {
    props: {
      initialProperties,
      seo: {
        totalUnidades: data.kpis.totalUnidades,
        rentaMedianaBs: data.kpis.rentaMedianaBs,
        bsM2Promedio: data.kpis.bsM2Promedio,
        fechaActualizacion: data.kpis.fechaActualizacion,
        generatedAt: data.generatedAt,
        tipologias: data.tipologias.map(t => ({
          dormitorios: t.dormitorios,
          unidades: t.unidades,
          rentaMedianaBs: t.rentaMedianaBs,
          rentaP25Bs: t.rentaP25Bs,
          rentaP75Bs: t.rentaP75Bs,
        })),
        zonas: data.zonas.map(z => ({
          zonaDisplay: z.zonaDisplay,
          unidades: z.unidades,
          bsM2Promedio: z.bsM2Promedio,
          rentaMedianaBs: z.rentaMedianaBs,
        })),
      },
    },
    revalidate: 21600, // 6 hours
  }
}
