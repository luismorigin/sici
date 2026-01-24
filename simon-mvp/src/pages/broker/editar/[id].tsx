import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase, convertirZona } from '@/lib/supabase'

interface FormData {
  proyecto_nombre: string
  desarrollador: string
  zona: string
  direccion: string
  precio_usd: string
  area_m2: string
  dormitorios: string
  banos: string
  estado_construccion: 'entrega_inmediata' | 'construccion' | 'preventa' | 'planos' | 'no_especificado'
  descripcion: string
  parqueo_incluido: boolean
  cantidad_parqueos: string
  baulera_incluida: boolean
  expensas_usd: string
  amenidades: string[]
  amenidades_custom: string[]
}

// Zonas iguales a FilterBar.tsx para consistencia
const ZONAS = [
  { id: 'equipetrol', label: 'Equipetrol Centro' },
  { id: 'sirari', label: 'Sirari' },
  { id: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { id: 'villa_brigida', label: 'Villa Brígida' },
  { id: 'faremafu', label: 'Equipetrol Oeste (Busch)' }
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
  const { broker } = useBrokerAuth(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [propiedadCodigo, setPropiedadCodigo] = useState('')
  const [nuevoAmenidad, setNuevoAmenidad] = useState('')

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
    amenidades: [],
    amenidades_custom: []
  })

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

      // Parsear amenidades
      const amenidadesData = data.amenidades || { lista: [], equipamiento: [] }
      const listaAmenidades = amenidadesData.lista || []

      // Separar amenidades standard de custom
      const standardAmenidades = listaAmenidades.filter((a: string) => AMENIDADES_OPCIONES.includes(a))
      const customAmenidades = listaAmenidades.filter((a: string) => !AMENIDADES_OPCIONES.includes(a))

      setFormData({
        proyecto_nombre: data.proyecto_nombre || '',
        desarrollador: data.desarrollador || '',
        zona: zonaToId(data.zona || ''),
        direccion: data.direccion || '',
        precio_usd: data.precio_usd?.toString() || '',
        area_m2: data.area_m2?.toString() || '',
        dormitorios: data.dormitorios?.toString() || '2',
        banos: data.banos?.toString() || '2',
        estado_construccion: data.estado_construccion || 'entrega_inmediata',
        descripcion: data.descripcion || '',
        parqueo_incluido: data.parqueo_incluido ?? true,
        cantidad_parqueos: data.cantidad_parqueos?.toString() || '1',
        baulera_incluida: data.baulera_incluida ?? false,
        expensas_usd: data.expensas_usd?.toString() || '',
        amenidades: standardAmenidades,
        amenidades_custom: customAmenidades
      })
    } catch (err) {
      console.error('Error fetching propiedad:', err)
    } finally {
      setLoading(false)
    }
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

  const handleSubmit = async () => {
    if (!supabase || !broker || !id) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Combinar amenidades standard y custom
      const todasAmenidades = [...formData.amenidades, ...formData.amenidades_custom]

      const { error: updateError } = await supabase
        .from('propiedades_broker')
        .update({
          proyecto_nombre: formData.proyecto_nombre,
          desarrollador: formData.desarrollador || null,
          zona: convertirZona(formData.zona) || formData.zona,
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
            lista: todasAmenidades,
            equipamiento: [],
            estado_amenities: todasAmenidades.reduce((acc, a) => ({
              ...acc,
              [a]: {
                valor: true,
                fuente: formData.amenidades_custom.includes(a) ? 'broker_custom' : 'broker',
                confianza: 'alta'
              }
            }), {})
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('broker_id', broker.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

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
                  <input
                    type="text"
                    value={formData.proyecto_nombre}
                    onChange={(e) => updateField('proyecto_nombre', e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
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
                    >
                      <option value="">Seleccionar...</option>
                      {ZONAS.map(z => (
                        <option key={z.id} value={z.id}>{z.label}</option>
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
                  />
                </div>
              </div>
            </div>

            {/* Detalles */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Detalles de la Propiedad</h2>

              <div className="space-y-4">
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
                  />
                </div>
              </div>
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
