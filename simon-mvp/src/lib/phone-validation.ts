// Validación de formato de teléfono. Función pura, importable desde cliente
// y servidor. Aislada de lib/simon-brokers.ts (que usa SERVICE_ROLE_KEY y
// no debería entrar al bundle del cliente).

/**
 * Valida formato del teléfono antes de persistir.
 *
 * Para Bolivia (+591): exige exactamente 8 dígitos celu arrancando con 6 ó 7
 * (formato +591[67]XXXXXXX). Esto atrapa casos como "+591 7800544" — 7 dígitos
 * después del 591 — que motivaron este check (caso Laurent Eguez, ene 2026:
 * teléfono mal cargado en simon_brokers, WhatsApp respondió "isn't on WhatsApp"
 * cuando un cliente intentó contactarlo desde la shortlist).
 *
 * Para otros países: regex E.164 genérico (8-15 dígitos después del +). Si el
 * día de mañana se onboardea un broker no boliviano, igual queda validado.
 *
 * Acepta espacios/guiones intermedios que se strippean antes del check.
 */
export function isValidPhoneFormat(phone: string): boolean {
  const stripped = phone.trim().replace(/[\s-]/g, '')
  if (stripped.startsWith('+591')) {
    return /^\+591[67]\d{7}$/.test(stripped)
  }
  return /^\+[0-9]{8,15}$/.test(stripped)
}

export const PHONE_FORMAT_ERROR =
  'Teléfono boliviano debe ser +591 seguido de 8 dígitos arrancando con 6 ó 7. ' +
  'Ejemplo: +59170123456. Para otros países usá +<código> seguido de 8-15 dígitos.'
