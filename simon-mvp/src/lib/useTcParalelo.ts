import { useState, useEffect } from 'react'

// TC paralelo del día (config_global.tipo_cambio_paralelo, vía /api/tc-actual).
// Cache a nivel módulo → una sola llamada por sesión aunque lo usen varios
// componentes (los dos filtros, mobile + desktop). Fallback prudente si falla.
let cached: number | null = null

export function useTcParalelo(fallback = 10.6): number {
  const [tc, setTc] = useState<number>(cached ?? fallback)
  useEffect(() => {
    if (cached != null) { setTc(cached); return }
    let alive = true
    fetch('/api/tc-actual')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const v = d?.tcParalelo
        if (alive && typeof v === 'number' && v > 0) { cached = v; setTc(v) }
      })
      .catch(() => { /* fallback ya está en el estado */ })
    return () => { alive = false }
  }, [])
  return tc
}
