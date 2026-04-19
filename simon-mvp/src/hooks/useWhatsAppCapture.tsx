import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { trackEvent } from '@/lib/analytics'
import { fbqTrack } from '@/lib/meta-pixel'
import { getStoredPhone, setStoredPhone } from '@/lib/user-phone'
import { getVisitorId } from '@/lib/visitor'
import WhatsAppCaptureModal from '@/components/capture/WhatsAppCaptureModal'

// Interface mínima: cualquier unidad (alquiler o venta Fase 3) que cumpla estos
// campos funciona con el hook. Evita acoplamiento a UnidadAlquiler específico.
export interface CaptureProperty {
  id: number
  agente_whatsapp: string | null
  nombre_edificio: string | null
  nombre_proyecto: string | null
  zona: string
  precio_mensual_bob: number
  dormitorios: number
}

// -----------------------------------------------------------------------------
// Dispatcher module-level — permite a sub-componentes llamar trigger sin prop
// drilling. Se registra desde el root que monta el hook.
// Solo debería existir UN instance activo a la vez (una página montada).
// -----------------------------------------------------------------------------
type TriggerFn = (e: React.MouseEvent, p: CaptureProperty, msg: string, fuente: string, preguntas?: string[]) => void
let _moduleTrigger: TriggerFn | null = null

export function triggerWhatsAppCapture(e: React.MouseEvent, p: CaptureProperty, msg: string, fuente: string, preguntas?: string[]) {
  if (_moduleTrigger) {
    _moduleTrigger(e, p, msg, fuente, preguntas)
    return
  }
  // Fallback defensivo: si nadie registró el hook (no debería ocurrir),
  // comportarse como antes — abrir wa.me directo sin modal.
  e.preventDefault()
  const phone = p.agente_whatsapp?.replace(/\D/g, '') || ''
  const finalPhone = phone.startsWith('591') ? phone : `591${phone}`
  const url = `https://wa.me/${finalPhone}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
  window.open(url, '_blank')
}

// -----------------------------------------------------------------------------
// Tracking cooldown (module-level, compartido entre instancias del hook)
// Preserva el comportamiento legacy del click_whatsapp (30s per prop + 5s global)
// -----------------------------------------------------------------------------
const _waCooldown = new Map<number, number>()
let _lastWaClick = 0

function fireLegacyTracking(p: CaptureProperty, fuente: string) {
  const now = Date.now()
  if (now - _lastWaClick < 5_000) return
  const last = _waCooldown.get(p.id) || 0
  if (now - last < 30_000) return
  _waCooldown.set(p.id, now)
  _lastWaClick = now
  trackEvent('click_whatsapp', {
    property_id: p.id,
    property_name: p.nombre_edificio || p.nombre_proyecto || 'Departamento',
    zone: p.zona || '',
    price: p.precio_mensual_bob,
    dorms: p.dormitorios,
    broker_phone: p.agente_whatsapp?.replace(/\D/g, '') || '',
    fuente,
  })
  fbqTrack('Lead', {
    content_name: p.nombre_edificio || p.nombre_proyecto || 'Departamento',
    content_category: 'alquiler',
    value: p.precio_mensual_bob,
    currency: 'BOB',
    fuente,
  })
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  let sid = sessionStorage.getItem('simon_sid')
  if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem('simon_sid', sid) }
  return sid
}

function buildWhatsAppUrl(p: CaptureProperty, msg: string): string {
  const phone = p.agente_whatsapp?.replace(/\D/g, '') || ''
  const finalPhone = phone.startsWith('591') ? phone : `591${phone}`
  return `https://wa.me/${finalPhone}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
}

// -----------------------------------------------------------------------------
// API call
// -----------------------------------------------------------------------------
interface LeadApiPayload {
  phone: string
  msg: string
  prop_id: number
  nombre: string
  zona: string
  precio: number
  dorms: number
  broker_nombre: string
  fuente: string
  preguntas?: string[]
  debug?: string
  sid: string
  utm_source?: string
  utm_content?: string
  utm_campaign?: string
  // Fase 1 modal capture
  usuario_telefono: string | null
  alert_consent: boolean
  visitor_uuid: string
  modal_action: 'submitted' | 'skipped' | 'reused' | 'dismissed'
}

function getUtms() {
  if (typeof window === 'undefined') return {}
  const sp = new URLSearchParams(window.location.search)
  return {
    utm_source: sp.get('utm_source') || undefined,
    utm_content: sp.get('utm_content') || undefined,
    utm_campaign: sp.get('utm_campaign') || undefined,
  }
}

