# PRD: Modal de captura de WhatsApp — Infraestructura de Monetización

**Fecha:** 18 Abr 2026
**Estado:** Fase 1 deployada (18 Abr, commit `ddb58f0`). Iteración 1 UX deployada (19 Abr, commit `84b6343`). En validación (Fase 2).
**Origen:** Idea inicial en `simon-advisor/docs/MODAL_WHATSAPP_PLAN.md`. Este doc reemplaza esa spec con el plan ejecutivo después de revisión estratégica.

> **Nota:** el spec histórico abajo refleja el diseño original. Ver sección 15 al final para cambios aplicados en iteración 1 (copy, jerarquía visual, dismiss en BD).

---

## 1. Resumen ejecutivo

Modal blocker que aparece al hacer click en "Contactar broker" en `/alquileres` y `/ventas`. Pide el WhatsApp del usuario a cambio de **alertas si baja el precio o aparecen unidades nuevas en el proyecto**. Skip permitido (botón secundario).

**No es feature de CRO. Es infraestructura de monetización del modelo de negocio.**

Sin phone capturado:
- No podemos verificar si el usuario realmente contactó al broker
- El broker puede mentir ("no me llegó nadie de Simon")
- No podemos cobrar por lead enviado verificable
- No podemos hacer attribution de transacciones

**Meta de captura:** 20-30% de quienes ven el modal dejan su WhatsApp.
**Cap de pérdida en clicks broker totales:** <10%.

---

## 2. Reframe estratégico

| Visión vieja | Visión correcta |
|---|---|
| "Capturar leads para alertas" | "Capturar identidad para sostener cobro al broker" |
| Modal vs. clicks brokers (tradeoff) | Modal habilita clicks brokers monetizables (complemento) |
| A/B test 50/50 para validar | Ir 100% — escala (7 leads/día) no permite A/B con significancia rápida |
| Sistema de alertas técnico requerido | Promesa baja-volumen cumplible manualmente al inicio |

---

## 3. Decisiones tomadas

| # | Decisión | Justificación |
|---|---|---|
| 1 | **Modal blocker** con skip explícito | Promesa específica + valor claro al usuario. Fricción justificable. |
| 2 | **Persistir todos los clicks en BD** (con o sin phone) | Hoy /ventas no guarda nada. El modal es la excusa para igualar. |
| 3 | **Columna `usuario_telefono` en `leads_alquiler` + nueva tabla `leads_venta`** | NO tabla `user_captures` separada. Click y captura son 1:1. |
| 4 | **Visitor UUID en localStorage día 1** | Permite "no preguntar 2 veces" + identificación de visitas recurrentes. |
| 5 | **Reusar phone de captura previa o `ventas_gate_v1`** | Cero fricción para el que ya colaboró. |
| 6 | **`alert_consent` default ON** | Promesa específica y honesta. Usuario que no quiere desmarca. |
| 7 | **Lanzar 100% (sin A/B test)** | Volumen 7 leads/día → A/B 50/50 necesita ~8 sem para significancia. Inútil. |
| 8 | **Slack notif por cada captura con consent** | Esencial para seguimiento manual y reclamo a brokers. |
| 9 | **Promesa de alertas: solo "baja precio" + "unidades nuevas en este proyecto"** | Honesto, baja volumen, cumplible manual al inicio. |
| 10 | **Fase 1 = alquileres. Fase 2 = ventas.** | Menos cambios técnicos, loop de feedback más rápido, riesgo contenido. |
| 11 | **Verificación de envío: roadmap 2 → 1 → 3** | Manual → WhatsApp Cloud API → bot intermediario (sueño). |

---

## 4. UX flow detallado

### Caso A — Usuario sin phone previo

