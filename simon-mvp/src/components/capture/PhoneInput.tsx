import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  autoFocus?: boolean
  error?: string | null
  onFirstChars?: () => void
}

export default function PhoneInput({ value, onChange, disabled, autoFocus, error, onFirstChars }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const firedFirstChars = useRef(false)

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Focus diferido: da chance a Chrome/iOS de sugerir autofill
      const t = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    }
  }, [autoFocus])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // No transformamos el input mientras el user tipea (evita bugs de cursor).
    // normalizePhone hace la magia al validar/submit: acepta "76308808",
    // "591 76308808", "+591 76308808" — todos terminan como "+59176308808".
    const raw = e.target.value
    onChange(raw)
    if (!firedFirstChars.current) {
      const digitsAfterPrefix = raw.replace(/\D/g, '').replace(/^591/, '')
      if (digitsAfterPrefix.length >= 4) {
        firedFirstChars.current = true
        onFirstChars?.()
      }
    }
  }

  return (
    <div className="s-phone-input-wrap">
      <div
        className={[
          'rounded-xl border bg-[#FAFAF8] px-4 py-3',
          error ? 'border-red-400' : 'border-[#D8D0BC] focus-within:border-[#141414]',
          disabled ? 'opacity-60' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          name="whatsapp"
          disabled={disabled}
          placeholder="+591 76308808"
          value={value}
          onChange={handleChange}
          className="w-full bg-transparent outline-none font-[var(--font-dm-sans)] text-base text-[#141414] placeholder:text-[#c4b8a2] tabular-nums"
          aria-label="Tu número de WhatsApp"
          aria-invalid={!!error}
        />
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600 font-[var(--font-dm-sans)]">{error}</p>
      )}
      {!error && (
        <p className="mt-2 text-xs text-[#7A7060] font-[var(--font-dm-sans)]">
          Celular (8 dígitos). El +591 se agrega automático.
        </p>
      )}
    </div>
  )
}
