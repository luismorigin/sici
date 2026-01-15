import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import InternalHeader from '@/components/InternalHeader'

// Tipos
interface FiltrosNivel1 {
  presupuesto: number
  zonas: string[]
  dormitorios: number | null
  estado_entrega: string
  forma_pago: string
  count: number
}

interface FormularioVivienda {
  // Seccion 1: Contanos sobre vos
  quienes_viven: 'solo' | 'pareja' | 'familia' | 'roommates' | null
  hijos_cantidad: number | null
  hijos_edades: string
  mascotas: 'no' | 'perro' | 'gato' | 'otro' | null
  tamano_perro: 'chico' | 'mediano' | 'grande' | null

  // Seccion 2: Tu busqueda
  tiempo_buscando: 'recien_empiezo' | '1_6_meses' | '6_12_meses' | 'mas_1_ano' | null
  estado_emocional: 'motivado' | 'cansado' | 'frustrado' | 'presionado' | null
  quien_decide: 'solo_yo' | 'mi_pareja' | 'familia_opina' | null
  pareja_alineados: 'si' | 'mas_o_menos' | 'no' | null

  // Seccion 3: Que buscas
  innegociables: string[]
  deseables: string[]

  // Seccion 4: Trade-offs
  ubicacion_vs_metros: number // 1-5 (1=ubicacion, 5=metros)
  calidad_vs_precio: number // 1-5 (1=calidad, 5=precio)
}

const INNEGOCIABLES = [
  { id: 'seguridad_24h', label: 'Seguridad 24h' },
  { id: 'estacionamiento', label: 'Estacionamiento' },
  { id: 'pet_friendly', label: 'Pet friendly' },
  { id: 'ascensor', label: 'Ascensor' },
  { id: 'piscina', label: 'Piscina' },
  { id: 'gimnasio', label: 'Gimnasio' },
]

const DESEABLES = [
  { id: 'terraza_balcon', label: 'Terraza/Balcon' },
  { id: 'sauna_jacuzzi', label: 'Sauna/Jacuzzi' },
  { id: 'cowork', label: 'Co-working' },
  { id: 'sum', label: 'Salon eventos' },
  { id: 'churrasquera', label: 'Churrasquera' },
  { id: 'area_ninos', label: 'Area ninos' },
]

// Helper: Feedback dinámico para sliders
const getUbicacionFeedback = (value: number): string => {
  if (value <= 2) return 'Priorizando zona premium aunque sea más chico'
  if (value >= 4) return 'Priorizando más espacio aunque sea zona menos céntrica'
  return 'Balance - Consideraré ambas opciones por igual'
}

const getCalidadFeedback = (value: number): string => {
  if (value <= 2) return 'Buscando mejor calidad aunque cueste más'
  if (value >= 4) return 'Buscando mejor precio aunque sea más básico'
  return 'Balance - Consideraré ambas opciones por igual'
}

// Helper: Calcular progreso del formulario
const calcularProgreso = (form: FormularioVivienda): {
  completadas: number
  total: number
  seccion: string
  mensaje: string
} => {
  let completadas = 0
  const total = 4 // 4 secciones

  // Sección 1: Sobre vos
  if (form.quienes_viven && form.mascotas !== null) completadas++
  // Sección 2: Tu búsqueda
  if (form.tiempo_buscando && form.quien_decide) completadas++
  // Sección 3: Qué buscas (siempre "completada" aunque vacío)
  completadas++
  // Sección 4: Trade-offs (siempre tiene valores default)
  completadas++

  const mensajes: Record<number, { seccion: string; mensaje: string }> = {
    0: { seccion: 'perfil', mensaje: 'Conociendo a quienes vivirán...' },
    1: { seccion: 'busqueda', mensaje: 'Entendiendo tu contexto de búsqueda...' },
    2: { seccion: 'prioridades', mensaje: 'Identificando tus prioridades...' },
    3: { seccion: 'balance', mensaje: 'Calibrando tus preferencias...' },
    4: { seccion: 'listo', mensaje: '¡Listo! Ya entendemos qué buscás' },
  }

  const idx = Math.min(completadas, 4)
  return { completadas, total, ...mensajes[idx] }
}