```
1. Click en "Contactar por WhatsApp" (cualquier source)
2. Se abre el MODAL (no wa.me)
   ├── Header: "Te conectamos con el broker"
   ├── Subheader: "Antes de seguir a WhatsApp..."
   ├── Mensaje valor:
   │   "Si dejas tu WhatsApp:
   │    • Te avisamos si baja el precio de [proyecto]
   │    • Te avisamos si aparecen unidades nuevas en el proyecto
   │    • Nos aseguramos que el broker te responda"
   ├── Input: pre-llenado "+591 " (auto-focus, teclado tipo `tel`)
   ├── Checkbox (default ON):
   │   "✓ Avisame si baja el precio o aparecen unidades nuevas"
   └── 2 botones:
       ├── Secundario gris: "Solo contactar al broker"
       └── Primario verde: "Contactar y recibir alertas"

3a. SUBMIT phone válido:
    - POST a /api/lead-{venta|alquiler} con usuario_telefono + alert_consent
    - Guardar en localStorage simon_user_phone
    - Notificar Slack si alert_consent=true
    - Fire wa_capture_submitted (GA4)
    - Abrir wa.me en NUEVA pestaña (window.open _blank)
    - Modal muestra "Listo, te avisamos!" 1.5s y cierra

3b. SUBMIT phone inválido:
    - Error inline ("Ingresá un número boliviano válido")
    - Fire wa_capture_error
    - Modal NO cierra, wa.me NO abre

3c. SKIP (botón secundario):
    - POST a /api/lead-{venta|alquiler} con usuario_telefono = NULL
    - Fire wa_capture_skipped
    - Abrir wa.me inmediatamente
    - Modal cierra inmediatamente

3d. CIERRE sin acción (X / backdrop / ESC):
    - Fire wa_capture_dismissed
    - NO abrir wa.me, NO guardar lead
```

### Caso B — Usuario con phone conocido

```
1. Click → NO abrir modal
2. POST a /api/lead-{venta|alquiler} con phone conocido + alert_consent del último estado
3. Abrir wa.me en nueva pestaña
4. Fire wa_capture_phone_reused
```

### Caso C — Mobile (98% del tráfico)

- Modal full-screen, no centrado small
- Botones grandes (≥48px alto)
- `wa.me` vía `window.open(..., '_blank')` para no perder estado
- Auto-focus input al abrir → teclado emerge inmediato

---

## 5. Schema BD

### 5.1 Migración 223 (Fase 1) — Alterar `leads_alquiler`

```sql
-- 223_modal_whatsapp_alquiler.sql
ALTER TABLE leads_alquiler
  ADD COLUMN usuario_telefono TEXT,
  ADD COLUMN alert_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN visitor_uuid TEXT,
  ADD COLUMN modal_action TEXT CHECK (modal_action IN ('submitted', 'skipped', 'reused', 'dismissed'));

CREATE INDEX idx_leads_alq_usuario_telefono ON leads_alquiler(usuario_telefono) WHERE usuario_telefono IS NOT NULL;
CREATE INDEX idx_leads_alq_visitor ON leads_alquiler(visitor_uuid) WHERE visitor_uuid IS NOT NULL;
```

### 5.2 Migración 224 (Fase 3) — Crear `leads_venta`

```sql
-- 224_modal_whatsapp_venta.sql
CREATE TABLE leads_venta (
  id SERIAL PRIMARY KEY,
  propiedad_id INTEGER REFERENCES propiedades_v2(id),
  nombre_propiedad TEXT,
  zona TEXT,
  precio_usd NUMERIC,
  dormitorios INTEGER,
  broker_telefono TEXT NOT NULL,
  broker_nombre TEXT,

  -- Captura usuario
  usuario_telefono TEXT,
  alert_consent BOOLEAN DEFAULT FALSE,
  visitor_uuid TEXT,
  modal_action TEXT CHECK (modal_action IN ('submitted', 'skipped', 'reused', 'dismissed')),

  -- Tracking
  fuente TEXT DEFAULT 'card', -- 'card_desktop' | 'card_mobile' | 'detail_sheet'
  session_id TEXT,
  es_test BOOLEAN DEFAULT FALSE,
  es_debounce BOOLEAN DEFAULT FALSE,
  es_bot BOOLEAN DEFAULT FALSE,

  -- UTMs
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_venta_propiedad ON leads_venta(propiedad_id);
CREATE INDEX idx_leads_venta_created ON leads_venta(created_at DESC);
CREATE INDEX idx_leads_venta_broker ON leads_venta(broker_telefono);
CREATE INDEX idx_leads_venta_usuario ON leads_venta(usuario_telefono) WHERE usuario_telefono IS NOT NULL;
CREATE INDEX idx_leads_venta_visitor ON leads_venta(visitor_uuid) WHERE visitor_uuid IS NOT NULL;
```

