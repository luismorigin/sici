// /mercado/equipetrol — hub del mercado (rediseño 21-jul-2026, "dos puertas").
// Fondo negro; la card de alquileres flota en arena. Concepto: un mercado,
// dos monedas, una fuente — y la franja del yield cuenta el cruce.
//
// 🔑 TEXTOS CONDICIONALES (pedido explícito del founder: "¿los textos cambian
// cuando cambien las condiciones?"): toda frase interpretativa se CALCULA en
// getStaticProps con su condición y su fallback neutro. Si la data deja de
// cumplir la condición, la frase cambia o desaparece sola en el próximo build.
//  - "la zona más barata es la que más rinde" → solo si argmin(precio) ==
//    argmax(yield); si no, fallback descriptivo del rango.
//  - chips de variación (USD/Bs) → número vivo con signo; la banda "−12 a −17%"
//    solo se muestra mientras la caída siga dentro de la banda del método.
//  - el chip "estable en Bs" del mockup se ELIMINÓ: no hay serie de rentas que
//    lo respalde (regla: ninguna afirmación sin data detrás).
//
// Animaciones (CSS puro + contador rAF): entrada escalonada, curvas que se
// dibujan (stroke-dashoffset), números que cuentan, punto "vivo" que late,
// barra de yield que crece. Todo respeta prefers-reduced-motion, y el HTML
// server-rendered lleva los números finales (AEO intacto: los agentes leen los
// valores aunque nunca corra el JS).
import Head from 'next/head'
import { useEffect, useRef } from 'react'
import type { GetStaticProps, InferGetStaticPropsType } from 'next'
import { Figtree, DM_Sans } from 'next/font/google'
import { fetchMercadoData } from '@/lib/mercado-data'
import { fetchMercadoAlquilerData } from '@/lib/mercado-alquiler-data'
import { fetchSerieMensualVentas, fetchVentasShadowExtra } from '@/lib/mercado-shadow-data'
import { supabase } from '@/lib/supabase'

const figtree = Figtree({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-figtree', display: 'optional' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-dm', display: 'optional' })

function formatMesAnio(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const mes = d.toLocaleDateString('es-BO', { month: 'long' })
  return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + d.getFullYear()
}

