// /mercado/equipetrol/alquileres — página SEO/AEO de mercado (rediseño 21-jul,
// lanzamiento TC nuevo). Arena como el feed /alquileres (brand v1.4).
//
// Principios (mismos que la gemela de ventas, ver header ahí): AEO con tablas
// HTML gemelas + FAQ visible espejo del schema; fiduciario: el alquiler manda
// en BOLIVIANOS (la moneda real del contrato), el USD es referencia al dólar
// del día; cada mediana viaja con su n; "sin dato ≠ no tiene" (regla de flags,
// solo el positivo declarado). Cortes vivos de las vistas shadow.
import Head from 'next/head'
import Link from 'next/link'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Figtree, DM_Sans } from 'next/font/google'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { fetchAlquilerShadowExtra, type AlquilerShadowExtra } from '@/lib/mercado-shadow-data'
import { supabase } from '@/lib/supabase'

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

  const title = `Alquiler en Equipetrol: Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')}/mes mediana — ${mesAnio} | Simon`
  const description = `Cuanto cuesta alquilar un departamento en Equipetrol, Santa Cruz, Bolivia? Renta mediana: Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')}/mes. ${kpis.totalUnidades} departamentos disponibles. Datos actualizados ${fechaCorta}. Fuente: Simon Inteligencia Inmobiliaria.`

  const faq: Array<{ q: string; a: string }> = [
    {
      q: '¿Cuánto cuesta alquilar un departamento en Equipetrol?',
      a: `Bs ${kpis.rentaMedianaBs.toLocaleString('es-BO')} por mes de mediana (${mesAnio})${usdRef ? `, unos $${usdRef.toLocaleString('en-US')} al dólar de hoy` : ''}. ${tipologias.length ? tipologias.map(t => `${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'}: ${fmtBs(t.rentaMedianaBs)}`).join(' · ') + '.' : ''} El alquiler en Equipetrol se publica y se paga en bolivianos.`,
    },
    {
      q: '¿El alquiler subió con el dólar?',
      a: 'El alquiler se pacta en bolivianos y se mantuvo relativamente estable durante 2026. Medido en dólares bajó, porque el dólar paralelo subió en el año — es efecto cambiario, no una caída de las rentas.',
    },
    ...(extra?.amoblado
      ? [{
          q: '¿Conviene amoblar para alquilar?',
          a: `${extra.amoblado.n} de ${kpis.totalUnidades} avisos activos son amoblados (mediana ${fmtBs(extra.amoblado.medianaBs)}). Con la oferta actual, el amoblado no muestra una prima clara de precio: pesan más el tamaño y la zona. "Sin dato" no significa "no amoblado" — solo se cuenta lo que el aviso declara.`,
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
        description: `Analisis del mercado de alquiler de Equipetrol con ${kpis.totalUnidades} departamentos activos. Renta mediana: Bs ${kpis.rentaMedianaBs}/mes. Incluye cortes por amoblado, equipado y parqueo con su tamano de muestra, y rotacion del inventario. Actualizado diariamente.`,
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
          ...(extra?.amoblado ? [{ '@type': 'PropertyValue', name: 'Renta mediana de departamentos amoblados en Equipetrol', value: extra.amoblado.medianaBs, unitText: 'BOB/mes' }] : []),
          ...tipologias.map(t => ({
            '@type': 'PropertyValue',
            name: `Renta mediana ${DORM_LABELS[t.dormitorios] || t.dormitorios + 'D'} en Equipetrol`,
            value: t.rentaMedianaBs,
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

  const maxRenta = tipologias.length ? Math.max(...tipologias.map(t => t.rentaMedianaBs)) : 1

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
              <span className="mka-crumb">Mercado · Alquileres · Equipetrol</span>
            </Link>
            <span className="mka-badge">Actualizado · {fechaCorta}</span>
          </nav>

          <header className="mka-hero">
            <p className="mka-kicker">Renta mensual mediana · departamentos en alquiler</p>
            <h1 className="mka-h1">
              {fmtBs(kpis.rentaMedianaBs)}
              <span className="mka-h1-sub">por mes{usdRef ? ` · ~$${usdRef.toLocaleString('en-US')} al dólar de hoy` : ''}</span>
            </h1>
            <p className="mka-lead">
              {kpis.totalUnidades} departamentos verificados diariamente
              {extra?.edificios ? ` en ${extra.edificios} edificios` : ''}. El alquiler en Equipetrol se
              publica y se paga en bolivianos — la referencia en dólares es informativa.
            </p>
          </header>

          <div className="mka-cards">
            <div className="mka-card">
              <span className="mka-card-l">En oferta</span>
              <span className="mka-card-v">{kpis.totalUnidades}</span>
              <span className="mka-card-s">{extra?.edificios ? `en ${extra.edificios} edificios` : 'departamentos'}</span>
            </div>
            {extra?.domAlquiler != null && (
              <div className="mka-card">
                <span className="mka-card-l">Rotación</span>
                <span className="mka-card-v mka-verde">~{extra.domAlquiler} días</span>
                <span className="mka-card-s">{extra.domVenta ? `venta: ~${extra.domVenta} días` : 'mediana publicado'}</span>
              </div>
            )}
            {extra?.amoblado && (
              <div className="mka-card">
                <span className="mka-card-l">Amobladas</span>
                <span className="mka-card-v">{extra.amoblado.n}</span>
                <span className="mka-card-s">de {kpis.totalUnidades} avisos</span>
              </div>
            )}
            {extra?.rangoP25 != null && extra?.rangoP75 != null && (
              <div className="mka-card">
                <span className="mka-card-l">Rango típico</span>
                <span className="mka-card-v">{extra.rangoP25.toLocaleString('es-BO')}–{extra.rangoP75.toLocaleString('es-BO')}</span>
                <span className="mka-card-s">Bs · p25–p75</span>
              </div>
            )}
          </div>

          <section className="mka-sec" aria-labelledby="sec-tipo">
            <h2 id="sec-tipo" className="mka-h2">Renta mediana por tipología</h2>
            <p className="mka-sub">Bolivianos por mes · inventario activo</p>
            <div className="mka-rows">
              {tipologias.map(t => (
                <div className="mka-row" key={t.dormitorios}>
                  <span className="mka-row-l">{DORM_LABELS[t.dormitorios] || `${t.dormitorios}D`}</span>
                  <span className="mka-row-track"><i style={{ width: `${Math.round((t.rentaMedianaBs / maxRenta) * 100)}%` }} /></span>
                  <span className="mka-row-v">{fmtBs(t.rentaMedianaBs)}</span>
                </div>
              ))}
            </div>
            <table className="mka-table" aria-label="Rentas por tipología">
              <thead>
                <tr><th>Tipología</th><th>Unidades</th><th>Mediana</th><th>Rango típico (Bs)</th><th>Bs/m²</th></tr>
              </thead>
              <tbody>
                {tipologias.map(t => (
                  <tr key={t.dormitorios}>
                    <td>{DORM_LABELS[t.dormitorios] || `${t.dormitorios}D`}</td>
                    <td>{t.unidades}</td>
                    <td>{fmtBs(t.rentaMedianaBs)}</td>
                    <td className="mka-nowrap">{t.rentaP25Bs.toLocaleString('es-BO')} – {t.rentaP75Bs.toLocaleString('es-BO')}</td>
                    <td>{t.bsM2Mediana}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {extra && (extra.amoblado || extra.equipado || extra.conParqueo) && (
            <section className="mka-sec" aria-labelledby="sec-cortes">
              <h2 id="sec-cortes" className="mka-h2">Qué encarece un alquiler</h2>
              <p className="mka-sub">Cortes con su tamaño de muestra — cada mediana dice de cuántos avisos sale</p>
              <div className="mka-cards" style={{ paddingBottom: 0 }}>
                {extra.amoblado && (
                  <div className="mka-card">
                    <span className="mka-card-l">Amoblado</span>
                    <span className="mka-card-v">{fmtBs(extra.amoblado.medianaBs)}</span>
                    <span className="mka-card-s">mediana · {extra.amoblado.n} avisos</span>
                  </div>
                )}
                {extra.equipado && (
                  <div className="mka-card">
                    <span className="mka-card-l">Equipado</span>
                    <span className="mka-card-v">{fmtBs(extra.equipado.medianaBs)}</span>
                    <span className="mka-card-s">mediana · {extra.equipado.n} avisos</span>
                  </div>
                )}
                {extra.conParqueo && (
                  <div className="mka-card">
                    <span className="mka-card-l">Con parqueo</span>
                    <span className="mka-card-v">{fmtBs(extra.conParqueo.medianaBs)}</span>
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
                <div className="mka-row mka-row-wide">
                  <span className="mka-row-l">Alquiler</span>
                  <span className="mka-row-track"><i style={{ width: `${Math.round((extra.domAlquiler / extra.domVenta) * 100)}%` }} /></span>
                  <span className="mka-row-v">{extra.domAlquiler} días</span>
                </div>
                <div className="mka-row mka-row-wide">
                  <span className="mka-row-l">Venta</span>
                  <span className="mka-row-track"><i style={{ width: '100%', background: 'rgba(20,20,20,0.35)' }} /></span>
                  <span className="mka-row-v mka-gris">{extra.domVenta} días</span>
                </div>
              </div>
            </section>
          )}

          <section className="mka-sec" aria-labelledby="sec-zonas">
            <h2 id="sec-zonas" className="mka-h2">Rentas por zona</h2>
            <table className="mka-table" aria-label="Rentas por zona">
              <thead>
                <tr><th>Zona</th><th>Unidades</th><th>Renta mediana</th><th>Bs/m²</th></tr>
              </thead>
              <tbody>
                {zonas.map(z => (
                  <tr key={z.zonaDisplay}>
                    <td>{z.zonaDisplay}</td>
                    <td>{z.unidades}</td>
                    <td>{fmtBs(z.rentaMedianaBs)}</td>
                    <td>{z.bsM2Promedio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mka-sec" aria-labelledby="sec-faq">
            <h2 id="sec-faq" className="mka-h2">Preguntas que responde esta página</h2>
            <div className="mka-faq">
              {faq.map(f => (
                <div className="mka-qa" key={f.q}>
                  <h3 className="mka-q">{f.q}</h3>
                  <p className="mka-a">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <footer className="mka-foot">
            <p>
              Metodología: rentas de publicación en bolivianos (la moneda real del contrato); la referencia en
              USD usa el dólar paralelo del día. Cada mediana viaja con su tamaño de muestra. Datos
              re-verificados cada noche desde Century 21, Remax y Bien Inmuebles. No constituye una tasación.
            </p>
            <div className="mka-links">
              <Link href="/mercado/equipetrol/ventas">Ver mercado de ventas</Link>
              <span aria-hidden="true">·</span>
              <Link href="/alquileres">Ver los departamentos en alquiler</Link>
              <span aria-hidden="true">·</span>
              <Link href="/mercado/equipetrol">Volver al índice</Link>
            </div>
          </footer>
        </article>

        <style jsx>{`
          .mka { min-height: 100vh; background: #EDE8DC; color: #141414; font-family: var(--font-dm), 'DM Sans', sans-serif; }
          .mka-wrap { max-width: 760px; margin: 0 auto; padding: 0 20px 48px; }
          .mka-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0; border-bottom: 1px solid rgba(20,20,20,0.1); flex-wrap: wrap; }
          .mka-brand { display: flex; align-items: center; gap: 8px; color: #141414; text-decoration: none; font-weight: 500; font-size: 15px; letter-spacing: 0.3px; }
          .mka-dot { width: 10px; height: 10px; border-radius: 50%; background: #3A6A48; }
          .mka-crumb { color: rgba(20,20,20,0.62); font-size: 13px; font-weight: 400; margin-left: 8px; }
          .mka-badge { font-size: 12px; color: #2E5539; border: 1px solid rgba(58,106,72,0.4); padding: 3px 10px; border-radius: 100px; white-space: nowrap; }
          .mka-hero { padding: 34px 0 22px; }
          .mka-kicker { margin: 0 0 8px; font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(20,20,20,0.66); }
          .mka-h1 { margin: 0; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: clamp(36px, 8vw, 52px); font-weight: 600; letter-spacing: -1px; line-height: 1.05; display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; color: #141414; }
          .mka-h1-sub { font-family: var(--font-dm), 'DM Sans', sans-serif; font-size: 15px; font-weight: 400; letter-spacing: 0; color: rgba(20,20,20,0.68); }
          .mka-lead { margin: 12px 0 0; font-size: 13.5px; color: rgba(20,20,20,0.68); line-height: 1.65; max-width: 560px; }
          .mka-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; padding-bottom: 26px; }
          .mka-card { background: #F7F4EC; border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 3px; }
          .mka-card-l { font-size: 12px; color: rgba(20,20,20,0.66); }
          .mka-card-v { font-size: 20px; font-weight: 500; color: #141414; }
          .mka-verde { color: #2E5539; }
          .mka-card-s { font-size: 12px; color: rgba(20,20,20,0.62); }
          .mka-sec { padding: 22px 0; border-top: 1px solid rgba(20,20,20,0.1); }
          .mka-h2 { margin: 0 0 3px; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 18px; font-weight: 600; color: #141414; }
          .mka-sub { margin: 0 0 14px; font-size: 12.5px; color: rgba(20,20,20,0.66); line-height: 1.5; }
          .mka-rows { display: flex; flex-direction: column; gap: 8px; }
          .mka-row { display: grid; grid-template-columns: 108px 1fr 84px; gap: 10px; align-items: center; }
          .mka-row-wide { grid-template-columns: 76px 1fr 70px; }
          .mka-row-l { font-size: 12.5px; color: rgba(20,20,20,0.75); text-align: right; }
          .mka-row-track { display: block; height: 18px; background: rgba(20,20,20,0.06); border-radius: 4px; overflow: hidden; }
          .mka-row-track i { display: block; height: 100%; background: #3A6A48; border-radius: 4px; }
          .mka-row-v { font-size: 13px; font-weight: 500; color: #141414; }
          .mka-gris { color: rgba(20,20,20,0.72); }
          .mka-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 13px; }
          .mka-table th { text-align: left; font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(20,20,20,0.66); padding: 8px 10px; border-bottom: 1px solid rgba(20,20,20,0.15); }
          .mka-table td { padding: 9px 10px; border-bottom: 1px solid rgba(20,20,20,0.07); color: rgba(20,20,20,0.85); }
          .mka-nowrap { white-space: nowrap; }
          .mka-fine { margin: 10px 0 0; font-size: 12px; color: rgba(20,20,20,0.62); line-height: 1.6; }
          .mka-faq { display: flex; flex-direction: column; gap: 10px; }
          .mka-qa { background: #F7F4EC; border-radius: 8px; padding: 12px 14px; }
          .mka-q { margin: 0 0 4px; font-size: 13.5px; font-weight: 500; color: #141414; font-family: var(--font-dm), 'DM Sans', sans-serif; }
          .mka-a { margin: 0; font-size: 13px; color: rgba(20,20,20,0.7); line-height: 1.65; }
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
