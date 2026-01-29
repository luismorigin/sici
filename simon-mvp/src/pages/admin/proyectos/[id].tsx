import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface FormData {
  nombre_oficial: string
  desarrollador: string
  zona: string
  estado_construccion: string
  fecha_entrega: string
  cantidad_pisos: string
  total_unidades: string
  latitud: string
  longitud: string
  amenidades: string[]
  amenidades_custom: string[]
}

interface ProyectoOriginal {
  id_proyecto_master: number
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
  latitud: number | null
  longitud: number | null
  activo: boolean
  estado_construccion: string | null
  fecha_entrega: string | null
  amenidades_edificio: string[] | null
  cantidad_pisos: number | null
  total_unidades: number | null
  aliases: string[] | null
  updated_at: string | null
}

interface PropiedadVinculada {
  id: number
  precio_usd: number
  dormitorios: number
  area_total_m2: number
  estado_construccion: string | null
}

interface DatosInferidos {
  success: boolean
  error?: string
  total_propiedades: number
  amenidades_sugeridas: string[]
  frecuencia_amenidades: { [key: string]: { cantidad: number; porcentaje: number } }
  estado_sugerido: { estado: string | null; porcentaje: number | null }
  pisos_max: number | null
  fotos_proyecto: { propiedad_id: number; url: string }[]
}

const ZONAS = [
  { id: 'Equipetrol', label: 'Equipetrol Centro' },
  { id: 'Sirari', label: 'Sirari' },
  { id: 'Equipetrol Norte', label: 'Equipetrol Norte' },
  { id: 'Villa Brigida', label: 'Villa Brígida' },
  { id: 'Faremafu', label: 'Equipetrol Oeste (Busch)' }
]

const ESTADO_CONSTRUCCION = [
  { id: 'entrega_inmediata', label: 'Entrega Inmediata' },
  { id: 'en_construccion', label: 'En Construcción' },
  { id: 'preventa', label: 'Preventa' },
  { id: 'en_planos', label: 'En Planos' },
  { id: 'usado', label: 'Usado' },
  { id: 'no_especificado', label: 'No Especificado' }
]

const AMENIDADES_OPCIONES = [
  'Piscina', 'Gimnasio', 'Seguridad 24/7', 'Ascensor', 'Pet Friendly',
  'Co-working', 'Churrasquera', 'Sauna/Jacuzzi', 'Salón de eventos', 'Área de juegos',
  'Roof garden', 'Bar/Lounge', 'Canchas deportivas', 'Sala yoga', 'Jardín'
]

