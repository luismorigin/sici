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

      if (propCount !== null) setPropertyCount(propCount)
      if (projCount !== null) setProjectCount(projCount)
    }

    fetchCounts()
  }, [])

  return (
    <section className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
      {/* Linea decorativa superior */}
      <div className="absolute top-0 left-1/2 w-px h-32 bg-gradient-to-b from-transparent to-[#c9a959]/30" />

      <div className="max-w-5xl mx-auto px-8 text-center pt-20">
        {/* Label */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <span className="w-12 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
            Inteligencia Inmobiliaria
          </span>
          <span className="w-12 h-px bg-[#c9a959]" />
        </div>

        {/* Titulo principal */}
        <h1 className="font-display text-white text-6xl md:text-8xl font-light leading-[0.95] tracking-tight mb-8">
          Tu proximo<br />
          <span className="italic text-[#c9a959]">departamento</span><br />
          en Equipetrol
        </h1>

        {/* Subtitulo */}
        <p className="text-white/60 text-lg font-light max-w-2xl mx-auto mb-16 leading-relaxed">
          Deja que la inteligencia artificial analice el mercado por vos.
          Recibi solo las 3 mejores opciones, con datos verificados.
        </p>

        {/* CTA */}
        <Link href="/filtros" className="group inline-block">
          <button className="bg-white text-[#0a0a0a] px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300 flex items-center gap-4 mx-auto">
            Comenzar busqueda
            <IconArrowRight />
          </button>
        </Link>

        {/* Stats minimalistas */}
        <div className="flex items-center justify-center gap-8 md:gap-16 mt-24 pt-16 border-t border-white/10">
          <div className="text-center">
            <div className="font-display text-4xl text-white font-light">
              {propertyCount ?? '...'}
            </div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Propiedades</div>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div className="text-center">
            <div className="font-display text-4xl text-white font-light">
              {projectCount ?? '...'}
            </div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Proyectos</div>
          </div>
          <div className="w-px h-12 bg-white/10" />
          <div className="text-center">
            <div className="font-display text-4xl text-[#c9a959] font-light">100%</div>
            <div className="text-white/40 text-xs tracking-[2px] uppercase mt-2">Verificados</div>
          </div>
        </div>
      </div>

      {/* Linea decorativa inferior */}
      <div className="absolute bottom-0 left-1/2 w-px h-24 bg-gradient-to-t from-transparent to-white/10" />
    </section>
  )
}
