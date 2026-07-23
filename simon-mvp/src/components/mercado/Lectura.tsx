// La caja de lectura: el "qué significa" de cada bloque, en lenguaje humano.
// Principio del rediseño: cada sección cierra con la conclusión hecha — el
// lector no debería tener que derivarla de una tabla.
import type { ReactNode } from 'react'

export default function Lectura({ children }: { children: ReactNode }) {
  return (
    <div className="lx">
      {children}
      <style jsx>{`
        .lx { margin-top: 13px; font-size: 13px; line-height: 1.55; color: var(--mx-lectura-text, #B9CDB9); background: var(--mx-lectura-bg, rgba(58,106,72,0.16)); border: 1px solid var(--mx-lectura-border, rgba(58,106,72,0.3)); border-radius: 12px; padding: 12px 14px; }
        .lx :global(b), .lx :global(strong) { color: var(--mx-text, #EDE8DC); font-weight: 500; }
        .lx :global(small) { display: block; margin-top: 6px; font-size: 12px; color: var(--mx-dim, rgba(237,232,220,0.62)); }
      `}</style>
    </div>
  )
}