export default function EditarProyecto() {
  const router = useRouter()
  const { id } = router.query

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [propagando, setPropagando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [propagateSuccess, setPropagateSuccess] = useState<string | null>(null)

  const [originalData, setOriginalData] = useState<ProyectoOriginal | null>(null)
  const [propiedades, setPropiedades] = useState<PropiedadVinculada[]>([])

  // Propagación
  const [propagarEstado, setPropagarEstado] = useState(false)
  const [propagarFecha, setPropagarFecha] = useState(false)
  const [propagarAmenidades, setPropagarAmenidades] = useState(false)

  // Inferencia desde propiedades
  const [infiriendo, setInfiriendo] = useState(false)
  const [datosInferidos, setDatosInferidos] = useState<DatosInferidos | null>(null)
  const [lightboxFoto, setLightboxFoto] = useState<string | null>(null)

  const [nuevoAmenidad, setNuevoAmenidad] = useState('')

  const [formData, setFormData] = useState<FormData>({
    nombre_oficial: '',
    desarrollador: '',
    zona: 'Equipetrol',
    estado_construccion: 'no_especificado',
    fecha_entrega: '',
    cantidad_pisos: '',
    total_unidades: '',
    latitud: '',
    longitud: '',
    amenidades: [],
    amenidades_custom: []
  })

  useEffect(() => {
    if (id) {
      fetchProyecto()
      fetchPropiedades()
    }
  }, [id])

  const fetchProyecto = async () => {
    if (!supabase || !id) return

    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('proyectos_master')
        .select('*')
        .eq('id_proyecto_master', id)
        .single()

      if (fetchError || !data) {
        setError('Proyecto no encontrado')
        return
      }

      setOriginalData(data)

      // Separar amenidades standard de custom
      const amenidadesActuales = data.amenidades_edificio || []
      const standardAmenidades = amenidadesActuales.filter((a: string) => AMENIDADES_OPCIONES.includes(a))
      const customAmenidades = amenidadesActuales.filter((a: string) => !AMENIDADES_OPCIONES.includes(a))

      setFormData({
        nombre_oficial: data.nombre_oficial || '',
        desarrollador: data.desarrollador || '',
        zona: data.zona || 'Equipetrol',
        estado_construccion: data.estado_construccion || 'no_especificado',
        fecha_entrega: data.fecha_entrega ? data.fecha_entrega.substring(0, 7) : '', // YYYY-MM
        cantidad_pisos: data.cantidad_pisos?.toString() || '',
        total_unidades: data.total_unidades?.toString() || '',
        latitud: data.latitud?.toString() || '',
        longitud: data.longitud?.toString() || '',
        amenidades: standardAmenidades,
        amenidades_custom: customAmenidades
      })
    } catch (err) {
      console.error('Error fetching proyecto:', err)
      setError('Error cargando proyecto')
    } finally {
      setLoading(false)
    }
  }

  const fetchPropiedades = async () => {
    if (!supabase || !id) return

    try {
      // Solo departamentos (área >= 20m²), excluir parqueos/bauleras
      const { data, error } = await supabase
        .from('propiedades_v2')
        .select('id, precio_usd, dormitorios, area_total_m2, estado_construccion')
        .eq('id_proyecto_master', id)
        .eq('status', 'completado')
        .gte('area_total_m2', 20)
        .order('precio_usd')

      if (!error && data) {
        setPropiedades(data)
      }
    } catch (err) {
      console.error('Error fetching propiedades:', err)
    }
  }

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setSuccess(false)
    setPropagateSuccess(null)
  }

  const toggleAmenidad = (amenidad: string) => {
    setFormData(prev => ({
      ...prev,
      amenidades: prev.amenidades.includes(amenidad)
        ? prev.amenidades.filter(a => a !== amenidad)
        : [...prev.amenidades, amenidad]
    }))
  }

  const agregarAmenidadCustom = () => {
    if (!nuevoAmenidad.trim()) return
    const amenidad = nuevoAmenidad.trim()
    if (formData.amenidades_custom.includes(amenidad) || formData.amenidades.includes(amenidad)) {
      return
    }
    setFormData(prev => ({
      ...prev,
      amenidades_custom: [...prev.amenidades_custom, amenidad]
    }))
    setNuevoAmenidad('')
  }

  const eliminarAmenidadCustom = (amenidad: string) => {
    setFormData(prev => ({
      ...prev,
      amenidades_custom: prev.amenidades_custom.filter(a => a !== amenidad)
    }))
  }

  // Inferir datos desde propiedades vinculadas
  const handleInferir = async () => {
    if (!supabase || !id) return

    setInfiriendo(true)
    setError(null)

    try {
      const { data, error: rpcError } = await supabase
        .rpc('inferir_datos_proyecto', { p_id_proyecto: parseInt(id as string) })

      if (rpcError) throw rpcError

      if (data?.success) {
        setDatosInferidos(data)
      } else {
        setError(data?.error || 'Error al inferir datos')
      }
    } catch (err: any) {
      console.error('Error infiriendo:', err)
      setError(err.message || 'Error al inferir datos del proyecto')
    } finally {
      setInfiriendo(false)
    }
  }

  // Aplicar amenidades inferidas al formulario
  const aplicarAmenidadesInferidas = () => {
    if (!datosInferidos?.amenidades_sugeridas) return

    const nuevasAmenidades = datosInferidos.amenidades_sugeridas
    const standard = nuevasAmenidades.filter(a => AMENIDADES_OPCIONES.includes(a))
    const custom = nuevasAmenidades.filter(a => !AMENIDADES_OPCIONES.includes(a))

    setFormData(prev => ({
      ...prev,
      amenidades: [...new Set([...prev.amenidades, ...standard])],
      amenidades_custom: [...new Set([...prev.amenidades_custom, ...custom])]
    }))
    setSuccess(false)
  }

  // Aplicar estado inferido
  const aplicarEstadoInferido = () => {
    if (!datosInferidos?.estado_sugerido?.estado) return
    updateField('estado_construccion', datosInferidos.estado_sugerido.estado)
  }

  // Aplicar pisos inferidos
  const aplicarPisosInferidos = () => {
    if (!datosInferidos?.pisos_max) return
    updateField('cantidad_pisos', datosInferidos.pisos_max.toString())
  }

  // Helper para obtener label de estado
  const getEstadoLabel = (estadoId: string | null): string => {
    if (!estadoId) return 'No especificado'
    return ESTADO_CONSTRUCCION.find(e => e.id === estadoId)?.label || estadoId
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !id) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Combinar amenidades
      const todasAmenidades = [...formData.amenidades, ...formData.amenidades_custom]

      const updateData: any = {
        nombre_oficial: formData.nombre_oficial,
        desarrollador: formData.desarrollador || null,
        zona: formData.zona,
        estado_construccion: formData.estado_construccion,
        fecha_entrega: formData.fecha_entrega ? `${formData.fecha_entrega}-01` : null,
        cantidad_pisos: formData.cantidad_pisos ? parseInt(formData.cantidad_pisos) : null,
        total_unidades: formData.total_unidades ? parseInt(formData.total_unidades) : null,
        latitud: formData.latitud ? parseFloat(formData.latitud) : null,
        longitud: formData.longitud ? parseFloat(formData.longitud) : null,
        amenidades_edificio: todasAmenidades.length > 0 ? todasAmenidades : null
      }

      const { error: updateError } = await supabase
        .from('proyectos_master')
        .update(updateData)
        .eq('id_proyecto_master', id)

      if (updateError) throw updateError

      setSuccess(true)
      setOriginalData(prev => prev ? { ...prev, ...updateData } : null)
    } catch (err: any) {
      console.error('Error saving:', err)
      setError(err.message || 'Error guardando cambios')
    } finally {
      setSaving(false)
    }
  }

  const handlePropagar = async () => {
    if (!supabase || !id) return
    if (!propagarEstado && !propagarFecha && !propagarAmenidades) {
      setError('Selecciona al menos una opción para propagar')
      return
    }

    setPropagando(true)
    setError(null)
    setPropagateSuccess(null)

    try {
      const { data, error } = await supabase
        .rpc('propagar_proyecto_a_propiedades', {
          p_id_proyecto: parseInt(id as string),
          p_propagar_estado: propagarEstado,
          p_propagar_fecha: propagarFecha,
          p_propagar_amenidades: propagarAmenidades
        })

      if (error) throw error

      if (data?.success) {
        const detalle = data.detalle
        const mensajes = []
        if (detalle.estado_propagado > 0) mensajes.push(`${detalle.estado_propagado} estados`)
        if (detalle.fecha_propagada > 0) mensajes.push(`${detalle.fecha_propagada} fechas`)
        if (detalle.amenidades_propagadas > 0) mensajes.push(`${detalle.amenidades_propagadas} amenidades`)

        setPropagateSuccess(
          mensajes.length > 0
            ? `Propagado: ${mensajes.join(', ')} a ${data.propiedades_afectadas} propiedades`
            : 'No se encontraron propiedades para actualizar'
        )

        // Resetear checkboxes
        setPropagarEstado(false)
        setPropagarFecha(false)
        setPropagarAmenidades(false)

        // Refrescar propiedades
        fetchPropiedades()
      } else {
        setError(data?.error || 'Error en propagación')
      }
    } catch (err: any) {
      console.error('Error propagando:', err)
      setError(err.message || 'Error propagando características')
    } finally {
      setPropagando(false)
    }
  }

  const formatPrecio = (precio: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(precio)
  }

  const mostrarFechaEntrega = formData.estado_construccion === 'preventa' ||
    formData.estado_construccion === 'en_construccion' ||
    formData.estado_construccion === 'en_planos'

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-slate-500">Cargando proyecto...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Editar {originalData?.nombre_oficial || 'Proyecto'} | Admin SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div>
              <Link href="/admin/proyectos" className="text-slate-400 hover:text-white text-sm mb-1 inline-block">
                ← Volver a Proyectos
              </Link>
              <h1 className="text-xl font-bold">{originalData?.nombre_oficial || 'Editar Proyecto'}</h1>
              <p className="text-slate-400 text-sm">ID: {id}</p>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">
                Propiedades
              </Link>
              <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm">
                Ir a Buscar
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto py-8 px-6">
          {/* Mensajes */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Cambios guardados correctamente
            </div>
          )}

          {propagateSuccess && (
            <div className="bg-blue-50 text-blue-600 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {propagateSuccess}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Columna principal */}
              <div className="lg:col-span-2 space-y-6">
                {/* Información Básica */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Información Básica</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Nombre Oficial
                      </label>
                      <input
                        type="text"
                        value={formData.nombre_oficial}
                        onChange={(e) => updateField('nombre_oficial', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Desarrollador
                      </label>
                      <input
                        type="text"
                        value={formData.desarrollador}
                        onChange={(e) => updateField('desarrollador', e.target.value)}
                        placeholder="Ej: Sky Properties"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Zona
                      </label>
                      <select
                        value={formData.zona}
                        onChange={(e) => updateField('zona', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      >
                        {ZONAS.map(z => (
                          <option key={z.id} value={z.id}>{z.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Estado del Proyecto */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Estado del Proyecto</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Estado de Construcción
                      </label>
                      <select
                        value={formData.estado_construccion}
                        onChange={(e) => updateField('estado_construccion', e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      >
                        {ESTADO_CONSTRUCCION.map(e => (
                          <option key={e.id} value={e.id}>{e.label}</option>
                        ))}
                      </select>
                    </div>

                    {mostrarFechaEntrega && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Fecha de Entrega Estimada
                        </label>
                        <input
                          type="month"
                          value={formData.fecha_entrega}
                          onChange={(e) => updateField('fecha_entrega', e.target.value)}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Mes y año estimado de entrega del proyecto
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Características del Edificio */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Características del Edificio</h2>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Cantidad de Pisos
                      </label>
                      <input
                        type="number"
                        value={formData.cantidad_pisos}
                        onChange={(e) => updateField('cantidad_pisos', e.target.value)}
                        min="1"
                        max="100"
                        placeholder="Ej: 15"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Total de Unidades
                      </label>
                      <input
                        type="number"
                        value={formData.total_unidades}
                        onChange={(e) => updateField('total_unidades', e.target.value)}
                        min="1"
                        max="500"
                        placeholder="Ej: 120"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Latitud
                      </label>
                      <input
                        type="text"
                        value={formData.latitud}
                        onChange={(e) => updateField('latitud', e.target.value)}
                        placeholder="-17.7654321"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Longitud
                      </label>
                      <input
                        type="text"
                        value={formData.longitud}
                        onChange={(e) => updateField('longitud', e.target.value)}
                        placeholder="-63.1234567"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  {formData.latitud && formData.longitud && (
                    <div className="mt-3">
                      <a
                        href={`https://www.google.com/maps?q=${formData.latitud},${formData.longitud}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Ver en Google Maps
                      </a>
                    </div>
                  )}
                </div>

                {/* Amenidades del Edificio */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Amenidades del Edificio</h2>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {AMENIDADES_OPCIONES.map(amenidad => (
                      <label
                        key={amenidad}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          formData.amenidades.includes(amenidad)
                            ? 'bg-green-50 border-green-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.amenidades.includes(amenidad)}
                          onChange={() => toggleAmenidad(amenidad)}
                          className="w-4 h-4 rounded text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm text-slate-700">{amenidad}</span>
                      </label>
                    ))}
                  </div>

                  {/* Amenidades custom */}
                  {formData.amenidades_custom.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {formData.amenidades_custom.map(amenidad => (
                        <span
                          key={amenidad}
                          className="bg-purple-100 text-purple-700 text-sm px-3 py-1 rounded-full flex items-center gap-2"
                        >
                          {amenidad}
                          <button
                            type="button"
                            onClick={() => eliminarAmenidadCustom(amenidad)}
                            className="text-purple-500 hover:text-purple-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Agregar custom */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoAmenidad}
                      onChange={(e) => setNuevoAmenidad(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAmenidadCustom())}
                      placeholder="Agregar amenidad personalizada..."
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={agregarAmenidadCustom}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>
              </div>

              {/* Columna lateral */}
              <div className="space-y-6">
                {/* Botón Guardar */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Guardando...
                      </>
                    ) : (
                      'Guardar Cambios'
                    )}
                  </button>
                </div>

                {/* Inferir desde Propiedades */}
                {propiedades.length > 0 && (
                  <div className="bg-emerald-50 rounded-xl shadow-sm p-6 border border-emerald-200">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-emerald-900">
                        Inferir desde Propiedades
                      </h2>
                      <button
                        type="button"
                        onClick={handleInferir}
                        disabled={infiriendo}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        {infiriendo ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Analizando...
                          </>
                        ) : (
                          <>Analizar</>
                        )}
                      </button>
                    </div>

                    {datosInferidos?.success && (
                      <div className="space-y-4">
                        {/* Amenidades detectadas */}
                        <div>
                          <p className="text-sm font-medium text-slate-700 mb-2">
                            Amenidades detectadas ({Object.keys(datosInferidos.frecuencia_amenidades).length}):
                          </p>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {Object.entries(datosInferidos.frecuencia_amenidades)
                              .sort((a, b) => b[1].porcentaje - a[1].porcentaje)
                              .slice(0, 10)
                              .map(([amenidad, info]) => (
                                <span
                                  key={amenidad}
                                  className={`text-xs px-2 py-1 rounded ${
                                    info.porcentaje >= 50
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {amenidad} ({info.porcentaje}%)
                                </span>
                              ))}
                          </div>
                          {datosInferidos.amenidades_sugeridas.length > 0 && (
                            <button
                              type="button"
                              onClick={aplicarAmenidadesInferidas}
                              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                            >
                              + Aplicar {datosInferidos.amenidades_sugeridas.length} amenidades frecuentes (≥50%)
                            </button>
                          )}
                        </div>

                        {/* Estado sugerido */}
                        {datosInferidos.estado_sugerido?.estado && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700">
                              Estado más común: <strong>{getEstadoLabel(datosInferidos.estado_sugerido.estado)}</strong> ({datosInferidos.estado_sugerido.porcentaje}%)
                            </span>
                            <button
                              type="button"
                              onClick={aplicarEstadoInferido}
                              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                            >
                              Aplicar
                            </button>
                          </div>
                        )}

                        {/* Pisos máximo */}
                        {datosInferidos.pisos_max && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-700">
                              Piso máximo detectado: <strong>{datosInferidos.pisos_max}</strong>
                            </span>
                            <button
                              type="button"
                              onClick={aplicarPisosInferidos}
                              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
                            >
                              Aplicar como cant. pisos
                            </button>
                          </div>
                        )}

                        {/* Galería de fotos */}
                        {datosInferidos.fotos_proyecto.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-700 mb-2">
                              Fotos del proyecto ({datosInferidos.fotos_proyecto.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {datosInferidos.fotos_proyecto.slice(0, 8).map((foto, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setLightboxFoto(foto.url)}
                                  className="w-16 h-16 rounded-lg overflow-hidden bg-slate-200 hover:ring-2 hover:ring-emerald-500 transition-all"
                                >
                                  <img
                                    src={foto.url}
                                    alt={`Foto ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                              {datosInferidos.fotos_proyecto.length > 8 && (
                                <span className="text-xs text-slate-500 self-center">
                                  +{datosInferidos.fotos_proyecto.length - 8} más
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <p className="text-xs text-emerald-600 mt-2">
                          Datos inferidos de {datosInferidos.total_propiedades} propiedades
                        </p>
                      </div>
                    )}

                    {!datosInferidos && !infiriendo && (
                      <p className="text-sm text-slate-500">
                        Click en "Analizar" para extraer amenidades, estado y fotos desde las propiedades vinculadas.
                      </p>
                    )}
                  </div>
                )}

                {/* Propiedades Vinculadas */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Propiedades del Proyecto ({propiedades.length})
                  </h2>

                  {propiedades.length === 0 ? (
                    <p className="text-sm text-slate-500">No hay propiedades vinculadas</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {propiedades.slice(0, 10).map(prop => (
                        <div
                          key={prop.id}
                          className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {formatPrecio(prop.precio_usd)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {prop.dormitorios} dorm • {prop.area_total_m2}m²
                            </p>
                          </div>
                          <Link
                            href={`/admin/propiedades/${prop.id}`}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Ver →
                          </Link>
                        </div>
                      ))}
                      {propiedades.length > 10 && (
                        <p className="text-xs text-slate-500 text-center pt-2">
                          +{propiedades.length - 10} más
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Propagación */}
                {propiedades.length > 0 && (
                  <div className="bg-blue-50 rounded-xl shadow-sm p-6 border border-blue-200">
                    <h2 className="text-lg font-semibold text-blue-900 mb-4">
                      Propagar a Propiedades
                    </h2>

                    <div className="space-y-3 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarEstado}
                          onChange={(e) => setPropagarEstado(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar estado de construcción</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarFecha}
                          onChange={(e) => setPropagarFecha(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar fecha de entrega</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarAmenidades}
                          onChange={(e) => setPropagarAmenidades(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar amenidades del edificio</span>
                      </label>
                    </div>

                    <p className="text-xs text-blue-700 mb-4">
                      Solo afecta propiedades SIN candado en esos campos
                    </p>

                    <button
                      type="button"
                      onClick={handlePropagar}
                      disabled={propagando || (!propagarEstado && !propagarFecha && !propagarAmenidades)}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {propagando ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Propagando...
                        </>
                      ) : (
                        'Propagar Seleccionados'
                      )}
                    </button>
                  </div>
                )}

                {/* Info adicional */}
                <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-700 mb-2">Notas:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Las amenidades del edificio aplican a todas las propiedades del proyecto</li>
                    <li>La fecha de entrega se muestra solo para preventa/construcción</li>
                    <li>La propagación respeta los campos bloqueados en cada propiedad</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        </main>

        {/* Lightbox para fotos */}
        {lightboxFoto && (
          <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightboxFoto(null)}
          >
            <button
              type="button"
              onClick={() => setLightboxFoto(null)}
              className="absolute top-4 right-4 text-white text-4xl hover:text-slate-300"
            >
              &times;
            </button>
            <img
              src={lightboxFoto}
              alt="Foto del proyecto"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </>
  )
}
