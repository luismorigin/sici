import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

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
  { id: 'balcon', label: 'Balcon' },
  { id: 'vista', label: 'Vista' },
  { id: 'terraza', label: 'Terraza' },
  { id: 'lavanderia', label: 'Lavanderia' },
  { id: 'cowork', label: 'Cowork' },
  { id: 'sum', label: 'SUM' },
  { id: 'parrillero', label: 'Parrillero' },
  { id: 'area_ninos', label: 'Area ninos' },
]

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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <Link href="/filtros" className="text-blue-600 hover:underline text-sm">
            ← Volver a filtros
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            Contanos mas sobre tu busqueda
          </h1>
          <p className="text-gray-600 mt-1">
            Basado en {filtrosNivel1.count} propiedades que cumplen tus criterios
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 space-y-8">
          {/* Seccion 1: Contanos sobre vos */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
              CONTANOS SOBRE VOS
            </h2>

            {/* 1. Quienes van a vivir */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                1. Quienes van a vivir?
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2. Mascotas?
              </label>
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
              TU BUSQUEDA
            </h2>

            {/* 3. Tiempo buscando */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                3. Hace cuanto buscas?
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                4. Como te sentis con la busqueda?
              </label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                5. Quien mas decide?
              </label>
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
              QUE BUSCAS
            </h2>

            {/* 6. Innegociables */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                6. Sin esto NO me interesa (max 3):
              </label>
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
              <p className="text-xs text-gray-500 mt-1">
                {form.innegociables.length}/3 seleccionados
              </p>
            </div>

            {/* 7. Deseables */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                7. Seria un PLUS tener:
              </label>
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
              TRADE-OFFS
            </h2>

            {/* 8. Ubicacion vs Metros */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                8. Si tuvieras que elegir:
              </label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600 w-28">Mejor ubicacion</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={form.ubicacion_vs_metros}
                  onChange={e => setForm(prev => ({ ...prev, ubicacion_vs_metros: parseInt(e.target.value) }))}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <span className="text-sm text-gray-600 w-28 text-right">Mas metros</span>
              </div>
            </div>

            {/* 9. Calidad vs Precio */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                9. Y entre:
              </label>
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
            </div>
          </section>

          {/* Submit */}
          <div className="border-t pt-6">
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || submitting}
              className="w-full py-4 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Procesando...' : `VER MIS ${filtrosNivel1.count} OPCIONES PERSONALIZADAS`}
            </button>
            {!isFormValid && (
              <p className="text-xs text-red-500 mt-2 text-center">
                Completa las preguntas 1, 3 y 5 para continuar
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
