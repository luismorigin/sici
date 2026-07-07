// Landing WhatsApp conversacional — Fase 3 de superficies públicas.
// Port fiel de la maqueta simon-mkt/creativo/landing-rediseno/maqueta-v6-fotografia.html
// ("conversación viva"): chat de Simón como héroe, WhatsApp como puerta grande,
// autoservicio como puerta secundaria, "una casa, dos puertas".
// Datos dinámicos de Supabase (ISR) — NO hardcodear (regla de la maqueta).
// Spec: Frontend-Requests/landing-whatsapp-conversacional.md
import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { GetStaticProps } from 'next'
import { Schibsted_Grotesk } from 'next/font/google'
import { fetchSuperficiesData, aproximado, type SuperficiesMarketData } from '@/lib/superficies-data'

// Tipografía display ORIGINAL de la maqueta v6 (decisión de Lucho: mantenerla
// en esta landing en vez de Figtree). Solo se carga en esta ruta.
const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-schibsted',
  display: 'swap',
})

const SIMON_WHATSAPP = '59177066308'
const WA_URL = `https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent('Hola Simon, quiero buscar departamento en Equipetrol.')}`

const fmt = (n: number) => n.toLocaleString('es-BO')

// Símbolo Norte (tokens simon-brand): círculo + punto salvia
function Norte({ size = 24, sobre = 'arena' }: { size?: number; sobre?: 'arena' | 'negro' }) {
  const circulo = sobre === 'arena' ? '#141414' : '#EDE8DC'
  const inner = sobre === 'arena' ? '#EDE8DC' : '#141414'
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="34" r="28" fill={circulo} />
      <circle cx="32" cy="15" r="6" fill="#3A6A48" />
      <circle cx="32" cy="15" r="3" fill={inner} />
    </svg>
  )
}

// Contador animado: lee el valor final (BD) y anima hacia él al entrar en viewport
function Count({ value, prefix = '' }: { value: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        obs.unobserve(el)
        const dur = 1100
        let start: number | null = null
        const step = (ts: number) => {
          if (start === null) start = ts
          const p = Math.min(1, (ts - start) / dur)
          const eased = 1 - Math.pow(1 - p, 3)
          el.textContent = prefix + fmt(Math.round(value * eased))
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
    }, { threshold: 0.6 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, prefix])
  return <span ref={ref} className="num">{prefix + fmt(value)}</span>
}

