# Prompt para arrancar Fase 1 — Modal WhatsApp

Copy-paste este prompt en una sesión nueva del proyecto SICI:

---

```
Arrancá la Fase 1 del modal de captura de WhatsApp.

Contexto:
- PRD completo: docs/backlog/MODAL_WHATSAPP_CAPTURA.md
- Memoria del proyecto: modal_whatsapp_captura.md (auto-cargada)
- Decisiones ya tomadas — NO re-discutir, ejecutar lo del PRD

Antes de tocar código:
1. Entrá en plan mode
2. Leé el PRD completo (todas las secciones)
3. Lanzá Explore agent en paralelo para revisar el estado actual:
   - components/alquiler/CompareSheet.tsx (líneas 73-106 hoy)
   - pages/api/lead-alquiler.ts (estructura actual)
   - pages/_app.tsx (dónde meter getVisitorId)
   - sql/migrations/ (formato de las últimas migraciones para 223)
   - lib/notify-slack o equivalente (existe? hay que crear?)
   - Revisar si hay helper de rate limiting reutilizable
4. Confirmá conmigo el plan antes de codear (ExitPlanMode)

Fase 1 = 4-6h código (alquileres solamente):
- Migración 223 (alter leads_alquiler)
- 3 helpers nuevos (lib/phone, lib/visitor, lib/user-phone)
- 2 componentes nuevos (WhatsAppCaptureModal, PhoneInput)
- 1 hook nuevo (useWhatsAppCapture)
- Modificar lead-alquiler.ts (server-side validation + rate limit)
- Integración en CompareSheet
- Slack notif si alert_consent=true
- 9 eventos GA4 (wa_capture_*)
- getVisitorId() en _app.tsx con useEffect

Reglas dev del PRD (sección 6.6):
- Validación phone server-side (bots ignoran JS)
- Rate limit: 5 inserts/min por IP
- getVisitorId solo en useEffect (no SSR)
- window.open(wa.me, '_blank')

NO incluir Fase 2, 3, 4 — esas vienen después.
NO commitear sin que yo apruebe los cambios.
Test mobile + desktop antes de marcar como hecho.
```
