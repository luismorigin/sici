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
  mascotas: 'si' | 'no' | null

  // Seccion 2: Tu busqueda
  quien_decide: 'solo_yo' | 'mi_pareja' | 'familia_opina' | null
  pareja_alineados: 'si' | 'mas_o_menos' | 'no' | null

  // Seccion 5: Configuracion de resultados
  cantidad_resultados: 3 | 5 | 10 | 'todas' | null

  // Seccion 3: Que buscas
  innegociables: string[]
  deseables: string[]

  // Seccion 3b: Extras (parqueo/baulera)
  necesita_parqueo: boolean
  necesita_baulera: boolean

  // Seccion 4: Trade-offs
  ubicacion_vs_metros: number // 1-5 (1=ubicacion, 5=metros) - legacy, no se usa en UI
  calidad_vs_precio: number // 1-5 (1=amenidades, 5=precio)
  amenidades_vs_metros: number // 1-5 (1=amenidades, 5=metros)
}

const INNEGOCIABLES = [
  { id: 'pet_friendly', label: 'Pet friendly' },
  { id: 'piscina', label: 'Piscina' },
  { id: 'gimnasio', label: 'Gimnasio' },
]

const DESEABLES = [
  { id: 'terraza_comun', label: 'Terraza común' },
  { id: 'sauna_jacuzzi', label: 'Sauna/Jacuzzi' },
  { id: 'cowork', label: 'Co-working' },
  { id: 'sum', label: 'Salón eventos' },
  { id: 'churrasquera', label: 'Churrasquera' },
  { id: 'area_ninos', label: 'Área niños' },
]

// Helper: Feedback dinámico para sliders
const getAmenidadesPrecioFeedback = (value: number): string => {
  if (value <= 2) return 'Priorizando edificios con más amenidades aunque cuesten más'
  if (value >= 4) return 'Priorizando mejor precio aunque tenga menos amenidades'
  return 'Balance entre amenidades y precio'
}

const getAmenidadesMetrosFeedback = (value: number): string => {
  if (value <= 2) return 'Priorizando edificios con más amenidades aunque el depto sea más chico'
  if (value >= 4) return 'Priorizando deptos más grandes aunque el edificio tenga menos amenidades'
  return 'Balance entre amenidades del edificio y tamaño del depto'
}

