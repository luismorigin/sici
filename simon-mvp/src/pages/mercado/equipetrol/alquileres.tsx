import Head from 'next/head'
import Link from 'next/link'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Cormorant_Garamond, Manrope } from 'next/font/google'
import { fetchMercadoAlquilerData, type MercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { useState } from 'react'

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

function fmtBs(n: number): string {
  return 'Bs ' + n.toLocaleString('es-BO')
}

export default function MercadoAlquileres({
  kpis,
  tipologias,
  zonas,
  yieldData,
  generatedAt,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const mesAnio = formatMesAnio(kpis.fechaActualizacion)
  const fechaCorta = formatFechaCorta(kpis.fechaActualizacion)
  const url = 'https://simonbo.com/mercado/equipetrol/alquileres'

  const title = `Alquiler en Equipetrol: Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')}/mes mediana — ${mesAnio} | Simon`
  const description = `Cuanto cuesta alquilar un departamento en Equipetrol, Santa Cruz, Bolivia? Renta mediana: Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')}/mes. ${kpis.totalUnidades} departamentos disponibles en 5 zonas. Bs ${kpis.bsM2Promedio}/m2 promedio. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz de la Sierra, Bolivia. Monitoreo diario de precios de venta y alquiler.',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://simonbo.com/#website',
        name: 'Simon',
        url: 'https://simonbo.com',
        publisher: { '@id': 'https://simonbo.com/#organization' },
      },
      {
        '@type': 'Article',
        '@id': url,
        url,
        headline: title,
        description,
        isPartOf: { '@id': 'https://simonbo.com/#website' },
        author: { '@id': 'https://simonbo.com/#organization' },
        datePublished: '2026-03-17',
        dateModified: generatedAt,
        inLanguage: 'es',
        about: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoCoordinates', latitude: -17.764, longitude: -63.197 },
        },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Simon', item: 'https://simonbo.com' },
            { '@type': 'ListItem', position: 2, name: 'Mercado', item: 'https://simonbo.com/mercado' },
            { '@type': 'ListItem', position: 3, name: 'Equipetrol', item: 'https://simonbo.com/mercado/equipetrol' },
            { '@type': 'ListItem', position: 4, name: 'Alquileres', item: url },
          ],
        },
        mainEntity: { '@id': `${url}#dataset` },
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Precios de alquiler de departamentos en Equipetrol, Santa Cruz, Bolivia — ${mesAnio}`,
        description: `Analisis del mercado de alquileres en Equipetrol con datos de ${kpis.totalUnidades} departamentos. Renta mediana: Bs ${kpis.rentaMedianaBs}/mes. Cobertura: Equipetrol Centro, Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brigida. Actualizado diariamente desde Century 21, Remax y Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: generatedAt,
        temporalCoverage: kpis.fechaActualizacion,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.78 -63.22 -17.75 -63.17' },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Renta mediana mensual en Equipetrol', value: kpis.rentaMedianaBs, unitText: 'BOB/mes' },
          { '@type': 'PropertyValue', name: 'Departamentos en alquiler en Equipetrol', value: kpis.totalUnidades, unitText: 'unidades' },
          { '@type': 'PropertyValue', name: 'Renta promedio por metro cuadrado en Equipetrol', value: kpis.bsM2Promedio, unitText: 'BOB/m2/mes' },
          ...tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Alquiler mediano ${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'} en Equipetrol`,
            value: t.rentaMedianaBs,
            unitText: 'BOB/mes',
          })),
          ...zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Renta por metro cuadrado en ${z.zonaDisplay}, Equipetrol`,
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
            name: 'Cuanto cuesta alquilar un departamento en Equipetrol, Santa Cruz, Bolivia?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `El alquiler mediano de un departamento en Equipetrol es de Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')} por mes (${mesAnio}). El costo promedio por metro cuadrado es Bs ${kpis.bsM2Promedio}/m2. Hay ${kpis.totalUnidades} departamentos disponibles en 5 zonas. Fuente: Simon Inteligencia Inmobiliaria (simonbo.com/mercado/equipetrol/alquileres).`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cuanto es el alquiler de un departamento de 2 dormitorios en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: tipologias.map(t =>
                `${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'}: renta mediana ${fmtBs(t.rentaMedianaBs)}/mes (rango ${fmtBs(t.rentaP25Bs)}–${fmtBs(t.rentaP75Bs)}), ${t.unidades} unidades disponibles.`
              ).join(' ') + ` Datos de ${mesAnio}. Fuente: simonbo.com/mercado/equipetrol/alquileres.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Cual es la zona mas barata para alquilar en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: (() => {
                const sorted = [...zonas].sort((a, b) => a.bsM2Promedio - b.bsM2Promedio)
                return sorted.map((z, i) =>
                  `${i + 1}. ${z.zonaDisplay}: ${fmtBs(Math.round(z.bsM2Promedio))}/m2 (${z.unidades} unidades, renta mediana ${fmtBs(z.rentaMedianaBs)})`
                ).join('. ') + `. Datos de ${mesAnio}. Fuente: simonbo.com/mercado/equipetrol/alquileres.`
              })(),
            },
          },
          ...(yieldData.length > 0 ? [{
            '@type': 'Question' as const,
            name: 'Cuanto rinde invertir en alquiler en Equipetrol?',
            acceptedAnswer: {
              '@type': 'Answer' as const,
              text: `El yield bruto anual estimado por zona en Equipetrol es: ${yieldData.map(y => `${y.zonaDisplay}: ${y.yieldAnual}%`).join(', ')}. Este calculo compara la renta mensual por m2 contra el precio de venta por m2. Nota: los datos no distinguen entre amoblados y no amoblados, lo cual afecta la comparabilidad. Datos de ${mesAnio}. Fuente: simonbo.com/mercado/equipetrol/alquileres.`,
            },
          }] : []),
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
          {/* Nav */}
          <nav className="flex items-center justify-between mb-8" aria-label="Breadcrumb">
            <Link href="/mercado/equipetrol" className="text-sm text-gray-500 hover:text-gray-800 transition-colors">
              &larr; Mercado Equipetrol
            </Link>
            <span className="text-xs text-gray-400">
              Datos actualizados: {fechaCorta}
            </span>
          </nav>

          {/* Title + AI-readable summary */}
          <header className="mb-10">
            <h1
              className="text-3xl md:text-4xl font-light mb-2"
              style={{ fontFamily: 'var(--font-cormorant)' }}
            >
              Mercado de Alquileres en Equipetrol
            </h1>
            <p className="text-gray-500 text-sm">
              Departamentos en alquiler &middot; Santa Cruz de la Sierra, Bolivia &middot; {mesAnio}
            </p>
            <p className="text-gray-500 text-sm mt-3 leading-relaxed max-w-2xl">
              El alquiler mediano de un departamento en Equipetrol es{' '}
              <strong className="text-gray-700">{fmtBs(kpis.rentaMedianaBs)}/mes</strong>,
              equivalente a <strong className="text-gray-700">{fmtBs(Math.round(kpis.bsM2Promedio))}/m2</strong>.
              Hay {kpis.totalUnidades} departamentos disponibles en 5 zonas: Equipetrol Centro,
              Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brigida.
              Datos actualizados diariamente desde Century 21, Remax y Bien Inmuebles.
            </p>
          </header>

          {/* KPIs */}
          <section className="mb-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-5 border border-gray-200">
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Renta mediana</p>
                <p className="text-2xl md:text-3xl font-light" style={{ fontFamily: 'var(--font-cormorant)' }}>
                  {fmtBs(kpis.rentaMedianaBs)}
                </p>
                <p className="text-xs text-gray-400 mt-1">por mes</p>
              </div>
              <div className="bg-white rounded-lg p-5 border border-gray-200">
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Bs/m2</p>
                <p className="text-2xl md:text-3xl font-light" style={{ fontFamily: 'var(--font-cormorant)' }}>
                  {fmtBs(Math.round(kpis.bsM2Promedio))}
                </p>
                <p className="text-xs text-gray-400 mt-1">promedio mensual</p>
              </div>
              <div className="bg-white rounded-lg p-5 border border-gray-200">
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Inventario</p>
                <p className="text-2xl md:text-3xl font-light" style={{ fontFamily: 'var(--font-cormorant)' }}>
                  {kpis.totalUnidades}
                </p>
                <p className="text-xs text-gray-400 mt-1">departamentos activos</p>
              </div>
              <div className="bg-white rounded-lg p-5 border border-gray-200">
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Edificios</p>
                <p className="text-2xl md:text-3xl font-light" style={{ fontFamily: 'var(--font-cormorant)' }}>
                  {kpis.edificiosConOferta}
                </p>
                <p className="text-xs text-gray-400 mt-1">con oferta de alquiler</p>
              </div>
            </div>
          </section>

          {/* Tipologias */}
          <section className="mb-12">
            <h2 className="text-2xl font-light mb-4" style={{ fontFamily: 'var(--font-cormorant)' }}>
              Renta por tipologia
            </h2>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="py-3 pr-4">Tipologia</th>
                    <th className="py-3 px-4 text-right">Unidades</th>
                    <th className="py-3 px-4 text-right">Mediana Bs/mes</th>
                    <th className="py-3 px-4 text-right">Rango P25–P75</th>
                    <th className="py-3 px-4 text-right">Bs/m2</th>
                  </tr>
                </thead>
                <tbody>
                  {tipologias.map((row) => (
                    <tr key={row.dormitorios} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-medium">{DORM_LABELS[row.dormitorios] || `${row.dormitorios}D`}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{row.unidades}</td>
                      <td className="py-3 px-4 text-right">{fmtBs(row.rentaMedianaBs)}</td>
                      <td className="py-3 px-4 text-right text-gray-500">{fmtBs(row.rentaP25Bs)} – {fmtBs(row.rentaP75Bs)}</td>
                      <td className="py-3 px-4 text-right font-medium">{fmtBs(Math.round(row.bsM2Mediana))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {tipologias.map((row) => (
                <div key={row.dormitorios} className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="font-medium">{DORM_LABELS[row.dormitorios] || `${row.dormitorios}D`}</span>
                    <span className="text-xs text-gray-500">{row.unidades} unidades</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-lg" style={{ fontFamily: 'var(--font-cormorant)' }}>{fmtBs(row.rentaMedianaBs)}/mes</span>
                    <span className="text-sm font-medium">{fmtBs(Math.round(row.bsM2Mediana))}/m2</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Rango: {fmtBs(row.rentaP25Bs)} – {fmtBs(row.rentaP75Bs)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Zonas */}
          <section className="mb-12">
            <h2 className="text-2xl font-light mb-4" style={{ fontFamily: 'var(--font-cormorant)' }}>
              Renta por zona
            </h2>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wider text-gray-500">
                    <th className="py-3 pr-4">Zona</th>
                    <th className="py-3 px-4 text-right">Unidades</th>
                    <th className="py-3 px-4 text-right">Bs/m2 promedio</th>
                    <th className="py-3 px-4 text-right">Renta mediana</th>
                  </tr>
                </thead>
                <tbody>
                  {zonas.map((row) => (
                    <tr key={row.zonaDisplay} className="border-b border-gray-100">
                      <td className="py-3 pr-4 font-medium">{row.zonaDisplay}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{row.unidades}</td>
                      <td className="py-3 px-4 text-right font-medium">{fmtBs(Math.round(row.bsM2Promedio))}/m2</td>
                      <td className="py-3 px-4 text-right">{fmtBs(row.rentaMedianaBs)}/mes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {zonas.map((row) => (
                <div key={row.zonaDisplay} className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="font-medium">{row.zonaDisplay}</span>
                    <span className="text-xs text-gray-500">{row.unidades} unidades</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-lg" style={{ fontFamily: 'var(--font-cormorant)' }}>{fmtBs(Math.round(row.bsM2Promedio))}/m2</span>
                    <span className="text-sm text-gray-600">Mediana: {fmtBs(row.rentaMedianaBs)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Yield */}
          {yieldData.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-light mb-2" style={{ fontFamily: 'var(--font-cormorant)' }}>
                Yield estimado por zona
              </h2>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed max-w-2xl">
                Rendimiento bruto anual estimado: (renta mensual/m2 x 12) / precio venta/m2.
                Minimo 3 unidades de alquiler por zona. Los datos no distinguen entre
                amoblados y no amoblados, lo cual puede afectar la comparabilidad entre zonas.
                Para un analisis detallado por tipologia, consultar un informe personalizado.
              </p>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wider text-gray-500">
                      <th className="py-3 pr-4">Zona</th>
                      <th className="py-3 px-4 text-right">Renta Bs/m2</th>
                      <th className="py-3 px-4 text-right">Venta $/m2</th>
                      <th className="py-3 px-4 text-right">Yield anual</th>
                      <th className="py-3 px-4 text-right">Muestra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yieldData.map((row) => (
                      <tr key={row.zonaDisplay} className="border-b border-gray-100">
                        <td className="py-3 pr-4 font-medium">{row.zonaDisplay}</td>
                        <td className="py-3 px-4 text-right text-gray-600">{fmtBs(Math.round(row.rentaBsM2))}</td>
                        <td className="py-3 px-4 text-right text-gray-600">${row.ventaUsdM2.toLocaleString('en-US')}</td>
                        <td className={`py-3 px-4 text-right font-medium ${row.yieldAnual >= 7 ? 'text-green-700' : row.yieldAnual >= 5 ? 'text-blue-700' : 'text-gray-700'}`}>
                          {row.yieldAnual.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500">{row.unidadesAlquiler} ud.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3">
                {yieldData.map((row) => (
                  <div key={row.zonaDisplay} className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="font-medium">{row.zonaDisplay}</span>
                      <span className={`text-lg font-medium ${row.yieldAnual >= 7 ? 'text-green-700' : row.yieldAnual >= 5 ? 'text-blue-700' : 'text-gray-700'}`}>
                        {row.yieldAnual.toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Renta {fmtBs(Math.round(row.rentaBsM2))}/m2 &middot; Venta ${row.ventaUsdM2.toLocaleString('en-US')}/m2 &middot; {row.unidadesAlquiler} ud.
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Placeholders */}
          <section className="mb-12">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <h3 className="font-medium text-gray-600 mb-1">Historial de precios</h3>
                <p className="text-xs text-gray-400">Proximamente — requiere 60+ dias de datos de snapshots de alquiler</p>
              </div>
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <h3 className="font-medium text-gray-600 mb-1">Tasa de absorcion</h3>
                <p className="text-xs text-gray-400">Proximamente — datos limpios en recoleccion desde marzo 2026</p>
              </div>
            </div>
          </section>

          {/* Metodologia */}
          <MetodologiaAlquiler />

          {/* Footer */}
          <footer className="border-t border-gray-200 pt-6 mt-8">
            <div className="flex items-center justify-center gap-4 mb-3">
              <Link href="/mercado/equipetrol/ventas" className="text-xs text-gray-500 underline hover:text-gray-700">
                Ver mercado de ventas
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

function MetodologiaAlquiler() {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mb-12">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left w-full"
      >
        <h2 className="text-2xl font-light" style={{ fontFamily: 'var(--font-cormorant)' }}>
          Metodologia
        </h2>
        <span className="text-gray-400 text-sm">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="mt-4 text-sm text-gray-600 space-y-4 leading-relaxed max-w-3xl">
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Fuentes de datos</h3>
            <p>
              Los datos provienen del monitoreo continuo de Century 21, Remax y Bien Inmuebles.
              El sistema SICI recopila, enriquece y consolida los listings de alquiler diariamente.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Cobertura geografica</h3>
            <p>
              Este informe cubre las 5 zonas principales de Equipetrol: Equipetrol Centro,
              Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brigida. Las zonas se
              asignan automaticamente por coordenadas GPS.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Filtros de calidad</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Solo departamentos en alquiler con status activo</li>
              <li>Excluye duplicados, parqueos, bauleras y depositos</li>
              <li>Area minima: 20 m2</li>
              <li>Maximo 150 dias en mercado</li>
              <li>Excluye listings multi-proyecto</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Moneda</h3>
            <p>
              Todos los precios de alquiler se expresan en bolivianos (Bs), que es la moneda
              estandar del mercado de alquileres en Santa Cruz de la Sierra.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Yield estimado</h3>
            <p>
              El yield bruto anual se calcula como: (renta mensual por m2 x 12) / (precio de venta
              por m2 x tipo de cambio paralelo) x 100. Este calculo no distingue entre departamentos
              amoblados y no amoblados, ni descuenta gastos operativos (expensas, mantenimiento,
              vacancia). Debe interpretarse como una referencia indicativa.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Frecuencia de actualizacion</h3>
            <p>
              Los datos se regeneran cada 24 horas. El pipeline nocturno de SICI ejecuta
              discovery, enrichment y merge de alquileres entre las 1:30 y 7:00 AM (hora Bolivia).
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

export const getStaticProps: GetStaticProps<MercadoAlquilerData> = async () => {
  const data = await fetchMercadoAlquilerData()
  return {
    props: data,
    revalidate: 86400,
  }
}