### 5.3 Migración 225 (Fase 4) — Verificación de envío

```sql
-- 225_verificacion_lead_followup.sql
ALTER TABLE leads_alquiler
  ADD COLUMN followup_sent_at TIMESTAMPTZ,
  ADD COLUMN followup_response TEXT CHECK (followup_response IN ('confirmed', 'no_response_broker', 'no_response_user', 'disputed')),
  ADD COLUMN followup_response_at TIMESTAMPTZ,
  ADD COLUMN broker_disputed BOOLEAN DEFAULT FALSE;

ALTER TABLE leads_venta
  ADD COLUMN followup_sent_at TIMESTAMPTZ,
  ADD COLUMN followup_response TEXT CHECK (followup_response IN ('confirmed', 'no_response_broker', 'no_response_user', 'disputed')),
  ADD COLUMN followup_response_at TIMESTAMPTZ,
  ADD COLUMN broker_disputed BOOLEAN DEFAULT FALSE;
```

### 5.4 RLS

- `anon`: INSERT permitido en `leads_*`, SELECT denegado
- `service_role`: full access (para APIs server-side y admin)
- No hay flujo de "usuario logueado" en simonbo.com

---

## 6. Arquitectura técnica

### 6.1 Archivos nuevos (Fase 1)

```
simon-mvp/src/
├── lib/
│   ├── phone.ts                  # normalizePhone() + isValidBolivianPhone()
│   ├── visitor.ts                # getVisitorId() — UUID localStorage
│   └── user-phone.ts             # getStoredPhone() — lee simon_user_phone + ventas_gate_v1
├── components/capture/
│   ├── WhatsAppCaptureModal.tsx  # Modal UI (full-screen mobile, centrado desktop)
│   └── PhoneInput.tsx            # Input con validación en vivo + pre-llenado +591
├── hooks/
│   └── useWhatsAppCapture.ts     # orquesta: modal abierto, submit, skip, post a API, abrir wa.me
```

### 6.2 Archivos nuevos (Fase 3)

```
simon-mvp/src/pages/api/
└── lead-venta.ts                 # espejo de lead-alquiler.ts
```

### 6.3 Archivos nuevos (Fase 4)

```
simon-mvp/src/pages/admin/
└── leads-monetizacion.tsx        # Dashboard de cruce leads ↔ verificaciones

simon-mvp/src/pages/api/admin/
├── trigger-followup.ts           # Dispara WA seguimiento manual (camino 2)
└── update-followup-response.ts   # Recibe respuesta del usuario al followup
```

### 6.4 Modificaciones

| Archivo | Cambio | Fase |
|---------|--------|------|
| `pages/api/lead-alquiler.ts` | Sumar handling de `usuario_telefono`, `alert_consent`, `visitor_uuid`, `modal_action` | 1 |
| `components/alquiler/CompareSheet.tsx` líneas 73-106 | Reemplazar `<a href="wa.me">` por `<button onClick={openCapture}>` | 1 |
| `pages/_app.tsx` | Llamar `getVisitorId()` en `useEffect` | 1 |
| `pages/ventas.tsx` líneas 336, 472, 1024 | Reemplazar `<a href="wa.me">` por `<button onClick={openCapture(p, source)}>` | 3 |

