# Retención de Usuarios — Favoritos Persistentes + Alertas

> **Fecha:** 19 Mar 2026
> **Estado:** Planificación
> **Origen:** Auditoría UX /alquileres (I5) + análisis estratégico
> **Referentes:** Zillow (Google/email+password), QuintoAndar (Google/Apple/SMS)

## Contexto

Hoy los favoritos viven en localStorage — se pierden al cambiar de dispositivo o limpiar el browser. No hay forma de retener al usuario ni re-engancharlo. El comparativo express ya genera engagement alto (2-3 ❤️ + comparación), pero después el usuario se va sin dejar rastro.

## Propuesta

Después del comparativo express, ofrecer login con Google para:
1. Persistir favoritos y comparativo en BD
2. Enviar comparativo por email
3. Alertas automáticas de propiedades similares

## Trigger UX

```
❤️ ❤️ → Comparativo express → Cierra comparativo
→ Inline (no modal, no popup):
  "Guardá tu comparativo y recibí alertas"
  [Continuar con Google]
  "Te enviamos tu comparativo por email y te avisamos cuando aparezca algo similar."
```

No bloquea nada — puede cerrar e ignorar.

## Stack técnico

- **Auth:** Supabase Google OAuth (built-in)
- **BD:** Tablas `user_favorites`, `user_alerts`
- **Email:** Resend (free tier 100/día)
- **Cron alertas:** n8n workflow diario
- **Páginas afectadas:** `/alquileres`, `/ventas`

## Fases

### Fase 1: Google OAuth + PublicAuthContext
- `PublicAuthContext.tsx` (patrón AdminAuthContext, sin redirect)
- `usePublicUser.ts` hook wrapper
- Wrappear rutas públicas en `_app.tsx`
- Config manual: Supabase dashboard > Auth > Google provider

### Fase 2: Tablas BD + API favoritos
- Migración: `user_profiles` + `user_favorites` + trigger auto-profile + RLS
- API `/api/favorites` (GET/POST/DELETE/PUT bulk sync)

### Fase 3: Favoritos persistentes con hook
- `useFavorites.ts` — encapsula localStorage + BD dual-write
- Reemplazar state inline en `alquileres.tsx` y `ventas.tsx`
- Merge localStorage → BD al primer login

### Fase 4: Prompt post-comparativo
- `PostComparePrompt.tsx` — inline después de cerrar CompareSheet
- Solo si anónimo + no dismissed (sessionStorage)
- Botón Google sign-in + "Ahora no"

### Fase 5: Email comparativo (Resend)
- Setup Resend + verificar dominio
- `comparison-template.ts` (HTML email-safe)
- API `/api/send-comparison`
- Botón "Enviar por email" en CompareSheet y PostComparePrompt

### Fase 6: Alertas de propiedades
- Migración: `user_alerts` + `user_alerts_sent`
- `AlertsOptIn.tsx` — toggle inline con filtros auto-derivados
- Función SQL `check_user_alerts()` + n8n workflow diario 10 AM
- Email con cards de propiedades nuevas

## Principios

- No bloquear contenido para no logueados
- No pedir datos manuales — Google ya los da
- No mostrar prompt en primera visita
- No hacer app nativa (web mobile suficiente por ahora)
- Cada fase se testea y commitea antes de avanzar a la siguiente

---

## Ideas Backlog (8 Abr 2026)

### Idea A: Botón "Reportar" propiedad
- **Qué:** Botón discreto en cards y bottom sheet (ícono + "Reportar") que abre modal con checkboxes:
  - Precio desactualizado
  - Contenido inapropiado
  - Ubicación incorrecta
  - Información incorrecta
  - Foto en baja calidad
  - Propiedad sin imagen
- **Por qué:** Mejora calidad de datos con crowdsourcing. Genera confianza en el usuario (siente que puede influir). Señal valiosa para pipeline de verificación.
- **Scope:** Ventas + Alquileres (cards mobile/desktop + bottom sheet)
- **BD:** Tabla `reportes_propiedad` (user anónimo/logueado, propiedad_id, motivos[], timestamp)
- **Prioridad:** Media — bajo esfuerzo, alto valor de datos

### Idea B: Sistema de alertas de precio/similares
- **Qué:** Botón "Avisame" en bottom sheet o card con opciones:
  - "Avisame cuando baje de precio"
  - "Avisame cuando haya propiedades similares nuevas"
- **Por qué:** Re-engagement directo. Convierte visita pasiva en lead recurrente. Alta intención de compra/alquiler.
- **Dependencia:** Requiere Fase 1 (Google OAuth) o al menos captura de email/WhatsApp
- **Conecta con:** Fase 6 de este documento (alertas de propiedades)
- **Prioridad:** Alta — moat fuerte, retención directa

### Idea C: Comparativo express con corazones (push engagement)
- **Qué:** Impulsar el uso de corazones para desbloquear comparación express automática. Cuando el usuario marca 2-3 favoritos, mostrar CTA o abrir comparativo directo.
- **Por qué:** Los favoritos ya existen pero el usuario no sabe que puede comparar. El comparativo express tiene alto valor percibido (ahorra horas de research). Es el gancho natural para login (Fase 4).
- **Posibles implementaciones:**
  - Nudge pill al 2do corazón: "Compará tus favoritos"
  - Badge/counter visible sobre ícono de favoritos
  - Auto-abrir CompareSheet al 3er corazón (con dismiss)
- **Prioridad:** Alta — ya construido, solo falta empujar al usuario hacia él
