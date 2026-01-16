import FilterBar, { FiltrosNivel1 } from '@/components/FilterBar'
import InternalHeader from '@/components/InternalHeader'
import { useState } from 'react'

export default function FiltrosPage() {
  const [lastFiltros, setLastFiltros] = useState<FiltrosNivel1 | null>(null)
  const [lastCount, setLastCount] = useState<number>(0)

  const handleFiltrosChange = (filtros: FiltrosNivel1, count: number) => {
    setLastFiltros(filtros)
    setLastCount(count)
  }

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="min-h-screen bg-gray-100">
      <InternalHeader />
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <FilterBar onFiltrosChange={handleFiltrosChange} />

        {/* Debug info - solo en desarrollo */}
        {isDev && lastFiltros && (
          <div className="mt-8 bg-gray-800 text-green-400 p-4 rounded-lg font-mono text-sm">
            <p className="text-gray-400 mb-2">// Debug: Estado actual</p>
            <pre>{JSON.stringify(lastFiltros, null, 2)}</pre>
            <p className="text-yellow-400 mt-4">// Resultados: {lastCount}</p>
          </div>
        )}
      </div>
    </div>
  )
}