### 6.5 Helpers

```typescript
// src/lib/phone.ts
export function normalizePhone(input: string): string | null {
  const clean = input.replace(/[\s\-\(\)]/g, '')
  let normalized = clean
  if (!clean.startsWith('+')) {
    if (clean.startsWith('591')) normalized = '+' + clean
    else if (clean.startsWith('7') || clean.startsWith('6')) normalized = '+591' + clean
    else return null
  }
  if (!/^\+591\d{8}$/.test(normalized)) return null
  return normalized
}

export function isValidBolivianPhone(input: string): boolean {
  return normalizePhone(input) !== null
}
```

```typescript
// src/lib/visitor.ts
export function getVisitorId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('simon_visitor_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('simon_visitor_id', id)
  }
  return id
}
```

```typescript
// src/lib/user-phone.ts
export function getStoredPhone(): { phone: string; consent: boolean } | null {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem('simon_user_phone')
  if (stored) {
    try { return JSON.parse(stored) } catch {}
  }
  const gate = localStorage.getItem('ventas_gate_v1')
  if (gate) {
    try {
      const parsed = JSON.parse(gate)
      if (parsed.telefono) return { phone: parsed.telefono, consent: false }
    } catch {}
  }
  return null
}
```

### 6.6 Reglas dev críticas

- **Validación phone server-side** en `/api/lead-*` (no solo cliente — bots ignoran JS)
- **Rate limit** en API: máx 5 inserts/min por IP
- **Idempotencia**: dedup por session+propiedad (ya existe en `lead-alquiler.ts`, replicar en `lead-venta.ts`)
- **`getVisitorId()` solo en `useEffect`**, NO en SSR (no hay localStorage)
- **`window.open(wa.me, '_blank')`** — no `location.href` (rompe el modal)

---

## 7. Eventos GA4 (completo)

### 7.1 Eventos del modal (Fase 1, 3)

| Evento | Cuándo | Parámetros |
|--------|--------|------------|
| `wa_capture_shown` | Modal abre (Caso A) | `property_id`, `zona`, `operacion`, `source` |
| `wa_capture_filled` | Usuario tipea ≥4 chars en input | `operacion` |
| `wa_capture_consent_unchecked` | Usuario desmarca el checkbox default-ON | `operacion` |
| `wa_capture_consent_rechecked` | Usuario vuelve a marcar el checkbox | `operacion` |
| `wa_capture_submitted` | Submit con phone válido | `property_id`, `zona`, `operacion`, `alert_consent`, `source` |
| `wa_capture_skipped` | Click "Solo contactar al broker" | `property_id`, `zona`, `operacion`, `source` |
| `wa_capture_phone_reused` | Caso B — phone conocido, sin modal | `property_id`, `zona`, `operacion`, `source` |
| `wa_capture_error` | Phone inválido al submit | `error_type` |
| `wa_capture_dismissed` | Cierre sin acción (X / backdrop / ESC) | `property_id`, `operacion`, `source` |

### 7.2 Eventos de verificación (Fase 4)

| Evento | Cuándo | Parámetros |
|--------|--------|------------|
| `wa_followup_sent` | Simon manda WA seguimiento 24h después | `lead_id`, `operacion` |
| `wa_followup_response_yes` | Usuario confirma "sí, me respondió el broker" | `lead_id`, `operacion`, `hours_to_response` |
| `wa_followup_response_no` | Usuario dice "no me respondió" → reclamo a broker | `lead_id`, `operacion`, `broker_id` |
| `wa_followup_no_response` | 72h sin respuesta del usuario al followup | `lead_id`, `operacion` |
| `broker_lead_disputed` | Broker dice "no me llegó" pero hay evidencia | `lead_id`, `broker_id`, `dispute_reason` |

