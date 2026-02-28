/**
 * Forma de Pago section with payment plan CRUD
 * Extracted from propiedades/[id].tsx lines 2608-2811
 */
import type { FormData, CuotaPago } from '@/types/propiedad-editor'
import { MOMENTOS_PAGO } from '@/config/propiedad-constants'
import LockIcon from '@/components/admin/LockIcon'

interface PaymentPlanEditorProps {
  formData: FormData
  updateField: (field: keyof FormData, value: any) => void
  estaCampoBloqueado: (campo: string) => boolean
  toggleBloqueo: (campo: string) => Promise<void>
  agregarCuota: () => void
  eliminarCuota: (id: string) => void
  actualizarCuota: (id: string, campo: keyof CuotaPago, valor: string) => void
}

export default function PaymentPlanEditor({ formData, updateField, estaCampoBloqueado, toggleBloqueo, agregarCuota, eliminarCuota, actualizarCuota }: PaymentPlanEditorProps) {
  return (
    <section>
      <h2 className="flex items-center text-lg font-semibold text-slate-900 mb-4">
        Forma de Pago
        <LockIcon campo="forma_pago" estaCampoBloqueado={estaCampoBloqueado} toggleBloqueo={toggleBloqueo} />
      </h2>

      {/* Financiamiento vs Solo Contado */}
      <div className={`mb-4 ${estaCampoBloqueado('forma_pago') ? 'bg-amber-50/50 rounded-lg p-3 -mx-3' : ''}`}>
        <p className="text-sm font-medium text-slate-700 mb-2">Opciones de financiamiento</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
            formData.acepta_financiamiento ? 'border-green-500 bg-green-50' : 'border-slate-200 hover:bg-slate-50'
          }`}>
            <input
              type="checkbox"
              checked={formData.acepta_financiamiento}
              onChange={(e) => updateField('acepta_financiamiento', e.target.checked)}
              className="w-5 h-5 rounded text-green-500 focus:ring-green-500"
            />
            <div>
              <span className="block text-sm font-medium text-slate-700">📅 Plan de pagos con desarrollador</span>
              <span className="block text-xs text-slate-500">Acepta cuotas directas con el desarrollador</span>
            </div>
          </label>

          <label className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
            formData.solo_tc_paralelo
              ? 'border-amber-500 bg-amber-50'
              : 'border-slate-200 hover:bg-slate-50'
          }`}>
            <input
              type="checkbox"
              checked={formData.solo_tc_paralelo}
              onChange={(e) => updateField('solo_tc_paralelo', e.target.checked)}
              className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500"
            />
            <div>
              <span className="block text-sm font-medium text-slate-700">💱 TC paralelo</span>
              <span className="block text-xs text-slate-500">Precios en USD tasa paralela (Binance)</span>
            </div>
          </label>
        </div>
        {!formData.solo_tc_paralelo && (
          <p className="text-xs text-slate-500 mt-2 italic">
            💵 Sin TC paralelo = Precios en USD oficial o Bolivianos
          </p>
        )}
      </div>

      {/* Cuotas builder */}
      {formData.acepta_financiamiento && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-green-800">📋 Detalle del plan de pagos</p>
            <button type="button" onClick={agregarCuota} className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
              + Agregar cuota
            </button>
          </div>

          {formData.plan_pagos_cuotas.length === 0 ? (
            <p className="text-sm text-green-700 italic">
              Sin cuotas detalladas. Haz clic en &quot;+ Agregar cuota&quot; para especificar el plan.
            </p>
          ) : (
            <div className="space-y-3">
              {formData.plan_pagos_cuotas.map((cuota, idx) => (
                <div key={cuota.id} className="flex items-start gap-2 p-3 bg-white rounded-lg border border-green-200">
                  <span className="text-sm font-medium text-green-600 mt-2 w-6">{idx + 1}.</span>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Porcentaje</label>
                      <div className="flex items-center">
                        <input
                          type="number"
                          value={cuota.porcentaje}
                          onChange={(e) => actualizarCuota(cuota.id, 'porcentaje', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
                          placeholder="30" min="0" max="100"
                        />
                        <span className="ml-1 text-sm text-slate-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Momento</label>
                      <select
                        value={cuota.momento}
                        onChange={(e) => actualizarCuota(cuota.id, 'momento', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
                      >
                        {MOMENTOS_PAGO.map(m => (
                          <option key={m.id} value={m.id}>{m.emoji} {m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs text-slate-500 mb-1">Descripción (opcional)</label>
                      <input
                        type="text"
                        value={cuota.descripcion}
                        onChange={(e) => actualizarCuota(cuota.id, 'descripcion', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm"
                        placeholder="Ej: 12 cuotas sin interés"
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => eliminarCuota(cuota.id)} className="mt-6 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors" title="Eliminar cuota">
                    ✕
                  </button>
                </div>
              ))}

              {formData.plan_pagos_texto && (
                <div className="mt-3 p-3 bg-green-100 rounded-lg">
                  <p className="text-xs text-green-700 mb-1">Vista previa del plan:</p>
                  <p className="text-sm font-medium text-green-800">{formData.plan_pagos_texto}</p>
                </div>
              )}

              {(() => {
                const total = formData.plan_pagos_cuotas.reduce((sum, c) => sum + (parseFloat(c.porcentaje) || 0), 0)
                if (total > 0 && total !== 100) {
                  return <p className={`text-xs mt-2 ${total > 100 ? 'text-red-600' : 'text-amber-600'}`}>⚠️ Los porcentajes suman {total}% {total > 100 ? '(excede 100%)' : '(incompleto)'}</p>
                }
                if (total === 100) return <p className="text-xs mt-2 text-green-600">✓ Plan completo: 100%</p>
                return null
              })()}
            </div>
          )}
        </div>
      )}

      {/* Other payment options */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" checked={formData.acepta_permuta} onChange={(e) => updateField('acepta_permuta', e.target.checked)} className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500" />
          <div>
            <span className="block text-sm font-medium text-slate-700">🔄 Acepta Permuta</span>
            <span className="block text-xs text-slate-500">Vehículo o propiedad</span>
          </div>
        </label>
        <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
          <input type="checkbox" checked={formData.precio_negociable} onChange={(e) => updateField('precio_negociable', e.target.checked)} className="w-5 h-5 rounded text-amber-500 focus:ring-amber-500" />
          <div>
            <span className="block text-sm font-medium text-slate-700">🤝 Precio Negociable</span>
            <span className="block text-xs text-slate-500">Acepta ofertas</span>
          </div>
        </label>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">📉 Descuento por pago al contado (%)</label>
          <input
            type="number"
            value={formData.descuento_contado}
            onChange={(e) => updateField('descuento_contado', e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            min="0" max="30" step="0.5" placeholder="Ej: 5"
          />
        </div>
      </div>
    </section>
  )
}
