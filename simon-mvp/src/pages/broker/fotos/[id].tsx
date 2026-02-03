import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase } from '@/lib/supabase'

interface Foto {
  id?: number
  url: string
  orden: number
  tipo: string
  es_principal: boolean
  isNew?: boolean
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

export default function GestionarFotos() {
  const router = useRouter()
  const { id } = router.query
  const { broker } = useBrokerAuth(true)

  const [propiedad, setPropiedad] = useState<Propiedad | null>(null)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [nuevaUrl, setNuevaUrl] = useState('')

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
        setFotos(fotosData)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const isValidUrl = (url: string) => {
    try {
      new URL(url)
      return url.match(/\.(jpg|jpeg|png|gif|webp)/i) ||
             url.includes('drive.google.com') ||
             url.includes('dropbox.com') ||
             url.includes('imgur.com') ||
             url.includes('cloudinary.com') ||
             url.includes('supabase.co')
    } catch {
      return false
    }
  }

  // Convierte URLs de servicios populares a URLs directas de imagen
  const convertirUrl = (url: string): string => {
    // Google Drive: extraer ID y convertir a URL directa
    // Formatos soportados:
    // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    // https://drive.google.com/open?id=FILE_ID
    // https://drive.google.com/uc?id=FILE_ID
    const driveMatch = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=view&)?id=)([a-zA-Z0-9_-]+)/)
    if (driveMatch) {
      // Usar lh3.googleusercontent.com que es más confiable que uc?export
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`
    }

    // Dropbox: cambiar dl=0 por dl=1 para descarga directa
    if (url.includes('dropbox.com')) {
      return url.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    }

    // Imgur: asegurar que sea link directo
    const imgurMatch = url.match(/imgur\.com\/(?:a\/)?([a-zA-Z0-9]+)(?:\.[a-z]+)?$/)
    if (imgurMatch && !url.includes('i.imgur.com')) {
      return `https://i.imgur.com/${imgurMatch[1]}.jpg`
    }

    return url
  }

  const agregarFoto = () => {
    if (!nuevaUrl.trim()) return

    // Separar múltiples URLs (por coma, espacio, o salto de línea)
    const urls = nuevaUrl
      .split(/[,\s\n]+/)
      .map(u => u.trim())
      .filter(u => u.length > 0)

    const urlsValidas: string[] = []
    const urlsInvalidas: string[] = []

    for (const url of urls) {
      if (isValidUrl(url)) {
        urlsValidas.push(convertirUrl(url))
      } else if (url.length > 10) { // Ignorar fragmentos muy cortos
        urlsInvalidas.push(url)
      }
    }

    if (urlsValidas.length === 0) {
      setError('No se encontraron URLs válidas. Deben ser links a imágenes o de Google Drive, Dropbox, Imgur')
      return
    }

    // Agregar todas las fotos válidas
    const nuevasFotos: Foto[] = urlsValidas.map((url, index) => ({
      url,
      orden: fotos.length + index + 1,
      tipo: 'otro',
      es_principal: fotos.length === 0 && index === 0,
      isNew: true
    }))

    setFotos(prev => [...prev, ...nuevasFotos])
    setNuevaUrl('')

    if (urlsInvalidas.length > 0) {
      setError(`Se agregaron ${urlsValidas.length} fotos. ${urlsInvalidas.length} URLs no fueron válidas.`)
    } else {
      setError(null)
    }
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

    // Si ya está en BD, eliminar via API (soporta impersonación admin)
    if (foto.id && broker) {
      await fetch('/api/broker/manage-fotos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-broker-id': broker.id
        },
        body: JSON.stringify({
          action: 'delete',
          propiedad_id: propiedad?.id,
          foto_id: foto.id
        })
      })
    }

    setFotos(prev => prev.filter((_, i) => i !== index))
  }

  const moverFoto = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === fotos.length - 1) return

    const newIndex = direction === 'up' ? index - 1 : index + 1
    const newFotos = [...fotos]
    const temp = newFotos[index]
    newFotos[index] = newFotos[newIndex]
    newFotos[newIndex] = temp

    // Actualizar orden
    newFotos.forEach((f, i) => {
      f.orden = i + 1
    })

    setFotos(newFotos)
  }

  const guardarFotos = async () => {
    if (!propiedad || !broker) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Guardar fotos nuevas via API (soporta impersonación admin)
      for (const foto of fotos) {
        if (foto.isNew) {
          const response = await fetch('/api/broker/manage-fotos', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-broker-id': broker.id
            },
            body: JSON.stringify({
              action: 'add',
              propiedad_id: propiedad.id,
              url: foto.url,
              orden: foto.orden,
              hash: `${propiedad.codigo}-${Date.now()}-${foto.orden}`
            })
          })

          const data = await response.json()
          if (!data.success) throw new Error(data.error)
        }
      }

      // Reordenar todas las fotos
      const fotosParaReordenar = fotos.filter(f => f.id).map(f => ({
        id: f.id,
        orden: f.orden
      }))

      if (fotosParaReordenar.length > 0) {
        await fetch('/api/broker/manage-fotos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-broker-id': broker.id
          },
          body: JSON.stringify({
            action: 'reorder',
            propiedad_id: propiedad.id,
            fotos: fotosParaReordenar
          })
        })
      }

      // Recargar para obtener IDs
      await fetchPropiedad()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)

    } catch (err: any) {
      setError(err.message || 'Error guardando fotos')
    } finally {
      setSaving(false)
    }
  }

  const publicarPropiedad = async () => {
    if (!propiedad || !broker) return

    if (fotos.length < 3) {
      setError('Necesitas al menos 3 fotos para publicar')
      return
    }

    try {
      // Primero guardar fotos pendientes
      await guardarFotos()

      // Calcular score de calidad
      const score = Math.min(100, fotos.length * 10 + 20)

      // Actualizar estado via API (soporta impersonación admin)
      const response = await fetch('/api/broker/update-propiedad', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-broker-id': broker.id
        },
        body: JSON.stringify({
          propiedad_id: propiedad.id,
          estado: 'publicada',
          cantidad_fotos: fotos.length,
          score_calidad: score,
          es_calidad_perfecta: score >= 95,
          fecha_publicacion: new Date().toISOString()
        })
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.error)

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
        <title>Fotos | {propiedad.proyecto_nombre}</title>
      </Head>

      <BrokerLayout>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <span className="text-sm text-slate-500 font-mono">{propiedad.codigo}</span>
            <h1 className="text-2xl font-bold text-slate-900">{propiedad.proyecto_nombre}</h1>
            <p className="text-slate-500">Agrega URLs de las fotos de tu propiedad</p>
          </div>

          {/* Agregar URL */}
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-slate-900 mb-3">Agregar foto por URL</h2>
            <p className="text-sm text-slate-500 mb-4">
              Pega uno o varios links separados por coma. Soporta Google Drive, Dropbox, Imgur, o URLs directas.
            </p>

            <div className="flex gap-3">
              <textarea
                value={nuevaUrl}
                onChange={(e) => setNuevaUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    agregarFoto()
                  }
                }}
                placeholder="Pega uno o varios links de Google Drive, Dropbox, etc. separados por coma..."
                rows={2}
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none"
              />
              <button
                onClick={agregarFoto}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors"
              >
                + Agregar
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              <strong>Google Drive:</strong> Sube foto → Compartir → "Cualquier persona con el link" (solo lectura) → Copiar link.
              <span className="text-green-600 ml-1">El sistema convierte el link automáticamente.</span>
            </div>
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

              <div className="space-y-4">
                {fotos.map((foto, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                    {/* Thumbnail */}
                    <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-slate-200">
                      <img
                        src={foto.url}
                        alt={`Foto ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="%23e2e8f0" width="80" height="80"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%2394a3b8" font-size="12">Error</text></svg>'
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-700">#{index + 1}</span>
                        {foto.es_principal && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                            Principal
                          </span>
                        )}
                        {foto.isNew && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                            Nueva
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 truncate">{foto.url}</p>
                    </div>

                    {/* Tipo */}
                    <select
                      value={foto.tipo}
                      onChange={(e) => updateFotoTipo(index, e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    >
                      {TIPOS_FOTO.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moverFoto(index, 'up')}
                        disabled={index === 0}
                        className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                        title="Mover arriba"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moverFoto(index, 'down')}
                        disabled={index === fotos.length - 1}
                        className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                        title="Mover abajo"
                      >
                        ↓
                      </button>
                      {!foto.es_principal && (
                        <button
                          onClick={() => setPrincipal(index)}
                          className="p-2 text-amber-500 hover:text-amber-600"
                          title="Marcar como principal"
                        >
                          ★
                        </button>
                      )}
                      <button
                        onClick={() => removeFoto(index)}
                        className="p-2 text-red-400 hover:text-red-600"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {fotos.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm p-12 mb-6 text-center">
              <div className="text-4xl mb-3">📷</div>
              <p className="text-slate-500">No hay fotos todavía</p>
              <p className="text-sm text-slate-400 mt-1">Agrega URLs de fotos arriba</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="bg-green-50 text-green-600 px-4 py-3 rounded-lg text-sm mb-6">
              Fotos guardadas correctamente
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center">
            <button
              onClick={() => router.push('/broker/dashboard')}
              className="text-slate-600 hover:text-slate-900 font-medium"
            >
              ← Volver al Dashboard
            </button>

            <div className="flex gap-3">
              {fotos.some(f => f.isNew) && (
                <button
                  onClick={guardarFotos}
                  disabled={saving}
                  className="px-6 py-3 border border-amber-500 text-amber-600 font-semibold rounded-lg hover:bg-amber-50 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar Fotos'}
                </button>
              )}

              {propiedad.estado !== 'publicada' && (
                <button
                  onClick={publicarPropiedad}
                  disabled={fotos.length < 3 || saving}
                  className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Publicar Propiedad
                </button>
              )}
            </div>
          </div>
        </div>
      </BrokerLayout>
    </>
  )
}
