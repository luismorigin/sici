import { useState } from 'react'
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
  precio_usd: string
  tipo_cambio: 'paralelo' | 'oficial'
  area_m2: string
  dormitorios: string
  banos: string
  estado_construccion: 'entrega_inmediata' | 'construccion' | 'preventa' | 'planos'
  fecha_entrega: string
  plan_pagos: string
  descripcion: string
  // Parqueo
  parqueo_incluido: boolean | null  // null = no tiene
  cantidad_parqueos: string
  parqueo_precio_adicional: string
  // Baulera
  baulera_incluida: boolean | null  // null = no tiene
  baulera_precio_adicional: string
  // Forma de pago
  precio_negociable: boolean
  acepta_permuta: boolean
  descuento_contado_pct: string
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

  // Mapeo directo
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

  // Buscar coincidencia directa
  if (mapeo[zonaNormalizada]) {
    return mapeo[zonaNormalizada]
  }

  // Buscar coincidencia parcial
  for (const [key, value] of Object.entries(mapeo)) {
    if (zonaNormalizada.includes(key) || key.includes(zonaNormalizada)) {
      return value
    }
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

export default function NuevaPropiedad() {
  const router = useRouter()
  const { broker, isImpersonating, exitImpersonation } = useBrokerAuth(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)

  const [formData, setFormData] = useState<FormData>({
    proyecto_nombre: '',
    desarrollador: '',
    zona: '',
    direccion: '',
    piso: '',
    precio_usd: '',
    tipo_cambio: 'paralelo',
    area_m2: '',
    dormitorios: '2',
    banos: '2',
    estado_construccion: 'entrega_inmediata',
    fecha_entrega: '',
    plan_pagos: '',
    descripcion: '',
    // Parqueo
    parqueo_incluido: true,
    cantidad_parqueos: '1',
    parqueo_precio_adicional: '',
    // Baulera
    baulera_incluida: null,  // null = no especificado aún
    baulera_precio_adicional: '',
    // Forma de pago
    precio_negociable: false,
    acepta_permuta: false,
    descuento_contado_pct: '',
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

  const [nuevoAmenidad, setNuevoAmenidad] = useState('')
  const [nuevoEquipamiento, setNuevoEquipamiento] = useState('')

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

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleAmenidad = (amenidad: string) => {
    setFormData(prev => ({
      ...prev,
      amenidades: prev.amenidades.includes(amenidad)
        ? prev.amenidades.filter(a => a !== amenidad)
        : [...prev.amenidades, amenidad]
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

  const handleSubmit = async () => {
    if (!supabase || !broker) return

    setLoading(true)
    setError(null)

    try {
      // Generar código único (requiere prefijo 'SIM')
      const { data: codigoData, error: codigoError } = await supabase
        .rpc('generar_codigo_unico', { prefijo: 'SIM' })

      if (codigoError) {
        console.error('Error generando código:', codigoError)
        throw new Error('Error generando código: ' + codigoError.message)
      }

      const codigo = codigoData as string

      // Obtener TC actual para guardar referencia
      const tcActuales = await obtenerTCActuales()
      const precioUsd = parseFloat(formData.precio_usd)
      const esParalelo = formData.tipo_cambio === 'paralelo'
      const tcUsado = esParalelo ? tcActuales.paralelo : tcActuales.oficial

      // Crear propiedad
      const { data, error: insertError } = await supabase
        .from('propiedades_broker')
        .insert({
          broker_id: broker.id,
          codigo,
          proyecto_nombre: formData.proyecto_nombre,
          desarrollador: formData.desarrollador || null,
          zona: convertirZona(formData.zona) || formData.zona,
          direccion: formData.direccion || null,
          piso: formData.piso ? parseInt(formData.piso) : null,
          // Vinculación a proyecto master (herencia de datos)
          id_proyecto_master: formData.id_proyecto_master,
          latitud: formData.latitud,
          longitud: formData.longitud,
          precio_usd: precioUsd,
          precio_usd_original: precioUsd,
          tipo_cambio: formData.tipo_cambio,
          tipo_cambio_usado: tcUsado,
          depende_de_tc: esParalelo,
          area_m2: parseFloat(formData.area_m2),
          dormitorios: parseInt(formData.dormitorios),
          banos: parseFloat(formData.banos),
          estado_construccion: formData.estado_construccion,
          // Convertir "2026-03" a "2026-03-01" para formato date
          fecha_entrega: formData.fecha_entrega ? `${formData.fecha_entrega}-01` : null,
          plan_pagos: formData.plan_pagos || null,
          descripcion: formData.descripcion || null,
          // Parqueo
          parqueo_incluido: formData.parqueo_incluido,
          cantidad_parqueos: formData.parqueo_incluido === true ? parseInt(formData.cantidad_parqueos) : 0,
          precio_parqueo_extra: formData.parqueo_incluido === false && formData.parqueo_precio_adicional
            ? parseFloat(formData.parqueo_precio_adicional)
            : null,
          // Baulera
          baulera_incluida: formData.baulera_incluida,
          precio_baulera_extra: formData.baulera_incluida === false && formData.baulera_precio_adicional
            ? parseFloat(formData.baulera_precio_adicional)
            : null,
          // Forma de pago
          precio_negociable: formData.precio_negociable,
          acepta_permuta: formData.acepta_permuta,
          // solo_tc_paralelo se infiere del campo tipo_cambio si es 'paralelo'
          descuento_contado: formData.descuento_contado_pct
            ? parseFloat(formData.descuento_contado_pct)
            : null,
          // Otros
          expensas_usd: formData.expensas_usd ? parseFloat(formData.expensas_usd) : null,
          amenidades: {
            lista: [...formData.amenidades, ...formData.amenidades_custom],
            equipamiento: [...formData.equipamiento, ...formData.equipamiento_custom],
            estado_amenities: [...formData.amenidades, ...formData.amenidades_custom].reduce((acc, a) => ({
              ...acc,
              [a]: {
                valor: true,
                fuente: formData.amenidades_custom.includes(a) ? 'broker_custom' : 'broker',
                confianza: 'alta'
              }
            }), {}),
            estado_equipamiento: [...formData.equipamiento, ...formData.equipamiento_custom].reduce((acc, e) => ({
              ...acc,
              [e]: {
                valor: true,
                fuente: formData.equipamiento_custom.includes(e) ? 'broker_custom' : 'broker',
                confianza: 'alta'
              }
            }), {})
          },
          estado: 'borrador',
          cantidad_fotos: 0,
          score_calidad: 0
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(insertError.message)
      }

      // Redirigir a subir fotos
      router.push(`/broker/fotos/${data.id}`)

    } catch (err: any) {
      setError(err.message || 'Error al crear propiedad')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Nueva Propiedad | Simón Broker</title>
      </Head>

      <BrokerLayout title="Nueva Propiedad">
        {/* Admin Impersonation Banner */}
        {isImpersonating && broker && (
          <div className="mb-6 p-4 rounded-xl bg-purple-600 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👁️</span>
                <div>
                  <h3 className="font-semibold">Modo Administrador</h3>
                  <p className="text-sm text-purple-200">
                    Creando propiedad como: <strong>{broker.nombre}</strong>
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

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {s}
                </div>
                {s < 3 && (
                  <div className={`w-16 h-1 mx-2 ${
                    step > s ? 'bg-amber-500' : 'bg-slate-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-2 text-sm text-slate-500">
            <span className={step === 1 ? 'text-amber-600 font-medium' : ''}>Información</span>
            <span className="mx-8" />
            <span className={step === 2 ? 'text-amber-600 font-medium' : ''}>Detalles</span>
            <span className="mx-8" />
            <span className={step === 3 ? 'text-amber-600 font-medium' : ''}>Amenidades</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm p-6 md:p-8">
            {/* Step 1: Información Básica */}
            {step === 1 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Información Básica</h2>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nombre del Proyecto *
                  </label>
                  <ProyectoAutocomplete
                    value={formData.proyecto_nombre}
                    linkedProjectId={formData.id_proyecto_master}
                    placeholder="Buscar proyecto... Ej: Vienna, Santorini"
                    onSelect={(proyecto: ProyectoSugerencia) => {
                      // Heredar datos del proyecto
                      setFormData(prev => ({
                        ...prev,
                        proyecto_nombre: proyecto.nombre_oficial,
                        id_proyecto_master: proyecto.id_proyecto_master,
                        desarrollador: proyecto.desarrollador || prev.desarrollador,
                        // Mapear zona del proyecto a nuestro formato
                        zona: proyecto.zona ? mapearZonaDesdeProyecto(proyecto.zona) || prev.zona : prev.zona,
                        estado_construccion: (proyecto.estado_construccion as any) || prev.estado_construccion,
                        fecha_entrega: proyecto.fecha_entrega_estimada
                          ? proyecto.fecha_entrega_estimada.substring(0, 7) // YYYY-MM
                          : prev.fecha_entrega,
                        latitud: proyecto.latitud,
                        longitud: proyecto.longitud,
                        amenidades_heredadas: proyecto.amenidades_edificio || [],
                        // Auto-seleccionar amenidades heredadas
                        amenidades: [
                          ...prev.amenidades.filter(a => !proyecto.amenidades_edificio?.includes(a)),
                          ...(proyecto.amenidades_edificio || []).filter(a =>
                            AMENIDADES_OPCIONES.includes(a)
                          )
                        ]
                      }))
                    }}
                    onManualEntry={(nombre: string) => {
                      // Sin vincular a proyecto
                      setFormData(prev => ({
                        ...prev,
                        proyecto_nombre: nombre,
                        id_proyecto_master: null,
                        latitud: null,
                        longitud: null,
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
                    placeholder="Ej: Grupo Jenecheru"
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
                        <p className="text-sm font-medium text-green-800">
                          Proyecto vinculado - Datos heredados
                        </p>
                        <p className="text-xs text-green-700 mt-1">
                          Se pre-llenaron: desarrollador{formData.zona && ', zona'}, estado de construcción
                          {formData.latitud && ', ubicación GPS'}
                          {formData.amenidades_heredadas.length > 0 && `, ${formData.amenidades_heredadas.length} amenidades del edificio`}
                        </p>
                        <p className="text-xs text-green-600 mt-1">
                          Puedes modificar estos datos si tu unidad difiere del edificio.
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
                      required
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
                      placeholder="Ej: Av. San Martín 1234"
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

                {/* Fecha de entrega - solo si NO es entrega inmediata */}
                {formData.estado_construccion !== 'entrega_inmediata' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fecha estimada de entrega *
                    </label>
                    <input
                      type="month"
                      value={formData.fecha_entrega}
                      onChange={(e) => updateField('fecha_entrega', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Selecciona el mes y año de entrega estimado
                    </p>
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    disabled={!formData.proyecto_nombre || !formData.zona}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Detalles */}
            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Detalles de la Propiedad</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Precio USD *
                    </label>
                    <input
                      type="number"
                      value={formData.precio_usd}
                      onChange={(e) => updateField('precio_usd', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="120000"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tipo de cambio *
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => updateField('tipo_cambio', 'paralelo')}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                          formData.tipo_cambio === 'paralelo'
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-300 text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        Paralelo
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('tipo_cambio', 'oficial')}
                        className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                          formData.tipo_cambio === 'oficial'
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-300 text-slate-600 hover:border-slate-400'
                        }`}
                      >
                        Oficial
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Área m² *
                    </label>
                    <input
                      type="number"
                      value={formData.area_m2}
                      onChange={(e) => updateField('area_m2', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="85"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Expensas (USD/mes)
                    </label>
                    <input
                      type="number"
                      value={formData.expensas_usd}
                      onChange={(e) => updateField('expensas_usd', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      placeholder="85"
                    />
                  </div>
                </div>

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

                {/* Sección Parqueo */}
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <span>🚗</span> Parqueo
                  </h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="parqueo"
                        checked={formData.parqueo_incluido === true}
                        onChange={() => {
                          updateField('parqueo_incluido', true)
                          updateField('parqueo_precio_adicional', '')
                        }}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-700">Incluido en precio</span>
                      {formData.parqueo_incluido === true && (
                        <select
                          value={formData.cantidad_parqueos}
                          onChange={(e) => updateField('cantidad_parqueos', e.target.value)}
                          className="w-20 px-2 py-1 border border-slate-300 rounded text-sm ml-2"
                        >
                          {[1, 2, 3, 4].map(n => (
                            <option key={n} value={n}>{n} parqueo{n > 1 ? 's' : ''}</option>
                          ))}
                        </select>
                      )}
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="parqueo"
                        checked={formData.parqueo_incluido === false}
                        onChange={() => updateField('parqueo_incluido', false)}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-700">Precio adicional</span>
                      {formData.parqueo_incluido === false && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-slate-500">$</span>
                          <input
                            type="number"
                            value={formData.parqueo_precio_adicional}
                            onChange={(e) => updateField('parqueo_precio_adicional', e.target.value)}
                            className="w-24 px-3 py-1 border border-slate-300 rounded text-sm"
                            placeholder="15000"
                          />
                          <span className="text-xs text-slate-500">por parqueo</span>
                        </div>
                      )}
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="parqueo"
                        checked={formData.parqueo_incluido === null}
                        onChange={() => {
                          updateField('parqueo_incluido', null)
                          updateField('parqueo_precio_adicional', '')
                          updateField('cantidad_parqueos', '0')
                        }}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-500">No tiene parqueo</span>
                    </label>
                  </div>
                </div>

                {/* Sección Baulera */}
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <span>📦</span> Baulera
                  </h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="baulera"
                        checked={formData.baulera_incluida === true}
                        onChange={() => {
                          updateField('baulera_incluida', true)
                          updateField('baulera_precio_adicional', '')
                        }}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-700">Incluida en precio</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="baulera"
                        checked={formData.baulera_incluida === false}
                        onChange={() => updateField('baulera_incluida', false)}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-700">Precio adicional</span>
                      {formData.baulera_incluida === false && (
                        <div className="flex items-center gap-2 ml-2">
                          <span className="text-slate-500">$</span>
                          <input
                            type="number"
                            value={formData.baulera_precio_adicional}
                            onChange={(e) => updateField('baulera_precio_adicional', e.target.value)}
                            className="w-24 px-3 py-1 border border-slate-300 rounded text-sm"
                            placeholder="3000"
                          />
                        </div>
                      )}
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="baulera"
                        checked={formData.baulera_incluida === null}
                        onChange={() => {
                          updateField('baulera_incluida', null)
                          updateField('baulera_precio_adicional', '')
                        }}
                        className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-500">No tiene baulera</span>
                    </label>
                  </div>
                </div>

                {/* Sección Forma de Pago */}
                <div className="border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <span>💳</span> Forma de Pago
                  </h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.precio_negociable}
                        onChange={(e) => updateField('precio_negociable', e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-700">Precio negociable</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.acepta_permuta}
                        onChange={(e) => updateField('acepta_permuta', e.target.checked)}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                      />
                      <span className="text-sm text-slate-700">Acepta permuta</span>
                      <span className="text-xs text-slate-400">(vehículo, otro inmueble)</span>
                    </label>
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-sm text-slate-700">Descuento por pago al contado:</span>
                      <input
                        type="number"
                        value={formData.descuento_contado_pct}
                        onChange={(e) => updateField('descuento_contado_pct', e.target.value)}
                        className="w-20 px-3 py-1 border border-slate-300 rounded text-sm"
                        placeholder="5"
                        min="0"
                        max="30"
                      />
                      <span className="text-slate-500">%</span>
                    </div>
                  </div>
                </div>

                {/* Plan de pagos - solo si NO es entrega inmediata */}
                {formData.estado_construccion !== 'entrega_inmediata' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Plan de Pagos
                    </label>
                    <textarea
                      value={formData.plan_pagos}
                      onChange={(e) => updateField('plan_pagos', e.target.value)}
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                      placeholder="Ej: 30% reserva, 40% durante construcción, 30% contra entrega"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Describe las condiciones de pago si aplica
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={formData.descripcion}
                    onChange={(e) => updateField('descripcion', e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
                    placeholder="Describe la propiedad, sus características especiales..."
                  />
                </div>

                <div className="pt-4 flex justify-between">
                  <button
                    onClick={() => setStep(1)}
                    className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!formData.precio_usd || !formData.area_m2}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Amenidades */}
            {step === 3 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Amenidades del Edificio</h2>

                {formData.amenidades_heredadas.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-green-700">
                      <span className="font-medium">{formData.amenidades_heredadas.length} amenidades heredadas</span> del proyecto {formData.proyecto_nombre}
                    </p>
                  </div>
                )}

                <p className="text-sm text-slate-500 mb-4">
                  Selecciona las amenidades que tiene el edificio/condominio
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {AMENIDADES_OPCIONES.map((amenidad) => {
                    const isSelected = formData.amenidades.includes(amenidad)
                    const isHeredado = formData.amenidades_heredadas.includes(amenidad)

                    return (
                      <button
                        key={amenidad}
                        type="button"
                        onClick={() => toggleAmenidad(amenidad)}
                        className={`px-4 py-3 rounded-lg border-2 text-left transition-colors relative ${
                          isSelected
                            ? isHeredado
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <span className="text-sm font-medium">{amenidad}</span>
                        {isSelected && isHeredado && (
                          <span className="absolute top-1 right-1 text-xs text-green-600"></span>
                        )}
                      </button>
                    )
                  })}
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
                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    value={nuevoAmenidad}
                    onChange={(e) => setNuevoAmenidad(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), agregarAmenidadCustom())}
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

                {/* Separador */}
                <div className="border-t border-slate-200 pt-6">
                  <h2 className="text-lg font-semibold text-slate-900 mb-4">Equipamiento del Departamento</h2>

                  <p className="text-sm text-slate-500 mb-4">
                    Selecciona qué incluye el departamento
                  </p>

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

                {error && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                <div className="pt-4 flex justify-between">
                  <button
                    onClick={() => setStep(2)}
                    className="text-slate-600 hover:text-slate-900 font-medium px-6 py-3"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Guardando...' : 'Guardar y Subir Fotos →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </BrokerLayout>
    </>
  )
}
