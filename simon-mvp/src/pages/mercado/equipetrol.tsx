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

function formatMesAnio(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const mes = d.toLocaleDateString('es-BO', { month: 'long' })
  return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + d.getFullYear()
}

function formatFechaCorta(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
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

  const title = `Mercado Inmobiliario Equipetrol ${mesAnio} | Simon`
  const description = `Precio del m² en Equipetrol hoy: $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD. Datos de ${kpis.totalPropiedades} propiedades activas. Actualizado ${fechaCorta}.`
  const url = 'https://simonbo.com/mercado/equipetrol'

  const schemaDataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `Mercado Inmobiliario Equipetrol — ${mesAnio}`,
    description: 'Precios de departamentos en venta en Equipetrol, Santa Cruz de la Sierra, Bolivia',
    url,
    creator: {
      '@type': 'Organization',
      name: 'Simon — Inteligencia Inmobiliaria',
      url: 'https://simonbo.com',
    },
    dateModified: generatedAt,
    spatialCoverage: {
      '@type': 'Place',
      name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
    },
    variableMeasured: [
      {
        '@type': 'PropertyValue',
        name: 'Precio mediano por m²',
        value: kpis.medianaPrecioM2,
        unitCode: 'USD',
      },
      {
        '@type': 'PropertyValue',
        name: 'Propiedades activas',
        value: kpis.totalPropiedades,
      },
      {
        '@type': 'PropertyValue',
        name: 'Tasa de absorción mensual',
        value: kpis.absorcionPct,
        unitCode: 'P1',
      },
    ],
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={url} />

        {/* Open Graph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        <meta property="og:site_name" content="Simon — Inteligencia Inmobiliaria" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />

        {/* Schema.org Dataset */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaDataset) }}
        />
      </Head>

      <div
        className={`${cormorant.variable} ${manrope.variable} min-h-screen`}
        style={{ backgroundColor: '#f8f6f3', fontFamily: 'var(--font-manrope), sans-serif' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-8">
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
            <p className="text-xs text-gray-400 text-center">
              Datos generados por{' '}
              <a href="https://simonbo.com" className="underline hover:text-gray-600">
                Simon — Inteligencia Inmobiliaria
              </a>
              . Fuentes: Century 21, Remax, Bien Inmuebles.
              Los precios mostrados son medianas del mercado y no constituyen una tasación.
            </p>
          </footer>
        </div>
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