### 7.3 Eventos legacy (mantener)

`click_whatsapp_venta` y `click_whatsapp` siguen disparando al final del flujo (justo antes de abrir wa.me). Mantiene serie histórica para comparar pre/post launch.

---

## 8. Métricas + criterios revert

**Validación a 7 días post-launch (cada fase independientemente):**

| Caída clicks WA totales | % usuarios dejan phone | Decisión |
|---|---|---|
| <10% | ≥15% | **Mantener**, iterar copy hacia 25% |
| 10-15% | 15-25% | Neutro — A/B copy alternativo |
| >15% | cualquiera | **Revertir** |
| cualquiera | <10% | **Revertir** — copy/oferta no convencen |
| <10% | ≥25% | **Win claro** — priorizar verificación (Fase 4) y luego Cloud API |

### Dashboards SQL

```sql
-- Conversion rate por día
SELECT date_trunc('day', created_at) AS dia,
       COUNT(*) AS clicks_total,
       COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL) AS captures,
       ROUND(100.0 * COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL) / COUNT(*), 1) AS pct_captura,
       COUNT(*) FILTER (WHERE alert_consent = TRUE) AS con_consent
FROM leads_alquiler
WHERE created_at >= NOW() - INTERVAL '14 days'
  AND es_bot = FALSE AND es_debounce = FALSE
GROUP BY 1 ORDER BY 1 DESC;

-- Tasa de consent unchecking (señal de incomodidad con default ON)
SELECT date_trunc('day', created_at) AS dia,
       COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL) AS captures,
       COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL AND alert_consent = FALSE) AS sin_consent,
       ROUND(100.0 * COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL AND alert_consent = FALSE)
             / NULLIF(COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL), 0), 1) AS pct_unchecked
FROM leads_alquiler GROUP BY 1 ORDER BY 1 DESC;

-- Phones repetidos (visitor_uuid recurrentes = alta intención)
SELECT visitor_uuid, COUNT(*) AS clicks, COUNT(DISTINCT propiedad_id) AS props_distintas
FROM leads_alquiler
WHERE visitor_uuid IS NOT NULL
GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC;
```

---

## 9. Roadmap por fases (sesiones de código)

| Fase | Trabajo | Tiempo código | Cuándo |
|------|---------|---------------|--------|
| **1** | Modal + migración 223 + integración alquileres + GA4 base + visitor UUID + Slack notif | **4-6h** | Sesión nueva |
| **2** | Validación 3-4 días en producción. Ajuste copy si conversión <15%. | — (esperar) | 3-4 días calendario |
| **3** | Replicar en /ventas: migración 224 + API `lead-venta.ts` + integración 3 puntos + GA4 | **3-4h** | Después de Fase 2 |
| **4** | Migración 225 + dashboard `/admin/leads-monetizacion` + endpoints followup + GA4 verificación | **4-6h** | Cuando haya >50 leads totales |
| **5** | WhatsApp Cloud API (camino 1) | TBD | Mes 2-3, cuando volumen ≥10/sem |
| **6** | Bot intermediario (camino 3) — sueño | TBD | Cuando volumen y caja lo soporten |

**Total código fases 1+3+4: 11-16h.** Distribuible en 1-2 sesiones largas.

**Lo único que requiere tiempo real:** Fase 2 (validación con datos en producción).

---

## 10. Roadmap de verificación de envío (caminos 2 → 1 → 3)

### Camino 2: Verificación cualitativa manual (Fase 4)

- 24h post-lead, mandás WA al usuario: "¿te respondió el broker de [propiedad]?"
- Respuesta SÍ → marcar `followup_response = 'confirmed'`
- Respuesta NO → marcar `followup_response = 'no_response_broker'` → reclamo broker
- Sin respuesta 72h → `followup_response = 'no_response_user'`
- **Costo:** cero técnico. Operativo manual desde dashboard `/admin/leads-monetizacion`.

