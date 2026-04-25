// Página de bloqueo de shortlist (/b/[hash]).
//
// Una sola página visual con 3 mensajes posibles según `reason`. Branding
// Simón + CTA al WhatsApp del broker para pedir un nuevo link. Mobile-first
// (la mayoría del tráfico de /b/[hash] viene de WhatsApp en celular).
//
// Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.

import Head from 'next/head'
import { buildWhatsAppURL } from '@/lib/whatsapp'

export type BlockReason = 'expired' | 'view_limit_reached' | 'suspended'

export interface ShortlistBlockedPageProps {
  reason: BlockReason
  broker: {
    nombre: string
    telefono: string
  }
}

const MESSAGES: Record<BlockReason, { title: string; body: string }> = {
  expired: {
    title: 'Esta selección expiró',
    body: 'Pedile un nuevo link a tu broker para seguir viendo las propiedades.',
  },
  view_limit_reached: {
    title: 'Esta selección es privada',
    body: 'Alcanzó su límite de visualizaciones. Pedile un nuevo link a tu broker.',
  },
  suspended: {
    title: 'Esta selección no está disponible',
    body: 'Contactá a tu broker para más información.',
  },
}

function buildPedidoMessage(broker: { nombre: string }): string {
  return `Hola ${broker.nombre}, el link de la selección que me enviaste ya no funciona. ¿Me podés mandar uno nuevo?`
}

export default function ShortlistBlockedPage({ reason, broker }: ShortlistBlockedPageProps) {
  const msg = MESSAGES[reason]
  const waUrl = buildWhatsAppURL(broker.telefono, buildPedidoMessage(broker))

  return (
    <>
      <Head>
        <title>{msg.title} · Simón</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="theme-color" content="#141414" />
      </Head>
      <main className="sl-blocked">
        <div className="sl-blocked-card">
          <div className="sl-blocked-logo">SIMÓN</div>
          <h1 className="sl-blocked-title">{msg.title}</h1>
          <p className="sl-blocked-body">{msg.body}</p>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="sl-blocked-cta"
          >
            Pedir nuevo link a {broker.nombre.split(' ')[0]}
          </a>
          <div className="sl-blocked-footer">
            Selección curada con <strong>Simón · Inteligencia Inmobiliaria</strong>
          </div>
        </div>
      </main>

      <style jsx>{`
        .sl-blocked {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #141414;
          padding: 24px 16px;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .sl-blocked-card {
          width: 100%;
          max-width: 420px;
          text-align: center;
          color: #EDE8DC;
        }
        .sl-blocked-logo {
          font-family: 'Figtree', system-ui, sans-serif;
          font-weight: 700;
          font-size: 14px;
          letter-spacing: 4px;
          opacity: 0.7;
          margin-bottom: 48px;
        }
        .sl-blocked-title {
          font-family: 'Figtree', system-ui, sans-serif;
          font-weight: 600;
          font-size: 26px;
          line-height: 1.25;
          margin: 0 0 16px;
          color: #EDE8DC;
        }
        .sl-blocked-body {
          font-size: 15px;
          line-height: 1.55;
          color: rgba(237, 232, 220, 0.72);
          margin: 0 0 32px;
        }
        .sl-blocked-cta {
          display: inline-block;
          background: #3A6A48;
          color: #EDE8DC;
          font-weight: 600;
          font-size: 15px;
          padding: 14px 28px;
          border-radius: 999px;
          text-decoration: none;
          transition: background 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .sl-blocked-cta:hover,
        .sl-blocked-cta:active {
          background: #2F5639;
        }
        .sl-blocked-footer {
          margin-top: 64px;
          font-size: 11px;
          letter-spacing: 0.5px;
          color: rgba(237, 232, 220, 0.4);
        }
        .sl-blocked-footer strong {
          color: rgba(237, 232, 220, 0.6);
          font-weight: 600;
        }
      `}</style>
    </>
  )
}
