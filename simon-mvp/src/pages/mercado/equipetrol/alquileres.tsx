// /mercado/equipetrol/alquileres — página SEO/AEO de mercado.
// Rediseño mobile 22-jul-2026 (MERCADO_MOBILE_REDESIGN_PLAN.md): de documento
// con tablas a app de indicadores. Arena como el feed /alquileres (brand v1.4).
//
// Principios (mismos que la gemela de ventas, ver header ahí), más los propios:
//  - El alquiler manda en BOLIVIANOS (la moneda real del contrato); el USD es
//    referencia al dólar del día.
//  - 🔴 El amoblado se compara POR TIPOLOGÍA, nunca global: los amoblados se
//    concentran en monoambientes y el agregado dice lo contrario que cada
//    tipología (paradoja de composición medida el 22-jul). La versión anterior
//    de esta página afirmaba "el amoblado no muestra una prima clara" — era la
//    comparación global la que mentía.
//  - La serie histórica NO se dibuja hasta que la confiable madure: la vieja
//    mezclaba régimen de cambio con universo de ~35 avisos/mes (mostrarla =
//    engañar); la nueva (Bs, con corte amoblado) arrancó el 21-jul-2026 con el
//    snapshot shadow. Placeholder honesto mientras tanto.
//  - "Sin dato ≠ no tiene" (regla de flags, solo el positivo declarado).
import Head from 'next/head'
import Link from 'next/link'
import { useEffect } from 'react'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Figtree, DM_Sans } from 'next/font/google'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { fetchAlquilerShadowExtra, type AlquilerShadowExtra } from '@/lib/mercado-shadow-data'
import { supabase } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
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

function fmtBs(n: number): string {
  return 'Bs ' + n.toLocaleString('es-BO')
}

