import Head from 'next/head'
import Link from 'next/link'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import { fetchMercadoData } from '@/lib/mercado-data'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'

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

interface HubProps {
  ventaKpis: {
    totalPropiedades: number
    medianaPrecioM2: number
  }
  alquilerKpis: {
    totalUnidades: number
    rentaMedianaBs: number
    bsM2Promedio: number
  }
  fechaActualizacion: string
  generatedAt: string
}

function formatMesAnio(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const mes = d.toLocaleDateString('es-BO', { month: 'long' })
  return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + d.getFullYear()
}

function formatFechaCorta(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MercadoEquipetrolHub({
  ventaKpis,
  alquilerKpis,
  fechaActualizacion,
  generatedAt,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const mesAnio = formatMesAnio(fechaActualizacion)
  const fechaCorta = formatFechaCorta(fechaActualizacion)
  const url = 'https://simonbo.com/mercado/equipetrol'

  const title = `Mercado Inmobiliario Equipetrol: Ventas y Alquileres — ${mesAnio} | Simon`
  const description = `Inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz, Bolivia. Ventas: ${ventaKpis.totalPropiedades} departamentos, $${ventaKpis.medianaPrecioM2}/m2. Alquileres: ${alquilerKpis.totalUnidades} unidades, Bs ${alquilerKpis.rentaMedianaBs}/mes. Datos actualizados ${fechaCorta}.`

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
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: title,
        description,
        isPartOf: { '@id': 'https://simonbo.com/#website' },
        about: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.764, longitude: -63.197 },
        },
        dateModified: generatedAt,
        inLanguage: 'es',
        hasPart: [
          { '@type': 'WebPage', '@id': 'https://simonbo.com/mercado/equipetrol/ventas', name: 'Mercado de Ventas en Equipetrol' },
          { '@type': 'WebPage', '@id': 'https://simonbo.com/mercado/equipetrol/alquileres', name: 'Mercado de Alquileres en Equipetrol' },
        ],
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
            { '@type': 'ListItem', position: 2, name: 'Mercado', item: 'https://simonbo.com/mercado' },
            { '@type': 'ListItem', position: 3, name: 'Equipetrol', item: url },
          ],
        },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Cuanto cuesta un departamento en Equipetrol, Santa Cruz, Bolivia?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El precio mediano del metro cuadrado en Equipetrol es de $${ventaKpis.medianaPrecioM2.toLocaleString('en-US')} USD (${mesAnio}), con ${ventaKpis.totalPropiedades} departamentos en venta. Para alquiler, la renta mediana es Bs ${alquilerKpis.rentaMedianaBs.toLocaleString('es-BO')}/mes con ${alquilerKpis.totalUnidades} unidades disponibles. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/mercado/equipetrol).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto cuesta alquilar en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El alquiler mediano en Equipetrol es de Bs ${alquilerKpis.rentaMedianaBs.toLocaleString('es-BO')} por mes (${mesAnio}), equivalente a Bs ${alquilerKpis.bsM2Promedio}/m2. Hay ${alquilerKpis.totalUnidades} departamentos disponibles en 5 zonas. Ver detalle completo en simonbo.com/mercado/equipetrol/alquileres.`,
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

      <div
        className={`${cormorant.variable} ${manrope.variable} min-h-screen`}
        style={{ backgroundColor: '#f8f6f3', fontFamily: 'var(--font-manrope), sans-serif' }}
      >
        <article className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          <nav className="flex items-center justify-between mb-8" aria-label="Breadcrumb">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
              &larr; simonbo.com
            </Link>
            <span className="text-xs text-gray-400">
              Datos actualizados: {fechaCorta}
            </span>
          </nav>

          <header className="mb-12">
            <h1
              className="text-3xl md:text-4xl font-light mb-2"
              style={{ fontFamily: 'var(--font-cormorant)' }}
            >
              Mercado Inmobiliario Equipetrol
            </h1>
            <p className="text-gray-500 text-sm">
              Santa Cruz de la Sierra, Bolivia &middot; {mesAnio}
            </p>
            <p className="text-gray-500 text-sm mt-3 leading-relaxed max-w-2xl">
              Inteligencia de mercado inmobiliario en Equipetrol con datos actualizados diariamente.
              Cobertura de <strong className="text-gray-700">{ventaKpis.totalPropiedades} departamentos en venta</strong> y{' '}
              <strong className="text-gray-700">{alquilerKpis.totalUnidades} en alquiler</strong> en
              5 zonas: Equipetrol Centro, Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brigida.
              Fuentes: Century 21, Remax y Bien Inmuebles.
            </p>
          </header>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {/* Ventas */}
            <Link
              href="/mercado/equipetrol/ventas"
              className="group block bg-white rounded-2xl p-8 border border-gray-200 hover:border-gray-400 hover:shadow-lg transition-all"
            >
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Departamentos en venta</p>
              <h2
                className="text-2xl font-light mb-4"
                style={{ fontFamily: 'var(--font-cormorant)' }}
              >
                Mercado de Ventas
              </h2>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-500 text-sm">Precio mediano m2</span>
                  <span className="text-xl font-medium text-gray-900">${ventaKpis.medianaPrecioM2.toLocaleString('en-US')}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-500 text-sm">Departamentos activos</span>
                  <span className="text-xl font-medium text-gray-900">{ventaKpis.totalPropiedades}</span>
                </div>
              </div>
              <p className="text-sm text-gray-400 group-hover:text-gray-600 transition-colors">
                Precios por zona, tipologia y tendencias &rarr;
              </p>
            </Link>

            {/* Alquileres */}
            <Link
              href="/mercado/equipetrol/alquileres"
              className="group block bg-white rounded-2xl p-8 border border-gray-200 hover:border-gray-400 hover:shadow-lg transition-all"
            >
              <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Departamentos en alquiler</p>
              <h2
                className="text-2xl font-light mb-4"
                style={{ fontFamily: 'var(--font-cormorant)' }}
              >
                Mercado de Alquileres
              </h2>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-500 text-sm">Renta mediana</span>
                  <span className="text-xl font-medium text-gray-900">Bs {alquilerKpis.rentaMedianaBs.toLocaleString('es-BO')}/mes</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-500 text-sm">Departamentos activos</span>
                  <span className="text-xl font-medium text-gray-900">{alquilerKpis.totalUnidades}</span>
                </div>
              </div>
              <p className="text-sm text-gray-400 group-hover:text-gray-600 transition-colors">
                Rentas por zona, tipologia y yield &rarr;
              </p>
            </Link>
          </div>

          <footer className="border-t border-gray-200 pt-6">
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

export const getStaticProps: GetStaticProps<HubProps> = async () => {
  const [ventaData, alquilerData] = await Promise.all([
    fetchMercadoData(),
    fetchMercadoAlquilerData(),
  ])

  return {
    props: {
      ventaKpis: {
        totalPropiedades: ventaData.kpis.totalPropiedades,
        medianaPrecioM2: ventaData.kpis.medianaPrecioM2,
      },
      alquilerKpis: {
        totalUnidades: alquilerData.kpis.totalUnidades,
        rentaMedianaBs: alquilerData.kpis.rentaMedianaBs,
        bsM2Promedio: alquilerData.kpis.bsM2Promedio,
      },
      fechaActualizacion: ventaData.kpis.fechaActualizacion,
      generatedAt: new Date().toISOString(),
    },
    revalidate: 86400,
  }
}
