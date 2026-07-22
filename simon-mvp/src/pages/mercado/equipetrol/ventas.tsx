// /mercado/equipetrol/ventas — página SEO/AEO de mercado (rediseño 21-jul-2026,
// lanzamiento TC nuevo). Oscura como el feed /ventas (brand v1.4).
//
// Principios (no romper):
//  - AEO: todo server-rendered; cada gráfico tiene su TABLA HTML gemela (los
//    agentes de IA leen HTML, no canvas); FAQ visible = espejo del FAQPage del
//    schema; cada cifra viaja con unidad y fecha.
//  - Fiduciario: la curva USD NUNCA sin el dólar al lado; la caída se declara
//    como RANGO (la banda 12-17% viene del análisis de métodos, migs 287/288);
//    yield bruto con su supuesto de amoblados; "precio de oferta, no cierre"
//    en el cuerpo; medianas con su n. Sin absorción como predicción.
//  - Datos: KPIs vivos de v_mercado_venta_shadow (fetchMercadoData) · serie
//    histórica de market_price_reexpresado (ESTIMACIÓN declarada) · yield del
//    snapshot shadow. Todo graceful: sin serie/extra, la sección no se pinta.
import Head from 'next/head'
import Link from 'next/link'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Figtree, DM_Sans } from 'next/font/google'
import { fetchMercadoData } from '@/lib/mercado-data'
import {
  fetchSerieMensualVentas,
  fetchVentasShadowExtra,
  type SerieMensual,
  type VentasShadowExtra,
} from '@/lib/mercado-shadow-data'
import { supabase } from '@/lib/supabase'
import { EvolucionSerie } from '@/components/mercado/EvolucionSerie'

const figtree = Figtree({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-figtree', display: 'optional' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-dm', display: 'optional' })