export default function MercadoAlquileres({
  kpis,
  tipologias,
  zonas,
  generatedAt,
  extra,
  tcHoy,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const mesAnio = formatMesAnio(kpis.fechaActualizacion)
  const fechaCorta = formatFechaCorta(kpis.fechaActualizacion)
  const url = 'https://simonbo.com/mercado/equipetrol/alquileres'
  const usdRef = tcHoy ? Math.round(kpis.rentaMedianaBs / tcHoy) : null

  useEffect(() => {
    trackEvent('mercado_view', { operacion: 'alquiler' })
  }, [])

  const title = `Alquiler en Equipetrol: Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')}/mes mediana — ${mesAnio} | Simon`
  const description = `Cuanto cuesta alquilar un departamento en Equipetrol, Santa Cruz, Bolivia? Renta mediana: Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')}/mes. ${kpis.totalUnidades} departamentos disponibles. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  // Prima del amoblado POR tipología (solo cortes que pasan el gate n>=5)
  const splitTipos = tipologias.filter(t => t.amobladoSi && t.sinDeclarar)
  const primas = splitTipos
    .map(t => ({
      label: (DORM_LABELS[t.dormitorios] || `${t.dormitorios}D`).toLowerCase(),
      diff: (t.amobladoSi as NonNullable<typeof t.amobladoSi>).medianaBs - (t.sinDeclarar as NonNullable<typeof t.sinDeclarar>).medianaBs,
    }))
    .filter(p => p.diff > 0)

  const faq: Array<{ q: string; a: string }> = [
    {
      q: '¿Cuánto cuesta alquilar un departamento en Equipetrol?',
      a: `Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')} por mes de mediana (${mesAnio})${usdRef ? `, unos $${usdRef.toLocaleString('en-US')} al dólar de hoy` : ''}. ${tipologias.length ? tipologias.map(t => `${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'}: ${fmtBs(t.rentaMedianaBs)}`).join(' · ') + '.' : ''} El alquiler en Equipetrol se publica y se paga en bolivianos.`,
    },
    {
      q: '¿El alquiler subió con el dólar?',
      a: 'El alquiler se pacta en bolivianos y se mantuvo relativamente estable durante 2026. Medido en dólares bajó, porque el dólar paralelo subió en el año — es efecto cambiario, no una caída de las rentas.',
    },
    ...(primas.length
      ? [{
          q: '¿Conviene amoblar para alquilar?',
          a: `Comparado dentro de cada tipología, el amoblado se pide más caro: ${primas.map(p => `+${fmtBs(p.diff)} en ${p.label}`).join(', ')}. Ojo con el promedio global: engaña, porque los amoblados se concentran en monoambientes (los más baratos) y mezclado parece lo contrario. "Sin dato" no significa "no amoblado" — solo se cuenta lo que el aviso declara.`,
        }]
      : []),
    ...(extra?.domAlquiler && extra?.domVenta
      ? [{
          q: '¿Cuánto tarda en alquilarse un departamento en Equipetrol?',
          a: `El inventario de alquiler lleva una mediana de ${extra.domAlquiler} días publicado — rota al doble de velocidad que el de venta (${extra.domVenta} días). Es una medida del stock vigente, no del tiempo exacto hasta el contrato.`,
        }]
      : []),
  ]

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
        name: `Rentas de departamentos en alquiler en Equipetrol, Santa Cruz, Bolivia — ${mesAnio}`,
        description: `Analisis del mercado de alquiler de Equipetrol con ${kpis.totalUnidades} departamentos activos. Renta mediana: Bs ${kpis.rentaMedianaBs}/mes. Incluye cortes por amoblado (por tipologia), equipado y parqueo con su tamano de muestra, y rotacion del inventario. Actualizado diariamente.`,
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
          { '@type': 'PropertyValue', name: 'Renta mensual mediana en Equipetrol', value: kpis.rentaMedianaBs, unitText: 'BOB/mes' },
          { '@type': 'PropertyValue', name: 'Departamentos en alquiler en Equipetrol', value: kpis.totalUnidades, unitText: 'unidades' },
          ...(extra?.domAlquiler ? [{ '@type': 'PropertyValue', name: 'Dias publicados del inventario en alquiler (mediana)', value: extra.domAlquiler, unitText: 'dias' }] : []),
          ...tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Renta mediana ${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'} en Equipetrol`,
            value: t.rentaMedianaBs,
            unitText: 'BOB/mes',
          })),
          ...splitTipos.map(t => ({
            '@type': 'PropertyValue',
            name: `Renta mediana ${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'} amoblado en Equipetrol`,
            value: (t.amobladoSi as NonNullable<typeof t.amobladoSi>).medianaBs,
            unitText: 'BOB/mes',
          })),
          ...zonas.map(z => ({
            '@type': 'PropertyValue',
            name: `Renta mediana en ${z.zonaDisplay}, Equipetrol`,
            value: z.rentaMedianaBs,
            unitText: 'BOB/mes',
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
          acceptedAnswer: { '@type': 'Answer', text: `${f.a} Fuente: simonbo.com/mercado/equipetrol/alquileres.` },
        })),
      },
    ],
  }

  // Drill de tipologías: rango en Bs + split amoblado (solo cortes con n>=5)
  const drillItems: TipologiaItem[] = tipologias.map(t => ({
    key: String(t.dormitorios),
    label: DORM_LABELS[t.dormitorios] || `${t.dormitorios} dormitorios`,
    sub: `${t.unidades} avisos`,
    valor: fmtBs(t.rentaMedianaBs),
    rangos: [
      {
        min: t.rentaP25Bs,
        med: t.rentaMedianaBs,
        max: t.rentaP75Bs,
        fmt: fmtBs,
        cap: 'Rango típico (la mitad central de los avisos) · la marca es la mediana',
      },
    ],
    split: [
      ...(t.amobladoSi ? [{ label: 'Amoblado', n: t.amobladoSi.n, valor: fmtBs(t.amobladoSi.medianaBs) }] : []),
      ...(t.sinDeclarar ? [{ label: 'Sin declarar', n: t.sinDeclarar.n, valor: fmtBs(t.sinDeclarar.medianaBs) }] : []),
    ],
    splitCap: t.amobladoSi || t.sinDeclarar
      ? 'Casi nadie declara "sin muebles" — comparamos amoblado vs sin declarar. Cortes con menos de 5 avisos no se publican.'
      : undefined,
    href: `/alquileres?dormitorios=${t.dormitorios}`,
    hrefLabel: `Ver los ${t.unidades} →`,
  }))

  // Lecturas calculadas de la data viva
  const zonasOrd = [...zonas].sort((a, b) => b.rentaMedianaBs - a.rentaMedianaBs)
  const zTop = zonasOrd[0]
  const zBot = zonasOrd[zonasOrd.length - 1]
  const zMasOferta = [...zonas].sort((a, b) => b.unidades - a.unidades)[0]
  const primaMax = primas.length ? primas.reduce((a, b) => (b.diff > a.diff ? b : a)) : null

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

      <div className={`${figtree.variable} ${dmSans.variable} mka`}>
        <article className="mka-wrap">
          <nav className="mka-nav" aria-label="Breadcrumb">
            <Link href="/" className="mka-brand">
              <span className="mka-dot" aria-hidden="true" />
              Simon
              <span className="mka-crumb">Mercado · Equipetrol</span>
            </Link>
            <span className="mka-badge">Actualizado · {fechaCorta}</span>
          </nav>

          {/* Toggle de operación: NAVEGA entre las dos URLs (SEO intacto) */}
          <div className="mka-op" role="navigation" aria-label="Operación">
            <Link href="/mercado/equipetrol/ventas" className="mka-op-off">Comprar</Link>
            <span className="mka-op-on" aria-current="page">Alquilar</span>
          </div>

          <header className="mka-hero">
            <p className="mka-kicker">Renta mensual mediana · departamentos en alquiler</p>
            <h1 className="mka-h1">
              {fmtBs(kpis.rentaMedianaBs)}
              <span className="mka-h1-sub">por mes{usdRef ? ` · ~$${usdRef.toLocaleString('en-US')} al dólar de hoy` : ''}</span>
            </h1>
            <div className="mka-chips">
              <span className="mka-chip flat">● estable en bolivianos</span>
              <span className="mka-chip">{kpis.totalUnidades} deptos{extra?.edificios ? ` · ${extra.edificios} edificios` : ''}</span>
            </div>
            <p className="mka-lead">
              {fmtBs(kpis.rentaMedianaBs)} es la mediana <b>global</b> — mezcla amoblados, tipologías y zonas.
              Tocá tu tipología abajo para comparar igual con igual. El alquiler se publica y se paga en bolivianos.
            </p>
          </header>

          <div className="mka-cards">
            <div className="mka-card">
              <span className="mka-card-l">En oferta</span>
              <span className="mka-card-v num">{kpis.totalUnidades}</span>
              <span className="mka-card-s">{extra?.edificios ? `${extra.edificios} edificios verificados a diario` : 'verificados a diario'}</span>
            </div>
            {extra?.domAlquiler != null && (
              <div className="mka-card">
                <span className="mka-card-l">Rotación</span>
                <span className="mka-card-v num mka-verde">~{extra.domAlquiler} <small>días</small></span>
                <span className="mka-card-s">{extra.domVenta ? `el alquiler rota ${Math.round((extra.domVenta / extra.domAlquiler) * 10) / 10}× más rápido que la venta` : 'mediana publicado'}</span>
              </div>
            )}
            {tcHoy != null && (
              <div className="mka-card">
                <span className="mka-card-l">Dólar hoy</span>
                <span className="mka-card-v num">Bs {tcHoy.toFixed(2).replace('.', ',')}</span>
                <span className="mka-card-s">paralelo Binance</span>
              </div>
            )}
            {extra?.rangoP25 != null && (
              <div className="mka-card">
                <span className="mka-card-l">Entrada</span>
                <span className="mka-card-v num">{fmtBs(extra.rangoP25)}</span>
                <span className="mka-card-s">donde arranca la mitad central (p25)</span>
              </div>
            )}
          </div>

          <section className="mka-sec" aria-labelledby="sec-serie">
            <h2 id="sec-serie" className="mka-h2">¿Hacia dónde va la renta?</h2>
            <p className="mka-sub">Serie histórica en bolivianos</p>
            <div className="mka-obra">
              <b>La serie confiable de alquiler arrancó el 21 de julio de 2026</b> — un punto por noche, en Bs y
              separando amoblados. Con ~30 días de datos la curva aparece acá.
              <small>
                La serie anterior mezclaba régimen de cambio y muestras chicas: preferimos no mostrarla antes que
                mostrar una curva que miente. Lo que sí se sabe: el alquiler se pacta en Bs y se mantuvo estable
                mientras el dólar subía.
              </small>
            </div>
          </section>

          <section className="mka-sec" aria-labelledby="sec-tipo">
            <h2 id="sec-tipo" className="mka-h2">¿Cuánto cuesta el tuyo?</h2>
            <p className="mka-sub">Tocá una tipología para ver el rango típico y el corte amoblado · Bs/mes</p>
            <TipologiaDrill items={drillItems} operacion="alquiler" />
            {primaMax && (
              <Lectura>
                <b>Ojo con el promedio global</b>: los amoblados se concentran en monoambientes (los más baratos),
                así que mezclado parecen más baratos — comparado igual con igual, el amoblado se pide más caro
                (hasta +{fmtBs(primaMax.diff)} en {primaMax.label}). Por eso el corte vive adentro de cada tipología.
              </Lectura>
            )}
          </section>

          {extra && (extra.equipado || extra.conParqueo) && (
            <section className="mka-sec" aria-labelledby="sec-cortes">
              <h2 id="sec-cortes" className="mka-h2">Otros cortes declarados</h2>
              <p className="mka-sub">Medianas globales — cruzan tipologías y zonas: referencia, no prima. Cada una con su n.</p>
              <div className="mka-cards" style={{ paddingBottom: 0 }}>
                {extra.equipado && (
                  <div className="mka-card">
                    <span className="mka-card-l">Equipado</span>
                    <span className="mka-card-v num">{fmtBs(extra.equipado.medianaBs)}</span>
                    <span className="mka-card-s">mediana · {extra.equipado.n} avisos</span>
                  </div>
                )}
                {extra.conParqueo && (
                  <div className="mka-card">
                    <span className="mka-card-l">Con parqueo</span>
                    <span className="mka-card-v num">{fmtBs(extra.conParqueo.medianaBs)}</span>
                    <span className="mka-card-s">mediana · {extra.conParqueo.n} avisos</span>
                  </div>
                )}
              </div>
              <p className="mka-fine">&quot;Sin dato&quot; no significa &quot;no tiene&quot;: solo se cuenta lo que el aviso declara.</p>
            </section>
          )}

          {extra?.domAlquiler != null && extra?.domVenta != null && (
            <section className="mka-sec" aria-labelledby="sec-rot">
              <h2 id="sec-rot" className="mka-h2">Alquilar se mueve al doble de velocidad que vender</h2>
              <p className="mka-sub">Días publicado del inventario vigente (mediana) — stock vigente, no tiempo hasta el contrato</p>
              <div className="mka-rows">
                <div className="mka-row">
                  <span className="mka-row-l">Alquiler</span>
                  <span className="mka-row-track"><i style={{ width: `${Math.round((extra.domAlquiler / extra.domVenta) * 100)}%` }} /></span>
                  <span className="mka-row-v num">{extra.domAlquiler} días</span>
                </div>
                <div className="mka-row">
                  <span className="mka-row-l">Venta</span>
                  <span className="mka-row-track"><i style={{ width: '100%', background: 'rgba(20,20,20,0.35)' }} /></span>
                  <span className="mka-row-v num mka-gris">{extra.domVenta} días</span>
                </div>
              </div>
            </section>
          )}

          <section className="mka-sec" aria-labelledby="sec-zonas">
            <h2 id="sec-zonas" className="mka-h2">Las zonas, comparadas</h2>
            <p className="mka-sub">Bs/mes mediano · más caro arriba · zonas con menos de 5 avisos no se muestran</p>
            <ZonasBars
              items={zonas.filter(z => z.unidades >= 5).map(z => ({
                label: z.zonaDisplay,
                sub: `${z.unidades} avisos`,
                valor: z.rentaMedianaBs,
                valorFmt: fmtBs(z.rentaMedianaBs),
              }))}
            />
            {zTop && zBot && zMasOferta && (
              <Lectura>
                <b>{zMasOferta.zonaDisplay} es la puerta de entrada</b>: la mayor oferta ({zMasOferta.unidades} avisos)
                {zMasOferta.zonaDisplay === zBot.zonaDisplay ? ' y la mediana más baja' : ''}. {zTop.zonaDisplay}, la más
                cara ({fmtBs(zTop.rentaMedianaBs)}), tiene {Math.max(1, Math.round(zMasOferta.unidades / Math.max(1, zTop.unidades)))}× menos opciones.
              </Lectura>
            )}
          </section>

          <section className="mka-sec" aria-labelledby="sec-faq">
            <h2 id="sec-faq" className="mka-h2">Preguntas que responde esta página</h2>
            <FaqAccordion items={faq} />
          </section>

          <footer className="mka-foot">
            <p>
              Metodología: rentas de publicación en bolivianos (la moneda real del contrato); la referencia en
              USD usa el dólar paralelo del día. Cada mediana viaja con su tamaño de muestra y los cortes con
              menos de 5 avisos no se publican. Datos re-verificados cada noche desde Century 21, Remax y Bien
              Inmuebles. No constituye una tasación.
            </p>
            <div className="mka-links">
              <Link href="/mercado/equipetrol/ventas">Ver mercado de ventas</Link>
              <span aria-hidden="true">·</span>
              <Link href="/mercado/equipetrol">Volver al índice</Link>
            </div>
          </footer>
        </article>

        <CtaSticky href="/alquileres" label={`Ver los ${kpis.totalUnidades} alquileres →`} operacion="alquiler" />

        <style jsx>{`
          .mka {
            min-height: 100vh; background: #EDE8DC; color: #141414; font-family: var(--font-dm), 'DM Sans', sans-serif;
            /* Tema claro de los componentes compartidos (components/mercado/) */
            --mx-bg: #EDE8DC;
            --mx-bg-fade: rgba(237, 232, 220, 0.92);
            --mx-text: #141414;
            --mx-dim: rgba(20, 20, 20, 0.66);
            --mx-dim2: rgba(20, 20, 20, 0.45);
            --mx-panel: #F7F4EC;
            --mx-panel2: rgba(20, 20, 20, 0.08);
            --mx-line: rgba(20, 20, 20, 0.1);
            --mx-accent: #2E5539;
            --mx-accent-deep: #3A6A48;
            --mx-bar-deep: #2E5239;
            --mx-bar-a: rgba(58, 106, 72, 0.35);
            --mx-bar-b: rgba(58, 106, 72, 0.7);
            --mx-lectura-bg: rgba(58, 106, 72, 0.1);
            --mx-lectura-border: rgba(58, 106, 72, 0.3);
            --mx-lectura-text: #24422E;
          }
          .mka-wrap { max-width: 760px; margin: 0 auto; padding: 0 20px 110px; }
          .mka-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0; border-bottom: 1px solid rgba(20,20,20,0.1); flex-wrap: wrap; }
          .mka-brand { display: flex; align-items: center; gap: 8px; color: #141414; text-decoration: none; font-weight: 500; font-size: 15px; letter-spacing: 0.3px; }
          .mka-dot { width: 10px; height: 10px; border-radius: 50%; background: #3A6A48; }
          .mka-crumb { color: rgba(20,20,20,0.62); font-size: 13px; font-weight: 400; margin-left: 8px; }
          .mka-badge { font-size: 12px; color: #2E5539; border: 1px solid rgba(58,106,72,0.4); padding: 3px 10px; border-radius: 100px; white-space: nowrap; }
          .mka-op { display: grid; grid-template-columns: 1fr 1fr; background: #F7F4EC; border: 1px solid rgba(20,20,20,0.1); border-radius: 12px; padding: 3px; margin-top: 14px; }
          .mka-op-on { padding: 9px 0; border-radius: 9px; font-size: 13.5px; font-weight: 600; text-align: center; background: #3A6A48; color: #F2EFE6; }
          .mka-op :global(.mka-op-off) { padding: 9px 0; border-radius: 9px; font-size: 13.5px; font-weight: 500; text-align: center; color: rgba(20,20,20,0.62); text-decoration: none; }
          .mka-op :global(.mka-op-off:hover) { color: #141414; }
          .mka-hero { padding: 26px 0 20px; border-bottom: 1px solid rgba(20,20,20,0.1); }
          .mka-kicker { margin: 0 0 8px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(20,20,20,0.66); }
          .mka-h1 { margin: 0; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: clamp(36px, 8vw, 52px); font-weight: 600; letter-spacing: -1px; line-height: 1.05; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; color: #141414; font-variant-numeric: tabular-nums; }
          .mka-h1-sub { font-family: var(--font-dm), 'DM Sans', sans-serif; font-size: 15px; font-weight: 400; letter-spacing: 0; color: rgba(20,20,20,0.68); }
          .mka-chips { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          .mka-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; padding: 5px 10px; border-radius: 999px; background: #F7F4EC; border: 1px solid rgba(20,20,20,0.1); color: rgba(20,20,20,0.66); font-variant-numeric: tabular-nums; }
          .mka-chip.flat { color: #2E5539; border-color: rgba(58,106,72,0.35); }
          .mka-lead { margin: 14px 0 0; font-size: 14px; color: rgba(20,20,20,0.68); line-height: 1.6; max-width: 560px; }
          .mka-lead b { color: #141414; font-weight: 500; }
          .num { font-variant-numeric: tabular-nums; }
          .mka-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 18px 0 26px; }
          @media (min-width: 640px) { .mka-cards { grid-template-columns: repeat(4, 1fr); } }
          .mka-card { background: #F7F4EC; border: 1px solid rgba(20,20,20,0.08); border-radius: 14px; padding: 13px 14px; display: flex; flex-direction: column; gap: 4px; }
          .mka-card-l { font-size: 10.5px; letter-spacing: 1.3px; text-transform: uppercase; color: rgba(20,20,20,0.66); }
          .mka-card-v { font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 22px; font-weight: 600; color: #141414; letter-spacing: -0.02em; }
          .mka-card-v small { font-size: 12px; font-weight: 400; color: rgba(20,20,20,0.62); }
          .mka-verde { color: #2E5539; }
          .mka-card-s { font-size: 12px; color: rgba(20,20,20,0.62); line-height: 1.4; }
          .mka-sec { padding: 22px 0; border-top: 1px solid rgba(20,20,20,0.1); }
          .mka-h2 { margin: 0 0 3px; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 17px; font-weight: 600; color: #141414; }
          .mka-sub { margin: 0 0 4px; font-size: 12.5px; color: rgba(20,20,20,0.66); line-height: 1.5; }
          .mka-obra { background: #F7F4EC; border: 1px dashed rgba(20,20,20,0.2); border-radius: 14px; padding: 18px 16px; font-size: 13px; color: rgba(20,20,20,0.75); line-height: 1.55; margin-top: 12px; }
          .mka-obra b { color: #141414; font-weight: 500; }
          .mka-obra small { display: block; margin-top: 8px; font-size: 12px; color: rgba(20,20,20,0.6); line-height: 1.5; }
          .mka-rows { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
          .mka-row { display: grid; grid-template-columns: 76px 1fr 72px; gap: 10px; align-items: center; }
          .mka-row-l { font-size: 12.5px; color: rgba(20,20,20,0.75); text-align: right; }
          .mka-row-track { display: block; height: 18px; background: rgba(20,20,20,0.06); border-radius: 4px; overflow: hidden; }
          .mka-row-track i { display: block; height: 100%; background: #3A6A48; border-radius: 4px; }
          .mka-row-v { font-size: 13px; font-weight: 500; color: #141414; text-align: right; }
          .mka-gris { color: rgba(20,20,20,0.72); }
          .mka-fine { margin: 10px 0 0; font-size: 12px; color: rgba(20,20,20,0.62); line-height: 1.6; }
          .mka-foot { border-top: 1px solid rgba(20,20,20,0.1); padding-top: 18px; margin-top: 4px; }
          .mka-foot p { margin: 0 0 10px; font-size: 12px; color: rgba(20,20,20,0.62); line-height: 1.7; }
          .mka-links { display: flex; flex-wrap: wrap; gap: 10px; font-size: 13px; color: rgba(20,20,20,0.62); }
          .mka-links :global(a) { color: #2E5539; text-decoration: underline; text-underline-offset: 3px; }
        `}</style>
      </div>
    </>
  )
}

export const getStaticProps: GetStaticProps<{
  kpis: Awaited<ReturnType<typeof fetchMercadoAlquilerData>>['kpis']
  tipologias: Awaited<ReturnType<typeof fetchMercadoAlquilerData>>['tipologias']
  zonas: Awaited<ReturnType<typeof fetchMercadoAlquilerData>>['zonas']
  generatedAt: string
  extra: AlquilerShadowExtra | null
  tcHoy: number | null
}> = async () => {
  const [data, extra, tcRes] = await Promise.all([
    fetchMercadoAlquilerData(),
    fetchAlquilerShadowExtra(),
    supabase
      ? supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single()
      : Promise.resolve({ data: null }),
  ])
  const tcHoy = tcRes?.data ? parseFloat((tcRes.data as { valor: string }).valor) || null : null
  const { kpis, tipologias, zonas, generatedAt } = data
  return {
    props: { kpis, tipologias, zonas, generatedAt, extra, tcHoy },
    revalidate: 21600,
  }
}
