interface BarChartProps {
  title: string
  data: { label: string; value: number; highlight?: boolean }[]
  maxValue?: number
}

export function BarChartCard({ title, data, maxValue }: BarChartProps) {
  const max = maxValue || Math.max(...data.map(d => d.value))

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h4 className="font-semibold text-brand-dark mb-4">{title}</h4>
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-4 text-sm">
            <span className="w-16 text-right text-slate-500 text-xs">{item.label}</span>
            <div className="flex-1 bg-slate-100 h-5 rounded overflow-hidden">
              <div
                className={`h-full rounded flex items-center pl-2 text-white text-xs font-semibold ${item.highlight ? 'bg-brand-primary' : 'bg-slate-300'}`}
                style={{ width: `${(item.value / max) * 100}%` }}
              >
                {item.value}{item.highlight ? ' (Match)' : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface CompatibilidadProps {
  porcentaje: number
  mensaje?: string
}

export function CompatibilidadCard({ porcentaje, mensaje }: CompatibilidadProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h4 className="font-semibold text-brand-dark mb-4">Compatibilidad General</h4>
      <div className="text-center">
        <div className="text-5xl font-extrabold text-state-success leading-none">{porcentaje}%</div>
        <div className="text-sm text-slate-500 mt-1">Match con el mercado</div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-state-success rounded-full transition-all duration-700"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        {mensaje && (
          <p className="mt-4 text-sm text-slate-500">
            <strong>Insight:</strong> {mensaje}
          </p>
        )}
      </div>
    </div>
  )
}

interface PrecioComparativoProps {
  title: string
  comparaciones: { proyecto: string; precio: number; diferencia: number }[]
  media: number
}

export function PrecioComparativoCard({ title, comparaciones, media }: PrecioComparativoProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <h4 className="font-semibold text-brand-dark mb-4">{title}</h4>
      <div className="space-y-4">
        {comparaciones.map((comp, i) => (
          <div key={i}>
            <div className="flex justify-between text-sm mb-1">
              <span>{comp.proyecto} (${comp.precio})</span>
              <span className={`font-bold ${comp.diferencia < 0 ? 'text-state-success' : 'text-state-danger'}`}>
                {comp.diferencia > 0 ? '+' : ''}{comp.diferencia}%
              </span>
            </div>
            <div className="flex gap-0.5 h-2">
              <div className={`flex-1 rounded ${comp.diferencia < 0 ? 'bg-brand-primary' : 'bg-state-danger'}`} />
              <div className="flex-1 bg-slate-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
