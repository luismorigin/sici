export default function ComoFuncionaSection() {
  const pasos = [
    {
      num: '01 — DATO',
      titulo: 'Datos reales del mercado',
      desc: 'Simon recopila publicaciones activas todos los días. Sabe qué hay disponible, a cuánto, y cómo se mueve el precio en cada microzona de Equipetrol.',
    },
    {
      num: '02 — INTERPRETACIÓN',
      titulo: 'Qué significa para vos',
      desc: 'No te da una tabla de Excel. Te muestra si el precio está bien para la zona, si está inflado, cuántas opciones hay — con el contexto del mercado real detrás.',
    },
    {
      num: '03 — ACCIÓN',
      titulo: 'Decidís con información real',
      desc: 'Alquilar, comprar, esperar o negociar. Simon te da los datos que necesitás para tomar la decisión — sin rodeos, sin que nadie te venda nada.',
    },
  ]

  return (
    <section className="bg-s-arena px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto">
        <p className="font-s-body font-normal text-xs text-s-piedra tracking-[0.5px] uppercase mb-12">
          Cómo funciona
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3">
          {pasos.map((p, i) => (
            <div
              key={p.num}
              className={`${
                i < pasos.length - 1
                  ? 'pr-0 md:pr-9 pb-7 md:pb-0 border-b md:border-b-0 md:border-r border-s-arena-mid'
                  : 'pr-0'
              } ${i > 0 ? 'pl-0 md:pl-9 pt-7 md:pt-0' : ''}`}
            >
              <p className="font-s-body font-light text-[11px] text-s-piedra tracking-[0.5px] mb-4">
                {p.num}
              </p>
              <h3 className="font-s-display font-medium text-xl text-s-negro tracking-tight mb-2.5">
                {p.titulo}
              </h3>
              <p className="font-s-body font-light text-sm text-s-tinta leading-relaxed">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