### Camino 1: WhatsApp Cloud API de Meta (Fase 5)

- Setup número Meta verificado (1-2 semanas burocráticas)
- Simon manda primer mensaje desde número oficial → tenés `delivered` y `read` confirmados
- Después broker continúa la conversación con el cliente
- **Costo:** ~$0.05/mensaje + setup verificación
- **Beneficio:** prueba forense del envío. Imposible que broker mienta.
- **Cuándo:** cuando volumen ≥10/sem y caja para Meta verification + costos.

### Camino 3: Bot intermediario (Fase 6 — sueño)

- Cliente habla con bot Simon → bot conecta con broker
- Tracking total. Calidad de lead garantizada.
- **Cuándo:** cuando el modelo esté maduro y el costo se justifique.

---

## 11. Dashboard `/admin/leads-monetizacion` (Fase 4)

**Vistas:**

1. **Tabla de leads recientes** (últimos 30d, ambas operaciones)
   - Cols: fecha, propiedad, broker, usuario_telefono, alert_consent, modal_action, followup_response
   - Acciones por fila: "Marcar enviado followup" / "Marcar respondido SÍ/NO" / "Reclamar broker"

2. **KPIs por broker**
   - Total leads recibidos (último mes)
   - % con followup confirmado
   - % disputados (broker dijo no recibió)
   - Tiempo medio de respuesta del broker

3. **KPIs de conversión modal**
   - % captura por día
   - Tasa de consent unchecking
   - Visitors recurrentes (>1 click distinto)

4. **Acciones bulk**
   - Botón "Disparar followups del día" (marca `followup_sent_at` en batch)

---

## 12. Checklist por fase

### Fase 1 — Alquileres (4-6h)

- [ ] Migración 223: alter `leads_alquiler` con 4 nuevas columnas + 2 índices
- [ ] `lib/phone.ts` (`normalizePhone`, `isValidBolivianPhone`)
- [ ] `lib/visitor.ts` (`getVisitorId`)
- [ ] `lib/user-phone.ts` (`getStoredPhone` reusa `ventas_gate_v1`)
- [ ] `components/capture/PhoneInput.tsx` (pre-llenado `+591 `, auto-focus, teclado tel)
- [ ] `components/capture/WhatsAppCaptureModal.tsx` (responsive, full-screen mobile)
- [ ] `hooks/useWhatsAppCapture.ts`
- [ ] Modificar `pages/api/lead-alquiler.ts` (server-side validation + rate limit + nuevos campos)
- [ ] Slack notif si `alert_consent=true` (reusar `lib/notify-slack` si existe, sino crear)
- [ ] Integración en `CompareSheet.tsx`
- [ ] Llamar `getVisitorId()` en `_app.tsx` con `useEffect`
- [ ] Configurar 9 eventos `wa_capture_*` en GA4 dashboard
- [ ] QA mobile + desktop
- [ ] Deploy

### Fase 2 — Validación (3-4 días calendario)

- [ ] Monitorear `wa_capture_shown` vs `wa_capture_submitted` diariamente
- [ ] Revisar `wa_capture_consent_unchecked` (si >30% → revisar copy del checkbox)
- [ ] Comparar `click_whatsapp` total pre vs. post (cap <10% caída)
- [ ] Decisión revert/iterar/mantener según matriz sección 8

### Fase 3 — Ventas (3-4h)

- [ ] Migración 224: crear `leads_venta` espejo + 5 índices
- [ ] `pages/api/lead-venta.ts` (espejo de lead-alquiler.ts con dedup)
- [ ] Integración en `ventas.tsx` líneas 336, 472, 1024 (3 sources)
- [ ] Verificar que `useWhatsAppCapture` recibe `operacion: 'venta'`
- [ ] QA mobile + desktop en /ventas
- [ ] Deploy

### Fase 4 — Verificación + Dashboard (4-6h)

