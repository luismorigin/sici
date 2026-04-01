export default function ProblemaSection() {
  const antes = [
    'Tres portales abiertos, cada uno con su parte del mercado.',
    'Anuncios de hace meses que siguen apareciendo como nuevos.',
    'Precios sin contexto: no sabés si Bs 3.500 es caro o barato para esa zona.',
    'Fotos de un departamento, datos de otro.',
    'Cada inmobiliaria tiene su parte del mercado. Ninguna te muestra todo junto.',
  ]

  const despues = [
    'Tres fuentes en un solo feed. Lo que está en Century 21, Remax y Bien Inmuebles, junto.',
    'Se actualiza todos los días: si ya se alquiló, sale. Si es nuevo, entra.',
    'Precio con contexto: ves la mediana de la zona y sabés dónde cae cada departamento.',
    'Buscá por lo que te importa: mascotas, amoblado, parqueo, dormitorios, precio.',
    'Compará hasta 3 lado a lado y contactá al broker por WhatsApp. Sin formularios, sin registro.',
  ]

  return (
    <section className="bg-s-negro px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto">
        <h2
          className="font-s-display font-medium text-s-dark-1 mb-14"
          style={{ fontSize: 'clamp(22px, 3vw, 36px)', letterSpacing: '-0.5px' }}
        >
          Buscar depto en Equipetrol, hoy
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
          {/* Antes */}
          <div>
            <h3 className="font-s-display font-medium text-lg text-s-dark-2 mb-7">
              Así se busca hoy
            </h3>
            <ul className="list-none m-0 p-0 flex flex-col gap-5">
              {antes.map((item, i) => (
                <li
                  key={i}
                  className="font-s-body font-light text-[15px] text-s-dark-3 leading-relaxed pl-5 relative"
                >
                  <span className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full bg-[#4A4440]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Después */}
          <div>
            <h3 className="font-s-display font-medium text-lg text-s-dark-1 mb-7">
              Con Simon
            </h3>
            <ul className="list-none m-0 p-0 flex flex-col gap-5">
              {despues.map((item, i) => (
                <li
                  key={i}
                  className="font-s-body font-light text-[15px] text-s-dark-1 leading-relaxed pl-5 relative"
                >
                  <span className="absolute left-0 top-[9px] w-1.5 h-1.5 rounded-full bg-s-salvia" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
