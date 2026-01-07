import { motion } from 'framer-motion'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { supabase, buscarUnidadesReales, buscarSiguienteRango, convertirZona, UnidadReal, SiguienteRangoInfo } from '@/lib/supabase'

interface Property {
  id: number
  nombre_proyecto: string
  zona: string
  precio_usd: number
  area_m2: number
  dormitorios: number
  banos: number
  amenities: string[]
  fotos: number
  url: string
  razon_fiduciaria?: string
}

interface FormData {
  respuestas: {
    [key: string]: any
  }
  tiempo_segundos: number
}

interface GuiaFiduciaria {
  perfil_fiduciario: {
    situacion_actual: string
    capacidad_financiera: string
    horizonte_temporal: string
    estado_emocional: string
  }
  guia_fiduciaria: {
    lectura_situacion: string
    validacion_presupuesto: string
    alertas_detectadas: string[]
    recomendacion_principal: string
    mensaje_final: string
  }
  alertas: Array<{
    tipo: 'roja' | 'amarilla' | 'verde'
    mensaje: string
  }>
  mbf_ready: {
    precio_max: number
    dormitorios_min: number
    zonas: string[]
  }
}

export default function ResultsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null)
  const [leadForm, setLeadForm] = useState({
    nombre: '',
    whatsapp: '',
    razon: ''
  })
  const [submitted, setSubmitted] = useState(false)
  const [siguienteRango, setSiguienteRango] = useState<SiguienteRangoInfo | null>(null)
  const [presupuestoUsuario, setPresupuestoUsuario] = useState<number>(0)
  const [guiaClaudeAPI, setGuiaClaudeAPI] = useState<GuiaFiduciaria | null>(null)
  const [loadingGuia, setLoadingGuia] = useState(true)

  useEffect(() => {
    // Load form data from localStorage
    const data = localStorage.getItem('simon_form_data')
    if (!data) {
      router.push('/')
      return
    }

    const parsed = JSON.parse(data) as FormData
    setFormData(parsed)

    // Build filters from answers
    const filters = buildFilters(parsed.respuestas)

    // Fetch properties from Supabase
    fetchProperties(filters, parsed)

    // Generate guía fiduciaria with Claude API
    generarGuiaClaudeAPI(parsed)
  }, [router])

  const generarGuiaClaudeAPI = async (formData: FormData) => {
    setLoadingGuia(true)
    try {
      const response = await fetch('/api/generar-guia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formulario: formData })
      })

      if (response.ok) {
        const guia = await response.json()
        if (!guia.error) {
          setGuiaClaudeAPI(guia)
        }
      }
    } catch (error) {
      console.error('Error generando guía Claude:', error)
    }
    setLoadingGuia(false)
  }

  const buildFilters = (answers: any) => {
    // Obtener primera zona seleccionada (o vacío si es flexible)
    const zonas = answers.D1 || ['equipetrol']
    const primeraZona = Array.isArray(zonas) ? zonas[0] : zonas

    return {
      precio_max: answers.C1 || 200000,
      dormitorios: parseInt(answers.E1) || 2,
      zona: convertirZona(primeraZona), // Convertir a nombre de BD
      zonas: zonas, // Mantener para mock data
      amenities: answers.E4?.filter((a: string) => a !== 'ninguno') || []
    }
  }

  const fetchProperties = async (filters: any, formDataParam?: FormData) => {
    setLoading(true)
    setPresupuestoUsuario(filters.precio_max)
    setSiguienteRango(null)

    try {
      // Intentar buscar en Supabase
      const unidades = await buscarUnidadesReales({
        precio_max: filters.precio_max,
        dormitorios: filters.dormitorios,
        zona: filters.zona || undefined, // undefined si es flexible
        limite: 10
      })

      if (unidades.length > 0) {
        // Mapear datos reales a formato del componente (razón temporal)
        const propiedadesMapeadas = unidades.slice(0, 5).map((u: UnidadReal) => ({
          id: u.id,
          nombre_proyecto: u.proyecto,
          zona: u.zona,
          precio_usd: u.precio_usd,
          area_m2: u.area_m2,
          dormitorios: u.dormitorios,
          banos: Math.max(1, u.dormitorios - 1),
          amenities: u.amenities_lista || [],
          fotos: u.cantidad_fotos,
          url: u.url,
          razon_fiduciaria: generateRazonFiduciaria({
            precio_usd: u.precio_usd,
            dormitorios: u.dormitorios,
            zona: u.zona,
            asesor_nombre: u.asesor_nombre
          }, filters)
        }))

        setProperties(propiedadesMapeadas)

        // Generar razones fiduciarias con Claude API (async, actualiza después)
        if (formDataParam) {
          generarRazonesFiduciarias(propiedadesMapeadas, formDataParam)
        }

        // Si hay pocas opciones (< 3), buscar siguiente rango
        if (unidades.length < 3) {
          const siguiente = await buscarSiguienteRango(
            filters.precio_max,
            filters.dormitorios,
            filters.zona
          )
          setSiguienteRango(siguiente)
        }
      } else {
        // Sin resultados - buscar siguiente rango disponible
        const siguiente = await buscarSiguienteRango(
          filters.precio_max,
          filters.dormitorios,
          filters.zona
        )
        setSiguienteRango(siguiente)

        // Fallback a mock data
        console.log('Sin resultados de Supabase, usando mock data')
        await new Promise(r => setTimeout(r, 1000))
        setProperties(getMockProperties(filters))
      }
    } catch (error) {
      console.error('Error fetching properties:', error)
      setProperties(getMockProperties(filters))
    }

    setLoading(false)
  }

  const generarRazonesFiduciarias = async (props: Property[], formDataParam: FormData) => {
    try {
      const response = await fetch('/api/razon-fiduciaria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil: formDataParam,
          propiedades: props.map(p => ({
            id: p.id,
            proyecto: p.nombre_proyecto,
            zona: p.zona,
            dormitorios: p.dormitorios,
            precio_usd: p.precio_usd,
            area_m2: p.area_m2,
            amenities: p.amenities
          }))
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.propiedades) {
          // Actualizar propiedades con razones de Claude
          setProperties(prev => prev.map(p => {
            const razon = data.propiedades.find((r: any) => r.id === p.id)
            return razon ? { ...p, razon_fiduciaria: razon.razon_fiduciaria } : p
          }))
        }
      }
    } catch (error) {
      console.error('Error generando razones fiduciarias:', error)
    }
  }

  const generateRazonFiduciaria = (property: any, filters: any) => {
    const razones = []

    if (property.precio_usd <= filters.precio_max * 0.9) {
      razones.push(`${Math.round((1 - property.precio_usd / filters.precio_max) * 100)}% bajo tu tope`)
    }

    if (property.dormitorios >= filters.dormitorios) {
      razones.push(`${property.dormitorios} dormitorios`)
    }

    if (property.asesor_nombre) {
      razones.push(`Contacto directo: ${property.asesor_nombre}`)
    }

    return razones.length > 0
      ? `Cumple tus criterios: ${razones.join(', ')}.`
      : 'Encaja con tu perfil de busqueda.'
  }

  // Mock data dinámico basado en filtros del usuario
  const getMockProperties = (filters?: any): Property[] => {
    const presupuesto = filters?.precio_max || 150000
    const dorms = filters?.dormitorios_min || 2
    const zonas = filters?.zonas || ['equipetrol']

    // Microzonas de Equipetrol para mock (6 residenciales)
    const microzonasLabels: Record<string, string> = {
      'flexible': 'Equipetrol',
      'equipetrol': 'Equipetrol',
      'sirari': 'Sirari',
      'equipetrol_norte_norte': 'Equipetrol Norte/Norte',
      'equipetrol_norte_sur': 'Equipetrol Norte/Sur',
      'villa_brigida': 'Villa Brigida',
      'faremafu': 'Faremafu'
    }

    // Generar precios basados en presupuesto (85-95% del máximo)
    const precio1 = Math.round(presupuesto * 0.85)
    const precio2 = Math.round(presupuesto * 0.92)
    const precio3 = Math.round(presupuesto * 0.78)

    // Usar primera zona seleccionada o default
    const zona1 = microzonasLabels[zonas[0]] || 'Equipetrol'
    const zona2 = zonas[1] ? microzonasLabels[zonas[1]] : 'Sirari'
    const zona3 = zonas[2] ? microzonasLabels[zonas[2]] : 'Equipetrol Norte/Norte'

    return [
      {
        id: 1,
        nombre_proyecto: 'Sky Elite',
        zona: zona1,
        precio_usd: precio1,
        area_m2: 75 + (dorms * 15),
        dormitorios: dorms,
        banos: Math.max(1, dorms - 1),
        amenities: ['piscina', 'gym', 'seguridad'],
        fotos: 12,
        url: '#',
        razon_fiduciaria: `${Math.round((1 - precio1/presupuesto) * 100)}% bajo tu tope. ${dorms} dormitorios en ${zona1}.`
      },
      {
        id: 2,
        nombre_proyecto: 'Las Dalias Residence',
        zona: zona2,
        precio_usd: precio2,
        area_m2: 80 + (dorms * 15),
        dormitorios: dorms + 1,
        banos: dorms,
        amenities: ['piscina', 'pet_friendly', 'seguridad'],
        fotos: 8,
        url: '#',
        razon_fiduciaria: `Pet friendly confirmado. Un dormitorio extra por si crece la familia.`
      },
      {
        id: 3,
        nombre_proyecto: 'Green Tower',
        zona: zona3,
        precio_usd: precio3,
        area_m2: 70 + (dorms * 12),
        dormitorios: dorms,
        banos: dorms,
        amenities: ['gym', 'rooftop', 'seguridad'],
        fotos: 15,
        url: '#',
        razon_fiduciaria: `Mejor relacion precio/m2. ${Math.round((1 - precio3/presupuesto) * 100)}% bajo tu tope.`
      }
    ]
  }

  const handleSubmitLead = async () => {
    if (!leadForm.nombre || !leadForm.whatsapp) return

    try {
      if (supabase) {
        // Call registrar_lead_mvp function con datos de Claude
        const { error } = await supabase.rpc('registrar_lead_mvp', {
          p_nombre: leadForm.nombre,
          p_whatsapp: leadForm.whatsapp,
          p_formulario: formData,
          p_perfil_fiduciario: guiaClaudeAPI?.perfil_fiduciario || null,
          p_guia_fiduciaria: guiaClaudeAPI?.guia_fiduciaria || null,
          p_alertas: guiaClaudeAPI?.alertas || null,
          p_mbf_ready: guiaClaudeAPI?.mbf_ready || null,
          p_propiedades_mostradas: properties.map(p => p.id),
          p_propiedad_interes: selectedProperty,
          p_tiempo_segundos: formData?.tiempo_segundos
        })

        if (error) throw error
      }

      setSubmitted(true)

      // Clear localStorage
      localStorage.removeItem('simon_form_data')
    } catch (error) {
      console.error('Error submitting lead:', error)
      // Still show success for MVP
      setSubmitted(true)
    }
  }

  const getGuiaFiduciaria = () => {
    // Si tenemos guía de Claude API, usarla
    if (guiaClaudeAPI?.guia_fiduciaria) {
      return guiaClaudeAPI.guia_fiduciaria.lectura_situacion
    }

    // Fallback: guía básica generada localmente
    if (!formData) return null

    const answers = formData.respuestas
    const estadoEmocional = answers.B4 || 'activo'
    const tiempoBuscando = answers.B1 || 'recien'
    const presupuesto = answers.C1 || 150000

    let lectura = ''

    if (estadoEmocional === 'cansado' || estadoEmocional === 'frustrado') {
      lectura = `Llevas ${tiempoBuscando === 'mas_1_ano' ? 'mas de un año' : 'varios meses'} buscando. Es normal sentirse ${estadoEmocional === 'cansado' ? 'cansado' : 'frustrado'}. `
      lectura += 'Cuidado: no decidas por agotamiento. '
    } else {
      lectura = 'Estas en buen momento para buscar. '
    }

    lectura += `Tu presupuesto de $${presupuesto.toLocaleString()} es ${presupuesto > 150000 ? 'holgado' : 'realista'} para la zona.`

    return lectura
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
          <p className="text-xl text-neutral-600">Analizando tu perfil...</p>
          <p className="text-neutral-400 mt-2">Buscando propiedades que encajen</p>
        </motion.div>
      </main>
    )
  }

  if (submitted) {
    return (
      <>
        <Head>
          <title>Recibido | Simon</title>
        </Head>
        <main className="min-h-screen flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md"
          >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold mb-4">Recibido!</h1>
            <p className="text-neutral-600 mb-8">
              Te contactaremos por WhatsApp en menos de 24 horas.
              <br />
              Guardamos tu Guia Fiduciaria.
            </p>
            <button
              onClick={() => router.push('/')}
              className="btn-secondary"
            >
              Volver al inicio
            </button>
          </motion.div>
        </main>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>Resultados | Simon</title>
      </Head>

      <main className="min-h-screen px-6 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Guia Fiduciaria */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-50 rounded-3xl p-8 mb-8"
          >
            <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Tu Guia Fiduciaria
            </h2>

            {loadingGuia ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
                <span className="text-neutral-500">Analizando tu perfil...</span>
              </div>
            ) : (
              <>
                <p className="text-xl text-neutral-800 leading-relaxed mb-4">
                  "{getGuiaFiduciaria()}"
                </p>

                {/* Alertas de Claude */}
                {guiaClaudeAPI?.alertas && guiaClaudeAPI.alertas.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {guiaClaudeAPI.alertas.map((alerta, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 p-3 rounded-lg ${
                          alerta.tipo === 'roja' ? 'bg-red-50 text-red-800' :
                          alerta.tipo === 'amarilla' ? 'bg-amber-50 text-amber-800' :
                          'bg-green-50 text-green-800'
                        }`}
                      >
                        <span className="text-lg">
                          {alerta.tipo === 'roja' ? '🔴' : alerta.tipo === 'amarilla' ? '🟡' : '🟢'}
                        </span>
                        <span className="text-sm">{alerta.mensaje}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recomendación principal */}
                {guiaClaudeAPI?.guia_fiduciaria?.recomendacion_principal && (
                  <div className="mt-4 p-4 bg-white rounded-xl border border-neutral-200">
                    <p className="text-sm text-neutral-500 mb-1">Recomendacion:</p>
                    <p className="text-neutral-800 font-medium">
                      {guiaClaudeAPI.guia_fiduciaria.recomendacion_principal}
                    </p>
                  </div>
                )}
              </>
            )}
          </motion.section>

          {/* Properties */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-bold mb-4">
              Opciones coherentes ({properties.length})
            </h2>

            {/* Mensaje honesto si hay pocas opciones */}
            {siguienteRango && properties.length < 3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6"
              >
                <p className="text-amber-800">
                  <span className="font-medium">Transparencia: </span>
                  Con tu presupuesto de ${presupuestoUsuario.toLocaleString()} encontramos {properties.length} opcion{properties.length === 1 ? '' : 'es'} en Equipetrol.
                  {siguienteRango.cantidad_adicional > 0 && (
                    <> Si podes llegar a <span className="font-semibold">${siguienteRango.precio_sugerido.toLocaleString()}</span>, hay {siguienteRango.cantidad_adicional} opciones mas.</>
                  )}
                </p>
              </motion.div>
            )}

            <div className="space-y-6">
              {properties.map((property, index) => (
                <motion.div
                  key={property.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className={`bg-white rounded-2xl border-2 p-6 cursor-pointer transition-all
                             ${selectedProperty === property.id
                               ? 'border-neutral-900 shadow-lg'
                               : 'border-neutral-200 hover:border-neutral-400'}`}
                  onClick={() => setSelectedProperty(property.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-semibold">{property.nombre_proyecto}</h3>
                      <p className="text-neutral-500">{property.zona}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">${property.precio_usd.toLocaleString()}</p>
                      <p className="text-sm text-neutral-500">{property.area_m2} m2</p>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="flex gap-4 mb-4 text-neutral-600">
                    <span>{property.dormitorios} dorm</span>
                    <span>{property.banos} banos</span>
                    <span>{property.fotos} fotos</span>
                  </div>

                  {/* Amenities */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {property.amenities.slice(0, 4).map(amenity => (
                      <span
                        key={amenity}
                        className="px-3 py-1 bg-neutral-100 text-neutral-700 rounded-full text-sm"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>

                  {/* Razon fiduciaria */}
                  <div className="bg-simon-50 rounded-xl p-4">
                    <p className="text-simon-800 font-medium">
                      <span className="text-simon-600">Por que encaja: </span>
                      {property.razon_fiduciaria}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Lead capture */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-12 bg-neutral-900 text-white rounded-3xl p-8"
          >
            <h2 className="text-2xl font-bold mb-2">Te interesa alguna?</h2>
            <p className="text-neutral-400 mb-8">
              Un asesor verificara la propiedad y te contactara en menos de 24h.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm text-neutral-400 mb-2">Nombre</label>
                <input
                  type="text"
                  value={leadForm.nombre}
                  onChange={e => setLeadForm(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-3 bg-neutral-800 rounded-xl border border-neutral-700
                           focus:outline-none focus:border-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm text-neutral-400 mb-2">WhatsApp</label>
                <input
                  type="tel"
                  value={leadForm.whatsapp}
                  onChange={e => setLeadForm(prev => ({ ...prev, whatsapp: e.target.value }))}
                  placeholder="+591 7XXXXXXX"
                  className="w-full px-4 py-3 bg-neutral-800 rounded-xl border border-neutral-700
                           focus:outline-none focus:border-white transition-colors"
                />
              </div>
            </div>

            {selectedProperty && (
              <div className="mb-6">
                <label className="block text-sm text-neutral-400 mb-2">
                  Seleccionaste: {properties.find(p => p.id === selectedProperty)?.nombre_proyecto}
                </label>
              </div>
            )}

            <button
              onClick={handleSubmitLead}
              disabled={!leadForm.nombre || !leadForm.whatsapp}
              className="w-full py-4 bg-white text-neutral-900 font-semibold rounded-xl
                        transition-all hover:bg-neutral-100
                        disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Quiero que me contacten
            </button>
          </motion.section>
        </div>
      </main>
    </>
  )
}
