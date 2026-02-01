import { useEffect, useState, useRef } from 'react'
import Head from 'next/head'
import BrokerLayout from '@/components/BrokerLayout'
import { useBrokerAuth } from '@/hooks/useBrokerAuth'
import { supabase } from '@/lib/supabase'

interface BrokerProfile {
  nombre: string
  email: string
  telefono: string
  whatsapp: string
  inmobiliaria: string
  empresa: string
  foto_url: string
  logo_url: string
}

const INMOBILIARIAS = [
  'Century 21',
  'RE/MAX',
  'Bien Inmuebles',
  'Coldwell Banker',
  'Keller Williams',
  'Otra',
]

export default function BrokerPerfil() {
  const { broker, isVerified, isImpersonating } = useBrokerAuth(true)
  const [profile, setProfile] = useState<BrokerProfile>({
    nombre: '',
    email: '',
    telefono: '',
    whatsapp: '',
    inmobiliaria: '',
    empresa: '',
    foto_url: '',
    logo_url: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fotoInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (broker) {
      setProfile({
        nombre: broker.nombre || '',
        email: broker.email || '',
        telefono: broker.telefono || '',
        whatsapp: broker.whatsapp || '',
        inmobiliaria: broker.inmobiliaria || '',
        empresa: broker.empresa || '',
        foto_url: (broker as any).foto_url || '',
        logo_url: (broker as any).logo_url || '',
      })
      setLoading(false)
    }
  }, [broker])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setProfile(prev => ({ ...prev, [name]: value }))
  }

  const uploadImage = async (file: File, type: 'foto' | 'logo'): Promise<string | null> => {
    if (!supabase || !broker) return null

    const bucket = 'broker-profile'
    const ext = file.name.split('.').pop()
    const fileName = `${broker.id}/${type}_${Date.now()}.${ext}`

    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (error) {
        console.error('Error uploading:', error)
        throw error
      }

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName)

      return publicUrl
    } catch (err) {
      console.error('Upload error:', err)
      return null
    }
  }

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Solo se permiten imágenes')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showMessage('error', 'La imagen no debe superar 5MB')
      return
    }

    setUploadingFoto(true)
    const url = await uploadImage(file, 'foto')
    setUploadingFoto(false)

    if (url) {
      setProfile(prev => ({ ...prev, foto_url: url }))
      showMessage('success', 'Foto subida correctamente')
    } else {
      showMessage('error', 'Error al subir la foto')
    }
  }

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showMessage('error', 'Solo se permiten imágenes')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      showMessage('error', 'La imagen no debe superar 5MB')
      return
    }

    setUploadingLogo(true)
    const url = await uploadImage(file, 'logo')
    setUploadingLogo(false)

    if (url) {
      setProfile(prev => ({ ...prev, logo_url: url }))
      showMessage('success', 'Logo subido correctamente')
    } else {
      showMessage('error', 'Error al subir el logo')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !broker) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('brokers')
        .update({
          nombre: profile.nombre,
          telefono: profile.telefono,
          whatsapp: profile.whatsapp || null,
          inmobiliaria: profile.inmobiliaria || null,
          empresa: profile.empresa || null,
          foto_url: profile.foto_url || null,
          logo_url: profile.logo_url || null,
        })
        .eq('id', broker.id)

      if (error) {
        throw error
      }

      showMessage('success', 'Perfil actualizado correctamente')
    } catch (err) {
      console.error('Error saving:', err)
      showMessage('error', 'Error al guardar el perfil')
    } finally {
      setSaving(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <BrokerLayout title="Mi Perfil">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
        </div>
      </BrokerLayout>
    )
  }

  return (
    <>
      <Head>
        <title>Mi Perfil | Simón Broker</title>
      </Head>

      <BrokerLayout title="Mi Perfil Profesional">
        {/* Message Toast */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message.type === 'success' ? '✅' : '❌'} {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Foto y Logo */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Imagen Profesional</h2>
            <p className="text-sm text-slate-500 mb-6">
              Estas imágenes aparecerán en los PDFs que generes para tus propiedades.
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Foto de Perfil */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Foto de Perfil
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                    {profile.foto_url ? (
                      <img
                        src={profile.foto_url}
                        alt="Foto de perfil"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl font-bold text-slate-400">
                        {getInitials(profile.nombre)}
                      </span>
                    )}
                  </div>
                  <div>
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFotoChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      disabled={uploadingFoto}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
                    >
                      {uploadingFoto ? 'Subiendo...' : 'Cambiar foto'}
                    </button>
                    <p className="text-xs text-slate-500 mt-2">JPG, PNG o WebP. Máx 5MB.</p>
                  </div>
                </div>
              </div>

              {/* Logo Inmobiliaria */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Logo de tu Inmobiliaria
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-16 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200">
                    {profile.logo_url ? (
                      <img
                        src={profile.logo_url}
                        alt="Logo"
                        className="max-w-full max-h-full object-contain p-1"
                      />
                    ) : (
                      <span className="text-xs text-slate-400 text-center px-2">Sin logo</span>
                    )}
                  </div>
                  <div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
                    >
                      {uploadingLogo ? 'Subiendo...' : 'Cambiar logo'}
                    </button>
                    <p className="text-xs text-slate-500 mt-2">Preferible con fondo transparente.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Datos Personales */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Datos de Contacto</h2>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  name="nombre"
                  value={profile.nombre}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={profile.email}
                  disabled
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
                />
                <p className="text-xs text-slate-500 mt-1">El email no se puede cambiar</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  name="telefono"
                  value={profile.telefono}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  WhatsApp
                </label>
                <input
                  type="tel"
                  name="whatsapp"
                  value={profile.whatsapp}
                  onChange={handleChange}
                  placeholder="+591 70123456"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <p className="text-xs text-slate-500 mt-1">Incluye código de país</p>
              </div>
            </div>
          </div>

          {/* Datos de la Empresa */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Información Profesional</h2>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Inmobiliaria
                </label>
                <select
                  name="inmobiliaria"
                  value={profile.inmobiliaria}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="">Selecciona tu inmobiliaria</option>
                  {INMOBILIARIAS.map(inm => (
                    <option key={inm} value={inm}>{inm}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nombre de Empresa (si es otra)
                </label>
                <input
                  type="text"
                  name="empresa"
                  value={profile.empresa}
                  onChange={handleChange}
                  placeholder="Nombre de tu empresa"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Preview PDF */}
          <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Vista Previa en PDF</h2>
            <p className="text-sm text-slate-500 mb-4">
              Así se verá tu información en los PDFs que generes:
            </p>

            <div className="bg-white rounded-lg p-4 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                {/* Logo */}
                <div className="flex items-center gap-3">
                  {profile.logo_url ? (
                    <img src={profile.logo_url} alt="Logo" className="h-10 object-contain" />
                  ) : (
                    <span className="text-slate-400 text-sm font-medium">
                      {profile.inmobiliaria || profile.empresa || 'Tu Inmobiliaria'}
                    </span>
                  )}
                </div>

                {/* Broker Info */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{profile.nombre}</p>
                    <p className="text-sm text-slate-500">Asesor Inmobiliario</p>
                  </div>
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center">
                    {profile.foto_url ? (
                      <img src={profile.foto_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold">{getInitials(profile.nombre)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </BrokerLayout>
    </>
  )
}
