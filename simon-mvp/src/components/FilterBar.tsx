'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { buscarUnidadesReales, FiltrosBusqueda } from '@/lib/supabase'

// Tipos para el estado del filtro
export interface FiltrosNivel1 {
  presupuesto_max: number
  zonas: string[]
  dormitorios: number | null
  estado_entrega: 'entrega_inmediata' | 'preventa_ok' | 'no_importa'
  para_que_es: 'vivienda' | 'inversion_renta' | 'inversion_plusvalia'
  forma_pago: 'contado' | 'credito_bancario' | 'financiamiento_directo' | 'no_se'
}

interface FilterBarProps {
  onFiltrosChange?: (filtros: FiltrosNivel1, count: number) => void
  className?: string
}

const ZONAS = [
  { id: 'equipetrol', label: 'Equipetrol (centro)' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { id: 'villa_brigida', label: 'Villa Brigida' },
  { id: 'faremafu', label: 'Faremafu' },
]

const DORMITORIOS = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3+' },
]

const ESTADO_ENTREGA = [
  { value: 'entrega_inmediata' as const, label: 'Ya (lista para entrega)' },
  { value: 'preventa_ok' as const, label: 'Puedo esperar (preventa ok)' },
  { value: 'no_importa' as const, label: 'No me importa' },
]

const PARA_QUE_ES = [
  { value: 'vivienda' as const, label: 'Vivir yo' },
  { value: 'inversion_renta' as const, label: 'Inversion renta' },
  { value: 'inversion_plusvalia' as const, label: 'Inversion plusvalia' },
]

const FORMA_PAGO = [
  { value: 'contado' as const, label: 'Contado' },
  { value: 'credito_bancario' as const, label: 'Credito bancario' },
  { value: 'financiamiento_directo' as const, label: 'Financiamiento directo (cuotas)' },
  { value: 'no_se' as const, label: 'No se todavia' },
]