function buildPayload(
  p: CaptureProperty,
  msg: string,
  fuente: string,
  preguntas: string[] | undefined,
  modalAction: LeadApiPayload['modal_action'],
  usuario_telefono: string | null,
  alert_consent: boolean,
): LeadApiPayload {
  const phone = p.agente_whatsapp?.replace(/\D/g, '') || ''
  const name = p.nombre_edificio || p.nombre_proyecto || 'Departamento'
  return {
    phone,
    msg,
    prop_id: p.id,
    nombre: name,
    zona: p.zona || '',
    precio: p.precio_mensual_bob,
    dorms: p.dormitorios ?? 0,
    broker_nombre: '',
    fuente,
    preguntas: preguntas && preguntas.length > 0 ? preguntas : undefined,
    debug: typeof window !== 'undefined' && localStorage.getItem('simon_debug') === '1' ? '1' : undefined,
    sid: getSessionId(),
    ...getUtms(),
    usuario_telefono,
    alert_consent,
    visitor_uuid: getVisitorId(),
    modal_action: modalAction,
  }
}

const PENDING_KEY = 'simon_pending_leads'

function savePendingLead(payload: LeadApiPayload) {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const arr = raw ? (JSON.parse(raw) as LeadApiPayload[]) : []
    arr.push(payload)
    localStorage.setItem(PENDING_KEY, JSON.stringify(arr.slice(-10))) // cap a 10
  } catch { /* ignore */ }
}

