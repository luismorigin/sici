export default function ComoFuncionaSection() {
  const pasos = [
    {
      num: '1',
      titulo: 'Data',
      desc: 'Cada noche Simon recopila de Century 21, Remax y Bien Inmuebles. Los anuncios que ya no existen salen, los nuevos entran. Lo que ves es lo que hay hoy.',
    },
    {
      num: '2',
      titulo: 'Contexto',
      desc: 'Cada departamento tiene el precio mediano de su zona al lado. Sabés si está por arriba, por abajo o en el promedio. Sin preguntarle a nadie — el dato está ahí.',
    },
    {
      num: '3',
      titulo: 'Acción',
      desc: 'Filtrá por lo que te importa, compará hasta 3 lado a lado, y contactá al broker por WhatsApp con un mensaje pre-armado. Del feed a la conversación en minutos.',
    },
  ]

  return (
    <section className="bg-s-arena px-6 md:px-12 py-24">
      <div className="max-w-[1100px] mx-auto">
        <h2
          className="font-s-display font-medium text-s-negro mb-14"
          style={{ fontSize: 'clamp(22px, 3vw, 36px)', letterSpacing: '-0.5px' }}
        >
          Del dato al WhatsApp en tres pasos
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {pasos.map((p) => (
            <div key={p.num}>
              <div
                className="font-s-display font-medium text-s-arena-mid leading-none mb-4"
                style={{ fontSize: '48px', letterSpacing: '-2px' }}
              >
                {p.num}
              </div>
              <h3 className="font-s-display font-medium text-xl text-s-negro tracking-tight mb-3">
                {p.titulo}
              </h3>
              <p className="font-s-body font-light text-[15px] text-s-tinta leading-relaxed">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