const DORM_LABELS: Record<number, string> = { 0: 'Monoambiente', 1: '1 dormitorio', 2: '2 dormitorios', 3: '3 dormitorios' }

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
  generatedAt,
  serie,
  extra,
  tcHoy,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const mesAnio = formatMesAnio(kpis.fechaActualizacion)
  const fechaCorta = formatFechaCorta(kpis.fechaActualizacion)

  const title = `Precio del m² en Equipetrol hoy: $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD — ${mesAnio} | Simon`
  const description = `Cuanto cuesta un departamento en Equipetrol, Santa Cruz, Bolivia? Precio mediano del m²: $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD. ${kpis.totalPropiedades} propiedades activas en 6 zonas. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`
  const url = 'https://simonbo.com/mercado/equipetrol/ventas'

  // FAQ visible = misma data que el FAQPage del schema (una sola fuente de copy)
  const faq: Array<{ q: string; a: string }> = [
    {
      q: '¿Cuánto cuesta el metro cuadrado en Equipetrol, Santa Cruz, Bolivia?',
      a: `El precio mediano del metro cuadrado en Equipetrol es de $${kpis.medianaPrecioM2.toLocaleString('en-US')} USD (${mesAnio}), calculado sobre ${kpis.totalPropiedades} departamentos activos${extra?.edificios ? ` en ${extra.edificios} edificios` : ''}. Es precio de publicación, no de cierre.`,
    },
    ...(serie
      ? [{
          q: '¿Los precios en Equipetrol están subiendo o bajando?',
          a: `Medido en dólares, el m² bajó entre 12% y 17% desde enero de 2026 (según el método de reexpresión). Medido en bolivianos bajó ${Math.abs(serie.varBsPct).toFixed(0)}%. La diferencia la explica el dólar paralelo, que subió ${serie.varTcPct.toFixed(0)}% en el mismo período: gran parte de la baja en USD es efecto cambiario, no caída del valor del inmueble.`,
        }]
      : []),
    ...(extra?.yieldZonas.length
      ? [{
          q: '¿Cuánto rinde un departamento en alquiler en Equipetrol?',
          a: `Entre ${extra.yieldZonas[extra.yieldZonas.length - 1].roi.toFixed(1).replace('.', ',')}% y ${extra.yieldZonas[0].roi.toFixed(1).replace('.', ',')}% bruto anual según la zona (1 dormitorio, renta anual ÷ precio de compra). Es rendimiento bruto de oferta: no descuenta expensas, vacancia ni mantenimiento, y la oferta de alquiler está dominada por unidades amobladas.`,
        }]
      : []),
    {
      q: '¿Cuántos departamentos hay en venta en Equipetrol?',
      a: `${kpis.totalPropiedades} departamentos activos en las 6 zonas (${mesAnio})${extra?.domVenta ? `, con una mediana de ${extra.domVenta} días publicados` : ''}. Se verifican diariamente contra Century 21, Remax y Bien Inmuebles.`,
    },
  ]

  const schemaGraph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://simonbo.com/#organization',
        name: 'Simon — Inteligencia Inmobiliaria',
        url: 'https://simonbo.com',
        description: 'Plataforma de inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz de la Sierra, Bolivia. Monitoreo diario de precios, rotacion y tendencias.',
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
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `Precios de departamentos en Equipetrol, Santa Cruz, Bolivia — ${mesAnio}`,
        description: `Analisis del mercado inmobiliario de Equipetrol con datos de ${kpis.totalPropiedades} departamentos en venta. Precio mediano del metro cuadrado: $${kpis.medianaPrecioM2} USD. Incluye serie historica de precios en USD y bolivianos desde enero 2026, rendimiento bruto de alquiler por zona y rotacion del inventario. Actualizado diariamente desde Century 21, Remax y Bien Inmuebles.`,
        url,
        license: 'https://creativecommons.org/licenses/by/4.0/',
        creator: { '@id': 'https://simonbo.com/#organization' },
        dateModified: generatedAt,
        temporalCoverage: `2026-01/${kpis.fechaActualizacion.slice(0, 7)}`,
        spatialCoverage: {
          '@type': 'Place',
          name: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
          geo: { '@type': 'GeoShape', box: '-17.78 -63.22 -17.75 -63.17' },
        },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Precio mediano por metro cuadrado en Equipetrol', value: kpis.medianaPrecioM2, unitText: 'USD/m2' },
          { '@type': 'PropertyValue', name: 'Departamentos en venta en Equipetrol', value: kpis.totalPropiedades, unitText: 'unidades' },
          ...(extra?.domVenta ? [{ '@type': 'PropertyValue', name: 'Dias publicados del inventario en venta (mediana)', value: extra.domVenta, unitText: 'dias' }] : []),
          ...(serie
            ? [
                { '@type': 'PropertyValue', name: 'Variacion del precio del m2 en bolivianos desde enero 2026', value: serie.varBsPct, unitText: 'porcentaje' },
                { '@type': 'PropertyValue', name: 'Variacion del dolar paralelo desde enero 2026', value: serie.varTcPct, unitText: 'porcentaje' },
              ]
            : []),
          ...(extra?.yieldZonas || []).map(y => ({
            '@type': 'PropertyValue',
            name: `Rendimiento bruto anual de alquiler en ${y.zona}, Equipetrol (1 dormitorio)`,
            value: y.roi,
            unitText: 'porcentaje',
          })),
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
        distribution: { '@type': 'DataDownload', contentUrl: url, encodingFormat: 'text/html' },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faq.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: `${f.a} Fuente: simonbo.com/mercado/equipetrol/ventas.` },
        })),
      },
    ],
  }

  const maxRoi = extra?.yieldZonas[0]?.roi || 1

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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }} />
      </Head>

      <div className={`${figtree.variable} ${dmSans.variable} mkt`}>
        <article className="mkt-wrap">
          <nav className="mkt-nav" aria-label="Breadcrumb">
            <Link href="/" className="mkt-brand">
              <span className="mkt-dot" aria-hidden="true" />
              Simon
              <span className="mkt-crumb">Mercado · Ventas · Equipetrol</span>
            </Link>
            <span className="mkt-badge">Actualizado · {fechaCorta}</span>
          </nav>

          <header className="mkt-hero">
            <p className="mkt-kicker">Precio mediano del m² · departamentos en venta</p>
            <h1 className="mkt-h1">
              {fmt(kpis.medianaPrecioM2)}
              <span className="mkt-h1-sub">USD por m² · precio de oferta</span>
            </h1>
            <p className="mkt-lead">
              {kpis.totalPropiedades} departamentos verificados diariamente
              {extra?.edificios ? ` en ${extra.edificios} edificios` : ''} de las 6 zonas de Equipetrol:
              Centro, Norte, Oeste, Sirari, Villa Brígida y 3er Anillo. Fuente: Century 21, Remax y Bien Inmuebles.
            </p>
          </header>

          <div className="mkt-cards">
            <div className="mkt-card">
              <span className="mkt-card-l">En oferta</span>
              <span className="mkt-card-v">{kpis.totalPropiedades}</span>
              <span className="mkt-card-s">{extra?.edificios ? `en ${extra.edificios} edificios` : 'departamentos'}</span>
            </div>
            {extra?.domVenta != null && (
              <div className="mkt-card">
                <span className="mkt-card-l">Rotación</span>
                <span className="mkt-card-v">~{extra.domVenta} días</span>
                <span className="mkt-card-s">mediana publicado</span>
              </div>
            )}
            {tcHoy != null && (
              <div className="mkt-card">
                <span className="mkt-card-l">Dólar hoy</span>
                <span className="mkt-card-v">Bs {tcHoy.toFixed(2).replace('.', ',')}</span>
                <span className="mkt-card-s">paralelo Binance</span>
              </div>
            )}
            <div className="mkt-card">
              <span className="mkt-card-l">Actividad</span>
              <span className="mkt-card-v">{kpis.absorcionPct}%</span>
              <span className="mkt-card-s">retiros mensuales *</span>
            </div>
          </div>

          {serie && (
            <section className="mkt-sec" aria-labelledby="sec-evolucion">
              <h2 id="sec-evolucion" className="mkt-h2">Evolución del precio — {serie.puntos[0].mes.toLowerCase()} a {serie.puntos[serie.puntos.length - 1].mes.toLowerCase()}</h2>
              <p className="mkt-sub">Base 100 = {serie.puntos[0].mes.toLowerCase()} · 1 dormitorio (la tipología más ofertada) · serie reexpresada al criterio actual de precios</p>
              <div className="mkt-legend">
                <span><i className="mkt-sw" style={{ background: '#EDE8DC' }} />En dólares −12 a −17%</span>
                <span><i className="mkt-sw" style={{ background: '#7FB08A' }} />En bolivianos {serie.varBsPct.toFixed(0)}%</span>
                <span><i className="mkt-sw" style={{ background: '#C9A15A' }} />Dólar paralelo +{serie.varTcPct.toFixed(0)}%</span>
              </div>
              <EvolucionSerie serie={serie} />
              <div className="mkt-note">
                La brecha entre las dos curvas es el dólar: el precio en la moneda local bajó mucho menos de lo
                que sugiere la cifra en USD. La magnitud exacta en dólares depende del método de reexpresión
                (entre 12% y 17%); la forma de la curva es robusta. Precio de publicación — el de cierre puede diferir.
              </div>
              <table className="mkt-table" aria-label="Serie mensual del precio por metro cuadrado">
                <thead>
                  <tr><th>Mes</th><th>USD/m²</th><th>Bs/m²</th><th>Dólar (Bs)</th></tr>
                </thead>
                <tbody>
                  {serie.puntos.map(p => (
                    <tr key={p.mes}>
                      <td>{p.mes}</td>
                      <td>{fmt(p.usd_m2)}</td>
                      <td>Bs {p.bs_m2.toLocaleString('es-BO')}</td>
                      <td>{p.tc.toFixed(2).replace('.', ',')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {extra?.spread && (
            <section className="mkt-sec" aria-labelledby="sec-spread">
              <h2 id="sec-spread" className="mkt-h2">Preventa vs entrega inmediata</h2>
              <p className="mkt-sub">Mediana USD/m² del inventario activo · solo avisos con estado declarado</p>
              <div className="mkt-pair">
                <div className="mkt-card">
                  <span className="mkt-card-l">Preventa · {extra.spread.prevN} avisos</span>
                  <span className="mkt-card-v">{fmt(extra.spread.prevM2)}<em>/m²</em></span>
                  <span className="mkt-bar"><i style={{ width: `${Math.round((extra.spread.prevM2 / Math.max(extra.spread.prevM2, extra.spread.entrM2)) * 100)}%`, background: '#7FB08A' }} /></span>
                </div>
                <div className="mkt-card">
                  <span className="mkt-card-l">Entrega inmediata · {extra.spread.entrN} avisos</span>
                  <span className="mkt-card-v">{fmt(extra.spread.entrM2)}<em>/m²</em></span>
                  <span className="mkt-bar"><i style={{ width: `${Math.round((extra.spread.entrM2 / Math.max(extra.spread.prevM2, extra.spread.entrM2)) * 100)}%`, background: 'rgba(237,232,220,0.55)' }} /></span>
                </div>
              </div>
            </section>
          )}

          {extra && extra.yieldZonas.length > 0 && (
            <section className="mkt-sec" aria-labelledby="sec-yield">
              <h2 id="sec-yield" className="mkt-h2">Rendimiento bruto de alquiler por zona</h2>
              <p className="mkt-sub">1 dormitorio · renta anual ÷ precio de compra · sin descontar expensas ni vacancia · oferta dominada por unidades amobladas</p>
              <div className="mkt-rows">
                {extra.yieldZonas.map(y => (
                  <div className="mkt-row" key={y.zona}>
                    <span className="mkt-row-l">{y.zona}</span>
                    <span className="mkt-row-track"><i style={{ width: `${Math.round((y.roi / maxRoi) * 100)}%` }} /></span>
                    <span className="mkt-row-v">{y.roi.toFixed(1).replace('.', ',')}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mkt-sec" aria-labelledby="sec-tipologias">
            <h2 id="sec-tipologias" className="mkt-h2">Precios por tipología</h2>
            <p className="mkt-sub">Mediana y rango típico (p25–p75) del inventario activo, en USD</p>
            <table className="mkt-table" aria-label="Precios por tipología">
              <thead>
                <tr><th>Tipología</th><th>Unidades</th><th>Mediana</th><th>Rango típico</th><th>$/m²</th></tr>
              </thead>
              <tbody>
                {tipologias.map(t => (
                  <tr key={t.dormitorios}>
                    <td>{DORM_LABELS[t.dormitorios] || `${t.dormitorios}D`}</td>
                    <td>{t.unidades}</td>
                    <td>{fmt(t.precioMediano)}</td>
                    <td>{fmt(t.precioP25)} – {fmt(t.precioP75)}</td>
                    <td>{fmt(t.medianaPrecioM2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mkt-sec" aria-labelledby="sec-zonas">
            <h2 id="sec-zonas" className="mkt-h2">Precios por zona</h2>
            <table className="mkt-table" aria-label="Precios por zona">
              <thead>
                <tr><th>Zona</th><th>Unidades</th><th>$/m² mediana</th><th>Precio mediano</th></tr>
              </thead>
              <tbody>
                {zonas.map(z => (
                  <tr key={z.zonaDisplay}>
                    <td>{z.zonaDisplay}</td>
                    <td>{z.unidades}</td>
                    <td>{fmt(z.medianaPrecioM2)}</td>
                    <td>{fmt(z.precioMediano)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mkt-sec" aria-labelledby="sec-faq">
            <h2 id="sec-faq" className="mkt-h2">Preguntas que responde esta página</h2>
            <div className="mkt-faq">
              {faq.map(f => (
                <div className="mkt-qa" key={f.q}>
                  <h3 className="mkt-q">{f.q}</h3>
                  <p className="mkt-a">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <footer className="mkt-foot">
            <p>
              * Actividad de mercado: retiros mensuales ÷ inventario. Incluye ventas reales, vencimientos de
              exclusividad y retiros temporales — no equivale a ventas confirmadas.
            </p>
            <p>
              Metodología: precios de publicación, no de cierre. Serie histórica reexpresada al criterio actual
              de tipos de cambio (error estimado del método ~7%, declarado). Rendimientos brutos sin expensas ni
              vacancia. Cada cifra sale de avisos públicos re-leídos diariamente y no constituye una tasación.
            </p>
            <div className="mkt-links">
              <Link href="/mercado/equipetrol/alquileres">Ver mercado de alquileres</Link>
              <span aria-hidden="true">·</span>
              <Link href="/ventas">Ver los departamentos en venta</Link>
              <span aria-hidden="true">·</span>
              <Link href="/mercado/equipetrol">Volver al índice</Link>
            </div>
          </footer>
        </article>

        <style jsx>{`
          .mkt { min-height: 100vh; background: #141414; color: #EDE8DC; font-family: var(--font-dm), 'DM Sans', sans-serif; }
          .mkt-wrap { max-width: 760px; margin: 0 auto; padding: 0 20px 48px; }
          .mkt-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0; border-bottom: 1px solid rgba(237,232,220,0.09); flex-wrap: wrap; }
          .mkt-brand { display: flex; align-items: center; gap: 8px; color: #EDE8DC; text-decoration: none; font-weight: 500; font-size: 15px; letter-spacing: 0.3px; }
          .mkt-dot { width: 10px; height: 10px; border-radius: 50%; background: #3A6A48; }
          .mkt-crumb { color: rgba(237,232,220,0.4); font-size: 13px; font-weight: 400; margin-left: 8px; }
          .mkt-badge { font-size: 11px; color: #9DBF9E; border: 1px solid rgba(58,106,72,0.5); padding: 3px 10px; border-radius: 100px; white-space: nowrap; }
          .mkt-hero { padding: 34px 0 22px; }
          .mkt-kicker { margin: 0 0 8px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(237,232,220,0.45); }
          .mkt-h1 { margin: 0; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: clamp(38px, 8vw, 54px); font-weight: 600; letter-spacing: -1px; line-height: 1.05; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
          .mkt-h1-sub { font-family: var(--font-dm), 'DM Sans', sans-serif; font-size: 15px; font-weight: 400; letter-spacing: 0; color: rgba(237,232,220,0.55); }
          .mkt-lead { margin: 12px 0 0; font-size: 13.5px; color: rgba(237,232,220,0.5); line-height: 1.65; max-width: 560px; }
          .mkt-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding-bottom: 26px; }
          .mkt-card { background: rgba(237,232,220,0.05); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
          .mkt-card-l { font-size: 11px; color: rgba(237,232,220,0.45); }
          .mkt-card-v { font-size: 20px; font-weight: 500; color: #EDE8DC; }
          .mkt-card-v em { font-style: normal; font-size: 13px; color: rgba(237,232,220,0.45); }
          .mkt-card-s { font-size: 11px; color: rgba(237,232,220,0.4); }
          .mkt-sec { padding: 22px 0; border-top: 1px solid rgba(237,232,220,0.09); }
          .mkt-h2 { margin: 0 0 3px; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 18px; font-weight: 600; color: #EDE8DC; }
          .mkt-sub { margin: 0 0 14px; font-size: 12px; color: rgba(237,232,220,0.5); line-height: 1.5; }
          .mkt-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 10px; font-size: 11.5px; color: rgba(237,232,220,0.6); }
          .mkt-legend span { display: inline-flex; align-items: center; gap: 5px; }
          .mkt-sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }
          .mkt-note { margin-top: 12px; background: rgba(58,106,72,0.16); border-radius: 8px; padding: 10px 14px; font-size: 12.5px; color: #B9CDB9; line-height: 1.6; }
          .mkt-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
          .mkt-table th { text-align: left; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(237,232,220,0.45); padding: 8px 10px; border-bottom: 1px solid rgba(237,232,220,0.12); }
          .mkt-table td { padding: 9px 10px; border-bottom: 1px solid rgba(237,232,220,0.06); color: rgba(237,232,220,0.85); }
          .mkt-pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
          .mkt-bar { display: block; height: 6px; background: rgba(237,232,220,0.1); border-radius: 3px; margin-top: 8px; overflow: hidden; }
          .mkt-bar i { display: block; height: 100%; border-radius: 3px; }
          .mkt-rows { display: flex; flex-direction: column; gap: 8px; }
          .mkt-row { display: grid; grid-template-columns: 92px 1fr 52px; gap: 10px; align-items: center; }
          .mkt-row-l { font-size: 12.5px; color: rgba(237,232,220,0.7); text-align: right; }
          .mkt-row-track { display: block; height: 18px; background: rgba(237,232,220,0.07); border-radius: 4px; overflow: hidden; }
          .mkt-row-track i { display: block; height: 100%; background: #3A6A48; border-radius: 4px; }
          .mkt-row-v { font-size: 13px; font-weight: 500; color: #9DBF9E; }
          .mkt-faq { display: flex; flex-direction: column; gap: 10px; }
          .mkt-qa { background: rgba(237,232,220,0.04); border-radius: 8px; padding: 12px 14px; }
          .mkt-q { margin: 0 0 4px; font-size: 13.5px; font-weight: 500; color: #EDE8DC; font-family: var(--font-dm), 'DM Sans', sans-serif; }
          .mkt-a { margin: 0; font-size: 12.5px; color: rgba(237,232,220,0.55); line-height: 1.65; }
          .mkt-foot { border-top: 1px solid rgba(237,232,220,0.09); padding-top: 18px; margin-top: 4px; }
          .mkt-foot p { margin: 0 0 10px; font-size: 11.5px; color: rgba(237,232,220,0.4); line-height: 1.7; }
          .mkt-links { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12.5px; color: rgba(237,232,220,0.35); }
          .mkt-links :global(a) { color: #9DBF9E; text-decoration: underline; text-underline-offset: 3px; }
        `}</style>
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps<{
  kpis: Awaited<ReturnType<typeof fetchMercadoData>>['kpis']
  tipologias: Awaited<ReturnType<typeof fetchMercadoData>>['tipologias']
  zonas: Awaited<ReturnType<typeof fetchMercadoData>>['zonas']
  generatedAt: string
  serie: SerieMensual | null
  extra: VentasShadowExtra | null
  tcHoy: number | null
}> = async () => {
  const [data, serie, extra, tcRes] = await Promise.all([
    fetchMercadoData(),
    fetchSerieMensualVentas(),
    fetchVentasShadowExtra(),
    supabase
      ? supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single()
      : Promise.resolve({ data: null }),
  ])
  const tcHoy = tcRes?.data ? parseFloat((tcRes.data as { valor: string }).valor) || null : null
  // El histórico prod (régimen viejo) NO viaja en props: la curva sale de la
  // serie reexpresada. Se destructura para no serializarlo en __NEXT_DATA__.
  const { kpis, tipologias, zonas, generatedAt } = data
  return {
    props: { kpis, tipologias, zonas, generatedAt, serie, extra, tcHoy },
    revalidate: 21600, // 6 horas (la data se refresca con el cron nocturno)
  }
}
