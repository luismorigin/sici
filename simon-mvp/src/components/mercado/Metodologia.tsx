import { useState } from 'react'

export function Metodologia() {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mb-12">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-left w-full"
      >
        <h2
          className="text-2xl font-light"
          style={{ fontFamily: 'var(--font-cormorant)' }}
        >
          Metodología
        </h2>
        <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-4 text-sm text-gray-600 space-y-4 leading-relaxed max-w-3xl">
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Fuentes de datos</h3>
            <p>
              Los datos provienen del monitoreo continuo de las principales plataformas
              inmobiliarias de Santa Cruz de la Sierra: Century 21, Remax y Bien Inmuebles.
              El sistema SICI (Sistema Inteligente de Captura Inmobiliaria) recopila,
              enriquece y consolida los listings diariamente.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Cobertura geográfica</h3>
            <p>
              Este informe cubre las 5 zonas principales de Equipetrol: Equipetrol Centro,
              Equipetrol Norte, Equipetrol Oeste, Sirari y Villa Brígida. Las zonas se
              definen mediante polígonos geográficos PostGIS y se asignan automáticamente
              por coordenadas GPS.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Filtros de calidad</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Solo departamentos en venta con status activo (completado/actualizado)</li>
              <li>Excluye duplicados, parqueos, bauleras, garajes y depósitos</li>
              <li>Área mínima: 20 m²</li>
              <li>Máximo 300 días en mercado (730 para preventa/en construcción)</li>
              <li>Excluye listings multi-proyecto (evita doble conteo)</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Normalización de precios</h3>
            <p>
              Los precios publicados en bolivianos con tipo de cambio paralelo se normalizan
              al equivalente USD oficial para comparabilidad. La función{' '}
              <code className="bg-gray-100 px-1 rounded text-xs">precio_normalizado()</code>{' '}
              ajusta automáticamente: si el listing usa TC paralelo, el precio se convierte
              como <code className="bg-gray-100 px-1 rounded text-xs">precio × TC_paralelo / 6.96</code>.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Métricas</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Mediana</strong>: valor central (percentil 50). Más robusto que el promedio ante outliers.</li>
              <li><strong>Rango P25–P75</strong>: rango intercuartílico, donde se concentra el 50% central del mercado.</li>
              <li>
                <strong>Actividad de mercado (absorción)</strong>: porcentaje de listings retirados
                en los últimos 30 días sobre el inventario activo. Incluye ventas reales,
                pero también vencimientos de exclusividad, cambios de broker o retiros
                temporales. Debe interpretarse como un indicador de actividad de mercado,
                no como ventas confirmadas.
              </li>
              <li><strong>$/m² en gráfico</strong>: promedio ponderado de los snapshots diarios (no mediana).</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-800 mb-1">Frecuencia de actualización</h3>
            <p>
              Los datos se regeneran cada 24 horas. El pipeline nocturno de SICI ejecuta
              discovery, enrichment, merge y matching entre las 1:00 y 9:00 AM (hora Bolivia).
              Esta página se reconstruye automáticamente tras cada ciclo.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
