// Barra fina de progreso superior durante navegaciones de Next.js.
// Suscribe a router.events (routeChangeStart / Complete / Error) y
// muestra una franja de 2px que crece de 0% a ~85% durante la carga,
// completa al 100% al terminar y desaparece. Patrón estilo NProgress
// pero sin lib externa (cero deps adicionales).
//
// Beneficio principal: cuando el broker prospect cambia entre Ventas
// y Alquileres en /broker/demo, hay un fetch grande que tarda ~1-2s.
// Sin feedback visual, parece que la pestaña se trabó. Con la barra,
// queda claro que algo está pasando.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

export default function RouteProgressBar() {
  const router = useRouter()
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let resetTimer: ReturnType<typeof setTimeout> | null = null

    const start = () => {
      if (resetTimer) {
        clearTimeout(resetTimer)
        resetTimer = null
      }
      setProgress(8)
      // Crece progresivamente hasta ~85% mientras carga. La curva
      // asintótica imita NProgress: cada tick suma menos.
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev === null) return 8
          if (prev >= 85) return 85
          const delta = (90 - prev) * 0.08
          return Math.min(85, prev + delta)
        })
      }, 200)
    }

    const finish = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      setProgress(100)
      // Mantener 100% visible un instante, después desmontar.
      resetTimer = setTimeout(() => setProgress(null), 220)
    }

    router.events.on('routeChangeStart', start)
    router.events.on('routeChangeComplete', finish)
    router.events.on('routeChangeError', finish)

    return () => {
      router.events.off('routeChangeStart', start)
      router.events.off('routeChangeComplete', finish)
      router.events.off('routeChangeError', finish)
      if (timer) clearInterval(timer)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [router.events])

  if (progress === null) return null

  return (
    <div className="rpb" aria-hidden="true">
      <div className="rpb-bar" style={{ width: `${progress}%` }} />
      <style jsx>{`
        .rpb {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          z-index: 2147483647;
          pointer-events: none;
          background: transparent;
        }
        .rpb-bar {
          height: 100%;
          background: linear-gradient(90deg, #3A6A48 0%, #6BA876 50%, #3A6A48 100%);
          box-shadow: 0 0 8px rgba(58, 106, 72, 0.45);
          transition: width 240ms ease;
        }
      `}</style>
    </div>
  )
}
