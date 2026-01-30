import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Opciones de estado para parqueo/baulera
type EstadoInclusion = 'incluido' | 'no_incluido' | 'sin_confirmar' | 'precio_adicional'

interface FormData {
  proyecto_nombre: string
  desarrollador: string
  microzona: string
  piso: string
  precio_publicado: string      // Precio que aparece en la descripción
  tipo_precio: 'usd_oficial' | 'usd_paralelo' | 'bob'  // Cómo interpretar el precio
  area_m2: string
  dormitorios: string
  banos: string
  estacionamientos: string
  parqueo_opcion: EstadoInclusion      // Estado seleccionado
  parqueo_precio_adicional: string     // USD por parqueo si opcion='precio_adicional'
  baulera: boolean
  baulera_opcion: EstadoInclusion      // Estado seleccionado
  baulera_precio_adicional: string     // USD si opcion='precio_adicional'
  estado_construccion: string
  fecha_entrega: string
  expensas_usd: string
  // Forma de pago
  acepta_financiamiento: boolean  // Plan de pagos con desarrollador
  solo_tc_paralelo: boolean       // Solo contado en TC paralelo
  acepta_permuta: boolean
  precio_negociable: boolean
  descuento_contado: string
  latitud: string
  longitud: string
  asesor_nombre: string
  asesor_telefono: string
  asesor_inmobiliaria: string
  descripcion: string
  amenidades: string[]
  amenidades_custom: string[]
  equipamiento: string[]
  equipamiento_custom: string[]
}

interface CamposBloqueados {
  [key: string]: {
    bloqueado: boolean
    por: string
    usuario_id: string
    usuario_nombre: string
    fecha: string
    valor_original?: any
  } | boolean
}

interface PropiedadOriginal {
  id: number
  nombre_edificio: string | null
  zona: string | null
  microzona: string | null
  precio_usd: number | null
  precio_usd_original: number | null
  moneda_original: string | null
  tipo_cambio_detectado: string | null
  tipo_cambio_usado: number | null
  depende_de_tc: boolean | null
  area_total_m2: number | null
  dormitorios: number | null
  banos: number | null
  estacionamientos: number | null
  parqueo_incluido: boolean | null
  parqueo_precio_adicional: number | null
  baulera: boolean | null
  baulera_incluido: boolean | null
  baulera_precio_adicional: number | null
  piso: number | null
  // Forma de pago (columnas directas v2.25)
  plan_pagos_desarrollador: boolean | null
  acepta_permuta: boolean | null
  solo_tc_paralelo: boolean | null
  precio_negociable: boolean | null
  descuento_contado_pct: number | null
  estado_construccion: string | null
  latitud: number | null
  longitud: number | null
  url: string | null
  fuente: string | null
  score_calidad_dato: number | null
  fecha_publicacion: string | null
  fecha_discovery: string | null
  datos_json: any
  datos_json_discovery: any
  datos_json_enrichment: any
  campos_bloqueados: CamposBloqueados | null
  id_proyecto_master: number | null
}

interface ProyectoMaster {
  nombre_oficial: string
  desarrollador: string | null
  zona: string | null
}

interface ProyectoOption {
  id: number
  nombre: string
  desarrollador: string | null
}

interface HistorialEntry {
  id: number
  campo: string
  valor_anterior: any
  valor_nuevo: any
  usuario_nombre: string
  usuario_tipo: string
  motivo: string | null
  fecha: string
}

