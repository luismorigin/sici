import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import type { MicrozonaData, ZonaAlquilerData } from '@/lib/supabase'
import type { HeroMetrics } from '@/lib/landing-data'

interface MercadoHeroProps {
  microzonas: MicrozonaData[]
  zonasAlquiler: ZonaAlquilerData[]
  tcActual: number
  heroMetrics: HeroMetrics
}

// Normalize zone names between venta (short) and alquiler (full)
function normalizarZona(zona: string): string {
  return zona
    .replace('Equipetrol Centro', 'Eq. Centro')
    .replace('Equipetrol Norte', 'Eq. Norte')
    .replace('Equipetrol Oeste', 'Eq. Oeste')
    .replace('Villa Brigida', 'V. Brígida')
    .replace('Villa Brígida', 'V. Brígida')
}

function fmt(valor: number, prefix: string): string {
  return `${prefix}${valor.toLocaleString('es-BO', { maximumFractionDigits: 0 })}`
}

function buildZonas(microzonas: MicrozonaData[], zonasAlquiler: ZonaAlquilerData[]) {
  return microzonas.map((mz) => {
    const zonaNorm = normalizarZona(mz.zona)
    const alq = zonasAlquiler.find((za) => normalizarZona(za.zona) === zonaNorm)
    return {
      nombre: mz.zona,
      precioM2: mz.precio_m2,
      totalVenta: mz.total,
      proyectos: mz.proyectos,
      categoria: mz.categoria,
      rentaMediana: alq?.mediana_bob ?? null,
      totalAlquiler: alq?.total ?? null,
    }
  })
}

const AUTO_ROTATE_MS = 3500

