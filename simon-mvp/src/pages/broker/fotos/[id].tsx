import { useEffect, useState, useCallback } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase } from '@/lib/supabase'

interface Foto {
  id?: number
  url: string
  thumbnail_url: string
  orden: number
  tipo: string
  es_principal: boolean
  file?: File
  uploading?: boolean
  uploaded?: boolean
}

interface Propiedad {
  id: number
  codigo: string
  proyecto_nombre: string
  estado: string
}

const TIPOS_FOTO = [
  { value: 'fachada', label: 'Fachada' },
  { value: 'living', label: 'Living/Sala' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'dormitorio', label: 'Dormitorio' },
  { value: 'bano', label: 'Baño' },
  { value: 'vista', label: 'Vista' },
  { value: 'amenidades', label: 'Amenidades' },
  { value: 'plano', label: 'Plano' },
  { value: 'otro', label: 'Otro' }
]

export default function SubirFotos() {
  const router = useRouter()
  const { id } = router.query
  const { broker } = useBrokerAuth(true)

  const [propiedad, setPropiedad] = useState<Propiedad | null>(null)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id && broker) {
      fetchPropiedad()
    }
  }, [id, broker])

  const fetchPropiedad = async () => {
    if (!supabase || !broker || !id) return

    try {
      // Verificar que la propiedad pertenece al broker
      const { data: prop, error: propError } = await supabase
        .from('propiedades_broker')
        .select('id, codigo, proyecto_nombre, estado')
        .eq('id', id)
        .eq('broker_id', broker.id)
        .single()

      if (propError || !prop) {
        router.push('/broker/dashboard')
        return
      }

      setPropiedad(prop)

      // Obtener fotos existentes
      const { data: fotosData } = await supabase
        .from('propiedad_fotos')
        .select('*')
        .eq('propiedad_id', id)
        .order('orden')

      if (fotosData) {
        setFotos(fotosData.map(f => ({ ...f, uploaded: true })))
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFotos: Foto[] = Array.from(files).map((file, index) => ({
      url: URL.createObjectURL(file),
      thumbnail_url: URL.createObjectURL(file),
      orden: fotos.length + index + 1,
      tipo: 'otro',
      es_principal: fotos.length === 0 && index === 0,
      file,
      uploading: false,
      uploaded: false
    }))

    setFotos(prev => [...prev, ...newFotos])
  }

  const updateFotoTipo = (index: number, tipo: string) => {
    setFotos(prev => prev.map((f, i) =>
      i === index ? { ...f, tipo } : f
    ))
  }

  const setPrincipal = (index: number) => {
    setFotos(prev => prev.map((f, i) => ({
      ...f,
      es_principal: i === index
    })))
  }

  const removeFoto = async (index: number) => {
    const foto = fotos[index]

    // Si ya está en BD, eliminar
    if (foto.id && supabase) {
      await supabase
        .from('propiedad_fotos')
        .delete()
        .eq('id', foto.id)
    }

    setFotos(prev => prev.filter((_, i) => i !== index))
  }

  const uploadFotos = async () => {
    if (!supabase || !propiedad || !broker) return

    setUploading(true)
    setError(null)

    try {
      const fotosParaSubir = fotos.filter(f => f.file && !f.uploaded)

      for (let i = 0; i < fotosParaSubir.length; i++) {
        const foto = fotosParaSubir[i]
        if (!foto.file) continue

        // Actualizar estado de subida
        setFotos(prev => prev.map(f =>
          f === foto ? { ...f, uploading: true } : f
        ))

        // Generar nombre único
        const fileExt = foto.file.name.split('.').pop()
        const fileName = `${propiedad.codigo}/${Date.now()}-${i}.${fileExt}`

        // Subir a storage
        const { error: uploadError } = await supabase.storage
          .from('propiedades-fotos')
          .upload(fileName, foto.file, {
            cacheControl: '3600',
            upsert: false
          })

        if (uploadError) {
          // Si el bucket no existe, usar URLs temporales
          console.warn('Storage upload failed, using placeholder:', uploadError)
        }

        // Obtener URL pública (o usar placeholder)
        const { data: urlData } = supabase.storage
          .from('propiedades-fotos')
          .getPublicUrl(fileName)

        const publicUrl = urlData?.publicUrl || foto.url

        // Guardar en BD
        const { data: fotoData, error: insertError } = await supabase
          .from('propiedad_fotos')
          .insert({
            propiedad_id: propiedad.id,
            url: publicUrl,
            thumbnail_url: publicUrl,
            orden: foto.orden,
            tipo: foto.tipo,
            es_principal: foto.es_principal,
            hash: `${propiedad.codigo}-${Date.now()}-${i}`
          })
          .select()
          .single()

        if (insertError) {
          throw new Error(`Error guardando foto: ${insertError.message}`)
        }

        // Actualizar estado
        setFotos(prev => prev.map(f =>
          f === foto ? { ...f, id: fotoData.id, uploading: false, uploaded: true } : f
        ))
      }

      // Actualizar cantidad_fotos en propiedad
      await supabase
        .from('propiedades_broker')
        .update({ cantidad_fotos: fotos.length })
        .eq('id', propiedad.id)

    } catch (err: any) {
      setError(err.message || 'Error subiendo fotos')
    } finally {
      setUploading(false)
    }
  }

  const publicarPropiedad = async () => {
    if (!supabase || !propiedad) return

    if (fotos.length < 3) {
      setError('Necesitas al menos 3 fotos para publicar')
      return
    }

    try {
      // Primero subir fotos pendientes
      await uploadFotos()

      // Calcular score de calidad
      const score = Math.min(100, fotos.length * 10 + 20)

      // Actualizar estado
      await supabase
        .from('propiedades_broker')
        .update({
          estado: 'publicada',
          cantidad_fotos: fotos.length,
          score_calidad: score,
          es_calidad_perfecta: score >= 95
        })
        .eq('id', propiedad.id)

      router.push('/broker/dashboard')
    } catch (err: any) {
      setError(err.message || 'Error publicando')
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

  if (!propiedad) {
    return (
      <BrokerLayout>
        <div className="text-center py-12">
          <p className="text-slate-500">Propiedad no encontrada</p>
        </div>
      </BrokerLayout>
    )
  }

  return (
    <>
      <Head>
        <title>Subir Fotos | {propiedad.proyecto_nombre}</title>
      </Head>

      <BrokerLayout>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <span className="text-sm text-slate-500 font-mono">{propiedad.codigo}</span>
            <h1 className="text-2xl font-bold text-slate-900">{propiedad.proyecto_nombre}</h1>
            <p className="text-slate-500">Sube las fotos de tu propiedad</p>
          </div>

          {/* Upload Area */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <label className="block">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-amber-500 transition-colors">
                <div className="text-4xl mb-2">📷</div>
                <p className="text-slate-600 font-medium">Click para seleccionar fotos</p>
                <p className="text-sm text-slate-400 mt-1">JPG, PNG hasta 5MB cada una</p>
              </div>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {/* Photos Grid */}
          {fotos.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <h2 className="font-semibold text-slate-900 mb-4">
                Fotos ({fotos.length})
                {fotos.length < 3 && (
                  <span className="text-amber-600 text-sm font-normal ml-2">
                    Mínimo 3 fotos para publicar
                  </span>
                )}
              </h2>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {fotos.map((foto, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-slate-100">
                      <img
                        src={foto.url}
                        alt={`Foto ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {foto.uploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                        </div>
                      )}
                      {foto.uploaded && (
                        <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                          ✓
                        </div>
                      )}
                    </div>

                    {/* Principal Badge */}
                    {foto.es_principal && (
                      <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-1 rounded">
                        Principal
                      </div>
                    )}

                    {/* Controls */}
                    <div className="mt-2 space-y-2">
                      <select
                        value={foto.tipo}
                        onChange={(e) => updateFotoTipo(index, e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded px-2 py-1"
                      >
                        {TIPOS_FOTO.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>

                      <div className="flex gap-2">
                        {!foto.es_principal && (
                          <button
                            onClick={() => setPrincipal(index)}
                            className="flex-1 text-xs text-amber-600 hover:bg-amber-50 py-1 rounded"
                          >
                            Principal
                          </button>
                        )}
                        <button
                          onClick={() => removeFoto(index)}
                          className="flex-1 text-xs text-red-600 hover:bg-red-50 py-1 rounded"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => router.push('/broker/dashboard')}
              className="text-slate-600 hover:text-slate-900 font-medium"
            >
              Guardar borrador
            </button>

            <div className="flex gap-3">
              {fotos.some(f => f.file && !f.uploaded) && (
                <button
                  onClick={uploadFotos}
                  disabled={uploading}
                  className="px-6 py-3 border border-amber-500 text-amber-600 font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-50"
                >
                  {uploading ? 'Subiendo...' : 'Subir Fotos'}
                </button>
              )}

              <button
                onClick={publicarPropiedad}
                disabled={fotos.length < 3 || uploading}
                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publicar Propiedad
              </button>
            </div>
          </div>
        </div>
      </BrokerLayout>
    </>
  )
}
