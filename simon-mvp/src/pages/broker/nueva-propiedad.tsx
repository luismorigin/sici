import { useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase } from '@/lib/supabase'

interface FormData {
  proyecto_nombre: string
  desarrollador: string
  zona: string
  direccion: string
  precio_usd: string
  area_m2: string
  dormitorios: string
  banos: string
  estado_construccion: 'entrega_inmediata' | 'construccion' | 'preventa' | 'planos'
  descripcion: string
  parqueo_incluido: boolean
  cantidad_parqueos: string
  baulera_incluida: boolean
  expensas_usd: string
  amenidades: string[]
}

const ZONAS = [
  'Equipetrol',
  'Sirari',
  'Equipetrol Norte',
  'Las Palmas',
  'Urubó',
  'Canal Isuto',
  'Otro'
]

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

export default function NuevaPropiedad() {
  const router = useRouter()
  const { broker } = useBrokerAuth(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(1)

  const [formData, setFormData] = useState<FormData>({
    proyecto_nombre: '',
    desarrollador: '',
    zona: '',
    direccion: '',
    precio_usd: '',
    area_m2: '',
    dormitorios: '2',
    banos: '2',
    estado_construccion: 'entrega_inmediata',
    descripcion: '',
    parqueo_incluido: true,
    cantidad_parqueos: '1',
    baulera_incluida: false,
    expensas_usd: '',
    amenidades: []
  })

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

  const handleSubmit = async () => {
    if (!supabase || !broker) return

    setLoading(true)
    setError(null)

    try {
      // Generar código único
      const { data: codigoData, error: codigoError } = await supabase
        .rpc('generar_codigo_unico')

      if (codigoError) {
        throw new Error('Error generando código')
      }

      const codigo = codigoData as string

      // Crear propiedad
      const { data, error: insertError } = await supabase
        .from('propiedades_broker')
        .insert({
          broker_id: broker.id,
          codigo,
          proyecto_nombre: formData.proyecto_nombre,
          desarrollador: formData.desarrollador || null,
          zona: formData.zona,
          direccion: formData.direccion || null,
          precio_usd: parseFloat(formData.precio_usd),
          area_m2: parseFloat(formData.area_m2),
          dormitorios: parseInt(formData.dormitorios),
          banos: parseFloat(formData.banos),
          estado_construccion: formData.estado_construccion,
          descripcion: formData.descripcion || null,
          parqueo_incluido: formData.parqueo_incluido,
          cantidad_parqueos: formData.parqueo_incluido ? parseInt(formData.cantidad_parqueos) : 0,
          baulera_incluida: formData.baulera_incluida,
          expensas_usd: formData.expensas_usd ? parseFloat(formData.expensas_usd) : null,
          amenidades: {
            lista: formData.amenidades,
            equipamiento: [],
            estado_amenities: formData.amenidades.reduce((acc, a) => ({
              ...acc,
              [a]: { valor: true, fuente: 'broker', confianza: 'alta' }
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
                  <input
                    type="text"
                    value={formData.proyecto_nombre}
                    onChange={(e) => updateField('proyecto_nombre', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="Ej: Vienna Residences"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Desarrollador
                  </label>
                  <input
                    type="text"
                    value={formData.desarrollador}
                    onChange={(e) => updateField('desarrollador', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    placeholder="Ej: Grupo Jenecheru"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Zona *
                    </label>
                    <select
                      value={formData.zona}
                      onChange={(e) => updateField('zona', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {ZONAS.map(z => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Estado
                    </label>
                    <select
                      value={formData.estado_construccion}
                      onChange={(e) => updateField('estado_construccion', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                    >
                      <option value="entrega_inmediata">Entrega Inmediata</option>
                      <option value="construccion">En Construcción</option>
                      <option value="preventa">Preventa</option>
                      <option value="planos">En Planos</option>
                    </select>
                  </div>
                </div>

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

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="parqueo"
                      checked={formData.parqueo_incluido}
                      onChange={(e) => updateField('parqueo_incluido', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="parqueo" className="text-sm font-medium text-slate-700">
                      Parqueo incluido
                    </label>
                    {formData.parqueo_incluido && (
                      <select
                        value={formData.cantidad_parqueos}
                        onChange={(e) => updateField('cantidad_parqueos', e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded text-sm"
                      >
                        {[1, 2, 3, 4].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="baulera"
                      checked={formData.baulera_incluida}
                      onChange={(e) => updateField('baulera_incluida', e.target.checked)}
                      className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
                    />
                    <label htmlFor="baulera" className="text-sm font-medium text-slate-700">
                      Baulera incluida
                    </label>
                  </div>
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

                <p className="text-sm text-slate-500 mb-4">
                  Selecciona las amenidades que tiene el edificio/condominio
                </p>

                <div className="grid grid-cols-2 gap-3">
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
