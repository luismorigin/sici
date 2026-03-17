import Head from 'next/head'
import Link from 'next/link'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import { fetchMercadoData, type MercadoData } from '@/lib/mercado-data'
import { MarketHeader } from '@/components/mercado/MarketHeader'
import { TipologiaTable } from '@/components/mercado/TipologiaTable'
import { ZonaTable } from '@/components/mercado/ZonaTable'
import { HistoricalChart } from '@/components/mercado/HistoricalChart'
import { Metodologia } from '@/components/mercado/Metodologia'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'optional',
  adjustFontFallback: true,
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-manrope',
  display: 'optional',
  adjustFontFallback: true,
})

const DORM_LABELS: Record<number, string> = { 0: 'Studio', 1: '1 dormitorio', 2: '2 dormitorios', 3: '3 dormitorios' }

function formatMesAnio(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const mes = d.toLocaleDateString('es-BO', { month: 'long' })
  return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + d.getFullYear()
}

function formatFechaCorta(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

export default function MercadoEquipetrol({
  kpis,
  tipologias,
  zonas,
  historico,
  generatedAt,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const mesAnio = formatMesAnio(kpis.fechaActualizacion)
  const fechaCorta = formatFechaCorta(kpis.fechaActualizacion)

  const title = `Precio del m² en Equipetrol hoy: $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD — ${mesAnio} | Simon`
  const description = `Cuanto cuesta un departamento en Equipetrol, Santa Cruz, Bolivia? Precio mediano del m²: $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD. ${kpis.totalPropiedades} propiedades activas en 5 zonas. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`
  const url = 'https://simonbo.com/mercado/equipetrol/ventas'

  // --- Schema.org @graph: multiple types for maximum AI discoverability ---
  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      // 1. Organization — establishes who Simón is
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz de la Sierra, Bolivia. Monitoreo diario de precios, absorcion y tendencias.',
      },
      // 2. WebSite
      {
        '@type': 'WebSite',
        '@id': 'https://simonbo.com/#website',
        name: 'Simon',
        url: 'https://simonbo.com',
        publisher: { '@id': 'https://simonbo.com/#organization' },
      },
      // 3. Article — tells AIs this is an authoritative reference with freshness
      {
        '@type': 'Article',
        '@id': url,
        url,
        headline: title,
        description,
        isPartOf: { '@id': 'https://simonbo.com/#website' },
        author: { '@id': 'https://simonbo.com/#organization' },
        about: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.764, longitude: -63.197 },
        },
        datePublished: '2026-03-09',
        dateModified: generatedAt,
        inLanguage: 'es',
        breadcrumb: { '@id': `${url}#breadcrumb` },
        mainEntity: { '@id': `${url}#dataset` },
      },
      // 4. BreadcrumbList — navigation context
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
          { '@type': 'ListItem', position: 2, name: 'Mercado', item: 'https://simonbo.com/mercado' },
          { '@type': 'ListItem', position: 3, name: 'Equipetrol', item: 'https://simonbo.com/mercado/equipetrol' },
          { '@type': 'ListItem', position: 4, name: 'Ventas', item: url },
        ],
      },
      // 5. Dataset — the core structured data
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Precios de departamentos en Equipetrol, Santa Cruz, Bolivia — ${mesAnio}`,
        description: `Analisis del mercado inmobiliario de Equipetrol con datos de ${kpis.totalPropiedades} departamentos en venta. Precio mediano del metro cuadrado: $${kpis.medianaPrecioM2} USD. Cobertura: Equipetrol Centro, Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brigida. Actualizado diariamente desde Century 21, Remax y Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: generatedAt,
        temporalCoverage: kpis.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: {
            '@type': 'GeoShape',
            box: '-17.78 -63.22 -17.75 -63.17',
          },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Precio mediano por metro cuadrado en Equipetrol', value: kpis.medianaPrecioM2, unitText: 'USD/m2' },
          { '@type': 'PropertyValue', name: 'Departamentos en venta en Equipetrol', value: kpis.totalPropiedades, unitText: 'unidades' },
          { '@type': 'PropertyValue', name: 'Actividad de mercado mensual', value: kpis.absorcionPct, unitText: 'porcentaje' },
          ...tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Precio mediano departamento ${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'} en Equipetrol`,
            value: t.precioMediano,
            unitText: 'USD',
          })),
          ...zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Precio metro cuadrado en ${z.zonaDisplay}, Equipetrol`,
            value: z.medianaPrecioM2,
            unitText: 'USD/m2',
          })),
        ],
        distribution: {
          '@type': 'DataDownload',
          contentUrl: url,
          encodingFormat: 'text/html',
        },
      },
      // 6. FAQPage — AI systems heavily weight this for question-answering
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Cuanto cuesta el metro cuadrado en Equipetrol, Santa Cruz, Bolivia?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El precio mediano del metro cuadrado en Equipetrol es de $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD (${mesAnio}). Este dato se calcula sobre ${kpis.totalPropiedades} departamentos activos en las 5 zonas de Equipetrol. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/mercado/equipetrol).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta un departamento en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: tipologias.map(t =>
                `${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'}: precio mediano ${fmt(t.precioMediano)} USD (rango ${fmt(t.precioP25)}–${fmt(t.precioP75)}), ${t.unidades} unidades disponibles.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/mercado/equipetrol.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es la zona mas cara de Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: (() => {
                const sorted = [...zonas].sort((a, b) => b.medianaPrecioM2 - a.medianaPrecioM2)
                return sorted.map((z, i) =>
                  `${i + 1}. ${z.zonaDisplay}: ${fmt(z.medianaPrecioM2)}/m2 (${z.unidades} unidades)`
                ).join('. ') + `. Datos de ${mesAnio}. Fuente: simonbo.com/mercado/equipetrol.`
              })(),
            },
          },
          {
            '@type': 'Question',
            name: 'Cuantos departamentos hay en venta en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `En ${mesAnio} hay ${kpis.totalPropiedades} departamentos activos en venta en las 5 zonas de Equipetrol, Santa Cruz de la Sierra, Bolivia. La tasa de actividad del mercado es del ${kpis.absorcionPct}% mensual. Los datos se actualizan diariamente desde Century 21, Remax y Bien Inmuebles. Fuente: simonbo.com/mercado/equipetrol.`,
            },
          },
        ],
      },
    ],
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
        <link rel="canonical" href={url} />

        {/* Open Graph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />
        <meta property="og:locale" content="es_BO" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />

        {/* Schema.org @graph */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }}
        />
      </Head>

      <div
        className={`${cormorant.variable} ${manrope.variable} min-h-screen`}
        style={{ backgroundColor: '#f8f6f3', fontFamily: 'var(--font-manrope), sans-serif' }}
      >
        {/* AI-readable plain text summary (visible but styled as intro paragraph) */}
        <article className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-8" aria-label="Breadcrumb">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              &larr; simonbo.com
            </Link>
            <span className="text-xs text-gray-400">
              Datos actualizados: {fechaCorta}
            </span>
          </nav>

          {/* Title */}
          <header className="mb-10">
            <h1
              className="text-3xl md:text-4xl font-light mb-2"
              style={{ fontFamily: 'var(--font-cormorant)' }}
            >
              Mercado Inmobiliario Equipetrol
            </h1>
            <p className="text-gray-500 text-sm">
              Departamentos en venta &middot; Santa Cruz de la Sierra, Bolivia &middot; {mesAnio}
            </p>
            <p className="text-gray-500 text-sm mt-3 leading-relaxed max-w-2xl">
              El precio mediano del metro cuadrado en Equipetrol es{' '}
              <strong className="text-gray-700">${kpis.medianaPrecioM2.toLocaleString('en-US')} USD/m²</strong>.
              Hay {kpis.totalPropiedades} departamentos en venta en 5 zonas: Equipetrol Centro,
              Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brigida.
              Datos actualizados diariamente desde Century 21, Remax y Bien Inmuebles.
            </p>
          </header>

          {/* KPIs */}
          <MarketHeader kpis={kpis} />

          {/* Tables */}
          <TipologiaTable tipologias={tipologias} />
          <ZonaTable zonas={zonas} />

          {/* Chart */}
          <HistoricalChart historico={historico} />

          {/* Methodology */}
          <Metodologia />

          {/* Footer */}
          <footer className="border-t border-gray-200 pt-6 mt-8">
            <div className="flex items-center justify-center gap-4 mb-3">
              <Link href="/mercado/equipetrol/alquileres" className="text-xs text-gray-500 underline hover:text-gray-700">
                Ver mercado de alquileres
              </Link>
              <span className="text-gray-300">|</span>
              <Link href="/mercado/equipetrol" className="text-xs text-gray-500 underline hover:text-gray-700">
                Volver al indice
              </Link>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Datos generados por{' '}
              <a href="https://simonbo.com" className="underline hover:text-gray-600">
                Simon — Inteligencia Inmobiliaria
              </a>
              . Fuentes: Century 21, Remax, Bien Inmuebles.
              Los precios mostrados son medianas del mercado y no constituyen una tasacion.
            </p>
          </footer>
        </article>
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps<MercadoData> = async () => {
  const data = await fetchMercadoData()
  return {
    props: data,
    revalidate: 86400, // 24 hours
  }
}