// Helper: Calcular progreso del formulario
const calcularProgreso = (form: FormularioVivienda): {
  completadas: number
  total: number
  seccion: string
  mensaje: string
} => {
  let completadas = 0
  const total = 2 // 2 secciones: Prioridades + Resultados

  // Sección 1: Prioridades (siempre "completada" aunque vacío)
  completadas++
  // Sección 2: Cantidad de resultados
  if (form.cantidad_resultados) completadas++

  const mensajes: Record<number, { seccion: string; mensaje: string }> = {
    0: { seccion: 'prioridades', mensaje: 'Identificando tus prioridades...' },
    1: { seccion: 'resultados', mensaje: 'Configurando resultados...' },
    2: { seccion: 'listo', mensaje: '¡Listo! Ya entendemos qué buscás' },
  }

  const idx = Math.min(completadas, 2)
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
    quien_decide: null,
    pareja_alineados: null,
    innegociables: [],
    deseables: [],
    necesita_parqueo: true,  // Default: sí necesita
    necesita_baulera: false, // Default: no necesita
    ubicacion_vs_metros: 3,  // Legacy, no se usa en UI
    calidad_vs_precio: 3,
    amenidades_vs_metros: 3,
    cantidad_resultados: null,
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
      quien_decide: urlQuienDecide,
      cantidad_resultados: urlCantidadResultados,
      pareja_alineados: urlParejaAlineados,
      ubicacion_vs_metros: urlUbicacionVsMetros,
      calidad_vs_precio: urlCalidadVsPrecio,
      amenidades_vs_metros: urlAmenidadesVsMetros,
      necesita_parqueo: urlNecesitaParqueo,
      necesita_baulera: urlNecesitaBaulera,
    } = router.query

    const newForm: FormularioVivienda = { ...form }
    let hasChanges = false

    if (urlQuienesViven && ['solo', 'pareja', 'familia', 'roommates'].includes(urlQuienesViven as string)) {
      newForm.quienes_viven = urlQuienesViven as FormularioVivienda['quienes_viven']
      hasChanges = true
    }

    if (urlMascotas && ['si', 'no'].includes(urlMascotas as string)) {
      newForm.mascotas = urlMascotas as FormularioVivienda['mascotas']
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

    if (urlAmenidadesVsMetros) {
      const parsed = parseInt(urlAmenidadesVsMetros as string)
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        newForm.amenidades_vs_metros = parsed
        hasChanges = true
      }
    }

    if (urlNecesitaParqueo !== undefined) {
      newForm.necesita_parqueo = urlNecesitaParqueo === 'true'
      hasChanges = true
    }

    if (urlNecesitaBaulera !== undefined) {
      newForm.necesita_baulera = urlNecesitaBaulera === 'true'
      hasChanges = true
    }

    if (urlCantidadResultados && ['3', '5', '10', 'todas'].includes(urlCantidadResultados as string)) {
      newForm.cantidad_resultados = urlCantidadResultados === 'todas'
        ? 'todas'
        : parseInt(urlCantidadResultados as string) as 3 | 5 | 10
      hasChanges = true
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
      quien_decide: form.quien_decide || '',
      cantidad_resultados: form.cantidad_resultados?.toString() || '',
      innegociables: form.innegociables.join(','),
      deseables: form.deseables.join(','),
      ubicacion_vs_metros: form.ubicacion_vs_metros.toString(),
      calidad_vs_precio: form.calidad_vs_precio.toString(),
      amenidades_vs_metros: form.amenidades_vs_metros.toString(),
      necesita_parqueo: form.necesita_parqueo.toString(),
      necesita_baulera: form.necesita_baulera.toString(),
    })

    router.push(`/resultados?${params.toString()}`)
  }

  const isFormValid = form.cantidad_resultados !== null

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
              <span className={progreso.seccion === 'prioridades' ? 'text-blue-600 font-medium' : ''}>Prioridades</span>
              <span className={progreso.seccion === 'resultados' || progreso.seccion === 'listo' ? 'text-blue-600 font-medium' : ''}>Resultados</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 space-y-8">
          {/* Seccion 1: Que buscas */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              TUS PRIORIDADES
            </h2>

            {/* 1. Innegociables */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                1. Sin esto NO me interesa <span className="text-gray-500 font-normal">(del edificio, máx 3)</span>
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

            {/* 2. Deseables */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                2. Sería un PLUS tener <span className="text-gray-500 font-normal">(del edificio)</span>
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

            {/* 3. Parqueo y Baulera - Para personalizar costos */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                3. Para calcular el precio real:
              </label>
              <p className="text-xs text-gray-500 mb-4">
                Esto no filtra resultados, solo personaliza qué costos te mostramos.
              </p>

              <div className="space-y-3">
                {/* Parqueo */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>🚗</span>
                    <span className="text-sm text-gray-700">¿Vas a necesitar estacionamiento?</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setForm(prev => ({ ...prev, necesita_parqueo: true }))}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        form.necesita_parqueo
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, necesita_parqueo: false }))}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        !form.necesita_parqueo
                          ? 'border-gray-500 bg-gray-100 text-gray-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {/* Baulera */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>📦</span>
                    <span className="text-sm text-gray-700">¿Vas a necesitar baulera?</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setForm(prev => ({ ...prev, necesita_baulera: true }))}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        form.necesita_baulera
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => setForm(prev => ({ ...prev, necesita_baulera: false }))}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        !form.necesita_baulera
                          ? 'border-gray-500 bg-gray-100 text-gray-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-400 mt-3 italic">
                Si no necesitás, no lo sumamos al "precio real de compra"
              </p>
            </div>
          </section>

          {/* Seccion 4: Trade-offs */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              CALIBRANDO TUS PREFERENCIAS
            </h2>

            {/* 4. Amenidades vs Precio */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                4. Amenidades vs Precio
              </label>
              <p className="text-xs text-gray-500 mb-3">
                ¿Preferís un edificio con más amenidades aunque cueste más, o mejor precio aunque tenga menos?
              </p>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-28">Más amenidades</span>
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
              <p className="text-xs text-blue-600 mt-2 text-center italic">
                {getAmenidadesPrecioFeedback(form.calidad_vs_precio)}
              </p>
            </div>

            {/* 5. Amenidades vs Metros */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                5. Amenidades vs Metros
              </label>
              <p className="text-xs text-gray-500 mb-3">
                ¿Preferís un edificio con más amenidades aunque el depto sea más chico, o un depto más grande aunque el edificio tenga menos?
              </p>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-28">Más amenidades</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form.amenidades_vs_metros}
                  onChange={e => setForm(prev => ({ ...prev, amenidades_vs_metros: parseInt(e.target.value) }))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm text-gray-600 w-28 text-right">Más metros</span>
              </div>
              <p className="text-xs text-blue-600 mt-2 text-center italic">
                {getAmenidadesMetrosFeedback(form.amenidades_vs_metros)}
              </p>
            </div>

            {/* 6. Cantidad de resultados - dinámico según count */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                6. ¿Cuántas opciones querés ver?
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Encontramos {filtrosNivel1.count} propiedades. Menos opciones = decisión más fácil.
              </p>
              <div className="flex flex-wrap gap-2">
                {/* Siempre mostrar opción de 3 */}
                <button
                  onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 3 }))}
                  className={`px-4 py-3 rounded-lg border transition-colors flex-1 min-w-[140px] ${
                    form.cantidad_resultados === 3
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="block font-medium">Las 3 mejores</span>
                  <span className="block text-xs text-gray-500 mt-1">Decisión enfocada</span>
                </button>

                {/* Mostrar opción de 5 si hay suficientes */}
                {filtrosNivel1.count >= 5 && (
                  <button
                    onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 5 }))}
                    className={`px-4 py-3 rounded-lg border transition-colors flex-1 min-w-[140px] ${
                      form.cantidad_resultados === 5
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="block font-medium">Las 5 mejores</span>
                    <span className="block text-xs text-gray-500 mt-1">Buen balance</span>
                  </button>
                )}

                {/* Mostrar opción de 10 si hay más de 10 */}
                {filtrosNivel1.count > 10 && (
                  <button
                    onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 10 }))}
                    className={`px-4 py-3 rounded-lg border transition-colors flex-1 min-w-[140px] ${
                      form.cantidad_resultados === 10
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="block font-medium">Top 10</span>
                    <span className="block text-xs text-gray-500 mt-1">Para comparar</span>
                  </button>
                )}

                {/* Siempre mostrar opción de ver todas */}
                <button
                  onClick={() => setForm(prev => ({ ...prev, cantidad_resultados: 'todas' }))}
                  className={`px-4 py-3 rounded-lg border transition-colors flex-1 min-w-[140px] ${
                    form.cantidad_resultados === 'todas'
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="block font-medium">Ver todas ({filtrosNivel1.count})</span>
                  <span className="block text-xs text-gray-500 mt-1">Modo exploración</span>
                </button>
              </div>
              {form.cantidad_resultados === 'todas' && filtrosNivel1.count > 10 && (
                <p className="text-xs text-amber-600 mt-2 italic">
                  💡 Más opciones puede hacer la decisión más difícil, pero vos mandás.
                </p>
              )}
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
                <p className="text-sm text-amber-800">
                  👆 Elegí cuántas opciones querés ver para continuar
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
