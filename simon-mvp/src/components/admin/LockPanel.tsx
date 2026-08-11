/**
 * Expandable lock panel showing all locked fields
 * Extracted from propiedades/[id].tsx lines 1741-1783
 */
import type { PropiedadOriginal } from '@/types/propiedad-editor'

interface LockPanelProps {
  camposBloqueados: string[]
  originalData: PropiedadOriginal
  formatFecha: (fecha: string) => string
  desbloquearCampo: (campo: string) => Promise<void>
  desbloquearTodos: () => Promise<void>
}

export default function LockPanel({ camposBloqueados, originalData, formatFecha, desbloquearCampo, desbloquearTodos }: LockPanelProps) {
  if (camposBloqueados.length === 0) return null

  return (
    <div className="w-full mt-2 p-4 bg-purple-50 rounded-lg border border-purple-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-purple-800">🔒 Campos Bloqueados</h4>
        <button
          type="button"
          onClick={desbloquearTodos}
          className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors"
        >
          🔓 Desbloquear todos
        </button>
      </div>
      {/* El texto anterior decía "protegidos del merge nocturno". Ese merge era del pipeline n8n,
          apagado el 28-jul-2026: prometía una protección que había cambiado de dueño. Hoy quien
          podría pisar el valor es la RE-LECTURA del cron híbrido (la captura normal solo agrega
          propiedades nuevas, no toca las existentes), y desde el 11-ago los cargadores respetan
          el candado. Ver docs/backlog/ADMIN_ANALISIS_2026-08-11.md */}
      <p className="text-sm text-purple-600 mb-3">
        Lo que bloquees queda protegido cuando el sistema vuelve a leer el anuncio: tu valor gana sobre
        el del portal. Al desbloquear, la próxima lectura vuelve a mandar.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {camposBloqueados.map(campo => {
          const info = originalData.campos_bloqueados?.[campo]
          const esObjeto = typeof info === 'object' && info !== null
          const fecha = esObjeto && info?.fecha ? formatFecha(info.fecha) : null
          const por = esObjeto ? info?.usuario_nombre || info?.por : 'Sistema'

          return (
            <div key={campo} className="flex items-center justify-between bg-white p-3 rounded-lg border border-purple-100">
              <div>
                <span className="font-medium text-slate-800">{campo}</span>
                <span className="text-xs text-slate-500 block">
                  {por && `por ${por}`} {fecha && `• ${fecha}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => desbloquearCampo(campo)}
                className="text-sm bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded transition-colors"
              >
                🔓
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