export default function FilterBar({ onFiltrosChange, className = '' }: FilterBarProps) {
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

  // Navegar al formulario Nivel 2 según perfil
  const handleContinuar = () => {
    // Serializar filtros como URL params
    const params = new URLSearchParams({
      presupuesto: filtros.presupuesto_max.toString(),
      zonas: filtros.zonas.join(','),
      dormitorios: filtros.dormitorios?.toString() || '',
      estado_entrega: filtros.estado_entrega,
      forma_pago: filtros.forma_pago,
      count: count?.toString() || '0',
    })

    // Elegir ruta según perfil
    const rutas: Record<FiltrosNivel1['para_que_es'], string> = {
      vivienda: '/formulario-vivienda',
      inversion_renta: '/formulario-inversion-renta',
      inversion_plusvalia: '/formulario-inversion-plusvalia',
    }

    router.push(`${rutas[filtros.para_que_es]}?${params.toString()}`)
  }

  // Convertir filtros UI a filtros de BD
  const convertirFiltros = useCallback((f: FiltrosNivel1): FiltrosBusqueda => {
    const filtrosBD: FiltrosBusqueda = {
      precio_max: f.presupuesto_max,
      limite: 500, // Obtener todos para contar
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

  // Buscar conteo sin filtros (baseline) al inicio
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

  // Buscar conteo cuando cambian los filtros
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

    const timeout = setTimeout(buscar, 300) // Debounce
    return () => clearTimeout(timeout)
  }, [filtros, convertirFiltros, onFiltrosChange])

  // Calcular consejos automáticos
  const getConsejos = () => {
    const consejos: { tipo: 'warning' | 'info' | 'success', mensaje: string }[] = []

    if (count === null || countSinFiltros === null) return consejos

    // Si elimina >50% de opciones
    if (countSinFiltros > 0 && count < countSinFiltros * 0.5 && count > 0) {
      const eliminadas = Math.round((1 - count / countSinFiltros) * 100)
      consejos.push({
        tipo: 'warning',
        mensaje: `Tus filtros eliminan ${eliminadas}% de opciones. Considera ampliar presupuesto o zonas.`
      })
    }

    // Si quedan pocas opciones
    if (count > 0 && count < 5) {
      consejos.push({
        tipo: 'warning',
        mensaje: `Solo ${count} opciones. Podrías ampliar filtros para más variedad.`
      })
    }

    // Si hay 0 opciones
    if (count === 0) {
      consejos.push({
        tipo: 'warning',
        mensaje: 'Sin resultados. Prueba subir presupuesto o quitar filtros de zona/dormitorios.'
      })
    }

    // Si tiene buena cantidad
    if (count >= 10 && count <= 30) {
      consejos.push({
        tipo: 'success',
        mensaje: 'Buen rango de opciones para comparar.'
      })
    }

    return consejos
  }

  // Teasers de inteligencia
  const getTeasers = () => {
    if (count === null || count === 0) return []

    const teasers = [
      'Analizamos precio/m² vs promedio de zona',
      'Detectamos alertas de precios sospechosos',
      'Verificamos track record del desarrollador'
    ]

    return teasers
  }

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

  const handleParaQueEs = (paraQue: FiltrosNivel1['para_que_es']) => {
    setFiltros(prev => ({ ...prev, para_que_es: paraQue }))
  }

  const handleFormaPago = (forma: FiltrosNivel1['forma_pago']) => {
    setFiltros(prev => ({ ...prev, forma_pago: forma }))
  }

  const formatPrice = (value: number) => {
    return `$${(value / 1000).toFixed(0)}k`
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
      <h2 className="text-xl font-bold text-gray-900 mb-6">
        CONSTRUYENDO TU BUSQUEDA
      </h2>

      {/* 1. Presupuesto */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          1. Cuanto queres invertir?
        </label>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">$50k</span>
          <input
            type="range"
            min={50000}
            max={300000}
            step={5000}
            value={filtros.presupuesto_max}
            onChange={(e) => handlePresupuesto(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-sm text-gray-500">$300k</span>
        </div>
        <div className="text-center mt-2">
          <span className="text-lg font-semibold text-blue-600">
            Hasta {formatPrice(filtros.presupuesto_max)}
          </span>
        </div>
      </div>

      {/* 2. Zona */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          2. Donde en Equipetrol?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ZONAS.map((zona) => (
            <label
              key={zona.id}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                filtros.zonas.includes(zona.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={filtros.zonas.includes(zona.id)}
                onChange={() => handleZona(zona.id)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm">{zona.label}</span>
            </label>
          ))}
        </div>
        {filtros.zonas.length === 0 && (
          <p className="text-xs text-gray-500 mt-1">Sin filtro = todas las zonas</p>
        )}
      </div>

      {/* 3. Dormitorios */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          3. Cuantos dormitorios?
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => handleDormitorios(null)}
            className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
              filtros.dormitorios === null
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            Todos
          </button>
          {DORMITORIOS.map((d) => (
            <button
              key={d.value}
              onClick={() => handleDormitorios(d.value)}
              className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                filtros.dormitorios === d.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Estado entrega */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          4. Para cuando lo necesitas?
        </label>
        <div className="space-y-2">
          {ESTADO_ENTREGA.map((estado) => (
            <label
              key={estado.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                filtros.estado_entrega === estado.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="estado_entrega"
                checked={filtros.estado_entrega === estado.value}
                onChange={() => handleEstadoEntrega(estado.value)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm">{estado.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 5. Para que es */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          5. Para que es?
        </label>
        <div className="space-y-2">
          {PARA_QUE_ES.map((opcion) => (
            <label
              key={opcion.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                filtros.para_que_es === opcion.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="para_que_es"
                checked={filtros.para_que_es === opcion.value}
                onChange={() => handleParaQueEs(opcion.value)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm">{opcion.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 6. Forma de pago */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          6. Como vas a pagar?
        </label>
        <div className="space-y-2">
          {FORMA_PAGO.map((forma) => (
            <label
              key={forma.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                filtros.forma_pago === forma.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="forma_pago"
                checked={filtros.forma_pago === forma.value}
                onChange={() => handleFormaPago(forma.value)}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm">{forma.label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Esta info ayuda al broker a preparar opciones de financiamiento
        </p>
      </div>

      {/* Contador y CTA */}
      <div className="border-t pt-6">
        <div className="text-center mb-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-500">Buscando...</span>
            </div>
          ) : count !== null ? (
            <p className="text-2xl font-bold text-gray-900">
              <span className="text-blue-600">{count}</span> propiedades
            </p>
          ) : (
            <p className="text-gray-500">Conectando...</p>
          )}
        </div>

        {/* Consejos automáticos */}
        {!loading && getConsejos().map((consejo, i) => (
          <div
            key={i}
            className={`mb-3 p-3 rounded-lg text-sm ${
              consejo.tipo === 'warning'
                ? 'bg-amber-50 border border-amber-200 text-amber-700'
                : consejo.tipo === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-blue-50 border border-blue-200 text-blue-700'
            }`}
          >
            <span className="mr-2">
              {consejo.tipo === 'warning' ? '⚠️' : consejo.tipo === 'success' ? '✓' : 'ℹ️'}
            </span>
            {consejo.mensaje}
          </div>
        ))}

        {/* Teasers de inteligencia */}
        {!loading && count !== null && count > 0 && (
          <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
            <p className="text-xs font-medium text-blue-800 mb-2">
              Simón analizará cada opción:
            </p>
            <ul className="space-y-1">
              {getTeasers().map((teaser, i) => (
                <li key={i} className="text-xs text-blue-600 flex items-center gap-2">
                  <span className="text-blue-400">•</span> {teaser}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          onClick={handleContinuar}
          disabled={loading || count === null || count === 0}
          className="w-full py-4 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {count !== null && count > 0
            ? `VER MIS ${count} OPCIONES`
            : 'Sin resultados para estos filtros'}
        </button>
      </div>
    </div>
  )
}
