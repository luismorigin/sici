import Link from 'next/link'

interface FilterChip {
  label: string
  value: string
  onRemove: () => void
}

interface ResultsHeaderPremiumProps {
  count: number
  filtros: FilterChip[]
  onEditarFiltros: () => void
}

export default function ResultsHeaderPremium({ count, filtros, onEditarFiltros }: ResultsHeaderPremiumProps) {
  return (
    <div className="bg-[#0a0a0a] border-b border-white/10">
      <div className="max-w-6xl mx-auto px-8 py-12">
        {/* Label */}
        <div className="flex items-center gap-4 mb-6">
          <span className="w-8 h-px bg-[#c9a959]" />
          <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">Resultados</span>
        </div>

        {/* Title */}
        <h1 className="font-display text-white text-4xl md:text-5xl font-light mb-4">
          <span className="text-[#c9a959]">{count}</span> departamentos<br />
          <span className="italic">en Equipetrol</span>
        </h1>

        {/* Filter chips */}
        {filtros.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-8">
            <span className="text-white/40 text-sm">Filtros:</span>
            {filtros.map((filtro, i) => (
              <button
                key={i}
                onClick={filtro.onRemove}
                className="group flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/70 hover:border-[#c9a959]/50 transition-colors"
              >
                {filtro.label}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="opacity-50 group-hover:opacity-100"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            ))}
            <button
              onClick={onEditarFiltros}
              className="text-[#c9a959] text-sm hover:underline"
            >
              Editar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
