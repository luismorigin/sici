import Link from 'next/link'

export default function ProductosSection() {
  return (
    <section className="bg-s-arena px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto">
        <h2
          className="font-s-display font-medium text-s-negro mb-12"
          style={{ fontSize: 'clamp(22px, 3vw, 36px)', letterSpacing: '-0.5px' }}
        >
          Tres formas de usar Simon
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* ALQUILERES — card destacada */}
          <div className="bg-s-blanco p-7 md:p-8 flex flex-col rounded-s-card border-2 border-s-salvia transition-transform duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(58,53,48,0.08)]">
            <p className="font-s-body font-medium text-[11px] tracking-[0.5px] uppercase mb-4 flex items-center gap-2 text-s-salvia">
              <span className="s-pulse-dot" style={{ width: 6, height: 6 }} />
              Activo
            </p>
            <h3 className="font-s-display font-medium text-[22px] text-s-salvia tracking-tight mb-2.5">
              Alquileres
            </h3>
            <p className="font-s-body font-light text-sm text-s-tinta leading-relaxed flex-1 mb-6">
              180+ departamentos de tres fuentes, actualizados a diario. Filtrá por precio,
              zona, dormitorios, mascotas o parqueo. Compará hasta 3 lado a lado y contactá
              al broker por WhatsApp en minutos.
            </p>
            <div className="mt-auto">
              <Link
                href="/alquileres"
                prefetch={false}
                className="font-s-body font-medium text-sm text-s-arena bg-s-negro px-7 py-3 min-h-[48px] no-underline inline-flex items-center rounded-s-btn transition-transform duration-200 hover:-translate-y-px hover:shadow-[0_4px_16px_rgba(20,20,20,0.12)]"
              >
                Buscar alquileres →
              </Link>
              <p className="font-s-body font-normal text-xs text-s-piedra mt-3">
                Gratis. Sin registro.
              </p>
            </div>
          </div>

          {/* VENTAS */}
          <div className="bg-s-blanco p-7 md:p-8 flex flex-col rounded-s-card border border-s-arena-mid transition-transform duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(58,53,48,0.08)]">
            <p className="font-s-body font-medium text-[11px] tracking-[0.5px] uppercase mb-4 flex items-center gap-2 text-s-salvia">
              <span className="w-1.5 h-1.5 rounded-full bg-s-salvia flex-shrink-0" />
              Activo
            </p>
            <h3 className="font-s-display font-medium text-[22px] text-s-salvia tracking-tight mb-2.5">
              Ventas
            </h3>
            <p className="font-s-body font-light text-sm text-s-tinta leading-relaxed flex-1 mb-6">
              300+ departamentos en venta con precio por m² por zona. Ves si lo que te
              ofrecen está arriba o abajo del mercado. Fotos, mapa, filtros y contacto directo.
            </p>
            <div className="mt-auto">
              <Link
                href="/ventas"
                prefetch={false}
                className="font-s-body font-medium text-[13px] text-s-negro no-underline inline-flex items-center gap-1 hover:gap-2 transition-all"
              >
                Explorar ventas →
              </Link>
            </div>
          </div>

          {/* MERCADO */}
          <div className="bg-s-blanco p-7 md:p-8 flex flex-col rounded-s-card border border-s-arena-mid transition-transform duration-250 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(58,53,48,0.08)]">
            <p className="font-s-body font-medium text-[11px] tracking-[0.5px] uppercase mb-4 flex items-center gap-2 text-s-piedra">
              <span className="w-1.5 h-1.5 rounded-full bg-s-piedra flex-shrink-0" />
              Datos públicos
            </p>
            <h3 className="font-s-display font-medium text-[22px] text-s-salvia tracking-tight mb-2.5">
              Mercado
            </h3>
            <p className="font-s-body font-light text-sm text-s-tinta leading-relaxed flex-1 mb-6">
              El dashboard público de Equipetrol. Precios por zona, por tipología, tendencias.
              Los datos que antes solo tenían los que llevan años en el negocio.
            </p>
            <div className="mt-auto">
              <Link
                href="/mercado/equipetrol"
                prefetch={false}
                className="font-s-body font-medium text-[13px] text-s-negro no-underline inline-flex items-center gap-1 hover:gap-2 transition-all"
              >
                Ver datos del mercado →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