export default function FormularioViviendaPage() {
  const router = useRouter()
  const { presupuesto, zonas, dormitorios, estado_entrega, forma_pago, count } = router.query

  // Parsear filtros Nivel 1
  const filtrosNivel1: FiltrosNivel1 = {
    presupuesto: parseInt(presupuesto as string) || 150000,
    zonas: (zonas as string)?.split(',').filter(Boolean) || [],
    dormitorios: dormitorios ? parseInt(dormitorios as string) : null,
    estado_entrega: (estado_entrega as string) || 'no_importa',
    forma_pago: (forma_pago as string) || 'no_se',
    count: parseInt(count as string) || 0,
  }

  const [form, setForm] = useState<FormularioVivienda>({
    quienes_viven: null,
    hijos_cantidad: null,
    hijos_edades: '',
    mascotas: null,
    tamano_perro: null,
    tiempo_buscando: null,
    estado_emocional: null,
    quien_decide: null,
    pareja_alineados: null,
    innegociables: [],
    deseables: [],
    ubicacion_vs_metros: 3,
    calidad_vs_precio: 3,
  })

  const [submitting, setSubmitting] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Restaurar valores nivel 2 desde URL (para "Editar búsqueda")
  useEffect(() => {
    if (!router.isReady || initialized) return

    const {
      innegociables: urlInnegociables,
      deseables: urlDeseables,
      quienes_viven: urlQuienesViven,
      mascotas: urlMascotas,
      tamano_perro: urlTamanoPerro,
      tiempo_buscando: urlTiempoBuscando,
      estado_emocional: urlEstadoEmocional,
      quien_decide: urlQuienDecide,
      pareja_alineados: urlParejaAlineados,
      ubicacion_vs_metros: urlUbicacionVsMetros,
      calidad_vs_precio: urlCalidadVsPrecio,
    } = router.query

    const newForm: FormularioVivienda = { ...form }
    let hasChanges = false

    if (urlQuienesViven && ['solo', 'pareja', 'familia', 'roommates'].includes(urlQuienesViven as string)) {
      newForm.quienes_viven = urlQuienesViven as FormularioVivienda['quienes_viven']
      hasChanges = true
    }

    if (urlMascotas && ['no', 'perro', 'gato', 'otro'].includes(urlMascotas as string)) {
      newForm.mascotas = urlMascotas as FormularioVivienda['mascotas']
      hasChanges = true
    }

    if (urlTamanoPerro && ['chico', 'mediano', 'grande'].includes(urlTamanoPerro as string)) {
      newForm.tamano_perro = urlTamanoPerro as FormularioVivienda['tamano_perro']
      hasChanges = true
    }

    if (urlTiempoBuscando && ['recien_empiezo', '1_6_meses', '6_12_meses', 'mas_1_ano'].includes(urlTiempoBuscando as string)) {
      newForm.tiempo_buscando = urlTiempoBuscando as FormularioVivienda['tiempo_buscando']
      hasChanges = true
    }

    if (urlEstadoEmocional && ['motivado', 'cansado', 'frustrado', 'presionado'].includes(urlEstadoEmocional as string)) {
      newForm.estado_emocional = urlEstadoEmocional as FormularioVivienda['estado_emocional']
      hasChanges = true
    }

    if (urlQuienDecide && ['solo_yo', 'mi_pareja', 'familia_opina'].includes(urlQuienDecide as string)) {
      newForm.quien_decide = urlQuienDecide as FormularioVivienda['quien_decide']
      hasChanges = true
    }

    if (urlParejaAlineados && ['si', 'mas_o_menos', 'no'].includes(urlParejaAlineados as string)) {
      newForm.pareja_alineados = urlParejaAlineados as FormularioVivienda['pareja_alineados']
      hasChanges = true
    }

    if (urlInnegociables && (urlInnegociables as string).length > 0) {
      newForm.innegociables = (urlInnegociables as string).split(',').filter(Boolean)
      hasChanges = true
    }

    if (urlDeseables && (urlDeseables as string).length > 0) {
      newForm.deseables = (urlDeseables as string).split(',').filter(Boolean)
      hasChanges = true
    }

    if (urlUbicacionVsMetros) {
      const parsed = parseInt(urlUbicacionVsMetros as string)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        newForm.ubicacion_vs_metros = parsed
        hasChanges = true
      }
    }

    if (urlCalidadVsPrecio) {
      const parsed = parseInt(urlCalidadVsPrecio as string)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        newForm.calidad_vs_precio = parsed
        hasChanges = true
      }
    }

    if (hasChanges) {
      setForm(newForm)
    }

    setInitialized(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, initialized])

  const handleInnegociable = (id: string) => {
    setForm(prev => {
      if (prev.innegociables.includes(id)) {
        return { ...prev, innegociables: prev.innegociables.filter(i => i !== id) }
      }
      if (prev.innegociables.length >= 3) return prev // Max 3
      return { ...prev, innegociables: [...prev.innegociables, id] }
    })
  }

  const handleDeseable = (id: string) => {
    setForm(prev => {
      if (prev.deseables.includes(id)) {
        return { ...prev, deseables: prev.deseables.filter(i => i !== id) }
      }
      return { ...prev, deseables: [...prev.deseables, id] }
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)

    // Combinar Nivel 1 + Nivel 2 para pasar a resultados
    const params = new URLSearchParams({
      ...Object.fromEntries(
        Object.entries(filtrosNivel1).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])
      ),
      quienes_viven: form.quienes_viven || '',
      mascotas: form.mascotas || '',
      tamano_perro: form.tamano_perro || '',
      tiempo_buscando: form.tiempo_buscando || '',
      estado_emocional: form.estado_emocional || '',
      quien_decide: form.quien_decide || '',
      innegociables: form.innegociables.join(','),
      deseables: form.deseables.join(','),
      ubicacion_vs_metros: form.ubicacion_vs_metros.toString(),
      calidad_vs_precio: form.calidad_vs_precio.toString(),
    })

    router.push(`/resultados?${params.toString()}`)
  }

  const isFormValid = form.quienes_viven && form.tiempo_buscando && form.quien_decide

  // P2: Progress bar dinámico
  const progreso = calcularProgreso(form)

  return (
    <div className="min-h-screen bg-gray-50">
      <InternalHeader backLink={{ href: '/filtros', label: '← Volver a filtros' }} />
      <div className="max-w-2xl mx-auto px-4 pb-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            Contanos mas sobre tu busqueda
          </h1>
          <p className="text-gray-600 mt-1">
            Basado en {filtrosNivel1.count} propiedades que cumplen tus criterios
          </p>

          {/* P4: Badge de confianza */}
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
            <span className="text-slate-400">🔒</span>
            <span className="text-sm text-slate-600">
              Tus datos están protegidos. No compartimos tu información con terceros.
            </span>
          </div>

          {/* P2: Progress bar con texto dinámico */}
          <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{progreso.mensaje}</span>
              <span className="text-xs text-gray-500">{progreso.completadas}/{progreso.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(progreso.completadas / progreso.total) * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span className={progreso.seccion === 'perfil' ? 'text-blue-600 font-medium' : ''}>Perfil</span>
              <span className={progreso.seccion === 'busqueda' ? 'text-blue-600 font-medium' : ''}>Búsqueda</span>
              <span className={progreso.seccion === 'prioridades' ? 'text-blue-600 font-medium' : ''}>Prioridades</span>
              <span className={progreso.seccion === 'balance' ? 'text-blue-600 font-medium' : ''}>Balance</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 space-y-8">
          {/* Seccion 1: Contanos sobre vos */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              CONOCIENDO A QUIENES VIVIRÁN
            </h2>

            {/* 1. Quienes van a vivir */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                1. ¿Quiénes van a vivir?
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Esto nos ayuda a calcular el espacio real que necesitás
              </p>
              <div className="flex flex-wrap gap-2">
                {(['solo', 'pareja', 'familia', 'roommates'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setForm(prev => ({ ...prev, quienes_viven: opt }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.quienes_viven === opt
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>

              {/* Condicional: Familia */}
              {form.quienes_viven === 'familia' && (
                <div className="mt-3 pl-4 border-l-2 border-blue-200">
                  <label className="block text-sm text-gray-600 mb-2">Hijos?</label>
                  <div className="flex gap-2 mb-2">
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => setForm(prev => ({ ...prev, hijos_cantidad: n }))}
                        className={`px-4 py-2 rounded-lg border ${
                          form.hijos_cantidad === n
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200'
                        }`}
                      >
                        {n === 3 ? '3+' : n}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Edades (ej: 5, 12)"
                    value={form.hijos_edades}
                    onChange={e => setForm(prev => ({ ...prev, hijos_edades: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>

            {/* 2. Mascotas */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                2. ¿Tenés mascotas?
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Muchos edificios no son pet-friendly. Así evitamos mostrarte opciones incompatibles.
              </p>
              <div className="flex flex-wrap gap-2">
                {(['no', 'perro', 'gato', 'otro'] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setForm(prev => ({ ...prev, mascotas: opt }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.mascotas === opt
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt === 'no' ? 'No' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </button>
                ))}
              </div>

              {/* Condicional: Perro */}
              {form.mascotas === 'perro' && (
                <div className="mt-3 pl-4 border-l-2 border-blue-200">
                  <label className="block text-sm text-gray-600 mb-2">Tamano?</label>
                  <div className="flex gap-2">
                    {(['chico', 'mediano', 'grande'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setForm(prev => ({ ...prev, tamano_perro: t }))}
                        className={`px-4 py-2 rounded-lg border ${
                          form.tamano_perro === t
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200'
                        }`}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Seccion 2: Tu busqueda */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              TU CONTEXTO DE BÚSQUEDA
            </h2>

            {/* 3. Tiempo buscando */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                3. ¿Hace cuánto buscás?
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Si llevás mucho tiempo, podemos priorizar opciones que otros pasaron por alto.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'recien_empiezo', label: 'Recien empiezo' },
                  { value: '1_6_meses', label: '1-6 meses' },
                  { value: '6_12_meses', label: '6-12 meses' },
                  { value: 'mas_1_ano', label: '+1 ano' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, tiempo_buscando: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.tiempo_buscando === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Estado emocional */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                4. ¿Cómo te sentís con la búsqueda?
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Si estás cansado o presionado, te mostraremos menos opciones para no abrumarte.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'motivado', label: 'Motivado' },
                  { value: 'cansado', label: 'Cansado' },
                  { value: 'frustrado', label: 'Frustrado' },
                  { value: 'presionado', label: 'Presionado' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, estado_emocional: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.estado_emocional === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Quien decide */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                5. ¿Quién más decide?
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Si decide otro también, preparamos información fácil de compartir.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'solo_yo', label: 'Solo yo' },
                  { value: 'mi_pareja', label: 'Mi pareja' },
                  { value: 'familia_opina', label: 'Familia opina' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, quien_decide: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.quien_decide === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Condicional: Pareja */}
              {form.quien_decide === 'mi_pareja' && (
                <div className="mt-3 pl-4 border-l-2 border-blue-200">
                  <label className="block text-sm text-gray-600 mb-2">Estan alineados?</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'si', label: 'Si' },
                      { value: 'mas_o_menos', label: 'Mas o menos' },
                      { value: 'no', label: 'No' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setForm(prev => ({ ...prev, pareja_alineados: opt.value as any }))}
                        className={`px-4 py-2 rounded-lg border ${
                          form.pareja_alineados === opt.value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Seccion 3: Que buscas */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              TUS PRIORIDADES
            </h2>

            {/* 6. Innegociables */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                6. Sin esto NO me interesa (máx 3):
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Las opciones sin estos requisitos quedan al fondo del ranking, pero no desaparecen por si querés revisar.
              </p>
              <div className="flex flex-wrap gap-2">
                {INNEGOCIABLES.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleInnegociable(item.id)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.innegociables.includes(item.id)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {form.innegociables.length}/3 seleccionados
                {form.innegociables.length === 0 && ' — Si no elegís ninguno, consideramos todas las opciones'}
              </p>
            </div>

            {/* 7. Deseables */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                7. Sería un PLUS tener:
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Esto suma puntos en el ranking pero no descarta opciones. Si no encontramos con todo, igual te mostramos buenas alternativas.
              </p>
              <div className="flex flex-wrap gap-2">
                {DESEABLES.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleDeseable(item.id)}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.deseables.includes(item.id)
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Seccion 4: Trade-offs */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              CALIBRANDO TUS PREFERENCIAS
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Estos sliders ajustan cómo ordenamos tus opciones. No hay respuesta correcta, solo tu preferencia.
            </p>

            {/* 8. Ubicacion vs Metros */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                8. Si tuvieras que elegir:
              </label>
              <p className="text-xs text-gray-500 mb-3">
                ← Zona premium aunque sea más chico | Más espacio aunque sea menos céntrico →
              </p>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-28">Mejor ubicación</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form.ubicacion_vs_metros}
                  onChange={e => setForm(prev => ({ ...prev, ubicacion_vs_metros: parseInt(e.target.value) }))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm text-gray-600 w-28 text-right">Más metros</span>
              </div>
              {/* P3: Feedback visual del slider */}
              <p className="text-xs text-blue-600 mt-2 text-center italic">
                {getUbicacionFeedback(form.ubicacion_vs_metros)}
              </p>
            </div>

            {/* 9. Calidad vs Precio */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                9. Y entre:
              </label>
              <p className="text-xs text-gray-500 mb-3">
                ← Mejores terminaciones aunque cueste más | Ahorro aunque sea más básico →
              </p>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-28">Mejor calidad</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form.calidad_vs_precio}
                  onChange={e => setForm(prev => ({ ...prev, calidad_vs_precio: parseInt(e.target.value) }))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm text-gray-600 w-28 text-right">Mejor precio</span>
              </div>
              {/* P3: Feedback visual del slider */}
              <p className="text-xs text-blue-600 mt-2 text-center italic">
                {getCalidadFeedback(form.calidad_vs_precio)}
              </p>
            </div>
          </section>

          {/* P5: CTA con valor comunicado */}
          <div className="border-t pt-6">
            {/* Valor que entrega Simón */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-100">
              <p className="text-sm font-medium text-gray-800 mb-2">
                De {filtrosNivel1.count} opciones, Simón va a:
              </p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Ordenar por compatibilidad con tu perfil
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Detectar oportunidades de precio vs mercado
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Alertar sobre posibles riesgos o datos incompletos
                </li>
              </ul>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!isFormValid || submitting}
              className="w-full py-4 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Analizando opciones...' : 'ENCONTRAR MIS MEJORES OPCIONES'}
            </button>

            {/* Validación educativa (no regaño) */}
            {!isFormValid && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800 font-medium mb-1">Nos falta saber:</p>
                <ul className="text-xs text-amber-700 space-y-1">
                  {!form.quienes_viven && (
                    <li>• Quiénes van a vivir — para calcular espacio necesario</li>
                  )}
                  {!form.tiempo_buscando && (
                    <li>• Hace cuánto buscás — para ajustar recomendaciones</li>
                  )}
                  {!form.quien_decide && (
                    <li>• Quién más decide — para preparar info compartible</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
