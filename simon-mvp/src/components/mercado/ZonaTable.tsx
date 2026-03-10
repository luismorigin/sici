import type { ZonaRow } from '@/lib/mercado-data'

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

export function ZonaTable({ zonas }: { zonas: ZonaRow[] }) {
  return (
    <section className="mb-12">
      <h2
        className="text-2xl font-light mb-4"
        style={{ fontFamily: 'var(--font-cormorant)' }}
      >
        Precios por zona
      </h2>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="py-3 pr-4">Zona</th>
              <th className="py-3 px-4 text-right">Unidades</th>
              <th className="py-3 px-4 text-right">$/m² mediana</th>
              <th className="py-3 px-4 text-right">Precio mediano</th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((row) => (
              <tr key={row.zonaDisplay} className="border-b border-gray-100">
                <td className="py-3 pr-4 font-medium">{row.zonaDisplay}</td>
                <td className="py-3 px-4 text-right text-gray-600">{row.unidades}</td>
                <td className="py-3 px-4 text-right font-medium">{fmt(row.medianaPrecioM2)}</td>
                <td className="py-3 px-4 text-right">{fmt(row.precioMediano)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {zonas.map((row) => (
          <div key={row.zonaDisplay} className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-medium">{row.zonaDisplay}</span>
              <span className="text-xs text-gray-500">{row.unidades} unidades</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-lg" style={{ fontFamily: 'var(--font-cormorant)' }}>
                {fmt(row.medianaPrecioM2)}/m²
              </span>
              <span className="text-sm text-gray-600">Mediana: {fmt(row.precioMediano)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
