import type { MercadoKPIs } from '@/lib/mercado-data'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function MarketHeader({ kpis }: { kpis: MercadoKPIs }) {
  const cards = [
    {
      label: 'Precio mediano / m²',
      value: `$${kpis.medianaPrecioM2.toLocaleString('en-US')}`,
      sub: 'USD por metro cuadrado',
    },
    {
      label: 'Propiedades activas',
      value: kpis.totalPropiedades.toString(),
      sub: 'departamentos en venta',
    },
    {
      label: 'Actividad de mercado',
      value: `${kpis.absorcionPct}%`,
      sub: 'retiros mensuales / inventario *',
    },
    {
      label: 'Actualización',
      value: formatDate(kpis.fechaActualizacion),
      sub: 'datos actualizados diariamente',
    },
  ]

  return (
    <section className="mb-12">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-lg p-5 border border-gray-200"
          >
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
              {card.label}
            </p>
            <p
              className="text-2xl md:text-3xl font-light"
              style={{ fontFamily: 'var(--font-cormorant)' }}
            >
              {card.value}
            </p>
            <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        * Indicador de actividad: incluye ventas reales, vencimientos de exclusividad,
        cambios de broker y retiros temporales. No equivale a ventas confirmadas.
      </p>
    </section>
  )
}
