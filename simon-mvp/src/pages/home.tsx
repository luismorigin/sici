// Home principal de Simon — Fase 1 de superficies públicas.
// Regla: Home = buscar y entrar al producto. Método/principios/roadmap → /sobre-simon.
// Dark launch (noindex) hasta OK de lanzamiento. Referencia visual:
// Analista de competncia codex/References/home-principal-simon-reference.png
// Spec: Frontend-Requests/home-principal-simon.md
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GetStaticProps } from 'next'
import { parsearBusqueda } from '@/lib/busqueda-natural'
import { fetchSuperficiesData, type SuperficiesMarketData } from '@/lib/superficies-data'

const SIMON_WHATSAPP = '59177066308'
const WA_URL = `https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent('Hola Simon, quiero buscar departamento en Equipetrol.')}`

// El buscador interpreta flexible y ejecuta estricto: la frase se parsea acá
// ($0, sin IA) y navega al feed con los deep-links que el feed ya valida.
function construirDestino(texto: string): string {
  const s = parsearBusqueda(texto)

  const esVenta =
    s.operacion === 'venta' ||
    (s.operacion === null && (s.moneda === 'usd' || s.entrega === 'solo_preventa'))

  if (esVenta) {
    return s.entrega === 'solo_preventa' ? '/ventas?preventa=1' : '/ventas'
  }

  // Alquiler (default MVP: el ejemplo del placeholder es de alquiler en Bs)
  const params = new URLSearchParams()
  if (s.zonas.length) params.set('zonas', s.zonas.join(','))
  // El feed de alquiler filtra en Bs/mes — solo pasamos precio si es Bs o sin moneda
  if (s.moneda !== 'usd') {
    if (s.precioMin) params.set('precio_min_bob', String(s.precioMin))
    if (s.precioMax) params.set('precio_max_bob', String(s.precioMax))
  }
  if (s.dormitorios.length) params.set('dormitorios', s.dormitorios.join(','))
  if (s.amoblado === true) params.set('amoblado', 'si')
  if (s.mascotas === true) params.set('mascotas', 'true')
  if (s.parqueo === true) params.set('parqueo', 'true')

  const qs = params.toString()
  return qs ? `/alquileres?${qs}` : '/alquileres'
}

const NORTE = (
  <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="34" r="28" fill="#EDE8DC" />
    <circle cx="32" cy="15" r="6" fill="#3A6A48" />
    <circle cx="32" cy="15" r="3" fill="#0D0F0D" />
  </svg>
)

const fmtNum = (n: number) => n.toLocaleString('es-BO')

// Constelación de propiedades del fondo del hero: posiciones FIJAS (no random)
// para que SSR e hidratación coincidan. x/y en %, d = delay s, t = duración s.
// Los "viva" pulsan en salvia con anillo ping (propiedad recién actualizada).
const PINS: Array<{ x: number; y: number; d: number; t: number; viva?: boolean }> = [
  { x: 6, y: 18, d: 0.0, t: 4.2 },
  { x: 13, y: 64, d: 1.1, t: 5.0 },
  { x: 19, y: 33, d: 2.3, t: 4.6 },
  { x: 26, y: 80, d: 0.6, t: 5.4 },
  { x: 31, y: 12, d: 1.8, t: 4.4 },
  { x: 37, y: 51, d: 3.1, t: 5.2, viva: true },
  { x: 43, y: 27, d: 0.9, t: 4.8 },
  { x: 47, y: 72, d: 2.6, t: 4.3 },
  { x: 52, y: 9, d: 1.4, t: 5.6 },
  { x: 57, y: 44, d: 3.6, t: 4.5 },
  { x: 61, y: 86, d: 0.3, t: 5.1 },
  { x: 66, y: 22, d: 2.0, t: 4.7, viva: true },
  { x: 70, y: 58, d: 1.6, t: 5.3 },
  { x: 75, y: 36, d: 3.3, t: 4.4 },
  { x: 79, y: 74, d: 0.7, t: 5.5 },
  { x: 84, y: 15, d: 2.8, t: 4.6 },
  { x: 88, y: 49, d: 1.2, t: 5.0, viva: true },
  { x: 92, y: 78, d: 3.8, t: 4.9 },
  { x: 96, y: 30, d: 0.5, t: 5.2 },
  { x: 22, y: 92, d: 2.4, t: 4.5 },
  { x: 55, y: 95, d: 1.9, t: 5.4 },
  { x: 82, y: 93, d: 3.0, t: 4.8 },
]

// Contador animado: cuenta desde 0 hasta el valor de la BD al entrar en viewport
function Count({ value, prefix = '' }: { value: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        obs.unobserve(el)
        const dur = 1200
        let start: number | null = null
        const step = (ts: number) => {
          if (start === null) start = ts
          const p = Math.min(1, (ts - start) / dur)
          const eased = 1 - Math.pow(1 - p, 3)
          el.textContent = prefix + fmtNum(Math.round(value * eased))
          if (p < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      })
    }, { threshold: 0.6 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, prefix])
  return <span ref={ref}>{prefix + fmtNum(value)}</span>
}

