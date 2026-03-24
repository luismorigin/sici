import Link from 'next/link'
import type { Snapshot24h, MicrozonaData } from '@/lib/supabase'

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

interface MarketLensPremiumProps {
  snapshot: Snapshot24h
  microzonas: MicrozonaData[]
}

export default function MarketLensPremium({ snapshot, microzonas }: MarketLensPremiumProps) {
  // Mejor valor (precio_m2 mas bajo)
  const mejorValor = [...microzonas].sort((a, b) => a.precio_m2 - b.precio_m2)[0]
  // Mayor stock
  const mayorStock = [...microzonas].sort((a, b) => b.total - a.total)[0]

  return (
    <section id="mercado" className="bg-s-arena py-32">
      <div className="max-w-6xl mx-auto px-4 md:px-8">
        <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-center">
          <div>
            {/* Label */}
            <div className="flex items-center gap-4 mb-8">
              <span className="w-8 h-px bg-s-salvia" />
              <span className="text-s-piedra text-[0.7rem] tracking-[3px] uppercase flex items-center gap-2 font-s-body">
                Market Lens
                <span className="w-2 h-2 bg-s-salvia rounded-full animate-pulse" />
              </span>
            </div>

            <h2 className="font-s-display text-s-negro text-4xl md:text-5xl font-medium leading-tight mb-8">
              Datos del mercado<br />
              <span className="italic text-s-tinta">en tiempo real</span>
            </h2>

            <p className="text-s-piedra text-lg font-s-body font-light leading-relaxed mb-8">
              Monitoreamos el mercado inmobiliario de Equipetrol 24/7.
              Sabemos cuando baja un precio, cuando aparece una nueva propiedad,
              y cual es el valor justo de cada metro cuadrado.
            </p>

            {/* Insights rapidos */}
            <div className="space-y-4 mb-12">
              <div className="flex items-start gap-3">
                <span className="text-s-salvia mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-s-piedra font-s-body font-light">
                  <span className="text-s-negro font-medium">{mejorValor?.zona}</span>: Mejor relacion precio/m2 (<span className="font-s-mono">${mejorValor?.precio_m2.toLocaleString('es-BO')}/m2</span>)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-s-salvia mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-s-piedra font-s-body font-light">
                  <span className="text-s-negro font-medium">{mayorStock?.zona}</span>: Mayor oferta disponible (<span className="font-s-mono">{mayorStock?.total} unidades</span>)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-s-salvia mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-s-piedra font-s-body font-light">
                  <span className="text-s-negro font-medium">TC Paralelo</span>: <span className="font-s-mono">Bs {snapshot.tc_actual.toFixed(2)}</span> ({snapshot.tc_variacion > 0 ? '+' : ''}{snapshot.tc_variacion}% vs ayer)
                </p>
              </div>
            </div>

            <Link href="/mercado/equipetrol" prefetch={false}>
              <button className="bg-s-negro text-s-arena px-10 py-4 text-xs tracking-[3px] uppercase hover:bg-s-salvia transition-all duration-300 flex items-center gap-4 font-s-body">
                Ver datos del mercado
                <IconArrowRight />
              </button>
            </Link>
          </div>

          {/* Stats Box — acento negro */}
          <div className="bg-s-negro p-8 md:p-12 rounded-2xl">
            <div className="space-y-8">
              <div className="flex justify-between items-end pb-6 border-b border-s-dark-3/20">
                <span className="text-s-dark-3 text-sm tracking-wide font-s-body">Precio promedio /m2</span>
                <span className="font-s-mono text-3xl text-s-dark-1">
                  ${snapshot.precio_m2_promedio.toLocaleString('es-BO')}
                </span>
              </div>
              <div className="flex justify-between items-end pb-6 border-b border-s-dark-3/20">
                <span className="text-s-dark-3 text-sm tracking-wide font-s-body">Propiedades activas</span>
                <span className="font-s-mono text-3xl text-s-dark-1">{snapshot.total_activas}</span>
              </div>
              <div className="flex justify-between items-end pb-6 border-b border-s-dark-3/20">
                <span className="text-s-dark-3 text-sm tracking-wide font-s-body">TC Paralelo</span>
                <span className="font-s-mono text-3xl text-s-dark-1">{snapshot.tc_actual.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-end pb-6 border-b border-s-dark-3/20">
                <span className="text-s-dark-3 text-sm tracking-wide font-s-body">Proyectos monitoreados</span>
                <span className="font-s-mono text-3xl text-s-dark-1">{snapshot.proyectos_monitoreados}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-s-dark-3 text-sm tracking-wide font-s-body">Actualizado</span>
                <span className="text-s-dark-2 text-sm font-s-body">En tiempo real</span>
              </div>
            </div>
            <p className="mt-6 text-s-dark-3/60 text-[0.65rem] leading-relaxed font-s-body">
              Incluye todo Equipetrol sin filtros de vigencia.{' '}
              <Link href="/mercado/equipetrol" className="underline hover:text-s-dark-2" prefetch={false}>
                Ver análisis filtrado
              </Link>.
            </p>
          </div>
        </div>

        {/* Microzonas Grid */}
        <div className="mt-20 pt-16 border-t border-s-arena-mid">
          <div className="flex items-center gap-4 mb-8">
            <span className="w-8 h-px bg-s-salvia" />
            <span className="text-s-piedra text-[0.7rem] tracking-[3px] uppercase font-s-body">Microzonas Equipetrol</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {microzonas.slice(0, 5).map((zona) => (
              <div
                key={zona.zona}
                className="bg-s-blanco p-6 border border-s-arena-mid hover:border-s-salvia/40 transition-colors rounded-lg"
              >
                <div className="text-s-negro font-s-body font-medium text-sm mb-4">{zona.zona}</div>
                <div className="font-s-mono text-2xl text-s-negro mb-1">
                  ${zona.precio_m2.toLocaleString('es-BO')}
                </div>
                <div className="text-s-piedra text-xs tracking-wide uppercase font-s-body">por m2</div>
                <div className="mt-4 pt-4 border-t border-s-arena-mid flex justify-between text-xs text-s-piedra font-s-mono">
                  <span>{zona.total} unidades</span>
                  <span>{zona.proyectos} proyectos</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
