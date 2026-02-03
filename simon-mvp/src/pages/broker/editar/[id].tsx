import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase, convertirZona, obtenerTCActuales } from '@/lib/supabase'
import ProyectoAutocomplete, { ProyectoSugerencia } from '@/components/broker/ProyectoAutocomplete'

interface FormData {
  proyecto_nombre: string
  desarrollador: string
  zona: string
  direccion: string
  piso: string
  // Precio y moneda
  precio_usd: string
  tipo_cambio: 'paralelo' | 'oficial'
  moneda_publicacion: 'usd_oficial' | 'usd_paralelo' | 'bolivianos'
  area_m2: string
  dormitorios: string
  banos: string
  estado_construccion: 'entrega_inmediata' | 'construccion' | 'preventa' | 'planos' | 'no_especificado'
  fecha_entrega: string
  descripcion: string
  // Parqueo
  parqueo_estado: 'incluido' | 'no_incluido' | 'sin_confirmar'
  cantidad_parqueos: string
  parqueo_precio_adicional: string
  // Baulera
  baulera_estado: 'incluida' | 'no_incluida' | 'sin_confirmar'
  baulera_precio_adicional: string
  // Forma de pago
  acepta_plan_pagos: boolean
  plan_pagos_cuotas: CuotaPago[]
  plan_pagos_texto: string
  solo_contado_paralelo: boolean
  acepta_permuta: boolean
  precio_negociable: boolean
  descuento_contado: string
  // Otros
  expensas_usd: string
  amenidades: string[]
  amenidades_custom: string[]
  equipamiento: string[]
  equipamiento_custom: string[]
  // Herencia de proyecto
  id_proyecto_master: number | null
  latitud: number | null
  longitud: number | null
  amenidades_heredadas: string[]
}

interface CuotaPago {
  id: string
  porcentaje: string
  momento: 'reserva' | 'firma_contrato' | 'durante_obra' | 'cuotas_mensuales' | 'entrega' | 'personalizado'
  descripcion: string
}

const MOMENTOS_PAGO = [
  { id: 'reserva', label: 'Al reservar' },
  { id: 'firma_contrato', label: 'Firma de contrato' },
  { id: 'durante_obra', label: 'Durante construcción' },
  { id: 'cuotas_mensuales', label: 'Cuotas mensuales' },
  { id: 'entrega', label: 'Contra entrega' },
  { id: 'personalizado', label: 'Otro momento' },
]

interface CamposBloqueados {
  [campo: string]: {
    bloqueado: boolean
    por: string
    fecha: string
  }
}

interface HistorialCambio {
  fecha: string
  campo: string
  valor_anterior: any
  valor_nuevo: any
  por: string
}

