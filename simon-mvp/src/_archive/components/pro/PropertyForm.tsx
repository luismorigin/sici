'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Perfil } from './ProfileSelector'

// Microzonas disponibles (igual que PriceChecker)
const ZONAS = [
  { value: 'todas', label: 'Todo Equipetrol' },
  { value: 'equipetrol', label: 'Equipetrol Centro' },
  { value: 'sirari', label: 'Sirari' },
  { value: 'equipetrol_norte', label: 'Equipetrol Norte' },
  { value: 'villa_brigida', label: 'Villa Brigida' },
  { value: 'faremafu', label: 'Equipetrol Oeste' }
]

const DORMITORIOS = [
  { value: 0, label: 'Monoambiente' },
  { value: 1, label: '1 Dorm' },
  { value: 2, label: '2 Dorms' },
  { value: 3, label: '3+ Dorms' }
]

const TIPO_EDIFICIO = [
  { value: 'premium', label: 'Premium', desc: 'Piscina, gym, seguridad 24h' },
  { value: 'standard', label: 'Standard', desc: 'Ascensor, areas comunes' },
  { value: 'basico', label: 'Basico', desc: 'Sin amenities especiales' }
]

// Estado de entrega MOAT (3 opciones claras)
const ESTADO_ENTREGA = [
  { value: 'entrega_inmediata', label: 'Lista para entregar', desc: 'Disponible ahora' },
  { value: 'solo_preventa', label: 'Solo preventa', desc: 'En construccion o planos' },
  { value: 'no_importa', label: 'Todo el mercado', desc: 'Incluir ambos' }
]

// Amenities de edificio (basado en análisis de BD - frecuencia >10%)
const AMENITIES_EDIFICIO = [
  { id: 'piscina', label: 'Piscina', frecuencia: 55 },
  { id: 'seguridad_24h', label: 'Seguridad 24/7', frecuencia: 50 },
  { id: 'churrasquera', label: 'BBQ/Churrasquera', frecuencia: 42 },
  { id: 'terraza', label: 'Terraza/Balcon', frecuencia: 40 },
  { id: 'sauna_jacuzzi', label: 'Sauna/Jacuzzi', frecuencia: 30 },
  { id: 'area_social', label: 'Area Social', frecuencia: 26 },
  { id: 'ascensor', label: 'Ascensor', frecuencia: 25 },
  { id: 'gimnasio', label: 'Gimnasio', frecuencia: 24 },
  { id: 'estacionamiento_visitas', label: 'Estac. Visitas', frecuencia: 15 },
  { id: 'pet_friendly', label: 'Pet Friendly', frecuencia: 12 },
  { id: 'recepcion', label: 'Recepcion/Lobby', frecuencia: 11 },
  { id: 'salon_eventos', label: 'Salon de Eventos', frecuencia: 10 }
]

// Equipamiento de unidad (basado en análisis de BD)
const EQUIPAMIENTO_UNIDAD = [
  { id: 'aire_acondicionado', label: 'Aire Acondicionado', frecuencia: 60 },
  { id: 'cocina_equipada', label: 'Cocina Equipada', frecuencia: 32 },
  { id: 'roperos_empotrados', label: 'Roperos Empotrados', frecuencia: 21 },
  { id: 'lavadora', label: 'Lavadora', frecuencia: 15 },
  { id: 'amoblado', label: 'Amoblado Completo', frecuencia: 12 },
  { id: 'calefon', label: 'Calefon/Termotanque', frecuencia: 10 }
]

// Extras que afectan valor (ajustes manuales)
const EXTRAS_VALOR = [
  { id: 'vista_privilegiada', label: 'Vista Privilegiada', ajuste: '+5%' },
  { id: 'piso_alto', label: 'Piso Alto (>5)', ajuste: '+3%' },
  { id: 'esquinero', label: 'Esquinero', ajuste: '+2%' },
  { id: 'remodelado', label: 'Remodelado', ajuste: '+5%' }
]

export type EstadoEntrega = 'entrega_inmediata' | 'solo_preventa' | 'no_importa'