export default function HomePrincipal({ market }: { market: SuperficiesMarketData }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  // Chips en vivo: lo que Simon entendió de la frase, visible y corregible
  const chips = useMemo(() => (q.trim().length >= 3 ? parsearBusqueda(q).chips : []), [q])

  const buscar = (e?: React.FormEvent) => {
    e?.preventDefault()
    router.push(construirDestino(q))
  }

  const fmt = fmtNum
  const tcFmt = market.tcParalelo.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Scroll-reveal: secciones entran con fade + subida al aparecer en viewport
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const els = root.querySelectorAll('.reveal, .stagger')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('in'))
      return
    }
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target) }
      })
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div className="sh" ref={rootRef}>
      <Head>
        <title>Simon — Menos avisos confusos. Más propiedades comparables.</title>
        <meta
          name="description"
          content="Simon ordena datos inmobiliarios de Equipetrol para que compares precios, edificios y zonas con contexto real de mercado."
        />
        {/* Dark launch: quitar noindex al lanzar */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#0D0F0D" />
      </Head>

      {/* ─── NAV ─────────────────────────────────────────── */}
      <nav className="nav">
        <div className="wrap nav-in">
          <Link href="/home" className="brand" aria-label="Simon — inicio">
            {NORTE}
            <span>Simon</span>
          </Link>
          <div className={`links ${menuOpen ? 'open' : ''}`}>
            <Link href="/alquileres">Alquileres</Link>
            <Link href="/ventas">Ventas</Link>
            <Link href="/ventas?preventa=1">Preventa</Link>
            <Link href="/mercado/equipetrol">Mercado</Link>
            <a href="#simula">Simula y calcula</a>
          </div>
          <div className="nav-right">
            <a href={WA_URL} className="btn btn-wa" target="_blank" rel="noopener noreferrer">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3a3 3 0 0 0-1 2.2c0 1.3 1 2.6 1.1 2.8.1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.4-.3Z" />
              </svg>
              Hablar por WhatsApp
            </a>
            <button
              className="hamb"
              aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {menuOpen
                  ? <><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></>
                  : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ─── HERO ────────────────────────────────────────── */}
      <header className="hero">
        {/* Fondo vivo: plano urbano de Equipetrol (anillos + radiales) en deriva
            lenta + constelación de pins de propiedades titilando */}
        <div className="bg-mapa" aria-hidden="true">
          <svg className="mapa" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
            <g stroke="#EDE8DC" strokeWidth="1" fill="none">
              {/* anillos (2do y 3er anillo, arcos amplios) */}
              <path d="M -80 640 Q 420 460 1280 580" opacity="0.055" />
              <path d="M -80 790 Q 470 610 1280 740" opacity="0.045" />
              <path d="M -80 480 Q 380 330 1280 430" opacity="0.035" />
              {/* radiales y calles */}
              <line x1="150" y1="-40" x2="360" y2="840" opacity="0.05" />
              <line x1="420" y1="-40" x2="560" y2="840" opacity="0.04" />
              <line x1="700" y1="-40" x2="760" y2="840" opacity="0.05" />
              <line x1="950" y1="-40" x2="1020" y2="840" opacity="0.035" />
              <line x1="-40" y1="180" x2="1240" y2="120" opacity="0.04" />
              <line x1="-40" y1="330" x2="1240" y2="290" opacity="0.03" />
              {/* conexiones de la constelación */}
              <line x1="444" y1="216" x2="660" y2="176" opacity="0.05" />
              <line x1="660" y1="176" x2="900" y2="120" opacity="0.04" />
              <line x1="684" y1="408" x2="880" y2="392" opacity="0.05" />
              <line x1="370" y1="408" x2="570" y2="352" opacity="0.04" />
            </g>
          </svg>
          {PINS.map((p, i) => (
            <span
              key={i}
              className={`pin ${p.viva ? 'viva' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }}
            />
          ))}
        </div>
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="eyebrow-row">
              <span className="eyebrow">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
                </svg>
                Equipetrol, Santa Cruz
              </span>
              {/* TC del día — el paralelo que usa el sistema para normalizar precios */}
              <span className="tc-pill" title="Tipo de cambio paralelo que Simon usa hoy">
                <span className="tcdot" aria-hidden="true" />
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.4c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.7-1.1 1.5-2.5 1.9c-1.4.4-2.5.9-2.5 1.9s1.1 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
                </svg>
                TC hoy <strong>Bs {tcFmt}</strong>
                <span className="tc-upd">· actualizado hoy</span>
              </span>
            </div>
            <h1>
              Menos avisos confusos.
              <br />
              <span className="soft">Más propiedades comparables.</span>
            </h1>
            <p className="lead">
              Simon ordena datos inmobiliarios de Equipetrol para que compares precios, edificios y
              zonas con contexto real de mercado.
            </p>

            {/* Buscador natural — interpreta flexible, ejecuta estricto */}
            <form className="search" onSubmit={buscar} role="search">
              <svg className="sicon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder='Buscá "1 dorm en Sirari hasta Bs 4.500"'
                aria-label="Buscá propiedades escribiendo como hablás"
              />
              <button type="submit" aria-label="Buscar">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
              </button>
            </form>
            {chips.length > 0 && (
              <div className="chips-live" aria-live="polite">
                <span className="entendido">Simon entendió:</span>
                {chips.map(c => <span key={c} className="chip-mini">{c}</span>)}
              </div>
            )}

            {/* Accesos rápidos */}
            <div className="quick">
              <Link href="/alquileres" className="chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" />
                </svg>
                Alquileres
              </Link>
              <Link href="/ventas" className="chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
                </svg>
                Ventas
              </Link>
              <Link href="/ventas?preventa=1" className="chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 21h16M6 21V8l6-4 6 4v13M10 21v-5h4v5" />
                </svg>
                Preventa
              </Link>
              <a href="#simula" className="chip">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
                </svg>
                Calcular mi rango
              </a>
            </div>
          </div>

          {/* Preview mobile del producto (mockup CSS del feed rediseñado) */}
          <div className="phone-col" aria-hidden="true">
            <div className="phone">
              <div className="ph-head">
                <div className="ph-brand">
                  <svg width="22" height="22" viewBox="0 0 64 64">
                    <circle cx="32" cy="34" r="28" fill="#EDE8DC" />
                    <circle cx="32" cy="15" r="6" fill="#3A6A48" />
                    <circle cx="32" cy="15" r="3" fill="#141414" />
                  </svg>
                  <span>Simon</span>
                </div>
                <div className="ph-ico">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></svg>
                </div>
              </div>
              <div className="ph-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
                <span>Buscá &ldquo;1 dorm en Sirari hasta Bs 4.500&rdquo;</span>
              </div>
              <div className="ph-card">
                <div className="ph-photo">
                  <span className="ph-heart">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#4E9B66" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.7-9A5.6 5.6 0 0 1 12 6.2 5.6 5.6 0 0 1 21.7 12c-2.2 4.3-9.7 9-9.7 9Z" /></svg>
                  </span>
                  <span className="ph-count">1/7</span>
                  <div className="ph-dots"><i className="on" /><i /><i /><i /><i /></div>
                </div>
                <div className="ph-body">
                  <div className="ph-title">NanoTec by Smart Studio</div>
                  <span className="ph-badge">Publicación reciente</span>
                  <div className="ph-zona">Eq. Norte #3492</div>
                  <div className="ph-precio-row">
                    <div>
                      <div className="ph-precio">$us 37.356 <small>(T.C. oficial)</small></div>
                      <div className="ph-specs">Monoambiente · 30 m² · 1 baño</div>
                      <div className="ph-specs">$us 1.245/m² · Entrega inmediata</div>
                    </div>
                    <span className="ph-mapa">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 3-6 2v16l6-2 6 2 6-2V3l-6 2-6-2Z" /><path d="M9 3v16M15 5v16" /></svg>
                      Ver mapa
                    </span>
                  </div>
                </div>
              </div>
              <div className="ph-tray">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#4E9B66"><path d="M12 21s-7.5-4.7-9.7-9A5.6 5.6 0 0 1 12 6.2 5.6 5.6 0 0 1 21.7 12c-2.2 4.3-9.7 9-9.7 9Z" /></svg>
                <span>Comparar 2 favoritos</span>
                <span className="ph-x">×</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ─── BLOQUES DE VALOR ────────────────────────────── */}
      <section className="valor wrap stagger">
        <div className="vcard">
          <div className="vico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          </div>
          <h3>Búsqueda natural</h3>
          <p>Escribí como hablás y encontrá propiedades relevantes en segundos.</p>
        </div>
        <div className="vcard">
          <div className="vico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2" /></svg>
          </div>
          <h3>Contexto de mercado</h3>
          <p>Vemos más allá del precio: mediana, rango y comparables activos.</p>
        </div>
        <div className="vcard">
          <div className="vico">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M12 6l6 2-2.5 6a3.5 3.5 0 0 0 7 0L20 8M12 6 6 8l2.5 6a3.5 3.5 0 0 1-7 0L4 8M8 21h8" /></svg>
          </div>
          <h3>Comparativo express</h3>
          <p>Compará propiedades guardadas en una vista clara y objetiva.</p>
        </div>
      </section>

      {/* ─── SIMULA Y CALCULA ────────────────────────────── */}
      <section id="simula" className="simula wrap">
        <div className="sim-head reveal">
          <h2>Simula y calcula</h2>
          <p>Herramientas para decidir con números, no con intuición.</p>
        </div>
        <div className="sim-grid stagger">
          <Link href="/alquileres" className="sim-card activa">
            <h3>Comparador de propiedades</h3>
            <p>Guardá 2 o más favoritos en el feed y compará precios, m² y zonas lado a lado.</p>
            <span className="sim-link">Ir al feed →</span>
          </Link>
          <div className="sim-card prox">
            <span className="prox-badge">Próximamente</span>
            <h3>Calculadora de renta</h3>
            <p>Estimá tu rango de alquiler según la mediana de la zona que te interesa.</p>
          </div>
          <div className="sim-card prox">
            <span className="prox-badge">Próximamente</span>
            <h3>Crédito hipotecario</h3>
            <p>Simulá cuotas y plazos para saber qué precio de compra te calza.</p>
          </div>
        </div>
      </section>

      {/* ─── BANDA DE MERCADO (datos dinámicos, ISR) ─────── */}
      <section className="banda">
        <div className="wrap banda-in reveal">
          <div className="stat">
            <div className="stat-ico">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
            </div>
            <div>
              <div className="stat-num"><Count value={market.ventasActivas} /></div>
              <div className="stat-label">ventas activas<span> en Equipetrol</span></div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-ico">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" /></svg>
            </div>
            <div>
              <div className="stat-num"><Count value={market.alquileresActivos} /></div>
              <div className="stat-label">alquileres<span> disponibles hoy</span></div>
            </div>
          </div>
          <div className="stat">
            <div className="stat-ico">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <div>
              <div className="stat-num"><Count value={market.medianaAlquilerBob} prefix="Bs " /><small>/mes</small></div>
              <div className="stat-label">mediana {market.medianaAlquilerZona}<span> · alquiler</span></div>
            </div>
          </div>
          <Link href="/mercado/equipetrol" className="btn btn-mercado">
            Ver mercado completo <span className="arr">→</span>
          </Link>
        </div>
      </section>

      {/* ─── CTA FINAL ───────────────────────────────────── */}
      <section className="cierre wrap reveal">
        <h2>Empezá buscando o hablá con Simon por WhatsApp.</h2>
        <div className="cierre-cta">
          <Link href="/alquileres" className="btn btn-primario">Buscar propiedades</Link>
          <a href={WA_URL} className="btn btn-wa2" target="_blank" rel="noopener noreferrer">Hablar por WhatsApp</a>
        </div>
      </section>

      {/* Grain cinematográfico global — casi imperceptible, hace el negro "caro" */}
      <div className="grain" aria-hidden="true" />

      <footer className="foot">
        <div className="wrap foot-in">
          <div className="foot-brand">{NORTE}<span>Decidí bien.</span></div>
          <div className="foot-links">
            <Link href="/alquileres">Alquileres</Link>
            <Link href="/ventas">Ventas</Link>
            <Link href="/mercado/equipetrol">Mercado</Link>
            <Link href="/sobre-simon">Sobre Simon</Link>
            <Link href="/whatsapp">Simon por WhatsApp</Link>
          </div>
          <div className="foot-cr">© 2026 Simón · Santa Cruz de la Sierra</div>
        </div>
      </footer>

      <style jsx>{`
        .sh {
          --bg: #0d0f0d;
          --panel: #141714;
          --panel-2: #191d19;
          --linea: rgba(237, 232, 220, 0.09);
          --arena: #ede8dc;
          --dark2: #c0b89e;
          --dark3: #9a8e7a;
          --salvia: #3a6a48;
          --salvia-vivo: #4e9b66;
          --smooth: cubic-bezier(0.16, 1, 0.3, 1);
          --display: var(--font-figtree), 'Figtree', sans-serif;
          --body: var(--font-dm-sans), 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--dark2);
          font-family: var(--body);
          font-size: 16px;
          line-height: 1.6;
          min-height: 100vh;
        }
        .wrap { max-width: 1160px; margin: 0 auto; padding: 0 28px; }
        h1, h2, h3 { font-family: var(--display); font-weight: 500; color: var(--arena); }

        /* NAV */
        .nav { position: sticky; top: 0; z-index: 40; background: rgba(13, 15, 13, 0.86); backdrop-filter: blur(14px); border-bottom: 1px solid var(--linea); }
        .nav-in { display: flex; align-items: center; justify-content: space-between; height: 66px; gap: 18px; }
        /* Clases sobre <Link>/<a> van con :global anidado — styled-jsx no scopea componentes */
        .nav-in :global(.brand) { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-weight: 500; font-size: 21px; color: var(--arena); text-decoration: none; }
        .links { display: flex; gap: 26px; }
        .links :global(a) { color: var(--dark2); text-decoration: none; font-size: 15px; transition: color 0.2s; }
        .links :global(a:hover) { color: var(--arena); }
        .nav-right { display: flex; align-items: center; gap: 12px; }
        .sh :global(.btn) { display: inline-flex; align-items: center; gap: 8px; font-family: var(--body); font-weight: 500; font-size: 15px; min-height: 44px; padding: 10px 22px; border-radius: 100px; text-decoration: none; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .sh :global(.btn-wa) { border: 1px solid rgba(237, 232, 220, 0.28); color: var(--arena); background: transparent; }
        .sh :global(.btn-wa:hover) { background: rgba(237, 232, 220, 0.07); }
        .hamb { display: none; width: 42px; height: 42px; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--linea); border-radius: 9px; color: var(--arena); cursor: pointer; }

        /* HERO */
        .hero { position: relative; padding: 64px 0 40px; overflow: hidden; }
        /* aura verde que respira detrás del hero — profundidad sin ruido */
        .hero::before { content: ''; position: absolute; top: -180px; right: -120px; width: 640px; height: 640px; border-radius: 50%; background: radial-gradient(circle, rgba(58, 106, 72, 0.22), transparent 62%); filter: blur(10px); animation: aura 9s ease-in-out infinite; pointer-events: none; }
        @keyframes aura { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
        .hero-grid { position: relative; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 48px; align-items: start; }

        /* FONDO VIVO: plano urbano + constelación */
        .bg-mapa { position: absolute; inset: 0; pointer-events: none; }
        .mapa { position: absolute; inset: -6%; width: 112%; height: 112%; animation: deriva 90s ease-in-out infinite alternate; }
        @keyframes deriva { from { transform: translate3d(-1.5%, -1%, 0); } to { transform: translate3d(1.5%, 1.2%, 0); } }
        .pin { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: var(--arena); opacity: 0.1; animation: twinkle 4.5s ease-in-out infinite; }
        @keyframes twinkle { 0%, 100% { opacity: 0.07; } 50% { opacity: 0.42; } }
        .pin.viva { width: 5px; height: 5px; margin: -1px; background: var(--salvia-vivo); }
        .pin.viva::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; border: 1px solid var(--salvia-vivo); animation: ping 3.6s var(--smooth) infinite; animation-delay: inherit; }

        /* GRAIN cinematográfico (tile SVG feTurbulence, se mueve a saltos) */
        .grain { position: fixed; inset: -50%; width: 200%; height: 200%; pointer-events: none; z-index: 80; opacity: 0.045; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); animation: grano 9s steps(9) infinite; }
        @keyframes grano { 0%, 100% { transform: translate3d(0, 0, 0); } 12% { transform: translate3d(-2%, 1%, 0); } 25% { transform: translate3d(1.5%, -1.8%, 0); } 37% { transform: translate3d(-1%, 2%, 0); } 50% { transform: translate3d(2%, 1%, 0); } 62% { transform: translate3d(-2%, -1.2%, 0); } 75% { transform: translate3d(1%, 1.8%, 0); } 87% { transform: translate3d(-1.4%, -1%, 0); } }
        /* entrada escalonada del hero al cargar */
        @keyframes riseIn { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
        .hero-copy > * { animation: riseIn 0.75s var(--smooth, cubic-bezier(0.16, 1, 0.3, 1)) both; }
        .hero-copy > *:nth-child(2) { animation-delay: 0.08s; }
        .hero-copy > *:nth-child(3) { animation-delay: 0.16s; }
        .hero-copy > *:nth-child(4) { animation-delay: 0.26s; }
        .hero-copy > *:nth-child(5) { animation-delay: 0.34s; }
        .hero-copy > *:nth-child(6) { animation-delay: 0.42s; }
        .eyebrow-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 26px; }
        .eyebrow { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--linea); background: var(--panel); color: var(--dark2); font-size: 13.5px; padding: 7px 15px; border-radius: 100px; }
        /* TC del día — dot vivo + valor tabular */
        .tc-pill { display: inline-flex; align-items: center; gap: 7px; border: 1px solid rgba(78, 155, 102, 0.35); background: rgba(58, 106, 72, 0.16); color: var(--dark2); font-size: 13.5px; padding: 7px 15px; border-radius: 100px; }
        .tc-pill svg { color: var(--salvia-vivo); }
        .tc-pill strong { color: var(--arena); font-weight: 500; font-variant-numeric: tabular-nums; }
        .tc-upd { color: var(--dark3); font-size: 12.5px; }
        .tcdot { position: relative; width: 8px; height: 8px; border-radius: 50%; background: var(--salvia-vivo); flex-shrink: 0; }
        .tcdot::after { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 1px solid var(--salvia-vivo); animation: ping 2.5s var(--smooth, ease-out) infinite; }
        @keyframes ping { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.3); opacity: 0; } }
        h1 { font-size: clamp(34px, 4.6vw, 60px); letter-spacing: -1.5px; line-height: 1.06; margin-bottom: 20px; }
        /* sheen sutil que barre la segunda línea cada unos segundos
           (capa 1 = brillo que se desplaza; capa 2 = arena base siempre visible) */
        h1 .soft { color: var(--arena); background: linear-gradient(110deg, rgba(255, 253, 244, 0) 42%, #fffdf4 50%, rgba(255, 253, 244, 0) 58%) no-repeat, linear-gradient(var(--arena), var(--arena)); background-size: 280% 100%, 100% 100%; background-position: 120% 0, 0 0; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: sheen 7s ease-in-out 1.4s infinite; }
        @keyframes sheen { 0% { background-position: 120% 0, 0 0; } 22% { background-position: -80% 0, 0 0; } 100% { background-position: -80% 0, 0 0; } }
        .lead { font-size: clamp(16px, 1.6vw, 19px); max-width: 46ch; margin-bottom: 30px; color: var(--dark2); }

        /* Buscador */
        .search { display: flex; align-items: center; background: var(--panel-2); border: 1px solid rgba(237, 232, 220, 0.16); border-radius: 14px; padding: 6px 6px 6px 18px; gap: 12px; max-width: 620px; transition: border-color 0.2s; }
        .search:focus-within { border-color: rgba(237, 232, 220, 0.35); }
        .sicon { color: var(--dark3); flex-shrink: 0; }
        .search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: var(--arena); font-family: var(--body); font-size: 16px; padding: 12px 0; }
        .search input::placeholder { color: var(--dark3); }
        .search button { flex-shrink: 0; width: 54px; height: 46px; border: none; border-radius: 10px; background: var(--salvia); color: var(--arena); cursor: pointer; display: grid; place-items: center; transition: filter 0.2s; }
        .search button:hover { filter: brightness(1.15); }
        .chips-live { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
        .entendido { font-size: 13px; color: var(--dark3); }
        .chip-mini { font-size: 13px; color: var(--arena); background: rgba(58, 106, 72, 0.28); border: 1px solid rgba(78, 155, 102, 0.4); padding: 3px 11px; border-radius: 100px; }

        /* Accesos rápidos */
        .quick { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
        .quick :global(.chip) { display: inline-flex; align-items: center; gap: 8px; color: var(--arena); text-decoration: none; font-size: 14.5px; border: 1px solid var(--linea); background: var(--panel); padding: 10px 18px; border-radius: 100px; transition: background 0.2s, border-color 0.2s; min-height: 42px; }
        .quick :global(.chip:hover) { background: var(--panel-2); border-color: rgba(237, 232, 220, 0.25); }
        .quick :global(.chip svg) { color: var(--salvia-vivo); }

        /* PHONE MOCKUP */
        .phone-col { position: relative; display: flex; justify-content: center; animation: riseIn 0.9s var(--smooth, cubic-bezier(0.16, 1, 0.3, 1)) 0.3s both; }
        /* glow salvia detrás del teléfono */
        .phone-col::before { content: ''; position: absolute; top: 8%; left: 50%; transform: translateX(-50%); width: 78%; height: 84%; border-radius: 50%; background: radial-gradient(ellipse, rgba(58, 106, 72, 0.35), transparent 68%); filter: blur(28px); animation: aura 7s ease-in-out 0.5s infinite; pointer-events: none; }
        .phone { position: relative; width: 100%; max-width: 340px; background: #101210; border: 1px solid rgba(237, 232, 220, 0.14); border-radius: 26px; padding: 16px 14px 12px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5); animation: floaty 7s ease-in-out 1.4s infinite; }
        @keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .ph-head { display: flex; align-items: center; justify-content: space-between; padding: 2px 4px 10px; }
        .ph-brand { display: flex; align-items: center; gap: 8px; font-family: var(--display); font-weight: 500; font-size: 16px; color: var(--arena); }
        .ph-ico { display: flex; gap: 12px; color: var(--arena); }
        .ph-search { display: flex; align-items: center; gap: 8px; background: #181b18; border: 1px solid var(--linea); border-radius: 100px; padding: 9px 14px; color: var(--dark3); font-size: 12px; margin-bottom: 12px; white-space: nowrap; overflow: hidden; }
        .ph-card { background: #131613; border: 1px solid var(--linea); border-radius: 18px; overflow: hidden; }
        .ph-photo { position: relative; height: 210px; background: linear-gradient(135deg, #3d3428 0%, #56483a 34%, #2c343c 68%, #1c2126 100%); }
        .ph-photo::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 25%, rgba(255, 196, 110, 0.35), transparent 55%), linear-gradient(to top, rgba(13, 15, 13, 0.75), transparent 45%); }
        .ph-heart { position: absolute; top: 12px; right: 12px; z-index: 2; width: 34px; height: 34px; border-radius: 50%; background: rgba(13, 15, 13, 0.65); display: grid; place-items: center; }
        .ph-count { position: absolute; top: 54px; right: 12px; z-index: 2; background: rgba(13, 15, 13, 0.65); color: var(--arena); font-size: 11px; padding: 3px 9px; border-radius: 100px; }
        .ph-dots { position: absolute; bottom: 10px; left: 0; right: 0; z-index: 2; display: flex; justify-content: center; gap: 5px; }
        .ph-dots i { width: 5px; height: 5px; border-radius: 50%; background: rgba(237, 232, 220, 0.35); }
        .ph-dots i.on { width: 14px; border-radius: 3px; background: var(--arena); }
        .ph-body { padding: 14px 14px 16px; }
        .ph-title { font-family: var(--display); font-weight: 500; font-size: 17px; color: var(--arena); margin-bottom: 7px; }
        .ph-badge { display: inline-block; font-size: 10.5px; color: #7fc795; background: rgba(58, 106, 72, 0.25); padding: 2px 9px; border-radius: 100px; margin-bottom: 6px; }
        .ph-zona { font-size: 12px; color: var(--dark3); margin-bottom: 8px; }
        .ph-precio-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; border-left: 2px solid var(--salvia); padding-left: 10px; }
        .ph-precio { font-family: var(--body); font-weight: 500; font-size: 19px; color: var(--arena); font-variant-numeric: tabular-nums; }
        .ph-precio small { font-size: 10.5px; color: var(--dark3); font-weight: 400; }
        .ph-specs { font-size: 11.5px; color: var(--dark2); margin-top: 3px; }
        .ph-mapa { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--arena); border: 1px solid rgba(237, 232, 220, 0.25); border-radius: 100px; padding: 7px 13px; }
        .ph-tray { display: flex; align-items: center; gap: 8px; margin-top: 12px; border: 1px solid rgba(237, 232, 220, 0.22); border-radius: 100px; padding: 10px 16px; color: var(--arena); font-size: 13px; font-weight: 500; }
        .ph-x { margin-left: auto; color: var(--dark3); font-size: 17px; }

        /* BLOQUES DE VALOR */
        .valor { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding-top: 26px; padding-bottom: 10px; }
        .vcard { background: var(--panel); border: 1px solid var(--linea); border-radius: 16px; padding: 24px 22px; transition: transform 0.25s ease, border-color 0.25s ease; }
        .vcard:hover { transform: translateY(-4px); border-color: rgba(237, 232, 220, 0.2); }
        .vico { width: 44px; height: 44px; border-radius: 12px; background: rgba(58, 106, 72, 0.22); border: 1px solid rgba(78, 155, 102, 0.3); color: var(--salvia-vivo); display: grid; place-items: center; margin-bottom: 14px; }
        .vcard h3 { font-size: 18px; margin-bottom: 7px; }
        .vcard p { font-size: 14.5px; color: var(--dark2); }

        /* SIMULA Y CALCULA */
        .simula { padding-top: 56px; padding-bottom: 20px; }
        .sim-head h2 { font-size: clamp(24px, 3vw, 34px); letter-spacing: -0.5px; margin-bottom: 6px; }
        .sim-head p { color: var(--dark2); margin-bottom: 24px; }
        .sim-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .sim-grid :global(.sim-card) { position: relative; display: block; background: var(--panel); border: 1px solid var(--linea); border-radius: 16px; padding: 24px 22px; text-decoration: none; }
        .sim-grid :global(.sim-card h3) { font-family: var(--display); font-weight: 500; color: var(--arena); font-size: 17px; margin-bottom: 7px; }
        .sim-grid :global(.sim-card p) { font-size: 14px; color: var(--dark2); }
        .sim-grid :global(.sim-card.activa) { transition: transform 0.25s ease, border-color 0.25s ease; }
        .sim-grid :global(.sim-card.activa:hover) { transform: translateY(-4px); border-color: rgba(237, 232, 220, 0.25); }
        .sim-grid :global(.sim-link) { display: inline-block; margin-top: 12px; font-size: 14px; font-weight: 500; color: var(--arena); border-bottom: 1px solid rgba(237, 232, 220, 0.35); padding-bottom: 1px; }
        .sim-grid :global(.sim-card.prox) { opacity: 0.72; }
        .sim-grid :global(.prox-badge) { position: absolute; top: 16px; right: 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dark3); border: 1px solid var(--linea); padding: 3px 10px; border-radius: 100px; }
        .sim-grid :global(.sim-card.prox h3) { padding-right: 110px; }

        /* BANDA DE MERCADO */
        .banda { margin-top: 56px; border-top: 1px solid var(--linea); border-bottom: 1px solid var(--linea); background: var(--panel); }
        .banda-in { display: flex; align-items: center; gap: 38px; padding-top: 30px; padding-bottom: 30px; flex-wrap: wrap; }
        .stat { display: flex; align-items: center; gap: 14px; }
        .stat-ico { width: 46px; height: 46px; flex-shrink: 0; border-radius: 50%; border: 1px solid rgba(78, 155, 102, 0.4); color: var(--salvia-vivo); display: grid; place-items: center; }
        .stat-num { font-family: var(--display); font-weight: 500; font-size: 27px; color: var(--arena); font-variant-numeric: tabular-nums; line-height: 1.1; }
        .stat-num small { font-size: 15px; color: var(--dark2); }
        .stat-label { font-size: 13.5px; color: var(--dark2); }
        .stat-label span { color: var(--dark3); }
        .banda-in :global(.btn-mercado) { margin-left: auto; border: 1px solid rgba(237, 232, 220, 0.28); color: var(--arena); }
        .banda-in :global(.btn-mercado:hover) { background: rgba(237, 232, 220, 0.07); }
        .banda-in :global(.arr) { display: inline-block; transition: transform 0.25s ease; }
        .banda-in :global(.btn-mercado:hover .arr) { transform: translateX(4px); }

        /* CIERRE */
        .cierre { text-align: center; padding-top: 84px; padding-bottom: 90px; }
        .cierre h2 { font-size: clamp(24px, 3.4vw, 38px); letter-spacing: -0.8px; max-width: 24ch; margin: 0 auto 30px; }
        .cierre-cta { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
        .cierre-cta :global(.btn-primario) { background: var(--arena); color: #141414; }
        .cierre-cta :global(.btn-primario:hover) { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
        .cierre-cta :global(.btn-wa2) { background: var(--salvia); color: var(--arena); }
        .cierre-cta :global(.btn-wa2:hover) { transform: translateY(-2px); filter: brightness(1.12); }

        /* FOOTER */
        .foot { border-top: 1px solid var(--linea); padding: 26px 0; }
        .foot-in { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
        .foot-brand { display: flex; align-items: center; gap: 10px; font-family: var(--display); font-weight: 500; color: var(--arena); }
        .foot-links { display: flex; gap: 20px; flex-wrap: wrap; }
        .foot-links :global(a) { color: var(--dark3); text-decoration: none; font-size: 13.5px; transition: color 0.2s; }
        .foot-links :global(a:hover) { color: var(--arena); }
        .foot-cr { color: var(--dark3); font-size: 12.5px; }

        /* SCROLL-REVEAL (el JS agrega .in al entrar en viewport) */
        .reveal { opacity: 0; transform: translateY(26px); transition: opacity 0.7s var(--smooth), transform 0.7s var(--smooth); }
        .reveal.in { opacity: 1; transform: none; }
        .stagger > * { opacity: 0; transform: translateY(22px); transition: opacity 0.65s var(--smooth), transform 0.65s var(--smooth); }
        .stagger.in > * { opacity: 1; transform: none; }
        .stagger.in > *:nth-child(2) { transition-delay: 0.1s; }
        .stagger.in > *:nth-child(3) { transition-delay: 0.2s; }

        /* RESPONSIVE */
        @media (max-width: 980px) {
          .hero-grid { grid-template-columns: 1fr; gap: 44px; }
          .phone-col { order: 2; }
          .valor, .sim-grid { grid-template-columns: 1fr; }
          .banda-in { flex-direction: column; align-items: flex-start; gap: 20px; }
          .banda-in :global(.btn-mercado) { margin-left: 0; }
        }
        @media (max-width: 820px) {
          .links { position: absolute; top: 66px; left: 0; right: 0; flex-direction: column; gap: 0; background: var(--panel); border-bottom: 1px solid var(--linea); padding: 8px 0; display: none; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); }
          .links.open { display: flex; }
          .links :global(a) { padding: 14px 28px; font-size: 16px; color: var(--arena); }
          .hamb { display: inline-flex; }
          .sh :global(.btn-wa) { padding: 10px 14px; font-size: 13.5px; }
        }
        @media (max-width: 560px) {
          .wrap { padding: 0 18px; }
          .hero { padding: 40px 0 28px; }
          .sh :global(.btn-wa) { display: none; }
          .search { padding-left: 14px; }
          .cierre { padding-top: 60px; padding-bottom: 64px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vcard, .sh :global(.btn), .banda-in :global(.arr) { transition: none !important; }
          .sim-grid :global(.sim-card.activa) { transition: none !important; }
          .hero::before, .hero-copy > *, .phone-col, .phone-col::before, .phone, h1 .soft, .tcdot::after { animation: none !important; }
          .mapa, .pin, .pin.viva::after, .grain { animation: none !important; }
          .pin { opacity: 0.15; }
          h1 .soft { -webkit-text-fill-color: var(--arena); }
          .reveal, .stagger > * { opacity: 1 !important; transform: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  )
}

export const getStaticProps: GetStaticProps<{ market: SuperficiesMarketData }> = async () => {
  const market = await fetchSuperficiesData()
  return { props: { market }, revalidate: 21600 } // 6 horas, igual que la landing actual
}
