/**
 * Hook for Proyecto Editor business logic
 * Extracted from admin/proyectos/[id].tsx
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizarPrecio } from '@/lib/precio-utils'
import type {
  ProyectoFormData, ProyectoOriginal, PropiedadVinculada,
  DatosInferidos, FotoProyecto, ProyectoStats
} from '@/types/proyecto-editor'
import {
  AMENIDADES_OPCIONES_PROYECTO as AMENIDADES_OPCIONES,
  EQUIPAMIENTO_OPCIONES_PROYECTO as EQUIPAMIENTO_OPCIONES,
  ESTADO_CONSTRUCCION
} from '@/types/proyecto-editor'

export function useProjectEditor(id: string | string[] | undefined, admin: boolean, authLoading: boolean) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [propagando, setPropagando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [propagateSuccess, setPropagateSuccess] = useState<string | null>(null)

  const [originalData, setOriginalData] = useState<ProyectoOriginal | null>(null)
  const [propiedades, setPropiedades] = useState<PropiedadVinculada[]>([])
  const [tcParalelo, setTcParalelo] = useState(0)

  // Propagación
  const [propagarEstado, setPropagarEstado] = useState(false)
  const [propagarFecha, setPropagarFecha] = useState(false)
  const [propagarAmenidades, setPropagarAmenidades] = useState(false)
  const [propagarEquipamiento, setPropagarEquipamiento] = useState(false)

  // Modal de candados en propagación
  const [showModalCandados, setShowModalCandados] = useState(false)
  const [propiedadesConCandados, setPropiedadesConCandados] = useState<{id: number, codigo: string, campos: string[]}[]>([])
  // Modal de confirmación (cuando no hay candados)
  const [showModalConfirmacion, setShowModalConfirmacion] = useState(false)
  const [totalPropiedadesAPropagar, setTotalPropiedadesAPropagar] = useState(0)

  // Inferencia desde propiedades
  const [infiriendo, setInfiriendo] = useState(false)
  const [datosInferidos, setDatosInferidos] = useState<DatosInferidos | null>(null)
  const [lightboxFoto, setLightboxFoto] = useState<string | null>(null)

  // Selección de amenidades/equipamiento opcionales
  const [amenidadesOpcionalesSeleccionadas, setAmenidadesOpcionalesSeleccionadas] = useState<string[]>([])
  const [equipamientoOpcionalSeleccionado, setEquipamientoOpcionalSeleccionado] = useState<string[]>([])

  // Filtros y visualización de propiedades
  const [filtroDorms, setFiltroDorms] = useState<number | null>(null)
  const [ordenarPor, setOrdenarPor] = useState<'precio' | 'precio_m2' | 'area' | 'dias'>('precio')
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const [ocultarViejas, setOcultarViejas] = useState(true)

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

  const [formData, setFormData] = useState<ProyectoFormData>({
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
    if (authLoading || !admin || !id) return
    fetchProyecto()
    fetchPropiedades()
  }, [authLoading, id])

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

  // === Detectar zona por GPS ===
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
        setZonaDetectada({ zona: data[0].zona, microzona: data[0].microzona || '' })
      } else {
        setZonaDetectada(null)
      }
    } catch (err) {
      console.error('Error detectando zona:', err)
      setZonaDetectada(null)
    }
  }

  // === Crear desarrollador nuevo ===
  const crearNuevoDesarrollador = async (nombre: string) => {
    if (!supabase || !nombre.trim()) return
    try {
      const { data, error } = await supabase.rpc('crear_desarrollador', {
        p_nombre: nombre.trim()
      })
      if (error) throw error
      if (data && data[0]?.success) {
        const nuevoId = data[0].id
        const { data: nuevaLista } = await supabase.rpc('buscar_desarrolladores', {
          p_busqueda: null,
          p_limite: 100
        })
        if (nuevaLista) setDesarrolladoresList(nuevaLista)
        setDesarrolladorSeleccionado({ id: nuevoId, nombre: nombre.trim() })
        setBusquedaDesarrollador(nombre.trim())
        setShowDesarrolladorDropdown(false)
        setFormData(prev => ({ ...prev, desarrollador: nombre.trim() }))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert('Error al crear desarrollador: ' + msg)
    }
  }

  // === Fetch proyecto ===
  async function fetchProyecto() {
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

      const amenidadesActuales = data.amenidades_edificio || []
      const standardAmenidades = amenidadesActuales.filter((a: string) => AMENIDADES_OPCIONES.includes(a))
      const customAmenidades = amenidadesActuales.filter((a: string) => !AMENIDADES_OPCIONES.includes(a))
      const equipamientoActual = data.equipamiento_base || []
      const standardEquipamiento = equipamientoActual.filter((e: string) => EQUIPAMIENTO_OPCIONES.includes(e))
      const customEquipamiento = equipamientoActual.filter((e: string) => !EQUIPAMIENTO_OPCIONES.includes(e))

      setFormData({
        nombre_oficial: data.nombre_oficial || '',
        desarrollador: data.desarrollador || '',
        zona: data.zona || 'Equipetrol',
        estado_construccion: data.estado_construccion || 'no_especificado',
        fecha_entrega: data.fecha_entrega ? data.fecha_entrega.substring(0, 7) : '',
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

  // === Fetch propiedades ===
  async function fetchPropiedades() {
    if (!supabase || !id) return
    try {
      const { data: tcData } = await supabase
        .from('config_global')
        .select('valor')
        .eq('clave', 'tipo_cambio_paralelo')
        .single()
      setTcParalelo(parseFloat(tcData?.valor) || 0)

      const { data, error } = await supabase
        .from('propiedades_v2')
        .select('id, precio_usd, precio_mensual_usd, precio_mensual_bob, tipo_operacion, dormitorios, area_total_m2, estado_construccion, fecha_publicacion, fecha_discovery, fuente, datos_json, tipo_cambio_detectado')
        .eq('id_proyecto_master', id)
        .eq('status', 'completado')
        .eq('es_activa', true)
        .is('duplicado_de', null)
        .gte('area_total_m2', 20)
        .order('tipo_operacion', { ascending: true })
        .order('precio_usd', { ascending: true, nullsFirst: false })

      if (!error && data) {
        setPropiedades(data)
      }
    } catch (err) {
      console.error('Error fetching propiedades:', err)
    }
  }

  // === Form field helpers ===
  const updateField = (field: keyof ProyectoFormData, value: ProyectoFormData[keyof ProyectoFormData]) => {
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
    if (formData.amenidades_custom.includes(amenidad) || formData.amenidades.includes(amenidad)) return
    setFormData(prev => ({ ...prev, amenidades_custom: [...prev.amenidades_custom, amenidad] }))
    setNuevoAmenidad('')
  }

  const eliminarAmenidadCustom = (amenidad: string) => {
    setFormData(prev => ({
      ...prev,
      amenidades_custom: prev.amenidades_custom.filter(a => a !== amenidad)
    }))
  }

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
    if (formData.equipamiento_base_custom.includes(equip) || formData.equipamiento_base.includes(equip)) return
    setFormData(prev => ({ ...prev, equipamiento_base_custom: [...prev.equipamiento_base_custom, equip] }))
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

  // === Fotos ===
  const agregarFoto = () => {
    if (!nuevaFotoUrl.trim()) return
    const url = nuevaFotoUrl.trim()
    if (formData.fotos_proyecto.some(f => f.url === url)) return
    const nuevaFoto: FotoProyecto = { url, orden: formData.fotos_proyecto.length + 1 }
    setFormData(prev => ({ ...prev, fotos_proyecto: [...prev.fotos_proyecto, nuevaFoto] }))
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
    const nuevaFoto: FotoProyecto = { url, orden: formData.fotos_proyecto.length + 1 }
    setFormData(prev => ({ ...prev, fotos_proyecto: [...prev.fotos_proyecto, nuevaFoto] }))
  }

  // === Inferencia ===
  const toggleAmenidadOpcional = (amenidad: string) => {
    setAmenidadesOpcionalesSeleccionadas(prev =>
      prev.includes(amenidad) ? prev.filter(a => a !== amenidad) : [...prev, amenidad]
    )
  }

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
    } catch (err: unknown) {
      console.error('Error infiriendo:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Error al inferir datos del proyecto')
    } finally {
      setInfiriendo(false)
    }
  }

  const aplicarAmenidadesFrecuentes = () => {
    if (!datosInferidos?.amenidades_frecuentes) return
    const nuevas = datosInferidos.amenidades_frecuentes.map(a => a.amenidad)
    const standard = nuevas.filter(a => AMENIDADES_OPCIONES.includes(a))
    const custom = nuevas.filter(a => !AMENIDADES_OPCIONES.includes(a))
    setFormData(prev => ({
      ...prev,
      amenidades: [...new Set([...prev.amenidades, ...standard])],
      amenidades_custom: [...new Set([...prev.amenidades_custom, ...custom])]
    }))
    setSuccess(false)
  }

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

  const aplicarEquipamientoFrecuente = () => {
    if (!datosInferidos?.equipamiento_frecuente) return
    const nuevos = datosInferidos.equipamiento_frecuente.map(e => e.equipamiento)
    const standard = nuevos.filter(e => EQUIPAMIENTO_OPCIONES.includes(e))
    const custom = nuevos.filter(e => !EQUIPAMIENTO_OPCIONES.includes(e))
    setFormData(prev => ({
      ...prev,
      equipamiento_base: [...new Set([...prev.equipamiento_base, ...standard])],
      equipamiento_base_custom: [...new Set([...prev.equipamiento_base_custom, ...custom])]
    }))
    setSuccess(false)
  }

  const toggleEquipamientoOpcional = (equip: string) => {
    setEquipamientoOpcionalSeleccionado(prev =>
      prev.includes(equip) ? prev.filter(e => e !== equip) : [...prev, equip]
    )
  }

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

  const aplicarEstadoInferido = () => {
    if (!datosInferidos?.estado_sugerido?.estado) return
    updateField('estado_construccion', datosInferidos.estado_sugerido.estado)
  }

  const aplicarPisosInferidos = () => {
    if (!datosInferidos?.pisos_max) return
    updateField('cantidad_pisos', datosInferidos.pisos_max.toString())
  }

  const getEstadoLabel = (estadoId: string | null): string => {
    if (!estadoId) return 'No especificado'
    return ESTADO_CONSTRUCCION.find(e => e.id === estadoId)?.label || estadoId
  }

  // === Submit ===
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !id) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const todasAmenidades = [...formData.amenidades, ...formData.amenidades_custom]
      const todosEquipamiento = [...formData.equipamiento_base, ...formData.equipamiento_base_custom]

      const updateData: Record<string, unknown> = {
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
      setOriginalData(prev => prev ? { ...prev, ...updateData } as ProyectoOriginal : null)
    } catch (err: unknown) {
      console.error('Error saving:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Error guardando cambios')
    } finally {
      setSaving(false)
    }
  }

  // === Propagation ===
  const verificarCandadosAntesPropagar = async (): Promise<boolean> => {
    if (!supabase || !id) return false
    const camposAPropagar: string[] = []
    if (propagarEstado) camposAPropagar.push('estado_construccion')
    if (propagarFecha) camposAPropagar.push('fecha_entrega')
    if (propagarAmenidades) camposAPropagar.push('amenities')
    if (propagarEquipamiento) camposAPropagar.push('equipamiento')
    if (camposAPropagar.length === 0) return true

    const { data: propsConCandados, error } = await supabase
      .from('propiedades_v2')
      .select('id, codigo_propiedad, campos_bloqueados')
      .eq('id_proyecto_master', parseInt(id as string))
      .eq('es_activa', true)
      .not('campos_bloqueados', 'is', null)

    if (error) {
      console.error('Error verificando candados:', error)
      return true
    }

    const propiedadesAfectadas = (propsConCandados || [])
      .map(p => {
        const candados = p.campos_bloqueados || {}
        const camposBloqueados = camposAPropagar.filter(campo => {
          const candado = candados[campo]
          return candado === true || (typeof candado === 'object' && candado?.bloqueado === true)
        })
        return { id: p.id, codigo: p.codigo_propiedad, campos: camposBloqueados }
      })
      .filter(p => p.campos.length > 0)

    if (propiedadesAfectadas.length > 0) {
      setPropiedadesConCandados(propiedadesAfectadas)
      setShowModalCandados(true)
      return false
    }
    return true
  }

  const ejecutarPropagacion = async (accion: 'mantener' | 'abrir_temporal' | 'abrir_permanente') => {
    if (!supabase || !id) return
    setPropagando(true)
    setError(null)
    setPropagateSuccess(null)
    setShowModalCandados(false)
    try {
      const { data, error } = await supabase
        .rpc('propagar_proyecto_con_apertura_temporal', {
          p_id_proyecto: parseInt(id as string),
          p_propagar_estado: propagarEstado,
          p_propagar_fecha: propagarFecha,
          p_propagar_amenidades: propagarAmenidades,
          p_propagar_equipamiento: propagarEquipamiento,
          p_modo_candados: accion
        })
      if (error) throw error

      if (data?.success) {
        const detalle = data.detalle
        const mensajes: string[] = []
        if (detalle.estado_propagado > 0) mensajes.push(`${detalle.estado_propagado} estados`)
        if (detalle.fecha_propagada > 0) mensajes.push(`${detalle.fecha_propagada} fechas`)
        if (detalle.amenidades_propagadas > 0) mensajes.push(`${detalle.amenidades_propagadas} amenidades`)
        if (detalle.equipamiento_propagado > 0) mensajes.push(`${detalle.equipamiento_propagado} equipamiento`)

        let mensajeFinal = mensajes.length > 0
          ? `✅ Propagado: ${mensajes.join(', ')} a ${data.propiedades_afectadas} propiedades`
          : 'No se encontraron cambios para aplicar'

        if (data.saltadas_por_candado > 0 && accion === 'mantener') {
          mensajeFinal += ` (${data.saltadas_por_candado} protegidas por candados)`
        } else if (accion === 'abrir_temporal') {
          mensajeFinal += ' (candados originales restaurados)'
        } else if (accion === 'abrir_permanente') {
          mensajeFinal += ' (nuevos candados aplicados)'
        }

        setPropagateSuccess(mensajeFinal)
        setPropagarEstado(false)
        setPropagarFecha(false)
        setPropagarAmenidades(false)
        setPropagarEquipamiento(false)
        fetchPropiedades()
      } else {
        setError(data?.error || 'Error en propagación')
      }
    } catch (err: unknown) {
      console.error('Error propagando:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Error propagando características')
    } finally {
      setPropagando(false)
      setPropiedadesConCandados([])
    }
  }

  const handlePropagar = async () => {
    if (!supabase || !id) return
    if (!propagarEstado && !propagarFecha && !propagarAmenidades && !propagarEquipamiento) {
      setError('Selecciona al menos una opción para propagar')
      return
    }
    const { count } = await supabase
      .from('propiedades_v2')
      .select('id', { count: 'exact', head: true })
      .eq('id_proyecto_master', parseInt(id as string))
      .eq('es_activa', true)

    setTotalPropiedadesAPropagar(count || 0)
    const puedeContinuar = await verificarCandadosAntesPropagar()
    if (!puedeContinuar) return
    setShowModalConfirmacion(true)
  }

  const confirmarPropagacion = async () => {
    setShowModalConfirmacion(false)
    await ejecutarPropagacion('abrir_permanente')
  }

  // === Helpers ===
  const formatPrecio = (precio: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(precio)
  }

  const formatPrecioM2 = (precio: number, area: number): string => {
    if (!area || area === 0) return '-'
    return `$${Math.round(precio / area).toLocaleString()}`
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

  const esPropiedadVieja = (prop: PropiedadVinculada): boolean => {
    return calcularDiasEnMercado(prop) > 300
  }

  // === Computed values ===
  const propiedadesVenta = propiedades.filter(p => p.tipo_operacion === 'venta')
  const propiedadesAlquiler = propiedades.filter(p => p.tipo_operacion === 'alquiler')

  const calcularEstadisticas = (): ProyectoStats | null => {
    if (propiedades.length === 0) return null

    const precios = propiedadesVenta.map(p => normalizarPrecio(p.precio_usd, p.tipo_cambio_detectado, tcParalelo)).filter(p => p > 0)
    const areas = propiedades.map(p => p.area_total_m2).filter(a => a > 0)
    const preciosM2 = propiedadesVenta
      .filter(p => p.precio_usd > 0 && p.area_total_m2 > 0)
      .map(p => normalizarPrecio(p.precio_usd, p.tipo_cambio_detectado, tcParalelo) / p.area_total_m2)
    const preciosMensuales = propiedadesAlquiler.map(p => Number(p.precio_mensual_usd)).filter(p => p > 0)
    const diasMercado = propiedades.map(p => calcularDiasEnMercado(p))

    const porDorms: { [key: number]: number } = {}
    propiedades.forEach(p => {
      const d = p.dormitorios || 0
      porDorms[d] = (porDorms[d] || 0) + 1
    })

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
      totalVenta: propiedadesVenta.length,
      totalAlquiler: propiedadesAlquiler.length,
      precioMin: precios.length > 0 ? Math.min(...precios) : 0,
      precioMax: precios.length > 0 ? Math.max(...precios) : 0,
      precioM2Prom: preciosM2.length > 0 ? Math.round(preciosM2.reduce((a, b) => a + b, 0) / preciosM2.length) : 0,
      alquilerMin: preciosMensuales.length > 0 ? Math.min(...preciosMensuales) : 0,
      alquilerMax: preciosMensuales.length > 0 ? Math.max(...preciosMensuales) : 0,
      alquilerProm: preciosMensuales.length > 0 ? Math.round(preciosMensuales.reduce((a, b) => a + b, 0) / preciosMensuales.length) : 0,
      areaProm: areas.length > 0 ? Math.round(areas.reduce((a, b) => a + b, 0) / areas.length) : 0,
      diasProm: diasMercado.length > 0 ? Math.round(diasMercado.reduce((a, b) => a + b, 0) / diasMercado.length) : 0,
      porDorms,
      topBrokers
    }
  }

  const stats = calcularEstadisticas()

  const propiedadesFiltradas = propiedades
    .filter(p => filtroDorms === null || p.dormitorios === filtroDorms || (filtroDorms === 3 && p.dormitorios >= 3))
    .filter(p => !ocultarViejas || !esPropiedadVieja(p))
    .sort((a, b) => {
      const precioEfectivo = (p: PropiedadVinculada) =>
        p.tipo_operacion === 'alquiler' ? Number(p.precio_mensual_usd || 0) : normalizarPrecio(p.precio_usd, p.tipo_cambio_detectado, tcParalelo)
      switch (ordenarPor) {
        case 'precio_m2':
          return (normalizarPrecio(a.precio_usd, a.tipo_cambio_detectado, tcParalelo) / a.area_total_m2) - (normalizarPrecio(b.precio_usd, b.tipo_cambio_detectado, tcParalelo) / b.area_total_m2)
        case 'area':
          return b.area_total_m2 - a.area_total_m2
        case 'dias':
          return calcularDiasEnMercado(b) - calcularDiasEnMercado(a)
        default:
          return precioEfectivo(a) - precioEfectivo(b)
      }
    })

  const propiedadesVisibles = mostrarTodas ? propiedadesFiltradas : propiedadesFiltradas.slice(0, 15)

  const mostrarFechaEntrega = formData.estado_construccion === 'preventa' ||
    formData.estado_construccion === 'en_construccion' ||
    formData.estado_construccion === 'en_planos'

  return {
    // State
    loading, saving, propagando, error, success, propagateSuccess,
    originalData, propiedades, formData,
    // Propagation
    propagarEstado, setPropagarEstado,
    propagarFecha, setPropagarFecha,
    propagarAmenidades, setPropagarAmenidades,
    propagarEquipamiento, setPropagarEquipamiento,
    showModalCandados, setShowModalCandados,
    propiedadesConCandados, setPropiedadesConCandados,
    showModalConfirmacion, setShowModalConfirmacion,
    totalPropiedadesAPropagar,
    // Inferencia
    infiriendo, datosInferidos, lightboxFoto, setLightboxFoto,
    amenidadesOpcionalesSeleccionadas, equipamientoOpcionalSeleccionado,
    // Filtros
    filtroDorms, setFiltroDorms,
    ordenarPor, setOrdenarPor,
    mostrarTodas, setMostrarTodas,
    ocultarViejas, setOcultarViejas,
    // Input state
    nuevoAmenidad, setNuevoAmenidad,
    nuevoEquipamientoBase, setNuevoEquipamientoBase,
    nuevaFotoUrl, setNuevaFotoUrl,
    // Desarrollador
    desarrolladoresList, busquedaDesarrollador, setBusquedaDesarrollador,
    desarrolladorSeleccionado, setDesarrolladorSeleccionado,
    showDesarrolladorDropdown, setShowDesarrolladorDropdown,
    // GPS
    zonaDetectada,
    // Computed
    stats, propiedadesFiltradas, propiedadesVisibles, mostrarFechaEntrega,
    // Actions
    updateField, toggleAmenidad, agregarAmenidadCustom, eliminarAmenidadCustom,
    toggleEquipamientoBase, agregarEquipamientoBaseCustom, eliminarEquipamientoBaseCustom,
    agregarFoto, eliminarFoto, adoptarFotoInferida,
    detectarZonaPorGPS, crearNuevoDesarrollador,
    handleSubmit, handlePropagar, ejecutarPropagacion, confirmarPropagacion,
    handleInferir, aplicarAmenidadesFrecuentes, aplicarAmenidadesOpcionales,
    aplicarEquipamientoFrecuente, toggleEquipamientoOpcional, aplicarEquipamientoOpcional,
    toggleAmenidadOpcional, aplicarEstadoInferido, aplicarPisosInferidos,
    getEstadoLabel,
    // Formatters
    formatPrecio, formatPrecioM2, formatFecha, calcularDiasEnMercado
  }
}
