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
      desc: `${totalAlquileres} alquileres en Equipetrol de tres fuentes distintas. Todos los precios normalizados al tipo de cambio oficial — para que compares manzanas con manzanas, sin importar cómo publicó cada broker.`,
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
      desc: 'Los datos del mercado de Equipetrol, ordenados y actualizados todos los días. Precios por zona, tipología y tendencias. Sin registro, sin costo.',
      dato: `${microzonas.length} zonas · ${zonaNames}`,
      link: '/mercado/equipetrol',
      linkText: 'Ver datos del mercado →',
    },
  ]

  return (
    <section className="bg-s-arena px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto">
        <p className="font-s-mono font-normal text-xs text-s-piedra tracking-[1px] uppercase mb-12">
          Empezá por donde necesitás
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-s-arena-mid">
          {productos.map((p) => (
            <div key={p.titulo} className="bg-s-arena p-7 md:p-9 flex flex-col">
              <p className={`font-s-mono font-normal text-[10px] tracking-[1px] uppercase mb-4 ${
                p.activo ? 'text-s-salvia' : 'text-s-piedra'
              }`}>
                {p.activo ? '●' : '◎'} {p.estado}
              </p>

              <h3 className="font-s-display font-medium text-[22px] text-s-negro tracking-tight mb-2.5">
                {p.titulo}
              </h3>

              <p className="font-s-body font-light text-sm text-s-tinta leading-relaxed flex-1 mb-6">
                {p.desc}
              </p>

              {p.dato && (
                <p className="font-s-mono font-normal text-xs text-s-piedra mb-5 pt-5 border-t border-s-arena-mid">
                  <strong className="font-normal text-s-negro">{p.dato.split('·')[0].trim()}</strong>
                  {p.dato.includes('·') ? ` · ${p.dato.split('·').slice(1).join('·').trim()}` : ''}
                </p>
              )}

              <Link
                href={p.link}
                prefetch={false}
                className="font-s-body font-medium text-[13px] text-s-negro no-underline inline-flex items-center gap-1 hover:text-s-tinta transition-colors"
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
