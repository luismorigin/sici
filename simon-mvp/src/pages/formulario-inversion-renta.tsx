import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import InternalHeader from '@/components/InternalHeader'

interface FormInversionRenta {
  retorno_esperado: '4_6' | '6_8' | '8_plus' | null
  gestion: 'yo_mismo' | 'tercerizar' | 'no_se' | null
  horizonte: 'corto' | 'mediano' | 'largo' | null
  experiencia: 'primera' | 'tengo_otras' | null
  tolerancia_vacancia: 'necesito_fijo' | 'puedo_esperar' | null
}

export default function FormularioInversionRentaPage() {
  const router = useRouter()
  const { presupuesto, zonas, dormitorios, estado_entrega, forma_pago, count } = router.query
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<FormInversionRenta>({
    retorno_esperado: null,
    gestion: null,
    horizonte: null,
    experiencia: null,
    tolerancia_vacancia: null,
  })

  const handleContinuar = () => {
    const params = new URLSearchParams({
      presupuesto: presupuesto as string || '150000',
      zonas: zonas as string || '',
      dormitorios: dormitorios as string || '',
      estado_entrega: estado_entrega as string || 'no_importa',
      forma_pago: forma_pago as string || 'no_se',
      count: count as string || '0',
      perfil: 'inversion_renta',
      retorno_esperado: form.retorno_esperado || '',
      gestion: form.gestion || '',
      horizonte: form.horizonte || '',
      experiencia: form.experiencia || '',
      tolerancia_vacancia: form.tolerancia_vacancia || '',
    })
    router.push(`/resultados?${params.toString()}`)
  }

  const isFormValid = form.retorno_esperado && form.horizonte && form.experiencia

  return (
    <div className="min-h-screen bg-gray-50">
      <InternalHeader backLink={{ href: '/filtros', label: '← Volver a filtros' }} />
      <div className="max-w-2xl mx-auto px-4 pb-8">

        {/* Disclaimer BETA */}
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <span className="text-4xl">📊</span>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-amber-800 mb-3">
                INVERSIÓN RENTA - BETA
              </h1>
              <p className="text-amber-700 mb-4">
                Estamos construyendo data de alquileres en Equipetrol.
                Todavía no tenemos histórico de ocupación ni rentas reales por propiedad.
              </p>

              <div className="bg-white rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-800 mb-3">Lo que SÍ podemos darte hoy:</p>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Precio/m² comparado con promedio de zona
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Stock disponible en tu tipología
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Posición de precio vs mercado (oportunidad/premium)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-green-500 font-bold">✓</span> Amenidades confirmadas del edificio
                  </li>
                </ul>
              </div>

              <div className="bg-white rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-800 mb-3">Lo que NO tenemos todavía:</p>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Renta mensual estimada
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Yield histórico por propiedad
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">✗</span> Tasa de ocupación promedio
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
                    className="w-full py-4 px-6 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 transition-colors"
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

            {/* Retorno esperado */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Cuál es tu retorno anual esperado?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: '4_6', label: '4-6%' },
                  { value: '6_8', label: '6-8%' },
                  { value: '8_plus', label: '8%+' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, retorno_esperado: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.retorno_esperado === opt.value
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gestión */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Vas a gestionar vos o tercerizar?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'yo_mismo', label: 'Yo mismo' },
                  { value: 'tercerizar', label: 'Tercerizar' },
                  { value: 'no_se', label: 'No sé todavía' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, gestion: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.gestion === opt.value
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Horizonte */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Horizonte de inversión?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'corto', label: 'Corto (<3 años)' },
                  { value: 'mediano', label: 'Mediano (3-7 años)' },
                  { value: 'largo', label: 'Largo (>7 años)' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, horizonte: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.horizonte === opt.value
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
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
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tolerancia a vacancia */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ¿Tolerancia a vacancia?
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'necesito_fijo', label: 'Necesito ingreso fijo' },
                  { value: 'puedo_esperar', label: 'Puedo esperar el inquilino ideal' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(prev => ({ ...prev, tolerancia_vacancia: opt.value as any }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${
                      form.tolerancia_vacancia === opt.value
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
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
                className="w-full py-4 px-6 bg-amber-600 text-white font-semibold rounded-lg hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                VER MIS {count || 0} OPCIONES PARA RENTA
              </button>
              {!isFormValid && (
                <p className="text-xs text-red-500 mt-2 text-center">
                  Completa retorno esperado, horizonte y experiencia para continuar
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