export interface DatosPropiedad {
  zona: string
  dormitorios: number
  area_m2: number
  tipo_edificio: 'premium' | 'standard' | 'basico'
  estado_entrega: EstadoEntrega
  parqueos: number
  baulera: boolean
  // Campos según perfil
  precio_referencia: number | null  // vendedor: precio esperado, broker: precio cliente, avaluador: valor a validar
  // Branding broker (opcional)
  broker_nombre?: string
  broker_telefono?: string
  broker_empresa?: string
  broker_logo?: string        // Data URL del logo
  broker_foto?: string        // Data URL de la foto del broker
  propiedad_fotos?: string[]  // Data URLs de fotos de la propiedad
  propiedad_direccion?: string // Direccion de la propiedad (para CMA)
  // CMA Avanzado (opcional)
  amenities_edificio?: string[]   // IDs de amenities seleccionados
  equipamiento_unidad?: string[]  // IDs de equipamiento seleccionado
  extras_valor?: string[]         // IDs de extras que afectan valor
}

interface PropertyFormProps {
  perfil: Perfil
  onSubmit: (datos: DatosPropiedad) => void
  onBack: () => void
}

export default function PropertyForm({ perfil, onSubmit, onBack }: PropertyFormProps) {
  const [zona, setZona] = useState('')
  const [dormitorios, setDormitorios] = useState<number | null>(null)
  const [areaM2, setAreaM2] = useState('')
  const [tipoEdificio, setTipoEdificio] = useState<'premium' | 'standard' | 'basico' | null>(null)
  const [estadoEntrega, setEstadoEntrega] = useState<EstadoEntrega>('entrega_inmediata')
  const [parqueos, setParqueos] = useState(0)
  const [baulera, setBaulera] = useState(false)
  const [precioReferencia, setPrecioReferencia] = useState('')
  // Branding broker
  const [brokerNombre, setBrokerNombre] = useState('')
  const [brokerTelefono, setBrokerTelefono] = useState('')
  const [brokerEmpresa, setBrokerEmpresa] = useState('')
  const [brokerLogo, setBrokerLogo] = useState<string | null>(null)
  const [brokerFoto, setBrokerFoto] = useState<string | null>(null)
  const [propiedadFotos, setPropiedadFotos] = useState<string[]>([])
  const [propiedadDireccion, setPropiedadDireccion] = useState('')
  // CMA Avanzado
  const [modoAvanzado, setModoAvanzado] = useState(false)
  const [amenitiesEdificio, setAmenitiesEdificio] = useState<string[]>([])
  const [equipamientoUnidad, setEquipamientoUnidad] = useState<string[]>([])
  const [extrasValor, setExtrasValor] = useState<string[]>([])

  // Handlers para uploads
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string | null) => void
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen debe ser menor a 2MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (event) => {
      setter(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleMultipleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newFotos: string[] = []
    const maxFotos = 6 - propiedadFotos.length

    Array.from(files).slice(0, maxFotos).forEach(file => {
      if (file.size > 2 * 1024 * 1024) return
      const reader = new FileReader()
      reader.onload = (event) => {
        newFotos.push(event.target?.result as string)
        if (newFotos.length === Math.min(files.length, maxFotos)) {
          setPropiedadFotos(prev => [...prev, ...newFotos])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const removeFoto = (index: number) => {
    setPropiedadFotos(prev => prev.filter((_, i) => i !== index))
  }

  // Toggles para checkboxes
  const toggleAmenity = (id: string) => {
    setAmenitiesEdificio(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const toggleEquipamiento = (id: string) => {
    setEquipamientoUnidad(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  const toggleExtra = (id: string) => {
    setExtrasValor(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    )
  }

  // Labels según perfil
  const labels = {
    vendedor: {
      titulo: 'Datos de tu propiedad',
      subtitulo: 'Contanos sobre tu departamento para mostrarte tu competencia',
      precioCampo: '¿A que precio queres vender?',
      precioPlaceholder: 'Ej: 150000',
      cta: 'Ver mi competencia'
    },
    broker: {
      titulo: 'Datos de la propiedad del cliente',
      subtitulo: 'Ingresa los datos para generar el CMA profesional',
      precioCampo: '¿Precio de lista del cliente?',
      precioPlaceholder: 'Ej: 180000',
      cta: 'Generar CMA'
    },
    avaluador: {
      titulo: 'Datos de la propiedad a evaluar',
      subtitulo: 'Ingresa los datos para obtener referencias de mercado',
      precioCampo: '¿Valor a validar? (opcional)',
      precioPlaceholder: 'Ej: 160000',
      cta: 'Obtener referencias'
    }
  }

  const config = labels[perfil]

  const formValido = zona && dormitorios !== null && areaM2 && tipoEdificio

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formValido) return

    onSubmit({
      zona,
      dormitorios: dormitorios!,
      area_m2: parseFloat(areaM2),
      tipo_edificio: tipoEdificio!,
      estado_entrega: estadoEntrega,
      parqueos,
      baulera,
      precio_referencia: precioReferencia ? parseFloat(precioReferencia) : null,
      // Branding broker
      broker_nombre: brokerNombre || undefined,
      broker_telefono: brokerTelefono || undefined,
      broker_empresa: brokerEmpresa || undefined,
      broker_logo: brokerLogo || undefined,
      broker_foto: brokerFoto || undefined,
      propiedad_fotos: propiedadFotos.length > 0 ? propiedadFotos : undefined,
      propiedad_direccion: propiedadDireccion || undefined,
      // CMA Avanzado
      amenities_edificio: amenitiesEdificio.length > 0 ? amenitiesEdificio : undefined,
      equipamiento_unidad: equipamientoUnidad.length > 0 ? equipamientoUnidad : undefined,
      extras_valor: extrasValor.length > 0 ? extrasValor : undefined
    })
  }

  // Calcular precio/m2 estimado
  const precioM2 = precioReferencia && areaM2
    ? Math.round(parseFloat(precioReferencia) / parseFloat(areaM2))
    : null

  return (
    <section className="py-12 bg-slate-50">
      <div className="max-w-2xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Back button */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-6 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Cambiar perfil
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="font-display text-2xl font-bold text-brand-dark mb-2">
              {config.titulo}
            </h2>
            <p className="text-slate-500">{config.subtitulo}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8">
            {/* Zona */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Zona
              </label>
              <select
                value={zona}
                onChange={(e) => setZona(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Seleccionar zona</option>
                {ZONAS.map(z => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </select>
            </div>

            {/* Dormitorios + Area */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Dormitorios
                </label>
                <div className="flex gap-2">
                  {DORMITORIOS.map(d => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDormitorios(d.value)}
                      className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                        dormitorios === d.value
                          ? 'border-brand-primary bg-blue-50 text-brand-primary'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Area (m2)
                </label>
                <input
                  type="number"
                  value={areaM2}
                  onChange={(e) => setAreaM2(e.target.value)}
                  placeholder="Ej: 85"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            {/* Tipo edificio */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Tipo de edificio
              </label>
              <div className="grid grid-cols-3 gap-3">
                {TIPO_EDIFICIO.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipoEdificio(t.value as typeof tipoEdificio)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      tipoEdificio === t.value
                        ? 'border-brand-primary bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${tipoEdificio === t.value ? 'text-brand-primary' : 'text-slate-700'}`}>
                      {t.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Estado de entrega */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Estado de entrega
              </label>
              <div className="grid grid-cols-3 gap-3">
                {ESTADO_ENTREGA.map(e => (
                  <button
                    key={e.value}
                    type="button"
                    onClick={() => setEstadoEntrega(e.value as EstadoEntrega)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      estadoEntrega === e.value
                        ? 'border-brand-primary bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${estadoEntrega === e.value ? 'text-brand-primary' : 'text-slate-700'}`}>
                      {e.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{e.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Extras */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Extras incluidos
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Parqueos</label>
                  <div className="flex gap-2">
                    {[0, 1, 2].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setParqueos(n)}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                          parqueos === n
                            ? 'border-brand-primary bg-blue-50 text-brand-primary'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Baulera</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBaulera(false)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        !baulera
                          ? 'border-brand-primary bg-blue-50 text-brand-primary'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => setBaulera(true)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                        baulera
                          ? 'border-brand-primary bg-blue-50 text-brand-primary'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      Si
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Branding broker */}
            {perfil === 'broker' && (
              <>
                {/* Direccion propiedad */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Direccion de la propiedad (opcional)
                  </label>
                  <input
                    type="text"
                    value={propiedadDireccion}
                    onChange={(e) => setPropiedadDireccion(e.target.value)}
                    placeholder="Ej: Av. San Martin #500, Edificio Torre Sol"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                {/* Fotos de la propiedad */}
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    Fotos de la propiedad (max 6)
                  </label>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {propiedadFotos.map((foto, index) => (
                      <div key={index} className="relative aspect-video bg-slate-200 rounded-lg overflow-hidden">
                        <img src={foto} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeFoto(index)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {propiedadFotos.length < 6 && (
                      <label className="aspect-video bg-white border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary hover:bg-blue-50 transition-colors">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-xs text-slate-500 mt-1">Agregar</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleMultipleImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">Las fotos apareceran en el CMA. Max 2MB cada una.</p>
                </div>

                {/* Info del broker */}
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-sm font-semibold text-slate-700 mb-3">
                    Tu informacion (aparecera en el CMA)
                  </label>

                  {/* Logo y foto */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {/* Logo */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-2">Logo de tu empresa</label>
                      <div className="flex items-center gap-3">
                        {brokerLogo ? (
                          <div className="relative w-16 h-16 bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <img src={brokerLogo} alt="Logo" className="w-full h-full object-contain" />
                            <button
                              type="button"
                              onClick={() => setBrokerLogo(null)}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label className="w-16 h-16 bg-white border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary transition-colors">
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload(e, setBrokerLogo)}
                              className="hidden"
                            />
                          </label>
                        )}
                        <span className="text-xs text-slate-400">PNG/JPG</span>
                      </div>
                    </div>

                    {/* Foto broker */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-2">Tu foto</label>
                      <div className="flex items-center gap-3">
                        {brokerFoto ? (
                          <div className="relative w-16 h-16 bg-white border border-slate-200 rounded-full overflow-hidden">
                            <img src={brokerFoto} alt="Tu foto" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setBrokerFoto(null)}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label className="w-16 h-16 bg-white border-2 border-dashed border-slate-300 rounded-full flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary transition-colors">
                            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleImageUpload(e, setBrokerFoto)}
                              className="hidden"
                            />
                          </label>
                        )}
                        <span className="text-xs text-slate-400">Foto perfil</span>
                      </div>
                    </div>
                  </div>

                  {/* Datos de contacto */}
                  <div className="grid md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={brokerNombre}
                      onChange={(e) => setBrokerNombre(e.target.value)}
                      placeholder="Tu nombre"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-brand-primary focus:outline-none"
                    />
                    <input
                      type="tel"
                      value={brokerTelefono}
                      onChange={(e) => setBrokerTelefono(e.target.value)}
                      placeholder="Tu telefono"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-brand-primary focus:outline-none"
                    />
                    <input
                      type="text"
                      value={brokerEmpresa}
                      onChange={(e) => setBrokerEmpresa(e.target.value)}
                      placeholder="Tu empresa (opcional)"
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            {/* CMA Avanzado (solo broker) */}
            {perfil === 'broker' && (
              <div className="mb-6">
                {/* Toggle modo avanzado */}
                <button
                  type="button"
                  onClick={() => setModoAvanzado(!modoAvanzado)}
                  className="flex items-center gap-3 w-full p-4 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200 hover:border-brand-primary transition-colors"
                >
                  <div className={`w-12 h-6 rounded-full transition-colors relative ${modoAvanzado ? 'bg-brand-primary' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${modoAvanzado ? 'left-7' : 'left-1'}`} />
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold text-slate-700">CMA Avanzado</div>
                    <div className="text-xs text-slate-500">Detallar amenities y equipamiento para mejor comparacion</div>
                  </div>
                  <svg className={`w-5 h-5 text-slate-400 transition-transform ${modoAvanzado ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Campos avanzados */}
                {modoAvanzado && (
                  <div className="mt-4 space-y-5 p-4 bg-white rounded-xl border border-slate-200">
                    {/* Amenities del edificio */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Amenities del Edificio
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {AMENITIES_EDIFICIO.map(amenity => (
                          <button
                            key={amenity.id}
                            type="button"
                            onClick={() => toggleAmenity(amenity.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-all ${
                              amenitiesEdificio.includes(amenity.id)
                                ? 'border-brand-primary bg-blue-50 text-brand-primary'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              amenitiesEdificio.includes(amenity.id)
                                ? 'border-brand-primary bg-brand-primary'
                                : 'border-slate-300'
                            }`}>
                              {amenitiesEdificio.includes(amenity.id) && (
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span>{amenity.label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {amenitiesEdificio.length} seleccionados
                      </p>
                    </div>

                    {/* Equipamiento de la unidad */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Equipamiento de la Unidad
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {EQUIPAMIENTO_UNIDAD.map(equip => (
                          <button
                            key={equip.id}
                            type="button"
                            onClick={() => toggleEquipamiento(equip.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm transition-all ${
                              equipamientoUnidad.includes(equip.id)
                                ? 'border-brand-primary bg-blue-50 text-brand-primary'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              equipamientoUnidad.includes(equip.id)
                                ? 'border-brand-primary bg-brand-primary'
                                : 'border-slate-300'
                            }`}>
                              {equipamientoUnidad.includes(equip.id) && (
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <span>{equip.label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {equipamientoUnidad.length} seleccionados
                      </p>
                    </div>

                    {/* Extras que afectan valor */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        Extras que Afectan Valor
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {EXTRAS_VALOR.map(extra => (
                          <button
                            key={extra.id}
                            type="button"
                            onClick={() => toggleExtra(extra.id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-sm transition-all ${
                              extrasValor.includes(extra.id)
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                extrasValor.includes(extra.id)
                                  ? 'border-green-500 bg-green-500'
                                  : 'border-slate-300'
                              }`}>
                                {extrasValor.includes(extra.id) && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <span>{extra.label}</span>
                            </div>
                            <span className={`text-xs font-medium ${extrasValor.includes(extra.id) ? 'text-green-600' : 'text-slate-400'}`}>
                              {extra.ajuste}
                            </span>
                          </button>
                        ))}
                      </div>
                      {extrasValor.length > 0 && (
                        <p className="text-xs text-green-600 mt-2 font-medium">
                          Ajuste total estimado: +{extrasValor.reduce((acc, id) => {
                            const extra = EXTRAS_VALOR.find(e => e.id === id)
                            return acc + parseInt(extra?.ajuste.replace(/[^0-9]/g, '') || '0')
                          }, 0)}%
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Precio referencia */}
            <div className="mb-8">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {config.precioCampo}
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">USD $</span>
                <input
                  type="number"
                  value={precioReferencia}
                  onChange={(e) => setPrecioReferencia(e.target.value)}
                  placeholder={config.precioPlaceholder}
                  className="w-full pl-16 pr-4 py-3 border border-slate-300 rounded-lg focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {precioM2 && (
                <p className="text-sm text-slate-500 mt-2">
                  = ~${precioM2.toLocaleString()}/m2
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!formValido}
              className={`w-full py-4 rounded-xl font-bold text-white transition-all ${
                formValido
                  ? 'bg-brand-primary hover:bg-brand-primary-hover shadow-lg shadow-brand-primary/25'
                  : 'bg-slate-300 cursor-not-allowed'
              }`}
            >
              {config.cta} →
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  )
}
