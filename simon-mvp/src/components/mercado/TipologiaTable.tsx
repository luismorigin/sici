import type { TipologiaRow } from '@/lib/mercado-data'

const DORM_LABELS: Record<number, string> = {
  0: 'Studio',
  1: '1 Dormitorio',
  2: '2 Dormitorios',
  3: '3 Dormitorios',
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

export function TipologiaTable({ tipologias }: { tipologias: TipologiaRow[] }) {
  return (
    <section className="mb-12">
      <h2
        className="text-2xl font-light mb-4"
        style={{ fontFamily: 'var(--font-cormorant)' }}
      >
        Precios por tipología
      </h2>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="py-3 pr-4">Tipología</th>
              <th className="py-3 px-4 text-right">Unidades</th>
              <th className="py-3 px-4 text-right">Mediana USD</th>
              <th className="py-3 px-4 text-right">Rango P25–P75</th>
              <th className="py-3 px-4 text-right">$/m²</th>
            </tr>
          </thead>
          <tbody>
            {tipologias.map((row) => (
              <tr key={row.dormitorios} className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium">
                  {DORM_LABELS[row.dormitorios] || `${row.dormitorios}D`}
                </td>
                <td className="py-3 px-4 text-right text-gray-600">{row.unidades}</td>
                <td className="py-3 px-4 text-right">{fmt(row.precioMediano)}</td>
                <td className="py-3 px-4 text-right text-gray-500">
                  {fmt(row.precioP25)} – {fmt(row.precioP75)}
                </td>
                <td className="py-3 px-4 text-right font-medium">
                  {fmt(row.medianaPrecioM2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {tipologias.map((row) => (
          <div key={row.dormitorios} className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-medium">
                {DORM_LABELS[row.dormitorios] || `${row.dormitorios}D`}
              </span>
              <span className="text-xs text-gray-500">{row.unidades} unidades</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-lg" style={{ fontFamily: 'var(--font-cormorant)' }}>
                {fmt(row.precioMediano)}
              </span>
              <span className="text-sm font-medium">{fmt(row.medianaPrecioM2)}/m²</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Rango: {fmt(row.precioP25)} – {fmt(row.precioP75)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
