// Modal: Reportar dato incorrecto de una propiedad (broker → SICI).
// Renderiza via createPortal para escapar del stacking context del feed.
// Inline styles para evitar conflictos. Patrón espeja a ShortlistSendModal.
//
// Multi-select sobre 8 tipos de error. tipo "ya_alquilada" solo en alquiler,
// "vendida_pero_activa" solo en venta. Textarea opcional max 200 chars.
// Submit POST /api/broker/property-reports. Response 200 con duplicate=true
// no es un error: el caller muestra toast "ya reportaste" en vez del verde.
//
// Schema y decisiones: docs/broker/REPORTES_DATOS_BRIEF.md, migración 240.

import { CSSProperties, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ALL_TIPOS,
  TIPO_LABELS_LARGOS,
  type PropertyReportTipo,
} from '@/types/broker-property-report'

interface Props {
  isOpen: boolean
  onClose: () => void
  brokerSlug: string
  propiedadId: number
  propiedadLabel: string
  tipoOperacion: 'venta' | 'alquiler'
  /** Si true, pre-marca el checkbox "TC sospechoso" (canaliza el badge interno). */
  tcSospechosoFlag?: boolean
  /**
   * Callback al submit exitoso. duplicate=true significa que ya había un
   * reporte pendiente del mismo broker+prop (server retorna 200, no 201).
   */
  onSuccess: (duplicate: boolean) => void
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20, 20, 20, 0.55)',
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
}

const modalStyle: CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 12,
  maxWidth: 520,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  padding: 24,
  fontFamily: 'inherit',
  color: '#141414',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
}

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  margin: 0,
}

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 22,
  lineHeight: 1,
  color: '#7A7060',
  padding: 4,
}

const propLabelStyle: CSSProperties = {
  fontSize: 13,
  color: '#7A7060',
  marginBottom: 18,
}

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: '0 0 18px 0',
}

const legendStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#141414',
  marginBottom: 10,
  padding: 0,
}

const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '8px 0',
  fontSize: 14,
  cursor: 'pointer',
  lineHeight: 1.4,
}

const notaLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#141414',
  marginBottom: 6,
}

const textareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 70,
  padding: 10,
  border: '1px solid #D8D2C2',
  borderRadius: 8,
  fontSize: 14,
  fontFamily: 'inherit',
  resize: 'vertical',
  background: '#FAF7F0',
  boxSizing: 'border-box',
}

const counterStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: '#7A7060',
  textAlign: 'right',
  marginTop: 4,
}

const errorStyle: CSSProperties = {
  background: '#FFE7E7',
  border: '1px solid #E05555',
  color: '#A03030',
  padding: 10,
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 12,
}

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 8,
}

const cancelBtnStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #D8D2C2',
  color: '#141414',
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
}

const ctaBtnStyle: CSSProperties = {
  background: '#3A6A48',
  border: 'none',
  color: '#FFFFFF',
  padding: '10px 18px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
}

const ctaDisabledStyle: CSSProperties = {
  ...ctaBtnStyle,
  background: '#A8B5A8',
  cursor: 'not-allowed',
}

export default function ReportPropertyModal({
  isOpen,
  onClose,
  brokerSlug,
  propiedadId,
  propiedadLabel,
  tipoOperacion,
  tcSospechosoFlag = false,
  onSuccess,
}: Props) {
  const [tipos, setTipos] = useState<Set<PropertyReportTipo>>(() => new Set())
  const [nota, setNota] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset al abrir + pre-check si TC sospechoso
  useEffect(() => {
    if (isOpen) {
      const initial = new Set<PropertyReportTipo>()
      if (tcSospechosoFlag) initial.add('tc_sospechoso')
      setTipos(initial)
      setNota('')
      setError(null)
      setSubmitting(false)
    }
  }, [isOpen, tcSospechosoFlag])

  // Render condicional por tipo_operacion
  const tiposVisibles = useMemo<PropertyReportTipo[]>(() => {
    return ALL_TIPOS.filter((t) => {
      if (t === 'ya_alquilada') return tipoOperacion === 'alquiler'
      if (t === 'vendida_pero_activa') return tipoOperacion === 'venta'
      return true
    })
  }, [tipoOperacion])

  const submitDisabled = tipos.size === 0 || submitting

  function toggleTipo(t: PropertyReportTipo) {
    setTipos((prev) => {
      const n = new Set(prev)
      if (n.has(t)) n.delete(t)
      else n.add(t)
      return n
    })
  }

  async function handleSubmit() {
    if (submitDisabled) return
    setSubmitting(true)
    setError(null)
    try {
      const tiposPayload: Partial<Record<PropertyReportTipo, boolean>> = {}
      tipos.forEach((t) => {
        tiposPayload[t] = true
      })
      const res = await fetch('/api/broker/property-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_slug: brokerSlug,
          propiedad_id: propiedadId,
          tipos_error: tiposPayload,
          nota: nota.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'No pudimos enviar el reporte')
      }
      onSuccess(data?.duplicate === true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de red. Reintentar.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  return createPortal(
    <div style={overlayStyle} onClick={onClose} role="presentation">
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="rpm-title"
        aria-modal="true"
      >
        <header style={headerStyle}>
          <h3 id="rpm-title" style={titleStyle}>Reportar dato incorrecto</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={closeBtnStyle}
          >
            ✕
          </button>
        </header>

        <p style={propLabelStyle}>
          #{propiedadId} — {propiedadLabel}
        </p>

        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>¿Qué está mal? (marcá todos los que apliquen)</legend>
          {tiposVisibles.map((t) => (
            <label key={t} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={tipos.has(t)}
                onChange={() => toggleTipo(t)}
                style={{ marginTop: 2 }}
              />
              <span>{TIPO_LABELS_LARGOS[t]}</span>
            </label>
          ))}
        </fieldset>

        <label style={notaLabelStyle}>
          Nota para SICI (opcional)
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 200))}
            maxLength={200}
            placeholder="Ej: el verdadero nombre es Torre Mistral. O sugerencia del valor correcto."
            style={textareaStyle}
            rows={3}
          />
          <span style={counterStyle}>{nota.length} / 200</span>
        </label>

        {error && <div style={errorStyle}>{error}</div>}

        <footer style={footerStyle}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={cancelBtnStyle}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            style={submitDisabled ? ctaDisabledStyle : ctaBtnStyle}
          >
            {submitting ? 'Enviando…' : 'Enviar reporte'}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
