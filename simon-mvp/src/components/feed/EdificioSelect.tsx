import { useMemo, useRef, useState } from 'react'

// Autocompletado propio de EDIFICIOS para el filtro de los feeds.
// Reemplaza el <datalist> nativo (poco confiable en mobile, sensible al acento).
// - Normaliza acentos/mayúsculas en ambos lados → "mare" encuentra "Condominio Maré".
// - Dropdown propio, clickeable, que se ve igual en celu y desktop.
// Variante 'dark' (ventas) / 'light' (alquileres).

const DIACR = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(DIACR, '').trim()

export default function EdificioSelect({
  value,
  onChange,
  options,
  placeholder = 'Buscar edificio…',
  variant = 'dark',
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  variant?: 'dark' | 'light'
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sugeridos = useMemo(() => {
    const uniq = Array.from(new Set(options.filter(Boolean)))
    const q = norm(value)
    if (!q) return uniq.slice(0, 8)
    // prioriza los que EMPIEZAN con el texto, luego los que lo CONTIENEN
    const empiezan = uniq.filter(o => norm(o).startsWith(q))
    const contienen = uniq.filter(o => !norm(o).startsWith(q) && norm(o).includes(q))
    return [...empiezan, ...contienen].slice(0, 8)
  }, [value, options])

  const pick = (o: string) => { onChange(o); setOpen(false); setActive(-1) }

  return (
    <div className={`es-wrap es-${variant}`}>
      <input
        type="text"
        className="es-input"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, sugeridos.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && active >= 0 && sugeridos[active]) { e.preventDefault(); pick(sugeridos[active]) }
          else if (e.key === 'Escape') { setOpen(false); setActive(-1) }
        }}
      />
      {value && (
        <button type="button" className="es-clear" aria-label="Limpiar edificio"
          onMouseDown={e => { e.preventDefault(); onChange(''); setOpen(false); setActive(-1) }}>×</button>
      )}
      {open && sugeridos.length > 0 && (
        <ul className="es-list" role="listbox">
          {sugeridos.map((o, i) => (
            <li key={o}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`es-opt ${i === active ? 'es-opt-active' : ''}`}
                onMouseDown={e => { e.preventDefault(); pick(o) }}
              >{o}</button>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .es-wrap { position: relative; width: 100%; }
        .es-input {
          width: 100%; padding: 9px 30px 9px 12px; border-radius: 10px;
          font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none;
          transition: border-color .2s; box-sizing: border-box;
        }
        .es-clear {
          position: absolute; top: 50%; right: 8px; transform: translateY(-50%);
          width: 20px; height: 20px; line-height: 18px; text-align: center;
          border: none; border-radius: 50%; cursor: pointer; padding: 0;
          font-size: 16px; background: transparent;
        }
        .es-list {
          position: absolute; z-index: 40; top: calc(100% + 4px); left: 0; right: 0;
          margin: 0; padding: 4px; list-style: none; border-radius: 10px;
          max-height: 240px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,.28);
        }
        .es-list li { margin: 0; }
        .es-opt {
          display: block; width: 100%; text-align: left; padding: 9px 12px;
          border: none; background: transparent; cursor: pointer; border-radius: 7px;
          font-size: 14px; font-family: 'DM Sans', sans-serif;
        }

        /* Variante oscura (ventas) */
        .es-dark .es-input { background: transparent; color: #EDE8DC; border: 1px solid rgba(237,232,220,0.12); }
        .es-dark .es-input::placeholder { color: #7A7060; }
        .es-dark .es-input:focus { border-color: #3A6A48; }
        .es-dark .es-clear { color: #7A7060; }
        .es-dark .es-list { background: #1c1a17; border: 1px solid rgba(237,232,220,0.14); }
        .es-dark .es-opt { color: #EDE8DC; }
        .es-dark .es-opt:hover, .es-dark .es-opt-active { background: rgba(58,106,72,0.28); }

        /* Variante clara (alquileres) */
        .es-light .es-input { background: #fff; color: #141414; border: 1px solid rgba(20,20,20,0.14); }
        .es-light .es-input::placeholder { color: #9a9384; }
        .es-light .es-input:focus { border-color: #3A6A48; }
        .es-light .es-clear { color: #9a9384; }
        .es-light .es-list { background: #fff; border: 1px solid rgba(20,20,20,0.12); }
        .es-light .es-opt { color: #141414; }
        .es-light .es-opt:hover, .es-light .es-opt-active { background: rgba(58,106,72,0.12); }
      `}</style>
    </div>
  )
}
