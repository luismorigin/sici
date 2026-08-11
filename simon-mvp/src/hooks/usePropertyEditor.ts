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

/**
 * 🔴 LA TABLA VIVA — un solo lugar, a propósito.
 *
 * Hasta el 11-ago-2026 este editor leía y escribía `propiedades_v2`, que desde el 21-jul es la
 * base que NADIE consulta: el sitio, el bot y el ACM leen la del híbrido. O sea que corregir un
 * precio, un GPS o poner un candado acá **no cambiaba nada** en simonbo.com, y sin dar ningún
 * error. Con el TIEMPO 1 del cutover esa tabla pasó a llamarse `propiedades_v2_archivo` y el
 * editor empezó a fallar — que es como se descubrió del todo.
 *
 * Va en una constante y no repetido en 8 llamadas porque en el TIEMPO 2 la tabla viva recupera
 * el nombre `propiedades_v2`: ese día se cambia ACÁ, una línea, y no se busca por el archivo.
 * Contexto: `scripts/deptos-equipetrol/INVENTARIO_CUTOVER_2026-08-10.md`.
 */
const TABLA_PROPIEDADES = 'propiedades_v2_shadow'

const INITIAL_FORM: FormData = {
  tipo_operacion: 'venta',
  proyecto_nombre: '',
  desarrollador: '',
  microzona: 'equipetrol_centro',
  piso: '',
  precio_publicado: '',
  tipo_precio: 'usd',
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

  // Zona REAL del GPS del formulario (la que dicen los polígonos, no la elegida en el selector).
  // Se recalcula cuando el usuario mueve el GPS y la usa `validarFormulario` para avisar si el
  // selector de microzona quedó apuntando a otra cosa. `null` = todavía sin consultar o sin GPS.
  const [zonaRealDelGps, setZonaRealDelGps] = useState<string | null>(null)

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
  /** El formulario tal como quedó al CARGAR. Se compara contra esto para saber qué tocó el humano. */
  const [formInicial, setFormInicial] = useState<FormData | null>(null)

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
        supabase.from(TABLA_PROPIEDADES).select('*').eq('id', id).single(),
        supabase.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single(),
      ])

      const { data, error: fetchError } = propResult
      if (fetchError || !data) {
        // No todo error es "no existe". Desde la mig 317 (11-ago-2026) la base viva está cerrada
        // para el usuario anónimo, así que **sin sesión** la consulta falla por PERMISOS — y
        // decir "Propiedad no encontrada" manda a buscar el problema al lugar equivocado
        // (¿se borró?, ¿está el id mal?) cuando lo único que falta es iniciar sesión.
        const msg = (fetchError?.message || '').toLowerCase()
        const esPermiso = fetchError?.code === '42501' || msg.includes('permission') || msg.includes('denied')
        // Se adjunta el error técnico + SI HAY SESIÓN. Un 42501 puede significar dos cosas muy
        // distintas —"no tenés sesión" o "tu rol no alcanza"— y sin este dato no se distinguen.
        const { data: { session } } = await supabase.auth.getSession()
        const quien = session
          ? `sesión OK (${session.user?.email || 'sin email'}, rol ${session.user?.role || '?'})`
          : '⚠️ SIN SESIÓN → la consulta viaja como visitante anónimo'
        const detalle = fetchError ? ` [${fetchError.code || 's/código'}: ${fetchError.message}] · ${quien}` : ''
        setError((esPermiso
          ? 'Sin permiso para leer la propiedad.'
          : 'Propiedad no encontrada') + detalle)
        return
      }

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

      // ── EN QUÉ MONEDA ESTÁ PUBLICADO EL AVISO ────────────────────────────────
      // Régimen nuevo (TC_NUEVO_DECISION.md): el CRUDO vive siempre en `precio_usd`
      // (o `precio_mensual_bob` en alquiler) y el tag dice en qué moneda está. No hay
      // nada que reconstruir ni que derivar: se lee el crudo y su etiqueta, y listo.
      //
      // La versión anterior hacía arqueología para adivinar el precio "original":
      // leía `datos_json_enrichment.precio_usd_original`, un campo que la memoria
      // `project_checkpoint_deptos_hibrido` marca como **NO confiable** (BOB crudo de
      // Remax / USD×TC de C21), y distinguía `paralelo` vs `oficial`, dos tags de un
      // régimen que murió cuando Bolivia unificó los tipos de cambio.
      const tipoPrecio: 'usd' | 'bob' | 'usd_tc_viejo' =
        data.tipo_operacion === 'alquiler' ? 'bob'
        : data.tipo_cambio_detectado === 'bob' ? 'bob'
        : data.tipo_cambio_detectado === 'oficial_viejo' ? 'usd_tc_viejo'
        : 'usd'
      const precioPublicado = (
        data.tipo_operacion === 'alquiler' ? data.precio_mensual_bob : data.precio_usd
      )?.toString() || ''

      // Microzona — match por id, valor BD (MICROZONA_ID_TO_DB) o label.
      // El valor BD es la fuente de verdad: villa_brigida y equipetrol_oeste tienen label != BD.
      const microzonaExistente = MICROZONAS.find(m =>
        m.id === data.microzona ||
        MICROZONA_ID_TO_DB[m.id] === data.microzona ||
        MICROZONA_ID_TO_DB[m.id] === data.zona ||
        m.label === data.microzona || m.label === data.zona
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

      // 📸 El formulario tal como queda al CARGAR. Guardarlo permite saber después qué tocó el
      // humano de verdad: sin esto, un campo que en la BD es NULL entra al form como `false` (su
      // default) y al guardar se detecta como "cambio", se escribe `false` y se TRABA con candado.
      // Efecto medido en la prop 1441: guardar el precio convirtió baulera, acepta_permuta,
      // precio_negociable y plan_pagos_desarrollador de "no sabemos" a "no", los cuatro trabados.
      // Es lo contrario del `null` honesto del lector, y el candado lo volvía permanente.
      const formCargado: FormData = {
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
      }
      setFormData(formCargado)
      setFormInicial(formCargado)
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

  // Consulta la zona REAL del GPS que hay en el formulario, con debounce (el GPS se tipea).
  // No toca el selector: solo alimenta el aviso de `validarFormulario`. Decidir por el usuario
  // sería peor — el mismo criterio del audit nocturno: reportar, no desconectar.
  useEffect(() => {
    const lat = parseFloat(formData.latitud)
    const lon = parseFloat(formData.longitud)
    if (!supabase || !Number.isFinite(lat) || !Number.isFinite(lon) || lat === 0 || lon === 0) {
      setZonaRealDelGps(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase!.rpc('get_zona_by_gps', { p_lat: lat, p_lon: lon })
        const z = Array.isArray(data) ? (data[0]?.zona ?? null) : (data ?? null)
        setZonaRealDelGps(typeof z === 'string' && z ? z : null)
      } catch { setZonaRealDelGps(null) }
    }, 600)
    return () => clearTimeout(t)
  }, [formData.latitud, formData.longitud])

  // ---- Auto-detect zona from project GPS ----

  const autoDetectZonaFromProject = async (proyecto: ProyectoOption) => {
    if (!supabase || !proyecto.latitud || !proyecto.longitud) return
    try {
      const { data } = await supabase.rpc('get_zona_by_gps', {
        p_lat: proyecto.latitud, p_lon: proyecto.longitud,
      })
      if (data && data.length > 0 && data[0].zona) {
        const zonaGps = data[0].zona as string
        const microzona = MICROZONAS.find(m =>
          MICROZONA_ID_TO_DB[m.id] === zonaGps || m.label === zonaGps
        )
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
      // (Se retiró el sync `tipo_precio → solo_tc_paralelo`: ese flag distinguía "solo acepta
      //  paralelo" cuando había DOS tipos de cambio. Con el TC unificado no distingue nada.)
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

  // ---- Precio ----
  //
  // 🔴 REGLA (11-ago-2026): el editor NO convierte. Guarda el CRUDO con su etiqueta de moneda,
  // como hace el lector nocturno, y la base normaliza al LEER. Es el principio que rige en todo
  // el resto del sistema: *crudo adentro, normalizado afuera*.
  //
  // Lo anterior hacía `precio / 6.96` para bolivianos — el TC oficial que Bolivia tuvo clavado
  // durante años y que dejó de existir al unificarse con el paralelo. Con el TC real (11,64) eso
  // guardaba **67% más caro**: Bs 595.000 entraban como $85.489 cuando valen $51.126. Y no era
  // un caso raro: la brecha es la fórmula entera (11,638 / 6,96 = 1,672).
  //
  // Nota: `tcParaleloActual` sale de `config_global.tipo_cambio_paralelo`, el mismo valor que usa
  // la BD. Si no cargó, se declara y NO se inventa un fallback — un TC inventado es justamente
  // como empezó este problema.

  const TC_MUERTO = 6.96   // constante histórica: solo para avisos anclados EXPLÍCITO a 6,96 / "TC 7"

  /** Lo que se GUARDA: el número tal como lo publica el aviso, sin tocar. */
  const precioCrudoAGuardar = () => parseFloat(formData.precio_publicado) || 0

  /**
   * Lo que VE EL CLIENTE en el feed. Réplica de `precio_normalizado_shadow` (mig 272 + 311).
   * Es solo para mostrar: nunca se escribe en la base.
   * `null` = no se puede calcular todavía (falta el TC del día) → la UI lo declara en vez de mentir.
   */
  const precioComoLoVeElCliente = (): number | null => {
    const crudo = parseFloat(formData.precio_publicado) || 0
    if (!crudo) return 0
    if (formData.tipo_operacion === 'alquiler') return crudo   // alquiler se muestra en Bs, no se convierte
    if (formData.tipo_precio === 'usd') return crudo           // ya está en dólares reales
    if (!tcParaleloActual) return null                         // sin TC del día no hay conversión honesta
    if (formData.tipo_precio === 'bob') return Math.round(crudo / tcParaleloActual)
    return Math.round(crudo * TC_MUERTO / tcParaleloActual)    // 'usd_tc_viejo'
  }

  // ⚠️ NO reponer un alias `calcularPrecioNormalizado`: ese nombre, en el régimen nuevo, describe
  // el precio del FEED — pero apuntaba al CRUDO. Con ese alias puesto, la validación comparaba
  // Bs 595.000 ÷ 45 m² = "13.222 USD/m²" contra el techo de $4.000 y **bloqueaba el guardado**.
  // Los dos números tienen nombre propio a propósito: `precioCrudoAGuardar` y `precioComoLoVeElCliente`.
  const precioDelFeedONull = () => precioComoLoVeElCliente() ?? 0

  /** Lo que la UI necesita para mostrar LOS DOS números: el del aviso y el del feed. */
  const getPrecioInfo = () => {
    const crudo = precioCrudoAGuardar()
    const delFeed = precioComoLoVeElCliente()
    return {
      precio: delFeed ?? 0,
      precioPublicado: crudo,
      /** El número que ve el cliente. `null` = falta el TC del día → la UI lo declara, no inventa. */
      precioDelFeed: delFeed,
      /** ¿Hay que mostrar la traducción? Solo si el crudo NO está ya en dólares reales. */
      necesitaConversion: formData.tipo_precio !== 'usd' && formData.tipo_operacion !== 'alquiler',
      esBob: formData.tipo_precio === 'bob',
      esTcViejo: formData.tipo_precio === 'usd_tc_viejo',
      tipoPrecio: formData.tipo_precio,
      /** El TC con el que la BD va a normalizar hoy. Se muestra para que el número sea auditable. */
      tcDelDia: tcParaleloActual,
    }
  }

  const getPrecioAlerta = (): { tipo: 'error' | 'warning' | null; mensaje: string; color: string } => {
    const precio = precioDelFeedONull()
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

    const microzonaDbDiff = MICROZONA_ID_TO_DB[formData.microzona] || formData.microzona
    if (originalData.zona !== microzonaDbDiff) {
      cambios.push({ campo: 'zona', anterior: originalData.zona, nuevo: microzonaDbDiff })
    }
    if (originalData.dormitorios !== parseInt(formData.dormitorios)) {
      cambios.push({ campo: 'dormitorios', anterior: originalData.dormitorios, nuevo: parseInt(formData.dormitorios) })
    }
    if (originalData.banos !== parseFloat(formData.banos)) {
      cambios.push({ campo: 'banos', anterior: originalData.banos, nuevo: parseFloat(formData.banos) })
    }

    // El diff compara CRUDO contra CRUDO (antes comparaba el convertido, así que un cambio de
    // moneda se registraba como "cambió el precio" aunque el aviso dijera lo mismo).
    const precioCrudoNuevo = precioCrudoAGuardar()
    const precioCrudoAnterior = originalData.tipo_operacion === 'alquiler'
      ? originalData.precio_mensual_bob : originalData.precio_usd
    if (precioCrudoAnterior !== precioCrudoNuevo) {
      cambios.push({ campo: 'precio_usd', anterior: precioCrudoAnterior, nuevo: precioCrudoNuevo })
    }

    const monedaOriginal: 'usd' | 'bob' | 'usd_tc_viejo' =
      originalData.tipo_operacion === 'alquiler' ? 'bob'
      : originalData.tipo_cambio_detectado === 'bob' ? 'bob'
      : originalData.tipo_cambio_detectado === 'oficial_viejo' ? 'usd_tc_viejo'
      : 'usd'
    if (monedaOriginal !== formData.tipo_precio) {
      cambios.push({ campo: 'tipo_cambio_detectado', anterior: monedaOriginal, nuevo: formData.tipo_precio })
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

    // 🔒 Filtro final: descartar los "cambios" de campos que el humano NO tocó.
    // Los booleanos entran al form como `false` aunque en la BD sean NULL, así que el diff los
    // marcaba como cambio → se escribían Y se trababan con candado. Comparando contra la foto
    // inicial del formulario, un campo que quedó igual a como se cargó no es un cambio.
    // (Sin esto, el auto-candado trababa 8 campos por cada guardado; medido en la prop 1441.)
    if (formInicial) {
      const equivale: Record<string, keyof FormData> = {
        baulera: 'baulera',
        acepta_permuta: 'acepta_permuta',
        precio_negociable: 'precio_negociable',
        plan_pagos_desarrollador: 'acepta_financiamiento',
        solo_tc_paralelo: 'solo_tc_paralelo',
        estado_construccion: 'estado_construccion',
      }
      return cambios.filter(c => {
        const campoForm = equivale[c.campo]
        if (!campoForm) return true
        return formData[campoForm] !== formInicial[campoForm]
      })
    }
    return cambios
  }

  // ---- Validation ----

  const validarFormulario = (): { errors: string[]; warnings: string[] } => {
    const errors: string[] = []
    const warnings: string[] = []

    const precio = precioDelFeedONull()   // el precio/m² se juzga contra el del FEED, no contra el crudo
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

    // GPS: se compara contra los POLÍGONOS reales (`get_zona_by_gps`), no contra un rectángulo.
    // El chequeo anterior tenía el bounding box de Equipetrol hardcodeado: desde que el editor
    // apunta a la base viva —que incluye Zona Norte— habría gritado "fuera de Equipetrol" en las
    // ~380 props de ZN, todas las veces. Un aviso que siempre suena deja de leerse.
    const lat = parseFloat(formData.latitud) || 0
    const lon = parseFloat(formData.longitud) || 0
    if (lat !== 0 && lon !== 0) {
      const microzonaElegida = MICROZONA_ID_TO_DB[formData.microzona] || formData.microzona
      if (zonaRealDelGps === null) {
        warnings.push(`GPS (${lat.toFixed(6)}, ${lon.toFixed(6)}) cae fuera de todas las zonas conocidas — verificar que sea correcto`)
      } else if (zonaRealDelGps !== microzonaElegida) {
        // Avisa, NO corrige: el selector puede estar bien a propósito (el pin del portal
        // suele ser del captador y no del edificio — ver la superficie 5 del audit).
        warnings.push(`El GPS cae en "${zonaRealDelGps}" pero la microzona elegida es "${microzonaElegida}". Si moviste el GPS, revisá el selector.`)
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

      const microzonaDb = MICROZONA_ID_TO_DB[formData.microzona] || formData.microzona
      // El CRUDO, sin convertir. La normalización la hace la BD al leer (ver §Precio arriba).
      const precioCrudo = precioCrudoAGuardar()
      // La etiqueta del crudo. Mapea 1:1 con lo que escribe el lector nocturno.
      const tagMoneda = formData.tipo_precio === 'bob' ? 'bob'
        : formData.tipo_precio === 'usd_tc_viejo' ? 'oficial_viejo'
        : 'no_especificado'

      const updateData: Record<string, any> = {
        tipo_operacion: formData.tipo_operacion || null,
        nombre_edificio: formData.proyecto_nombre || null,
        id_proyecto_master: selectedProyectoId,
        zona: microzonaDb,
        microzona: microzonaDb,
        // 🔴 ALQUILER: UNA SOLA columna de precio. Poblar las dos es lo que el verificador
        // nocturno controla que nunca pase ("anti-doble-normalización: DEBE SER 0"); el editor
        // las escribía las dos y encima derivaba el dólar con el TC muerto.
        // El display en USD lo calcula la RPC del feed al leer, no se guarda.
        ...(formData.tipo_operacion === 'alquiler'
          ? { precio_mensual_bob: precioCrudo, precio_mensual_usd: null }
          : { precio_usd: precioCrudo, precio_usd_actualizado: null, tipo_cambio_detectado: tagMoneda }),
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

      // ── La metadata del precio, en el régimen nuevo ─────────────────────────
      // El tag ya viaja en `updateData.tipo_cambio_detectado` (arriba). Acá solo queda la moneda
      // del aviso y LIMPIAR lo que era andamiaje de la conversión vieja:
      //  · `tipo_cambio_usado` / `tipo_cambio_paralelo_usado` → guardaban con qué TC se convirtió.
      //    Ya no se convierte al guardar, así que no hay nada que registrar.
      //  · `depende_de_tc` → distinguía "este precio se mueve con el TC". Con el crudo + tag, eso
      //    lo dice el tag mismo (`bob` depende, `no_especificado` no).
      //  · `precio_usd_original` → 🔴 NO se escribe: la memoria `project_checkpoint_deptos_hibrido`
      //    lo marca como NO CONFIABLE (BOB crudo de Remax / USD×TC de C21). Escribirlo sería
      //    propagar un dato que ya sabemos que miente.
      updateData.moneda_original = formData.tipo_precio === 'bob' ? 'BOB' : 'USD'
      updateData.tipo_cambio_usado = null
      updateData.tipo_cambio_paralelo_usado = null
      updateData.depende_de_tc = formData.tipo_precio !== 'usd'
      switch (formData.tipo_precio) {
        case 'usd':
        case 'bob':
        case 'usd_tc_viejo':
          break
      }

      // ── 🔴 NO ESCRIBIR LO QUE EL HUMANO NO TOCÓ ──────────────────────────────
      // El formulario carga los booleanos con un default (`false`) aunque en la BD sean NULL.
      // Sin este filtro, guardar CUALQUIER cosa escribía `false` en todos ellos y el auto-candado
      // los trababa: "no sabemos" pasaba a "no", protegido y permanente.
      // Medido en la 1441 (11-ago): guardar solo el precio convirtió baulera, acepta_permuta,
      // precio_negociable y plan_pagos_desarrollador. Para `baulera` eso es afirmar que la
      // propiedad NO tiene baulera cuando nunca se supo — lo contrario del `null` honesto del
      // lector, y encima trabado.
      // 📌 Esto explica parte del historial: `acepta_permuta`, `precio_negociable` y
      // `plan_pagos_desarrollador` figuran con ~500 "ediciones" cada uno. Muchas no fueron
      // ediciones: fue este efecto disparándose solo.
      if (formInicial) {
        const soloSiElHumanoLoToco: Array<[keyof FormData, string]> = [
          ['baulera', 'baulera'],
          ['acepta_permuta', 'acepta_permuta'],
          ['precio_negociable', 'precio_negociable'],
          ['acepta_financiamiento', 'plan_pagos_desarrollador'],
          ['solo_tc_paralelo', 'solo_tc_paralelo'],
          ['estado_construccion', 'estado_construccion'],
          ['parqueo_opcion', 'parqueo_incluido'],
          ['baulera_opcion', 'baulera_incluido'],
        ]
        for (const [campoForm, columna] of soloSiElHumanoLoToco) {
          if (formData[campoForm] === formInicial[campoForm]) delete updateData[columna]
        }
      }

      // Auto-candado TC: proteger edición manual del merge nocturno
      if (updateData.tipo_cambio_detectado !== undefined) {
        updateData.campos_bloqueados = {
          ...updateData.campos_bloqueados,
          tipo_cambio_detectado: {
            bloqueado: true, por: 'admin', usuario_id: 'admin-panel',
            usuario_nombre: 'Administrador', fecha: ahora,
          },
        }
      }

      const { error: updateError } = await supabase.from(TABLA_PROPIEDADES).update(updateData).eq('id', id)
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
        .from(TABLA_PROPIEDADES)
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
        .from(TABLA_PROPIEDADES)
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
      const { error } = await supabase.from(TABLA_PROPIEDADES).update({ campos_bloqueados: null }).eq('id', id)
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
        await supabase.from(TABLA_PROPIEDADES)
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

        const { data: propActual } = await supabase.from(TABLA_PROPIEDADES).select('campos_bloqueados').eq('id', id).single()
        const nuevosCandadosPost = { ...(propActual?.campos_bloqueados || {}) }
        camposABloquear.forEach(campo => {
          nuevosCandadosPost[campo] = { bloqueado: true, fecha: new Date().toISOString(), fuente: 'sync_proyecto_master' }
        })
        await supabase.from(TABLA_PROPIEDADES).update({ campos_bloqueados: nuevosCandadosPost }).eq('id', id)
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
    ? Math.round(precioDelFeedONull() / parseFloat(formData.area_m2))
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
    precioCrudoAGuardar, precioComoLoVeElCliente, getPrecioAlerta, formatPrecio, formatFecha, getDormitoriosLabel,
    estaCampoBloqueado, toggleBloqueo, desbloquearCampo, desbloquearTodos,
    sincronizarDesdeProyecto,

    // Computed
    esPreventa, precioInfo, precioM2, nombreEdificio, camposBloqueados,
  }
}
