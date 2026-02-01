import { useEffect, useState } from 'react'
import Link from 'next/link'
import { obtenerSnapshot24h, obtenerMicrozonas, type Snapshot24h, type MicrozonaData } from '@/lib/supabase'

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

// Fallback con datos REALES de Enero 2026
const demoSnapshot: Snapshot24h = {
  nuevos: 8,
  retirados: 1,
  bajadas_precio: 0,
  tc_actual: 9.72,
  tc_variacion: 0.52,
  precio_m2_promedio: 2022,
  score_bajo: 18,
  props_tc_paralelo: 42,
  dias_mediana_equipetrol: 51,
  unidades_equipetrol_2d: 31,
  total_activas: 370,
  proyectos_monitoreados: 189
}

const demoMicrozonas: MicrozonaData[] = [
  { zona: 'Eq. Centro', total: 98, precio_promedio: 156709, precio_m2: 2098, proyectos: 41, categoria: 'standard' },
  { zona: 'Villa Brigida', total: 67, precio_promedio: 71838, precio_m2: 1495, proyectos: 16, categoria: 'value' },
  { zona: 'Sirari', total: 47, precio_promedio: 199536, precio_m2: 2258, proyectos: 13, categoria: 'premium' },
  { zona: 'Eq. Norte/Norte', total: 19, precio_promedio: 153354, precio_m2: 2340, proyectos: 11, categoria: 'premium' },
  { zona: 'Eq. Oeste (Busch)', total: 16, precio_promedio: 277350, precio_m2: 2122, proyectos: 9, categoria: 'premium' }
]

export default function MarketLensPremium() {
  const [snapshot, setSnapshot] = useState<Snapshot24h>(demoSnapshot)
  const [microzonas, setMicrozonas] = useState<MicrozonaData[]>(demoMicrozonas)
  const [usingRealData, setUsingRealData] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      const [snapshotData, microzonasData] = await Promise.all([
        obtenerSnapshot24h(),
        obtenerMicrozonas()
      ])

      if (snapshotData) {
        setSnapshot(snapshotData)
        setUsingRealData(true)
      }
      if (microzonasData.length > 0) {
        setMicrozonas(microzonasData)
      }
    }
    fetchData()
  }, [])

  // Mejor valor (precio_m2 mas bajo)
  const mejorValor = [...microzonas].sort((a, b) => a.precio_m2 - b.precio_m2)[0]
  // Mayor stock
  const mayorStock = [...microzonas].sort((a, b) => b.total - a.total)[0]

  return (
    <section id="mercado" className="bg-[#f8f6f3] py-32">
      <div className="max-w-6xl mx-auto px-8">
        <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-center">
          <div>
            {/* Label */}
            <div className="flex items-center gap-4 mb-8">
              <span className="w-8 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase flex items-center gap-2">
                Market Lens
                {usingRealData && (
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                )}
              </span>
            </div>

            <h2 className="font-display text-[#0a0a0a] text-4xl md:text-5xl font-light leading-tight mb-8">
              Datos del mercado<br />
              <span className="italic">en tiempo real</span>
            </h2>

            <p className="text-[#666666] text-lg font-light leading-relaxed mb-8">
              Monitoreamos el mercado inmobiliario de Equipetrol 24/7.
              Sabemos cuando baja un precio, cuando aparece una nueva propiedad,
              y cual es el valor justo de cada metro cuadrado.
            </p>

            {/* Insights rapidos */}
            <div className="space-y-4 mb-12">
              <div className="flex items-start gap-3">
                <span className="text-[#c9a959]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-[#666666] font-light">
                  <span className="text-[#0a0a0a] font-medium">{mejorValor?.zona}</span>: Mejor relacion precio/m2 (${mejorValor?.precio_m2.toLocaleString('es-BO')}/m2)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[#c9a959]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-[#666666] font-light">
                  <span className="text-[#0a0a0a] font-medium">{mayorStock?.zona}</span>: Mayor oferta disponible ({mayorStock?.total} unidades)
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[#c9a959]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <p className="text-[#666666] font-light">
                  <span className="text-[#0a0a0a] font-medium">TC Paralelo</span>: Bs {snapshot.tc_actual.toFixed(2)} ({snapshot.tc_variacion > 0 ? '+' : ''}{snapshot.tc_variacion}% vs ayer)
                </p>
              </div>
            </div>

            <Link href="/filtros">
              <button className="bg-[#0a0a0a] text-white px-10 py-4 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] transition-all duration-300 flex items-center gap-4">
                Ver datos del mercado
                <IconArrowRight />
              </button>
            </Link>
          </div>

          {/* Stats Box */}
          <div className="bg-[#0a0a0a] p-8 md:p-12">
            <div className="space-y-8">
              <div className="flex justify-between items-end pb-6 border-b border-white/10">
                <span className="text-white/50 text-sm tracking-wide">Precio promedio /m2</span>
                <span className="font-display text-3xl text-white">
                  ${snapshot.precio_m2_promedio.toLocaleString('es-BO')}
                </span>
              </div>
              <div className="flex justify-between items-end pb-6 border-b border-white/10">
                <span className="text-white/50 text-sm tracking-wide">Propiedades activas</span>
                <span className="font-display text-3xl text-white">{snapshot.total_activas}</span>
              </div>
              <div className="flex justify-between items-end pb-6 border-b border-white/10">
                <span className="text-white/50 text-sm tracking-wide">TC Paralelo</span>
                <span className="font-display text-3xl text-[#c9a959]">{snapshot.tc_actual.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-end pb-6 border-b border-white/10">
                <span className="text-white/50 text-sm tracking-wide">Proyectos monitoreados</span>
                <span className="font-display text-3xl text-white">{snapshot.proyectos_monitoreados}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-white/50 text-sm tracking-wide">Actualizado</span>
                <span className="text-white/70 text-sm">En tiempo real</span>
              </div>
            </div>
          </div>
        </div>

        {/* Microzonas Grid */}
        <div className="mt-20 pt-16 border-t border-[#0a0a0a]/10">
          <div className="flex items-center gap-4 mb-8">
            <span className="w-8 h-px bg-[#c9a959]" />
            <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Microzonas Equipetrol</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {microzonas.slice(0, 5).map((zona) => (
              <div
                key={zona.zona}
                className="bg-white p-6 border border-[#0a0a0a]/10 hover:border-[#c9a959]/50 transition-colors"
              >
                <div className="text-[#0a0a0a] font-medium text-sm mb-4">{zona.zona}</div>
                <div className="font-display text-2xl text-[#0a0a0a] mb-1">
                  ${zona.precio_m2.toLocaleString('es-BO')}
                </div>
                <div className="text-[#999999] text-xs tracking-wide uppercase">por m2</div>
                <div className="mt-4 pt-4 border-t border-[#0a0a0a]/10 flex justify-between text-xs text-[#666666]">
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