- [ ] Migración 225: alter ambas tablas con campos `followup_*`
- [ ] `pages/admin/leads-monetizacion.tsx` (tabla + KPIs + acciones)
- [ ] `pages/api/admin/trigger-followup.ts`
- [ ] `pages/api/admin/update-followup-response.ts`
- [ ] Configurar 5 eventos `wa_followup_*` + `broker_lead_disputed` en GA4
- [ ] Documentar workflow operativo (cómo Lucho dispara followups diarios)
- [ ] QA dashboard
- [ ] Deploy

### Fase 5 — Cloud API (TBD)

- [ ] Tarjeta Meta Business Verified
- [ ] Setup número WhatsApp oficial
- [ ] Templates de primer mensaje aprobados por Meta
- [ ] Integración API en `useWhatsAppCapture` (reemplazar `wa.me` por API call)
- [ ] Webhook para receipts `delivered` / `read`
- [ ] Cálculo de costos por mensaje

---

## 13. Pendientes / preguntas abiertas

| # | Pregunta | Decisión |
|---|---|---|
| 1 | ¿Bloquear modal en /broker o /admin? | Sí, excluir mismos scopes que GA |
| 2 | ¿Permitir múltiples capturas mismo `visitor_uuid`? | Sí, cada click es un lead. Es data valiosa de intent. |
| 3 | ¿Notif Slack en cada captura O solo con consent? | Solo con consent (alert_consent=true) — son los que califican para seguimiento |
| 4 | ¿Mostrar al usuario su phone capturado en visitas futuras? | No por ahora — riesgo privacidad si comparten dispositivo |
| 5 | ¿Permitir editar/borrar phone capturado? | Backlog futuro — endpoint admin para borrar a pedido |

---

## 14. Diferencias con la spec original (`simon-advisor`)

| Aspecto | Spec original | PRD revisado |
|---|---|---|
| Framing | "Captura de leads para alertas" | "Infraestructura de monetización" |
| Tabla BD | `user_captures` separada | Columnas en `leads_alquiler` + crear `leads_venta` |
| Persistencia /ventas | No mencionada | Sí — espejo de /alquileres |
| Phone reusable | No mencionado | Sí — lee `ventas_gate_v1` y `simon_user_phone` |
| Visitor UUID | Iteración futura | Día 1 |
| A/B test | No mencionado | Considerado y descartado (volumen no lo justifica) |
| Verificación de envío | No mencionada | Roadmap completo: 2 → 1 → 3 |
| Dashboard monetización | No mencionado | Fase 4 con KPIs + acciones manuales |
| Eventos GA4 | 5 eventos | 14 eventos (9 modal + 5 verificación) |
| Sources GA4 | Genéricos | Respetan los 3 existentes en /ventas |
| Default consent | No definido | ON con copy específico |
| Slack notif | No mencionada | Esencial (solo si consent=true) |
| Promesa de alertas | "baja precio o similares en zona" | "baja precio o unidades nuevas en proyecto" (más cumplible) |
| Sistema alertas backend | "2-4 semanas roadmap" | Manual al inicio (rara vez bajan precios), automatizar cuando volumen lo amerite |

---

## 15. Iteración 1 — Fix UX + dismiss en BD (19 Abr 2026)

**Commit:** `84b6343` · **Trigger:** primer `/reporte-modal` post-deploy (19 Abr) mostró 56% dismiss rate en GA4 y **0 leads nuevos en BD** desde el deploy — a pesar de 40 `click_whatsapp` y 16 `wa_capture_shown`.

### Diagnóstico

Modal no estaba técnicamente roto (test manual confirmó que `submitted` funcionaba). El problema era UX:
1. Jerarquía visual aplastaba el skip (submit `flex-1` negro gigante vs skip outline gris fantasma)
2. Copy casi idéntico entre submit/skip cuando usuario destildaba consent ("Contactar al broker" vs "Solo contactar al broker")
3. Checkbox consent agregaba ambigüedad sin valor real (si deja tel, implícitamente aceptó alertas)
4. Mobile: skip abajo del submit → invisible → usuario gravita al X arriba-derecha

