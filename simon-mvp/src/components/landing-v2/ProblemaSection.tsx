export default function ProblemaSection() {
  const verdades = [
    {
      antes: 'Portales con precios desactualizados',
      simon: 'Datos actualizados todos los días desde tres fuentes',
    },
    {
      antes: 'USD oficial y paralelo mezclados sin criterio',
      simon: 'Todos los precios normalizados al tipo de cambio oficial',
    },
    {
      antes: 'Consejos basados en experiencia o conveniencia',
      simon: 'Interpretación de datos — sin opiniones, sin comisiones',
    },
    {
      antes: '"Es buen precio" sin ningún dato detrás',
      simon: 'El m² exacto de la zona, la tendencia, y qué hacer con eso',
    },
  ]

  return (
    <section className="bg-s-negro px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-start">
        {/* Left — copy */}
        <div>
          <p className="font-s-mono font-normal text-[11px] text-s-dark-3 tracking-[1px] uppercase mb-6">
            Por qué existe Simon
          </p>
          <h2
            className="font-s-display font-medium text-s-dark-1 leading-tight mb-5"
            style={{ fontSize: 'clamp(26px, 3.5vw, 44px)', letterSpacing: '-1px' }}
          >
            El mercado funciona con información asimétrica.
          </h2>
          <p className="font-s-body font-light text-[15px] text-s-dark-2 leading-relaxed">
            Los brokers saben más que vos. Pero su información es parcial,
            desactualizada, y sesgada por su captación. Los compradores e
            inquilinos confían en alguien con incentivos distintos a los suyos.
            <br /><br />
            Simon cierra esa brecha. Sin reemplazar al broker — dándote la misma
            información de base que antes solo tenían los que llevaban años en
            el mercado.
          </p>
        </div>

        {/* Right — antes vs Simon */}
        <div>
          {verdades.map((v, i) => (
            <div
              key={i}
              className={`py-5 ${i < verdades.length - 1 ? 'border-b border-[#232323]' : ''} ${i === 0 ? 'pt-0' : ''}`}
            >
              <p className="font-s-mono font-light text-xs text-s-dark-3 mb-1.5 line-through" style={{ textDecorationColor: '#333' }}>
                {v.antes}
              </p>
              <p className="font-s-body font-normal text-[15px] text-s-dark-1 leading-snug">
                {v.simon}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
