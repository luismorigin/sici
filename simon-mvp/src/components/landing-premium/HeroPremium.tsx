import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export default function HeroPremium() {
  const [propertyCount, setPropertyCount] = useState<number | null>(null)
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const [avgPriceM2, setAvgPriceM2] = useState<number | null>(null)

  useEffect(() => {
    const fetchCounts = async () => {
      if (!supabase) return

      // Propiedades activas
      const { count: propCount } = await supabase
        .from('propiedades_v2')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completado')
        .eq('tipo_operacion', 'venta')
        .gte('area_total_m2', 20)

      // Proyectos activos
      const { count: projCount } = await supabase
        .from('proyectos_master')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true)

      // Precio promedio /m2
      const { data: priceData } = await supabase
        .from('propiedades_v2')
        .select('precio_usd, area_total_m2')
        .eq('status', 'completado')
        .eq('tipo_operacion', 'venta')
        .gte('area_total_m2', 20)
        .gte('precio_usd', 30000)

      if (propCount !== null) setPropertyCount(propCount)
      if (projCount !== null) setProjectCount(projCount)

      if (priceData && priceData.length > 0) {
        const validPrices = priceData
          .filter((p: any) => p.precio_usd > 0 && p.area_total_m2 > 0)
          .map((p: any) => p.precio_usd / p.area_total_m2)
          .filter((pm2: number) => pm2 >= 800 && pm2 <= 5000)

        if (validPrices.length > 0) {
          const avg = validPrices.reduce((a: number, b: number) => a + b, 0) / validPrices.length
          setAvgPriceM2(Math.round(avg))
        }
      }
    }

    fetchCounts()
  }, [])

  return (
    <section className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
      {/* Linea decorativa superior */}
      <div className="absolute top-0 left-1/2 w-px h-32 bg-gradient-to-b from-transparent to-[#c9a959]/30" />

      <div className="max-w-5xl mx-auto px-4 md:px-8 text-center pt-20">
        {/* Pre-headline */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className="w-12 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
            Inteligencia Inmobiliaria
          </span>
          <span className="w-12 h-px bg-[#c9a959]" />
        </div>

        {/* Headline */}
        <h1 className="font-display text-white text-5xl md:text-7xl font-light leading-[1.1] tracking-tight mb-8">
          ¿El precio por ese<br />
          <span className="italic text-[#c9a959]">departamento</span> en<br />
          Equipetrol es justo?
        </h1>

        {/* Subheadline */}
        <p className="text-white/60 text-lg font-light max-w-2xl mx-auto mb-12 leading-relaxed">
          Análisis IA contra todo el mercado. Sin vendedores. Sin sesgos. Solo datos.
        </p>

        {/* CTA */}
        <Link href="/filtros-v2" className="group inline-block">
          <button className="bg-white text-[#0a0a0a] px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300 flex items-center gap-4 mx-auto">
            Obtener analisis
            <IconArrowRight />
          </button>
        </Link>

        {/* TC Badge */}
        <div className="mt-4 text-[#c9a959]/80 text-xs tracking-wide flex items-center justify-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Precios en dólares reales (TC oficial)
        </div>

        {/* Badges */}
        <div className="flex items-center justify-center flex-wrap gap-3 md:gap-6 mt-6">
          <span className="text-white/40 text-sm">Sin cuenta</span>
          <span className="text-white/20 hidden md:inline">·</span>
          <span className="text-[#c9a959]/70 text-sm">Datos actualizados diariamente</span>
          <span className="text-white/20 hidden md:inline">·</span>
          <span className="text-white/40 text-sm">100% gratis</span>
        </div>

        {/* Metricas */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 mt-20 pt-16 border-t border-white/10">
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl text-[#c9a959] font-light">
              ${avgPriceM2?.toLocaleString() ?? '...'}
            </div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Precio promedio /m²</div>
          </div>
          <div className="hidden md:block w-px h-12 bg-white/10" />
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl text-white font-light">
              {projectCount ?? '...'}+
            </div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Proyectos activos</div>
          </div>
          <div className="hidden md:block w-px h-12 bg-white/10" />
          <div className="text-center">
            <div className="font-display text-3xl md:text-4xl text-white font-light">24h</div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Actualización diaria</div>
          </div>
        </div>

        {/* Contador de opciones */}
        <div className="mt-8 text-white/30 text-sm">
          {propertyCount ?? '...'} opciones disponibles hoy
        </div>
      </div>

      {/* Linea decorativa inferior */}
      <div className="absolute bottom-0 left-1/2 w-px h-24 bg-gradient-to-t from-transparent to-white/10" />
    </section>
  )
}