Dismiss original no generaba row en BD (solo GA4) — útil como filtro pasivo, inútil para análisis granular o cross-reference por `visitor_uuid`.

### Cambios aplicados

| # | Archivo | Cambio |
|---|---|---|
| 1 | `components/capture/WhatsAppCaptureModal.tsx` | Skip copy: **"Ir a WhatsApp sin dejar datos"** (antes "Solo contactar al broker") |
| 2 | idem | Submit copy fijo: **"Dejar WhatsApp y contactar"** (antes dinámico según checkbox) |
| 3 | idem | Skip peso visual: `bg-[#D8D0BC]/60` + `text-[#141414]` + `font-medium` (antes outline gris) |
| 4 | idem | Checkbox consent eliminado. `onSubmit(phone, true)` hardcoded — opt-in implícito al dejar tel |
| 5 | idem | Mobile order: skip `order-1`, submit `order-2` (antes al revés) |
| 6 | `hooks/useWhatsAppCapture.tsx` | `handleDismiss` ahora llama `postLead(..., 'dismissed', null, false)` **sin abrir WA**. Sigue sin llevar a WhatsApp — es "cerrar sin continuar" — pero registra intención para análisis |
| 7 | idem | Removido `handleConsentToggle` + prop `onConsentToggle` del modal |
| 8 | `scripts/check_ga4_metrics.py` | `_LEADS_WHERE` excluye `modal_action='dismissed'` para mantener consistencia histórica de "leads reales" |

### Decisiones clave (reemplazan las del PRD original)

- **`alert_consent` siempre `true` cuando usuario deja tel** (antes default ON con opción de destildar). El checkbox era ambigüedad innecesaria.
- **`dismissed` SÍ persiste en BD** con `usuario_telefono=null`, `alert_consent=false`, sin abrir WA. Filtrable downstream con `WHERE modal_action != 'dismissed'` para leads "válidos".
- **Backend (`/api/lead-alquiler`) no requiere cambios** — ya soportaba `dismissed` en el CHECK constraint, Slack notif ya filtra por `alert_consent && usuario_telefono`.

### Query actualizada (`/reporte-modal`)

```sql
SELECT date_trunc('day', created_at AT TIME ZONE 'America/La_Paz')::date AS dia,
  COUNT(*) AS total_intentos,
  COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL) AS con_phone,
  ROUND(100.0 * COUNT(*) FILTER (WHERE usuario_telefono IS NOT NULL) / NULLIF(COUNT(*), 0), 1) AS pct_captura,
  COUNT(*) FILTER (WHERE modal_action = 'submitted') AS submitted,
  COUNT(*) FILTER (WHERE modal_action = 'skipped') AS skipped,
  COUNT(*) FILTER (WHERE modal_action = 'reused') AS reused,
  COUNT(*) FILTER (WHERE modal_action = 'dismissed') AS dismissed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE modal_action = 'dismissed') / NULLIF(COUNT(*), 0), 1) AS pct_dismiss
FROM leads_alquiler
WHERE created_at >= NOW() - INTERVAL '7 days'
  AND es_bot = false AND es_debounce = false AND modal_action IS NOT NULL
GROUP BY 1 ORDER BY 1 DESC;
```

### Targets para re-evaluar Fase 2

- Dismiss rate: <40% (baseline 18-19 Abr: 56%)
- Captura (tel/total_intentos): ≥20%
- Leads/día BD (excluyendo dismissed): recuperar baseline ~6.4/día pre-deploy

Si no se cumplen en 48-72h → rollback `git revert 84b6343` (NO revertir `ddb58f0` — ese fue la infra base que sigue siendo válida).