function formatFechaCorta(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** proyecta una serie a puntos de polyline en un viewBox de 260x64 */
function sparkPoints(vals: number[]): string {
  if (vals.length < 2) return ''
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => 6 + (i / (vals.length - 1)) * 248
  const y = (v: number) => 10 + (1 - (v - min) / span) * 44
  return vals.map((v, i) => `${Math.round(x(i))},${Math.round(y(v))}`).join(' ')
}

/** contador animado (rAF); respeta prefers-reduced-motion; el SSR ya trae el valor final */
function useCountUp(target: number, fmtFn: (v: number) => string, delayMs: number) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const timer = window.setTimeout(() => {
      const t0 = performance.now()
      const dur = 1400
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = fmtFn(Math.round(target * eased))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, delayMs)
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return ref
}

export default function MercadoEquipetrolHub({
  venta,
  alquiler,
  fechaActualizacion,
  generatedAt,
  sparkUsd,
  sparkBs,
  sparkAlq,
  copy,
  tcHoy,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const mesAnio = formatMesAnio(fechaActualizacion)
  const fechaCorta = formatFechaCorta(fechaActualizacion)
  const url = 'https://simonbo.com/mercado/equipetrol'

  const title = `Mercado Inmobiliario Equipetrol: Ventas y Alquileres — ${mesAnio} | Simon`
  const description = `Inteligencia de mercado inmobiliario en Equipetrol, Santa Cruz, Bolivia. Ventas: ${venta.total} departamentos, $${venta.m2}/m2. Alquileres: ${alquiler.total} unidades, Bs ${alquiler.rentaBs}/mes. Datos actualizados ${fechaCorta}.`

  const usdRef = useCountUp(venta.m2, v => '$' + v.toLocaleString('en-US'), 350)
  const bsRef = useCountUp(alquiler.rentaBs, v => 'Bs ' + v.toLocaleString('es-BO'), 550)

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
              text: `El precio mediano del metro cuadrado en Equipetrol es de $${venta.m2.toLocaleString('en-US')} USD (${mesAnio}), con ${venta.total} departamentos en venta. Para alquiler, la renta mediana es Bs ${alquiler.rentaBs.toLocaleString('es-BO')}/mes con ${alquiler.total} unidades disponibles. Fuente: simonbo.com/mercado/equipetrol.`,
            },
          },
          ...(copy.roiMin != null && copy.roiMax != null
            ? [{
                '@type': 'Question',
                name: 'Cuanto rinde un departamento en alquiler en Equipetrol?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: `${copy.yieldFrase} Rendimiento bruto anual (renta ÷ precio de compra), sin descontar expensas ni vacancia. Fuente: simonbo.com/mercado/equipetrol.`,
                },
              }]
            : []),
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaGraph) }} />
      </Head>

      <div className={`${figtree.variable} ${dmSans.variable} hub`}>
        <div className="hub-wrap">
          <nav className="hub-nav hub-in" aria-label="Breadcrumb">
            <a href="/" className="hub-brand">
              <span className="hub-dot" aria-hidden="true" />
              Simon
              <span className="hub-crumb">Mercado · Equipetrol</span>
            </a>
            <div className="hub-meta">
              <span className="hub-vivo"><span className="hub-pulse" aria-hidden="true" />medido cada noche</span>
              {tcHoy != null && <span>Dólar hoy <strong>Bs {tcHoy.toFixed(2).replace('.', ',')}</strong></span>}
            </div>
          </nav>

          <header className="hub-hero hub-in hub-d1">
            <p className="hub-kicker">Un mercado · dos monedas · una fuente</p>
            <h1 className="hub-h1">Lo que pide Equipetrol hoy, y cómo llegó hasta acá</h1>
            <p className="hub-lead">
              Cada aviso re-leído todos los días desde Century 21, Remax y Bien Inmuebles.
              Precios de publicación, con su historia en dólares y en bolivianos.
            </p>
          </header>

          <div className="hub-doors">
            <a href="/mercado/equipetrol/ventas" className="hub-card hub-card-dark hub-in hub-d2" aria-label="Mercado de ventas en Equipetrol">
              <div className="hub-card-top">
                <span className="hub-card-tag">Ventas</span>
                <span className="hub-card-n">{venta.total} avisos activos</span>
              </div>
              <div className="hub-num">
                <span ref={usdRef} className="hub-big">{'$' + venta.m2.toLocaleString('en-US')}</span>
                <span className="hub-big-sub">USD/m² mediana</span>
              </div>
              {sparkUsd && (
                <svg viewBox="0 0 260 64" className="hub-spark-box" role="img" aria-label="Evolución del precio en dólares y en bolivianos, enero a julio">
                  <title>Precio del m²: USD (línea llena) vs Bs (punteada)</title>
                  <polyline className="hub-draw" points={sparkUsd} fill="none" stroke="#EDE8DC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {sparkBs && <polyline className="hub-draw hub-draw-2" points={sparkBs} fill="none" stroke="#7FB08A" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />}
                </svg>
              )}
              <div className="hub-chips">
                <span className="hub-chip hub-chip-crema">{copy.chipUsd}</span>
                <span className="hub-chip hub-chip-verde">{copy.chipBs}</span>
              </div>
              <span className="hub-cta">Ver el análisis completo <span aria-hidden="true">→</span></span>
            </a>

            <a href="/mercado/equipetrol/alquileres" className="hub-card hub-card-arena hub-in hub-d3" aria-label="Mercado de alquileres en Equipetrol">
              <div className="hub-card-top">
                <span className="hub-card-tag hub-t-dark">Alquileres</span>
                <span className="hub-card-n hub-t-dark2">{alquiler.total} avisos activos</span>
              </div>
              <div className="hub-num">
                <span ref={bsRef} className="hub-big hub-big-dark">{'Bs ' + alquiler.rentaBs.toLocaleString('es-BO')}</span>
                <span className="hub-big-sub hub-t-dark2">por mes mediana</span>
              </div>
              {sparkAlq && (
                <svg viewBox="0 0 260 64" className="hub-spark-box" role="img" aria-label="Renta mediana por tipología">
                  <title>Renta mediana por tipología (de mono a 3 dormitorios)</title>
                  <polyline className="hub-draw hub-draw-2" points={sparkAlq} fill="none" stroke="#3A6A48" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <div className="hub-chips">
                {copy.chipRotacion && <span className="hub-chip hub-chip-salvia">{copy.chipRotacion}</span>}
                {copy.chipRango && <span className="hub-chip hub-chip-gris">{copy.chipRango}</span>}
              </div>
              <span className="hub-cta hub-cta-dark">Ver el análisis completo <span aria-hidden="true">→</span></span>
            </a>
          </div>

          {copy.roiMin != null && copy.roiMax != null && (
            <section className="hub-yield hub-in hub-d4" aria-label="Rendimiento de alquiler">
              <div className="hub-yield-head">
                <span className="hub-yield-t">Donde los dos mercados se cruzan: el rendimiento</span>
                <span className="hub-yield-s">bruto anual · 1 dormitorio · por zona</span>
              </div>
              <div className="hub-yield-bar">
                <span>{copy.roiMin.toFixed(1).replace('.', ',')}%</span>
                <div className="hub-track"><div className="hub-fill" style={{ width: `${Math.round((copy.roiMin / copy.roiMax) * 100)}%` }} /></div>
                <span className="hub-yield-max">hasta {copy.roiMax.toFixed(1).replace('.', ',')}%</span>
              </div>
              <p className="hub-yield-note">{copy.yieldFrase} Renta anual ÷ precio de compra, sin expensas ni vacancia.</p>
            </section>
          )}

          <footer className="hub-foot hub-in hub-d5">
            <span>Century 21 · Remax · Bien Inmuebles</span>
            <span>Precios de oferta, no de cierre · serie desde enero 2026</span>
          </footer>
        </div>

        <style jsx>{`
          @keyframes hubUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes hubDraw { to { stroke-dashoffset: 0; } }
          @keyframes hubPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
          @keyframes hubGrow { from { width: 0; } }
          .hub { min-height: 100vh; background: #141414; color: #EDE8DC; font-family: var(--font-dm), 'DM Sans', sans-serif; }
          .hub-wrap { max-width: 860px; margin: 0 auto; padding: 0 20px 40px; }
          .hub-in { opacity: 0; animation: hubUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .hub-d1 { animation-delay: 0.1s; }
          .hub-d2 { animation-delay: 0.25s; }
          .hub-d3 { animation-delay: 0.4s; }
          .hub-d4 { animation-delay: 0.55s; }
          .hub-d5 { animation-delay: 0.7s; }
          .hub-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 0; border-bottom: 1px solid rgba(237,232,220,0.09); flex-wrap: wrap; }
          .hub-brand { display: flex; align-items: center; gap: 8px; color: #EDE8DC; text-decoration: none; font-weight: 500; font-size: 15px; }
          .hub-dot { width: 10px; height: 10px; border-radius: 50%; background: #3A6A48; }
          .hub-crumb { color: rgba(237,232,220,0.4); font-size: 13px; font-weight: 400; margin-left: 8px; }
          .hub-meta { display: flex; align-items: center; gap: 14px; font-size: 11.5px; color: rgba(237,232,220,0.55); flex-wrap: wrap; }
          .hub-meta strong { font-weight: 500; color: #EDE8DC; }
          .hub-vivo { display: inline-flex; align-items: center; gap: 6px; }
          .hub-pulse { width: 7px; height: 7px; border-radius: 50%; background: #7FB08A; animation: hubPulse 2.2s ease-in-out infinite; }
          .hub-hero { padding: 30px 0 6px; text-align: center; }
          .hub-kicker { margin: 0 0 8px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: rgba(237,232,220,0.45); }
          .hub-h1 { margin: 0 auto; font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: clamp(21px, 4vw, 26px); font-weight: 600; color: #EDE8DC; max-width: 480px; line-height: 1.3; }
          .hub-lead { margin: 10px auto 0; font-size: 12.5px; color: rgba(237,232,220,0.45); max-width: 440px; line-height: 1.65; }
          .hub-doors { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; padding: 22px 0; }
          .hub-card { display: block; border-radius: 14px; padding: 20px; text-decoration: none; transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s; }
          .hub-card:hover { transform: translateY(-4px); }
          .hub-card-dark { background: #1b1b1b; border: 1px solid rgba(237,232,220,0.12); }
          .hub-card-dark:hover { border-color: rgba(237,232,220,0.28); }
          .hub-card-arena { background: #EDE8DC; border: 1px solid #EDE8DC; }
          .hub-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
          .hub-card-tag { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(237,232,220,0.5); }
          .hub-card-n { font-size: 11px; color: rgba(237,232,220,0.4); }
          .hub-t-dark { color: rgba(20,20,20,0.55); }
          .hub-t-dark2 { color: rgba(20,20,20,0.5); }
          .hub-num { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
          .hub-big { font-family: var(--font-figtree), 'Figtree', sans-serif; font-size: 38px; font-weight: 600; color: #EDE8DC; letter-spacing: -1px; }
          .hub-big-dark { color: #141414; }
          .hub-big-sub { font-size: 13px; color: rgba(237,232,220,0.5); }
          .hub-spark-box { display: block; width: 100%; height: 64px; margin: 12px 0 6px; }
          .hub-draw { stroke-dasharray: 340; stroke-dashoffset: 340; animation: hubDraw 1.6s cubic-bezier(0.4, 0, 0.2, 1) 0.5s forwards; }
          .hub-draw-2 { animation-delay: 0.8s; }
          .hub-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
          .hub-chip { font-size: 11px; padding: 3px 9px; border-radius: 100px; }
          .hub-chip-crema { color: #EDE8DC; background: rgba(237,232,220,0.08); }
          .hub-chip-verde { color: #9DBF9E; background: rgba(58,106,72,0.18); }
          .hub-chip-salvia { color: #2E5539; background: rgba(58,106,72,0.14); }
          .hub-chip-gris { color: rgba(20,20,20,0.6); background: rgba(20,20,20,0.06); }
          .hub-cta { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #9DBF9E; }
          .hub-cta-dark { color: #2E5539; }
          .hub-yield { margin: 0 0 20px; background: rgba(58,106,72,0.13); border-radius: 12px; padding: 16px 18px; }
          .hub-yield-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
          .hub-yield-t { font-size: 13px; font-weight: 500; color: #B9CDB9; }
          .hub-yield-s { font-size: 11.5px; color: rgba(237,232,220,0.45); }
          .hub-yield-bar { display: flex; align-items: center; gap: 10px; font-size: 12px; color: rgba(237,232,220,0.55); }
          .hub-track { flex: 1; height: 10px; background: rgba(237,232,220,0.08); border-radius: 5px; overflow: hidden; }
          .hub-fill { height: 100%; background: #3A6A48; border-radius: 5px; animation: hubGrow 1.2s cubic-bezier(0.16, 1, 0.3, 1) 1s backwards; }
          .hub-yield-max { font-weight: 500; color: #9DBF9E; }
          .hub-yield-note { margin: 8px 0 0; font-size: 11.5px; color: rgba(237,232,220,0.4); line-height: 1.6; }
          .hub-foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 11px; color: rgba(237,232,220,0.35); padding-top: 4px; }
          @media (prefers-reduced-motion: reduce) {
            .hub-in, .hub-fill { animation: none; opacity: 1; }
            .hub-draw, .hub-draw-2 { animation: none; stroke-dashoffset: 0; }
            .hub-pulse { animation: none; }
            .hub-card, .hub-card:hover { transition: none; transform: none; }
          }
        `}</style>
      </div>
    </>
  )
}