async function postLead(payload: LeadApiPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/lead-alquiler', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

// -----------------------------------------------------------------------------
// Hook
// -----------------------------------------------------------------------------
interface ModalState {
  open: boolean
  property: CaptureProperty | null
  msg: string
  fuente: string
  preguntas?: string[]
  waRef: Window | null
}

const EMPTY_STATE: ModalState = {
  open: false,
  property: null,
  msg: '',
  fuente: '',
  preguntas: undefined,
  waRef: null,
}

export function useWhatsAppCapture() {
  const router = useRouter()
  const [state, setState] = useState<ModalState>(EMPTY_STATE)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  // Retry de leads pending (al mount)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return
    try {
      const arr = JSON.parse(raw) as LeadApiPayload[]
      if (!Array.isArray(arr) || arr.length === 0) return
      localStorage.removeItem(PENDING_KEY)
      arr.forEach((p) => { postLead(p).catch(() => savePendingLead(p)) })
    } catch {
      localStorage.removeItem(PENDING_KEY)
    }
  }, [])

  // Cerrar modal al navegar
  useEffect(() => {
    const onRouteChange = () => {
      setState(EMPTY_STATE)
      setIsSubmitting(false)
      setShowSuccess(false)
    }
    router.events.on('routeChangeStart', onRouteChange)
    return () => { router.events.off('routeChangeStart', onRouteChange) }
  }, [router.events])

  // ---------------------------------------------------------------------------
  // trigger: el punto de entrada desde el botón "Contactar WhatsApp"
  // ---------------------------------------------------------------------------
  const trigger = useCallback((
    e: React.MouseEvent,
    p: CaptureProperty,
    msg: string,
    fuente: string,
    preguntas?: string[],
  ) => {
    e.preventDefault()
    if (typeof window === 'undefined') return

    const stored = getStoredPhone()

    // Caso B — phone conocido: sin modal, fetch en background, abrir wa.me ahora
    // (estamos dentro del click handler → window.open cuenta como user gesture)
    if (stored && stored.phone) {
      fireLegacyTracking(p, fuente)
      trackEvent('wa_capture_phone_reused', {
        property_id: p.id,
        zona: p.zona || '',
        operacion: 'alquiler',
        source: fuente,
      })
      const payload = buildPayload(p, msg, fuente, preguntas, 'reused', stored.phone, stored.consent)
      postLead(payload).then((ok) => { if (!ok) savePendingLead(payload) })
      const url = buildWhatsAppUrl(p, msg)
      const opened = window.open(url, '_blank')
      if (!opened) window.location.href = url // fallback si popup bloqueado
      return
    }

    // Caso A — sin phone: mostrar modal (wa.me se abre en submit/skip)
    setState({ open: true, property: p, msg, fuente, preguntas, waRef: null })
    trackEvent('wa_capture_shown', {
      property_id: p.id,
      zona: p.zona || '',
      operacion: 'alquiler',
      source: fuente,
    })
  }, [])

  // ---------------------------------------------------------------------------
  // onSubmit: usuario llenó phone y submiteo (Caso A submit)
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(async (normalizedPhone: string, consent: boolean) => {
    const cur = stateRef.current
    if (!cur.property || isSubmitting) return
    setIsSubmitting(true)
    const p = cur.property

    fireLegacyTracking(p, cur.fuente)
    trackEvent('wa_capture_submitted', {
      property_id: p.id,
      zona: p.zona || '',
      operacion: 'alquiler',
      alert_consent: consent,
      source: cur.fuente,
    })

    setStoredPhone(normalizedPhone, consent)
    const payload = buildPayload(p, cur.msg, cur.fuente, cur.preguntas, 'submitted', normalizedPhone, consent)
    postLead(payload).then((ok) => { if (!ok) savePendingLead(payload) })

    // Abrir wa.me (click del submit cuenta como user gesture)
    const url = buildWhatsAppUrl(p, cur.msg)
    const opened = window.open(url, '_blank')
    if (!opened) window.location.href = url

    // Mostrar "listo" brevemente
    setShowSuccess(true)
    setTimeout(() => {
      setState(EMPTY_STATE)
      setIsSubmitting(false)
      setShowSuccess(false)
    }, 1500)
  }, [isSubmitting])

  // ---------------------------------------------------------------------------
  // onSkip: usuario eligió "solo contactar al broker"
  // ---------------------------------------------------------------------------
  const handleSkip = useCallback(() => {
    const cur = stateRef.current
    if (!cur.property || isSubmitting) return
    const p = cur.property

    fireLegacyTracking(p, cur.fuente)
    trackEvent('wa_capture_skipped', {
      property_id: p.id,
      zona: p.zona || '',
      operacion: 'alquiler',
      source: cur.fuente,
    })

    const payload = buildPayload(p, cur.msg, cur.fuente, cur.preguntas, 'skipped', null, false)
    postLead(payload).then((ok) => { if (!ok) savePendingLead(payload) })

    const url = buildWhatsAppUrl(p, cur.msg)
    const opened = window.open(url, '_blank')
    if (!opened) window.location.href = url

    setState(EMPTY_STATE)
  }, [isSubmitting])

  // ---------------------------------------------------------------------------
  // onDismiss: cerró el modal sin acción (X, backdrop, ESC)
  // ---------------------------------------------------------------------------
  const handleDismiss = useCallback(() => {
    const cur = stateRef.current
    if (isSubmitting) return
    if (cur.property) {
      trackEvent('wa_capture_dismissed', {
        property_id: cur.property.id,
        operacion: 'alquiler',
        source: cur.fuente,
      })
      // Persistir dismiss en BD (sin abrir WA) para análisis cross-reference por visitor_uuid.
      // Filtrable downstream con WHERE modal_action != 'dismissed' para leads "válidos".
      const payload = buildPayload(cur.property, cur.msg, cur.fuente, cur.preguntas, 'dismissed', null, false)
      postLead(payload).then((ok) => { if (!ok) savePendingLead(payload) })
    }
    setState(EMPTY_STATE)
  }, [isSubmitting])

  // Registrar trigger module-level para que sub-componentes (sin props)
  // puedan disparar el modal vía triggerWhatsAppCapture().
  useEffect(() => {
    _moduleTrigger = trigger
    return () => { if (_moduleTrigger === trigger) _moduleTrigger = null }
  }, [trigger])

  // ---------------------------------------------------------------------------
  // Eventos de micro-interacción (opcionales — el modal los llama)
  // ---------------------------------------------------------------------------
  const handleFilled = useCallback(() => {
    trackEvent('wa_capture_filled', { operacion: 'alquiler' })
  }, [])

  // ---------------------------------------------------------------------------
  // modalElement: render helper (el caller hace {modalElement})
  // ---------------------------------------------------------------------------
  const propertyName = state.property?.nombre_edificio || state.property?.nombre_proyecto || ''
  const modalElement = (
    <WhatsAppCaptureModal
      isOpen={state.open}
      propertyName={propertyName}
      onSubmit={handleSubmit}
      onSkip={handleSkip}
      onDismiss={handleDismiss}
      isSubmitting={isSubmitting}
      showSuccess={showSuccess}
      onFilled={handleFilled}
    />
  )

  return { trigger, modalElement }
}
