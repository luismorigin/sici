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
  equipamiento_base: string[]
  equipamiento_base_custom: string[]
  fotos_proyecto: FotoProyecto[]
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
  equipamiento_base: string[] | null
  cantidad_pisos: number | null
  total_unidades: number | null
  aliases: string[] | null
  updated_at: string | null
  fotos_proyecto: FotoProyecto[] | null
}

interface PropiedadVinculada {
  id: number
  precio_usd: number
  dormitorios: number
  area_total_m2: number
  estado_construccion: string | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  fuente: string | null
  datos_json: {
    agente?: {
      nombre?: string
      oficina_nombre?: string
    }
  } | null
}

interface AmenidadInferida {
  amenidad: string
  porcentaje: number
}

interface EquipamientoInferido {
  equipamiento: string
  porcentaje: number
}

interface DatosInferidos {
  success: boolean
  error?: string
  total_propiedades: number
  amenidades_frecuentes: AmenidadInferida[]
  amenidades_opcionales: AmenidadInferida[]
  frecuencia_amenidades: { [key: string]: { cantidad: number; porcentaje: number } }
  // Equipamiento inferido
  equipamiento_frecuente: EquipamientoInferido[]
  equipamiento_opcional: EquipamientoInferido[]
  frecuencia_equipamiento: { [key: string]: { cantidad: number; porcentaje: number } }
  estado_sugerido: { estado: string | null; porcentaje: number | null }
  pisos_max: number | null
  fotos_proyecto: { propiedad_id: number; url: string }[]
}

