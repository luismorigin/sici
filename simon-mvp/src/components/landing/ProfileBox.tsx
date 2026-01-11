interface ProfileBoxProps {
  perfil: string
  presupuesto: number
  prioridades: string[]
  sensibilidad: 'alta' | 'media' | 'baja'
}

export default function ProfileBox({
  perfil = 'Hogar Estratégico de Valor',
  presupuesto = 90000,
  prioridades = ['Seguridad', 'Piso Medio/Alto', 'Piscina'],
  sensibilidad = 'alta'
}: ProfileBoxProps) {
  const sensibilidadColor = {
    alta: 'text-state-danger',
    media: 'text-state-warning',
    baja: 'text-state-success'
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8">
      <div className="flex flex-wrap justify-between gap-6">
        <div>
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Perfil Fiduciario</h5>
          <p className="font-semibold text-brand-dark">{perfil}</p>
        </div>

        <div>
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Presupuesto Objetivo</h5>
          <p className="font-semibold text-brand-dark">${presupuesto.toLocaleString('en-US')}</p>
        </div>

        <div>
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Prioridades</h5>
          <div className="flex flex-wrap gap-2">
            {prioridades.map((p, i) => (
              <span key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-brand-dark">
                {p}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Sensibilidad Precio</h5>
          <p className={`font-semibold capitalize ${sensibilidadColor[sensibilidad]}`}>
            {sensibilidad}
          </p>
        </div>
      </div>
    </div>
  )
}
