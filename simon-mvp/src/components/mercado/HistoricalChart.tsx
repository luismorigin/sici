import dynamic from 'next/dynamic'
import type { HistoricoPoint } from '@/lib/mercado-data'

const ResponsiveContainer = dynamic(
  () => import('recharts').then(m => m.ResponsiveContainer),
  { ssr: false }
)
const LineChart = dynamic(
  () => import('recharts').then(m => m.LineChart),
  { ssr: false }
)
const Line = dynamic(
  () => import('recharts').then(m => m.Line),
  { ssr: false }
)
const XAxis = dynamic(
  () => import('recharts').then(m => m.XAxis),
  { ssr: false }
)
const YAxis = dynamic(
  () => import('recharts').then(m => m.YAxis),
  { ssr: false }
)
const Tooltip = dynamic(
  () => import('recharts').then(m => m.Tooltip),
  { ssr: false }
)
const CartesianGrid = dynamic(
  () => import('recharts').then(m => m.CartesianGrid),
  { ssr: false }
)

function formatFecha(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })
}

export function HistoricalChart({ historico }: { historico: HistoricoPoint[] }) {
  if (historico.length < 2) {
    return (
      <section className="mb-12">
        <h2
          className="text-2xl font-light mb-4"
          style={{ fontFamily: 'var(--font-cormorant)' }}
        >
          Evolución del mercado
        </h2>
        <p className="text-sm text-gray-500">
          Serie histórica disponible próximamente (requiere al menos 2 semanas de datos).
        </p>
      </section>
    )
  }

  const chartData = historico.map(p => ({
    ...p,
    fechaLabel: formatFecha(p.fecha),
  }))

  return (
    <section className="mb-12">
      <h2
        className="text-2xl font-light mb-1"
        style={{ fontFamily: 'var(--font-cormorant)' }}
      >
        Evolución del mercado
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Precio promedio/m² (fuente: snapshots diarios de absorción)
      </p>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis
              dataKey="fechaLabel"
              tick={{ fontSize: 11, fill: '#888' }}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#888' }}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toLocaleString('en-US')}`}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [`$${Number(value).toLocaleString('en-US')}`, 'Precio promedio/m²']}
              labelFormatter={(label: any) => String(label)}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e5e5' }}
            />
            <Line
              type="monotone"
              dataKey="precioM2Promedio"
              stroke="#c9a959"
              strokeWidth={2}
              dot={{ fill: '#c9a959', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
