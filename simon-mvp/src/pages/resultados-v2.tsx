import { useState, useEffect, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { buscarUnidadesReales, UnidadReal, FiltrosBusqueda } from '@/lib/supabase'
import { PropertyCardPremium, ResultsHeaderPremium } from '@/components/results-premium'
import { premiumFonts } from '@/styles/premium-theme'

// Mapeo de IDs de innegociables a nombres de amenidades
const INNEGOCIABLE_TO_AMENIDAD: Record<string, string> = {
  'pet_friendly': 'Pet friendly',
  'piscina': 'Piscina',
  'gimnasio': 'Gimnasio',
  'terraza_comun': 'Terraza comun',
  'sauna_jacuzzi': 'Sauna',
  'cowork': 'Cowork',
  'sum': 'Salon de eventos',
  'churrasquera': 'Churrasquera',
  'area_ninos': 'Area ninos',
}

export default function ResultadosV2() {
  const router = useRouter()
  const [propiedades, setPropiedades] = useState<UnidadReal[]>([])
  const [loading, setLoading] = useState(true)
  const [filtrosActivos, setFiltrosActivos] = useState<{
    presupuesto: number
    zonas: string[]
    dormitorios: number | null
    estado_entrega: string
  }>({
    presupuesto: 150000,
    zonas: [],
    dormitorios: null,
    estado_entrega: 'no_importa',
  })

  // Datos del formulario nivel 2
  const [datosFormulario, setDatosFormulario] = useState<{
    innegociables: string[]
    necesitaParqueo: boolean
    necesitaBaulera: boolean
  }>({
    innegociables: [],
    necesitaParqueo: true,
    necesitaBaulera: false,
  })

  // Parse URL params
  useEffect(() => {
    if (!router.isReady) return

    const {
      presupuesto,
      zonas,
      dormitorios,
      estado_entrega,
      innegociables,
      necesita_parqueo,
      necesita_baulera,
    } = router.query

    setFiltrosActivos({
      presupuesto: presupuesto ? parseInt(presupuesto as string) : 150000,
      zonas: zonas ? (zonas as string).split(',').filter(Boolean) : [],
      dormitorios: dormitorios ? parseInt(dormitorios as string) : null,
      estado_entrega: (estado_entrega as string) || 'no_importa',
    })

    // Parsear datos del formulario nivel 2
    const innegociablesIds = innegociables ? (innegociables as string).split(',').filter(Boolean) : []
    const innegociablesNombres = innegociablesIds.map(id => INNEGOCIABLE_TO_AMENIDAD[id] || id)

    setDatosFormulario({
      innegociables: innegociablesNombres,
      necesitaParqueo: necesita_parqueo === 'true',
      necesitaBaulera: necesita_baulera === 'true',
    })
  }, [router.isReady, router.query])

  // Fetch properties
  const fetchPropiedades = useCallback(async () => {
    setLoading(true)
    try {
      const filtros: FiltrosBusqueda = {
        precio_max: filtrosActivos.presupuesto,
        limite: 50,
      }

      if (filtrosActivos.dormitorios !== null) {
        filtros.dormitorios = filtrosActivos.dormitorios
      }

      if (filtrosActivos.zonas.length > 0) {
        filtros.zonas_permitidas = filtrosActivos.zonas
      }

      if (filtrosActivos.estado_entrega !== 'no_importa') {
        filtros.estado_entrega = filtrosActivos.estado_entrega as 'entrega_inmediata' | 'solo_preventa'
      }

      const resultados = await buscarUnidadesReales(filtros)
      setPropiedades(resultados)
    } catch (err) {
      console.error('Error fetching propiedades:', err)
    } finally {
      setLoading(false)
    }
  }, [filtrosActivos])

  useEffect(() => {
    if (router.isReady) {
      fetchPropiedades()
    }
  }, [router.isReady, fetchPropiedades])

  // Build filter chips
  const buildFilterChips = () => {
    const chips: { label: string; value: string; onRemove: () => void }[] = []

    if (filtrosActivos.presupuesto !== 150000) {
      chips.push({
        label: `Hasta $${(filtrosActivos.presupuesto / 1000).toFixed(0)}k`,
        value: 'presupuesto',
        onRemove: () => updateFiltro('presupuesto', 150000),
      })
    }

    if (filtrosActivos.dormitorios !== null) {
      chips.push({
        label: `${filtrosActivos.dormitorios} dorm`,
        value: 'dormitorios',
        onRemove: () => updateFiltro('dormitorios', null),
      })
    }

    filtrosActivos.zonas.forEach((zona) => {
      const zonaLabel = {
        equipetrol: 'Eq. Centro',
        sirari: 'Sirari',
        equipetrol_norte: 'Eq. Norte',
        villa_brigida: 'Villa Brigida',
        faremafu: 'Eq. Oeste',
      }[zona] || zona

      chips.push({
        label: zonaLabel,
        value: zona,
        onRemove: () => {
          const newZonas = filtrosActivos.zonas.filter((z) => z !== zona)
          updateFiltro('zonas', newZonas)
        },
      })
    })

    if (filtrosActivos.estado_entrega !== 'no_importa') {
      const label = filtrosActivos.estado_entrega === 'entrega_inmediata' ? 'Entrega inmediata' : 'Solo preventa'
      chips.push({
        label,
        value: 'estado_entrega',
        onRemove: () => updateFiltro('estado_entrega', 'no_importa'),
      })
    }

    return chips
  }

  // Update filtro and URL
  const updateFiltro = (key: string, value: any) => {
    const newFiltros = { ...filtrosActivos, [key]: value }
    setFiltrosActivos(newFiltros)

    // Update URL preservando params del formulario
    const params = new URLSearchParams({
      presupuesto: newFiltros.presupuesto.toString(),
      zonas: Array.isArray(newFiltros.zonas) ? newFiltros.zonas.join(',') : '',
      dormitorios: newFiltros.dormitorios?.toString() || '',
      estado_entrega: newFiltros.estado_entrega,
    })

    router.replace(`/resultados-v2?${params.toString()}`, undefined, { shallow: true })
  }

  // TOP 3 and rest
  const top3 = propiedades.slice(0, 3)
  const alternativas = propiedades.slice(3)

  return (
    <>
      <Head>
        <title>Resultados | Simon - Inteligencia Inmobiliaria</title>
        <meta name="description" content="Resultados de busqueda de departamentos en Equipetrol" />
      </Head>

      <style jsx global>{premiumFonts}</style>

      <div className="min-h-screen bg-[#f8f6f3]">
        {/* Navbar */}
        <nav className="fixed top-0 w-full z-50 bg-[#0a0a0a]/95 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
            <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
              Simon
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/filtros-v2" className="text-white/50 hover:text-white text-sm transition-colors">
                Editar filtros
              </Link>
              <Link
                href="/landing-v2"
                className="bg-white text-[#0a0a0a] px-6 py-2 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] hover:text-white transition-all"
              >
                Nueva busqueda
              </Link>
            </div>
          </div>
        </nav>

        {/* Results Header */}
        <div className="pt-20">
          <ResultsHeaderPremium
            count={propiedades.length}
            filtros={buildFilterChips()}
            onEditarFiltros={() => router.push('/filtros-v2')}
          />
        </div>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-8 py-12">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : propiedades.length === 0 ? (
            <div className="text-center py-20">
              <p className="font-display text-3xl text-[#0a0a0a] mb-4">Sin resultados</p>
              <p className="text-[#666666] mb-8">Intenta ampliar tus filtros para ver mas opciones</p>
              <Link
                href="/filtros-v2"
                className="inline-block bg-[#0a0a0a] text-white px-8 py-4 text-xs tracking-[2px] uppercase hover:bg-[#c9a959] transition-colors"
              >
                Editar filtros
              </Link>
            </div>
          ) : (
            <>
              {/* TOP 3 */}
              {top3.length > 0 && (
                <section className="mb-16">
                  <div className="flex items-center gap-4 mb-8">
                    <span className="w-8 h-px bg-[#c9a959]" />
                    <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">
                      Top {Math.min(3, top3.length)} recomendados
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {top3.map((prop, i) => (
                      <PropertyCardPremium
                        key={prop.id}
                        propiedad={prop}
                        rank={i + 1}
                        innegociablesUsuario={datosFormulario.innegociables}
                        usuarioNecesitaParqueo={datosFormulario.necesitaParqueo}
                        usuarioNecesitaBaulera={datosFormulario.necesitaBaulera}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Alternativas */}
              {alternativas.length > 0 && (
                <section>
                  <div className="flex items-center gap-4 mb-8">
                    <span className="w-8 h-px bg-[#0a0a0a]/30" />
                    <span className="text-[#666666] text-[0.7rem] tracking-[3px] uppercase">
                      {alternativas.length} alternativas
                    </span>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {alternativas.map((prop) => (
                      <PropertyCardPremium
                        key={prop.id}
                        propiedad={prop}
                        innegociablesUsuario={datosFormulario.innegociables}
                        usuarioNecesitaParqueo={datosFormulario.necesitaParqueo}
                        usuarioNecesitaBaulera={datosFormulario.necesitaBaulera}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-[#0a0a0a] border-t border-white/10 py-12 mt-20">
          <div className="max-w-6xl mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <Link href="/landing-v2" className="font-display text-2xl text-white tracking-tight">
              Simon
            </Link>
            <p className="text-white/40 text-sm">
              {new Date().getFullYear()} Simon. Inteligencia Inmobiliaria.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
                Terminos
              </a>
              <a href="#" className="text-white/40 hover:text-white text-sm transition-colors">
                Privacidad
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}
