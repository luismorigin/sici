import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { buscarUnidadesReales, UnidadReal } from '@/lib/supabase'

interface FormData {
  nivel_completado: 1 | 2
  mbf_filtros: {
    precio_max: number
    dormitorios: number
    area_min: number
    zona: string | null
    zonas_permitidas: string[]
  }
  contexto_fiduciario?: {
    composicion: string
    mascota: string
    meses_buscando: number
    estado_emocional: string
    horizonte: string
    prioriza: string
    sensible_expensas: boolean
    decision_compartida: boolean
    presion_externa: string
    innegociables: string[]
  }
  respuestas: Record<string, any>
}

export default function ResultsV2Page() {
  const router = useRouter()
  const { level: queryLevel } = router.query
  const [level, setLevel] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [properties, setProperties] = useState<UnidadReal[]>([])
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null)

  // Cargar datos
  useEffect(() => {
    const lvl = queryLevel === '2' ? 2 : 1
    setLevel(lvl)

    const saved = localStorage.getItem('simon_form_data')
    if (!saved) {
      router.push('/formV2')
      return
    }

    const parsed = JSON.parse(saved) as FormData
    setFormData(parsed)

    // Buscar propiedades
    fetchProperties(parsed.mbf_filtros)
  }, [queryLevel, router])

  const fetchProperties = async (filtros: FormData['mbf_filtros']) => {
    setLoading(true)
    try {
      const results = await buscarUnidadesReales({
        precio_max: filtros.precio_max,
        dormitorios: filtros.dormitorios,
        area_min: filtros.area_min || undefined,
        zonas_permitidas: filtros.zonas_permitidas,
        limite: 5,
      })
      setProperties(results)
    } catch (error) {
      console.error('Error buscando propiedades:', error)
      setProperties([])
    }
    setLoading(false)
  }

  const handlePersonalizar = () => {
    // Ir a nivel 2 del formulario
    router.push('/formV2?level=2')
  }

  const getNombre = () => {
    return formData?.respuestas?.L1_nombre || ''
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-neutral-200 border-t-neutral-900
                         rounded-full animate-spin mx-auto mb-6" />
          <p className="text-xl text-neutral-600">Buscando opciones...</p>
        </motion.div>
      </main>
    )
  }

  return (
    <>
      <Head>
        <title>Resultados | Simon</title>
      </Head>

      <main className="min-h-screen px-6 py-12">
        <div className="max-w-4xl mx-auto">

          {/* Header con resultados */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold mb-2">
              {getNombre() ? `${getNombre()}, encontramos` : 'Encontramos'} {properties.length} opciones
            </h1>
            <p className="text-neutral-600">
              {level === 1
                ? 'Propiedades que cumplen tus filtros basicos'
                : 'Propiedades coherentes con tu situacion'
              }
            </p>
          </motion.section>

          {/* Banner para personalizar (solo nivel 1) */}
          {level === 1 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200
                        rounded-2xl p-6 mb-8"
            >
              <h2 className="text-lg font-semibold text-purple-900 mb-2">
                ¿Queres que Simon te explique POR QUE cada opcion encaja con vos?
              </h2>
              <p className="text-purple-700 mb-4">
                Completa 10 preguntas mas (~3 min) y recibis:
              </p>
              <ul className="text-purple-800 space-y-1 mb-6">
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span>
                  Razon personalizada por cada propiedad
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span>
                  Alertas si algo no encaja con tu situacion
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-purple-500">✓</span>
                  Guia de que preguntar al visitar
                </li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handlePersonalizar}
                  className="btn-primary bg-purple-600 hover:bg-purple-700"
                >
                  Si, personalizar →
                </button>
                <button
                  onClick={() => setLevel(1)} // Quedarse en nivel 1
                  className="btn-secondary"
                >
                  Solo ver estas opciones
                </button>
              </div>
            </motion.section>
          )}

          {/* Lista de propiedades */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: level === 1 ? 0.4 : 0.2 }}
          >
            <h2 className="text-xl font-bold mb-4">
              {level === 1 ? 'Opciones disponibles' : 'Opciones coherentes con tu vida'}
            </h2>

            <div className="space-y-6">
              {properties.map((property, index) => (
                <motion.div
                  key={property.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className={`bg-white rounded-2xl border-2 overflow-hidden cursor-pointer transition-all
                             ${selectedProperty === property.id
                               ? 'border-neutral-900 shadow-lg'
                               : 'border-neutral-200 hover:border-neutral-400'}`}
                  onClick={() => setSelectedProperty(property.id)}
                >
                  {/* Foto */}
                  {property.fotos_urls && property.fotos_urls.length > 0 && (
                    <div className="relative h-48 bg-neutral-100">
                      <img
                        src={property.fotos_urls[0]}
                        alt={property.proyecto}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      {property.fotos_urls.length > 1 && (
                        <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                          +{property.fotos_urls.length - 1} fotos
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-6">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold">{property.proyecto}</h3>
                        <p className="text-neutral-500">{property.zona}</p>
                        {property.desarrollador && (
                          <p className="text-sm text-neutral-400">{property.desarrollador}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${property.precio_usd.toLocaleString()}</p>
                        <p className="text-sm text-neutral-500">
                          {property.area_m2} m² · ${property.precio_m2.toLocaleString()}/m²
                        </p>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="flex gap-4 mb-4 text-neutral-600">
                      <span>{property.dormitorios} dorm</span>
                      <span>{property.cantidad_fotos} fotos</span>
                      {property.score_calidad && (
                        <span className="text-green-600">Score: {property.score_calidad}</span>
                      )}
                    </div>

                    {/* Amenities */}
                    {property.amenities_lista && property.amenities_lista.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {property.amenities_lista.slice(0, 4).map((amenity, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm"
                          >
                            {amenity}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Razon fiduciaria (solo nivel 2 o si viene del SQL) */}
                    {(level === 2 || property.razon_fiduciaria) && property.razon_fiduciaria && (
                      <div className="bg-purple-50 rounded-xl p-4 mt-4">
                        <p className="text-purple-800">
                          <span className="font-semibold text-purple-600">Por que encaja: </span>
                          {property.razon_fiduciaria}
                        </p>
                      </div>
                    )}

                    {/* Mensaje nivel 1 sin razon */}
                    {level === 1 && !property.razon_fiduciaria && (
                      <div className="bg-neutral-50 rounded-xl p-4 mt-4 text-center">
                        <p className="text-neutral-500 text-sm">
                          Completa el formulario para ver por que esta opcion encaja con vos
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Sin resultados */}
            {properties.length === 0 && (
              <div className="text-center py-12">
                <p className="text-xl text-neutral-600 mb-4">
                  No encontramos propiedades con esos filtros
                </p>
                <button
                  onClick={() => router.push('/formV2')}
                  className="btn-primary"
                >
                  Ajustar busqueda
                </button>
              </div>
            )}
          </motion.section>

          {/* CTA contacto */}
          {properties.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-12 bg-neutral-900 text-white rounded-3xl p-8 text-center"
            >
              <h2 className="text-2xl font-bold mb-2">
                ¿Te interesa alguna?
              </h2>
              <p className="text-neutral-400 mb-6">
                Dejanos tu WhatsApp y te contactamos en menos de 24h
              </p>
              <button
                onClick={() => router.push('/contact')}
                className="btn-primary bg-white text-neutral-900 hover:bg-neutral-100"
              >
                Quiero que me contacten →
              </button>
            </motion.section>
          )}
        </div>
      </main>
    </>
  )
}
