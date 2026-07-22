// Curva de evolución del precio (serie reexpresada, migs 287-289) en base 100:
// USD/m² vs Bs/m² vs dólar paralelo. La brecha entre las dos primeras ES el
// efecto cambiario — por doctrina fiduciaria nunca se muestra la curva USD sin
// el dólar al lado (sin ese contexto, "bajó X%" desinforma).
import dynamic from 'next/dynamic'
import type { SerieMensual } from '@/lib/mercado-shadow-data'

const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false })

export function EvolucionSerie({ serie }: { serie: SerieMensual }) {
  const base = serie.puntos[0]
  const data = serie.puntos.map(p => ({
    mes: p.mes,
    usd: Math.round((p.usd_m2 / base.usd_m2) * 100),
    bs: Math.round((p.bs_m2 / base.bs_m2) * 100),
    tc: Math.round((p.tc / base.tc) * 100),
    usdAbs: p.usd_m2,
    bsAbs: p.bs_m2,
    tcAbs: p.tc,
  }))

  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(237,232,220,0.08)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'rgba(237,232,220,0.5)' }} tickLine={false} axisLine={false} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: 'rgba(237,232,220,0.5)' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(237,232,220,0.15)', background: '#1c1c1c', color: '#EDE8DC' }}
            formatter={(value, name, item) => {
              const p = item?.payload as (typeof data)[number] | undefined
              if (!p) return [String(value), String(name)]
              if (name === 'En dólares') return [`$${p.usdAbs.toLocaleString('en-US')}/m² (${value})`, name]
              if (name === 'En bolivianos') return [`Bs ${p.bsAbs.toLocaleString('es-BO')}/m² (${value})`, name]
              return [`Bs ${p.tcAbs.toFixed(2)} (${value})`, 'Dólar paralelo']
            }}
          />
          <Line type="monotone" dataKey="usd" name="En dólares" stroke="#EDE8DC" strokeWidth={2} dot={{ r: 2.5, fill: '#EDE8DC' }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="bs" name="En bolivianos" stroke="#7FB08A" strokeWidth={2} strokeDasharray="3 3" dot={{ r: 2.5, fill: '#7FB08A' }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="tc" name="Dólar paralelo" stroke="#C9A15A" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 2.5, fill: '#C9A15A' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
