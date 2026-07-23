// /mercado/equipetrol/ventas — página SEO/AEO de mercado.
// Rediseño mobile 22-jul-2026 (MERCADO_MOBILE_REDESIGN_PLAN.md): de documento
// con tablas a app de indicadores — el resumen primero, el detalle bajo demanda.
//
// Principios (no romper):
//  - AEO: todo server-rendered; el schema JSON-LD (Article/Dataset/FAQPage) se
//    MANTIENE INTACTO del rediseño 21-jul; la tabla gemela de la serie vive en
//    un <details> (en el DOM aunque colapsada → los agentes la leen); el FAQ
//    visible sigue siendo espejo del FAQPage del schema.
//  - Fiduciario: la curva USD NUNCA sin el dólar al lado (toggle explícito de
//    moneda); la caída se declara como RANGO (banda 12-17%, migs 287/288);
//    yield bruto con su supuesto de amoblados; "precio de oferta, no cierre";
//    medianas con su n. SIN comparación preventa/entrega: el pozo real se vende
//    por canales internos — lo que llega a portales es un recorte sesgado
//    (decisión founder 22-jul, memoria preventa_pozo_sesgo_portales).
//  - Mobile: nada desborda el viewport (las tablas de 5 columnas murieron);
//    números en color pleno ≥13px; el $/m² visible sin abrir nada.
//  - Datos: KPIs vivos de v_mercado_venta_shadow (fetchMercadoData) · serie
//    histórica de market_price_reexpresado (ESTIMACIÓN declarada) · yield del
//    snapshot shadow. Todo graceful: sin serie/extra, la sección no se pinta.
import Head from 'next/head'
import Link from 'next/link'
import { useEffect } from 'react'
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
import { trackEvent } from '@/lib/analytics'
import SerieInteractiva from '@/components/mercado/SerieInteractiva'
import TipologiaDrill, { type TipologiaItem } from '@/components/mercado/TipologiaDrill'
import ZonasBars from '@/components/mercado/ZonasBars'
import Lectura from '@/components/mercado/Lectura'
import FaqAccordion from '@/components/mercado/FaqAccordion'
import CtaSticky from '@/components/mercado/CtaSticky'

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

  useEffect(() => {
    trackEvent('mercado_view', { operacion: 'venta' })
  }, [])

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

  // Delta del último mes de la serie (para el chip del hero)
  const ult = serie && serie.puntos.length >= 2 ? serie.puntos[serie.puntos.length - 1] : null
  const prev = serie && serie.puntos.length >= 2 ? serie.puntos[serie.puntos.length - 2] : null
  const deltaMes = ult && prev && prev.usd_m2 > 0 ? Math.round((ult.usd_m2 / prev.usd_m2 - 1) * 100) : null

  // Drill de tipologías: precio total + $/m², cada una con su deep-link al feed
  const drillItems: TipologiaItem[] = tipologias.map(t => ({
    key: String(t.dormitorios),
    label: DORM_LABELS[t.dormitorios] || `${t.dormitorios} dormitorios`,
    sub: `${t.unidades} avisos`,
    valor: fmt(t.precioMediano),
    secundario: `${fmt(t.medianaPrecioM2)}/m²`,
    rangos: [
      {
        min: t.precioP25,
        med: t.precioMediano,
        max: t.precioP75,
        fmt,
        cap: 'Rango típico (la mitad central de los avisos) · la marca es la mediana',
      },
      ...(t.m2P25 && t.m2P75
        ? [{
            min: t.m2P25,
            med: t.medianaPrecioM2,
            max: t.m2P75,
            fmt: (n: number) => `${fmt(n)}/m²`,
            cap: 'Lo mismo, por metro cuadrado — para comparar deptos de distinto tamaño',
          }]
        : []),
    ],
    href: `/ventas?dormitorios=${t.dormitorios}`,
    hrefLabel: `Ver los ${t.unidades} →`,
  }))

  // Lecturas calculadas de la data viva (nunca números hardcodeados — doc-rot)
  const zonasOrd = [...zonas].sort((a, b) => b.medianaPrecioM2 - a.medianaPrecioM2)
  const zTop = zonasOrd[0]
  const zBot = zonasOrd[zonasOrd.length - 1]
  const brechaPct = zTop && zBot ? Math.round((1 - zBot.medianaPrecioM2 / zTop.medianaPrecioM2) * 100) : 0
  const zMasOferta = [...zonas].sort((a, b) => b.unidades - a.unidades)[0]
  const concentracionPct = zMasOferta ? Math.round((zMasOferta.unidades / kpis.totalPropiedades) * 100) : 0

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
              <span className="mkt-crumb">Mercado · Equipetrol</span>
            </Link>
            <span className="mkt-badge">Actualizado · {fechaCorta}</span>
          </nav>

          {/* Toggle de operación: NAVEGA entre las dos URLs (SEO intacto,
              deep-linkeable) — no es estado client-side */}
          <div className="mkt-op" role="navigation" aria-label="Operación">
            <span className="mkt-op-on" aria-current="page">Comprar</span>
            <Link href="/mercado/equipetrol/alquileres" className="mkt-op-off">Alquilar</Link>
          </div>

          <header className="mkt-hero">
            <p className="mkt-kicker">Precio mediano del m² · departamentos en venta</p>
            <h1 className="mkt-h1">
              {fmt(kpis.medianaPrecioM2)}
              <span className="mkt-h1-sub">USD por m² · precio de oferta</span>
            </h1>
            <div className="mkt-chips">
              {deltaMes != null && deltaMes !== 0 && (
                <span className={`mkt-chip ${deltaMes < 0 ? 'down' : 'up'}`}>
                  {deltaMes < 0 ? '▼' : '▲'} {deltaMes > 0 ? '+' : ''}{deltaMes}% vs mes anterior (serie)
                </span>
              )}
              <span className="mkt-chip">{kpis.totalPropiedades} deptos{extra?.edificios ? ` · ${extra.edificios} edificios` : ''}</span>
            </div>
            <p className="mkt-lead">
              {serie
                ? <>El precio <b>viene bajando desde enero</b>: −12 a −17% en dólares, {serie.varBsPct.toFixed(0)}% en bolivianos. La diferencia entre ambos es el dólar.</>
                : <>{kpis.totalPropiedades} departamentos verificados diariamente en las 6 zonas de Equipetrol. Fuente: Century 21, Remax y Bien Inmuebles.</>}
            </p>
          </header>

          <div className="mkt-cards">
            <div className="mkt-card">
              <span className="mkt-card-l">En oferta</span>
              <span className="mkt-card-v num">{kpis.totalPropiedades}</span>
              <span className="mkt-card-s">{extra?.edificios ? `${extra.edificios} edificios verificados a diario` : 'verificados a diario'}</span>
            </div>
            {extra?.domVenta != null && (
              <div className="mkt-card">
                <span className="mkt-card-l">Rotación</span>
                <span className="mkt-card-v num">~{extra.domVenta} <small>días</small></span>
                <span className="mkt-card-s">lo que lleva publicado un aviso</span>
              </div>
            )}
            {tcHoy != null && (
              <div className="mkt-card">
                <span className="mkt-card-l">Dólar hoy</span>
                <span className="mkt-card-v num">Bs {tcHoy.toFixed(2).replace('.', ',')}</span>
                <span className="mkt-card-s">paralelo Binance</span>
              </div>
            )}
            <div className="mkt-card">
              <span className="mkt-card-l">Actividad</span>
              <span className="mkt-card-v num">{kpis.absorcionPct}%</span>
              <span className="mkt-card-s">{kpis.absorcionPct >= 20 ? `1 de cada ${Math.round(100 / kpis.absorcionPct)} avisos se retira al mes *` : 'retiros mensuales *'}</span>
            </div>
          </div>

          {serie && (
            <section className="mkt-sec" aria-labelledby="sec-evolucion">
              <h2 id="sec-evolucion" className="mkt-h2">¿Hacia dónde va el precio?</h2>
              <p className="mkt-sub">
                {serie.puntos[0].mes} → {serie.puntos[serie.puntos.length - 1].mes} · 1 dormitorio (la tipología más ofertada) · serie reexpresada al criterio actual de precios
              </p>
              <SerieInteractiva serie={serie} operacion="venta" />
              <Lectura>
                <b>La brecha entre monedas es el dólar</b>: el precio en bolivianos bajó mucho menos de lo que
                sugiere la cifra en USD. La magnitud exacta en dólares depende del método de reexpresión
                (entre 12% y 17%); la forma de la curva es robusta. Precio de publicación — el de cierre puede diferir.
              </Lectura>
            </section>
          )}

          <section className="mkt-sec" aria-labelledby="sec-tipologias">
            <h2 id="sec-tipologias" className="mkt-h2">¿Cuánto cuesta el tuyo?</h2>
            <p className="mkt-sub">Tocá una tipología para ver el rango típico · USD, inventario activo</p>
            <TipologiaDrill items={drillItems} operacion="venta" />
            {zTop && zBot && brechaPct > 0 && (
              <Lectura>
                <b>El precio depende más de la zona que del tamaño</b>: el m² va de {fmt(zTop.medianaPrecioM2)} en{' '}
                {zTop.zonaDisplay} a {fmt(zBot.medianaPrecioM2)} en {zBot.zonaDisplay} (−{brechaPct}%). Mirá tu zona
                abajo antes de comparar.
              </Lectura>
            )}
          </section>

          <section className="mkt-sec" aria-labelledby="sec-zonas">
            <h2 id="sec-zonas" className="mkt-h2">Las zonas, comparadas</h2>
            <p className="mkt-sub">USD/m² mediano · más caro arriba · zonas con menos de 5 avisos no se muestran</p>
            <ZonasBars
              items={zonas.filter(z => z.unidades >= 5).map(z => ({
                label: z.zonaDisplay,
                sub: `${z.unidades} avisos`,
                valor: z.medianaPrecioM2,
                valorFmt: fmt(z.medianaPrecioM2),
              }))}
            />
            {zTop && zBot && zMasOferta && (
              <Lectura>
                <b>{zBot.zonaDisplay} cuesta −{brechaPct}% que {zTop.zonaDisplay}</b> — la brecha más grande del
                mapa. {zMasOferta.zonaDisplay} concentra el {concentracionPct}% de la oferta.
              </Lectura>
            )}
          </section>

          {extra && extra.yieldZonas.length > 0 && (
            <section className="mkt-sec" aria-labelledby="sec-yield">
              <h2 id="sec-yield" className="mkt-h2">Rendimiento bruto de alquiler por zona</h2>
              <p className="mkt-sub">1 dormitorio · renta anual ÷ precio de compra · sin descontar expensas ni vacancia · oferta dominada por unidades amobladas</p>
              <div className="mkt-rows">
                {extra.yieldZonas.map(y => (
                  <div className="mkt-row" key={y.zona}>
                    <span className="mkt-row-l">{y.zona}</span>
                    <span className="mkt-row-track"><i style={{ width: `${Math.round((y.roi / maxRoi) * 100)}%` }} /></span>
                    <span className="mkt-row-v num">{y.roi.toFixed(1).replace('.', ',')}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mkt-sec" aria-labelledby="sec-faq">
            <h2 id="sec-faq" className="mkt-h2">Preguntas que responde esta página</h2>
            <FaqAccordion items={faq} />
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
              <Link href="/mercado/equipetrol">Volver al índice</Link>
            </div>
          </footer>
        </article>

        <CtaSticky href="/ventas" label={`Ver los ${kpis.totalPropiedades} departamentos →`} operacion="venta" />

        <style jsx>{`
          .mkt {
            min-height: 100vh; background: #141414; color: #EDE8DC; font-family: var(--font-dm), 'DM Sans', sans-serif;
            /* Tema de los componentes compartidos (components/mercado/) */
            --mx-bg: #141414;
            --mx-bg-fade: rgba(20, 20, 20, 0.9);
            --mx-text: #EDE8DC;
            --mx-dim: rgba(237, 232, 220, 0.62);
            --mx-dim2: rgba(237, 232, 220, 0.4);
            --mx-panel: rgba(237, 232, 220, 0.05);
            --mx-panel2: rgba(237, 232, 220, 0.12);
            --mx-line: rgba(237, 232, 220, 0.09);
            --mx-accent: #9DBF9E;
            --mx-accent-deep: #3A6A48;
            --mx-bar-deep: #2E5239;
            --mx-bar-a: rgba(157, 191, 158, 0.35);
            --mx-bar-b: rgba(157, 191, 158, 0.75);
            --mx-lectura-bg: rgba(58, 106, 72, 0.16);
            --mx-lectura-border: rgba(58, 106, 72, 0.3);
            --mx-lectura-text: #B9CDB9;
          }
          .mkt-wrap { max-width: 760px; margin: 0 auto; padding: 0 20px 110px; }
          .mkt-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0; border-bottom: 1px solid rgba(237,232,220,0.09); flex-wrap: wrap; }
          .mkt-brand { display: flex; align-items: center; gap: 8px; color: #EDE8DC; text-decoration: none; font-weight: 500; font-size: 15px; letter-spacing: 0.3px; }
          .mkt-dot { width: 10px; height: 10px; border-radius: 50%; background: #3A6A48; }
          .mkt-crumb { color: rgba(237,232,220,0.58); font-size: 13px; font-weight: 400; margin-left: 8px; }
          .mkt-badge { font-size: 12px; color: #9DBF9E; border: 1px solid rgba(58,106,72,0.5); padding: 3px 10px; border-radius: 100px; white-space: nowrap; }
          .mkt-op { display: grid; grid-template-columns: 1fr 1fr; background: rgba(237,232,220,0.05); border: 1px solid rgba(237,232,220,0.09); border-radius: 12px; padding: 3px; margin-top: 14px; }
          .mkt-op-on { padding: 9px 0; border-radius: 9px; font-size: 13.5px; font-weight: 600; text-align: center; background: #3A6A48; color: #F2EFE6; }
          .mkt-op :global(.mkt-op-off) { padding: 9px 0; border-radius: 9px; font-size: 13.5px; font-weight: 500; text-align: center; color: rgba(237,232,220,0.62); text-decoration: none; }
          .mkt-op :global(.mkt-op-off:hover) { color: #EDE8DC; }
          .mkt-hero { padding: 26px 0 20px; border-bottom: 1px solid rgba(237,232,220,0.09); }
          .mkt-kicker { margin: 0 0 8px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(237,232,220,0.62); }
          .mkt-h1 { margin: 0; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: clamp(38px, 8vw, 54px); font-weight: 600; letter-spacing: -1px; line-height: 1.05; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; font-variant-numeric: tabular-nums; }
          .mkt-h1-sub { font-family: var(--font-dm), 'DM Sans', sans-serif; font-size: 15px; font-weight: 400; letter-spacing: 0; color: rgba(237,232,220,0.55); }
          .mkt-chips { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          .mkt-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; padding: 5px 10px; border-radius: 999px; background: rgba(237,232,220,0.05); border: 1px solid rgba(237,232,220,0.09); color: rgba(237,232,220,0.62); font-variant-numeric: tabular-nums; }
          .mkt-chip.down { color: #D08770; border-color: rgba(208,135,112,0.3); }
          .mkt-chip.up { color: #D4A93C; border-color: rgba(212,169,60,0.3); }
          .mkt-lead { margin: 14px 0 0; font-size: 14px; color: rgba(237,232,220,0.66); line-height: 1.6; max-width: 560px; }
          .mkt-lead b { color: #EDE8DC; font-weight: 500; }
          .num { font-variant-numeric: tabular-nums; }
          .mkt-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 18px 0 26px; }
          @media (min-width: 640px) { .mkt-cards { grid-template-columns: repeat(4, 1fr); } }
          .mkt-card { background: rgba(237,232,220,0.05); border: 1px solid rgba(237,232,220,0.09); border-radius: 14px; padding: 13px 14px; display: flex; flex-direction: column; gap: 4px; }
          .mkt-card-l { font-size: 10.5px; letter-spacing: 1.3px; text-transform: uppercase; color: rgba(237,232,220,0.62); }
          .mkt-card-v { font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 22px; font-weight: 600; color: #EDE8DC; letter-spacing: -0.02em; }
          .mkt-card-v small { font-size: 12px; font-weight: 400; color: rgba(237,232,220,0.62); }
          .mkt-card-s { font-size: 12px; color: rgba(237,232,220,0.62); line-height: 1.4; }
          .mkt-sec { padding: 22px 0; border-top: 1px solid rgba(237,232,220,0.09); }
          .mkt-sec:first-of-type { border-top: 0; }
          .mkt-h2 { margin: 0 0 3px; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 17px; font-weight: 600; color: #EDE8DC; }
          .mkt-sub { margin: 0 0 4px; font-size: 12.5px; color: rgba(237,232,220,0.66); line-height: 1.5; }
          .mkt-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
          .mkt-row { display: grid; grid-template-columns: 96px 1fr 56px; gap: 10px; align-items: center; }
          .mkt-row-l { font-size: 12.5px; color: rgba(237,232,220,0.7); text-align: right; }
          .mkt-row-track { display: block; height: 18px; background: rgba(237,232,220,0.07); border-radius: 4px; overflow: hidden; }
          .mkt-row-track i { display: block; height: 100%; background: #3A6A48; border-radius: 4px; }
          .mkt-row-v { font-size: 13px; font-weight: 500; color: #9DBF9E; text-align: right; }
          .mkt-foot { border-top: 1px solid rgba(237,232,220,0.09); padding-top: 18px; margin-top: 4px; }
          .mkt-foot p { margin: 0 0 10px; font-size: 12px; color: rgba(237,232,220,0.6); line-height: 1.7; }
          .mkt-links { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; color: rgba(237,232,220,0.6); }
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
  const [data, serie, extraRaw, tcRes] = await Promise.all([
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
  // El spread preventa/entrega ya no se muestra (el pozo real se vende por
  // canales internos; los portales ven un recorte sesgado — decisión founder
  // 22-jul). Se anula para no serializar data que la página no usa.
  const extra = extraRaw ? { ...extraRaw, spread: null } : null
  return {
    props: { kpis, tipologias, zonas, generatedAt, serie, extra, tcHoy },
    revalidate: 21600, // 6 horas (la data se refresca con el cron nocturno)
  }
}
