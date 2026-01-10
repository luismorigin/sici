interface PropertyCardProps {
  nombre: string
  precio: number
  dormitorios: number
  area: number
  matchScore: number
  confianza?: number
}

export default function PropertyCard({
  nombre,
  precio,
  dormitorios,
  area,
  matchScore,
  confianza = 89
}: PropertyCardProps) {
  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden hover:border-brand-primary hover:-translate-y-1 transition-all">
      {/* Header */}
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
        <span className="font-bold text-brand-dark">{nombre}</span>
        <span className="text-xs font-bold bg-state-success-bg text-emerald-700 px-2 py-1 rounded">
          {matchScore}% Match
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="text-xl font-bold text-brand-dark mb-2">
          ${precio.toLocaleString()}
        </div>

        <div className="flex gap-4 text-sm text-slate-500 mb-3">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {dormitorios}
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            {area}m²
          </div>
        </div>

        <div className="flex justify-between text-xs pt-3 border-t border-slate-100 text-slate-400">
          <span>Confianza Datos</span>
          <span className={`font-semibold ${confianza >= 85 ? 'text-state-success' : 'text-slate-600'}`}>
            {confianza}%
          </span>
        </div>
      </div>
    </div>
  )
}
