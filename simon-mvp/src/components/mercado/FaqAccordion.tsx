// FAQ como acordeón <details> — colapsado para el humano (la página deja de
// ser un muro de texto), presente en el DOM para el crawler. El FAQPage del
// schema JSON-LD sigue siendo el espejo 1:1 de estas preguntas (misma fuente
// de copy en la página — principio AEO del rediseño 21-jul).
export default function FaqAccordion({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <div className="fa">
      {items.map(f => (
        <details className="fa-item" key={f.q}>
          <summary>
            <h3>{f.q}</h3>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
      <style jsx>{`
        .fa { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
        .fa-item { background: var(--mx-panel, rgba(237,232,220,0.05)); border: 1px solid var(--mx-line, rgba(237,232,220,0.09)); border-radius: 12px; }
        summary { display: flex; align-items: center; gap: 10px; padding: 12px 14px; cursor: pointer; list-style: none; color: var(--mx-dim2, rgba(237,232,220,0.4)); }
        summary::-webkit-details-marker { display: none; }
        summary:focus-visible { outline: 2px solid var(--mx-accent, #9DBF9E); outline-offset: -2px; border-radius: 12px; }
        summary h3 { margin: 0; flex: 1; font-size: 13.5px; font-weight: 500; color: var(--mx-text, #EDE8DC); font-family: inherit; line-height: 1.45; }
        summary svg { flex-shrink: 0; transition: transform 0.18s; }
        .fa-item[open] summary svg { transform: rotate(180deg); }
        p { margin: 0; padding: 0 14px 13px; font-size: 13px; color: var(--mx-dim, rgba(237,232,220,0.62)); line-height: 1.65; }
        @media (prefers-reduced-motion: reduce) { summary svg { transition: none; } }
      `}</style>
    </div>
  )
}
