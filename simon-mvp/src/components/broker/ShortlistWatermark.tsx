// Watermark al pie del feed de shortlist válida (/b/[hash]).
//
// Brand siempre presente sin ser invasivo. Si el broker hace screenshot para
// distribuir en Instagram/grupos, el watermark con "Simón" + ID corto queda
// visible y permite trazabilidad ("vimos tu shortlist #abc12345 en Instagram,
// ¿podés explicarnos?"). Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.

export interface ShortlistWatermarkProps {
  brokerNombre: string
  shortlistId: string
  createdAt: string
  expiresAt: string
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-BO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export default function ShortlistWatermark({
  brokerNombre,
  shortlistId,
  createdAt,
  expiresAt,
}: ShortlistWatermarkProps) {
  const idCorto = shortlistId.slice(0, 8)

  return (
    <footer className="sl-watermark">
      <div className="sl-watermark-line">
        Selección de <strong>{brokerNombre}</strong> con{' '}
        <a href="https://simon.bo" target="_blank" rel="noopener noreferrer">
          Simón · Inteligencia Inmobiliaria
        </a>
      </div>
      <div className="sl-watermark-meta">
        Shortlist #{idCorto} · Creada {formatShortDate(createdAt)} · Expira{' '}
        {formatShortDate(expiresAt)}
      </div>

      <style jsx>{`
        .sl-watermark {
          padding: 24px 16px 32px;
          text-align: center;
          font-family: 'DM Sans', system-ui, sans-serif;
          color: rgba(20, 20, 20, 0.45);
          font-size: 11px;
          letter-spacing: 0.3px;
          border-top: 1px solid rgba(20, 20, 20, 0.06);
          margin-top: 32px;
          background: transparent;
        }
        .sl-watermark-line {
          line-height: 1.4;
        }
        .sl-watermark a {
          color: rgba(20, 20, 20, 0.7);
          text-decoration: underline;
        }
        .sl-watermark strong {
          color: rgba(20, 20, 20, 0.7);
          font-weight: 600;
        }
        .sl-watermark-meta {
          font-size: 10px;
          color: rgba(20, 20, 20, 0.35);
          margin-top: 6px;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </footer>
  )
}