interface FotoProyecto {
  url: string
  orden: number
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

// MISMAS opciones que propiedades/[id].tsx para consistencia
const EQUIPAMIENTO_OPCIONES = [
  'Aire acondicionado', 'Cocina equipada', 'Closets', 'Calefón/Termotanque',
  'Cortinas/Blackouts', 'Amoblado', 'Lavadora', 'Secadora', 'Heladera',
  'Microondas', 'Horno empotrado', 'Lavavajillas', 'Balcón', 'Vista panorámica'
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
  const [propagarEquipamiento, setPropagarEquipamiento] = useState(false)

  // Inferencia desde propiedades
  const [infiriendo, setInfiriendo] = useState(false)
  const [datosInferidos, setDatosInferidos] = useState<DatosInferidos | null>(null)
  const [lightboxFoto, setLightboxFoto] = useState<string | null>(null)

  // Selección de amenidades opcionales para aplicar
  const [amenidadesOpcionalesSeleccionadas, setAmenidadesOpcionalesSeleccionadas] = useState<string[]>([])
  // Selección de equipamiento opcional para aplicar
  const [equipamientoOpcionalSeleccionado, setEquipamientoOpcionalSeleccionado] = useState<string[]>([])

  // Filtros y visualización de propiedades
  const [filtroDorms, setFiltroDorms] = useState<number | null>(null)
  const [ordenarPor, setOrdenarPor] = useState<'precio' | 'precio_m2' | 'area' | 'dias'>('precio')
  const [mostrarTodas, setMostrarTodas] = useState(false)

  const [nuevoAmenidad, setNuevoAmenidad] = useState('')
  const [nuevoEquipamientoBase, setNuevoEquipamientoBase] = useState('')
  const [nuevaFotoUrl, setNuevaFotoUrl] = useState('')

  // Desarrolladores (autocomplete)
  const [desarrolladoresList, setDesarrolladoresList] = useState<{id: number, nombre: string, proyectos_count: number}[]>([])
  const [busquedaDesarrollador, setBusquedaDesarrollador] = useState('')
  const [desarrolladorSeleccionado, setDesarrolladorSeleccionado] = useState<{id: number, nombre: string} | null>(null)
  const [showDesarrolladorDropdown, setShowDesarrolladorDropdown] = useState(false)

  // Zona detectada por GPS
  const [zonaDetectada, setZonaDetectada] = useState<{zona: string, microzona: string} | null>(null)

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
    amenidades_custom: [],
    equipamiento_base: [],
    equipamiento_base_custom: [],
    fotos_proyecto: []
  })

  useEffect(() => {
    if (id) {
      fetchProyecto()
      fetchPropiedades()
    }
  }, [id])

  // Cargar desarrolladores para autocomplete
  useEffect(() => {
    const fetchDesarrolladores = async () => {
      if (!supabase) return
      const { data } = await supabase.rpc('buscar_desarrolladores', {
        p_busqueda: null,
        p_limite: 100
      })
      if (data) {
        setDesarrolladoresList(data)
      }
    }
    fetchDesarrolladores()
  }, [])

  // Sincronizar desarrollador seleccionado cuando se carga formData
  useEffect(() => {
    if (formData.desarrollador && desarrolladoresList.length > 0 && !desarrolladorSeleccionado) {
      const match = desarrolladoresList.find(d => d.nombre === formData.desarrollador)
      if (match) {
        setDesarrolladorSeleccionado({ id: match.id, nombre: match.nombre })
        setBusquedaDesarrollador(match.nombre)
      }
    }
  }, [formData.desarrollador, desarrolladoresList])

  // Detectar zona por GPS
  const detectarZonaPorGPS = async (lat: string, lng: string) => {
    if (!supabase || !lat || !lng) {
      setZonaDetectada(null)
      return
    }

    try {
      const latNum = parseFloat(lat)
      const lngNum = parseFloat(lng)

      if (isNaN(latNum) || isNaN(lngNum)) {
        setZonaDetectada(null)
        return
      }

      const { data } = await supabase.rpc('get_zona_by_gps', {
        p_lat: latNum,
        p_lon: lngNum
      })

      if (data && data.length > 0 && data[0].zona) {
        setZonaDetectada({
          zona: data[0].zona,
          microzona: data[0].microzona || ''
        })
      } else {
        setZonaDetectada(null)
      }
    } catch (err) {
      console.error('Error detectando zona:', err)
      setZonaDetectada(null)
    }
  }

  // Crear desarrollador nuevo
  const crearNuevoDesarrollador = async (nombre: string) => {
    if (!supabase || !nombre.trim()) return

    try {
      const { data, error } = await supabase.rpc('crear_desarrollador', {
        p_nombre: nombre.trim()
      })

      if (error) throw error

      if (data && data[0]?.success) {
        const nuevoId = data[0].id
        // Refetch lista
        const { data: nuevaLista } = await supabase.rpc('buscar_desarrolladores', {
          p_busqueda: null,
          p_limite: 100
        })
        if (nuevaLista) setDesarrolladoresList(nuevaLista)

        // Seleccionar el nuevo
        setDesarrolladorSeleccionado({ id: nuevoId, nombre: nombre.trim() })
        setBusquedaDesarrollador(nombre.trim())
        setShowDesarrolladorDropdown(false)
        // Update formData
        setFormData(prev => ({ ...prev, desarrollador: nombre.trim() }))
      }
    } catch (err: any) {
      alert('Error al crear desarrollador: ' + err.message)
    }
  }

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

      // Separar equipamiento base standard de custom
      const equipamientoActual = data.equipamiento_base || []
      const standardEquipamiento = equipamientoActual.filter((e: string) => EQUIPAMIENTO_OPCIONES.includes(e))
      const customEquipamiento = equipamientoActual.filter((e: string) => !EQUIPAMIENTO_OPCIONES.includes(e))

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
        amenidades_custom: customAmenidades,
        equipamiento_base: standardEquipamiento,
        equipamiento_base_custom: customEquipamiento,
        fotos_proyecto: data.fotos_proyecto || []
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
        .select('id, precio_usd, dormitorios, area_total_m2, estado_construccion, fecha_publicacion, fecha_discovery, fuente, datos_json')
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

  // Equipamiento base del edificio
  const toggleEquipamientoBase = (equip: string) => {
    setFormData(prev => ({
      ...prev,
      equipamiento_base: prev.equipamiento_base.includes(equip)
        ? prev.equipamiento_base.filter(e => e !== equip)
        : [...prev.equipamiento_base, equip]
    }))
    setSuccess(false)
  }

  const agregarEquipamientoBaseCustom = () => {
    if (!nuevoEquipamientoBase.trim()) return
    const equip = nuevoEquipamientoBase.trim()
    if (formData.equipamiento_base_custom.includes(equip) || formData.equipamiento_base.includes(equip)) {
      return
    }
    setFormData(prev => ({
      ...prev,
      equipamiento_base_custom: [...prev.equipamiento_base_custom, equip]
    }))
    setNuevoEquipamientoBase('')
    setSuccess(false)
  }

  const eliminarEquipamientoBaseCustom = (equip: string) => {
    setFormData(prev => ({
      ...prev,
      equipamiento_base_custom: prev.equipamiento_base_custom.filter(e => e !== equip)
    }))
    setSuccess(false)
  }

  // Gestión de fotos del proyecto
  const agregarFoto = () => {
    if (!nuevaFotoUrl.trim()) return
    const url = nuevaFotoUrl.trim()
    // Verificar que no exista ya
    if (formData.fotos_proyecto.some(f => f.url === url)) return

    const nuevaFoto: FotoProyecto = {
      url,
      orden: formData.fotos_proyecto.length + 1
    }
    setFormData(prev => ({
      ...prev,
      fotos_proyecto: [...prev.fotos_proyecto, nuevaFoto]
    }))
    setNuevaFotoUrl('')
  }

  const eliminarFoto = (url: string) => {
    setFormData(prev => ({
      ...prev,
      fotos_proyecto: prev.fotos_proyecto
        .filter(f => f.url !== url)
        .map((f, idx) => ({ ...f, orden: idx + 1 }))
    }))
  }

  const adoptarFotoInferida = (url: string) => {
    if (formData.fotos_proyecto.some(f => f.url === url)) return
    const nuevaFoto: FotoProyecto = {
      url,
      orden: formData.fotos_proyecto.length + 1
    }
    setFormData(prev => ({
      ...prev,
      fotos_proyecto: [...prev.fotos_proyecto, nuevaFoto]
    }))
  }

  // Toggle amenidad opcional para selección
  const toggleAmenidadOpcional = (amenidad: string) => {
    setAmenidadesOpcionalesSeleccionadas(prev =>
      prev.includes(amenidad)
        ? prev.filter(a => a !== amenidad)
        : [...prev, amenidad]
    )
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

  // Aplicar amenidades frecuentes (≥50%) al formulario
  const aplicarAmenidadesFrecuentes = () => {
    if (!datosInferidos?.amenidades_frecuentes) return

    const nuevasAmenidades = datosInferidos.amenidades_frecuentes.map(a => a.amenidad)
    const standard = nuevasAmenidades.filter(a => AMENIDADES_OPCIONES.includes(a))
    const custom = nuevasAmenidades.filter(a => !AMENIDADES_OPCIONES.includes(a))

    setFormData(prev => ({
      ...prev,
      amenidades: [...new Set([...prev.amenidades, ...standard])],
      amenidades_custom: [...new Set([...prev.amenidades_custom, ...custom])]
    }))
    setSuccess(false)
  }

  // Aplicar amenidades opcionales seleccionadas al formulario
  const aplicarAmenidadesOpcionales = () => {
    if (amenidadesOpcionalesSeleccionadas.length === 0) return

    const standard = amenidadesOpcionalesSeleccionadas.filter(a => AMENIDADES_OPCIONES.includes(a))
    const custom = amenidadesOpcionalesSeleccionadas.filter(a => !AMENIDADES_OPCIONES.includes(a))

    setFormData(prev => ({
      ...prev,
      amenidades: [...new Set([...prev.amenidades, ...standard])],
      amenidades_custom: [...new Set([...prev.amenidades_custom, ...custom])]
    }))
    setAmenidadesOpcionalesSeleccionadas([])
    setSuccess(false)
  }

  // Aplicar equipamiento frecuente al formulario (≥50%)
  const aplicarEquipamientoFrecuente = () => {
    if (!datosInferidos?.equipamiento_frecuente) return

    const nuevosEquipos = datosInferidos.equipamiento_frecuente.map(e => e.equipamiento)
    const standard = nuevosEquipos.filter(e => EQUIPAMIENTO_OPCIONES.includes(e))
    const custom = nuevosEquipos.filter(e => !EQUIPAMIENTO_OPCIONES.includes(e))

    setFormData(prev => ({
      ...prev,
      equipamiento_base: [...new Set([...prev.equipamiento_base, ...standard])],
      equipamiento_base_custom: [...new Set([...prev.equipamiento_base_custom, ...custom])]
    }))
    setSuccess(false)
  }

  // Toggle equipamiento opcional para selección
  const toggleEquipamientoOpcional = (equip: string) => {
    setEquipamientoOpcionalSeleccionado(prev =>
      prev.includes(equip) ? prev.filter(e => e !== equip) : [...prev, equip]
    )
  }

  // Aplicar equipamiento opcional seleccionado al formulario
  const aplicarEquipamientoOpcional = () => {
    if (equipamientoOpcionalSeleccionado.length === 0) return

    const standard = equipamientoOpcionalSeleccionado.filter(e => EQUIPAMIENTO_OPCIONES.includes(e))
    const custom = equipamientoOpcionalSeleccionado.filter(e => !EQUIPAMIENTO_OPCIONES.includes(e))

    setFormData(prev => ({
      ...prev,
      equipamiento_base: [...new Set([...prev.equipamiento_base, ...standard])],
      equipamiento_base_custom: [...new Set([...prev.equipamiento_base_custom, ...custom])]
    }))
    setEquipamientoOpcionalSeleccionado([])
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
      // Combinar equipamiento base
      const todosEquipamiento = [...formData.equipamiento_base, ...formData.equipamiento_base_custom]

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
        amenidades_edificio: todasAmenidades.length > 0 ? todasAmenidades : null,
        equipamiento_base: todosEquipamiento.length > 0 ? todosEquipamiento : null,
        fotos_proyecto: formData.fotos_proyecto.length > 0 ? formData.fotos_proyecto : null
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
    if (!propagarEstado && !propagarFecha && !propagarAmenidades && !propagarEquipamiento) {
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
          p_propagar_amenidades: propagarAmenidades,
          p_propagar_equipamiento: propagarEquipamiento
        })

      if (error) throw error

      if (data?.success) {
        const detalle = data.detalle
        const mensajes = []
        if (detalle.estado_propagado > 0) mensajes.push(`${detalle.estado_propagado} estados`)
        if (detalle.fecha_propagada > 0) mensajes.push(`${detalle.fecha_propagada} fechas`)
        if (detalle.amenidades_propagadas > 0) mensajes.push(`${detalle.amenidades_propagadas} amenidades`)
        if (detalle.equipamiento_propagado > 0) mensajes.push(`${detalle.equipamiento_propagado} equipamiento`)

        setPropagateSuccess(
          mensajes.length > 0
            ? `Propagado: ${mensajes.join(', ')} a ${data.propiedades_afectadas} propiedades`
            : 'No se encontraron propiedades para actualizar'
        )

        // Resetear checkboxes
        setPropagarEstado(false)
        setPropagarFecha(false)
        setPropagarAmenidades(false)
        setPropagarEquipamiento(false)

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

  const formatPrecioM2 = (precio: number, area: number): string => {
    if (!area || area === 0) return '-'
    const precioM2 = precio / area
    return `$${Math.round(precioM2).toLocaleString()}`
  }

  const formatFecha = (fecha: string | null): string => {
    if (!fecha) return '-'
    const date = new Date(fecha)
    return date.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  const calcularDiasEnMercado = (prop: PropiedadVinculada): number => {
    const fecha = prop.fecha_publicacion || prop.fecha_discovery
    if (!fecha) return 0
    const diff = new Date().getTime() - new Date(fecha).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  // Calcular estadísticas del proyecto
  const calcularEstadisticas = () => {
    if (propiedades.length === 0) return null

    const precios = propiedades.map(p => p.precio_usd).filter(p => p > 0)
    const areas = propiedades.map(p => p.area_total_m2).filter(a => a > 0)
    const preciosM2 = propiedades
      .filter(p => p.precio_usd > 0 && p.area_total_m2 > 0)
      .map(p => p.precio_usd / p.area_total_m2)
    const diasMercado = propiedades.map(p => calcularDiasEnMercado(p))

    // Distribución por dormitorios
    const porDorms: { [key: number]: number } = {}
    propiedades.forEach(p => {
      const d = p.dormitorios || 0
      porDorms[d] = (porDorms[d] || 0) + 1
    })

    // Brokers/Inmobiliarias
    const porBroker: { [key: string]: number } = {}
    propiedades.forEach(p => {
      const broker = p.datos_json?.agente?.oficina_nombre || p.fuente || 'Desconocido'
      porBroker[broker] = (porBroker[broker] || 0) + 1
    })
    const topBrokers = Object.entries(porBroker)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    return {
      total: propiedades.length,
      precioMin: Math.min(...precios),
      precioMax: Math.max(...precios),
      precioM2Prom: preciosM2.length > 0 ? Math.round(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length) : 0,
      areaProm: areas.length > 0 ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0,
      diasProm: diasMercado.length > 0 ? Math.round(diasMercado.reduce((a, b) => a + b, 0) / diasMercado.length) : 0,
      porDorms,
      topBrokers
    }
  }

  const stats = calcularEstadisticas()

  // Filtrar y ordenar propiedades
  const propiedadesFiltradas = propiedades
    .filter(p => filtroDorms === null || p.dormitorios === filtroDorms || (filtroDorms === 3 && p.dormitorios >= 3))
    .sort((a, b) => {
      switch (ordenarPor) {
        case 'precio_m2':
          return (a.precio_usd / a.area_total_m2) - (b.precio_usd / b.area_total_m2)
        case 'area':
          return b.area_total_m2 - a.area_total_m2
        case 'dias':
          return calcularDiasEnMercado(b) - calcularDiasEnMercado(a)
        default:
          return a.precio_usd - b.precio_usd
      }
    })

  const propiedadesVisibles = mostrarTodas ? propiedadesFiltradas : propiedadesFiltradas.slice(0, 15)

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
              <Link href="/admin/supervisor" className="text-amber-400 hover:text-amber-300 text-sm font-medium">
                Supervisor HITL
              </Link>
              <Link href="/admin/salud" className="text-teal-400 hover:text-teal-300 text-sm font-medium">
                Salud
              </Link>
              <Link href="/admin/market" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
                Market
              </Link>
              <Link href="/" className="text-slate-300 hover:text-white text-sm">
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

                    {/* Desarrollador (Autocomplete) */}
                    <div className="relative">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Desarrollador
                      </label>
                      {desarrolladorSeleccionado ? (
                        <div className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50">
                          <span className="text-slate-900 flex-1">{desarrolladorSeleccionado.nombre}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setDesarrolladorSeleccionado(null)
                              setBusquedaDesarrollador('')
                              updateField('desarrollador', '')
                            }}
                            className="text-slate-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={busquedaDesarrollador}
                            onChange={(e) => {
                              setBusquedaDesarrollador(e.target.value)
                              setShowDesarrolladorDropdown(true)
                            }}
                            onFocus={() => setShowDesarrolladorDropdown(true)}
                            placeholder="Buscar o crear desarrollador..."
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                          />
                          {showDesarrolladorDropdown && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {desarrolladoresList
                                .filter(d => !busquedaDesarrollador || d.nombre.toLowerCase().includes(busquedaDesarrollador.toLowerCase()))
                                .slice(0, 8)
                                .map(d => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => {
                                      setDesarrolladorSeleccionado({ id: d.id, nombre: d.nombre })
                                      setBusquedaDesarrollador(d.nombre)
                                      setShowDesarrolladorDropdown(false)
                                      updateField('desarrollador', d.nombre)
                                    }}
                                    className="w-full px-4 py-2 text-left hover:bg-amber-50 border-b border-slate-100 last:border-0"
                                  >
                                    <span className="font-medium text-slate-900">{d.nombre}</span>
                                    <span className="text-xs text-slate-500 ml-2">({d.proyectos_count} proyectos)</span>
                                  </button>
                                ))}
                              {busquedaDesarrollador && !desarrolladoresList.some(d => d.nombre.toLowerCase() === busquedaDesarrollador.toLowerCase()) && (
                                <button
                                  type="button"
                                  onClick={() => crearNuevoDesarrollador(busquedaDesarrollador)}
                                  className="w-full px-4 py-2 text-left hover:bg-green-50 text-green-700 font-medium"
                                >
                                  + Crear "{busquedaDesarrollador}"
                                </button>
                              )}
                              {!busquedaDesarrollador && (
                                <div className="px-4 py-2 text-xs text-slate-400">
                                  Escribe para buscar o crear nuevo
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
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
                        onChange={(e) => {
                          updateField('latitud', e.target.value)
                          detectarZonaPorGPS(e.target.value, formData.longitud)
                        }}
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
                        onChange={(e) => {
                          updateField('longitud', e.target.value)
                          detectarZonaPorGPS(formData.latitud, e.target.value)
                        }}
                        placeholder="-63.1234567"
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Zona detectada por GPS */}
                  {zonaDetectada && (
                    <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-green-700 text-sm">Zona detectada: </span>
                          <strong className="text-green-800">{zonaDetectada.zona}</strong>
                          {zonaDetectada.microzona && (
                            <span className="text-green-600 ml-1">({zonaDetectada.microzona})</span>
                          )}
                        </div>
                        {zonaDetectada.zona !== formData.zona && (
                          <button
                            type="button"
                            onClick={() => updateField('zona', zonaDetectada.zona)}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                          >
                            Usar esta zona
                          </button>
                        )}
                      </div>
                    </div>
                  )}

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

                {/* Equipamiento Base del Edificio */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-1">🔧 Equipamiento Base del Edificio</h2>
                  <p className="text-sm text-slate-500 mb-4">Equipamiento incluido de fábrica en todas las unidades</p>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {EQUIPAMIENTO_OPCIONES.map(equip => (
                      <label
                        key={equip}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          formData.equipamiento_base.includes(equip)
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.equipamiento_base.includes(equip)}
                          onChange={() => toggleEquipamientoBase(equip)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">{equip}</span>
                      </label>
                    ))}
                  </div>

                  {/* Equipamiento custom */}
                  {formData.equipamiento_base_custom.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {formData.equipamiento_base_custom.map(equip => (
                        <span
                          key={equip}
                          className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full flex items-center gap-2"
                        >
                          {equip}
                          <button
                            type="button"
                            onClick={() => eliminarEquipamientoBaseCustom(equip)}
                            className="text-blue-500 hover:text-blue-700"
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
                      value={nuevoEquipamientoBase}
                      onChange={(e) => setNuevoEquipamientoBase(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEquipamientoBaseCustom())}
                      placeholder="Agregar equipamiento personalizado..."
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={agregarEquipamientoBaseCustom}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>
                </div>

                {/* Fotos del Proyecto */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Fotos del Proyecto</h2>

                  {/* Galería de fotos actuales */}
                  {formData.fotos_proyecto.length > 0 && (
                    <div className="flex flex-wrap gap-3 mb-4">
                      {formData.fotos_proyecto.map((foto, idx) => (
                        <div key={foto.url} className="relative group">
                          <button
                            type="button"
                            onClick={() => setLightboxFoto(foto.url)}
                            className="w-24 h-24 rounded-lg overflow-hidden bg-slate-200 hover:ring-2 hover:ring-amber-500 transition-all"
                          >
                            <img
                              src={foto.url}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarFoto(foto.url)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                          <span className="absolute bottom-1 left-1 bg-black/50 text-white text-xs px-1 rounded">
                            {foto.orden}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Agregar foto por URL */}
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={nuevaFotoUrl}
                      onChange={(e) => setNuevaFotoUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarFoto())}
                      placeholder="URL de imagen (https://...)..."
                      className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={agregarFoto}
                      disabled={!nuevaFotoUrl.trim()}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 rounded-lg transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 mt-2">
                    También puedes adoptar fotos desde "Inferir desde Propiedades"
                  </p>
                </div>

                {/* Propiedades Vinculadas - Con Dashboard y Filtros */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">
                    Propiedades del Proyecto ({propiedades.length})
                  </h2>

                  {propiedades.length === 0 ? (
                    <p className="text-sm text-slate-500">No hay propiedades vinculadas</p>
                  ) : (
                    <>
                      {/* Dashboard de Estadísticas */}
                      {stats && (
                        <div className="mb-6 bg-gradient-to-r from-slate-50 to-slate-100 rounded-lg p-4">
                          {/* Métricas principales */}
                          <div className="grid grid-cols-5 gap-4 mb-4">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                              <p className="text-xs text-slate-500">Unidades</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-slate-800">
                                ${Math.round(stats.precioMin / 1000)}k - ${Math.round(stats.precioMax / 1000)}k
                              </p>
                              <p className="text-xs text-slate-500">Rango precios</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-emerald-600">${stats.precioM2Prom.toLocaleString()}</p>
                              <p className="text-xs text-slate-500">$/m² prom</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-slate-800">{stats.areaProm}m²</p>
                              <p className="text-xs text-slate-500">Área prom</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-semibold text-amber-600">{stats.diasProm}</p>
                              <p className="text-xs text-slate-500">Días prom</p>
                            </div>
                          </div>

                          {/* Distribución por dormitorios */}
                          <div className="flex items-center gap-4 mb-3">
                            <span className="text-xs text-slate-500 w-16">Tipología:</span>
                            <div className="flex-1 flex items-center gap-3">
                              {Object.entries(stats.porDorms)
                                .sort((a, b) => Number(a[0]) - Number(b[0]))
                                .map(([dorms, count]) => {
                                  const pct = Math.round((count / stats.total) * 100)
                                  return (
                                    <div key={dorms} className="flex items-center gap-1">
                                      <span className="text-xs font-medium">{dorms}🛏️</span>
                                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-blue-500 rounded-full"
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-500">{pct}%</span>
                                    </div>
                                  )
                                })}
                            </div>
                          </div>

                          {/* Top Brokers */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-16">Brokers:</span>
                            <div className="flex flex-wrap gap-2">
                              {stats.topBrokers.map(([broker, count]) => (
                                <span key={broker} className="text-xs bg-white px-2 py-1 rounded border border-slate-200">
                                  {broker} <span className="font-semibold">({count})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Filtros */}
                      <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Filtrar:</span>
                          <div className="flex gap-1">
                            {[null, 1, 2, 3].map(d => (
                              <button
                                key={d ?? 'all'}
                                type="button"
                                onClick={() => setFiltroDorms(d)}
                                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                                  filtroDorms === d
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                {d === null ? 'Todos' : d === 3 ? '3+🛏️' : `${d}🛏️`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Ordenar:</span>
                          <select
                            value={ordenarPor}
                            onChange={(e) => setOrdenarPor(e.target.value as any)}
                            className="text-sm border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="precio">Precio</option>
                            <option value="precio_m2">$/m²</option>
                            <option value="area">Área</option>
                            <option value="dias">Días en mercado</option>
                          </select>
                        </div>

                        {propiedadesFiltradas.length !== propiedades.length && (
                          <span className="text-xs text-slate-500">
                            Mostrando {propiedadesFiltradas.length} de {propiedades.length}
                          </span>
                        )}
                      </div>

                      {/* Tabla */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                              <th className="pb-2 pr-3 font-medium">ID</th>
                              <th className="pb-2 pr-3 font-medium">Precio</th>
                              <th className="pb-2 pr-3 font-medium">$/m²</th>
                              <th className="pb-2 pr-3 font-medium">Dorms</th>
                              <th className="pb-2 pr-3 font-medium">Área</th>
                              <th className="pb-2 pr-3 font-medium">Publicado</th>
                              <th className="pb-2 pr-3 font-medium">Días</th>
                              <th className="pb-2 font-medium text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {propiedadesVisibles.map(prop => (
                              <tr key={prop.id} className="hover:bg-slate-50">
                                <td className="py-2 pr-3 text-slate-500 text-xs">#{prop.id}</td>
                                <td className="py-2 pr-3 font-medium text-slate-900">
                                  {formatPrecio(prop.precio_usd)}
                                </td>
                                <td className="py-2 pr-3 text-slate-600">
                                  {formatPrecioM2(prop.precio_usd, prop.area_total_m2)}
                                </td>
                                <td className="py-2 pr-3 text-slate-600">{prop.dormitorios}</td>
                                <td className="py-2 pr-3 text-slate-600">{prop.area_total_m2}m²</td>
                                <td className="py-2 pr-3 text-slate-500 text-xs">
                                  {formatFecha(prop.fecha_publicacion || prop.fecha_discovery)}
                                </td>
                                <td className="py-2 pr-3 text-slate-500 text-xs">
                                  {calcularDiasEnMercado(prop)}d
                                </td>
                                <td className="py-2 text-right">
                                  <Link
                                    href={`/admin/propiedades/${prop.id}`}
                                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                                  >
                                    Ver →
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Toggle ver más/menos */}
                      {propiedadesFiltradas.length > 15 && (
                        <div className="text-center pt-3 border-t border-slate-100 mt-2">
                          <button
                            type="button"
                            onClick={() => setMostrarTodas(!mostrarTodas)}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {mostrarTodas
                              ? '▲ Mostrar menos'
                              : `▼ Ver todas (${propiedadesFiltradas.length - 15} más)`
                            }
                          </button>
                        </div>
                      )}
                    </>
                  )}
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
                        {/* Amenidades Frecuentes (≥50%) */}
                        {datosInferidos.amenidades_frecuentes?.length > 0 && (
                          <div className="bg-green-50 rounded-lg p-3">
                            <p className="text-sm font-medium text-green-800 mb-2">
                              ✅ Frecuentes (≥50%):
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {datosInferidos.amenidades_frecuentes.map(({ amenidad, porcentaje }) => (
                                <span
                                  key={amenidad}
                                  className="text-xs px-2 py-1 rounded bg-green-100 text-green-700"
                                >
                                  {amenidad} ({porcentaje}%)
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={aplicarAmenidadesFrecuentes}
                              className="text-xs text-green-700 hover:text-green-900 underline font-medium"
                            >
                              + Aplicar {datosInferidos.amenidades_frecuentes.length} amenidades
                            </button>
                          </div>
                        )}

                        {/* Amenidades Opcionales (<50%) */}
                        {datosInferidos.amenidades_opcionales?.length > 0 && (
                          <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-sm font-medium text-slate-700 mb-2">
                              ⚡ Opcionales (&lt;50%):
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {datosInferidos.amenidades_opcionales.map(({ amenidad, porcentaje }) => (
                                <label
                                  key={amenidad}
                                  className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                                    amenidadesOpcionalesSeleccionadas.includes(amenidad)
                                      ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-400'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={amenidadesOpcionalesSeleccionadas.includes(amenidad)}
                                    onChange={() => toggleAmenidadOpcional(amenidad)}
                                    className="sr-only"
                                  />
                                  {amenidad} ({porcentaje}%)
                                </label>
                              ))}
                            </div>
                            {amenidadesOpcionalesSeleccionadas.length > 0 && (
                              <button
                                type="button"
                                onClick={aplicarAmenidadesOpcionales}
                                className="text-xs text-amber-700 hover:text-amber-900 underline font-medium"
                              >
                                + Aplicar {amenidadesOpcionalesSeleccionadas.length} seleccionadas
                              </button>
                            )}
                          </div>
                        )}

                        {/* Equipamiento Inferido */}
                        {(datosInferidos.equipamiento_frecuente?.length > 0 || datosInferidos.equipamiento_opcional?.length > 0) && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <p className="text-sm font-medium text-slate-700 mb-2">🔧 Equipamiento Detectado</p>

                            {/* Equipamiento frecuente (≥50%) */}
                            {datosInferidos.equipamiento_frecuente?.length > 0 && (
                              <div className="mb-3">
                                <p className="text-xs text-blue-600 mb-1">✅ Frecuente (≥50%):</p>
                                <div className="bg-blue-50 rounded p-2 mb-2">
                                  {datosInferidos.equipamiento_frecuente.map(e => (
                                    <div key={e.equipamiento} className="text-xs text-blue-700">
                                      {e.equipamiento} ({e.porcentaje}%)
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={aplicarEquipamientoFrecuente}
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Aplicar {datosInferidos.equipamiento_frecuente.length} equipamientos
                                </button>
                              </div>
                            )}

                            {/* Equipamiento opcional (<50%) */}
                            {datosInferidos.equipamiento_opcional?.length > 0 && (
                              <div>
                                <p className="text-xs text-slate-500 mb-1">⚡ Opcional (&lt;50%):</p>
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {datosInferidos.equipamiento_opcional.map(e => (
                                    <label
                                      key={e.equipamiento}
                                      className={`text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
                                        equipamientoOpcionalSeleccionado.includes(e.equipamiento)
                                          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-400'
                                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={equipamientoOpcionalSeleccionado.includes(e.equipamiento)}
                                        onChange={() => toggleEquipamientoOpcional(e.equipamiento)}
                                        className="sr-only"
                                      />
                                      {e.equipamiento} ({e.porcentaje}%)
                                    </label>
                                  ))}
                                </div>
                                {equipamientoOpcionalSeleccionado.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={aplicarEquipamientoOpcional}
                                    className="text-xs text-blue-700 hover:text-blue-900 underline font-medium"
                                  >
                                    + Aplicar {equipamientoOpcionalSeleccionado.length} seleccionados
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}

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

                        {/* Galería de fotos inferidas */}
                        {datosInferidos.fotos_proyecto.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-700 mb-2">
                              Fotos de propiedades ({datosInferidos.fotos_proyecto.length}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {datosInferidos.fotos_proyecto.slice(0, 8).map((foto, idx) => {
                                const yaAdoptada = formData.fotos_proyecto.some(f => f.url === foto.url)
                                return (
                                  <div key={idx} className="relative group">
                                    <button
                                      type="button"
                                      onClick={() => setLightboxFoto(foto.url)}
                                      className={`w-16 h-16 rounded-lg overflow-hidden bg-slate-200 transition-all ${
                                        yaAdoptada ? 'ring-2 ring-green-500' : 'hover:ring-2 hover:ring-emerald-500'
                                      }`}
                                    >
                                      <img
                                        src={foto.url}
                                        alt={`Foto ${idx + 1}`}
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                    {!yaAdoptada && (
                                      <button
                                        type="button"
                                        onClick={() => adoptarFotoInferida(foto.url)}
                                        className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 text-white rounded-full text-xs hover:bg-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                        title="Adoptar foto"
                                      >
                                        +
                                      </button>
                                    )}
                                    {yaAdoptada && (
                                      <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 text-white rounded-full text-xs flex items-center justify-center">
                                        ✓
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                              {datosInferidos.fotos_proyecto.length > 8 && (
                                <span className="text-xs text-slate-500 self-center">
                                  +{datosInferidos.fotos_proyecto.length - 8} más
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              Click en + para adoptar foto al proyecto
                            </p>
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
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={propagarEquipamiento}
                          onChange={(e) => setPropagarEquipamiento(e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-700">Propagar equipamiento base</span>
                      </label>
                    </div>

                    <p className="text-xs text-blue-700 mb-4">
                      Solo afecta propiedades SIN candado en esos campos
                    </p>

                    <button
                      type="button"
                      onClick={handlePropagar}
                      disabled={propagando || (!propagarEstado && !propagarFecha && !propagarAmenidades && !propagarEquipamiento)}
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
