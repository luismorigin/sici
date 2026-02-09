import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { buscarUnidadesReales, FiltrosBusqueda } from '@/lib/supabase'

// Tipos para el estado del filtro
export interface FiltrosNivel1 {
  presupuesto_max: number
  zonas: string[]
  dormitorios: number | null
  estado_entrega: 'entrega_inmediata' | 'solo_preventa' | 'no_importa'
  para_que_es: 'vivienda' | 'inversion_renta' | 'inversion_plusvalia'
  forma_pago: 'contado' | 'credito_bancario' | 'financiamiento_directo' | 'no_se'
}

interface FilterBarPremiumProps {
  onFiltrosChange?: (filtros: FiltrosNivel1, count: number) => void
  className?: string
}

const ZONAS = [
  { id: 'equipetrol', label: 'Equipetrol Centro', precio: '$2,098/m2', unidades: 98 },
  { id: 'sirari', label: 'Sirari', precio: '$2,258/m2', unidades: 47 },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte', precio: '$2,340/m2', unidades: 22 },
  { id: 'villa_brigida', label: 'Villa Brigida', precio: '$1,495/m2', unidades: 67 },
  { id: 'faremafu', label: 'Equipetrol Oeste', precio: '$2,122/m2', unidades: 16 },
]

const DORMITORIOS = [
  { value: null, label: 'Todos' },
  { value: 0, label: 'Mono' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
]

const ESTADO_ENTREGA = [
  { value: 'no_importa' as const, label: 'Todo el mercado' },
  { value: 'entrega_inmediata' as const, label: 'Entrega inmediata' },
  { value: 'solo_preventa' as const, label: 'Solo preventa' },
]

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
)