export default function MercadoHero({ microzonas, zonasAlquiler, tcActual, heroMetrics }: MercadoHeroProps) {
  const zonas = buildZonas(microzonas, zonasAlquiler)
  const [zonaIdx, setZonaIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  const [paused, setPaused] = useState(false)
  const idxRef = useRef(0)

  const zona = zonas[zonaIdx]
  const totalAlquilerGlobal = zonasAlquiler.reduce((sum, za) => sum + za.total, 0)

  // Average precio/m2 across all zones
  const avgPrecioM2 = microzonas.length > 0
    ? Math.round(microzonas.reduce((s, m) => s + m.precio_m2, 0) / microzonas.length)
    : 0

  function handleZoneClick(idx: number) {
    if (idx === idxRef.current) return
    setVisible(false)
    setPaused(true)
    setTimeout(() => {
      idxRef.current = idx
      setZonaIdx(idx)
      setVisible(true)
    }, 180)
  }

  // Auto-rotate
  useEffect(() => {
    if (paused || zonas.length <= 1) return
    const timer = setInterval(() => {
      const next = (idxRef.current + 1) % zonas.length
      setVisible(false)
      setTimeout(() => {
        idxRef.current = next
        setZonaIdx(next)
        setVisible(true)
      }, 180)
    }, AUTO_ROTATE_MS)
    return () => clearInterval(timer)
  }, [paused, zonas.length])

  const fechaLabel = new Date().toLocaleDateString('es-BO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  if (zonas.length === 0) return null

  // Variation label for column 1
  const varLabel = zona.precioM2 >= avgPrecioM2
    ? `Promedio Equipetrol $${avgPrecioM2.toLocaleString('es-BO')}`
    : 'Por debajo del promedio'

  return (
    <section
      className="bg-s-negro px-6 md:px-12 py-12 md:py-[52px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-[1100px] mx-auto">
        {/* Section label */}
        <p className="font-s-body font-normal text-[12px] tracking-[0.5px] uppercase text-s-dark-3 mb-9">
          Mercado · Equipetrol · {fechaLabel}
        </p>

        {/* Zone selector */}
        <div className="flex gap-0 border-b border-[#2A2A2A] mb-10 md:mb-12 overflow-x-auto">
          {zonas.map((z, i) => (
            <button
              key={z.nombre}
              onClick={() => handleZoneClick(i)}
              className={`font-s-body font-normal text-[13px] tracking-[0.2px] pb-3 mr-5 md:mr-7 border-b-2 whitespace-nowrap transition-colors duration-200 bg-transparent cursor-pointer ${
                i === zonaIdx
                  ? 'text-s-dark-1 border-s-salvia'
                  : 'text-s-dark-3 border-transparent hover:text-s-dark-2'
              }`}
            >
              {z.nombre}
            </button>
          ))}
        </div>

        {/* 3 columns */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-0 mb-10 md:mb-11 transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {/* Col 1 — Precio venta */}
          <div className="pr-0 md:pr-10 pb-5 md:pb-0 border-b md:border-b-0 md:border-r border-[#2A2A2A]">
            <span className="inline-block bg-s-salvia text-s-arena font-s-body text-[11px] font-medium tracking-[0.5px] uppercase px-3 py-0.5 mb-4 rounded-full">
              {zona.nombre}
            </span>
            <p
              className="font-s-display font-medium text-s-dark-1 leading-none mb-2"
              style={{ fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums' }}
            >
              {fmt(zona.precioM2, '$')}
            </p>
            <p className="font-s-body font-light text-[13px] text-s-dark-3 tracking-[0.5px] uppercase mb-2">
              USD / M² · Venta
            </p>
            <p className="font-s-body font-normal text-xs text-s-dark-2">
              {varLabel}
            </p>
          </div>

          {/* Col 2 — Renta alquiler */}
          <div className="px-0 md:px-10 py-5 md:py-0 border-b md:border-b-0 md:border-r border-[#2A2A2A]">
            <span className="inline-block bg-s-salvia text-s-arena font-s-body text-[11px] font-medium tracking-[0.5px] uppercase px-3 py-0.5 mb-4 rounded-full">
              Alquileres
            </span>
            <p
              className="font-s-display font-medium text-s-dark-1 leading-none mb-2"
              style={{ fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums' }}
            >
              {zona.rentaMediana ? fmt(zona.rentaMediana, 'Bs ') : '—'}
            </p>
            <p className="font-s-body font-light text-[13px] text-s-dark-3 tracking-[0.5px] uppercase mb-2">
              Renta mediana{zona.totalAlquiler ? ` · ${zona.totalAlquiler} en alquiler` : ''}
            </p>
            <p className="font-s-body font-normal text-xs text-s-dark-2">
              TC Paralelo Bs {tcActual.toFixed(2)} · Actualizado hoy
            </p>
          </div>

          {/* Col 3 — Cobertura (global) */}
          <div className="pl-0 md:pl-10 pt-5 md:pt-0">
            <span className="inline-block bg-transparent text-s-dark-3 font-s-body text-[11px] font-medium tracking-[0.5px] uppercase px-3 py-0.5 mb-4 border border-[#2A2A2A] rounded-full">
              Cobertura
            </span>
            <p
              className="font-s-display font-medium text-s-dark-1 leading-none mb-2"
              style={{ fontSize: 'clamp(32px, 4.5vw, 56px)', letterSpacing: '-1.5px', fontVariantNumeric: 'tabular-nums' }}
            >
              {heroMetrics.propertyCount}
            </p>
            <p className="font-s-body font-light text-[13px] text-s-dark-3 tracking-[0.5px] uppercase mb-2">
              Departamentos en venta
            </p>
            <p className="font-s-body font-normal text-xs text-s-dark-2">
              + {totalAlquilerGlobal} en alquiler · {microzonas.length} zonas
            </p>
          </div>
        </div>

        {/* Footer — CTA + actualización */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-4 transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <Link
            href="/alquileres"
            prefetch={false}
            className="inline-flex items-center gap-2 bg-s-arena text-s-negro font-s-body font-medium text-sm px-7 py-3 min-h-[48px] no-underline rounded-s-btn transition-transform duration-200 hover:-translate-y-px"
          >
            Ver alquileres en Equipetrol →
          </Link>
          <p className="font-s-body text-[12px] text-s-dark-3 tracking-[0.3px] flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-s-salvia flex-shrink-0" />
            C21, Remax, Bien Inmuebles · Actualizado cada 6 horas
          </p>
        </div>
      </div>
    </section>
  )
}
