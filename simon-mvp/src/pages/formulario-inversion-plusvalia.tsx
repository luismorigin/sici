import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import InternalHeader from '@/components/InternalHeader'

interface FormInversionPlusvalia {
  horizonte_salida: '3_anos' | '5_anos' | '10_plus' | null
  apetito_riesgo: 'conservador' | 'moderado' | 'agresivo' | null
  experiencia: 'primera' | 'tengo_otras' | null
  tolerancia_iliquidez: 'necesito_liquidez' | 'puedo_esperar' | null
}

export default function FormularioInversionPlusvaliaPage() {
  const router = useRouter()
  const { presupuesto, zonas, dormitorios, estado_entrega, forma_pago, count } = router.query
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<FormInversionPlusvalia>({
    horizonte_salida: null,
    apetito_riesgo: null,
    experiencia: null,
    tolerancia_iliquidez: null,
  })

  const handleContinuar = () => {
    const params = new URLSearchParams({
      presupuesto: presupuesto as string || '150000',
      zonas: zonas as string || '',
      dormitorios: dormitorios as string || '',
      estado_entrega: estado_entrega as string || 'no_importa',
      forma_pago: forma_pago as string || 'no_se',
      count: count as string || '0',
      perfil: 'inversion_plusvalia',
      horizonte_salida: form.horizonte_salida || '',
      apetito_riesgo: form.apetito_riesgo || '',
      experiencia: form.experiencia || '',
      tolerancia_iliquidez: form.tolerancia_iliquidez || '',
    })
    router.push(`/resultados?${params.toString()}`)
  }

  const isFormValid = form.horizonte_salida && form.apetito_riesgo && form.experiencia

  return (
    <div className="min-h-screen bg-gray-50">
      <InternalHeader backLink={{ href: '/filtros', label: '← Volver a filtros' }} />
      <div className="max-w-2xl mx-auto px-4 pb-8">

        {/* Disclaimer BETA */}
        <div className="bg-purple-50 border-2 border-purple-300 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <span className="text-4xl">📈</span>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-purple-800 mb-3">
                INVERSIÓN PLUSVALÍA - BETA
              </h1>
              <p className="text-purple-700 mb-4">
                Estamos construyendo modelos de apreciación para Equipetrol.
                Todavía no tenemos histórico de precios suficiente para proyecciones confiables.
              </p>

              <div className="bg-white rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-800 mb-3">Lo que SÍ podemos darte hoy:</p>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Precio/m² comparado con promedio actual de zona
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Estado de construcción (preventa vs entrega)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Cantidad de unidades disponibles por proyecto
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Días en mercado de la publicación
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-800 mb-3">Lo que NO tenemos todavía:</p>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Proyección de apreciación anual
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Histórico de precios por zona
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Análisis de liquidez de reventa
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Track record de desarrolladores
                  </li>
                </ul>
              </div>

              {!mostrarForm && (
                <div className="space-y-3">
                  <button
                    onClick={() => setMostrarForm(true)}
                    className="w-full py-4 px-6 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    CONTINUAR CON ANÁLISIS DISPONIBLE
                  </button>
                  <button
                    onClick={() => router.push('/filtros')}
                    className="w-full py-3 px-6 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Avisame cuando esté completo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Formulario beta */}
        {mostrarForm && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              Contanos sobre tu inversión
            </h2>

            {/* Horizonte de salida */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿En cuánto tiempo pensás vender?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: '3_anos', label: '~3 años' },
                  { value: '5_anos', label: '~5 años' },
                  { value: '10_plus', label: '10+ años' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, horizonte_salida: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.horizonte_salida === opt.value
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Apetito de riesgo */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Cuál es tu apetito de riesgo?
              </label>
              <div className="space-y-2">
                {[
                  { value: 'conservador', label: 'Conservador', desc: 'Prefiero proyectos terminados de desarrolladores conocidos' },
                  { value: 'moderado', label: 'Moderado', desc: 'Puedo entrar en preventa con buenos desarrolladores' },
                  { value: 'agresivo', label: 'Agresivo', desc: 'Busco oportunidades en preventa temprana o desarrolladores nuevos' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, apetito_riesgo: opt.value as any }))}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      form.apetito_riesgo === opt.value
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-medium ${form.apetito_riesgo === opt.value ? 'text-purple-700' : 'text-gray-900'}`}>
                      {opt.label}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Experiencia */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Primera inversión inmobiliaria?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'primera', label: 'Sí, es mi primera' },
                  { value: 'tengo_otras', label: 'No, ya tengo otras' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, experiencia: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.experiencia === opt.value
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tolerancia a iliquidez */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Tolerancia a iliquidez?
              </label>
              <div className="space-y-2">
                {[
                  { value: 'necesito_liquidez', label: 'Necesito poder vender rápido si es necesario' },
                  { value: 'puedo_esperar', label: 'Puedo esperar el momento adecuado para vender' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, tolerancia_iliquidez: opt.value as any }))}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                      form.tolerancia_iliquidez === opt.value
                        ? 'border-purple-500 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="border-t pt-6">
              <button
                onClick={handleContinuar}
                disabled={!isFormValid}
                className="w-full py-4 px-6 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                VER MIS {count || 0} OPCIONES PARA PLUSVALÍA
              </button>
              {!isFormValid && (
                <p className="text-xs text-red-500 mt-2 text-center">
                  Completa horizonte, apetito de riesgo y experiencia para continuar
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
