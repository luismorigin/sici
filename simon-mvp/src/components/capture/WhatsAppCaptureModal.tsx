import { useEffect, useState } from 'react'
import { isValidBolivianPhone, normalizePhone } from '@/lib/phone'
import PhoneInput from './PhoneInput'

interface Props {
  isOpen: boolean
  propertyName?: string
  onSubmit: (normalizedPhone: string, consent: boolean) => void
  onSkip: () => void
  onDismiss: () => void
  isSubmitting: boolean
  showSuccess: boolean
  onFilled?: () => void
  onConsentToggle?: (next: boolean) => void
}

export default function WhatsAppCaptureModal({
  isOpen,
  propertyName,
  onSubmit,
  onSkip,
  onDismiss,
  isSubmitting,
  showSuccess,
  onFilled,
  onConsentToggle,
}: Props) {
  const [phoneValue, setPhoneValue] = useState('')
  const [consent, setConsent] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reset al abrir — vacío para que browsers ofrezcan autofill de teléfonos
  useEffect(() => {
    if (isOpen) {
      setPhoneValue('')
      setConsent(true)
      setError(null)
    }
  }, [isOpen])

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isOpen])

  // ESC para cerrar
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isSubmitting) onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, isSubmitting, onDismiss])

  function handleSubmit() {
    if (isSubmitting) return
    if (!isValidBolivianPhone(phoneValue)) {
      setError('Ingresá un número boliviano válido (celular 7xxxxxxx)')
      return
    }
    const normalized = normalizePhone(phoneValue)!
    setError(null)
    onSubmit(normalized, consent)
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return
    if (isSubmitting) return
    onDismiss()
  }

  function handleConsentChange(next: boolean) {
    setConsent(next)
    onConsentToggle?.(next)
  }

  if (!isOpen) return null

  const displayName = propertyName && propertyName.trim() ? propertyName : 'este proyecto'

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 z-[1000] bg-black/60 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wa-capture-title"
    >
      <div className="relative w-full sm:max-w-md bg-[#EDE8DC] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {!isSubmitting && !showSuccess && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar"
            className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full text-[#3A3530] hover:bg-[#D8D0BC]/50 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}

        {showSuccess ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#3A6A48] flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 className="font-[var(--font-figtree)] text-xl text-[#141414] mb-1">Listo, te avisamos</h3>
            <p className="font-[var(--font-dm-sans)] text-sm text-[#7A7060]">Abriendo WhatsApp del broker...</p>
          </div>
        ) : (
          <div className="p-6 sm:p-7">
            <h2 id="wa-capture-title" className="font-[var(--font-figtree)] text-2xl sm:text-[26px] leading-tight text-[#141414] mb-1">
              Te conectamos con el broker
            </h2>
            <p className="font-[var(--font-dm-sans)] text-sm text-[#7A7060] mb-5">
              Antes de seguir a WhatsApp...
            </p>

            <div className="rounded-xl bg-[#FAFAF8] border border-[#D8D0BC] p-4 mb-5">
              <p className="font-[var(--font-dm-sans)] text-sm text-[#3A3530] leading-relaxed mb-2">
                Si dejás tu WhatsApp:
              </p>
              <ul className="font-[var(--font-dm-sans)] text-sm text-[#3A3530] leading-relaxed space-y-1.5 list-none">
                <li className="flex gap-2"><span className="text-[#3A6A48] mt-0.5">•</span><span>Te avisamos si baja el precio de <strong className="text-[#141414]">{displayName}</strong></span></li>
                <li className="flex gap-2"><span className="text-[#3A6A48] mt-0.5">•</span><span>Te avisamos si aparecen unidades nuevas en el proyecto</span></li>
                <li className="flex gap-2"><span className="text-[#3A6A48] mt-0.5">•</span><span>Nos aseguramos que el broker te responda</span></li>
              </ul>
            </div>

            <label className="block font-[var(--font-dm-sans)] text-xs uppercase tracking-wider text-[#7A7060] mb-2">
              Tu WhatsApp
            </label>
            <PhoneInput
              value={phoneValue}
              onChange={(v) => { setPhoneValue(v); if (error) setError(null) }}
              disabled={isSubmitting}
              autoFocus
              error={error}
              onFirstChars={onFilled}
            />

            <label className="flex items-start gap-3 mt-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => handleConsentChange(e.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 w-5 h-5 accent-[#3A6A48] cursor-pointer"
              />
              <span className="font-[var(--font-dm-sans)] text-sm text-[#3A3530] leading-snug">
                Avísame si baja el precio o aparecen unidades nuevas
              </span>
            </label>

            <div className="flex flex-col sm:flex-row gap-2 mt-6">
              <button
                type="button"
                onClick={onSkip}
                disabled={isSubmitting}
                className="order-2 sm:order-1 min-h-[48px] px-4 py-3 rounded-xl border border-[#D8D0BC] bg-transparent text-[#3A3530] font-[var(--font-dm-sans)] text-sm hover:bg-[#D8D0BC]/40 transition disabled:opacity-60"
              >
                Solo contactar al broker
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="order-1 sm:order-2 flex-1 min-h-[48px] px-4 py-3 rounded-xl bg-[#141414] text-white font-[var(--font-dm-sans)] font-medium text-sm hover:bg-[#2a2a2a] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting
                  ? 'Enviando…'
                  : consent ? 'Contactar y recibir alertas' : 'Contactar al broker'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
