/**
 * Hook: all state + business logic for /admin/propiedades/[id]
 * Extracted from the monolithic page component (S3 refactor)
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  EstadoInclusion, CuotaPago, FormData, CamposBloqueados,
  PropiedadOriginal, ProyectoMaster, ProyectoOption, HistorialEntry,
} from '@/types/propiedad-editor'
import {
  MICROZONAS, MICROZONA_ID_TO_DB, AMENIDADES_OPCIONES, EQUIPAMIENTO_OPCIONES,
  ESTADO_CONSTRUCCION, MOMENTOS_PAGO, CAMPOS_BLOQUEABLES,
} from '@/config/propiedad-constants'

const INITIAL_FORM: FormData = {
  tipo_operacion: 'venta',
  proyecto_nombre: '',
  desarrollador: '',
  microzona: 'equipetrol_centro',
  piso: '',
  precio_publicado: '',
  tipo_precio: 'usd_oficial',
  area_m2: '',
  dormitorios: '2',
  banos: '2',
  estacionamientos: '1',
  parqueo_opcion: 'sin_confirmar',
  parqueo_precio_adicional: '',
  baulera: false,
  baulera_opcion: 'sin_confirmar',
  baulera_precio_adicional: '',
  estado_construccion: 'no_especificado',
  fecha_entrega: '',
  expensas_usd: '',
  acepta_financiamiento: false,
  plan_pagos_cuotas: [],
  plan_pagos_texto: '',
  solo_tc_paralelo: false,
  acepta_permuta: false,
  precio_negociable: false,
  descuento_contado: '',
  latitud: '',
  longitud: '',
  asesor_nombre: '',
  asesor_telefono: '',
  asesor_inmobiliaria: '',
  descripcion: '',
  amenidades: [],
  amenidades_custom: [],
  equipamiento: [],
  equipamiento_custom: [],
}

export function usePropertyEditor(id: string | undefined, enabled: boolean) {
  // ---- Core state ----
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Validation
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const [showWarningConfirm, setShowWarningConfirm] = useState(false)

  // Data
  const [originalData, setOriginalData] = useState<PropiedadOriginal | null>(null)
  const [proyectoMaster, setProyectoMaster] = useState<ProyectoMaster | null>(null)
  const [proyectosList, setProyectosList] = useState<ProyectoOption[]>([])
  const [showProyectoSuggestions, setShowProyectoSuggestions] = useState(false)
  const [selectedProyectoId, setSelectedProyectoId] = useState<number | null>(null)
  const [historial, setHistorial] = useState<HistorialEntry[]>([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [showMicrozonaCustom, setShowMicrozonaCustom] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // TC Paralelo
  const [tcParaleloActual, setTcParaleloActual] = useState<number | null>(null)

  // Gallery
  const [fotos, setFotos] = useState<string[]>([])
  const [fotoActual, setFotoActual] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Amenity/equip custom inputs
  const [nuevoAmenidad, setNuevoAmenidad] = useState('')
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState('')

  // Lock panel
  const [showCandadosPanel, setShowCandadosPanel] = useState(false)

  // Sync from project
  const [showSincronizar, setShowSincronizar] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [sincEstado, setSincEstado] = useState(true)
  const [sincFecha, setSincFecha] = useState(true)
  const [sincAmenidades, setSincAmenidades] = useState(true)
  const [sincEquipamiento, setSincEquipamiento] = useState(true)

  // Auto-lock on save
  const [autoBloquearAlGuardar, setAutoBloquearAlGuardar] = useState(true)

  // Form
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM)

  // ---- Effects ----

  useEffect(() => {
    if (!enabled || !id) return
    fetchPropiedad()
    fetchHistorial()
  }, [enabled, id])

  // Load project list for selector
  useEffect(() => {
    const fetchProyectos = async () => {
      if (!supabase) return
      const { data, error } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial, desarrollador, latitud, longitud')
        .eq('activo', true)
        .order('nombre_oficial')

      if (!error && data) {
        setProyectosList(data.map(p => ({
          id: p.id_proyecto_master,
          nombre: p.nombre_oficial,
          desarrollador: p.desarrollador,
          latitud: p.latitud ? parseFloat(p.latitud) : null,
          longitud: p.longitud ? parseFloat(p.longitud) : null,
        })))
      }
    }
    fetchProyectos()
  }, [])

  // ---- Helpers ----

  const extraerFotos = (data: PropiedadOriginal): string[] => {
    if (data.datos_json?.contenido?.fotos_urls && Array.isArray(data.datos_json.contenido.fotos_urls)) {
      return data.datos_json.contenido.fotos_urls
    }
    if (data.fuente === 'remax' && data.datos_json_discovery?.default_imagen?.url) {
      return [data.datos_json_discovery.default_imagen.url]
    }
    if (data.fuente === 'century21' && data.datos_json_discovery?.fotos?.propiedadThumbnail) {
      return data.datos_json_discovery.fotos.propiedadThumbnail
    }
    return []
  }

  const formatFecha = (fecha: string): string => {
    return new Date(fecha).toLocaleDateString('es-BO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const formatPrecio = (precio: number): string => {
    if (formData.tipo_operacion === 'alquiler') {
      return `Bs ${new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 }).format(precio)}`
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(precio)
  }

  const getDormitoriosLabel = (dorms: string): string => {
    const num = parseInt(dorms)
    if (num === 0) return 'Monoambiente'
    return `${num} dorm${num > 1 ? 's' : ''}`
  }

  // ---- Data Fetching ----

  async function fetchPropiedad() {
    if (!supabase || !id) return

    setLoading(true)
    try {
      const [propResult, tcResult] = await Promise.all([
        supabase.from('propiedades_v2').select('*').eq('id', id).single(),
        supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single(),
      ])

      const { data, error: fetchError } = propResult
      if (fetchError || !data) { setError('Propiedad no encontrada'); return }

      if (tcResult.data?.valor) setTcParaleloActual(parseFloat(tcResult.data.valor))

      setOriginalData(data)

      // Fetch proyecto master
      let pmData: ProyectoMaster | null = null
      if (data.id_proyecto_master) {
        const { data: pmResult } = await supabase
          .from('proyectos_master')
          .select('nombre_oficial, desarrollador, zona, estado_construccion, fecha_entrega, amenidades_edificio, equipamiento_base')
          .eq('id_proyecto_master', data.id_proyecto_master)
          .single()
        if (pmResult) {
          pmData = pmResult
          setProyectoMaster(pmResult)
          setSelectedProyectoId(data.id_proyecto_master)
        }
      } else {
        setSelectedProyectoId(null)
      }

      // Photos
      setFotos(extraerFotos(data))

      // Amenities parsing
      const amenitiesData = data.datos_json?.amenities || {}
      const listaAmenidades = amenitiesData.lista || []
      const listaEquipamiento = amenitiesData.equipamiento || []

      const amenidadesLower = AMENIDADES_OPCIONES.map(a => a.toLowerCase())
      const standardAmenidades = listaAmenidades
        .filter((a: string) => amenidadesLower.includes(a.toLowerCase()))
        .map((a: string) => AMENIDADES_OPCIONES.find(opt => opt.toLowerCase() === a.toLowerCase()) || a)
      const customAmenidades = listaAmenidades
        .filter((a: string) => !amenidadesLower.includes(a.toLowerCase()))

      const equipamientoLower = EQUIPAMIENTO_OPCIONES.map(e => e.toLowerCase())
      const standardEquipamiento = listaEquipamiento
        .filter((e: string) => equipamientoLower.includes(e.toLowerCase()))
        .map((e: string) => EQUIPAMIENTO_OPCIONES.find(opt => opt.toLowerCase() === e.toLowerCase()) || e)
      const customEquipamiento = listaEquipamiento
        .filter((e: string) => !equipamientoLower.includes(e.toLowerCase()))

      // Determine price type
      let tipoPrecio: 'usd_oficial' | 'usd_paralelo' | 'bob' = 'usd_oficial'
      let precioPublicado = data.precio_usd?.toString() || ''

      if (data.tipo_operacion === 'alquiler') {
        tipoPrecio = 'bob'
        precioPublicado = data.precio_mensual_bob?.toString() || ''
      } else if (data.moneda_original === 'USD') {
        tipoPrecio = 'usd_oficial'
        precioPublicado = data.precio_usd?.toString() || ''
      } else if (data.tipo_cambio_detectado === 'paralelo') {
        tipoPrecio = 'usd_paralelo'
        precioPublicado = data.datos_json_enrichment?.precio_usd_original?.toString() || data.precio_usd?.toString() || ''
      } else if (data.tipo_cambio_detectado === 'oficial') {
        tipoPrecio = 'bob'
        precioPublicado = data.precio_usd_original?.toString() || ''
      } else {
        tipoPrecio = 'usd_oficial'
        precioPublicado = data.precio_usd?.toString() || ''
      }

      // Microzona
      const microzonaExistente = MICROZONAS.find(m =>
        m.id === data.microzona || m.label === data.microzona || m.label === data.zona
      )
      const microzonaValue = microzonaExistente?.id || 'equipetrol_centro'
      if (data.microzona && !microzonaExistente) setShowMicrozonaCustom(true)

      // Payment legacy fallback
      const formaPagoLegacy = data.datos_json?.forma_pago || {}
      const getOpcionInclusion = (incluido: boolean | null, precioAdicional: number | null): EstadoInclusion => {
        if (incluido === true) return 'incluido'
        if (incluido === false && precioAdicional && precioAdicional > 0) return 'precio_adicional'
        if (incluido === false) return 'no_incluido'
        return 'sin_confirmar'
      }

      setFormData({
        tipo_operacion: data.tipo_operacion || 'venta',
        proyecto_nombre: pmData?.nombre_oficial || data.nombre_edificio || '',
        desarrollador: '',
        microzona: microzonaValue,
        piso: data.piso?.toString() || data.datos_json?.piso?.toString() || '',
        precio_publicado: precioPublicado,
        tipo_precio: tipoPrecio,
        area_m2: data.area_total_m2?.toString() || '',
        dormitorios: data.dormitorios?.toString() || '2',
        banos: data.banos?.toString() || '2',
        estacionamientos: data.estacionamientos?.toString() || '',
        parqueo_opcion: getOpcionInclusion(data.parqueo_incluido, data.parqueo_precio_adicional),
        parqueo_precio_adicional: data.parqueo_precio_adicional?.toString() || '',
        baulera: data.baulera || false,
        baulera_opcion: getOpcionInclusion(data.baulera_incluido, data.baulera_precio_adicional),
        baulera_precio_adicional: data.baulera_precio_adicional?.toString() || '',
        estado_construccion: data.estado_construccion || 'no_especificado',
        fecha_entrega: data.datos_json?.fecha_entrega || '',
        expensas_usd: data.datos_json?.expensas_usd?.toString() || '',
        acepta_financiamiento: data.plan_pagos_desarrollador ?? formaPagoLegacy.acepta_financiamiento ?? false,
        plan_pagos_cuotas: data.plan_pagos_cuotas || [],
        plan_pagos_texto: data.plan_pagos_texto || '',
        solo_tc_paralelo: data.solo_tc_paralelo ?? false,
        acepta_permuta: data.acepta_permuta ?? formaPagoLegacy.acepta_permuta ?? false,
        precio_negociable: data.precio_negociable ?? formaPagoLegacy.precio_negociable ?? false,
        descuento_contado: data.descuento_contado_pct?.toString() || formaPagoLegacy.descuento_contado?.toString() || '',
        latitud: data.latitud?.toString() || '',
        longitud: data.longitud?.toString() || '',
        asesor_nombre: data.datos_json?.agente?.nombre || '',
        asesor_telefono: data.datos_json?.agente?.telefono || '',
        asesor_inmobiliaria: data.datos_json?.agente?.oficina_nombre || '',
        descripcion: data.datos_json?.contenido?.descripcion || data.datos_json_enrichment?.llm_output?.descripcion_limpia || data.datos_json_enrichment?.descripcion_original || '',
        amenidades: standardAmenidades,
        amenidades_custom: customAmenidades,
        equipamiento: standardEquipamiento,
        equipamiento_custom: customEquipamiento,
      })
    } catch (err) {
      console.error('Error fetching propiedad:', err)
      setError('Error cargando propiedad')
    } finally {
      setLoading(false)
    }
  }

  async function fetchHistorial() {
    if (!supabase || !id) return
    try {
      const { data, error } = await supabase
        .from('propiedades_v2_historial')
        .select('*')
        .eq('propiedad_id', id)
        .order('fecha', { ascending: false })
        .limit(50)
      if (!error && data) setHistorial(data)
    } catch (err) {
      console.error('Error fetching historial:', err)
    }
  }

  const refetch = () => {
    fetchPropiedad()
    fetchHistorial()
  }

  // ---- Auto-detect zona from project GPS ----

  const autoDetectZonaFromProject = async (proyecto: ProyectoOption) => {
    if (!supabase || !proyecto.latitud || !proyecto.longitud) return
    try {
      const { data } = await supabase.rpc('get_zona_by_gps', {
        p_lat: proyecto.latitud, p_lon: proyecto.longitud,
      })
      if (data && data.length > 0 && data[0].zona) {
        const microzona = MICROZONAS.find(m => m.label === (data[0].zona as string))
        if (microzona) {
          updateField('microzona', microzona.id)
          setShowMicrozonaCustom(false)
        }
      }
    } catch (err) {
      console.error('Error auto-detectando zona:', err)
    }
  }

  // ---- Form handlers ----

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }
      // Sync: tipo_precio usd_paralelo → solo_tc_paralelo true, y viceversa
      if (field === 'tipo_precio') {
        updated.solo_tc_paralelo = value === 'usd_paralelo'
      }
      return updated
    })
    if (validationErrors.length > 0 || validationWarnings.length > 0) {
      setValidationErrors([])
      setValidationWarnings([])
      setShowWarningConfirm(false)
    }
  }

  const toggleAmenidad = (amenidad: string) => {
    setFormData(prev => ({
      ...prev,
      amenidades: prev.amenidades.includes(amenidad)
        ? prev.amenidades.filter(a => a !== amenidad)
        : [...prev.amenidades, amenidad],
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
    setFormData(prev => ({ ...prev, amenidades_custom: prev.amenidades_custom.filter(a => a !== amenidad) }))
  }

  const toggleEquipamiento = (equip: string) => {
    setFormData(prev => ({
      ...prev,
      equipamiento: prev.equipamiento.includes(equip)
        ? prev.equipamiento.filter(e => e !== equip)
        : [...prev.equipamiento, equip],
    }))
  }

  const agregarEquipamientoCustom = () => {
    if (!nuevoEquipamiento.trim()) return
    const equip = nuevoEquipamiento.trim()
    if (formData.equipamiento_custom.includes(equip) || formData.equipamiento.includes(equip)) return
    setFormData(prev => ({ ...prev, equipamiento_custom: [...prev.equipamiento_custom, equip] }))
    setNuevoEquipamiento('')
  }

  const eliminarEquipamientoCustom = (equip: string) => {
    setFormData(prev => ({ ...prev, equipamiento_custom: prev.equipamiento_custom.filter(e => e !== equip) }))
  }

  // ---- Payment plan handlers ----

  const generarTextoPlanPagos = (cuotas: CuotaPago[]): string => {
    if (cuotas.length === 0) return ''
    const partes = cuotas
      .filter(c => c.porcentaje)
      .map(c => {
        const momentoLabel = MOMENTOS_PAGO.find(m => m.id === c.momento)?.label || 'Otro'
        const desc = c.descripcion ? ` (${c.descripcion})` : ''
        return `${c.porcentaje}% ${momentoLabel}${desc}`
      })
    return partes.join(', ')
  }

  const agregarCuota = () => {
    const nuevaCuota: CuotaPago = { id: `cuota-${Date.now()}`, porcentaje: '', momento: 'reserva', descripcion: '' }
    const cuotasActualizadas = [...formData.plan_pagos_cuotas, nuevaCuota]
    setFormData(prev => ({ ...prev, plan_pagos_cuotas: cuotasActualizadas, plan_pagos_texto: generarTextoPlanPagos(cuotasActualizadas) }))
  }

  const eliminarCuota = (cuotaId: string) => {
    const cuotasActualizadas = formData.plan_pagos_cuotas.filter(c => c.id !== cuotaId)
    setFormData(prev => ({ ...prev, plan_pagos_cuotas: cuotasActualizadas, plan_pagos_texto: generarTextoPlanPagos(cuotasActualizadas) }))
  }

  const actualizarCuota = (cuotaId: string, campo: keyof CuotaPago, valor: string) => {
    const cuotasActualizadas = formData.plan_pagos_cuotas.map(c => c.id === cuotaId ? { ...c, [campo]: valor } : c)
    setFormData(prev => ({ ...prev, plan_pagos_cuotas: cuotasActualizadas, plan_pagos_texto: generarTextoPlanPagos(cuotasActualizadas) }))
  }

  // ---- Price calculations ----

  const calcularPrecioNormalizado = () => {
    const precioPublicado = parseFloat(formData.precio_publicado) || 0
    const tcOficial = 6.96
    const tcParalelo = tcParaleloActual || 10.5

    if (formData.tipo_operacion === 'alquiler') return precioPublicado

    switch (formData.tipo_precio) {
      case 'usd_oficial': return precioPublicado
      case 'usd_paralelo': return Math.round(precioPublicado * (tcParalelo / tcOficial))
      case 'bob': return Math.round(precioPublicado / tcOficial)
      default: return precioPublicado
    }
  }

  const getPrecioInfo = () => {
    const precioNormalizado = calcularPrecioNormalizado()
    return {
      precio: precioNormalizado,
      precioPublicado: parseFloat(formData.precio_publicado) || 0,
      esParalelo: formData.tipo_precio === 'usd_paralelo',
      esBob: formData.tipo_precio === 'bob',
      tipoPrecio: formData.tipo_precio,
    }
  }

  const getPrecioAlerta = (): { tipo: 'error' | 'warning' | null; mensaje: string; color: string } => {
    const precio = calcularPrecioNormalizado()
    const area = parseFloat(formData.area_m2) || 0
    if (precio <= 0 || area <= 0) return { tipo: null, mensaje: '', color: '' }

    const precioM2 = precio / area
    if (formData.tipo_operacion === 'venta') {
      if (precioM2 < 800) return { tipo: 'error', mensaje: `$${Math.round(precioM2)}/m² muy bajo`, color: 'bg-red-100 text-red-700 border-red-300' }
      if (precioM2 < 1200) return { tipo: 'warning', mensaje: `$${Math.round(precioM2)}/m² bajo`, color: 'bg-amber-100 text-amber-700 border-amber-300' }
    }
    if (precioM2 > 4000) return { tipo: 'error', mensaje: `$${Math.round(precioM2)}/m² muy alto`, color: 'bg-red-100 text-red-700 border-red-300' }
    if (precioM2 > 3200) return { tipo: 'warning', mensaje: `$${Math.round(precioM2)}/m² alto`, color: 'bg-amber-100 text-amber-700 border-amber-300' }
    return { tipo: null, mensaje: '', color: '' }
  }

  // ---- Change detection ----

  const detectarCambios = (): { campo: string; anterior: any; nuevo: any }[] => {
    if (!originalData) return []
    const cambios: { campo: string; anterior: any; nuevo: any }[] = []

    const nombreEsperado = proyectoMaster?.nombre_oficial || originalData.nombre_edificio
    if (nombreEsperado !== formData.proyecto_nombre) {
      cambios.push({ campo: 'nombre_edificio', anterior: originalData.nombre_edificio, nuevo: formData.proyecto_nombre })
    }
    if (originalData.id_proyecto_master !== selectedProyectoId) {
      cambios.push({ campo: 'id_proyecto_master', anterior: originalData.id_proyecto_master, nuevo: selectedProyectoId })
    }

    const microzonaLabel = MICROZONAS.find(m => m.id === formData.microzona)?.label || formData.microzona
    if (originalData.zona !== microzonaLabel) {
      cambios.push({ campo: 'zona', anterior: originalData.zona, nuevo: microzonaLabel })
    }
    if (originalData.dormitorios !== parseInt(formData.dormitorios)) {
      cambios.push({ campo: 'dormitorios', anterior: originalData.dormitorios, nuevo: parseInt(formData.dormitorios) })
    }
    if (originalData.banos !== parseFloat(formData.banos)) {
      cambios.push({ campo: 'banos', anterior: originalData.banos, nuevo: parseFloat(formData.banos) })
    }

    const precioNormalizadoNuevo = calcularPrecioNormalizado()
    if (originalData.precio_usd !== precioNormalizadoNuevo) {
      cambios.push({ campo: 'precio_usd', anterior: originalData.precio_usd, nuevo: precioNormalizadoNuevo })
    }

    const tipoPrecioOriginal = originalData.moneda_original === 'USD'
      ? 'usd_oficial'
      : originalData.tipo_cambio_detectado === 'paralelo'
        ? 'usd_paralelo'
        : originalData.tipo_cambio_detectado === 'oficial' ? 'bob' : 'usd_oficial'
    if (tipoPrecioOriginal !== formData.tipo_precio) {
      cambios.push({ campo: 'tipo_precio', anterior: tipoPrecioOriginal, nuevo: formData.tipo_precio })
    }

    if (originalData.area_total_m2 !== parseFloat(formData.area_m2)) {
      cambios.push({ campo: 'area_total_m2', anterior: originalData.area_total_m2, nuevo: parseFloat(formData.area_m2) })
    }

    const estacionamientosNuevo = formData.estacionamientos ? parseInt(formData.estacionamientos) : null
    if (originalData.estacionamientos !== estacionamientosNuevo) {
      cambios.push({ campo: 'estacionamientos', anterior: originalData.estacionamientos, nuevo: estacionamientosNuevo })
    }

    const parqueoIncluidoNuevo = formData.parqueo_opcion === 'incluido' ? true :
      formData.parqueo_opcion === 'no_incluido' || formData.parqueo_opcion === 'precio_adicional' ? false : null
    if (originalData.parqueo_incluido !== parqueoIncluidoNuevo) {
      cambios.push({ campo: 'parqueo_incluido', anterior: originalData.parqueo_incluido, nuevo: parqueoIncluidoNuevo })
    }
    const parqueoPrecioNuevo = formData.parqueo_opcion === 'precio_adicional' && formData.parqueo_precio_adicional
      ? parseFloat(formData.parqueo_precio_adicional) : null
    if (originalData.parqueo_precio_adicional !== parqueoPrecioNuevo) {
      cambios.push({ campo: 'parqueo_precio_adicional', anterior: originalData.parqueo_precio_adicional, nuevo: parqueoPrecioNuevo })
    }
    if (originalData.baulera !== formData.baulera) {
      cambios.push({ campo: 'baulera', anterior: originalData.baulera, nuevo: formData.baulera })
    }
    const bauleraIncluidoNuevo = formData.baulera_opcion === 'incluido' ? true :
      formData.baulera_opcion === 'no_incluido' || formData.baulera_opcion === 'precio_adicional' ? false : null
    if (originalData.baulera_incluido !== bauleraIncluidoNuevo) {
      cambios.push({ campo: 'baulera_incluido', anterior: originalData.baulera_incluido, nuevo: bauleraIncluidoNuevo })
    }
    const bauleraPrecioNuevo = formData.baulera_opcion === 'precio_adicional' && formData.baulera_precio_adicional
      ? parseFloat(formData.baulera_precio_adicional) : null
    if (originalData.baulera_precio_adicional !== bauleraPrecioNuevo) {
      cambios.push({ campo: 'baulera_precio_adicional', anterior: originalData.baulera_precio_adicional, nuevo: bauleraPrecioNuevo })
    }
    if (originalData.tipo_operacion !== formData.tipo_operacion) {
      cambios.push({ campo: 'tipo_operacion', anterior: originalData.tipo_operacion, nuevo: formData.tipo_operacion })
    }
    if (originalData.estado_construccion !== formData.estado_construccion) {
      cambios.push({ campo: 'estado_construccion', anterior: originalData.estado_construccion, nuevo: formData.estado_construccion })
    }

    const latNueva = formData.latitud ? parseFloat(formData.latitud) : null
    const lonNueva = formData.longitud ? parseFloat(formData.longitud) : null
    if (originalData.latitud !== latNueva || originalData.longitud !== lonNueva) {
      cambios.push({ campo: 'gps', anterior: { lat: originalData.latitud, lon: originalData.longitud }, nuevo: { lat: latNueva, lon: lonNueva } })
    }

    const amenidadesOriginales = originalData.datos_json?.amenities?.lista || []
    const amenidadesNuevas = [...formData.amenidades, ...formData.amenidades_custom]
    if (JSON.stringify(amenidadesOriginales.sort()) !== JSON.stringify(amenidadesNuevas.sort())) {
      cambios.push({ campo: 'amenities', anterior: amenidadesOriginales, nuevo: amenidadesNuevas })
    }

    const equipamientoOriginal = originalData.datos_json?.amenities?.equipamiento || []
    const equipamientoNuevo = [...formData.equipamiento, ...formData.equipamiento_custom]
    if (JSON.stringify(equipamientoOriginal.sort()) !== JSON.stringify(equipamientoNuevo.sort())) {
      cambios.push({ campo: 'equipamiento', anterior: equipamientoOriginal, nuevo: equipamientoNuevo })
    }

    const agenteOriginal = originalData.datos_json?.agente || {}
    if (agenteOriginal.nombre !== formData.asesor_nombre ||
        agenteOriginal.telefono !== formData.asesor_telefono ||
        agenteOriginal.oficina_nombre !== formData.asesor_inmobiliaria) {
      cambios.push({
        campo: 'agente', anterior: agenteOriginal,
        nuevo: { nombre: formData.asesor_nombre, telefono: formData.asesor_telefono, oficina_nombre: formData.asesor_inmobiliaria },
      })
    }

    const pisoOriginal = originalData.piso ?? originalData.datos_json?.piso ?? null
    const pisoNuevo = formData.piso ? parseInt(formData.piso) : null
    if (pisoOriginal !== pisoNuevo) {
      cambios.push({ campo: 'piso', anterior: pisoOriginal, nuevo: pisoNuevo })
    }

    if ((originalData.plan_pagos_desarrollador ?? null) !== formData.acepta_financiamiento) {
      cambios.push({ campo: 'plan_pagos_desarrollador', anterior: originalData.plan_pagos_desarrollador ?? null, nuevo: formData.acepta_financiamiento })
    }
    if ((originalData.solo_tc_paralelo ?? null) !== formData.solo_tc_paralelo) {
      cambios.push({ campo: 'solo_tc_paralelo', anterior: originalData.solo_tc_paralelo ?? null, nuevo: formData.solo_tc_paralelo })
    }
    if ((originalData.acepta_permuta ?? null) !== formData.acepta_permuta) {
      cambios.push({ campo: 'acepta_permuta', anterior: originalData.acepta_permuta ?? null, nuevo: formData.acepta_permuta })
    }
    if ((originalData.precio_negociable ?? null) !== formData.precio_negociable) {
      cambios.push({ campo: 'precio_negociable', anterior: originalData.precio_negociable ?? null, nuevo: formData.precio_negociable })
    }
    const descuentoNuevo = formData.descuento_contado ? parseFloat(formData.descuento_contado) : null
    if ((originalData.descuento_contado_pct ?? null) !== descuentoNuevo) {
      cambios.push({ campo: 'descuento_contado_pct', anterior: originalData.descuento_contado_pct ?? null, nuevo: descuentoNuevo })
    }

    if (JSON.stringify(originalData.plan_pagos_cuotas || []) !== JSON.stringify(formData.plan_pagos_cuotas || [])) {
      cambios.push({ campo: 'plan_pagos_cuotas', anterior: originalData.plan_pagos_cuotas, nuevo: formData.plan_pagos_cuotas })
    }
    const textoNuevo = formData.plan_pagos_texto || null
    if ((originalData.plan_pagos_texto ?? null) !== textoNuevo) {
      cambios.push({ campo: 'plan_pagos_texto', anterior: originalData.plan_pagos_texto ?? null, nuevo: textoNuevo })
    }

    return cambios
  }

  // ---- Validation ----

  const validarFormulario = (): { errors: string[]; warnings: string[] } => {
    const errors: string[] = []
    const warnings: string[] = []

    const precio = calcularPrecioNormalizado()
    const area = parseFloat(formData.area_m2) || 0
    const precioM2 = area > 0 ? precio / area : 0
    const dormitorios = parseInt(formData.dormitorios) || 0
    const banos = parseFloat(formData.banos) || 0

    if (precio > 0 && area > 0 && formData.tipo_operacion === 'venta') {
      if (precioM2 < 800) errors.push(`Precio/m² muy bajo: $${Math.round(precioM2)}/m² (mínimo $800/m²)`)
      else if (precioM2 < 1200) warnings.push(`Precio/m² inusualmente bajo: $${Math.round(precioM2)}/m² (rango típico $1,200-$3,200)`)
      else if (precioM2 > 4000) errors.push(`Precio/m² muy alto: $${Math.round(precioM2)}/m² (máximo $4,000/m²)`)
      else if (precioM2 > 3200) warnings.push(`Precio/m² inusualmente alto: $${Math.round(precioM2)}/m² (rango típico $1,200-$3,200)`)
    }

    if (area > 0) {
      if (area < 25) warnings.push(`Área muy pequeña: ${area}m² (mínimo típico 25m²)`)
      else if (area > 300) warnings.push(`Área muy grande: ${area}m² (verificar si es correcto)`)
    }

    if (banos === 0) warnings.push(`Sin baños: verificar que 0 baños sea correcto`)
    if (banos > dormitorios + 2) warnings.push(`Más baños (${banos}) que dormitorios+2 (${dormitorios + 2}): verificar`)

    if (dormitorios >= 3 && area > 0 && area < 60) warnings.push(`${dormitorios} dormitorios en ${area}m² parece poco espacio`)
    if (dormitorios >= 2 && area > 0 && area < 40) warnings.push(`${dormitorios} dormitorios en ${area}m² parece muy reducido`)

    const esPreventa = ['preventa', 'en_construccion', 'en_planos'].includes(formData.estado_construccion)
    if (esPreventa && formData.fecha_entrega) {
      const fechaEntrega = new Date(formData.fecha_entrega)
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
      if (fechaEntrega < hoy) errors.push(`Fecha de entrega (${formData.fecha_entrega}) no puede ser anterior a hoy para preventa/construcción`)
    }

    const lat = parseFloat(formData.latitud) || 0
    const lon = parseFloat(formData.longitud) || 0
    if (lat !== 0 && lon !== 0) {
      const B = { latMin: -17.775, latMax: -17.750, lonMin: -63.205, lonMax: -63.185 }
      if (lat < B.latMin || lat > B.latMax || lon < B.lonMin || lon > B.lonMax) {
        warnings.push(`GPS (${lat.toFixed(6)}, ${lon.toFixed(6)}) parece estar fuera de Equipetrol`)
      }
    }

    if (formData.parqueo_opcion === 'precio_adicional') {
      const p = parseFloat(formData.parqueo_precio_adicional) || 0
      if (p <= 0) errors.push(`Seleccionaste "Precio adicional" para parqueo pero no ingresaste el precio`)
      else if (p < 3000 || p > 25000) warnings.push(`Precio parqueo $${p} fuera de rango típico ($3,000-$25,000)`)
    }
    if (formData.baulera_opcion === 'precio_adicional') {
      const p = parseFloat(formData.baulera_precio_adicional) || 0
      if (p <= 0) errors.push(`Seleccionaste "Precio adicional" para baulera pero no ingresaste el precio`)
      else if (p < 1000 || p > 10000) warnings.push(`Precio baulera $${p} fuera de rango típico ($1,000-$10,000)`)
    }

    return { errors, warnings }
  }

  // ---- Save ----

  const handleSave = async () => {
    if (!supabase || !id || !originalData) return
    const { errors, warnings } = validarFormulario()
    setValidationErrors(errors)
    setValidationWarnings(warnings)
    if (errors.length > 0) { setError(`No se puede guardar: ${errors.length} error(es) de validación`); return }
    if (warnings.length > 0) { setShowWarningConfirm(true); return }
    await executeSave()
  }

  const handleSaveConfirmed = async () => {
    setShowWarningConfirm(false)
    await executeSave()
  }

  const executeSave = async () => {
    if (!supabase || !id || !originalData) return
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const ahora = new Date().toISOString()
      const usuarioInfo = { tipo: 'admin', id: 'admin-panel', nombre: 'Administrador' }
      const cambios = detectarCambios()

      if (cambios.length === 0) { setError('No hay cambios para guardar'); setSaving(false); return }

      const registros = cambios.map(c => ({
        propiedad_id: parseInt(id as string),
        usuario_tipo: usuarioInfo.tipo, usuario_id: usuarioInfo.id, usuario_nombre: usuarioInfo.nombre,
        campo: c.campo, valor_anterior: c.anterior, valor_nuevo: c.nuevo, fecha: ahora,
      }))
      const { error: historialError } = await supabase.from('propiedades_v2_historial').insert(registros)
      if (historialError) console.error('Error guardando historial:', historialError)

      const nuevosCandados: CamposBloqueados = {}
      if (autoBloquearAlGuardar) {
        cambios.forEach(c => {
          nuevosCandados[c.campo] = {
            bloqueado: true, por: usuarioInfo.tipo, usuario_id: usuarioInfo.id,
            usuario_nombre: usuarioInfo.nombre, fecha: ahora, valor_original: c.anterior,
          }
        })
      }
      const candadosFinales = { ...(originalData.campos_bloqueados || {}), ...nuevosCandados }

      const todasAmenidades = [...formData.amenidades, ...formData.amenidades_custom]
      const todoEquipamiento = [...formData.equipamiento, ...formData.equipamiento_custom]

      const datosJsonActualizado = {
        ...originalData.datos_json,
        agente: { nombre: formData.asesor_nombre || null, telefono: formData.asesor_telefono || null, oficina_nombre: formData.asesor_inmobiliaria || null },
        contenido: { ...(originalData.datos_json?.contenido || {}), descripcion: formData.descripcion || null },
        amenities: {
          lista: todasAmenidades, equipamiento: todoEquipamiento,
          estado_amenities: todasAmenidades.reduce((acc, a) => ({ ...acc, [a]: { valor: true, fuente: formData.amenidades_custom.includes(a) ? 'admin_manual' : 'admin', confianza: 'alta' } }), {}),
          estado_equipamiento: todoEquipamiento.reduce((acc, e) => ({ ...acc, [e]: { valor: true, fuente: formData.equipamiento_custom.includes(e) ? 'admin_manual' : 'admin', confianza: 'alta' } }), {}),
        },
        piso: formData.piso ? parseInt(formData.piso) : null,
        fecha_entrega: formData.fecha_entrega || null,
        expensas_usd: formData.expensas_usd ? parseFloat(formData.expensas_usd) : null,
      }

      const microzonaLabel = MICROZONAS.find(m => m.id === formData.microzona)?.label || formData.microzona
      const precioPublicado = parseFloat(formData.precio_publicado) || 0
      const precioNormalizado = calcularPrecioNormalizado()
      const tcOficial = 6.96
      const tcParalelo = tcParaleloActual || 10.5

      const updateData: Record<string, any> = {
        tipo_operacion: formData.tipo_operacion || null,
        nombre_edificio: formData.proyecto_nombre || null,
        id_proyecto_master: selectedProyectoId,
        zona: microzonaLabel,
        microzona: MICROZONA_ID_TO_DB[formData.microzona] || formData.microzona,
        ...(formData.tipo_operacion === 'alquiler'
          ? { precio_mensual_bob: precioNormalizado, precio_mensual_usd: Math.round(precioNormalizado / 6.96 * 100) / 100 }
          : { precio_usd: precioNormalizado, precio_usd_actualizado: null }),
        area_total_m2: formData.area_m2 ? parseFloat(formData.area_m2) : null,
        dormitorios: formData.dormitorios ? parseInt(formData.dormitorios) : null,
        banos: formData.banos ? parseFloat(formData.banos) : null,
        estacionamientos: formData.estacionamientos ? parseInt(formData.estacionamientos) : null,
        parqueo_incluido: formData.parqueo_opcion === 'incluido' ? true :
          formData.parqueo_opcion === 'no_incluido' || formData.parqueo_opcion === 'precio_adicional' ? false : null,
        parqueo_precio_adicional: formData.parqueo_opcion === 'precio_adicional' && formData.parqueo_precio_adicional
          ? parseFloat(formData.parqueo_precio_adicional) : null,
        baulera: formData.baulera,
        baulera_incluido: formData.baulera_opcion === 'incluido' ? true :
          formData.baulera_opcion === 'no_incluido' || formData.baulera_opcion === 'precio_adicional' ? false : null,
        baulera_precio_adicional: formData.baulera_opcion === 'precio_adicional' && formData.baulera_precio_adicional
          ? parseFloat(formData.baulera_precio_adicional) : null,
        piso: formData.piso ? parseInt(formData.piso) : null,
        plan_pagos_desarrollador: formData.acepta_financiamiento,
        plan_pagos_cuotas: formData.plan_pagos_cuotas.length > 0 ? formData.plan_pagos_cuotas : null,
        plan_pagos_texto: formData.plan_pagos_texto || null,
        solo_tc_paralelo: formData.solo_tc_paralelo,
        acepta_permuta: formData.acepta_permuta,
        precio_negociable: formData.precio_negociable,
        descuento_contado_pct: formData.descuento_contado ? parseFloat(formData.descuento_contado) : null,
        estado_construccion: formData.estado_construccion || null,
        latitud: formData.latitud ? parseFloat(formData.latitud) : null,
        longitud: formData.longitud ? parseFloat(formData.longitud) : null,
        datos_json: datosJsonActualizado,
        campos_bloqueados: candadosFinales,
        fecha_actualizacion: ahora,
      }

      switch (formData.tipo_precio) {
        case 'usd_oficial':
          updateData.moneda_original = 'USD'
          updateData.precio_usd_original = precioPublicado
          updateData.tipo_cambio_detectado = null
          updateData.tipo_cambio_usado = null
          updateData.depende_de_tc = false
          break
        case 'usd_paralelo':
          updateData.moneda_original = 'BOB'
          updateData.precio_usd_original = precioPublicado
          updateData.tipo_cambio_detectado = 'paralelo'
          updateData.tipo_cambio_usado = tcOficial
          updateData.tipo_cambio_paralelo_usado = tcParalelo
          updateData.depende_de_tc = true
          updateData.datos_json_enrichment = {
            ...originalData.datos_json_enrichment,
            precio_usd_original: precioPublicado,
            tipo_cambio_paralelo_usado: tcParalelo,
            precio_fue_normalizado: true,
          }
          break
        case 'bob':
          updateData.moneda_original = 'BOB'
          updateData.precio_usd_original = precioPublicado
          updateData.tipo_cambio_detectado = 'oficial'
          updateData.tipo_cambio_usado = tcOficial
          updateData.depende_de_tc = false
          break
      }

      const { error: updateError } = await supabase.from('propiedades_v2').update(updateData).eq('id', id)
      if (updateError) throw new Error(updateError.message)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      await fetchPropiedad()
      await fetchHistorial()
    } catch (err: any) {
      setError(err.message || 'Error al guardar cambios')
    } finally {
      setSaving(false)
    }
  }

  // ---- Lock functions ----

  const getCamposBloqueadosInfo = (): string[] => {
    if (!originalData?.campos_bloqueados) return []
    const campos = originalData.campos_bloqueados
    return Object.keys(campos).filter(k => {
      const v = campos[k]
      return v === true || (typeof v === 'object' && v?.bloqueado === true)
    })
  }

  const estaCampoBloqueado = (campo: string): boolean => {
    if (!originalData?.campos_bloqueados) return false
    const v = originalData.campos_bloqueados[campo]
    return v === true || (typeof v === 'object' && v?.bloqueado === true)
  }

  const toggleBloqueo = async (campo: string) => {
    if (!supabase || !id || !originalData) return
    try {
      const estaBloqueado = estaCampoBloqueado(campo)
      const nuevosCandados = { ...(originalData.campos_bloqueados || {}) }
      if (estaBloqueado) {
        delete nuevosCandados[campo]
      } else {
        nuevosCandados[campo] = {
          bloqueado: true, por: 'admin', usuario_id: 'admin-panel',
          usuario_nombre: 'Administrador', fecha: new Date().toISOString(),
        }
      }
      const { error } = await supabase
        .from('propiedades_v2')
        .update({ campos_bloqueados: Object.keys(nuevosCandados).length > 0 ? nuevosCandados : null })
        .eq('id', id)
      if (error) throw error

      await supabase.from('propiedades_v2_historial').insert({
        propiedad_id: parseInt(id as string), usuario_tipo: 'admin', usuario_id: 'admin-panel',
        usuario_nombre: 'Administrador', campo: 'campos_bloqueados',
        valor_anterior: originalData.campos_bloqueados, valor_nuevo: nuevosCandados,
        motivo: estaBloqueado ? `Desbloqueado: ${campo}` : `Bloqueado: ${campo}`,
      })
      await fetchPropiedad()
    } catch (err: any) {
      alert('Error al cambiar bloqueo: ' + err.message)
    }
  }

  const desbloquearCampo = async (campo: string) => {
    if (!supabase || !id || !originalData) return
    try {
      const nuevosCandados = { ...originalData.campos_bloqueados }
      delete nuevosCandados[campo]
      const { error } = await supabase
        .from('propiedades_v2')
        .update({ campos_bloqueados: Object.keys(nuevosCandados).length > 0 ? nuevosCandados : null })
        .eq('id', id)
      if (error) throw error
      await supabase.from('propiedades_v2_historial').insert({
        propiedad_id: parseInt(id as string), usuario_tipo: 'admin', usuario_id: 'admin-panel',
        usuario_nombre: 'Administrador', campo: 'campos_bloqueados',
        valor_anterior: originalData.campos_bloqueados, valor_nuevo: nuevosCandados,
        motivo: `Desbloqueado campo: ${campo}`,
      })
      await fetchPropiedad()
    } catch (err: any) {
      alert('Error al desbloquear: ' + err.message)
    }
  }

  const desbloquearTodos = async () => {
    if (!supabase || !id || !originalData) return
    if (!confirm('¿Desbloquear todos los campos? Esto permitirá que el merge nocturno los sobrescriba.')) return
    try {
      const { error } = await supabase.from('propiedades_v2').update({ campos_bloqueados: null }).eq('id', id)
      if (error) throw error
      await supabase.from('propiedades_v2_historial').insert({
        propiedad_id: parseInt(id as string), usuario_tipo: 'admin', usuario_id: 'admin-panel',
        usuario_nombre: 'Administrador', campo: 'campos_bloqueados',
        valor_anterior: originalData.campos_bloqueados, valor_nuevo: null,
        motivo: 'Desbloqueados todos los campos',
      })
      await fetchPropiedad()
      setShowCandadosPanel(false)
    } catch (err: any) {
      alert('Error al desbloquear: ' + err.message)
    }
  }

  // ---- Sync from project ----

  const sincronizarDesdeProyecto = async () => {
    if (!supabase || !id || !selectedProyectoId) return
    if (!sincEstado && !sincFecha && !sincAmenidades && !sincEquipamiento) {
      alert('Selecciona al menos una opción para sincronizar'); return
    }

    setSincronizando(true)
    try {
      const camposADesbloquear: string[] = []
      if (sincEstado) camposADesbloquear.push('estado_construccion')
      if (sincFecha) camposADesbloquear.push('fecha_entrega')
      if (sincAmenidades) camposADesbloquear.push('amenities')
      if (sincEquipamiento) camposADesbloquear.push('equipamiento')

      if (originalData?.campos_bloqueados) {
        const nuevosCandados = { ...originalData.campos_bloqueados }
        camposADesbloquear.forEach(campo => delete nuevosCandados[campo])
        await supabase.from('propiedades_v2')
          .update({ campos_bloqueados: Object.keys(nuevosCandados).length > 0 ? nuevosCandados : null })
          .eq('id', id)
      }

      const { data, error } = await supabase.rpc('sincronizar_propiedad_desde_proyecto', {
        p_id_propiedad: parseInt(id as string), p_id_proyecto: selectedProyectoId,
        p_sincronizar_estado: sincEstado, p_sincronizar_fecha: sincFecha,
        p_sincronizar_amenidades: sincAmenidades, p_sincronizar_equipamiento: sincEquipamiento,
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Error en sincronización')

      const detalle = data.detalle
      const cambios = []
      if (detalle.estado_sincronizado) cambios.push('estado')
      if (detalle.fecha_sincronizada) cambios.push('fecha')
      if (detalle.amenidades_sincronizadas) cambios.push('amenidades')
      if (detalle.equipamiento_sincronizado) cambios.push('equipamiento')

      if (cambios.length > 0) {
        const camposABloquear: string[] = []
        if (detalle.estado_sincronizado) camposABloquear.push('estado_construccion')
        if (detalle.fecha_sincronizada) camposABloquear.push('fecha_entrega')
        if (detalle.amenidades_sincronizadas) camposABloquear.push('amenities')
        if (detalle.equipamiento_sincronizado) camposABloquear.push('equipamiento')

        const { data: propActual } = await supabase.from('propiedades_v2').select('campos_bloqueados').eq('id', id).single()
        const nuevosCandadosPost = { ...(propActual?.campos_bloqueados || {}) }
        camposABloquear.forEach(campo => {
          nuevosCandadosPost[campo] = { bloqueado: true, fecha: new Date().toISOString(), fuente: 'sync_proyecto_master' }
        })
        await supabase.from('propiedades_v2').update({ campos_bloqueados: nuevosCandadosPost }).eq('id', id)
      }

      await fetchPropiedad()
      setShowSincronizar(false)
      alert(`Sincronización completada: ${cambios.join(', ')}`)
    } catch (err: any) {
      alert('Error al sincronizar: ' + err.message)
    } finally {
      setSincronizando(false)
    }
  }

  // ---- Computed values ----

  const esPreventa = ['preventa', 'en_construccion', 'en_planos'].includes(formData.estado_construccion)
  const precioInfo = getPrecioInfo()
  const precioM2 = formData.precio_publicado && formData.area_m2
    ? Math.round(calcularPrecioNormalizado() / parseFloat(formData.area_m2))
    : 0
  const nombreEdificio = proyectoMaster?.nombre_oficial || formData.proyecto_nombre || 'Sin nombre'
  const camposBloqueados = getCamposBloqueadosInfo()

  // ---- Return ----

  return {
    // Core state
    loading, saving, error, success,
    validationErrors, validationWarnings, showWarningConfirm, setShowWarningConfirm,
    originalData, proyectoMaster, setProyectoMaster,
    proyectosList, showProyectoSuggestions, setShowProyectoSuggestions,
    selectedProyectoId, setSelectedProyectoId,
    historial, showHistorial, setShowHistorial,
    showMicrozonaCustom, setShowMicrozonaCustom,
    showPreview, setShowPreview,
    tcParaleloActual,
    fotos, fotoActual, setFotoActual,
    lightboxIndex, setLightboxIndex,
    nuevoAmenidad, setNuevoAmenidad,
    nuevoEquipamiento, setNuevoEquipamiento,
    showCandadosPanel, setShowCandadosPanel,
    showSincronizar, setShowSincronizar,
    sincronizando, sincEstado, setSincEstado, sincFecha, setSincFecha,
    sincAmenidades, setSincAmenidades, sincEquipamiento, setSincEquipamiento,
    autoBloquearAlGuardar, setAutoBloquearAlGuardar,
    formData,

    // Actions
    refetch, updateField, handleSave, handleSaveConfirmed,
    autoDetectZonaFromProject,
    toggleAmenidad, agregarAmenidadCustom, eliminarAmenidadCustom,
    toggleEquipamiento, agregarEquipamientoCustom, eliminarEquipamientoCustom,
    agregarCuota, eliminarCuota, actualizarCuota,
    calcularPrecioNormalizado, getPrecioAlerta, formatPrecio, formatFecha, getDormitoriosLabel,
    estaCampoBloqueado, toggleBloqueo, desbloquearCampo, desbloquearTodos,
    sincronizarDesdeProyecto,

    // Computed
    esPreventa, precioInfo, precioM2, nombreEdificio, camposBloqueados,
  }
}
