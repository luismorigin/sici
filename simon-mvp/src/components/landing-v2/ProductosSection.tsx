import Link from 'next/link'
import type { MicrozonaData, ZonaAlquilerData } from '@/lib/supabase'
import type { HeroMetrics } from '@/lib/landing-data'

interface ProductosSectionProps {
  heroMetrics: HeroMetrics
  microzonas: MicrozonaData[]
  zonasAlquiler: ZonaAlquilerData[]
}

export default function ProductosSection({ heroMetrics, microzonas, zonasAlquiler }: ProductosSectionProps) {
  const totalAlquileres = zonasAlquiler.reduce((sum, za) => sum + za.total, 0)

  // Global median rent (simple: median of zone medians)
  const rentasSorted = zonasAlquiler
    .map((za) => za.mediana_bob)
    .filter(Boolean)
    .sort((a, b) => a - b)
  const mid = Math.floor(rentasSorted.length / 2)
  const rentaMedianaGlobal = rentasSorted.length > 0
    ? (rentasSorted.length % 2 === 0
      ? Math.round((rentasSorted[mid - 1] + rentasSorted[mid]) / 2)
      : rentasSorted[mid])
    : null

  const zonaNames = microzonas.slice(0, 5).map((m) => m.zona).join(', ')

  const productos = [
    {
      estado: 'Activo',
      activo: true,
      titulo: 'Alquileres',
      desc: `${totalAlquileres} alquileres en Equipetrol de tres fuentes distintas. Todos los precios normalizados al tipo de cambio oficial — para que compares manzanas con manzanas.`,
      dato: rentaMedianaGlobal
        ? `Bs ${rentaMedianaGlobal.toLocaleString('es-BO')}/mes · renta mediana actual`
        : null,
      link: '/alquileres',
      linkText: 'Buscar alquileres →',
    },
    {
      estado: 'Activo',
      activo: true,
      titulo: 'Ventas',
      desc: `${heroMetrics.propertyCount} departamentos en venta en Equipetrol. Sabés el precio por m² de cada uno antes de contactar a nadie.`,
      dato: `$${heroMetrics.avgPriceM2.toLocaleString('es-BO')}/m² · precio mediano de venta`,
      link: '/ventas',
      linkText: 'Ver departamentos →',
    },
    {
      estado: 'Datos públicos',
      activo: false,
      titulo: 'Mercado',
      desc: 'Los datos del mercado de Equipetrol, ordenados y actualizados todos los días. Precios por zona, tipología y tendencias.',
      dato: `${microzonas.length} zonas · ${zonaNames}`,
      link: '/mercado/equipetrol',
      linkText: 'Ver datos del mercado →',
    },
  ]

  return (
    <section className="bg-s-arena px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto">
        <p className="font-s-body font-normal text-xs text-s-piedra tracking-[0.5px] uppercase mb-12">
          Empezá por donde necesitás
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {productos.map((p) => (
            <div
              key={p.titulo}
              className="bg-s-blanco p-7 md:p-8 flex flex-col rounded-s-card border border-s-arena-mid transition-transform duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(58,53,48,0.08)]"
            >
              <p className={`font-s-body font-medium text-[11px] tracking-[0.5px] uppercase mb-4 flex items-center gap-2 ${
                p.activo ? 'text-s-salvia' : 'text-s-piedra'
              }`}>
                {p.activo && <span className="w-1.5 h-1.5 rounded-full bg-s-salvia flex-shrink-0" />}
                {!p.activo && <span className="w-1.5 h-1.5 rounded-full bg-s-piedra flex-shrink-0" />}
                {p.estado}
              </p>

              <h3 className="font-s-display font-medium text-[22px] text-s-salvia tracking-tight mb-2.5">
                {p.titulo}
              </h3>

              <p className="font-s-body font-light text-sm text-s-tinta leading-relaxed flex-1 mb-6">
                {p.desc}
              </p>

              {p.dato && (
                <p className="font-s-body font-normal text-[13px] text-s-piedra mb-5 pt-5 border-t border-s-arena-mid" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <strong className="font-medium text-s-negro">{p.dato.split('·')[0].trim()}</strong>
                  {p.dato.includes('·') ? ` · ${p.dato.split('·').slice(1).join('·').trim()}` : ''}
                </p>
              )}

              <Link
                href={p.link}
                prefetch={false}
                className="font-s-body font-medium text-[13px] text-s-negro no-underline inline-flex items-center gap-1 hover:gap-2 transition-all"
              >
                {p.linkText}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
