/**
 * Shared lock/unlock toggle icon for field-level blocking
 * Used in propiedades/[id], AmenitiesEditor, PaymentPlanEditor
 */

interface LockIconProps {
  campo: string
  estaCampoBloqueado: (c: string) => boolean
  toggleBloqueo: (c: string) => Promise<void>
}

export default function LockIcon({ campo, estaCampoBloqueado, toggleBloqueo }: LockIconProps) {
  const bloqueado = estaCampoBloqueado(campo)
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleBloqueo(campo) }}
      className={`ml-2 text-sm transition-colors ${bloqueado ? 'text-amber-600 hover:text-amber-800' : 'text-slate-300 hover:text-slate-500'}`}
      title={bloqueado ? '🔒 Campo bloqueado - Click para desbloquear' : '🔓 Campo desbloqueado - Click para bloquear'}
    >
      {bloqueado ? '🔒' : '🔓'}
    </button>
  )
}
