'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Perfil } from './ProfileSelector'
import type { DatosPropiedad } from './PropertyForm'
import { buscarUnidadesReales, type UnidadReal } from '@/lib/supabase'

interface ProResultsProps {
  perfil: Perfil
  datosPropiedad: DatosPropiedad
  onBack: () => void
  onShowLeadForm: () => void
}

// Headers por perfil
const headers = {
  vendedor: {
    titulo: 'Tu Competencia',
    getSubtitulo: (n: number) => `${n} propiedades similares compitiendo con vos`
  },
  broker: {
    titulo: 'Analisis Comparativo de Mercado',
    getSubtitulo: (n: number) => `CMA basado en ${n} comparables verificados`
  },
  avaluador: {
    titulo: 'Referencias de Oferta',
    getSubtitulo: (n: number) => `${n} propiedades en oferta activa`
  }
}

// Label para diferencia
const getDiferenciaLabel = (diff: number, perfil: Perfil) => {
  const sign = diff > 0 ? '+' : ''
  if (perfil === 'vendedor') return `${sign}${diff.toFixed(0)}% vs tu precio`
  if (perfil === 'broker') return `${sign}${diff.toFixed(0)}% vs cliente`
  return null // Avaluador no muestra diferencia
}

export default function ProResults({ perfil, datosPropiedad, onBack, onShowLeadForm }: ProResultsProps) {
  const [resultados, setResultados] = useState<UnidadReal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Convertir zona a formato esperado
        const zonasMap: Record<string, string> = {
          'equipetrol_norte': 'Equipetrol Norte',
          'equipetrol_centro': 'Equipetrol',
          'equipetrol_sur': 'Equipetrol Sur',
          'sirari': 'Sirari',
          'villa_olimpica': 'Villa Olimpica',
          'las_palmas': 'Las Palmas'
        }

        const data = await buscarUnidadesReales({
          zona: zonasMap[datosPropiedad.zona] || 'Equipetrol',
          dormitorios: datosPropiedad.dormitorios === 3 ? undefined : datosPropiedad.dormitorios,
          precio_max: datosPropiedad.precio_referencia
            ? datosPropiedad.precio_referencia * 1.5
            : 300000,
          area_min: Math.max(20, datosPropiedad.area_m2 * 0.7),
          limite: 50
        })

        setResultados(data || [])
      } catch (err) {
        console.error('Error buscando propiedades:', err)
        setError('Error al buscar propiedades. Intenta de nuevo.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [datosPropiedad])

  // Calcular estadísticas
  const preciosM2 = resultados.map(r => r.precio_m2)
  const precioM2Min = preciosM2.length > 0 ? Math.min(...preciosM2) : 0
  const precioM2Max = preciosM2.length > 0 ? Math.max(...preciosM2) : 0
  const precioM2Promedio = preciosM2.length > 0
    ? Math.round(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length)
    : 0

  // Calcular percentil si hay precio de referencia
  const tuPrecioM2 = datosPropiedad.precio_referencia && datosPropiedad.area_m2
    ? datosPropiedad.precio_referencia / datosPropiedad.area_m2
    : null

  const percentil = tuPrecioM2 && preciosM2.length > 0
    ? Math.round((preciosM2.filter(p => p < tuPrecioM2).length / preciosM2.length) * 100)
    : null

  // Competidores más baratos/caros
  const masBaratos = tuPrecioM2
    ? resultados.filter(r => r.precio_m2 < tuPrecioM2).length
    : 0
  const masCaros = tuPrecioM2
    ? resultados.filter(r => r.precio_m2 > tuPrecioM2).length
    : 0

  const config = headers[perfil]

  if (loading) {
    return (
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-500">Analizando mercado...</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="py-16 bg-slate-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button onClick={onBack} className="btn btn-secondary">
            Volver a intentar
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Editar datos
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-dark mb-2">
              {config.titulo}
            </h2>
            <p className="text-slate-500">{config.getSubtitulo(resultados.length)}</p>
          </div>

          {/* Tu propiedad (solo si hay precio referencia) */}
          {datosPropiedad.precio_referencia && (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {perfil === 'vendedor' ? 'TU PROPIEDAD' : perfil === 'broker' ? 'PROPIEDAD DEL CLIENTE' : 'PROPIEDAD A EVALUAR'}
              </div>

              <div className="flex flex-wrap items-center gap-4 mb-4">
                <span className="text-lg font-bold text-brand-dark">
                  ${datosPropiedad.precio_referencia.toLocaleString()}
                </span>
                <span className="text-slate-500">
                  {datosPropiedad.dormitorios} dorms • {datosPropiedad.area_m2}m2
                </span>
                <span className="text-slate-500">
                  ${tuPrecioM2?.toFixed(0)}/m2
                </span>
              </div>

              {/* Percentil bar */}
              {percentil !== null && (
                <div className="bg-slate-100 rounded-lg p-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-500">Posicion en mercado</span>
                    <span className="font-semibold text-brand-dark">Percentil {percentil}</span>
                  </div>
                  <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-primary rounded-full transition-all"
                      style={{ width: `${percentil}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400 mt-2">
                    <span>{masBaratos} mas baratos</span>
                    <span>{masCaros} mas caros</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resumen de mercado */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <div className="text-2xl font-bold text-brand-dark">{resultados.length}</div>
              <div className="text-xs text-slate-500">Comparables</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <div className="text-2xl font-bold text-brand-dark">${precioM2Promedio.toLocaleString()}</div>
              <div className="text-xs text-slate-500">Precio/m2 promedio</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <div className="text-lg font-bold text-brand-dark">
                ${precioM2Min.toLocaleString()} - ${precioM2Max.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500">Rango precio/m2</div>
            </div>
          </div>

          {/* Lista de comparables */}
          <div className="space-y-4 mb-8">
            <h3 className="font-semibold text-slate-700">
              {perfil === 'avaluador' ? 'Referencias' : 'Competencia'}
            </h3>

            {resultados.slice(0, 10).map((prop, i) => {
              const diff = tuPrecioM2
                ? ((prop.precio_m2 - tuPrecioM2) / tuPrecioM2) * 100
                : 0

              return (
                <motion.div
                  key={prop.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-300 transition-colors"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-brand-dark">{prop.proyecto}</h4>
                      <p className="text-sm text-slate-500">{prop.zona}</p>
                    </div>
                    {tuPrecioM2 && perfil !== 'avaluador' && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        diff < -5 ? 'bg-red-100 text-red-700' :
                        diff > 5 ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {getDiferenciaLabel(diff, perfil)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="text-slate-600">
                      <strong>${prop.precio_usd.toLocaleString()}</strong>
                    </span>
                    <span className="text-slate-500">
                      {prop.dormitorios} dorms • {Math.round(prop.area_m2)}m2
                    </span>
                    <span className="text-slate-500">
                      ${Math.round(prop.precio_m2).toLocaleString()}/m2
                    </span>
                    {prop.dias_en_mercado && (
                      <span className="text-slate-400">
                        {prop.dias_en_mercado} dias publicado
                      </span>
                    )}
                  </div>

                  {/* Mini análisis */}
                  {tuPrecioM2 && perfil !== 'avaluador' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-500">
                      {diff < -10 && `Competidor agresivo: ${Math.abs(diff).toFixed(0)}% mas barato.`}
                      {diff >= -10 && diff < -3 && `Competidor directo: precio similar, verifica amenities.`}
                      {diff >= -3 && diff <= 3 && `Competencia directa en precio.`}
                      {diff > 3 && diff <= 10 && `Precio superior: puede tener mejores acabados.`}
                      {diff > 10 && `Premium: ${diff.toFixed(0)}% mas caro que vos.`}
                    </div>
                  )}

                  {perfil === 'avaluador' && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-500">
                      Referencia: ${Math.round(prop.precio_m2).toLocaleString()}/m2 •
                      Tipo: {prop.desarrollador || 'N/D'}
                    </div>
                  )}
                </motion.div>
              )
            })}

            {resultados.length > 10 && (
              <p className="text-center text-sm text-slate-500">
                +{resultados.length - 10} propiedades mas disponibles en el informe completo
              </p>
            )}
          </div>

          {/* Lo que no sabemos */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
            <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Lo que NO sabemos
            </h4>
            <ul className="text-sm text-amber-700 space-y-1">
              <li>• A que precio se vendieron realmente (no tenemos datos de cierre)</li>
              <li>• Cuanto negociaron los vendedores</li>
              <li>• Estado real de cada propiedad (fotos vs realidad)</li>
            </ul>
          </div>

          {/* CTA Lead Form */}
          <div className="bg-gradient-to-br from-brand-dark to-brand-dark-card rounded-2xl p-8 text-center text-white">
            <h3 className="font-display text-2xl font-bold mb-3">
              {perfil === 'vendedor' && '¿Queres un avaluo comercial completo?'}
              {perfil === 'broker' && '¿Queres descargar el CMA en PDF?'}
              {perfil === 'avaluador' && '¿Queres exportar las referencias?'}
            </h3>
            <p className="text-slate-400 mb-6">
              {perfil === 'vendedor' && 'Un asesor te contactara para darte un analisis personalizado.'}
              {perfil === 'broker' && 'Genera un PDF profesional para presentar a tu cliente.'}
              {perfil === 'avaluador' && 'Exporta los datos en formato compatible con tu sistema.'}
            </p>
            <button
              onClick={onShowLeadForm}
              className="btn btn-primary px-8 py-4 text-base"
            >
              {perfil === 'vendedor' && 'Solicitar Avaluo'}
              {perfil === 'broker' && 'Generar PDF'}
              {perfil === 'avaluador' && 'Exportar Datos'}
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