export default function LandingWhatsApp({ market }: { market: SuperficiesMarketData }) {
  const [menuOpen, setMenuOpen] = useState(false)

  // ─── Chat-héroe: la conversación se "escribe sola" al entrar en viewport ───
  // visibles = cuántas burbujas se muestran; typing = indicador antes de cada msg de Simón
  const BUBBLES: Array<{ from: 'me' | 'them'; body: React.ReactNode; len: number }> = [
    { from: 'me', len: 60, body: <>Busco depto de 2 dormitorios en Equipetrol, hasta Bs 4.000</> },
    {
      from: 'them', len: 160,
      body: <>Dale. Ahora mismo hay <strong>14</strong> que entran ahí. La renta mediana de la zona es <strong>Bs {fmt(market.medianaAlquilerBob)}</strong>, así que estás justo en mercado — no te están cobrando de más.</>,
    },
    { from: 'them', len: 50, body: <>¿Te armo una lista corta con los que mejor calzan?</> },
    { from: 'me', len: 8, body: <>Sí, dale</> },
    {
      from: 'them', len: 60,
      body: (
        <>
          Listo. Estos 5 son los que más te convienen por precio y zona.
          {/* ILUSTRATIVO (no es CTA): representa simonbo.com/b/{'{hash}'} que el bot genera DENTRO de WhatsApp */}
          <span className="shortlist"><Norte size={15} sobre="arena" /> Ver tu lista →</span>
        </>
      ),
    },
  ]
  const [visibles, setVisibles] = useState(0)
  const [typing, setTyping] = useState(false)
  const [done, setDone] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])
  const playedRef = useRef(false)

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = [] }
  const at = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)) }

  const play = () => {
    clearTimers()
    setDone(false)
    setTyping(false)
    setVisibles(0)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setVisibles(BUBBLES.length); setDone(true); return }

    let i = 0
    let acc = 280 // arranque
    const next = () => {
      if (i >= BUBBLES.length) { at(() => setDone(true), acc + 260); return }
      const b = BUBBLES[i]
      const idx = i
      if (b.from === 'them') {
        at(() => setTyping(true), acc)
        acc += 950
        at(() => { setTyping(false); setVisibles(idx + 1) }, acc)
        acc += Math.min(1500, 520 + b.len * 11) // pausa de lectura proporcional
      } else {
        at(() => setVisibles(idx + 1), acc + 200)
        acc += 200 + 620
      }
      i++
      next()
    }
    next()
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !playedRef.current) {
          playedRef.current = true
          play()
          obs.unobserve(stage)
        }
      })
    }, { threshold: 0.45 })
    obs.observe(stage)
    return () => { obs.disconnect(); clearTimers() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Scroll-reveal (.reveal / .stagger) igual que la maqueta ───
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('.reveal, .stagger')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { els.forEach(el => el.classList.add('in')); return }
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target) }
      })
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div className={`lw ${schibsted.variable}`} ref={rootRef}>
      <Head>
        <title>Simón por WhatsApp — Decile qué buscás y te arma una selección visual</title>
        <meta
          name="description"
          content="Buscá departamento en Equipetrol por WhatsApp. Simón te responde con contexto de mercado y un link visual para comparar con calma."
        />
        <meta name="theme-color" content="#EDE8DC" />
      </Head>

      {/* ─── NAV ─────────────────────────────────────────── */}
      <nav className="nav">
        <div className="wrap nav-in">
          <div className="brand"><Norte size={26} sobre="arena" /> Simón</div>
          <div className="nav-right">
            <div className={`links ${menuOpen ? 'open' : ''}`}>
              <Link href="/alquileres">Alquileres</Link>
              <Link href="/ventas">Ventas</Link>
              <Link href="/mercado/equipetrol">Mercado</Link>
            </div>
            <a href={WA_URL} className="btn btn-primary" target="_blank" rel="noopener noreferrer">Hablar con Simón</a>
            <button
              className="navtoggle"
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO: copy mínimo + chat-héroe ──────────────── */}
      <header className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="hi"><span className="dot" />Equipetrol · actualizado hoy</span>
            <h1>Hola, soy Simón.<br /><span className="soft">Preguntame.</span></h1>
            <p className="lead">
              Conozco cada depto de Equipetrol. Decime qué buscás y te lo cuento sin vueltas — para
              que decidas vos.
            </p>
            <div className="hero-cta">
              <a href={WA_URL} className="btn btn-primary cta-hero" target="_blank" rel="noopener noreferrer">
                Hablar con Simón <span className="arr">→</span>
              </a>
              <a href="#puertas" className="alt">o buscá por tu cuenta</a>
            </div>
            <p className="micro">Gratis. Sin registro. Sin tarjeta.</p>
          </div>

          {/* EL TELÉFONO / CHAT — héroe de la página */}
          <div className={`phone-stage ${done ? 'done' : ''}`} ref={stageRef}>
            <div className="phone">
              <div className="phone-head">
                <div className="avatar"><Norte size={24} sobre="negro" /></div>
                <div>
                  <div className="nm">Simón</div>
                  <div className="st"><span className="d" />en línea</div>
                </div>
              </div>
              <div className="bubbles">
                {BUBBLES.map((b, i) => (
                  <div key={i} className={`b ${b.from} anim ${i < visibles ? 'in' : ''}`}>
                    {b.body}
                  </div>
                ))}
                {typing && (
                  <div className="typing show" aria-label="Simón está escribiendo">
                    <span /><span /><span />
                  </div>
                )}
              </div>
            </div>
            <button className="replay" aria-label="Repetir conversación" title="Repetir" onClick={play}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ─── DOS PUERTAS (corazón) ───────────────────────── */}
      <section className="sec" id="puertas">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-eyebrow">Dos formas de buscar</div>
            <h2>Elegí cómo te gusta buscar.</h2>
            <p className="sub">Es el mismo Simón, los mismos datos. Cambia quién maneja: yo, o vos.</p>
          </div>
          <div className="gates stagger">
            {/* puerta grande */}
            <div className="gate gate-primary">
              <span className="badge"><span className="bdot" />Por WhatsApp · en minutos</span>
              <h3>Hablá conmigo</h3>
              <p className="desc">
                Me decís qué buscás y yo te lo ordeno. Te armo una lista corta de las que más te
                calzan y te conecto directo con quien la tiene.
              </p>
              <ul>
                <li><span className="dt" /><strong>Alquiler o venta, en la misma charla</strong> — no elegís vos primero</li>
                <li><span className="dt" />Te digo si el precio está justo para la zona</li>
                <li><span className="dt" />De la conversación a la lista, sin salir de WhatsApp</li>
              </ul>
              <div className="foot-cta">
                <a href={WA_URL} className="btn btn-light" target="_blank" rel="noopener noreferrer">Hablar con Simón <span className="arr">→</span></a>
              </div>
            </div>
            {/* puerta secundaria */}
            <div className="gate gate-secondary">
              <span className="badge badge-sec">A tu ritmo</span>
              <h3>Buscá por tu cuenta</h3>
              <p className="desc">¿Preferís mirar todo y decidir solo? Entrá al buscador y movete con tus propias manos.</p>
              <ul>
                <li><span className="dt" />Elegís vos: <strong>alquileres</strong> o <strong>ventas</strong>, cada uno con sus filtros</li>
                <li><span className="dt" />Compará hasta 3 lado a lado, con fotos y mapa</li>
                <li><span className="dt" />Sin registro, sin que nadie te escriba</li>
              </ul>
              <div className="foot-cta gates-cta">
                <Link href="/alquileres" className="btn btn-ghost">Alquileres <span className="arr">→</span></Link>
                <Link href="/ventas" className="btn btn-ghost">Ventas <span className="arr">→</span></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── EL DATO, CONTADO POR SIMÓN ──────────────────── */}
      <section className="talk sec">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-eyebrow eyebrow-dark">Equipetrol · hoy</div>
            <h2>No te tiro una planilla. Te lo cuento.</h2>
            <p className="sub">Los mismos datos del mercado, dichos como te los diría un amigo que está adentro del rubro.</p>
            <p className="fresh"><span className="dot" />Actualizado hoy · se refresca cada noche</p>
          </div>
          <div className="says stagger">
            <div className="say">
              <div className="av"><Norte size={34} sobre="negro" /></div>
              <p><b>{market.zonaMasCara.zona}.</b> El m² está a <Count value={market.zonaMasCara.m2} prefix="$" />. <span className="ctx">Es la zona más cara de Equipetrol ahora mismo.</span></p>
            </div>
            <div className="say">
              <div className="av"><Norte size={34} sobre="negro" /></div>
              <p><b>Para alquilar,</b> la renta mediana anda en <Count value={market.medianaAlquilerBob} prefix="Bs " />. <span className="ctx">Si te piden mucho más por algo parecido, hay con qué negociar.</span></p>
            </div>
            <div className="say">
              <div className="av"><Norte size={34} sobre="negro" /></div>
              <p><b>Hoy hay <Count value={market.ventasActivas} /> deptos en venta</b> y <Count value={market.alquileresActivos} /> en alquiler. <span className="ctx">De Century 21, Remax y Bien Inmuebles, juntos en un solo lugar. Lo reviso cada noche.</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── QUÉ HAY ADENTRO (productos) ─────────────────── */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="sec-eyebrow">Alquiler · Venta · Mercado</div>
            <h2>Todo Equipetrol, en un solo lugar.</h2>
            <p className="sub">Sea con Simón o por tu cuenta, esto es lo que vas a encontrar adentro.</p>
          </div>
          <div className="doors stagger">
            <div className="door">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pic" src="/wa-card-alquileres.jpg" alt="Departamento en alquiler en Equipetrol" loading="lazy" decoding="async" width={760} height={506} />
              <span className="tag"><span className="d" />Activo</span>
              <h3>Alquileres</h3>
              <p>{aproximado(market.alquileresActivos)} deptos de tres fuentes, al día. Filtrá por precio, zona, mascotas o parqueo y comparalos lado a lado.</p>
              <Link href="/alquileres" className="lnk">Buscar alquileres <span className="arr">→</span></Link>
            </div>
            <div className="door">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pic" src="/wa-card-ventas.jpg" alt="Departamento en venta con piscina y vista en Equipetrol" loading="lazy" decoding="async" width={760} height={570} />
              <span className="tag"><span className="d" />Activo</span>
              <h3>Ventas</h3>
              <p>{aproximado(market.ventasActivas)} deptos en venta con el precio por m² de cada zona. Sabés si lo que te ofrecen está caro o justo.</p>
              <Link href="/ventas" className="lnk">Explorar ventas <span className="arr">→</span></Link>
            </div>
            <div className="door">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="pic" src="/wa-card-mercado.jpg" alt="Vista panorámica de Equipetrol desde un departamento" loading="lazy" decoding="async" width={760} height={570} />
              <span className="tag"><span className="d" />Datos públicos</span>
              <h3>Mercado</h3>
              <p>El pulso de Equipetrol abierto a todos. Precios por zona, por tipología, tendencias. Sin preguntarle a nadie.</p>
              <Link href="/mercado/equipetrol" className="lnk">Ver el mercado <span className="arr">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── BANDA EMOCIONAL (foto aérea real de la Av. San Martín) ── */}
      <section className="band reveal">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="band-img" src="/equipetrol-aerea.jpg" alt="Vista aérea de la Av. San Martín, Equipetrol" loading="lazy" decoding="async" width={1600} height={900} />
        <div className="band-txt">
          <h2>Querés vivir en Equipetrol.<br />Yo ya lo conozco entero.</h2>
          <p>Cada edificio, cada precio, cada zona. Empezá por preguntarme.</p>
        </div>
      </section>

      {/* ─── CIERRE ──────────────────────────────────────── */}
      <section className="close">
        <div className="wrap reveal">
          <h2>Decidí bien.</h2>
          <p>Sin registro. Sin tarjeta. Con datos reales de hoy.</p>
          <a href={WA_URL} className="btn btn-light" target="_blank" rel="noopener noreferrer">Hablar con Simón <span className="arr">→</span></a>
        </div>
      </section>

      <footer>
        <div className="wrap foot-in">
          <div className="brand brand-dark"><Norte size={22} sobre="negro" /> Decidí bien.</div>
          <div className="cr">© 2026 Simón · Santa Cruz de la Sierra</div>
        </div>
      </footer>

      <style jsx>{`
        /* Tokens simon-brand v1.4 aplicados a la estructura de la maqueta v6 */
        .lw {
          --arena: #ede8dc;
          --negro: #141414;
          --salvia: #3a6a48;
          --salvia-vivo: #1f9d60;
          --verde-txt: #0f6b3e;
          --tinta: #3a3530;
          --piedra: #7a7060;
          --arena-mid: #d8d0bc;
          --blanco: #fafaf8;
          --dark-1: #ede8dc;
          --dark-2: #c0b89e;
          --dark-3: #9a8e7a;
          /* Display = Schibsted Grotesk (tipografía original de la maqueta v6) */
          --display: var(--font-schibsted), 'Schibsted Grotesk', sans-serif;
          --body: var(--font-dm-sans), 'DM Sans', sans-serif;
          --r-card: 14px;
          --r-btn: 12px;
          --r-pill: 100px;
          --smooth: cubic-bezier(0.16, 1, 0.3, 1);
          background: var(--arena);
          color: var(--tinta);
          font-family: var(--body);
          font-size: 18px;
          line-height: 1.6;
          overflow-x: hidden;
        }
        .wrap { max-width: 1120px; margin: 0 auto; padding: 0 32px; }
        /* Peso 600 en títulos, como la maqueta original */
        h1, h2, h3 { font-family: var(--display); font-weight: 600; color: var(--negro); letter-spacing: -1px; line-height: 1.06; }

        /* NAV */
        .nav { position: sticky; top: 0; z-index: 50; background: rgba(237, 232, 220, 0.82); backdrop-filter: blur(14px); border-bottom: 1px solid var(--arena-mid); }
        .nav-in { display: flex; align-items: center; justify-content: space-between; height: 68px; }
        .brand { display: flex; align-items: center; gap: 11px; font-family: var(--display); font-weight: 500; font-size: 20px; color: var(--negro); }
        .nav-right { display: flex; align-items: center; gap: 18px; }
        .links { display: flex; gap: 30px; align-items: center; }
        .links :global(a) { color: var(--tinta); text-decoration: none; font-size: 15px; transition: color 0.2s; }
        .links :global(a:hover) { color: var(--negro); }
        .navtoggle { display: none; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 8px; background: transparent; border: 1px solid var(--arena-mid); color: var(--negro); cursor: pointer; }
        /* Clases sobre <Link>/<a> van con :global anidado — styled-jsx no scopea componentes */
        .lw :global(.btn) { display: inline-flex; align-items: center; gap: 8px; font-family: var(--body); font-weight: 500; font-size: 16px; min-height: 44px; padding: 12px 24px; border-radius: var(--r-btn); text-decoration: none; cursor: pointer; border: none; transition: transform 0.2s var(--smooth), box-shadow 0.2s; }
        .lw :global(.btn-primary) { background: var(--salvia); color: var(--arena); }
        .lw :global(.btn-primary:hover) { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(20, 20, 20, 0.18); }
        .lw :global(.btn-ghost) { background: transparent; color: var(--negro); border: 1px solid var(--arena-mid); }
        .lw :global(.btn-ghost:hover) { background: var(--blanco); }
        .lw :global(.btn-light) { background: var(--arena); color: var(--negro); }
        .lw :global(.btn-light:hover) { transform: translateY(-2px); }
        .lw :global(.btn .arr) { display: inline-block; transition: transform 0.25s var(--smooth); }
        .lw :global(.btn:hover .arr) { transform: translateX(4px); }
        .lw :global(.btn:active) { transform: translateY(0) scale(0.97); }
        @keyframes ctaPulse { 0%, 100% { box-shadow: 0 8px 22px rgba(20, 20, 20, 0.14); } 50% { box-shadow: 0 10px 30px rgba(58, 106, 72, 0.4); } }
        .lw :global(.cta-hero) { animation: ctaPulse 3.4s ease-in-out infinite; }
        .lw :global(.cta-hero:hover) { animation: none; }

        /* HERO */
        .hero { padding: 72px 0 76px; }
        .hero-grid { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 56px; align-items: center; }
        .hero-copy { max-width: 30ch; }
        .hi { display: inline-flex; align-items: center; gap: 9px; white-space: nowrap; max-width: 100%; background: var(--blanco); border: 1px solid var(--arena-mid); padding: 7px 16px 7px 12px; border-radius: var(--r-pill); font-size: 14px; color: var(--tinta); margin-bottom: 28px; }
        .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--salvia-vivo); position: relative; flex-shrink: 0; }
        .dot::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 1px solid var(--salvia-vivo); animation: ping 2.5s var(--smooth) infinite; }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.4); opacity: 0; } }
        h1 { font-size: clamp(42px, 6.6vw, 82px); letter-spacing: -2.5px; margin: 0 0 22px; }
        h1 .soft { color: var(--piedra); }
        .lead { font-size: clamp(18px, 2vw, 21px); color: var(--tinta); max-width: 32ch; margin: 0 0 34px; line-height: 1.5; }
        .hero-cta { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
        .hero-cta .alt { font-size: 16px; color: var(--tinta); text-decoration: none; border-bottom: 1.5px solid var(--arena-mid); padding-bottom: 2px; transition: border-color 0.2s; }
        .hero-cta .alt:hover { border-color: var(--negro); }
        .micro { margin-top: 20px; font-size: 14px; color: var(--piedra); }

        /* CHAT-HÉROE */
        .phone-stage { position: relative; perspective: 1400px; }
        .phone { position: relative; max-width: 392px; margin: 0 auto; background: var(--blanco); border: 1px solid var(--arena-mid); border-radius: 26px; padding: 22px; box-shadow: 0 2px 8px rgba(44, 41, 34, 0.06), 0 24px 60px rgba(44, 41, 34, 0.13); }
        .phone-head { display: flex; align-items: center; gap: 11px; padding-bottom: 16px; border-bottom: 1px solid var(--arena-mid); margin-bottom: 18px; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; background: var(--negro); display: grid; place-items: center; flex-shrink: 0; }
        .phone-head .nm { font-family: var(--display); font-weight: 500; color: var(--negro); font-size: 16px; line-height: 1.2; }
        .phone-head .st { font-size: 12.5px; color: var(--verde-txt); display: flex; align-items: center; gap: 5px; }
        .phone-head .st .d { width: 7px; height: 7px; border-radius: 50%; background: var(--salvia-vivo); animation: livepulse 2s var(--smooth) infinite; }
        @keyframes livepulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .bubbles { display: flex; flex-direction: column; gap: 11px; min-height: 340px; }
        .b { max-width: 82%; padding: 11px 15px; font-size: 15.5px; line-height: 1.45; border-radius: 16px; }
        .b.them { align-self: flex-start; background: var(--arena); color: var(--tinta); border-bottom-left-radius: 5px; }
        .b.me { align-self: flex-end; background: var(--negro); color: var(--dark-1); border-bottom-right-radius: 5px; }
        .b.them :global(strong) { color: var(--negro); font-weight: 500; }
        .b :global(.shortlist) { margin-top: 8px; padding-top: 9px; border-top: 1px solid var(--arena-mid); font-size: 14px; color: var(--verde-txt); font-weight: 500; display: flex; align-items: center; gap: 6px; }
        .b.anim { opacity: 0; transform: translateY(14px) scale(0.985); transition: opacity 0.5s var(--smooth), transform 0.5s var(--smooth); }
        .b.anim.in { opacity: 1; transform: none; }
        .typing { align-self: flex-start; display: inline-flex; align-items: center; gap: 5px; background: var(--arena); border-bottom-left-radius: 5px; border-radius: 16px; padding: 13px 16px; }
        .typing span { width: 7px; height: 7px; border-radius: 50%; background: var(--piedra); opacity: 0.5; animation: typedot 1.2s var(--smooth) infinite; }
        .typing span:nth-child(2) { animation-delay: 0.18s; }
        .typing span:nth-child(3) { animation-delay: 0.36s; }
        @keyframes typedot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-4px); opacity: 0.95; } }
        .replay { position: absolute; top: -2px; right: -2px; transform: translate(40%, -40%); width: 34px; height: 34px; border-radius: 50%; background: var(--blanco); border: 1px solid var(--arena-mid); display: grid; place-items: center; cursor: pointer; color: var(--piedra); box-shadow: 0 6px 16px rgba(58, 53, 48, 0.12); transition: transform 0.25s var(--smooth), color 0.2s; opacity: 0; pointer-events: none; }
        .phone-stage.done .replay { opacity: 1; pointer-events: auto; }
        .replay:hover { transform: translate(40%, -40%) rotate(-40deg); color: var(--salvia-vivo); }

        /* SECTION HEADERS */
        .sec { padding: 96px 0; }
        .sec-head { text-align: center; max-width: 40ch; margin: 0 auto 52px; }
        .sec-eyebrow { font-size: 14px; font-weight: 500; color: var(--verde-txt); letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 16px; }
        .sec-eyebrow.eyebrow-dark { color: var(--dark-3); }
        .sec h2 { font-size: clamp(30px, 4.6vw, 50px); margin-bottom: 18px; }
        .sec .sub { font-size: 19px; color: var(--tinta); }
        .fresh { margin-top: 16px; font-size: 13px; color: var(--dark-3); display: inline-flex; align-items: center; gap: 8px; }

        /* DOS PUERTAS */
        .gates { display: grid; grid-template-columns: 1.12fr 0.88fr; gap: 22px; align-items: stretch; }
        .gate { border-radius: var(--r-card); padding: 40px 36px; display: flex; flex-direction: column; transition: transform 0.3s var(--smooth), box-shadow 0.3s var(--smooth); }
        .gate:hover { transform: translateY(-6px); }
        .gate .badge { display: inline-flex; align-items: center; gap: 7px; align-self: flex-start; font-size: 12px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; padding: 5px 13px; border-radius: var(--r-pill); margin-bottom: 22px; }
        .bdot { width: 7px; height: 7px; border-radius: 50%; background: #fff; display: inline-block; }
        .gate h3 { font-size: 30px; margin-bottom: 12px; }
        .gate .desc { font-size: 17px; line-height: 1.55; margin-bottom: 22px; }
        .gate ul { list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 11px; }
        .gate li { position: relative; padding-left: 19px; font-size: 15.5px; line-height: 1.45; }
        .gate li .dt { position: absolute; left: 0; top: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--salvia-vivo); }
        .gate li :global(strong) { font-weight: 500; }
        .foot-cta { margin-top: auto; }
        .gates-cta { display: flex; gap: 10px; flex-wrap: wrap; }
        .gate-primary { background: var(--negro); color: var(--dark-2); box-shadow: 0 18px 48px rgba(20, 20, 20, 0.16); }
        .gate-primary:hover { box-shadow: 0 30px 68px rgba(20, 20, 20, 0.26); }
        .gate-primary .badge { background: var(--salvia); color: #fff; }
        .gate-primary h3 { color: var(--dark-1); }
        .gate-primary .desc { color: var(--dark-2); }
        .gate-primary li { color: var(--dark-1); }
        .gate-secondary { background: var(--blanco); border: 1px solid var(--arena-mid); }
        .gate-secondary:hover { box-shadow: 0 18px 44px rgba(58, 53, 48, 0.1); }
        .gate-secondary .badge { background: var(--arena); color: var(--piedra); border: 1px solid var(--arena-mid); }
        .gate-secondary h3 { color: var(--negro); }
        .gate-secondary .desc { color: var(--tinta); }
        .gate-secondary li { color: var(--tinta); }

        /* EL DATO, CONTADO POR SIMÓN */
        .talk { background: var(--negro); }
        .talk h2 { color: var(--dark-1); }
        .talk .sub { color: var(--dark-2); }
        .says { margin-top: 8px; display: flex; flex-direction: column; gap: 20px; max-width: 760px; margin-left: auto; margin-right: auto; }
        .say { display: flex; gap: 16px; align-items: flex-start; background: rgba(237, 232, 220, 0.04); border: 1px solid rgba(237, 232, 220, 0.1); padding: 22px 24px; border-radius: var(--r-card); }
        /* símbolo Norte directo (sin disco de fondo): el círculo arena del logo
           contrasta sobre la burbuja oscura, como en el nav — no se funde */
        .say .av { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; margin-top: 2px; }
        .say p { color: var(--dark-1); font-size: 18px; line-height: 1.55; margin: 0; }
        .say p b { font-family: var(--display); font-weight: 500; }
        .say p :global(.num) { color: var(--dark-1); font-weight: 500; font-variant-numeric: tabular-nums; }
        .say p .ctx { color: var(--dark-2); }

        /* QUÉ HAY ADENTRO */
        .doors { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
        .door { background: var(--blanco); border: 1px solid var(--arena-mid); border-radius: var(--r-card); padding: 30px 28px; overflow: hidden; transition: transform 0.3s var(--smooth), box-shadow 0.3s var(--smooth); }
        .door:hover { transform: translateY(-6px); box-shadow: 0 14px 36px rgba(58, 53, 48, 0.1); }
        .door .pic { display: block; width: calc(100% + 56px); height: 172px; object-fit: cover; margin: -30px -28px 24px; border-radius: var(--r-card) var(--r-card) 0 0; background: var(--arena-mid); transition: transform 0.45s var(--smooth); }
        .door:hover .pic { transform: scale(1.06); }
        .door .tag { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; color: var(--verde-txt); margin-bottom: 18px; }
        .door .tag .d { width: 7px; height: 7px; border-radius: 50%; background: var(--salvia-vivo); }
        .door h3 { font-size: 24px; margin-bottom: 12px; }
        .door p { font-size: 16px; color: var(--tinta); line-height: 1.55; margin-bottom: 22px; }
        .door :global(.lnk) { font-size: 16px; font-weight: 500; color: var(--negro); text-decoration: none; border-bottom: 1.5px solid var(--negro); padding-bottom: 2px; display: inline-flex; align-items: center; gap: 6px; }
        .door :global(.lnk .arr) { display: inline-block; transition: transform 0.25s var(--smooth); }
        .door:hover :global(.lnk .arr) { transform: translateX(4px); }

        /* BANDA EMOCIONAL */
        .band { position: relative; width: 100vw; left: 50%; margin-left: -50vw; height: clamp(440px, 50vw, 600px); display: flex; align-items: center; overflow: hidden; background: #b6a887; }
        /* foto aérea real de la Av. San Martín (object-position protege las torres) */
        .band-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }
        /* scrim crema a la izquierda: sostiene el texto sin lavar la foto */
        .band::after { content: ''; position: absolute; inset: 0; z-index: 1; background: linear-gradient(100deg, rgba(237, 232, 220, 0.92) 0%, rgba(237, 232, 220, 0.62) 26%, rgba(237, 232, 220, 0.12) 48%, transparent 62%); }
        .band-txt { position: relative; z-index: 2; max-width: 30ch; padding: 0 32px; margin-left: max(0px, calc((100vw - 1120px) / 2)); }
        .band-txt h2 { color: var(--negro); font-size: clamp(32px, 4.8vw, 56px); }
        .band-txt p { color: var(--tinta); font-size: 18px; margin-top: 14px; }

        /* CIERRE */
        .close { background: var(--negro); text-align: center; padding: 128px 0; }
        .close h2 { color: var(--dark-1); font-size: clamp(44px, 7vw, 84px); margin-bottom: 20px; }
        .close p { color: var(--dark-2); font-size: 19px; margin-bottom: 38px; }
        footer { background: var(--negro); border-top: 1px solid rgba(237, 232, 220, 0.1); padding: 26px 0; }
        .foot-in { display: flex; align-items: center; justify-content: space-between; }
        .brand-dark { color: var(--dark-1); }
        .cr { color: var(--dark-3); font-size: 13px; }

        /* SCROLL-REVEAL */
        .lw :global(.reveal) { opacity: 0; transform: translateY(26px); transition: opacity 0.7s var(--smooth), transform 0.7s var(--smooth); }
        .lw :global(.reveal.in) { opacity: 1; transform: none; }
        .lw :global(.stagger) > * { opacity: 0; transform: translateY(22px); transition: opacity 0.65s var(--smooth), transform 0.65s var(--smooth); }
        .lw :global(.stagger.in) > * { opacity: 1; transform: none; }
        .lw :global(.stagger.in) > *:nth-child(2) { transition-delay: 0.1s; }
        .lw :global(.stagger.in) > *:nth-child(3) { transition-delay: 0.2s; }

        /* RESPONSIVE */
        @media (max-width: 900px) {
          .hero { padding: 56px 0 64px; }
          .hero-grid { grid-template-columns: 1fr; gap: 40px; text-align: center; }
          .hero-copy { max-width: 36ch; margin: 0 auto; }
          .lead { margin-left: auto; margin-right: auto; }
          .hero-cta { justify-content: center; }
          .phone { max-width: 420px; }
        }
        @media (max-width: 820px) {
          .navtoggle { display: inline-flex; }
          .nav-right { gap: 12px; }
          .links { position: absolute; top: 100%; left: 0; right: 0; flex-direction: column; gap: 0; background: var(--arena); border-bottom: 1px solid var(--arena-mid); padding: 6px 0; display: none; box-shadow: 0 14px 30px rgba(58, 53, 48, 0.1); }
          .links.open { display: flex; }
          .links :global(a) { padding: 14px 32px; font-size: 16px; }
          .gates { grid-template-columns: 1fr; }
          .doors { grid-template-columns: 1fr; }
          .sec { padding: 64px 0; }
        }
        @media (max-width: 560px) {
          .wrap { padding: 0 20px; }
          .hi { font-size: 13px; }
          .hero { padding: 36px 0 48px; }
          h1 { font-size: clamp(34px, 8.4vw, 46px); }
          .phone { max-width: none; padding: 16px; border-radius: 22px; }
          .bubbles { min-height: 0; }
          .b { font-size: 15px; max-width: 88%; }
          .replay { top: 4px; right: 4px; transform: none; }
          .replay:hover { transform: rotate(-40deg); }
          .gate { padding: 30px 22px; }
          .gate h3 { font-size: 26px; }
          .sec { padding: 56px 0; }
          .sec-head { margin-bottom: 40px; }
          .close { padding: 88px 0; }
          .foot-in { flex-direction: column; gap: 10px; text-align: center; }
          .band { height: clamp(380px, 100vw, 480px); align-items: flex-start; }
          .band-img { object-position: 62% center; }
          .band::after { background: linear-gradient(155deg, rgba(237, 232, 220, 0.93) 0%, rgba(237, 232, 220, 0.62) 30%, rgba(237, 232, 220, 0.15) 56%, transparent 76%); }
          .band-txt { margin: 0; padding: 36px 24px 0; max-width: 16ch; }
          .band-txt h2 { font-size: clamp(28px, 8.2vw, 40px); }
          .band-txt p { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .lw :global(.reveal), .lw :global(.stagger) > *, .b.anim { opacity: 1 !important; transform: none !important; transition: none !important; }
          .dot::after, .typing span, .phone-head .st .d { animation: none !important; }
          .lw :global(.cta-hero) { animation: none !important; }
        }
        @media (hover: none) {
          .lw :global(.btn:hover), .gate:hover, .door:hover { transform: none; }
          .door:hover .pic { transform: none; }
          .lw :global(.btn:hover .arr), .door:hover :global(.lnk .arr) { transform: none; }
          .lw :global(.btn:active) { transform: scale(0.97); }
          .gate:active, .door:active { transform: scale(0.99); }
        }
      `}</style>
    </div>
  )
}

export const getStaticProps: GetStaticProps<{ market: SuperficiesMarketData }> = async () => {
  const market = await fetchSuperficiesData()
  return { props: { market }, revalidate: 21600 } // 6 horas — "se refresca cada noche"
}