// Microzonas de Equipetrol
const MICROZONAS = [
  { id: 'equipetrol_centro', label: 'Equipetrol Centro' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { id: 'villa_brigida', label: 'Villa Brígida' },
  { id: 'equipetrol_oeste', label: 'Equipetrol Oeste (Busch)' }
]

const AMENIDADES_OPCIONES = [
  'Piscina', 'Gimnasio', 'Seguridad 24/7', 'Ascensor', 'Pet Friendly',
  'Co-working', 'Churrasquera', 'Sauna/Jacuzzi', 'Salón de eventos', 'Área de juegos',
  'Roof garden', 'Bar/Lounge', 'Canchas deportivas', 'Sala yoga', 'Jardín'
]

const EQUIPAMIENTO_OPCIONES = [
  'Aire acondicionado', 'Cocina equipada', 'Closets', 'Calefón/Termotanque',
  'Cortinas/Blackouts', 'Amoblado', 'Lavadora', 'Secadora', 'Heladera',
  'Microondas', 'Horno empotrado', 'Lavavajillas', 'Balcón', 'Vista panorámica'
]

const ESTADO_CONSTRUCCION = [
  { id: 'entrega_inmediata', label: 'Entrega Inmediata' },
  { id: 'en_construccion', label: 'En Construcción' },
  { id: 'preventa', label: 'Preventa' },
  { id: 'en_planos', label: 'En Planos' },
  { id: 'usado', label: 'Usado' },
  { id: 'no_especificado', label: 'No Especificado' }
]

// Opciones de dormitorios con Monoambiente
const DORMITORIOS_OPCIONES = [
  { value: '0', label: 'Monoambiente' },
  { value: '1', label: '1 dormitorio' },
  { value: '2', label: '2 dormitorios' },
  { value: '3', label: '3 dormitorios' },
  { value: '4', label: '4 dormitorios' },
  { value: '5', label: '5 dormitorios' },
  { value: '6', label: '6+ dormitorios' }
]

export default function EditarPropiedad() {
  const router = useRouter()
  const { id } = router.query

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Sistema de validaciones
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])
  const [showWarningConfirm, setShowWarningConfirm] = useState(false)

  const [originalData, setOriginalData] = useState<PropiedadOriginal | null>(null)
  const [proyectoMaster, setProyectoMaster] = useState<ProyectoMaster | null>(null)

  // Selector de proyecto
  const [proyectosList, setProyectosList] = useState<ProyectoOption[]>([])
  const [showProyectoSuggestions, setShowProyectoSuggestions] = useState(false)
  const [selectedProyectoId, setSelectedProyectoId] = useState<number | null>(null)
  const [historial, setHistorial] = useState<HistorialEntry[]>([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [showMicrozonaCustom, setShowMicrozonaCustom] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // TC Paralelo actual (de Binance via config_global)
  const [tcParaleloActual, setTcParaleloActual] = useState<number | null>(null)

  // Galería de fotos
  const [fotos, setFotos] = useState<string[]>([])
  const [fotoActual, setFotoActual] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const [nuevoAmenidad, setNuevoAmenidad] = useState('')
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState('')

  const [formData, setFormData] = useState<FormData>({
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
    equipamiento_custom: []
  })

  useEffect(() => {
    if (id) {
      fetchPropiedad()
      fetchHistorial()
    }
  }, [id])

  // Cargar lista de proyectos para el selector
  useEffect(() => {
    const fetchProyectos = async () => {
      if (!supabase) return
      const { data, error } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial, desarrollador')
        .eq('activo', true)
        .order('nombre_oficial')

      if (!error && data) {
        setProyectosList(data.map(p => ({
          id: p.id_proyecto_master,
          nombre: p.nombre_oficial,
          desarrollador: p.desarrollador
        })))
      }
    }
    fetchProyectos()
  }, [])

  // Cerrar sugerencias al hacer click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.proyecto-selector')) {
        setShowProyectoSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const fetchPropiedad = async () => {
    if (!supabase || !id) return

    setLoading(true)
    try {
      // Fetch propiedad y TC paralelo actual en paralelo
      const [propResult, tcResult] = await Promise.all([
        supabase
          .from('propiedades_v2')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('config_global')
          .select('valor')
          .eq('clave', 'tipo_cambio_paralelo')
          .single()
      ])

      const { data, error: fetchError } = propResult

      if (fetchError || !data) {
        setError('Propiedad no encontrada')
        return
      }

      // Guardar TC paralelo actual de Binance
      if (tcResult.data?.valor) {
        setTcParaleloActual(parseFloat(tcResult.data.valor))
      }

      setOriginalData(data)

      // Fetch proyecto master para obtener desarrollador y nombre oficial
      let pmData: ProyectoMaster | null = null
      if (data.id_proyecto_master) {
        const { data: pmResult } = await supabase
          .from('proyectos_master')
          .select('nombre_oficial, desarrollador, zona')
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

      // Extraer fotos
      const fotosExtraidas = extraerFotos(data)
      setFotos(fotosExtraidas)

      // Extraer datos de amenidades
      const amenitiesData = data.datos_json?.amenities || {}
      const listaAmenidades = amenitiesData.lista || []
      const listaEquipamiento = amenitiesData.equipamiento || []

      const standardAmenidades = listaAmenidades.filter((a: string) => AMENIDADES_OPCIONES.includes(a))
      const customAmenidades = listaAmenidades.filter((a: string) => !AMENIDADES_OPCIONES.includes(a))
      const standardEquipamiento = listaEquipamiento.filter((e: string) => EQUIPAMIENTO_OPCIONES.includes(e))
      const customEquipamiento = listaEquipamiento.filter((e: string) => !EQUIPAMIENTO_OPCIONES.includes(e))

      // Determinar tipo de precio y precio publicado
      let tipoPrecio: 'usd_oficial' | 'usd_paralelo' | 'bob' = 'usd_oficial'
      let precioPublicado = data.precio_usd?.toString() || ''

      if (data.moneda_original === 'USD') {
        tipoPrecio = 'usd_oficial'
        precioPublicado = data.precio_usd?.toString() || ''
      } else if (data.tipo_cambio_detectado === 'paralelo') {
        tipoPrecio = 'usd_paralelo'
        // El precio publicado está en datos_json_enrichment.precio_usd_original
        precioPublicado = data.datos_json_enrichment?.precio_usd_original?.toString() || data.precio_usd?.toString() || ''
      } else if (data.tipo_cambio_detectado === 'oficial') {
        tipoPrecio = 'bob'
        // El precio publicado está en Bs
        precioPublicado = data.precio_usd_original?.toString() || ''
      } else {
        // no_especificado - asumir USD oficial
        tipoPrecio = 'usd_oficial'
        precioPublicado = data.precio_usd?.toString() || ''
      }

      // Determinar microzona
      const microzonaExistente = MICROZONAS.find(m =>
        m.id === data.microzona || m.label === data.microzona || m.label === data.zona
      )
      const microzonaValue = microzonaExistente?.id || 'equipetrol_centro'

      // Si tiene microzona custom (no en la lista), mostrar campo custom
      if (data.microzona && !microzonaExistente) {
        setShowMicrozonaCustom(true)
      }

      // Cargar forma de pago desde columnas directas (v2.25)
      // Fallback a datos_json para retrocompatibilidad
      const formaPagoLegacy = data.datos_json?.forma_pago || {}

      // Convertir valores de BD a opciones de radio (parqueo/baulera)
      const getOpcionInclusion = (incluido: boolean | null, precioAdicional: number | null): EstadoInclusion => {
        if (incluido === true) return 'incluido'
        if (incluido === false && precioAdicional && precioAdicional > 0) return 'precio_adicional'
        if (incluido === false) return 'no_incluido'
        return 'sin_confirmar'
      }

      setFormData({
        // Usar nombre del proyecto_master si existe, sino el nombre_edificio original
        proyecto_nombre: pmData?.nombre_oficial || data.nombre_edificio || '',
        desarrollador: '',
        microzona: microzonaValue,
        // Piso: primero columna directa, luego legacy datos_json
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
        // Forma de pago: columnas directas con fallback a legacy
        acepta_financiamiento: data.plan_pagos_desarrollador ?? formaPagoLegacy.acepta_financiamiento ?? false,
        solo_tc_paralelo: data.solo_tc_paralelo ?? false,
        acepta_permuta: data.acepta_permuta ?? formaPagoLegacy.acepta_permuta ?? false,
        precio_negociable: data.precio_negociable ?? formaPagoLegacy.precio_negociable ?? false,
        descuento_contado: data.descuento_contado_pct?.toString() || formaPagoLegacy.descuento_contado?.toString() || '',
        latitud: data.latitud?.toString() || '',
        longitud: data.longitud?.toString() || '',
        asesor_nombre: data.datos_json?.agente?.nombre || '',
        asesor_telefono: data.datos_json?.agente?.telefono || '',
        asesor_inmobiliaria: data.datos_json?.agente?.oficina_nombre || '',
        descripcion: data.datos_json?.contenido?.descripcion || '',
        amenidades: standardAmenidades,
        amenidades_custom: customAmenidades,
        equipamiento: standardEquipamiento,
        equipamiento_custom: customEquipamiento
      })

    } catch (err) {
      console.error('Error fetching propiedad:', err)
      setError('Error cargando propiedad')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistorial = async () => {
    if (!supabase || !id) return

    try {
      const { data, error } = await supabase
        .from('propiedades_v2_historial')
        .select('*')
        .eq('propiedad_id', id)
        .order('fecha', { ascending: false })
        .limit(50)

      if (!error && data) {
        setHistorial(data)
      }
    } catch (err) {
      console.error('Error fetching historial:', err)
    }
  }

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Limpiar mensajes de validación al editar
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

  const toggleEquipamiento = (equip: string) => {
    setFormData(prev => ({
      ...prev,
      equipamiento: prev.equipamiento.includes(equip)
        ? prev.equipamiento.filter(e => e !== equip)
        : [...prev.equipamiento, equip]
    }))
  }

  const agregarEquipamientoCustom = () => {
    if (!nuevoEquipamiento.trim()) return
    const equip = nuevoEquipamiento.trim()
    if (formData.equipamiento_custom.includes(equip) || formData.equipamiento.includes(equip)) {
      return
    }
    setFormData(prev => ({
      ...prev,
      equipamiento_custom: [...prev.equipamiento_custom, equip]
    }))
    setNuevoEquipamiento('')
  }

  const eliminarEquipamientoCustom = (equip: string) => {
    setFormData(prev => ({
      ...prev,
      equipamiento_custom: prev.equipamiento_custom.filter(e => e !== equip)
    }))
  }

  // Precio ya está normalizado en la BD - no necesita recalcular
  // Calcular precio normalizado basado en precio publicado y tipo
  const calcularPrecioNormalizado = () => {
    const precioPublicado = parseFloat(formData.precio_publicado) || 0
    const tcOficial = 6.96
    const tcParalelo = tcParaleloActual || 10.5

    switch (formData.tipo_precio) {
      case 'usd_oficial':
        // USD oficial: sin conversión
        return precioPublicado
      case 'usd_paralelo':
        // USD paralelo: normalizar a oficial
        // precio_normalizado = precio_publicado × (tc_paralelo / tc_oficial)
        return Math.round(precioPublicado * (tcParalelo / tcOficial))
      case 'bob':
        // BOB: convertir a USD oficial
        return Math.round(precioPublicado / tcOficial)
      default:
        return precioPublicado
    }
  }

  const getPrecioInfo = () => {
    const precioNormalizado = calcularPrecioNormalizado()
    const esParalelo = formData.tipo_precio === 'usd_paralelo'
    const esBob = formData.tipo_precio === 'bob'

    return {
      precio: precioNormalizado,
      precioPublicado: parseFloat(formData.precio_publicado) || 0,
      esParalelo,
      esBob,
      tipoPrecio: formData.tipo_precio
    }
  }

  // Indicador visual de precio sospechoso
  const getPrecioAlerta = (): { tipo: 'error' | 'warning' | null; mensaje: string; color: string } => {
    const precio = calcularPrecioNormalizado()
    const area = parseFloat(formData.area_m2) || 0
    if (precio <= 0 || area <= 0) return { tipo: null, mensaje: '', color: '' }

    const precioM2 = precio / area
    if (precioM2 < 800) {
      return { tipo: 'error', mensaje: `⚠️ $${Math.round(precioM2)}/m² muy bajo`, color: 'bg-red-100 text-red-700 border-red-300' }
    }
    if (precioM2 < 1200) {
      return { tipo: 'warning', mensaje: `⚠️ $${Math.round(precioM2)}/m² bajo`, color: 'bg-amber-100 text-amber-700 border-amber-300' }
    }
    if (precioM2 > 4000) {
      return { tipo: 'error', mensaje: `⚠️ $${Math.round(precioM2)}/m² muy alto`, color: 'bg-red-100 text-red-700 border-red-300' }
    }
    if (precioM2 > 3200) {
      return { tipo: 'warning', mensaje: `⚠️ $${Math.round(precioM2)}/m² alto`, color: 'bg-amber-100 text-amber-700 border-amber-300' }
    }
    return { tipo: null, mensaje: '', color: '' }
  }

  const detectarCambios = (): { campo: string; anterior: any; nuevo: any }[] => {
    if (!originalData) return []

    const cambios: { campo: string; anterior: any; nuevo: any }[] = []

    // Nombre del edificio: comparar contra el nombre esperado (proyectoMaster o nombre_edificio original)
    const nombreEsperado = proyectoMaster?.nombre_oficial || originalData.nombre_edificio
    if (nombreEsperado !== formData.proyecto_nombre) {
      cambios.push({ campo: 'nombre_edificio', anterior: originalData.nombre_edificio, nuevo: formData.proyecto_nombre })
    }

    // Microzona
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

    // Detectar cambios en precio: comparar precio normalizado calculado vs el original
    const precioNormalizadoNuevo = calcularPrecioNormalizado()
    if (originalData.precio_usd !== precioNormalizadoNuevo) {
      cambios.push({
        campo: 'precio_usd',
        anterior: originalData.precio_usd,
        nuevo: precioNormalizadoNuevo
      })
    }

    // Detectar cambios en tipo_precio
    const tipoPrecioOriginal = originalData.moneda_original === 'USD'
      ? 'usd_oficial'
      : originalData.tipo_cambio_detectado === 'paralelo'
        ? 'usd_paralelo'
        : originalData.tipo_cambio_detectado === 'oficial'
          ? 'bob'
          : 'usd_oficial'
    if (tipoPrecioOriginal !== formData.tipo_precio) {
      cambios.push({
        campo: 'tipo_precio',
        anterior: tipoPrecioOriginal,
        nuevo: formData.tipo_precio
      })
    }

    if (originalData.area_total_m2 !== parseFloat(formData.area_m2)) {
      cambios.push({ campo: 'area_total_m2', anterior: originalData.area_total_m2, nuevo: parseFloat(formData.area_m2) })
    }

    const estacionamientosNuevo = formData.estacionamientos ? parseInt(formData.estacionamientos) : null
    if (originalData.estacionamientos !== estacionamientosNuevo) {
      cambios.push({ campo: 'estacionamientos', anterior: originalData.estacionamientos, nuevo: estacionamientosNuevo })
    }
    // Convertir opcion a valores de BD para comparar
    const parqueoIncluidoNuevo = formData.parqueo_opcion === 'incluido' ? true :
                                  formData.parqueo_opcion === 'no_incluido' || formData.parqueo_opcion === 'precio_adicional' ? false : null
    if (originalData.parqueo_incluido !== parqueoIncluidoNuevo) {
      cambios.push({ campo: 'parqueo_incluido', anterior: originalData.parqueo_incluido, nuevo: parqueoIncluidoNuevo })
    }
    const parqueoPrecioNuevo = formData.parqueo_opcion === 'precio_adicional' && formData.parqueo_precio_adicional ?
                                parseFloat(formData.parqueo_precio_adicional) : null
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
    const bauleraPrecioNuevo = formData.baulera_opcion === 'precio_adicional' && formData.baulera_precio_adicional ?
                                parseFloat(formData.baulera_precio_adicional) : null
    if (originalData.baulera_precio_adicional !== bauleraPrecioNuevo) {
      cambios.push({ campo: 'baulera_precio_adicional', anterior: originalData.baulera_precio_adicional, nuevo: bauleraPrecioNuevo })
    }
    if (originalData.estado_construccion !== formData.estado_construccion) {
      cambios.push({ campo: 'estado_construccion', anterior: originalData.estado_construccion, nuevo: formData.estado_construccion })
    }

    const latNueva = formData.latitud ? parseFloat(formData.latitud) : null
    const lonNueva = formData.longitud ? parseFloat(formData.longitud) : null
    if (originalData.latitud !== latNueva || originalData.longitud !== lonNueva) {
      cambios.push({
        campo: 'gps',
        anterior: { lat: originalData.latitud, lon: originalData.longitud },
        nuevo: { lat: latNueva, lon: lonNueva }
      })
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
        campo: 'agente',
        anterior: agenteOriginal,
        nuevo: { nombre: formData.asesor_nombre, telefono: formData.asesor_telefono, oficina_nombre: formData.asesor_inmobiliaria }
      })
    }

    // Piso (columna directa v2.25)
    const pisoOriginal = originalData.piso ?? originalData.datos_json?.piso ?? null
    const pisoNuevo = formData.piso ? parseInt(formData.piso) : null
    if (pisoOriginal !== pisoNuevo) {
      cambios.push({ campo: 'piso', anterior: pisoOriginal, nuevo: pisoNuevo })
    }

    // Forma de pago (columnas directas v2.25)
    const planPagosOriginal = originalData.plan_pagos_desarrollador ?? null
    const planPagosNuevo = formData.acepta_financiamiento
    if (planPagosOriginal !== planPagosNuevo) {
      cambios.push({ campo: 'plan_pagos_desarrollador', anterior: planPagosOriginal, nuevo: planPagosNuevo })
    }

    const soloTcParaleloOriginal = originalData.solo_tc_paralelo ?? null
    const soloTcParaleloNuevo = formData.solo_tc_paralelo
    if (soloTcParaleloOriginal !== soloTcParaleloNuevo) {
      cambios.push({ campo: 'solo_tc_paralelo', anterior: soloTcParaleloOriginal, nuevo: soloTcParaleloNuevo })
    }

    const aceptaPermutaOriginal = originalData.acepta_permuta ?? null
    const aceptaPermutaNuevo = formData.acepta_permuta
    if (aceptaPermutaOriginal !== aceptaPermutaNuevo) {
      cambios.push({ campo: 'acepta_permuta', anterior: aceptaPermutaOriginal, nuevo: aceptaPermutaNuevo })
    }

    const precioNegociableOriginal = originalData.precio_negociable ?? null
    const precioNegociableNuevo = formData.precio_negociable
    if (precioNegociableOriginal !== precioNegociableNuevo) {
      cambios.push({ campo: 'precio_negociable', anterior: precioNegociableOriginal, nuevo: precioNegociableNuevo })
    }

    const descuentoOriginal = originalData.descuento_contado_pct ?? null
    const descuentoNuevo = formData.descuento_contado ? parseFloat(formData.descuento_contado) : null
    if (descuentoOriginal !== descuentoNuevo) {
      cambios.push({ campo: 'descuento_contado_pct', anterior: descuentoOriginal, nuevo: descuentoNuevo })
    }

    return cambios
  }

  // =========================================================================
  // SISTEMA DE VALIDACIONES
  // =========================================================================
  const validarFormulario = (): { errors: string[]; warnings: string[] } => {
    const errors: string[] = []
    const warnings: string[] = []

    const precio = calcularPrecioNormalizado()
    const area = parseFloat(formData.area_m2) || 0
    const precioM2 = area > 0 ? precio / area : 0
    const dormitorios = parseInt(formData.dormitorios) || 0
    const banos = parseFloat(formData.banos) || 0

    // -------------------------------------------------------------------------
    // VALIDACIÓN 1: Precio por m²
    // -------------------------------------------------------------------------
    if (precio > 0 && area > 0) {
      if (precioM2 < 800) {
        errors.push(`Precio/m² muy bajo: $${Math.round(precioM2)}/m² (mínimo $800/m²)`)
      } else if (precioM2 < 1200) {
        warnings.push(`Precio/m² inusualmente bajo: $${Math.round(precioM2)}/m² (rango típico $1,200-$3,200)`)
      } else if (precioM2 > 4000) {
        errors.push(`Precio/m² muy alto: $${Math.round(precioM2)}/m² (máximo $4,000/m²)`)
      } else if (precioM2 > 3200) {
        warnings.push(`Precio/m² inusualmente alto: $${Math.round(precioM2)}/m² (rango típico $1,200-$3,200)`)
      }
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN 2: Área
    // -------------------------------------------------------------------------
    if (area > 0) {
      if (area < 25) {
        warnings.push(`Área muy pequeña: ${area}m² (mínimo típico 25m²)`)
      } else if (area > 300) {
        warnings.push(`Área muy grande: ${area}m² (verificar si es correcto)`)
      }
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN 3: Baños
    // -------------------------------------------------------------------------
    if (banos === 0) {
      warnings.push(`Sin baños: verificar que 0 baños sea correcto`)
    }
    if (banos > dormitorios + 2) {
      warnings.push(`Más baños (${banos}) que dormitorios+2 (${dormitorios + 2}): verificar`)
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN 4: Dormitorios vs Área
    // -------------------------------------------------------------------------
    if (dormitorios >= 3 && area > 0 && area < 60) {
      warnings.push(`${dormitorios} dormitorios en ${area}m² parece poco espacio`)
    }
    if (dormitorios >= 2 && area > 0 && area < 40) {
      warnings.push(`${dormitorios} dormitorios en ${area}m² parece muy reducido`)
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN 5: Fecha de entrega en preventa
    // -------------------------------------------------------------------------
    const esPreventa = formData.estado_construccion === 'preventa' ||
                       formData.estado_construccion === 'en_construccion' ||
                       formData.estado_construccion === 'en_planos'
    if (esPreventa && formData.fecha_entrega) {
      const fechaEntrega = new Date(formData.fecha_entrega)
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      if (fechaEntrega < hoy) {
        errors.push(`Fecha de entrega (${formData.fecha_entrega}) no puede ser anterior a hoy para preventa/construcción`)
      }
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN 6: GPS dentro de Equipetrol (bounds aproximados)
    // -------------------------------------------------------------------------
    const lat = parseFloat(formData.latitud) || 0
    const lon = parseFloat(formData.longitud) || 0
    if (lat !== 0 && lon !== 0) {
      // Bounds aproximados de Equipetrol
      const EQUIPETROL_BOUNDS = {
        latMin: -17.775,
        latMax: -17.750,
        lonMin: -63.205,
        lonMax: -63.185
      }
      if (lat < EQUIPETROL_BOUNDS.latMin || lat > EQUIPETROL_BOUNDS.latMax ||
          lon < EQUIPETROL_BOUNDS.lonMin || lon > EQUIPETROL_BOUNDS.lonMax) {
        warnings.push(`GPS (${lat.toFixed(6)}, ${lon.toFixed(6)}) parece estar fuera de Equipetrol`)
      }
    }

    // -------------------------------------------------------------------------
    // VALIDACIÓN 7: Precio adicional de parqueo/baulera
    // -------------------------------------------------------------------------
    if (formData.parqueo_opcion === 'precio_adicional') {
      const precioParqueo = parseFloat(formData.parqueo_precio_adicional) || 0
      if (precioParqueo <= 0) {
        errors.push(`Seleccionaste "Precio adicional" para parqueo pero no ingresaste el precio`)
      } else if (precioParqueo < 3000 || precioParqueo > 25000) {
        warnings.push(`Precio parqueo $${precioParqueo} fuera de rango típico ($3,000-$25,000)`)
      }
    }
    if (formData.baulera_opcion === 'precio_adicional') {
      const precioBaulera = parseFloat(formData.baulera_precio_adicional) || 0
      if (precioBaulera <= 0) {
        errors.push(`Seleccionaste "Precio adicional" para baulera pero no ingresaste el precio`)
      } else if (precioBaulera < 1000 || precioBaulera > 10000) {
        warnings.push(`Precio baulera $${precioBaulera} fuera de rango típico ($1,000-$10,000)`)
      }
    }

    return { errors, warnings }
  }

  // Función para guardar sin validación (después de confirmar warnings)
  const handleSaveConfirmed = async () => {
    setShowWarningConfirm(false)
    await executeSave()
  }

  const handleSave = async () => {
    if (!supabase || !id || !originalData) return

    // Ejecutar validaciones
    const { errors, warnings } = validarFormulario()
    setValidationErrors(errors)
    setValidationWarnings(warnings)

    // Si hay errores, no permitir guardar
    if (errors.length > 0) {
      setError(`No se puede guardar: ${errors.length} error(es) de validación`)
      return
    }

    // Si hay warnings, pedir confirmación
    if (warnings.length > 0) {
      setShowWarningConfirm(true)
      return
    }

    // Sin errores ni warnings, guardar directamente
    await executeSave()
  }

  const executeSave = async () => {
    if (!supabase || !id || !originalData) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const ahora = new Date().toISOString()
      const usuarioInfo = {
        tipo: 'admin',
        id: 'admin-panel',
        nombre: 'Administrador'
      }

      const cambios = detectarCambios()

      if (cambios.length === 0) {
        setError('No hay cambios para guardar')
        setSaving(false)
        return
      }

      const registros = cambios.map(c => ({
        propiedad_id: parseInt(id as string),
        usuario_tipo: usuarioInfo.tipo,
        usuario_id: usuarioInfo.id,
        usuario_nombre: usuarioInfo.nombre,
        campo: c.campo,
        valor_anterior: c.anterior,
        valor_nuevo: c.nuevo,
        fecha: ahora
      }))

      const { error: historialError } = await supabase
        .from('propiedades_v2_historial')
        .insert(registros)

      if (historialError) {
        console.error('Error guardando historial:', historialError)
      }

      const nuevosCandados: CamposBloqueados = {}
      cambios.forEach(c => {
        nuevosCandados[c.campo] = {
          bloqueado: true,
          por: usuarioInfo.tipo,
          usuario_id: usuarioInfo.id,
          usuario_nombre: usuarioInfo.nombre,
          fecha: ahora,
          valor_original: c.anterior
        }
      })

      const candadosFinales = {
        ...(originalData.campos_bloqueados || {}),
        ...nuevosCandados
      }

      const todasAmenidades = [...formData.amenidades, ...formData.amenidades_custom]
      const todoEquipamiento = [...formData.equipamiento, ...formData.equipamiento_custom]

      const datosJsonActualizado = {
        ...originalData.datos_json,
        agente: {
          nombre: formData.asesor_nombre || null,
          telefono: formData.asesor_telefono || null,
          oficina_nombre: formData.asesor_inmobiliaria || null
        },
        contenido: {
          ...(originalData.datos_json?.contenido || {}),
          descripcion: formData.descripcion || null
        },
        amenities: {
          lista: todasAmenidades,
          equipamiento: todoEquipamiento,
          estado_amenities: todasAmenidades.reduce((acc, a) => ({
            ...acc,
            [a]: {
              valor: true,
              fuente: formData.amenidades_custom.includes(a) ? 'admin_manual' : 'admin',
              confianza: 'alta'
            }
          }), {}),
          estado_equipamiento: todoEquipamiento.reduce((acc, e) => ({
            ...acc,
            [e]: {
              valor: true,
              fuente: formData.equipamiento_custom.includes(e) ? 'admin_manual' : 'admin',
              confianza: 'alta'
            }
          }), {})
        },
        // Legacy: mantener piso en datos_json para retrocompatibilidad
        piso: formData.piso ? parseInt(formData.piso) : null,
        fecha_entrega: formData.fecha_entrega || null,
        expensas_usd: formData.expensas_usd ? parseFloat(formData.expensas_usd) : null
        // forma_pago ya NO va en datos_json, ahora son columnas directas
      }

      // Convertir microzona ID a label para guardar
      const microzonaLabel = MICROZONAS.find(m => m.id === formData.microzona)?.label || formData.microzona

      // Calcular precio normalizado basado en tipo_precio
      const precioPublicado = parseFloat(formData.precio_publicado) || 0
      const precioNormalizado = calcularPrecioNormalizado()
      const tcOficial = 6.96
      const tcParalelo = tcParaleloActual || 10.5

      // Preparar campos de actualización
      const updateData: Record<string, any> = {
        nombre_edificio: formData.proyecto_nombre || null,
        id_proyecto_master: selectedProyectoId,  // Vincular/desvincular proyecto
        zona: microzonaLabel,
        precio_usd: precioNormalizado, // Siempre guardar el precio normalizado
        precio_usd_actualizado: null, // Limpiar para que RPC use precio_usd
        area_total_m2: formData.area_m2 ? parseFloat(formData.area_m2) : null,
        dormitorios: formData.dormitorios ? parseInt(formData.dormitorios) : null,
        banos: formData.banos ? parseFloat(formData.banos) : null,
        estacionamientos: formData.estacionamientos ? parseInt(formData.estacionamientos) : null,
        // Convertir opcion a valores de BD
        parqueo_incluido: formData.parqueo_opcion === 'incluido' ? true :
                          formData.parqueo_opcion === 'no_incluido' || formData.parqueo_opcion === 'precio_adicional' ? false : null,
        parqueo_precio_adicional: formData.parqueo_opcion === 'precio_adicional' && formData.parqueo_precio_adicional ?
                                   parseFloat(formData.parqueo_precio_adicional) : null,
        baulera: formData.baulera,
        baulera_incluido: formData.baulera_opcion === 'incluido' ? true :
                          formData.baulera_opcion === 'no_incluido' || formData.baulera_opcion === 'precio_adicional' ? false : null,
        baulera_precio_adicional: formData.baulera_opcion === 'precio_adicional' && formData.baulera_precio_adicional ?
                                   parseFloat(formData.baulera_precio_adicional) : null,
        // v2.25: Piso y forma de pago como columnas directas
        piso: formData.piso ? parseInt(formData.piso) : null,
        plan_pagos_desarrollador: formData.acepta_financiamiento,
        solo_tc_paralelo: formData.solo_tc_paralelo,
        acepta_permuta: formData.acepta_permuta,
        precio_negociable: formData.precio_negociable,
        descuento_contado_pct: formData.descuento_contado ? parseFloat(formData.descuento_contado) : null,
        estado_construccion: formData.estado_construccion || null,
        latitud: formData.latitud ? parseFloat(formData.latitud) : null,
        longitud: formData.longitud ? parseFloat(formData.longitud) : null,
        datos_json: datosJsonActualizado,
        campos_bloqueados: candadosFinales,
        fecha_actualizacion: ahora
      }

      // Configurar campos de normalización según tipo_precio
      switch (formData.tipo_precio) {
        case 'usd_oficial':
          // USD oficial: sin conversión
          updateData.moneda_original = 'USD'
          updateData.precio_usd_original = precioPublicado
          updateData.tipo_cambio_detectado = null
          updateData.tipo_cambio_usado = null
          updateData.depende_de_tc = false
          break

        case 'usd_paralelo':
          // USD paralelo: normalizado
          updateData.moneda_original = 'BOB' // Se trata como BOB para el sistema de normalización
          updateData.precio_usd_original = precioPublicado // Guardar precio publicado en USD paralelo
          updateData.tipo_cambio_detectado = 'paralelo'
          updateData.tipo_cambio_usado = tcOficial
          updateData.depende_de_tc = true
          // Guardar en datos_json_enrichment para referencia
          updateData.datos_json_enrichment = {
            ...originalData.datos_json_enrichment,
            precio_usd_original: precioPublicado,
            tipo_cambio_paralelo_usado: tcParalelo,
            precio_fue_normalizado: true
          }
          break

        case 'bob':
          // Bolivianos: convertido a USD oficial
          updateData.moneda_original = 'BOB'
          updateData.precio_usd_original = precioPublicado // Guardar precio en Bs
          updateData.tipo_cambio_detectado = 'oficial'
          updateData.tipo_cambio_usado = tcOficial
          updateData.depende_de_tc = false // BOB oficial no depende de TC paralelo
          break
      }

      const { error: updateError } = await supabase
        .from('propiedades_v2')
        .update(updateData)
        .eq('id', id)

      if (updateError) {
        throw new Error(updateError.message)
      }

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

  const getCamposBloqueadosInfo = (): string[] => {
    if (!originalData?.campos_bloqueados) return []
    const campos = originalData.campos_bloqueados
    return Object.keys(campos).filter(k => {
      const v = campos[k]
      return v === true || (typeof v === 'object' && v?.bloqueado === true)
    })
  }

  const formatFecha = (fecha: string): string => {
    return new Date(fecha).toLocaleDateString('es-BO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatPrecio = (precio: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(precio)
  }

  const getFuenteBadge = (fuente: string | null | undefined) => {
    if (fuente === 'century21') {
      return <span className="bg-yellow-100 text-yellow-700 text-sm px-3 py-1 rounded-full">Century 21</span>
    }
    if (fuente === 'remax') {
      return <span className="bg-red-100 text-red-700 text-sm px-3 py-1 rounded-full">RE/MAX</span>
    }
    return <span className="bg-slate-100 text-slate-700 text-sm px-3 py-1 rounded-full">{fuente || 'Desconocido'}</span>
  }

  const getDormitoriosLabel = (dorms: string): string => {
    const num = parseInt(dorms)
    if (num === 0) return 'Monoambiente'
    return `${num} dorm${num > 1 ? 's' : ''}`
  }

  const esPreventa = ['preventa', 'en_construccion', 'en_planos'].includes(formData.estado_construccion)
  const precioInfo = getPrecioInfo()
  const precioM2 = formData.precio_publicado && formData.area_m2
    ? Math.round(calcularPrecioNormalizado() / parseFloat(formData.area_m2))
    : 0

  // Nombre del edificio: usar proyectos_master.nombre_oficial para display
  const nombreEdificio = proyectoMaster?.nombre_oficial || formData.proyecto_nombre || 'Sin nombre'

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    )
  }

  if (!originalData) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Propiedad no encontrada'}</p>
          <Link href="/admin/propiedades" className="text-amber-600 hover:text-amber-700">
            Volver a la lista
          </Link>
        </div>
      </div>
    )
  }

  const camposBloqueados = getCamposBloqueadosInfo()
  const microzonaLabel = MICROZONAS.find(m => m.id === formData.microzona)?.label || formData.microzona

  return (
    <>
      <Head>
        <title>Editar {formData.proyecto_nombre || `Propiedad #${id}`} | Admin SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">Admin / Propiedades</p>
              <h1 className="text-xl font-bold">
                {formData.proyecto_nombre || `Propiedad #${id}`}
              </h1>
              {proyectoMaster?.desarrollador && (
                <p className="text-slate-400 text-sm">por {proyectoMaster.desarrollador}</p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowPreview(true)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                Ver como resultado
              </button>
              <Link href="/admin/proyectos" className="text-slate-300 hover:text-white text-sm">
                Proyectos
              </Link>
              <Link href="/admin/propiedades" className="text-amber-400 hover:text-amber-300 text-sm">
                Volver a lista
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto py-8 px-6">
          {/* Banner para propiedades huérfanas */}
          {!selectedProyectoId && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-6 rounded-r-lg">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-orange-800">
                    Propiedad sin proyecto asignado
                  </p>
                  <p className="text-sm text-orange-700 mt-1">
                    Esta propiedad no está vinculada a ningún proyecto de proyectos_master.
                    Usa el selector de "Proyecto" para vincularla a un proyecto existente.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Info Header con Galería */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-start gap-6">
              {/* Galería de Fotos */}
              <div className="w-64 flex-shrink-0">
                <div className="relative w-full h-48 bg-slate-200 rounded-lg overflow-hidden">
                  {fotos.length > 0 ? (
                    <>
                      <img
                        src={fotos[fotoActual]}
                        alt={`Foto ${fotoActual + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightboxIndex(fotoActual)}
                        title="Click para ver en pantalla completa"
                      />
                      {fotos.length > 1 && (
                        <>
                          <button
                            onClick={() => setFotoActual(prev => prev === 0 ? fotos.length - 1 : prev - 1)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full flex items-center justify-center"
                          >
                            ‹
                          </button>
                          <button
                            onClick={() => setFotoActual(prev => prev === fotos.length - 1 ? 0 : prev + 1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white w-8 h-8 rounded-full flex items-center justify-center"
                          >
                            ›
                          </button>
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                            {fotoActual + 1} / {fotos.length}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Sin fotos
                      </div>
                    </div>
                  )}
                </div>
                {fotos.length > 1 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                    {fotos.slice(0, 6).map((foto, idx) => (
                      <button
                        key={idx}
                        onClick={() => setLightboxIndex(idx)}
                        className={`w-12 h-12 flex-shrink-0 rounded overflow-hidden border-2 cursor-pointer hover:opacity-80 transition-opacity ${
                          idx === fotoActual ? 'border-amber-500' : 'border-transparent'
                        }`}
                        title="Click para ver en pantalla completa"
                      >
                        <img src={foto} alt={`Mini ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {fotos.length > 6 && (
                      <button
                        onClick={() => setLightboxIndex(6)}
                        className="w-12 h-12 flex-shrink-0 rounded bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-xs text-slate-500 cursor-pointer transition-colors"
                        title="Ver más fotos"
                      >
                        +{fotos.length - 6}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {getFuenteBadge(originalData.fuente)}
                  <span className="text-sm text-slate-500">ID: {originalData.id}</span>
                  {originalData.score_calidad_dato && (
                    <span className="text-sm text-slate-500">Score: {originalData.score_calidad_dato}</span>
                  )}
                </div>

                <h2 className="text-xl font-bold text-slate-900">
                  {nombreEdificio}
                </h2>
                {proyectoMaster?.desarrollador && (
                  <p className="text-slate-600">por <strong>{proyectoMaster.desarrollador}</strong></p>
                )}

                {originalData.url && (
                  <a
                    href={originalData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-sm break-all block mt-2"
                  >
                    Ver publicación original →
                  </a>
                )}

                {/* Fecha publicación y días en mercado (solo lectura) */}
                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                  {originalData.fecha_publicacion && (
                    <span title="Fecha de publicación">
                      📅 {new Date(originalData.fecha_publicacion).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                  {originalData.fecha_publicacion && (() => {
                    const dias = Math.floor((Date.now() - new Date(originalData.fecha_publicacion).getTime()) / (1000 * 60 * 60 * 24))
                    return (
                      <span className={`${dias > 180 ? 'text-red-500' : dias > 90 ? 'text-amber-500' : 'text-slate-500'}`}>
                        ⏱️ {dias} días en mercado
                      </span>
                    )
                  })()}
                </div>

                {/* Precio - Reactivo al formulario */}
                <div className={`mt-3 p-3 rounded-lg ${
                  formData.tipo_precio === 'usd_paralelo'
                    ? 'bg-green-50'
                    : formData.tipo_precio === 'bob'
                      ? 'bg-amber-50'
                      : 'bg-blue-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{formatPrecio(precioInfo.precio)}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-slate-500">{precioM2 > 0 && `$${precioM2}/m²`}</p>
                        {getPrecioAlerta().tipo && (
                          <span className={`text-xs px-2 py-0.5 rounded ${getPrecioAlerta().color}`}>
                            {getPrecioAlerta().tipo === 'error' ? '⚠️ Revisar' : '⚠️'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      formData.tipo_precio === 'usd_paralelo'
                        ? 'bg-green-100 text-green-700'
                        : formData.tipo_precio === 'bob'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {formData.tipo_precio === 'usd_paralelo' ? 'TC Paralelo' :
                       formData.tipo_precio === 'bob' ? 'Bolivianos' : 'USD Oficial'}
                    </div>
                  </div>

                  {/* Info de normalización - reactiva */}
                  {formData.tipo_precio !== 'usd_oficial' && parseFloat(formData.precio_publicado) > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/50 text-xs">
                      <div className={formData.tipo_precio === 'usd_paralelo' ? 'text-green-700' : 'text-amber-700'}>
                        <span className="font-medium">
                          {formData.tipo_precio === 'usd_paralelo'
                            ? '✓ Normalizado desde USD paralelo'
                            : '✓ Convertido desde Bolivianos'}
                        </span>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                          <div className={`rounded p-2 ${formData.tipo_precio === 'usd_paralelo' ? 'bg-green-100' : 'bg-amber-100'}`}>
                            <p className="text-[10px] opacity-75">Precio publicado</p>
                            <p className="font-bold">
                              {formData.tipo_precio === 'bob' ? 'Bs. ' : '$'}
                              {Number(formData.precio_publicado).toLocaleString()}
                            </p>
                          </div>
                          <div className={`rounded p-2 ${formData.tipo_precio === 'usd_paralelo' ? 'bg-green-100' : 'bg-amber-100'}`}>
                            <p className="text-[10px] opacity-75">Fórmula</p>
                            <p className="font-bold">
                              {formData.tipo_precio === 'usd_paralelo'
                                ? `× (${tcParaleloActual?.toFixed(2) || '10.5'} / 6.96)`
                                : '÷ 6.96'}
                            </p>
                          </div>
                          <div className={`rounded p-2 ${formData.tipo_precio === 'usd_paralelo' ? 'bg-green-200' : 'bg-amber-200'}`}>
                            <p className="text-[10px] opacity-75">Normalizado</p>
                            <p className="font-bold">
                              {formatPrecio(calcularPrecioNormalizado())}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {formData.tipo_precio === 'usd_oficial' && (
                    <div className="mt-2 pt-2 border-t border-slate-200/50 text-xs text-blue-600">
                      <span className="font-medium">Publicado en USD oficial</span> (sin conversión)
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Campos bloqueados */}
            {camposBloqueados.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm font-medium text-slate-700 mb-2">Campos bloqueados (protegidos del merge nocturno):</p>
                <div className="flex flex-wrap gap-2">
                  {camposBloqueados.map(campo => {
                    const info = originalData.campos_bloqueados?.[campo]
                    const fecha = typeof info === 'object' && info?.fecha
                      ? formatFecha(info.fecha)
                      : ''
                    return (
                      <span
                        key={campo}
                        className="bg-purple-50 text-purple-700 text-xs px-2 py-1 rounded flex items-center gap-1"
                        title={fecha ? `Bloqueado el ${fecha}` : ''}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        {campo}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Formulario */}
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 space-y-8">
            {/* Información Básica */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Información Básica</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative proyecto-selector">
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Proyecto *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.proyecto_nombre}
                        onChange={(e) => {
                          const nuevoValor = e.target.value
                          updateField('proyecto_nombre', nuevoValor)
                          setShowProyectoSuggestions(true)
                          // Si el texto cambió y ya no coincide con el proyecto vinculado, desvincular
                          const proyectoActual = proyectosList.find(p => p.id === selectedProyectoId)
                          if (proyectoActual && nuevoValor !== proyectoActual.nombre) {
                            setSelectedProyectoId(null)
                            setProyectoMaster(null)
                          }
                        }}
                        onFocus={() => setShowProyectoSuggestions(true)}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
                          selectedProyectoId ? 'border-green-300 bg-green-50' : 'border-slate-300'
                        }`}
                        placeholder="Buscar proyecto..."
                      />
                      {selectedProyectoId && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-sm">
                          ✓ Vinculado
                        </span>
                      )}
                    </div>

                    {/* Sugerencias dropdown */}
                    {showProyectoSuggestions && formData.proyecto_nombre.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {proyectosList
                          .filter(p => p.nombre.toLowerCase().includes(formData.proyecto_nombre.toLowerCase()))
                          .slice(0, 10)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                updateField('proyecto_nombre', p.nombre)
                                setSelectedProyectoId(p.id)
                                setProyectoMaster({
                                  nombre_oficial: p.nombre,
                                  desarrollador: p.desarrollador,
                                  zona: null
                                })
                                setShowProyectoSuggestions(false)
                              }}
                              className={`w-full px-4 py-2 text-left hover:bg-amber-50 border-b border-slate-100 last:border-0 ${
                                p.id === selectedProyectoId ? 'bg-green-50' : ''
                              }`}
                            >
                              <span className="font-medium text-slate-900">{p.nombre}</span>
                              {p.desarrollador && (
                                <span className="block text-xs text-slate-500">{p.desarrollador}</span>
                              )}
                            </button>
                          ))
                        }
                        {proyectosList.filter(p => p.nombre.toLowerCase().includes(formData.proyecto_nombre.toLowerCase())).length === 0 && (
                          <div className="px-4 py-3 text-sm text-slate-500">
                            No se encontró "{formData.proyecto_nombre}"
                          </div>
                        )}
                      </div>
                    )}

                    {/* Botón desvincular */}
                    {selectedProyectoId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProyectoId(null)
                          setProyectoMaster(null)
                        }}
                        className="text-xs text-red-500 hover:text-red-700 mt-1"
                      >
                        Desvincular proyecto
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Desarrollador
                    </label>
                    <input
                      type="text"
                      value={proyectoMaster?.desarrollador || 'Sin asignar'}
                      disabled
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedProyectoId ? 'Viene del proyecto master' : 'Selecciona un proyecto para vincular'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Microzona *</label>
                    <select
                      value={formData.microzona}
                      onChange={(e) => updateField('microzona', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    >
                      {MICROZONAS.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="showMicrozonaCustom"
                        checked={showMicrozonaCustom}
                        onChange={(e) => setShowMicrozonaCustom(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                      />
                      <label htmlFor="showMicrozonaCustom" className="text-xs text-slate-500">
                        Especificar ubicación exacta
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                    <select
                      value={formData.estado_construccion}
                      onChange={(e) => updateField('estado_construccion', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    >
                      {ESTADO_CONSTRUCCION.map(e => (
                        <option key={e.id} value={e.id}>{e.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {showMicrozonaCustom && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Ubicación exacta / Referencia
                    </label>
                    <input
                      type="text"
                      value={originalData.microzona || ''}
                      disabled
                      className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                      placeholder="Ej: Frente al Ventura Mall"
                    />
                  </div>
                )}

                {esPreventa && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha estimada de entrega
                    </label>
                    <input
                      type="month"
                      value={formData.fecha_entrega}
                      onChange={(e) => updateField('fecha_entrega', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Precio y Área */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Precio y Área</h2>
              <div className="space-y-4">
                {/* Selector de tipo de precio */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tipo de precio publicado
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateField('tipo_precio', 'usd_oficial')}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                        formData.tipo_precio === 'usd_oficial'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-center">
                        <span className="block text-lg mb-1">USD Oficial</span>
                        <span className="block text-xs opacity-75">Sin conversión</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('tipo_precio', 'usd_paralelo')}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                        formData.tipo_precio === 'usd_paralelo'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-center">
                        <span className="block text-lg mb-1">USD Paralelo</span>
                        <span className="block text-xs opacity-75">TC {tcParaleloActual?.toFixed(2) || '~10.5'}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('tipo_precio', 'bob')}
                      className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                        formData.tipo_precio === 'bob'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-center">
                        <span className="block text-lg mb-1">Bolivianos</span>
                        <span className="block text-xs opacity-75">TC 6.96</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Precio publicado y cálculo */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Precio publicado * {formData.tipo_precio === 'bob' ? '(Bs.)' : '(USD)'}
                    </label>
                    <input
                      type="number"
                      value={formData.precio_publicado}
                      onChange={(e) => updateField('precio_publicado', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder={formData.tipo_precio === 'bob' ? 'Ej: 750000' : 'Ej: 99536'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Precio normalizado (USD oficial)
                    </label>
                    <div className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-bold text-lg">
                      {formatPrecio(calcularPrecioNormalizado())}
                    </div>
                  </div>
                </div>

                {/* Explicación de la conversión */}
                {formData.tipo_precio !== 'usd_oficial' && parseFloat(formData.precio_publicado) > 0 && (
                  <div className={`p-3 rounded-lg text-sm ${
                    formData.tipo_precio === 'usd_paralelo' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    <div className="flex items-center gap-2 font-medium mb-2">
                      {formData.tipo_precio === 'usd_paralelo' ? (
                        <>Conversión USD paralelo → USD oficial</>
                      ) : (
                        <>Conversión Bs. → USD oficial</>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white/50 rounded p-2">
                        <p className="text-xs opacity-75">Publicado</p>
                        <p className="font-bold">
                          {formData.tipo_precio === 'bob' ? 'Bs. ' : '$'}
                          {Number(formData.precio_publicado).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white/50 rounded p-2">
                        <p className="text-xs opacity-75">Fórmula</p>
                        <p className="font-bold text-xs">
                          {formData.tipo_precio === 'usd_paralelo' ? (
                            <>× ({tcParaleloActual?.toFixed(2) || '10.5'} / 6.96)</>
                          ) : (
                            <>÷ 6.96</>
                          )}
                        </p>
                      </div>
                      <div className="bg-white/80 rounded p-2">
                        <p className="text-xs opacity-75">Normalizado</p>
                        <p className="font-bold">{formatPrecio(calcularPrecioNormalizado())}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Área m² *</label>
                    <input
                      type="number"
                      value={formData.area_m2}
                      onChange={(e) => updateField('area_m2', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Expensas (USD/mes)</label>
                    <input
                      type="number"
                      value={formData.expensas_usd}
                      onChange={(e) => updateField('expensas_usd', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="Ej: 150"
                    />
                  </div>
                </div>

                {precioM2 > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-slate-500">
                      Precio/m²: <strong className="text-slate-900">${precioM2}</strong>
                    </p>
                    {getPrecioAlerta().tipo && (
                      <span className={`text-xs px-2 py-1 rounded border ${getPrecioAlerta().color}`}>
                        {getPrecioAlerta().mensaje}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Características */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Características</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dormitorios</label>
                  <select
                    value={formData.dormitorios}
                    onChange={(e) => updateField('dormitorios', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    {DORMITORIOS_OPCIONES.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Baños</label>
                  <select
                    value={formData.banos}
                    onChange={(e) => updateField('banos', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    {['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Piso</label>
                  <input
                    type="number"
                    value={formData.piso}
                    onChange={(e) => updateField('piso', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    min="1"
                    max="50"
                    placeholder="Ej: 5"
                  />
                </div>
              </div>

              {/* Parqueo y Baulera - 4 opciones cada uno */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 🚗 Parqueo */}
                <div className="p-4 border border-slate-200 rounded-lg">
                  <p className="text-sm font-medium text-slate-700 mb-3">🚗 Parqueo</p>
                  <div className="space-y-2">
                    <label className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${formData.parqueo_opcion === 'incluido' ? 'bg-green-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="parqueo_estado"
                        checked={formData.parqueo_opcion === 'incluido'}
                        onChange={() => {
                          updateField('parqueo_opcion', 'incluido')
                          updateField('parqueo_precio_adicional', '')
                        }}
                        className="text-green-500 focus:ring-green-500"
                      />
                      <span>Incluido en el precio</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${formData.parqueo_opcion === 'no_incluido' ? 'bg-red-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="parqueo_estado"
                        checked={formData.parqueo_opcion === 'no_incluido'}
                        onChange={() => {
                          updateField('parqueo_opcion', 'no_incluido')
                          updateField('parqueo_precio_adicional', '')
                        }}
                        className="text-red-500 focus:ring-red-500"
                      />
                      <span>No incluido</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${formData.parqueo_opcion === 'sin_confirmar' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="parqueo_estado"
                        checked={formData.parqueo_opcion === 'sin_confirmar'}
                        onChange={() => {
                          updateField('parqueo_opcion', 'sin_confirmar')
                          updateField('parqueo_precio_adicional', '')
                        }}
                        className="text-slate-400 focus:ring-slate-400"
                      />
                      <span className="text-slate-500">Sin confirmar</span>
                    </label>
                    <div className={`flex items-center gap-2 p-2 rounded ${formData.parqueo_opcion === 'precio_adicional' ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="parqueo_estado"
                        checked={formData.parqueo_opcion === 'precio_adicional'}
                        onChange={() => updateField('parqueo_opcion', 'precio_adicional')}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm">Precio adicional:</span>
                      <input
                        type="number"
                        value={formData.parqueo_precio_adicional}
                        onChange={(e) => {
                          updateField('parqueo_opcion', 'precio_adicional')
                          updateField('parqueo_precio_adicional', e.target.value)
                        }}
                        className="w-24 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-amber-500 outline-none"
                        placeholder="USD"
                        min="0"
                      />
                    </div>
                  </div>
                </div>

                {/* 📦 Baulera - misma estructura */}
                <div className="p-4 border border-slate-200 rounded-lg">
                  <p className="text-sm font-medium text-slate-700 mb-3">📦 Baulera</p>
                  <div className="space-y-2">
                    <label className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${formData.baulera_opcion === 'incluido' ? 'bg-green-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="baulera_estado"
                        checked={formData.baulera_opcion === 'incluido'}
                        onChange={() => {
                          updateField('baulera', true)
                          updateField('baulera_opcion', 'incluido')
                          updateField('baulera_precio_adicional', '')
                        }}
                        className="text-green-500 focus:ring-green-500"
                      />
                      <span>Incluida en el precio</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${formData.baulera_opcion === 'no_incluido' ? 'bg-red-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="baulera_estado"
                        checked={formData.baulera_opcion === 'no_incluido'}
                        onChange={() => {
                          updateField('baulera', false)
                          updateField('baulera_opcion', 'no_incluido')
                          updateField('baulera_precio_adicional', '')
                        }}
                        className="text-red-500 focus:ring-red-500"
                      />
                      <span>No incluida</span>
                    </label>
                    <label className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${formData.baulera_opcion === 'sin_confirmar' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="baulera_estado"
                        checked={formData.baulera_opcion === 'sin_confirmar'}
                        onChange={() => {
                          updateField('baulera', false)
                          updateField('baulera_opcion', 'sin_confirmar')
                          updateField('baulera_precio_adicional', '')
                        }}
                        className="text-slate-400 focus:ring-slate-400"
                      />
                      <span className="text-slate-500">Sin confirmar</span>
                    </label>
                    <div className={`flex items-center gap-2 p-2 rounded ${formData.baulera_opcion === 'precio_adicional' ? 'bg-amber-100' : 'hover:bg-slate-50'}`}>
                      <input
                        type="radio"
                        name="baulera_estado"
                        checked={formData.baulera_opcion === 'precio_adicional'}
                        onChange={() => {
                          updateField('baulera', true)
                          updateField('baulera_opcion', 'precio_adicional')
                        }}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm">Precio adicional:</span>
                      <input
                        type="number"
                        value={formData.baulera_precio_adicional}
                        onChange={(e) => {
                          updateField('baulera', true)
                          updateField('baulera_opcion', 'precio_adicional')
                          updateField('baulera_precio_adicional', e.target.value)
                        }}
                        className="w-24 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-amber-500 outline-none"
                        placeholder="USD"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* GPS */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Ubicación GPS</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Latitud</label>
                  <input
                    type="text"
                    value={formData.latitud}
                    onChange={(e) => updateField('latitud', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="-17.xxxxx"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Longitud</label>
                  <input
                    type="text"
                    value={formData.longitud}
                    onChange={(e) => updateField('longitud', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="-63.xxxxx"
                  />
                </div>
              </div>
              {formData.latitud && formData.longitud && (
                <a
                  href={`https://www.google.com/maps?q=${formData.latitud},${formData.longitud}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-blue-600 hover:text-blue-800 text-sm"
                >
                  Ver en Google Maps →
                </a>
              )}
            </section>

            {/* Broker */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Información del Broker</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={formData.asesor_nombre}
                    onChange={(e) => updateField('asesor_nombre', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={formData.asesor_telefono}
                    onChange={(e) => updateField('asesor_telefono', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Inmobiliaria</label>
                  <input
                    type="text"
                    value={formData.asesor_inmobiliaria}
                    onChange={(e) => updateField('asesor_inmobiliaria', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  />
                </div>
              </div>
            </section>

            {/* Forma de Pago */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Forma de Pago</h2>

              {/* Financiamiento vs Solo Contado */}
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-700 mb-2">Opciones de financiamiento</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    formData.acepta_financiamiento
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                    <input
                      type="checkbox"
                      checked={formData.acepta_financiamiento}
                      onChange={(e) => {
                        updateField('acepta_financiamiento', e.target.checked)
                        // Si marca plan de pagos, desmarcar solo_tc_paralelo (son mutuamente excluyentes para "solo contado")
                      }}
                      className="w-5 h-5 rounded text-green-500 focus:ring-green-500"
                    />
                    <div>
                      <span className="block text-sm font-medium text-slate-700">📅 Plan de pagos con desarrollador</span>
                      <span className="block text-xs text-slate-500">Acepta cuotas directas con el desarrollador</span>
                    </div>
                  </label>

                  <label className={`flex items-center gap-3 p-4 border-2 rounded-lg transition-colors ${
                    formData.acepta_financiamiento
                      ? 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-50'
                      : formData.solo_tc_paralelo
                        ? 'border-amber-500 bg-amber-50 cursor-pointer'
                        : 'border-slate-200 hover:bg-slate-50 cursor-pointer'
                  }`}>
                    <input
                      type="checkbox"
                      checked={!formData.acepta_financiamiento && formData.solo_tc_paralelo}
                      disabled={formData.acepta_financiamiento}
                      onChange={(e) => updateField('solo_tc_paralelo', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <span className="block text-sm font-medium text-slate-700">💱 Solo contado TC paralelo</span>
                      <span className="block text-xs text-slate-500">Solo acepta pago al contado en USD paralelo</span>
                    </div>
                  </label>
                </div>
                {!formData.acepta_financiamiento && !formData.solo_tc_paralelo && (
                  <p className="text-xs text-slate-500 mt-2 italic">
                    💵 Sin marcar ninguna = Acepta contado en USD oficial o Bolivianos
                  </p>
                )}
              </div>

              {/* Otras opciones */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.acepta_permuta}
                    onChange={(e) => updateField('acepta_permuta', e.target.checked)}
                    className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <span className="block text-sm font-medium text-slate-700">🔄 Acepta Permuta</span>
                    <span className="block text-xs text-slate-500">Vehículo o propiedad</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.precio_negociable}
                    onChange={(e) => updateField('precio_negociable', e.target.checked)}
                    className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                  />
                  <div>
                    <span className="block text-sm font-medium text-slate-700">🤝 Precio Negociable</span>
                    <span className="block text-xs text-slate-500">Acepta ofertas</span>
                  </div>
                </label>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">📉 Descuento por pago al contado (%)</label>
                  <input
                    type="number"
                    value={formData.descuento_contado}
                    onChange={(e) => updateField('descuento_contado', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    min="0"
                    max="30"
                    step="0.5"
                    placeholder="Ej: 5"
                  />
                </div>
              </div>
            </section>

            {/* Amenidades */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Amenidades del Edificio</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {AMENIDADES_OPCIONES.map((amenidad) => (
                  <button
                    key={amenidad}
                    type="button"
                    onClick={() => toggleAmenidad(amenidad)}
                    className={`px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                      formData.amenidades.includes(amenidad)
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <span className="text-sm font-medium">{amenidad}</span>
                  </button>
                ))}
              </div>

              {formData.amenidades_custom.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-slate-500 mb-2">Amenidades personalizadas:</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.amenidades_custom.map((amenidad) => (
                      <span
                        key={amenidad}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                      >
                        {amenidad}
                        <button
                          type="button"
                          onClick={() => eliminarAmenidadCustom(amenidad)}
                          className="ml-1 text-blue-500 hover:text-blue-700"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoAmenidad}
                  onChange={(e) => setNuevoAmenidad(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAmenidadCustom())}
                  placeholder="Agregar otra amenidad..."
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={agregarAmenidadCustom}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  + Agregar
                </button>
              </div>
            </section>

            {/* Equipamiento */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Equipamiento del Departamento</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {EQUIPAMIENTO_OPCIONES.map((equip) => (
                  <button
                    key={equip}
                    type="button"
                    onClick={() => toggleEquipamiento(equip)}
                    className={`px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                      formData.equipamiento.includes(equip)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <span className="text-sm font-medium">{equip}</span>
                  </button>
                ))}
              </div>

              {formData.equipamiento_custom.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-slate-500 mb-2">Equipamiento adicional:</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.equipamiento_custom.map((equip) => (
                      <span
                        key={equip}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                      >
                        {equip}
                        <button
                          type="button"
                          onClick={() => eliminarEquipamientoCustom(equip)}
                          className="ml-1 text-blue-500 hover:text-blue-700"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoEquipamiento}
                  onChange={(e) => setNuevoEquipamiento(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEquipamientoCustom())}
                  placeholder="Agregar otro equipamiento..."
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
                <button
                  type="button"
                  onClick={agregarEquipamientoCustom}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                >
                  + Agregar
                </button>
              </div>
            </section>

            {/* Descripción */}
            <section>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Descripción</h2>
              <textarea
                value={formData.descripcion}
                onChange={(e) => updateField('descripcion', e.target.value)}
                rows={6}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
              />
            </section>

            {/* Errores de Validación */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
                <p className="text-red-700 font-medium text-sm mb-2">⛔ Errores que impiden guardar:</p>
                <ul className="list-disc list-inside text-red-600 text-sm space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings de Validación */}
            {validationWarnings.length > 0 && !showWarningConfirm && (
              <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-lg">
                <p className="text-amber-700 font-medium text-sm mb-2">⚠️ Advertencias (revisar antes de guardar):</p>
                <ul className="list-disc list-inside text-amber-600 text-sm space-y-1">
                  {validationWarnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Modal de Confirmación de Warnings */}
            {showWarningConfirm && (
              <div className="bg-amber-50 border-2 border-amber-300 px-4 py-4 rounded-lg">
                <p className="text-amber-800 font-medium text-sm mb-3">⚠️ Hay {validationWarnings.length} advertencia(s). ¿Deseas guardar de todos modos?</p>
                <ul className="list-disc list-inside text-amber-700 text-sm space-y-1 mb-4">
                  {validationWarnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
                <div className="flex gap-3">
                  <button
                    onClick={handleSaveConfirmed}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium"
                  >
                    Sí, guardar de todos modos
                  </button>
                  <button
                    onClick={() => setShowWarningConfirm(false)}
                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-sm font-medium"
                  >
                    Cancelar y revisar
                  </button>
                </div>
              </div>
            )}

            {/* Error General */}
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm">
                Cambios guardados correctamente. Los campos modificados ahora tienen candado.
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 flex justify-between items-center border-t border-slate-200">
              <Link
                href="/admin/propiedades"
                className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3"
              >
                Cancelar
              </Link>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowHistorial(!showHistorial)}
                  className="px-6 py-3 border border-slate-300 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {showHistorial ? 'Ocultar' : 'Ver'} Historial ({historial.length})
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>

          {/* Historial de cambios */}
          {showHistorial && historial.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Historial de Cambios</h2>
              <div className="space-y-3">
                {historial.map((entry) => (
                  <div key={entry.id} className="border-l-4 border-purple-500 pl-4 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900">
                        Campo: <code className="bg-slate-100 px-2 py-0.5 rounded">{entry.campo}</code>
                      </span>
                      <span className="text-sm text-slate-500">{formatFecha(entry.fecha)}</span>
                    </div>
                    <div className="mt-1 text-sm">
                      <span className="text-red-600">
                        {JSON.stringify(entry.valor_anterior)}
                      </span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="text-green-600">
                        {JSON.stringify(entry.valor_nuevo)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Por: {entry.usuario_nombre} ({entry.usuario_tipo})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal Preview */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Vista previa como resultado</h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {/* Card de resultado - EXACTO como en landing */}
              <div className="bg-white rounded-xl overflow-hidden shadow-lg">
                {/* Foto grande como en landing */}
                <div className="w-full h-56 bg-gray-200 relative">
                  {fotos.length > 0 ? (
                    <>
                      <img
                        src={fotos[fotoActual]}
                        alt={nombreEdificio}
                        className="w-full h-full object-cover"
                      />
                      {/* Badge Match */}
                      <span className="absolute top-3 right-3 text-sm font-bold bg-blue-600 text-white px-3 py-1 rounded-full shadow">
                        #1 Match
                      </span>
                      {/* Navegación fotos */}
                      {fotos.length > 1 && (
                        <>
                          <button
                            onClick={() => setFotoActual(prev => prev === 0 ? fotos.length - 1 : prev - 1)}
                            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-lg"
                          >
                            ‹
                          </button>
                          <button
                            onClick={() => setFotoActual(prev => prev === fotos.length - 1 ? 0 : prev + 1)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-lg"
                          >
                            ›
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                            {fotoActual + 1} / {fotos.length}
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
                      📷 Sin foto
                    </div>
                  )}
                </div>

                {/* Info - Nombre + Precio */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{nombreEdificio}</h3>
                      {proyectoMaster?.desarrollador && (
                        <p className="text-sm text-gray-500">{proyectoMaster.desarrollador}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-gray-900">{formatPrecio(precioInfo.precio)}</p>
                      <p className="text-sm text-gray-500">${precioM2}/m²</p>
                    </div>
                  </div>

                  {/* Info línea unificada - EXACTO como en landing */}
                  <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-3 text-sm text-gray-600">
                    <span className="font-semibold text-gray-700">Departamento</span>
                    <span>·</span>
                    <span>🛏️ {getDormitoriosLabel(formData.dormitorios)}</span>
                    {formData.banos && (
                      <>
                        <span>·</span>
                        <span>🚿 {Math.floor(Number(formData.banos))}b</span>
                      </>
                    )}
                    <span>·</span>
                    <span>📐 {formData.area_m2}m²</span>
                    <span>·</span>
                    {formData.estacionamientos && parseInt(formData.estacionamientos) > 0 ? (
                      <span>🚗 {formData.estacionamientos}p</span>
                    ) : (
                      <span className="text-amber-600">🚗 ?</span>
                    )}
                    <span>·</span>
                    {formData.baulera ? (
                      <span>📦 ✓</span>
                    ) : (
                      <span className="text-amber-600">📦 ?</span>
                    )}
                    {formData.estado_construccion && formData.estado_construccion !== 'no_especificado' && (
                      <>
                        <span>·</span>
                        <span className="text-blue-600 capitalize">{formData.estado_construccion.replace(/_/g, ' ')}</span>
                      </>
                    )}
                  </div>

                  {/* Amenities - chips como en landing */}
                  {formData.amenidades.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {formData.amenidades.slice(0, 5).map(a => (
                        <span key={a} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded">
                          {a}
                        </span>
                      ))}
                      {formData.amenidades.length > 5 && (
                        <span className="text-xs text-gray-500">
                          +{formData.amenidades.length - 5} más
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-4 text-center">
                Vista previa - Así se verá en los resultados de búsqueda de Simón
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox de Fotos */}
      {lightboxIndex !== null && fotos.length > 0 && (
        <div
          className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Botón cerrar */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-4xl font-light z-10"
          >
            ×
          </button>

          {/* Navegación izquierda */}
          {fotos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLightboxIndex(prev => prev === 0 ? fotos.length - 1 : (prev ?? 0) - 1)
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-5xl font-light z-10 w-16 h-16 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            >
              ‹
            </button>
          )}

          {/* Imagen principal */}
          <img
            src={fotos[lightboxIndex]}
            alt={`Foto ${lightboxIndex + 1} de ${fotos.length}`}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Navegación derecha */}
          {fotos.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setLightboxIndex(prev => prev === fotos.length - 1 ? 0 : (prev ?? 0) + 1)
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-5xl font-light z-10 w-16 h-16 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
            >
              ›
            </button>
          )}

          {/* Contador */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm">
            {lightboxIndex + 1} / {fotos.length}
          </div>

          {/* Miniaturas en la parte inferior */}
          {fotos.length > 1 && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto pb-2">
              {fotos.map((foto, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation()
                    setLightboxIndex(idx)
                  }}
                  className={`w-14 h-14 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                    idx === lightboxIndex
                      ? 'border-white opacity-100'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={foto} alt={`Mini ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
