// Sobre Simon — Fase 2 de superficies públicas.
// Regla: Home = buscar. Sobre Simon = entender (método, principios, roadmap, confianza).
// Dark launch (noindex) hasta OK de lanzamiento.
// Spec: Analista de competncia codex/Frontend-Requests/sobre-simon.md
import Head from 'next/head'
import Link from 'next/link'
import { useState } from 'react'

const SIMON_WHATSAPP = '59177066308'
const WA_URL = `https://wa.me/${SIMON_WHATSAPP}?text=${encodeURIComponent('Hola Simon, quiero buscar departamento en Equipetrol.')}`

const NORTE = (
  <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="34" r="28" fill="#EDE8DC" />
    <circle cx="32" cy="15" r="6" fill="#3A6A48" />
    <circle cx="32" cy="15" r="3" fill="#0D0F0D" />
  </svg>
)

const PRINCIPIOS = [
  'Datos antes que promesas.',
  'Comparables, no opiniones.',
  'Si no sabemos, lo decimos.',
  'Dato faltante no significa "no tiene".',
  'El usuario decide; Simon muestra contexto.',
  'El pago no compra criterio.',
]

const NO_PROMETEMOS = [
  'La mejor opción.',
  'Precio justo garantizado.',
  'Oportunidad imperdible.',
  'Rentabilidad asegurada.',
  'Inventario oficial de desarrolladoras si no existe convenio.',
]

const COMO_ORDENAMOS = [
  { t: 'Normalizamos nombres de edificios', d: 'El mismo edificio publicado con tres nombres distintos se agrupa como uno solo.' },
  { t: 'Ordenamos zonas específicas', d: '"Equipetrol" a secas dice poco. Trabajamos con zonas delimitadas: Eq. Centro, Eq. Norte, Sirari y más.' },
  { t: 'Separamos alquiler, venta y preventa detectada', d: 'Cada operación tiene su propio feed y sus propios comparables. No se mezclan.' },
  { t: 'Revisamos precios y atributos estructurados', d: 'Precio, m², dormitorios y tipo de cambio se validan contra el aviso original.' },
  { t: 'Mostramos datos faltantes como no especificados', d: 'Si el aviso no lo dice, Simon no lo inventa. "No especificado" no significa "no tiene".' },
  { t: 'Calculamos medianas, rangos y comparables', d: 'Solo cuando hay base suficiente. Con pocos comparables, lo decimos.' },
]

const ROADMAP: Array<{ etapa: string; estado: 'hoy' | 'proximo' | 'despues'; items: string[] }> = [
  {
    etapa: 'Hoy', estado: 'hoy',
    items: ['Departamentos en Equipetrol', 'Alquileres', 'Ventas', 'Preventa detectada en publicaciones', 'Bottom sheets con contexto', 'Comparativo express', 'Mercado público', 'WhatsApp shortlist'],
  },
  {
    etapa: 'Próximo', estado: 'proximo',
    items: ['Búsqueda natural', 'Calculadora de renta', 'Cuentas para guardar favoritos', 'Mejoras mobile', 'Home principal'],
  },
  {
    etapa: 'Después', estado: 'despues',
    items: ['Desarrolladoras verificadas', 'Preventa con inventario directo', 'Simulador hipotecario', 'Herramientas para brokers'],
  },
]

