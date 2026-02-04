import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'

interface FiltrosNivel1 {
  presupuesto: number
  zonas: string[]
  dormitorios: number | null
  estado_entrega: string
  forma_pago: string
  count: number
}

interface FormularioNivel2 {
  innegociables: string[]
  deseables: string[]
  necesita_parqueo: boolean
  necesita_baulera: boolean
  calidad_vs_precio: number
  amenidades_vs_metros: number
  cantidad_resultados: 3 | 5 | 10 | 'todas' | null
}

const INNEGOCIABLES = [
  { id: 'pet_friendly', label: 'Pet friendly' },
  { id: 'piscina', label: 'Piscina' },
  { id: 'gimnasio', label: 'Gimnasio' },
]

const DESEABLES = [
  { id: 'terraza_comun', label: 'Terraza comun' },
  { id: 'sauna_jacuzzi', label: 'Sauna / Jacuzzi' },
  { id: 'cowork', label: 'Co-working' },
  { id: 'sum', label: 'Salon eventos' },
  { id: 'churrasquera', label: 'Churrasquera' },
  { id: 'area_ninos', label: 'Area ninos' },
]

export default function FormularioV2() {
  const router = useRouter()
  const {
    presupuesto, zonas, dormitorios, estado_entrega, forma_pago, count,
    // Params nivel 2 (vienen de "Editar todo")
    innegociables: innegociablesParam,
    deseables: deseablesParam,
    necesita_parqueo: necesitaParqueoParam,
    necesita_baulera: necesitaBauleraParam,
    calidad_vs_precio: calidadVsPrecioParam,
    amenidades_vs_metros: amenidadesVsMetrosParam,
    cantidad_resultados: cantidadResultadosParam,
  } = router.query

  const filtrosNivel1: FiltrosNivel1 = {
    presupuesto: parseInt(presupuesto as string) || 150000,
    zonas: (zonas as string)?.split(',').filter(Boolean) || [],
    dormitorios: dormitorios ? parseInt(dormitorios as string) : null,
    estado_entrega: (estado_entrega as string) || 'no_importa',
    forma_pago: (forma_pago as string) || 'no_se',
    count: parseInt(count as string) || 0,
  }

  const [form, setForm] = useState<FormularioNivel2>({
    innegociables: [],
    deseables: [],
    necesita_parqueo: true,
    necesita_baulera: false,
    calidad_vs_precio: 3,
    amenidades_vs_metros: 3,
    cantidad_resultados: null,
  })

  const [submitting, setSubmitting] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Pre-cargar selecciones desde URL (cuando vienen de "Editar todo")
  useEffect(() => {
    if (!router.isReady || initialized) return

    const newForm: FormularioNivel2 = { ...form }
    let hasChanges = false

    if (innegociablesParam && (innegociablesParam as string).length > 0) {
      newForm.innegociables = (innegociablesParam as string).split(',').filter(Boolean)
      hasChanges = true
    }

    if (deseablesParam && (deseablesParam as string).length > 0) {
      newForm.deseables = (deseablesParam as string).split(',').filter(Boolean)
      hasChanges = true
    }

    if (necesitaParqueoParam !== undefined) {
      newForm.necesita_parqueo = necesitaParqueoParam === 'true'
      hasChanges = true
    }

    if (necesitaBauleraParam !== undefined) {
      newForm.necesita_baulera = necesitaBauleraParam === 'true'
      hasChanges = true
    }

    if (calidadVsPrecioParam) {
      const parsed = parseInt(calidadVsPrecioParam as string)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        newForm.calidad_vs_precio = parsed
        hasChanges = true
      }
    }

    if (amenidadesVsMetrosParam) {
      const parsed = parseInt(amenidadesVsMetrosParam as string)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        newForm.amenidades_vs_metros = parsed
        hasChanges = true
      }
    }

    if (cantidadResultadosParam) {
      if (cantidadResultadosParam === 'todas') {
        newForm.cantidad_resultados = 'todas'
        hasChanges = true
      } else {
        const parsed = parseInt(cantidadResultadosParam as string)
        if (!isNaN(parsed) && [3, 5, 10].includes(parsed)) {
          newForm.cantidad_resultados = parsed as 3 | 5 | 10
          hasChanges = true
        }
      }
    }

    if (hasChanges) {
      setForm(newForm)
    }

    setInitialized(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, initialized])

  const handleInnegociable = (id: string) => {
    setForm(prev => {
      if (prev.innegociables.includes(id)) {
        return { ...prev, innegociables: prev.innegociables.filter(i => i !== id) }
      }
      if (prev.innegociables.length >= 3) return prev
      return { ...prev, innegociables: [...prev.innegociables, id] }
    })
  }

  const handleDeseable = (id: string) => {
    setForm(prev => {
      if (prev.deseables.includes(id)) {
        return { ...prev, deseables: prev.deseables.filter(i => i !== id) }
      }
      return { ...prev, deseables: [...prev.deseables, id] }
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    const params = new URLSearchParams({
      presupuesto: filtrosNivel1.presupuesto.toString(),
      zonas: filtrosNivel1.zonas.join(','),
      dormitorios: filtrosNivel1.dormitorios?.toString() || '',
      estado_entrega: filtrosNivel1.estado_entrega,
      forma_pago: filtrosNivel1.forma_pago,
      count: filtrosNivel1.count.toString(),
      innegociables: form.innegociables.join(','),
      deseables: form.deseables.join(','),
      necesita_parqueo: form.necesita_parqueo.toString(),
      necesita_baulera: form.necesita_baulera.toString(),
      calidad_vs_precio: form.calidad_vs_precio.toString(),
      amenidades_vs_metros: form.amenidades_vs_metros.toString(),
      cantidad_resultados: form.cantidad_resultados?.toString() || '',
    })

    router.push(`/resultados-v2?${params.toString()}`)
  }

  const isFormValid = form.cantidad_resultados !== null

  return (
    <>
      <Head>
        <title>Personalizar Busqueda | Simon</title>
      </Head>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Manrope:wght@300;400;500;600&display=swap');
        .font-display { font-family: 'Cormorant Garamond', Georgia, serif; }
        body { font-family: 'Manrope', -apple-system, sans-serif; }
      `}</style>

      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Header */}
        <header className="fixed top-0 w-full z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
              Simon
            </Link>
            <Link href="/filtros-v2" className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Volver a filtros
            </Link>
          </div>
        </header>

        <main className="pt-32 pb-20 px-8">
          <div className="max-w-2xl mx-auto">
            {/* Label */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <span className="w-12 h-px bg-[#c9a959]" />
              <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
                Paso 2 de 2
              </span>
              <span className="w-12 h-px bg-[#c9a959]" />
            </div>

            {/* Title */}
            <h1 className="font-display text-white text-4xl md:text-5xl font-light text-center mb-4">
              Personaliza tu<br />
              <span className="italic text-[#c9a959]">busqueda</span>
            </h1>

            <p className="text-white/50 text-center font-light mb-12">
              Basado en {filtrosNivel1.count} propiedades que cumplen tus filtros
            </p>

            {/* Form */}
            <div className="space-y-12">
              {/* Innegociables */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-8 h-px bg-[#c9a959]" />
                  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Sin esto NO me interesa</span>
                </div>

                <p className="text-white/40 text-sm mb-4">
                  Maximo 3. Las opciones sin estos quedan al final del ranking.
                </p>

                <div className="flex flex-wrap gap-3">
                  {INNEGOCIABLES.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleInnegociable(item.id)}
                      className={`px-6 py-3 border transition-all duration-300 ${
                        form.innegociables.includes(item.id)
                          ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                          : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <p className="text-white/30 text-xs mt-3">
                  {form.innegociables.length}/3 seleccionados
                </p>
              </section>

              {/* Deseables */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-8 h-px bg-[#c9a959]" />
                  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Seria un plus</span>
                </div>

                <p className="text-white/40 text-sm mb-4">
                  Suma puntos en el ranking pero no descarta opciones.
                </p>

                <div className="flex flex-wrap gap-3">
                  {DESEABLES.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleDeseable(item.id)}
                      className={`px-6 py-3 border transition-all duration-300 ${
                        form.deseables.includes(item.id)
                          ? 'border-emerald-500 bg-emerald-500/10 text-white'
                          : 'border-white/10 text-white/60 hover:border-emerald-500/50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Parqueo y Baulera */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-8 h-px bg-[#c9a959]" />
                  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Para calcular precio real</span>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-white/10">
                    <span className="text-white/70">Necesitas estacionamiento?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setForm(prev => ({ ...prev, necesita_parqueo: true }))}
                        className={`px-4 py-2 border transition-all ${
                          form.necesita_parqueo
                            ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                            : 'border-white/10 text-white/50'
                        }`}
                      >
                        Si
                      </button>
                      <button
                        onClick={() => setForm(prev => ({ ...prev, necesita_parqueo: false }))}
                        className={`px-4 py-2 border transition-all ${
                          !form.necesita_parqueo
                            ? 'border-white/30 bg-white/5 text-white'
                            : 'border-white/10 text-white/50'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border border-white/10">
                    <span className="text-white/70">Necesitas baulera?</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setForm(prev => ({ ...prev, necesita_baulera: true }))}
                        className={`px-4 py-2 border transition-all ${
                          form.necesita_baulera
                            ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                            : 'border-white/10 text-white/50'
                        }`}
                      >
                        Si
                      </button>
                      <button
                        onClick={() => setForm(prev => ({ ...prev, necesita_baulera: false }))}
                        className={`px-4 py-2 border transition-all ${
                          !form.necesita_baulera
                            ? 'border-white/30 bg-white/5 text-white'
                            : 'border-white/10 text-white/50'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Trade-offs */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-8 h-px bg-[#c9a959]" />
                  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Tus preferencias</span>
                </div>

                {/* Amenidades vs Precio */}
                <div className="mb-8">
                  <p className="text-white/70 mb-4">Amenidades vs Precio</p>
                  <div className="flex items-center gap-4">
                    <span className="text-white/40 text-sm w-28">Mas amenidades</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={form.calidad_vs_precio}
                      onChange={e => setForm(prev => ({ ...prev, calidad_vs_precio: parseInt(e.target.value) }))}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none
                                 [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4
                                 [&::-webkit-slider-thumb]:rounded-full
                                 [&::-webkit-slider-thumb]:bg-white
                                 [&::-webkit-slider-thumb]:border-2
                                 [&::-webkit-slider-thumb]:border-[#c9a959]"
                    />
                    <span className="text-white/40 text-sm w-28 text-right">Mejor precio</span>
                  </div>
                </div>

                {/* Amenidades vs Metros */}
                <div>
                  <p className="text-white/70 mb-4">Amenidades vs Metros cuadrados</p>
                  <div className="flex items-center gap-4">
                    <span className="text-white/40 text-sm w-28">Mas amenidades</span>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={form.amenidades_vs_metros}
                      onChange={e => setForm(prev => ({ ...prev, amenidades_vs_metros: parseInt(e.target.value) }))}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer
                                 [&::-webkit-slider-thumb]:appearance-none
                                 [&::-webkit-slider-thumb]:w-4
                                 [&::-webkit-slider-thumb]:h-4
                                 [&::-webkit-slider-thumb]:rounded-full
                                 [&::-webkit-slider-thumb]:bg-white
                                 [&::-webkit-slider-thumb]:border-2
                                 [&::-webkit-slider-thumb]:border-[#c9a959]"
                    />
                    <span className="text-white/40 text-sm w-28 text-right">Mas metros</span>
                  </div>
                </div>
              </section>

              {/* Cantidad de resultados */}
              <section>
                <div className="flex items-center gap-4 mb-6">
                  <span className="w-8 h-px bg-[#c9a959]" />
                  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Cuantas opciones queres ver?</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button
                    onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 3 }))}
                    className={`p-4 border transition-all ${
                      form.cantidad_resultados === 3
                        ? 'border-[#c9a959] bg-[#c9a959]/10'
                        : 'border-white/10 hover:border-[#c9a959]/50'
                    }`}
                  >
                    <span className="block text-white font-display text-2xl">3</span>
                    <span className="block text-white/40 text-xs mt-1">Enfocado</span>
                  </button>

                  {filtrosNivel1.count >= 5 && (
                    <button
                      onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 5 }))}
                      className={`p-4 border transition-all ${
                        form.cantidad_resultados === 5
                          ? 'border-[#c9a959] bg-[#c9a959]/10'
                          : 'border-white/10 hover:border-[#c9a959]/50'
                      }`}
                    >
                      <span className="block text-white font-display text-2xl">5</span>
                      <span className="block text-white/40 text-xs mt-1">Balance</span>
                    </button>
                  )}

                  {filtrosNivel1.count > 10 && (
                    <button
                      onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 10 }))}
                      className={`p-4 border transition-all ${
                        form.cantidad_resultados === 10
                          ? 'border-[#c9a959] bg-[#c9a959]/10'
                          : 'border-white/10 hover:border-[#c9a959]/50'
                      }`}
                    >
                      <span className="block text-white font-display text-2xl">10</span>
                      <span className="block text-white/40 text-xs mt-1">Comparar</span>
                    </button>
                  )}

                  <button
                    onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 'todas' }))}
                    className={`p-4 border transition-all ${
                      form.cantidad_resultados === 'todas'
                        ? 'border-[#c9a959] bg-[#c9a959]/10'
                        : 'border-white/10 hover:border-[#c9a959]/50'
                    }`}
                  >
                    <span className="block text-white font-display text-2xl">{filtrosNivel1.count}</span>
                    <span className="block text-white/40 text-xs mt-1">Todas</span>
                  </button>
                </div>
              </section>

              {/* CTA */}
              <div className="border-t border-white/10 pt-12">
                <button
                  onClick={handleSubmit}
                  disabled={!isFormValid || submitting}
                  className="w-full bg-white text-[#0a0a0a] py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Analizando...' : 'Ver mis mejores opciones'}
                </button>

                {!isFormValid && (
                  <p className="text-[#c9a959] text-sm text-center mt-4">
                    Elegi cuantas opciones queres ver para continuar
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
