// Launcher personal — /go
//
// Página pública con links rápidos a todas las superficies del producto.
// Pensada para el celular: 1 ícono en home screen → tap en cualquier botón
// abre el destino. Los destinos admin piden auth al llegar.
//
// Por ser útil principalmente al equipo y no al usuario final, incluye noindex.

import Head from 'next/head'
import Link from 'next/link'

interface LinkItem {
  label: string
  href: string
  external?: boolean
  hint?: string
}

interface Section {
  title: string
  color: string
  items: LinkItem[]
}

const SECTIONS: Section[] = [
  {
    title: 'Público',
    color: '#141414',
    items: [
      { label: 'Landing', href: '/', hint: 'Home' },
      { label: 'Feed ventas', href: '/ventas' },
      { label: 'Feed alquileres', href: '/alquileres' },
      { label: 'Mercado Equipetrol', href: '/mercado/equipetrol', hint: 'Hub' },
      { label: 'Mercado ventas', href: '/mercado/equipetrol/ventas' },
      { label: 'Mercado alquileres', href: '/mercado/equipetrol/alquileres' },
    ],
  },
  {
    title: 'Brokers',
    color: '#3A6A48',
    items: [
      { label: 'Abel Flores', href: '/broker/abel-flores', hint: 'RE/MAX Legacy' },
      { label: 'Demo', href: '/broker/demo', hint: 'Testing' },
    ],
  },
  {
    title: 'Admin',
    color: '#6a4b00',
    items: [
      { label: 'Brokers MVP', href: '/admin/simon-brokers', hint: 'simon_brokers' },
      { label: 'Health SICI', href: '/admin/salud' },
      { label: 'Market Pulse $', href: '/admin/market' },
      { label: 'Market Pulse Alq.', href: '/admin/market-alquileres' },
      { label: 'Admin alquileres', href: '/admin/alquileres' },
      { label: 'Supervisor HITL', href: '/admin/supervisor' },
      { label: 'Propiedades', href: '/admin/propiedades' },
      { label: 'Proyectos', href: '/admin/proyectos' },
    ],
  },
  {
    title: 'Herramientas',
    color: '#2a4a5f',
    items: [
      { label: 'Simon Advisor', href: 'https://simon-advisor.vercel.app/', external: true, hint: 'App externa' },
    ],
  },
  {
    title: 'Clientes',
    color: '#C7A74A',
    items: [
      { label: 'Condado VI', href: '/condado-vi' },
    ],
  },
]

export default function LauncherPage() {
  return (
    <>
      <Head>
        <title>Simón · Links rápidos</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#EDE8DC" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Simón" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </Head>

      <main className="go-page">
        <header className="go-header">
          <div className="go-logo">SIMÓN</div>
          <div className="go-subtitle">Inteligencia inmobiliaria</div>
        </header>

        {SECTIONS.map((section) => (
          <section key={section.title} className="go-section">
            <h2 className="go-section-title" style={{ color: section.color }}>{section.title}</h2>
            <div className="go-grid">
              {section.items.map((item) => {
                const content = (
                  <>
                    <span className="go-btn-label">
                      {item.label}
                      {item.external && <span className="go-btn-ext"> ↗</span>}
                    </span>
                    {item.hint && <span className="go-btn-hint">{item.hint}</span>}
                  </>
                )
                if (item.external) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener"
                      className="go-btn"
                    >
                      {content}
                    </a>
                  )
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="go-btn"
                    prefetch={false}
                  >
                    {content}
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        <footer className="go-footer">
          <div>Agregá esta página al home del celu:</div>
          <div className="go-footer-hint">Safari → Compartir → <strong>Agregar a pantalla de inicio</strong></div>
        </footer>
      </main>

      <style jsx>{`
        .go-page {
          min-height: 100vh;
          background: #EDE8DC;
          color: #141414;
          font-family: 'DM Sans', -apple-system, sans-serif;
          padding: 20px 16px calc(20px + env(safe-area-inset-bottom, 0));
          max-width: 640px;
          margin: 0 auto;
        }
        .go-header {
          text-align: center;
          margin: 8px 0 24px;
        }
        .go-logo {
          font-family: 'Figtree', sans-serif;
          font-size: 28px;
          font-weight: 700;
          letter-spacing: 1.5px;
        }
        .go-subtitle {
          font-size: 12px;
          color: #6a6a6a;
          letter-spacing: 0.4px;
          margin-top: 2px;
        }
        .go-section {
          margin-bottom: 24px;
        }
        .go-section-title {
          font-family: 'Figtree', sans-serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          margin: 0 0 10px 4px;
        }
        .go-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .go-btn {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
          background: #fff;
          border: 1px solid rgba(20,20,20,0.08);
          border-radius: 12px;
          padding: 14px 14px;
          min-height: 64px;
          text-decoration: none;
          color: #141414;
          transition: transform 0.1s, box-shadow 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .go-btn:active {
          transform: scale(0.97);
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        }
        .go-btn-label {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.2;
        }
        .go-btn-hint {
          font-size: 11px;
          color: #8a8a8a;
          font-weight: 400;
          line-height: 1.2;
        }
        .go-btn-ext {
          opacity: 0.55;
          font-weight: 500;
          font-size: 12px;
        }
        .go-footer {
          margin-top: 32px;
          padding: 16px;
          text-align: center;
          font-size: 11px;
          color: #6a6a6a;
          border-top: 1px solid rgba(20,20,20,0.08);
        }
        .go-footer-hint {
          margin-top: 4px;
          font-size: 11px;
        }
        .go-footer-hint strong {
          color: #141414;
          font-weight: 600;
        }
        @media (min-width: 480px) {
          .go-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      `}</style>
    </>
  )
}

// Página 100% estática, sin data — podemos marcar como SSG sin revalidate.
export async function getStaticProps() {
  return { props: {} }
}