export default function SobreSimon() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="ss">
      <Head>
        <title>Sobre Simon — Cómo ordenamos los datos inmobiliarios de Equipetrol</title>
        <meta
          name="description"
          content="Por qué existe Simon, cómo ordenamos los datos, nuestros principios, qué no prometemos y hacia dónde vamos."
        />
        {/* Dark launch: quitar noindex al lanzar */}
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#0D0F0D" />
      </Head>

      {/* ─── NAV (mismo shell que /home) ─────────────────── */}
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
          </div>
          <div className="nav-right">
            <a href={WA_URL} className="btn btn-wa" target="_blank" rel="noopener noreferrer">Hablar por WhatsApp</a>
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

      {/* ─── 1. POR QUÉ EXISTE SIMON ─────────────────────── */}
      <header className="hero wrap">
        <span className="eyebrow">Sobre Simon</span>
        <h1>El mercado está lleno de avisos difíciles de comparar.</h1>
        <p className="lead">
          Precios inconsistentes, zonas amplias, datos incompletos y propiedades repetidas.
          Simon nace para ordenar ese ruido y ayudar a comparar con más claridad.
        </p>
      </header>

      {/* ─── 2. QUÉ HACEMOS ──────────────────────────────── */}
      <section className="sec wrap">
        <h2>Qué hacemos</h2>
        <div className="dos-col">
          <p>
            Simon organiza propiedades de Equipetrol por zona, edificio, precio, m², tipología y
            atributos clave.
          </p>
          <p>
            Después agrega contexto de mercado para que puedas ver cada propiedad frente a
            comparables activos: mediana, rango observado y cuántos avisos la respaldan.
          </p>
        </div>
      </section>

      {/* ─── 3. CÓMO ORDENAMOS LOS DATOS ─────────────────── */}
      <section className="sec wrap">
        <h2>Cómo ordenamos los datos</h2>
        <div className="grid-2">
          {COMO_ORDENAMOS.map((item, i) => (
            <div key={item.t} className="card">
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{item.t}</h3>
              <p>{item.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 4. PRINCIPIOS ───────────────────────────────── */}
      <section className="sec principios">
        <div className="wrap">
          <h2>Nuestros principios</h2>
          <ul className="plist">
            {PRINCIPIOS.map(p => (
              <li key={p}>
                <span className="pdot" aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── 5. QUÉ NO PROMETEMOS ────────────────────────── */}
      <section className="sec wrap">
        <h2>Qué no prometemos</h2>
        <ul className="nolist">
          {NO_PROMETEMOS.map(n => (
            <li key={n}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
              </svg>
              {n}
            </li>
          ))}
        </ul>
        <blockquote className="quote">
          Simon no elige por vos. Te muestra información comparable para que decidas mejor.
        </blockquote>
      </section>

      {/* ─── 6. ROADMAP ──────────────────────────────────── */}
      <section className="sec wrap">
        <h2>Hacia dónde vamos</h2>
        <div className="roadmap">
          {ROADMAP.map(fase => (
            <div key={fase.etapa} className={`rcard ${fase.estado}`}>
              <div className="retapa">
                {fase.estado === 'hoy' && <span className="rdot" aria-hidden="true" />}
                {fase.etapa}
              </div>
              <ul>
                {fase.items.map(it => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 7 y 8. PARA USUARIOS / PARA BROKERS ─────────── */}
      <section className="sec wrap">
        <div className="grid-2 audiencias">
          <div className="acard">
            <h2>Para usuarios</h2>
            <p className="asub">Buscá, guardá, compará y consultá por WhatsApp con más contexto.</p>
            <ul>
              <li>Menos avisos confusos.</li>
              <li>Más propiedades comparables.</li>
              <li>Contexto de mercado en cada propiedad.</li>
              <li>Favoritos y comparativo express.</li>
              <li>Shortlists visuales por WhatsApp.</li>
            </ul>
          </div>
          <div className="acard">
            <h2>Para brokers y desarrolladoras</h2>
            <p className="asub">
              Simon puede ayudar a ordenar inventario, generar shortlists y mostrar propiedades con
              mejor contexto.
            </p>
            <p className="aclaracion">
              Las herramientas pagas no alteran el criterio de comparación de Simon. El pago compra
              herramientas y distribución, no compra criterio.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 9. CTA FINAL ────────────────────────────────── */}
      <section className="cierre wrap">
        <h2>Explorá propiedades en Equipetrol o hablá con Simon por WhatsApp.</h2>
        <div className="cierre-cta">
          <Link href="/alquileres" className="btn btn-primario">Ver propiedades</Link>
          <a href={WA_URL} className="btn btn-wa2" target="_blank" rel="noopener noreferrer">Hablar por WhatsApp</a>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-in">
          <div className="foot-brand">{NORTE}<span>Decidí bien.</span></div>
          <div className="foot-links">
            <Link href="/home">Inicio</Link>
            <Link href="/alquileres">Alquileres</Link>
            <Link href="/ventas">Ventas</Link>
            <Link href="/mercado/equipetrol">Mercado</Link>
            <Link href="/whatsapp">Simon por WhatsApp</Link>
          </div>
          <div className="foot-cr">© 2026 Simón · Santa Cruz de la Sierra</div>
        </div>
      </footer>

      <style jsx>{`
        .ss {
          --bg: #0d0f0d;
          --panel: #141714;
          --linea: rgba(237, 232, 220, 0.09);
          --arena: #ede8dc;
          --dark2: #c0b89e;
          --dark3: #9a8e7a;
          --salvia: #3a6a48;
          --salvia-vivo: #4e9b66;
          --display: var(--font-figtree), 'Figtree', sans-serif;
          --body: var(--font-dm-sans), 'DM Sans', sans-serif;
          background: var(--bg);
          color: var(--dark2);
          font-family: var(--body);
          font-size: 16.5px;
          line-height: 1.65;
          min-height: 100vh;
        }
        .wrap { max-width: 980px; margin: 0 auto; padding: 0 28px; }
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
        .ss :global(.btn) { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; font-size: 15px; min-height: 44px; padding: 10px 22px; border-radius: 100px; text-decoration: none; cursor: pointer; transition: transform 0.2s ease; }
        .ss :global(.btn-wa) { border: 1px solid rgba(237, 232, 220, 0.28); color: var(--arena); }
        .ss :global(.btn-wa:hover) { background: rgba(237, 232, 220, 0.07); }
        .hamb { display: none; width: 42px; height: 42px; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--linea); border-radius: 9px; color: var(--arena); cursor: pointer; }

        /* HERO */
        .hero { padding-top: 72px; padding-bottom: 24px; max-width: 800px; }
        .eyebrow { display: inline-block; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--dark3); border: 1px solid var(--linea); background: var(--panel); padding: 6px 14px; border-radius: 100px; margin-bottom: 24px; }
        h1 { font-size: clamp(30px, 4.4vw, 52px); letter-spacing: -1.2px; line-height: 1.1; margin-bottom: 18px; }
        .lead { font-size: clamp(16px, 1.8vw, 19px); max-width: 56ch; }

        /* SECCIONES */
        .sec { padding-top: 64px; }
        .sec h2 { font-size: clamp(23px, 2.8vw, 32px); letter-spacing: -0.5px; margin-bottom: 22px; }
        .dos-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; max-width: 860px; }
        .dos-col p { font-size: 17px; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .card { background: var(--panel); border: 1px solid var(--linea); border-radius: 16px; padding: 22px; }
        .card .num { font-family: var(--display); font-size: 13px; color: var(--salvia-vivo); letter-spacing: 0.5px; }
        .card h3 { font-size: 17px; margin: 8px 0 6px; }
        .card p { font-size: 14.5px; }

        /* PRINCIPIOS */
        .principios { margin-top: 64px; padding-top: 56px; padding-bottom: 56px; background: var(--panel); border-top: 1px solid var(--linea); border-bottom: 1px solid var(--linea); }
        .plist { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 32px; }
        .plist li { display: flex; align-items: baseline; gap: 12px; font-family: var(--display); font-weight: 500; font-size: clamp(17px, 2vw, 21px); color: var(--arena); }
        .pdot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--salvia-vivo); transform: translateY(-2px); }

        /* NO PROMETEMOS */
        .nolist { list-style: none; margin: 0 0 26px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .nolist li { display: flex; align-items: center; gap: 12px; font-size: 16.5px; color: var(--dark2); }
        .nolist svg { flex-shrink: 0; color: var(--dark3); }
        .quote { margin: 0; border-left: 3px solid var(--salvia); padding: 6px 0 6px 20px; font-family: var(--display); font-weight: 500; font-size: clamp(18px, 2.4vw, 24px); color: var(--arena); max-width: 34ch; }

        /* ROADMAP */
        .roadmap { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .rcard { background: var(--panel); border: 1px solid var(--linea); border-radius: 16px; padding: 22px; }
        .rcard.hoy { border-color: rgba(78, 155, 102, 0.4); }
        .retapa { display: flex; align-items: center; gap: 8px; font-family: var(--display); font-weight: 500; font-size: 17px; color: var(--arena); margin-bottom: 14px; }
        .rdot { width: 8px; height: 8px; border-radius: 50%; background: var(--salvia-vivo); }
        .rcard ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .rcard li { font-size: 14.5px; color: var(--dark2); padding-left: 16px; position: relative; }
        .rcard li::before { content: ''; position: absolute; left: 0; top: 9px; width: 5px; height: 5px; border-radius: 50%; background: var(--dark3); }
        .rcard.hoy li::before { background: var(--salvia-vivo); }
        .rcard.despues { opacity: 0.75; }

        /* AUDIENCIAS */
        .audiencias { align-items: stretch; }
        .acard { background: var(--panel); border: 1px solid var(--linea); border-radius: 16px; padding: 28px 26px; }
        .acard h2 { font-size: 21px; margin-bottom: 10px; }
        .asub { font-size: 15.5px; margin-bottom: 14px; }
        .acard ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .acard li { font-size: 14.5px; padding-left: 16px; position: relative; }
        .acard li::before { content: ''; position: absolute; left: 0; top: 9px; width: 5px; height: 5px; border-radius: 50%; background: var(--salvia-vivo); }
        .aclaracion { font-size: 14px; color: var(--dark3); border-top: 1px solid var(--linea); padding-top: 14px; margin-top: 4px; }

        /* CIERRE */
        .cierre { text-align: center; padding-top: 90px; padding-bottom: 90px; }
        .cierre h2 { font-size: clamp(23px, 3.2vw, 36px); letter-spacing: -0.7px; max-width: 26ch; margin: 0 auto 30px; }
        .cierre-cta { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; }
        .cierre-cta :global(.btn-primario) { background: var(--arena); color: #141414; }
        .cierre-cta :global(.btn-primario:hover) { transform: translateY(-2px); }
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

        /* RESPONSIVE */
        @media (max-width: 860px) {
          .dos-col, .grid-2, .roadmap, .plist { grid-template-columns: 1fr; }
        }
        @media (max-width: 820px) {
          .links { position: absolute; top: 66px; left: 0; right: 0; flex-direction: column; gap: 0; background: var(--panel); border-bottom: 1px solid var(--linea); padding: 8px 0; display: none; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45); }
          .links.open { display: flex; }
          .links :global(a) { padding: 14px 28px; font-size: 16px; color: var(--arena); }
          .hamb { display: inline-flex; }
          .ss :global(.btn-wa) { padding: 10px 14px; font-size: 13.5px; }
        }
        @media (max-width: 560px) {
          .wrap { padding: 0 18px; }
          .hero { padding-top: 48px; }
          .sec { padding-top: 48px; }
          .ss :global(.btn-wa) { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ss :global(.btn) { transition: none !important; }
        }
      `}</style>
    </div>
  )
}
