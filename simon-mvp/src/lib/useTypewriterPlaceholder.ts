import { RefObject, useEffect } from 'react'

// Placeholder "typewriter": escribe/borra ejemplos reales en el input, en loop.
// Escribe el atributo `placeholder` por REF (DOM directo) → cero re-renders del
// árbol (el feed no se re-pinta cada tick). Requiere que el input NO tenga un
// prop `placeholder` estático en el JSX (React lo pisaría en cada render).
// Respeta prefers-reduced-motion (placeholder estático = primer ejemplo).
export function useTypewriterPlaceholder(
  ref: RefObject<HTMLInputElement | null>,
  phrases: string[],
  prefix = '',
  suffix = '',
) {
  useEffect(() => {
    const el = ref.current
    if (!el || phrases.length === 0 || typeof window === 'undefined') return
    const set = (s: string) => el.setAttribute('placeholder', prefix + s + suffix)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { set(phrases[0]); return }

    let i = 0, pos = 0, phase: 'type' | 'hold' | 'delete' = 'type'
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const p = phrases[i % phrases.length]
      if (phase === 'type') {
        pos++; set(p.slice(0, pos))
        if (pos >= p.length) { phase = 'hold'; timer = setTimeout(tick, 1700) }
        else timer = setTimeout(tick, 55)
      } else if (phase === 'hold') {
        phase = 'delete'; timer = setTimeout(tick, 40)
      } else {
        pos--; set(p.slice(0, Math.max(0, pos)))
        if (pos <= 0) { phase = 'type'; i++; timer = setTimeout(tick, 450) }
        else timer = setTimeout(tick, 28)
      }
    }
    set('')
    timer = setTimeout(tick, 700)
    return () => clearTimeout(timer)
  }, [ref, phrases, prefix, suffix])
}