/** normaliza para comparar nombres de zona entre fuentes (tildes/case) */
function normZona(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export const getStaticProps: GetStaticProps<{
  venta: { total: number; m2: number }
  alquiler: { total: number; rentaBs: number }
  fechaActualizacion: string
  generatedAt: string
  sparkUsd: string | null
  sparkBs: string | null
  sparkAlq: string | null
  copy: {
    chipUsd: string
    chipBs: string
    chipRotacion: string | null
    chipRango: string | null
    yieldFrase: string
    roiMin: number | null
    roiMax: number | null
  }
  tcHoy: number | null
}> = async () => {
  const [ventaData, alquilerData, serie, extra, tcRes] = await Promise.all([
    fetchMercadoData(),
    fetchMercadoAlquilerData(),
    fetchSerieMensualVentas(),
    fetchVentasShadowExtra(),
    supabase
      ? supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single()
      : Promise.resolve({ data: null }),
  ])
  const tcHoy = tcRes?.data ? parseFloat((tcRes.data as { valor: string }).valor) || null : null

  // ── Textos condicionales: se calculan acá, con condición + fallback ──
  const mesIni = serie?.puntos[0]?.mes.toLowerCase() || 'enero'

  // Chip USD: la banda −12 a −17% es la conclusión del análisis de métodos
  // (migs 287/288) y SOLO se muestra mientras la variación medida caiga dentro
  // de ella; si la serie se sale de la banda, cae al número vivo con signo.
  const varUsd = serie?.varUsdPct ?? null
  const chipUsd =
    varUsd == null ? 'serie histórica en USD'
    : varUsd <= -12 && varUsd >= -17 ? `USD −12 a −17% desde ${mesIni}`
    : `USD ${varUsd > 0 ? '+' : ''}${varUsd.toFixed(0)}% desde ${mesIni}`

  const varBs = serie?.varBsPct ?? null
  const chipBs =
    varBs == null ? 'también en bolivianos'
    : Math.abs(varBs) < 3 ? 'en Bs casi sin cambio'
    : `en Bs ${varBs > 0 ? '+' : '−'}${Math.abs(varBs).toFixed(0)}%`

  const chipRotacion = extra?.domAlquiler != null ? `rota en ~${extra.domAlquiler} días` : null
  const chipRango = null // el rango típico vive en la página hija; acá no aporta

  // Yield: la frase "la zona más barata es la que más rinde" SOLO si es cierta
  // en este build (argmin precio == argmax roi); si no, fallback descriptivo.
  const yz = extra?.yieldZonas || []
  const roiMin = yz.length ? yz[yz.length - 1].roi : null
  const roiMax = yz.length ? yz[0].roi : null
  let yieldFrase = 'El rendimiento varía según la zona.'
  if (yz.length && ventaData.zonas.length && roiMin != null && roiMax != null) {
    const zonaMasBarata = [...ventaData.zonas].sort((a, b) => a.precioMediano - b.precioMediano)[0]
    const zonaTopYield = yz[0]
    yieldFrase =
      normZona(zonaMasBarata.zonaDisplay) === normZona(zonaTopYield.zona)
        ? `La zona más barata para comprar es hoy la que más rinde (${zonaTopYield.zona}, ${roiMax.toFixed(1).replace('.', ',')}%).`
        : `El rendimiento va de ${roiMin.toFixed(1).replace('.', ',')}% a ${roiMax.toFixed(1).replace('.', ',')}% según la zona; el más alto hoy es ${zonaTopYield.zona}.`
  }

  // Sparklines desde la serie real (USD y Bs) y las rentas por tipología
  const sparkUsd = serie ? sparkPoints(serie.puntos.map(p => p.usd_m2)) : null
  // Bs comparte eje visual con USD vía base-100 (misma escala relativa)
  const base = serie?.puntos[0]
  const sparkBs = serie && base
    ? sparkPoints(serie.puntos.map(p => (p.usd_m2 && base.bs_m2 ? (p.bs_m2 / base.bs_m2) * base.usd_m2 : p.usd_m2)))
    : null
  const rentas = alquilerData.tipologias.map(t => t.rentaMedianaBs)
  const sparkAlq = rentas.length >= 2 ? sparkPoints(rentas) : null

  return {
    props: {
      venta: { total: ventaData.kpis.totalPropiedades, m2: ventaData.kpis.medianaPrecioM2 },
      alquiler: { total: alquilerData.kpis.totalUnidades, rentaBs: alquilerData.kpis.rentaMedianaBs },
      fechaActualizacion: ventaData.kpis.fechaActualizacion,
      generatedAt: ventaData.generatedAt,
      sparkUsd,
      sparkBs,
      sparkAlq,
      copy: { chipUsd, chipBs, chipRotacion, chipRango, yieldFrase, roiMin, roiMax },
      tcHoy,
    },
    revalidate: 21600,
  }
}