export default function FilterBarPremium({ onFiltrosChange, className = '' }: FilterBarPremiumProps) {
  const router = useRouter()
  const [filtros, setFiltros] = useState<FiltrosNivel1>({
    presupuesto_max: 150000,
    zonas: [],
    dormitorios: null,
    estado_entrega: 'no_importa',
    para_que_es: 'vivienda',
    forma_pago: 'no_se',
  })

  const [count, setCount] = useState<number | null>(null)
  const [countSinFiltros, setCountSinFiltros] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Estado para preservar params del nivel 2 (cuando vienen de "Editar todo")
  const [paramsNivel2, setParamsNivel2] = useState<{
    innegociables: string
    deseables: string
    necesita_parqueo: string
    necesita_baulera: string
    calidad_vs_precio: string
    amenidades_vs_metros: string
    cantidad_resultados: string
  } | null>(null)

  // Restaurar filtros desde URL query params
  useEffect(() => {
    if (!router.isReady || initialized) return

    const {
      presupuesto, dormitorios, zonas, estado_entrega, forma_pago,
      // Params nivel 2 (vienen de "Editar todo")
      innegociables, deseables, necesita_parqueo, necesita_baulera,
      calidad_vs_precio, amenidades_vs_metros, cantidad_resultados
    } = router.query

    const newFiltros: FiltrosNivel1 = { ...filtros }
    let hasChanges = false

    if (presupuesto) {
      const parsed = parseInt(presupuesto as string)
      if (!isNaN(parsed) && parsed >= 50000 && parsed <= 500000) {
        newFiltros.presupuesto_max = parsed
        hasChanges = true
      }
    }

    if (dormitorios !== undefined && dormitorios !== '') {
      const parsed = parseInt(dormitorios as string)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
        newFiltros.dormitorios = parsed
        hasChanges = true
      }
    }

    if (zonas && (zonas as string).length > 0) {
      const zonasArray = (zonas as string).split(',').filter(Boolean)
      if (zonasArray.length > 0) {
        newFiltros.zonas = zonasArray
        hasChanges = true
      }
    }

    if (estado_entrega && ['entrega_inmediata', 'solo_preventa', 'no_importa'].includes(estado_entrega as string)) {
      newFiltros.estado_entrega = estado_entrega as FiltrosNivel1['estado_entrega']
      hasChanges = true
    }

    if (forma_pago && ['contado', 'credito_bancario', 'financiamiento_directo', 'no_se'].includes(forma_pago as string)) {
      newFiltros.forma_pago = forma_pago as FiltrosNivel1['forma_pago']
      hasChanges = true
    }

    if (hasChanges) {
      setFiltros(newFiltros)
    }

    // Guardar params nivel 2 si vienen (para pasarlos a formulario-v2)
    if (innegociables || deseables || necesita_parqueo || cantidad_resultados) {
      setParamsNivel2({
        innegociables: (innegociables as string) || '',
        deseables: (deseables as string) || '',
        necesita_parqueo: (necesita_parqueo as string) || 'true',
        necesita_baulera: (necesita_baulera as string) || 'false',
        calidad_vs_precio: (calidad_vs_precio as string) || '3',
        amenidades_vs_metros: (amenidades_vs_metros as string) || '3',
        cantidad_resultados: (cantidad_resultados as string) || '',
      })
    }

    setInitialized(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, initialized])

  // Navegar a formulario nivel 2
  const handleBuscar = () => {
    const params = new URLSearchParams({
      presupuesto: filtros.presupuesto_max.toString(),
      zonas: filtros.zonas.join(','),
      dormitorios: filtros.dormitorios?.toString() || '',
      estado_entrega: filtros.estado_entrega,
      forma_pago: filtros.forma_pago,
      count: count?.toString() || '0',
    })

    // Pasar params nivel 2 si existen (vienen de "Editar todo")
    if (paramsNivel2) {
      params.set('innegociables', paramsNivel2.innegociables)
      params.set('deseables', paramsNivel2.deseables)
      params.set('necesita_parqueo', paramsNivel2.necesita_parqueo)
      params.set('necesita_baulera', paramsNivel2.necesita_baulera)
      params.set('calidad_vs_precio', paramsNivel2.calidad_vs_precio)
      params.set('amenidades_vs_metros', paramsNivel2.amenidades_vs_metros)
      params.set('cantidad_resultados', paramsNivel2.cantidad_resultados)
    }

    router.push(`/formulario-v2?${params.toString()}`)
  }

  // Convertir filtros UI a filtros de BD
  const convertirFiltros = useCallback((f: FiltrosNivel1): FiltrosBusqueda => {
    const filtrosBD: FiltrosBusqueda = {
      precio_max: f.presupuesto_max,
      limite: 500,
    }

    if (f.dormitorios !== null) {
      filtrosBD.dormitorios = f.dormitorios
    }

    if (f.zonas.length > 0) {
      filtrosBD.zonas_permitidas = f.zonas
    }

    if (f.estado_entrega !== 'no_importa') {
      filtrosBD.estado_entrega = f.estado_entrega
    }

    return filtrosBD
  }, [])

  // Buscar baseline al inicio
  useEffect(() => {
    const buscarBaseline = async () => {
      try {
        const resultados = await buscarUnidadesReales({ limite: 500 })
        setCountSinFiltros(resultados.length)
      } catch (err) {
        console.error('Error buscando baseline:', err)
      }
    }
    buscarBaseline()
  }, [])

  // Buscar conteo cuando cambian filtros
  useEffect(() => {
    const buscar = async () => {
      setLoading(true)
      try {
        const filtrosBD = convertirFiltros(filtros)
        const resultados = await buscarUnidadesReales(filtrosBD)
        setCount(resultados.length)
        onFiltrosChange?.(filtros, resultados.length)
      } catch (err) {
        console.error('Error buscando:', err)
        setCount(null)
      } finally {
        setLoading(false)
      }
    }

    const timeout = setTimeout(buscar, 300)
    return () => clearTimeout(timeout)
  }, [filtros, convertirFiltros, onFiltrosChange])

  // Handlers
  const handlePresupuesto = (value: number) => {
    setFiltros(prev => ({ ...prev, presupuesto_max: value }))
  }

  const handleZona = (zonaId: string) => {
    setFiltros(prev => {
      const zonas = prev.zonas.includes(zonaId)
        ? prev.zonas.filter(z => z !== zonaId)
        : [...prev.zonas, zonaId]
      return { ...prev, zonas }
    })
  }

  const handleDormitorios = (dorms: number | null) => {
    setFiltros(prev => ({ ...prev, dormitorios: dorms }))
  }

  const handleEstadoEntrega = (estado: FiltrosNivel1['estado_entrega']) => {
    setFiltros(prev => ({ ...prev, estado_entrega: estado }))
  }

  const formatPrice = (value: number) => {
    return `$${(value / 1000).toFixed(0)}k`
  }

  return (
    <div className={`${className}`}>
      {/* Label decorativo */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <span className="w-12 h-px bg-[#c9a959]" />
        <span className="text-[#c9a959] text-[0.7rem] tracking-[4px] uppercase font-light">
          Filtros de busqueda
        </span>
        <span className="w-12 h-px bg-[#c9a959]" />
      </div>

      {/* Titulo */}
      <h2 className="font-display text-white text-4xl md:text-5xl font-light text-center mb-4">
        Que estas<br />
        <span className="italic text-[#c9a959]">buscando?</span>
      </h2>

      <p className="text-white/50 text-center font-light mb-16 max-w-md mx-auto">
        Filtramos las {countSinFiltros ?? '...'} propiedades del mercado
        segun tus criterios
      </p>

      {/* Zonas */}
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-6">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Zona</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ZONAS.map((zona) => (
            <button
              key={zona.id}
              onClick={() => handleZona(zona.id)}
              className={`p-4 border transition-all duration-300 text-left ${
                filtros.zonas.includes(zona.id)
                  ? 'border-[#c9a959] bg-[#c9a959]/10'
                  : 'border-white/10 hover:border-[#c9a959]/50'
              }`}
            >
              <div className="text-white font-light text-sm mb-1">{zona.label}</div>
              <div className="text-white/40 text-xs">{zona.unidades} unidades</div>
              <div className="text-[#c9a959] text-xs mt-2">{zona.precio}</div>
            </button>
          ))}
        </div>

        {filtros.zonas.length === 0 && (
          <p className="text-white/30 text-xs mt-3 text-center">Sin seleccion = todas las zonas</p>
        )}
      </div>

      {/* Presupuesto */}
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-6">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Presupuesto</span>
        </div>

        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between text-white/40 text-sm mb-3">
            <span>$50k</span>
            <span>$500k</span>
          </div>

          <input
            type="range"
            min={50000}
            max={500000}
            step={10000}
            value={filtros.presupuesto_max}
            onChange={(e) => handlePresupuesto(Number(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-[#c9a959]"
          />

          <div className="text-center mt-4">
            <span className="font-display text-4xl text-white font-light">
              Hasta {formatPrice(filtros.presupuesto_max)}
            </span>
          </div>
        </div>
      </div>

      {/* Dormitorios */}
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-6">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Dormitorios</span>
        </div>

        <div className="flex justify-center gap-2 md:gap-3 flex-wrap">
          {DORMITORIOS.map((d) => (
            <button
              key={d.value ?? 'todos'}
              onClick={() => handleDormitorios(d.value)}
              className={`px-4 md:px-8 py-3 border transition-all duration-300 text-sm md:text-base ${
                filtros.dormitorios === d.value
                  ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Estado entrega */}
      <div className="mb-16">
        <div className="flex items-center gap-4 mb-6">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Entrega</span>
        </div>

        <div className="flex justify-center gap-3 flex-wrap">
          {ESTADO_ENTREGA.map((estado) => (
            <button
              key={estado.value}
              onClick={() => handleEstadoEntrega(estado.value)}
              className={`px-6 py-3 border transition-all duration-300 ${
                filtros.estado_entrega === estado.value
                  ? 'border-[#c9a959] bg-[#c9a959]/10 text-white'
                  : 'border-white/10 text-white/60 hover:border-[#c9a959]/50'
              }`}
            >
              {estado.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contador y CTA */}
      <div className="border-t border-white/10 pt-12">
        <div className="text-center mb-8">
          {loading ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-[#c9a959] border-t-transparent rounded-full animate-spin" />
              <span className="text-white/50">Buscando...</span>
            </div>
          ) : count !== null ? (
            <div>
              <span className="font-display text-6xl text-white font-light">{count}</span>
              <p className="text-white/40 text-sm tracking-[2px] uppercase mt-2">propiedades encontradas</p>
            </div>
          ) : (
            <p className="text-white/50">Conectando...</p>
          )}
        </div>

        <button
          onClick={handleBuscar}
          disabled={loading || count === null || count === 0}
          className="w-full max-w-md mx-auto block bg-white text-[#0a0a0a] px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-4"
        >
          {count !== null && count > 0 ? (
            <>
              Ver {count} resultados
              <IconArrowRight />
            </>
          ) : (
            'Sin resultados'
          )}
        </button>
      </div>
    </div>
  )
}
