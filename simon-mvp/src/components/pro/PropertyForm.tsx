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
      precio_referencia: precioReferencia ? parseFloat(precioReferencia) : null
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