// Zonas iguales a FilterBar.tsx para consistencia
const ZONAS = [
  { id: 'equipetrol', label: 'Equipetrol Centro' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { id: 'villa_brigida', label: 'Villa Brígida' },
  { id: 'faremafu', label: 'Equipetrol Oeste (Busch)' }
]

// Mapear zona desde proyectos_master al formato del formulario
function mapearZonaDesdeProyecto(zonaProyecto: string): string | null {
  const zonaNormalizada = zonaProyecto.toLowerCase().trim()
  const mapeo: Record<string, string> = {
    'equipetrol': 'equipetrol',
    'equipetrol centro': 'equipetrol',
    'sirari': 'sirari',
    'equipetrol norte': 'equipetrol_norte',
    'villa brigida': 'villa_brigida',
    'villa brígida': 'villa_brigida',
    'equipetrol oeste': 'faremafu',
    'equipetrol oeste (busch)': 'faremafu',
    'faremafu': 'faremafu',
  }
  if (mapeo[zonaNormalizada]) return mapeo[zonaNormalizada]
  for (const [key, value] of Object.entries(mapeo)) {
    if (zonaNormalizada.includes(key) || key.includes(zonaNormalizada)) return value
  }
  return null
}

const AMENIDADES_OPCIONES = [
  'Piscina',
  'Gimnasio',
  'Seguridad 24/7',
  'Ascensor',
  'Pet Friendly',
  'Co-working',
  'Churrasquera',
  'Sauna/Jacuzzi',
  'Salón de eventos',
  'Área de juegos'
]

const EQUIPAMIENTO_OPCIONES = [
  'Aire acondicionado',
  'Cocina amoblada',
  'Closets empotrados',
  'Calefón/Termotanque',
  'Cortinas/Blackouts',
  'Muebles incluidos',
  'Lavadora',
  'Secadora',
  'Refrigerador',
  'Microondas',
  'Horno',
  'Lavavajillas',
  'Balcón/Terraza',
  'Jacuzzi privado',
  'Vista panorámica'
]

// Mapeo inverso de zona normalizada a id del select
const zonaToId = (zona: string): string => {
  const mapeo: Record<string, string> = {
    'Equipetrol': 'equipetrol',
    'Equipetrol Centro': 'equipetrol',
    'Sirari': 'sirari',
    'Equipetrol Norte': 'equipetrol_norte',
    'Villa Brígida': 'villa_brigida',
    'Equipetrol Oeste': 'faremafu',
    'Equipetrol Oeste (Busch)': 'faremafu'
  }
  return mapeo[zona] || zona
}

export default function EditarPropiedad() {
  const router = useRouter()
  const { id } = router.query
  const { broker, isImpersonating, exitImpersonation } = useBrokerAuth(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [propiedadCodigo, setPropiedadCodigo] = useState('')
  const [nuevoAmenidad, setNuevoAmenidad] = useState('')
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState('')

  // Estado separado para GPS (string) para preservar entrada mientras escribes
  const [gpsLatStr, setGpsLatStr] = useState('')
  const [gpsLonStr, setGpsLonStr] = useState('')
  const [gpsPasteStr, setGpsPasteStr] = useState('')
  const [gpsPasteError, setGpsPasteError] = useState('')

  // Datos originales para detectar cambios
  const [datosOriginales, setDatosOriginales] = useState<Record<string, any>>({})
  const [camposBloqueados, setCamposBloqueados] = useState<CamposBloqueados>({})
  const [historialCambios, setHistorialCambios] = useState<HistorialCambio[]>([])

  const [formData, setFormData] = useState<FormData>({
    proyecto_nombre: '',
    desarrollador: '',
    zona: '',
    direccion: '',
    piso: '',
    precio_usd: '',
    tipo_cambio: 'paralelo',
    moneda_publicacion: 'usd_paralelo',
    area_m2: '',
    dormitorios: '2',
    banos: '2',
    estado_construccion: 'entrega_inmediata',
    fecha_entrega: '',
    descripcion: '',
    // Parqueo
    parqueo_estado: 'incluido',
    cantidad_parqueos: '1',
    parqueo_precio_adicional: '',
    // Baulera
    baulera_estado: 'sin_confirmar',
    baulera_precio_adicional: '',
    // Forma de pago
    acepta_plan_pagos: false,
    plan_pagos_cuotas: [],
    plan_pagos_texto: '',
    solo_contado_paralelo: false,
    acepta_permuta: false,
    precio_negociable: false,
    descuento_contado: '',
    // Otros
    expensas_usd: '',
    amenidades: [],
    amenidades_custom: [],
    equipamiento: [],
    equipamiento_custom: [],
    // Herencia de proyecto
    id_proyecto_master: null,
    latitud: null,
    longitud: null,
    amenidades_heredadas: []
  })

  // Estado para TC actuales
  const [tcActuales, setTcActuales] = useState({ paralelo: 9.25, oficial: 6.96 })

  // Cargar TC al inicio
  useEffect(() => {
    obtenerTCActuales().then(tc => setTcActuales(tc))
  }, [])

  useEffect(() => {
    if (id && broker) {
      fetchPropiedad()
    }
  }, [id, broker])

  const fetchPropiedad = async () => {
    if (!supabase || !broker || !id) return

    try {
      const { data, error: fetchError } = await supabase
        .from('propiedades_broker')
        .select('*')
        .eq('id', id)
        .eq('broker_id', broker.id)
        .single()

      if (fetchError || !data) {
        router.push('/broker/dashboard')
        return
      }

      setPropiedadCodigo(data.codigo)

      // Guardar datos originales para comparar después
      setDatosOriginales({
        proyecto_nombre: data.proyecto_nombre,
        desarrollador: data.desarrollador,
        zona: data.zona,
        direccion: data.direccion,
        piso: data.piso,
        precio_usd: data.precio_usd,
        tipo_cambio: data.tipo_cambio,
        area_m2: data.area_m2,
        dormitorios: data.dormitorios,
        banos: data.banos,
        estado_construccion: data.estado_construccion,
        fecha_entrega: data.fecha_entrega,
        plan_pagos: data.plan_pagos,
        descripcion: data.descripcion,
        parqueo_incluido: data.parqueo_incluido,
        cantidad_parqueos: data.cantidad_parqueos,
        baulera_incluida: data.baulera_incluida,
        expensas_usd: data.expensas_usd,
        amenidades: data.amenidades
      })

      // Cargar campos bloqueados e historial
      setCamposBloqueados(data.campos_bloqueados || {})
      setHistorialCambios(data.historial_cambios || [])

      // Parsear amenidades y equipamiento
      const amenidadesData = data.amenidades || { lista: [], equipamiento: [] }
      const listaAmenidades = amenidadesData.lista || []
      const listaEquipamiento = amenidadesData.equipamiento || []

      // Separar amenidades standard de custom
      const standardAmenidades = listaAmenidades.filter((a: string) => AMENIDADES_OPCIONES.includes(a))
      const customAmenidades = listaAmenidades.filter((a: string) => !AMENIDADES_OPCIONES.includes(a))

      // Separar equipamiento standard de custom
      const standardEquipamiento = listaEquipamiento.filter((e: string) => EQUIPAMIENTO_OPCIONES.includes(e))
      const customEquipamiento = listaEquipamiento.filter((e: string) => !EQUIPAMIENTO_OPCIONES.includes(e))

      // Migrar campos legacy parqueo/baulera a nuevo formato
      const parqueoEstado = data.parqueo_estado || (data.parqueo_incluido ? 'incluido' : 'sin_confirmar')
      const bauleraEstado = data.baulera_estado || (data.baulera_incluida ? 'incluida' : 'sin_confirmar')

      // Parsear cuotas de plan de pagos si existe
      const cuotasPago = data.plan_pagos_cuotas || []

      setFormData({
        proyecto_nombre: data.proyecto_nombre || '',
        desarrollador: data.desarrollador || '',
        zona: zonaToId(data.zona || ''),
        direccion: data.direccion || '',
        piso: data.piso?.toString() || '',
        precio_usd: data.precio_usd?.toString() || '',
        tipo_cambio: data.tipo_cambio || 'paralelo',
        moneda_publicacion: data.moneda_publicacion || 'usd_paralelo',
        area_m2: data.area_m2?.toString() || '',
        dormitorios: data.dormitorios?.toString() || '2',
        banos: data.banos?.toString() || '2',
        estado_construccion: data.estado_construccion || 'entrega_inmediata',
        fecha_entrega: data.fecha_entrega || '',
        descripcion: data.descripcion || '',
        // Parqueo - leer de columnas nuevas o existentes
        parqueo_estado: parqueoEstado,
        cantidad_parqueos: data.cantidad_parqueos?.toString() || '1',
        parqueo_precio_adicional: (data.parqueo_precio_adicional || data.precio_parqueo_extra)?.toString() || '',
        // Baulera - leer de columnas nuevas o existentes
        baulera_estado: bauleraEstado,
        baulera_precio_adicional: (data.baulera_precio_adicional || data.precio_baulera_extra)?.toString() || '',
        // Forma de pago
        acepta_plan_pagos: data.acepta_plan_pagos ?? false,
        plan_pagos_cuotas: cuotasPago,
        plan_pagos_texto: data.plan_pagos || '',
        solo_contado_paralelo: data.solo_contado_paralelo ?? false,
        acepta_permuta: data.acepta_permuta ?? false,
        precio_negociable: data.precio_negociable ?? false,
        descuento_contado: data.descuento_contado?.toString() || '',
        // Otros
        expensas_usd: data.expensas_usd?.toString() || '',
        amenidades: standardAmenidades,
        amenidades_custom: customAmenidades,
        equipamiento: standardEquipamiento,
        equipamiento_custom: customEquipamiento,
        // Herencia de proyecto
        id_proyecto_master: data.id_proyecto_master || null,
        latitud: data.latitud || null,
        longitud: data.longitud || null,
        amenidades_heredadas: []
      })

      // Inicializar strings de GPS
      setGpsLatStr(data.latitud ? String(data.latitud) : '')
      setGpsLonStr(data.longitud ? String(data.longitud) : '')
    } catch (err) {
      console.error('Error fetching propiedad:', err)
    } finally {
      setLoading(false)
    }
  }

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Parsear coordenadas pegadas de Google Maps (formato: "-17.857, -63.248" o "-17.857,-63.248")
  const parseGoogleMapsCoords = (input: string) => {
    setGpsPasteError('')
    const trimmed = input.trim()
    if (!trimmed) return

    // Intentar separar por coma (con o sin espacio)
    const parts = trimmed.split(/[,\s]+/).filter(p => p.length > 0)

    if (parts.length >= 2) {
      const lat = parseFloat(parts[0])
      const lon = parseFloat(parts[1])

      // Validar que son números válidos y están en rango razonable
      if (!isNaN(lat) && !isNaN(lon) &&
          lat >= -90 && lat <= 90 &&
          lon >= -180 && lon <= 180) {
        // Éxito - actualizar los campos
        setGpsLatStr(String(lat))
        setGpsLonStr(String(lon))
        updateField('latitud', lat)
        updateField('longitud', lon)
        setGpsPasteStr('') // Limpiar el campo de pegado
      } else {
        setGpsPasteError('Coordenadas fuera de rango válido')
      }
    } else {
      setGpsPasteError('Formato no reconocido. Usa: -17.857, -63.248')
    }
  }

  // === Funciones para Plan de Pagos ===
  const agregarCuota = () => {
    const nuevaCuota: CuotaPago = {
      id: `cuota_${Date.now()}`,
      porcentaje: '',
      momento: 'reserva',
      descripcion: ''
    }
    setFormData(prev => ({
      ...prev,
      plan_pagos_cuotas: [...prev.plan_pagos_cuotas, nuevaCuota]
    }))
  }

  const eliminarCuota = (id: string) => {
    setFormData(prev => ({
      ...prev,
      plan_pagos_cuotas: prev.plan_pagos_cuotas.filter(c => c.id !== id)
    }))
  }

  const actualizarCuota = (id: string, campo: keyof CuotaPago, valor: string) => {
    setFormData(prev => ({
      ...prev,
      plan_pagos_cuotas: prev.plan_pagos_cuotas.map(c =>
        c.id === id ? { ...c, [campo]: valor } : c
      )
    }))
  }

  const generarTextoPlanPagos = () => {
    if (formData.plan_pagos_cuotas.length === 0) return ''
    return formData.plan_pagos_cuotas
      .filter(c => c.porcentaje)
      .map(c => {
        const momento = MOMENTOS_PAGO.find(m => m.id === c.momento)?.label || c.momento
        return `${c.porcentaje}% ${momento}${c.descripcion ? ` (${c.descripcion})` : ''}`
      })
      .join(', ')
  }

  // Calcular precio normalizado
  const calcularPrecioNormalizado = () => {
    const precio = parseFloat(formData.precio_usd)
    if (isNaN(precio)) return null

    if (formData.moneda_publicacion === 'usd_oficial') {
      return { normalizado: precio, formula: null }
    } else if (formData.moneda_publicacion === 'usd_paralelo') {
      const normalizado = precio * (tcActuales.paralelo / tcActuales.oficial)
      return {
        normalizado: Math.round(normalizado),
        formula: `$${precio.toLocaleString()} × (${tcActuales.paralelo} / ${tcActuales.oficial})`
      }
    } else if (formData.moneda_publicacion === 'bolivianos') {
      const normalizado = precio / tcActuales.oficial
      return {
        normalizado: Math.round(normalizado),
        formula: `Bs ${precio.toLocaleString()} ÷ ${tcActuales.oficial}`
      }
    }
    return null
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
      setError('Esta amenidad ya existe')
      return
    }

    setFormData(prev => ({
      ...prev,
      amenidades_custom: [...prev.amenidades_custom, amenidad]
    }))
    setNuevoAmenidad('')
    setError(null)
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

  const handleSubmit = async () => {
    if (!broker || !id) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Combinar amenidades y equipamiento standard y custom
      const todasAmenidades = [...formData.amenidades, ...formData.amenidades_custom]
      const todoEquipamiento = [...formData.equipamiento, ...formData.equipamiento_custom]

      // Obtener TC actual
      const tcActuales = await obtenerTCActuales()
      const esParalelo = formData.tipo_cambio === 'paralelo'
      const tcUsado = esParalelo ? tcActuales.paralelo : tcActuales.oficial
      const precioUsd = parseFloat(formData.precio_usd)

      // Si cambió el precio, actualizar precio_usd_original y tipo_cambio_usado
      const precioOriginalAnterior = datosOriginales.precio_usd
      const precioCambio = precioOriginalAnterior?.toString() !== precioUsd.toString()

      // Preparar texto de plan de pagos (combinar cuotas + texto libre)
      const planPagosTexto = formData.plan_pagos_cuotas.length > 0
        ? generarTextoPlanPagos()
        : formData.plan_pagos_texto

      // Preparar nuevos valores
      const nuevosValores: Record<string, any> = {
        proyecto_nombre: formData.proyecto_nombre,
        desarrollador: formData.desarrollador || null,
        zona: convertirZona(formData.zona) || formData.zona,
        direccion: formData.direccion || null,
        piso: formData.piso ? parseInt(formData.piso) : null,
        precio_usd: precioUsd,
        // Si cambió el precio, actualizar referencia de TC
        ...(precioCambio ? {
          precio_usd_original: precioUsd,
          tipo_cambio_usado: tcUsado
        } : {}),
        tipo_cambio: formData.tipo_cambio,
        moneda_publicacion: formData.moneda_publicacion,
        depende_de_tc: esParalelo,
        area_m2: parseFloat(formData.area_m2),
        dormitorios: parseInt(formData.dormitorios),
        banos: parseFloat(formData.banos),
        estado_construccion: formData.estado_construccion,
        fecha_entrega: formData.fecha_entrega || null,
        descripcion: formData.descripcion || null,
        // Parqueo - usar columnas existentes + nuevas
        parqueo_estado: formData.parqueo_estado,
        parqueo_incluido: formData.parqueo_estado === 'incluido', // legacy compatibility
        cantidad_parqueos: parseInt(formData.cantidad_parqueos) || 0,
        precio_parqueo_extra: formData.parqueo_precio_adicional ? parseFloat(formData.parqueo_precio_adicional) : null, // columna existente
        parqueo_precio_adicional: formData.parqueo_precio_adicional ? parseFloat(formData.parqueo_precio_adicional) : null, // nueva columna
        // Baulera - usar columnas existentes + nuevas
        baulera_estado: formData.baulera_estado,
        baulera_incluida: formData.baulera_estado === 'incluida', // legacy compatibility
        precio_baulera_extra: formData.baulera_precio_adicional ? parseFloat(formData.baulera_precio_adicional) : null, // columna existente
        baulera_precio_adicional: formData.baulera_precio_adicional ? parseFloat(formData.baulera_precio_adicional) : null, // nueva columna
        // Forma de pago - nuevas columnas (funcionarán después de migración 100)
        acepta_plan_pagos: formData.acepta_plan_pagos,
        plan_pagos_cuotas: formData.plan_pagos_cuotas,
        plan_pagos: planPagosTexto || null, // columna existente
        solo_contado_paralelo: formData.solo_contado_paralelo,
        acepta_permuta: formData.acepta_permuta,
        precio_negociable: formData.precio_negociable,
        descuento_contado: formData.descuento_contado ? parseFloat(formData.descuento_contado) : null,
        // Otros
        expensas_usd: formData.expensas_usd ? parseFloat(formData.expensas_usd) : null,
        // Herencia de proyecto master
        id_proyecto_master: formData.id_proyecto_master,
        latitud: formData.latitud,
        longitud: formData.longitud
      }

      // Detectar campos cambiados y crear historial
      const nuevoHistorial: HistorialCambio[] = [...historialCambios]
      const nuevosCandados: CamposBloqueados = { ...camposBloqueados }
      const ahora = new Date().toISOString()

      // Campos a comparar (excluir amenidades que se manejan diferente)
      const camposComparar = [
        'proyecto_nombre', 'desarrollador', 'zona', 'direccion', 'piso',
        'precio_usd', 'tipo_cambio', 'area_m2', 'dormitorios', 'banos',
        'estado_construccion', 'fecha_entrega', 'plan_pagos', 'descripcion',
        'parqueo_incluido', 'cantidad_parqueos', 'baulera_incluida', 'expensas_usd'
      ]

      for (const campo of camposComparar) {
        const valorOriginal = datosOriginales[campo]
        const valorNuevo = nuevosValores[campo]

        // Comparar valores (convertir a string para comparación consistente)
        const original = valorOriginal?.toString() ?? ''
        const nuevo = valorNuevo?.toString() ?? ''

        if (original !== nuevo) {
          // Registrar en historial
          nuevoHistorial.push({
            fecha: ahora,
            campo,
            valor_anterior: valorOriginal,
            valor_nuevo: valorNuevo,
            por: broker.nombre || broker.email
          })

          // Bloquear campo EXCEPTO precio cuando TC es paralelo
          // (precio en paralelo puede cambiar con el tipo de cambio)
          const esPrecioParalelo = campo === 'precio_usd' && formData.tipo_cambio === 'paralelo'

          if (!esPrecioParalelo) {
            nuevosCandados[campo] = {
              bloqueado: true,
              por: broker.nombre || broker.email,
              fecha: ahora
            }
          }
        }
      }

      // Usar API endpoint para bypass RLS (soporta impersonación admin)
      const response = await fetch('/api/broker/update-propiedad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-broker-id': broker.id
        },
        body: JSON.stringify({
          propiedad_id: id,
          ...nuevosValores,
          amenidades: {
            lista: todasAmenidades,
            equipamiento: todoEquipamiento,
            estado_amenities: todasAmenidades.reduce((acc, a) => ({
              ...acc,
              [a]: {
                valor: true,
                fuente: formData.amenidades_custom.includes(a) ? 'broker_custom' : 'broker',
                confianza: 'alta'
              }
            }), {}),
            estado_equipamiento: todoEquipamiento.reduce((acc, e) => ({
              ...acc,
              [e]: {
                valor: true,
                fuente: formData.equipamiento_custom.includes(e) ? 'broker_custom' : 'broker',
                confianza: 'alta'
              }
            }), {})
          },
          campos_bloqueados: nuevosCandados,
          historial_cambios: nuevoHistorial,
          updated_at: ahora
        })
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar')
      }

      // Actualizar estado local
      setCamposBloqueados(nuevosCandados)
      setHistorialCambios(nuevoHistorial)
      setDatosOriginales(nuevosValores)

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

    } catch (err: any) {
      setError(err.message || 'Error al guardar cambios')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <BrokerLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
        </div>
      </BrokerLayout>
    )
  }

  return (
    <>
      <Head>
        <title>Editar {propiedadCodigo} | Simón Broker</title>
      </Head>

      <BrokerLayout>
        {/* Admin Impersonation Banner */}
        {isImpersonating && broker && (
          <div className="mb-6 p-4 rounded-xl bg-purple-600 text-white max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👁️</span>
                <div>
                  <h3 className="font-semibold">Modo Administrador</h3>
                  <p className="text-sm text-purple-200">
                    Editando propiedad de: <strong>{broker.nombre}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={exitImpersonation}
                className="px-4 py-2 bg-white text-purple-600 font-semibold rounded-lg hover:bg-purple-50 transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <span className="text-sm text-slate-500 font-mono">{propiedadCodigo}</span>
            <h1 className="text-2xl font-bold text-slate-900">Editar Propiedad</h1>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8 space-y-6">
            {/* Información Básica */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Información Básica</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre del Proyecto *
                  </label>
                  <ProyectoAutocomplete
                    value={formData.proyecto_nombre}
                    linkedProjectId={formData.id_proyecto_master}
                    placeholder="Buscar proyecto..."
                    onSelect={(proyecto: ProyectoSugerencia) => {
                      setFormData(prev => ({
                        ...prev,
                        proyecto_nombre: proyecto.nombre_oficial,
                        id_proyecto_master: proyecto.id_proyecto_master,
                        desarrollador: proyecto.desarrollador || prev.desarrollador,
                        zona: proyecto.zona ? mapearZonaDesdeProyecto(proyecto.zona) || prev.zona : prev.zona,
                        estado_construccion: (proyecto.estado_construccion as any) || prev.estado_construccion,
                        fecha_entrega: proyecto.fecha_entrega_estimada
                          ? proyecto.fecha_entrega_estimada.substring(0, 7)
                          : prev.fecha_entrega,
                        latitud: proyecto.latitud,
                        longitud: proyecto.longitud,
                        amenidades_heredadas: proyecto.amenidades_edificio || [],
                        amenidades: [
                          ...prev.amenidades.filter(a => !proyecto.amenidades_edificio?.includes(a)),
                          ...(proyecto.amenidades_edificio || []).filter(a =>
                            AMENIDADES_OPCIONES.includes(a)
                          )
                        ]
                      }))
                      // Actualizar GPS strings cuando se hereda de proyecto
                      if (proyecto.latitud) setGpsLatStr(String(proyecto.latitud))
                      if (proyecto.longitud) setGpsLonStr(String(proyecto.longitud))
                    }}
                    onManualEntry={(nombre: string) => {
                      // Al escribir manualmente, NO limpiar GPS - el usuario puede haberlo ingresado
                      setFormData(prev => ({
                        ...prev,
                        proyecto_nombre: nombre,
                        id_proyecto_master: null,
                        // Mantener GPS existente (no limpiar)
                        amenidades_heredadas: []
                      }))
                    }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Desarrollador {formData.id_proyecto_master && <span className="text-green-600 text-xs">(heredado)</span>}
                  </label>
                  <input
                    type="text"
                    value={formData.desarrollador}
                    onChange={(e) => updateField('desarrollador', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
                      formData.id_proyecto_master && formData.desarrollador ? 'border-green-300 bg-green-50' : 'border-slate-300'
                    }`}
                    readOnly={!!formData.id_proyecto_master && !!formData.desarrollador}
                  />
                </div>

                {/* Banner de datos heredados */}
                {formData.id_proyecto_master && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-green-600 mt-0.5">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-800">Proyecto vinculado - Datos heredados</p>
                        <p className="text-xs text-green-700 mt-1">
                          Se pre-llenaron: desarrollador{formData.zona && ', zona'}, estado
                          {formData.latitud && ', GPS'}
                          {formData.amenidades_heredadas.length > 0 && `, ${formData.amenidades_heredadas.length} amenidades`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Zona * {formData.id_proyecto_master && formData.zona && <span className="text-green-600 text-xs">(heredado)</span>}
                    </label>
                    <select
                      value={formData.zona}
                      onChange={(e) => updateField('zona', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
                        formData.id_proyecto_master && formData.zona ? 'border-green-300 bg-green-50' : 'border-slate-300'
                      }`}
                    >
                      <option value="">Seleccionar...</option>
                      {ZONAS.map(z => (
                        <option key={z.id} value={z.id}>{z.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Estado {formData.id_proyecto_master && <span className="text-green-600 text-xs">(heredado)</span>}
                    </label>
                    <select
                      value={formData.estado_construccion}
                      onChange={(e) => updateField('estado_construccion', e.target.value)}
                      className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
                        formData.id_proyecto_master ? 'border-green-300 bg-green-50' : 'border-slate-300'
                      }`}
                    >
                      <option value="entrega_inmediata">Entrega Inmediata</option>
                      <option value="construccion">En Construcción</option>
                      <option value="preventa">Preventa</option>
                      <option value="planos">En Planos</option>
                    </select>
                  </div>
                </div>

                {/* Fecha de entrega - inmediatamente después de Estado */}
                {formData.estado_construccion !== 'entrega_inmediata' && formData.estado_construccion !== 'no_especificado' && (
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={formData.direccion}
                      onChange={(e) => updateField('direccion', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Piso
                    </label>
                    <input
                      type="number"
                      value={formData.piso}
                      onChange={(e) => updateField('piso', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="Ej: 5"
                      min="1"
                      max="50"
                    />
                  </div>
                </div>

                {/* GPS - Coordenadas */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      📍 Pegar desde Google Maps
                    </label>
                    <input
                      type="text"
                      value={gpsPasteStr}
                      onChange={(e) => setGpsPasteStr(e.target.value)}
                      onBlur={() => parseGoogleMapsCoords(gpsPasteStr)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          parseGoogleMapsCoords(gpsPasteStr)
                        }
                      }}
                      onPaste={(e) => {
                        // Parsear inmediatamente al pegar
                        setTimeout(() => parseGoogleMapsCoords(e.currentTarget.value), 0)
                      }}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="-17.85763, -63.24845"
                    />
                    {gpsPasteError ? (
                      <p className="text-xs text-red-500 mt-1">{gpsPasteError}</p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-1">
                        Copia las coordenadas de Google Maps (clic derecho → "¿Qué hay aquí?")
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-300"></div>
                    <span className="text-xs text-slate-400">o ingresa manualmente</span>
                    <div className="flex-1 h-px bg-slate-300"></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Latitud
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={gpsLatStr}
                        onChange={(e) => setGpsLatStr(e.target.value)}
                        onBlur={() => {
                          const num = gpsLatStr ? parseFloat(gpsLatStr) : null
                          updateField('latitud', num !== null && !isNaN(num) ? num : null)
                        }}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
                          gpsLatStr && !isNaN(parseFloat(gpsLatStr)) ? 'border-green-300 bg-green-50' : 'border-slate-300 bg-white'
                        }`}
                        placeholder="-17.7833"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Longitud
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={gpsLonStr}
                        onChange={(e) => setGpsLonStr(e.target.value)}
                        onBlur={() => {
                          const num = gpsLonStr ? parseFloat(gpsLonStr) : null
                          updateField('longitud', num !== null && !isNaN(num) ? num : null)
                        }}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${
                          gpsLonStr && !isNaN(parseFloat(gpsLonStr)) ? 'border-green-300 bg-green-50' : 'border-slate-300 bg-white'
                        }`}
                      placeholder="-63.1821"
                    />
                  </div>
                  </div>

                  {/* Indicador de coordenadas válidas */}
                  {gpsLatStr && gpsLonStr && !isNaN(parseFloat(gpsLatStr)) && !isNaN(parseFloat(gpsLonStr)) && (
                    <div className="flex items-center gap-2 text-green-600 text-sm">
                      <span>✅</span>
                      <span>Coordenadas válidas</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Precio y Moneda */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">💰 Precio y Moneda</h2>

              <div className="space-y-4">
                {/* Tipo de moneda publicada */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tipo de precio publicado *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateField('moneda_publicacion', 'usd_oficial')
                        updateField('tipo_cambio', 'oficial')
                      }}
                      className={`py-3 px-3 rounded-lg border-2 text-center transition-colors ${
                        formData.moneda_publicacion === 'usd_oficial'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-sm font-medium">USD Oficial</div>
                      <div className="text-xs text-slate-500">Sin conversión</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateField('moneda_publicacion', 'usd_paralelo')
                        updateField('tipo_cambio', 'paralelo')
                      }}
                      className={`py-3 px-3 rounded-lg border-2 text-center transition-colors ${
                        formData.moneda_publicacion === 'usd_paralelo'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-sm font-medium">USD Paralelo</div>
                      <div className="text-xs text-slate-500">TC {tcActuales.paralelo}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateField('moneda_publicacion', 'bolivianos')
                        updateField('tipo_cambio', 'oficial')
                      }}
                      className={`py-3 px-3 rounded-lg border-2 text-center transition-colors ${
                        formData.moneda_publicacion === 'bolivianos'
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-300 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      <div className="text-sm font-medium">Bolivianos</div>
                      <div className="text-xs text-slate-500">TC {tcActuales.oficial}</div>
                    </button>
                  </div>
                </div>

                {/* Precio */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Precio publicado * ({formData.moneda_publicacion === 'bolivianos' ? 'Bs' : 'USD'})
                    </label>
                    <input
                      type="number"
                      value={formData.precio_usd}
                      onChange={(e) => updateField('precio_usd', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder={formData.moneda_publicacion === 'bolivianos' ? 'Ej: 350000' : 'Ej: 95000'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Área m² *
                    </label>
                    <input
                      type="number"
                      value={formData.area_m2}
                      onChange={(e) => updateField('area_m2', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                {/* Precio normalizado */}
                {formData.moneda_publicacion !== 'usd_oficial' && formData.precio_usd && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700">
                      <span>💱</span>
                      <span className="font-medium">
                        Precio normalizado: ${calcularPrecioNormalizado()?.normalizado?.toLocaleString()} USD oficial
                      </span>
                    </div>
                    {calcularPrecioNormalizado()?.formula && (
                      <div className="text-xs text-blue-600 mt-1">
                        {calcularPrecioNormalizado()?.formula} = ${calcularPrecioNormalizado()?.normalizado?.toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* Precio/m2 */}
                {formData.precio_usd && formData.area_m2 && (
                  <div className="text-sm text-slate-500">
                    Precio/m²: <span className="font-medium text-slate-700">
                      ${Math.round(parseFloat(formData.precio_usd) / parseFloat(formData.area_m2)).toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Expensas */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Expensas (USD/mes)
                    </label>
                    <input
                      type="number"
                      value={formData.expensas_usd}
                      onChange={(e) => updateField('expensas_usd', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="Ej: 85"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Características */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">🏠 Características</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Dormitorios *
                    </label>
                    <select
                      value={formData.dormitorios}
                      onChange={(e) => updateField('dormitorios', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    >
                      <option value="0">Monoambiente</option>
                      {[1, 2, 3, 4, 5].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Baños *
                    </label>
                    <select
                      value={formData.banos}
                      onChange={(e) => updateField('banos', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    >
                      {['1', '1.5', '2', '2.5', '3', '3.5', '4'].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Parqueo */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    🚗 Parqueo
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { id: 'incluido', label: 'Incluido', desc: 'En el precio' },
                      { id: 'no_incluido', label: 'No incluido', desc: 'Precio aparte' },
                      { id: 'sin_confirmar', label: 'Sin confirmar', desc: 'Por verificar' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateField('parqueo_estado', opt.id)}
                        className={`py-2 px-3 rounded-lg border-2 text-center transition-colors ${
                          formData.parqueo_estado === opt.id
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Cantidad</label>
                      <select
                        value={formData.cantidad_parqueos}
                        onChange={(e) => updateField('cantidad_parqueos', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      >
                        {[0, 1, 2, 3, 4].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    {formData.parqueo_estado === 'no_incluido' && (
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Precio adicional (USD)</label>
                        <input
                          type="number"
                          value={formData.parqueo_precio_adicional}
                          onChange={(e) => updateField('parqueo_precio_adicional', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                          placeholder="Ej: 8000"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Baulera */}
                <div className="bg-slate-50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    📦 Baulera
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {[
                      { id: 'incluida', label: 'Incluida', desc: 'En el precio' },
                      { id: 'no_incluida', label: 'No incluida', desc: 'Precio aparte' },
                      { id: 'sin_confirmar', label: 'Sin confirmar', desc: 'Por verificar' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateField('baulera_estado', opt.id)}
                        className={`py-2 px-3 rounded-lg border-2 text-center transition-colors ${
                          formData.baulera_estado === opt.id
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                  {formData.baulera_estado === 'no_incluida' && (
                    <div className="w-1/2">
                      <label className="block text-xs text-slate-500 mb-1">Precio adicional (USD)</label>
                      <input
                        type="number"
                        value={formData.baulera_precio_adicional}
                        onChange={(e) => updateField('baulera_precio_adicional', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        placeholder="Ej: 3000"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Forma de Pago */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">💳 Forma de Pago</h2>

              <div className="space-y-4">
                {/* Opciones de pago */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.acepta_plan_pagos}
                      onChange={(e) => updateField('acepta_plan_pagos', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-slate-700">📅 Plan de pagos con desarrollador</div>
                      <div className="text-xs text-slate-500">Acepta cuotas directas con el desarrollador</div>
                    </div>
                  </label>

                  {/* Constructor de Plan de Pagos */}
                  {formData.acepta_plan_pagos && (
                    <div className="ml-8 p-4 border border-amber-200 bg-amber-50 rounded-lg space-y-4">
                      <div className="text-sm font-medium text-amber-800">Detalle del plan de pagos:</div>

                      {/* Cuotas */}
                      {formData.plan_pagos_cuotas.map((cuota, index) => (
                        <div key={cuota.id} className="flex items-center gap-2 bg-white p-2 rounded-lg">
                          <input
                            type="number"
                            value={cuota.porcentaje}
                            onChange={(e) => actualizarCuota(cuota.id, 'porcentaje', e.target.value)}
                            className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-center"
                            placeholder="%"
                          />
                          <span className="text-slate-500">%</span>
                          <select
                            value={cuota.momento}
                            onChange={(e) => actualizarCuota(cuota.id, 'momento', e.target.value)}
                            className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm"
                          >
                            {MOMENTOS_PAGO.map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={cuota.descripcion}
                            onChange={(e) => actualizarCuota(cuota.id, 'descripcion', e.target.value)}
                            className="w-32 px-2 py-1 border border-slate-300 rounded text-sm"
                            placeholder="Nota opcional"
                          />
                          <button
                            type="button"
                            onClick={() => eliminarCuota(cuota.id)}
                            className="p-1 text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={agregarCuota}
                        className="text-sm text-amber-700 hover:text-amber-800 font-medium"
                      >
                        + Agregar cuota
                      </button>

                      {/* Separador */}
                      <div className="flex items-center gap-2 text-xs text-amber-600">
                        <div className="flex-1 h-px bg-amber-300"></div>
                        <span>o describir libremente</span>
                        <div className="flex-1 h-px bg-amber-300"></div>
                      </div>

                      {/* Texto libre */}
                      <textarea
                        value={formData.plan_pagos_texto}
                        onChange={(e) => updateField('plan_pagos_texto', e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm resize-none"
                        placeholder="Ej: 30% reserva, 40% en 12 cuotas durante construcción, 30% contra entrega"
                      />

                      {/* Preview del texto generado */}
                      {formData.plan_pagos_cuotas.length > 0 && generarTextoPlanPagos() && (
                        <div className="text-xs text-amber-700 bg-amber-100 p-2 rounded">
                          <span className="font-medium">Vista previa:</span> {generarTextoPlanPagos()}
                        </div>
                      )}
                    </div>
                  )}

                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.solo_contado_paralelo}
                      onChange={(e) => updateField('solo_contado_paralelo', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-slate-700">💱 Solo contado TC paralelo</div>
                      <div className="text-xs text-slate-500">Solo acepta pago al contado en USD paralelo</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.acepta_permuta}
                      onChange={(e) => updateField('acepta_permuta', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-slate-700">🔄 Acepta Permuta</div>
                      <div className="text-xs text-slate-500">Vehículo o propiedad como parte de pago</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.precio_negociable}
                      onChange={(e) => updateField('precio_negociable', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-medium text-slate-700">🤝 Precio Negociable</div>
                      <div className="text-xs text-slate-500">Acepta ofertas</div>
                    </div>
                  </label>
                </div>

                {/* Descuento contado */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      📉 Descuento por pago contado (%)
                    </label>
                    <input
                      type="number"
                      value={formData.descuento_contado}
                      onChange={(e) => updateField('descuento_contado', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="Ej: 5"
                      min="0"
                      max="50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Descripción */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">📝 Descripción</h2>
              <textarea
                value={formData.descripcion}
                onChange={(e) => updateField('descripcion', e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                placeholder="Describe las características especiales de esta propiedad..."
              />
            </div>

            {/* Amenidades */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Amenidades del Edificio</h2>

              <div className="grid grid-cols-2 gap-3 mb-4">
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

              {/* Amenidades Custom */}
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
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Agregar amenidad custom */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoAmenidad}
                  onChange={(e) => setNuevoAmenidad(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && agregarAmenidadCustom()}
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
            </div>

            {/* Equipamiento */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Equipamiento del Departamento</h2>

              <div className="grid grid-cols-2 gap-3 mb-4">
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

              {/* Equipamiento Custom */}
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
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Agregar equipamiento custom */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevoEquipamiento}
                  onChange={(e) => setNuevoEquipamiento(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), agregarEquipamientoCustom())}
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
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm">
                Cambios guardados correctamente
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 flex justify-between items-center border-t border-slate-200">
              <button
                onClick={() => router.push('/broker/dashboard')}
                className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3"
              >
                Volver al Dashboard
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push(`/broker/fotos/${id}`)}
                  className="px-6 py-3 border border-amber-500 text-amber-600 font-semibold rounded-lg hover:bg-amber-50 transition-colors"
                >
                  Editar Fotos
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || !formData.proyecto_nombre || !formData.zona || !formData.precio_usd || !formData.area_m2}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </BrokerLayout>
    </>
  )
}
