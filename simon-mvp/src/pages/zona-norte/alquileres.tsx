// /zona-norte/alquileres — la pagina del feed de alquileres de ZONA NORTE.
//
// 18-ago-2026: pasa a usar el MISMO componente que Equipetrol
// (`components/feed/FeedAlquileres.tsx`), parametrizado por macrozona. Antes era una
// copia de 3.893 lineas que se habia quedado sin el rediseño: sin layout desktop, sin
// pills, sin resumen de mercado, sin el rediseño mobile. Ahora lo hereda todo.
//
// Lo que queda aca es lo PROPIO de Zona Norte: su SEO (con `noindex`, sigue en dark
// launch) y su `getStaticProps`.
//
// [!] El aislamiento lo garantiza `macrozona={ZONA_NORTE}`: el componente filtra por
// `macrozona.zonasDB` y ademas las FUERZA en `fetchFromAPI`, porque el API devuelve
// Equipetrol cuando no le pasan zonas — ver `docs/design/FIX_FEED_ZN_AISLAMIENTO.md`.
import Head from 'next/head'
import type { GetStaticProps } from 'next'
import { type UnidadAlquiler, buscarUnidadesAlquiler } from '@/lib/supabase'
import { getMicrozonasZN } from '@/lib/zonas'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import FeedAlquileres, { fmtBsSEO, formatMesAnioSEO, formatFechaCortaSEO, DORM_LABELS_SEO } from '@/components/feed/FeedAlquileres'
import type { AlquileresSEO } from '@/components/feed/FeedAlquileres'
import { ZONA_NORTE } from '@/lib/macrozonas'

// ===== SEO Head Component =====
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
    : 'https://simonbo.com/zona-norte/alquileres'

  const title = `${seo.totalUnidades} Alquileres en Zona Norte — Desde ${fmtBsSEO(seo.tipologias[0]?.rentaMedianaBs || 2500)}/mes | Simon`
  const description = `Departamentos en alquiler en Zona Norte, Santa Cruz, Bolivia. ${seo.totalUnidades} unidades disponibles. Renta mediana: ${fmtBsSEO(seo.rentaMedianaBs)}/mes. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Zona Norte, Santa Cruz de la Sierra, Bolivia.',
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
          name: 'Zona Norte, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.718, longitude: -63.153 },
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
        name: `Alquileres de departamentos en Zona Norte — ${mesAnio}`,
        description: `${seo.totalUnidades} departamentos en alquiler en Zona Norte. Renta mediana: ${fmtBsSEO(seo.rentaMedianaBs)}/mes. Cobertura: 14 microzonas. Fuentes: Century 21, Remax, Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: seo.generatedAt,
        temporalCoverage: seo.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Zona Norte, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.771 -63.194 -17.664 -63.111' },
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
            name: 'Cuanto cuesta alquilar un departamento en Zona Norte, Santa Cruz?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El alquiler mediano en Zona Norte es ${fmtBsSEO(seo.rentaMedianaBs)}/mes (${mesAnio}). Hay ${seo.totalUnidades} departamentos disponibles. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/alquileres).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta el alquiler por tipo de departamento en Zona Norte?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: seo.tipologias.map(t =>
                `${DORM_LABELS_SEO[t.dormitorios] || t.dormitorios + 'D'}: ${fmtBsSEO(t.rentaMedianaBs)}/mes mediano (rango ${fmtBsSEO(t.rentaP25Bs)}–${fmtBsSEO(t.rentaP75Bs)}), ${t.unidades} unidades.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/alquileres.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es la zona mas barata para alquilar en Zona Norte?',
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
            name: 'Donde puedo ver alquileres verificados en Zona Norte?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `Simon (simonbo.com/alquileres) muestra ${seo.totalUnidades} departamentos en alquiler en Zona Norte con datos verificados de Century 21, Remax y Bien Inmuebles. Incluye filtros por zona, dormitorios y precio, con contacto directo por WhatsApp.`,
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
      <meta name="robots" content="noindex, nofollow" />
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
      />
    </Head>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ZonaNorteAlquileresPage(props: any) {
  return (
    <FeedAlquileres
      macrozona={ZONA_NORTE}
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

// ===== getStaticProps — SEO data + first 8 properties for LCP =====
export const getStaticProps: GetStaticProps<{ seo: AlquileresSEO; initialProperties: UnidadAlquiler[] }> = async () => {
  // `shadow: true` + cliente de SERVIDOR — ver la nota en pages/alquileres.tsx.
  const { getServerSupabase } = await import('@/lib/supabase-server')
  const serverDb = getServerSupabase()
  const [data, initialProperties] = await Promise.all([
    fetchMercadoAlquilerData(ZONA_NORTE),
    buscarUnidadesAlquiler(
      { orden: 'recientes', limite: 8, solo_con_fotos: true, zonas_permitidas: getMicrozonasZN() },
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
