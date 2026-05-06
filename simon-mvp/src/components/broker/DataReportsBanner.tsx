// Banner persistente: muestra al broker cuántos de sus reportes están
// pendientes o en revisión por SICI. Loop emocional "SICI está trabajando
// en lo que reporté" sin requerir notification center ni email.
//
// Render: solo si count > 0. El padre (ventas.tsx / alquileres.tsx) ya
// hace el fetch de los reportes propios al mount para poblar reportedIds
// (persistencia visual de cards "Reportada"); este componente recibe el
// count derivado de ese mismo state. Single source of truth.
//
// Migración 240. Brief: docs/broker/REPORTES_DATOS_BRIEF.md.

interface Props {
  count: number
}

export default function DataReportsBanner({ count }: Props) {
  if (count <= 0) return null

  const text =
    count === 1
      ? '1 propiedad reportada — SICI la está revisando.'
      : `${count} propiedades reportadas — SICI las está revisando.`

  return (
    <div
      role="status"
      style={{
        background: '#EDE8DC',
        borderLeft: '3px solid #3A6A48',
        color: '#141414',
        padding: '12px 16px',
        margin: '12px 16px',
        borderRadius: '0 12px 12px 0',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3A6A48"
        strokeWidth="2"
        style={{ width: 18, height: 18, flexShrink: 0 }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span>{text}</span>
    </div>
  )
}
