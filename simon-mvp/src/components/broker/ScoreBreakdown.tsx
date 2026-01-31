/**
 * ScoreBreakdown - Muestra desglose de puntuación de calidad
 *
 * Sistema de 100 pts:
 * - Fotos: 30 pts (8+ fotos)
 * - Data Completa: 40 pts (10 campos)
 * - Fotos Únicas: 20 pts (sin duplicados)
 * - GPS: 10 pts (ubicación)
 */

import { useState } from 'react'

interface DesgloseFotos {
  puntos: number
  max: number
  cantidad: number
  meta: string
}

interface DesgloseData {
  puntos: number
  max: number
  campos_completos: string[]
  campos_faltantes: string[]
  meta: string
}

interface DesgloseFotosUnicas {
  puntos: number
  max: number
  son_unicas: boolean
  meta: string
}

interface DesgloseGPS {
  puntos: number
  max: number
  tiene_gps: boolean
  latitud: number | null
  longitud: number | null
  meta: string
}

interface ScoreDesglose {
  fotos: DesgloseFotos
  data_completa: DesgloseData
  fotos_unicas: DesgloseFotosUnicas
  gps: DesgloseGPS
}

interface Props {
  score: number
  desglose: ScoreDesglose | null
  sugerencias?: string[]
  compact?: boolean
}

export default function ScoreBreakdown({ score, desglose, sugerencias, compact = false }: Props) {
  const [expanded, setExpanded] = useState(!compact)

  // Color según score
  const getScoreColor = (score: number) => {
    if (score >= 100) return 'text-green-600 bg-green-100'
    if (score >= 80) return 'text-blue-600 bg-blue-100'
    if (score >= 60) return 'text-amber-600 bg-amber-100'
    return 'text-red-600 bg-red-100'
  }

  const getBarColor = (puntos: number, max: number) => {
    const percent = (puntos / max) * 100
    if (percent >= 100) return 'bg-green-500'
    if (percent >= 66) return 'bg-blue-500'
    if (percent >= 33) return 'bg-amber-500'
    return 'bg-red-500'
  }

  // Mapeo de campos a español
  const campoLabels: Record<string, string> = {
    precio_usd: 'Precio',
    area_m2: 'Área',
    dormitorios: 'Dormitorios',
    banos: 'Baños',
    zona: 'Zona',
    proyecto_nombre: 'Proyecto',
    amenidades: 'Amenidades',
    'amenidades (min 3)': 'Amenidades (mín. 3)',
    parqueo: 'Parqueo',
    expensas_usd: 'Expensas',
    estado_construccion: 'Estado construcción'
  }

  const renderProgressBar = (puntos: number, max: number, label: string) => (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600 w-24 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getBarColor(puntos, max)} transition-all duration-500`}
          style={{ width: `${(puntos / max) * 100}%` }}
        />
      </div>
      <span className="text-sm font-medium text-slate-700 w-16 text-right">
        {puntos}/{max}
      </span>
    </div>
  )

  if (!desglose) {
    return (
      <div className={`${getScoreColor(score)} px-4 py-2 rounded-lg inline-flex items-center gap-2`}>
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-sm">/100 pts</span>
      </div>
    )
  }

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={`${getScoreColor(score)} px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 transition-opacity`}
      >
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-sm">/100 pts</span>
        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header con score total */}
      <div
        className={`${getScoreColor(score)} px-4 py-3 flex items-center justify-between cursor-pointer`}
        onClick={() => compact && setExpanded(false)}
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold">{score}</span>
          <div>
            <span className="text-sm font-medium">/100 puntos</span>
            {score >= 100 && (
              <span className="ml-2 text-xs bg-white/30 px-2 py-0.5 rounded-full">
                Calidad Perfecta
              </span>
            )}
          </div>
        </div>
        {compact && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        )}
      </div>

      {/* Desglose */}
      <div className="p-4 space-y-4">
        {/* Fotos */}
        <div>
          {renderProgressBar(desglose.fotos.puntos, desglose.fotos.max, 'Fotos')}
          <p className="text-xs text-slate-500 mt-1 ml-[108px]">
            {desglose.fotos.cantidad} fotos • {desglose.fotos.meta}
          </p>
        </div>

        {/* Data Completa */}
        <div>
          {renderProgressBar(desglose.data_completa.puntos, desglose.data_completa.max, 'Datos')}
          <p className="text-xs text-slate-500 mt-1 ml-[108px]">
            {desglose.data_completa.campos_completos.length}/10 campos completos
          </p>
          {desglose.data_completa.campos_faltantes.length > 0 && (
            <p className="text-xs text-amber-600 mt-0.5 ml-[108px]">
              Falta: {desglose.data_completa.campos_faltantes.map(c => campoLabels[c] || c).join(', ')}
            </p>
          )}
        </div>

        {/* Fotos Únicas */}
        <div>
          {renderProgressBar(desglose.fotos_unicas.puntos, desglose.fotos_unicas.max, 'Originalidad')}
          <p className="text-xs text-slate-500 mt-1 ml-[108px]">
            {desglose.fotos_unicas.son_unicas ? 'Fotos originales' : 'Fotos duplicadas detectadas'}
          </p>
        </div>

        {/* GPS */}
        <div>
          {renderProgressBar(desglose.gps.puntos, desglose.gps.max, 'Ubicación')}
          <p className="text-xs text-slate-500 mt-1 ml-[108px]">
            {desglose.gps.tiene_gps ? 'GPS verificado' : 'Sin ubicación GPS'}
          </p>
        </div>

        {/* Sugerencias */}
        {sugerencias && sugerencias.length > 0 && score < 100 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-medium text-slate-700 mb-2">Para mejorar tu score:</h4>
            <ul className="space-y-1">
              {sugerencias.map((sug, i) => (
                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  {sug}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Badge de Calidad Perfecta */}
        {score >= 100 && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-center">
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Elegible para CMA gratis</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              5 propiedades con 100 pts = 1 CMA gratuito
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
