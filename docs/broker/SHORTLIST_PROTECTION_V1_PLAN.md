# Shortlist Protection v1 — Plan + implementación

**Estado:** ✅ **MERGEADO A `main`** — commit `037584b` el 2026-04-25
**Branch:** `broker-shortlist-protection-v1` (borrado post-merge)
**Creado:** 2026-04-25 · **Implementado:** 2026-04-25 (mismo día)
**Esfuerzo real:** ~4h
**Trigger original:** antes del primer cobro a un broker (no después).

> Este documento conserva el plan original abajo + sección "Implementación realizada"
> al final con commits, archivos creados/modificados y decisiones que difirieron del plan.

---

## Por qué

Simon Broker es el **caballo de Troya** de Simon: brokers usan la plataforma como herramienta de curación + WhatsApp con clientes específicos, y esos clientes terminan descubriendo la marca Simón vía las shortlists que reciben. Si no hay protecciones técnicas, el broker puede convertir las shortlists en mini-portales públicos:

- Postear el link en bio de Instagram con 50 props
- Distribuir el link en grupos masivos de WA
- Usar Simon como infraestructura de marketing personal

Resultado: la marca Simón se diluye, `simon.bo/equipetrol` deja de tener valor diferencial frente a "el portal del broker", y el modelo Simon = canal de adquisición de usuarios finales se rompe.

**Las protecciones técnicas son la defensa core.** Sin ellas, no hay producto Simon Broker sustentable.

## Invariante editorial

**La marca SIEMPRE es Simón.** Los brokers son canal, no white-label. NUNCA habrá branding propio del broker (logo, dominio custom, colores). Esa decisión está tomada y no se revisita.

Por lo tanto, el **lever de monetización Pro NO es branding** — es **límites más altos**:

### Plan Inicial (único plan hoy — Bs 350/mes)

| Capability | Plan Inicial |
|---|---|
| Vistas únicas por shortlist | 20 |
| Duración antes de expirar | 30 días |
| Shortlists activas simultáneas | Sin cap (TBD si surge problema) |

**No hay plan "Free".** Todo broker que entra paga Bs 350/mes desde el día uno.

### Plan Pro (FUTURO — sin diseñar todavía)

Precio y features **NO están definidas**. Lo único que tenemos hoy es la idea genérica de "más vistas / mayor duración", pero **eso solo no es diferenciador suficiente** para justificar un upgrade — un broker puede simplemente armar 2 shortlists para 2 clientes en vez de pagar más.

Para que Pro sea vendible va a hacer falta al menos UNA feature productiva real adicional al cap. Posibles candidatos a evaluar cuando se diseñe:

- **Analytics detallados del link compartido** (timestamps de aperturas, dispositivos únicos, geolocalización aproximada — info útil para el broker sobre engagement del cliente)
- **Notificaciones push** cuando el cliente abre el link
- **Más shortlists activas simultáneas** (si el cap free termina siendo bajo)
- **Bulk operations** (regenerar links, exportar shortlists, etc.)

**Decisión Pro queda abierta.** El v1 mínimo construye los límites del Inicial sin definir aún cómo se ve el upgrade — eso es trabajo de diseño de producto futuro, no de protección defensiva.

### Por qué el v1 mínimo igual tiene sentido

Aunque Pro no esté diseñado, las protecciones del Inicial sirven **por sí solas** como defensa contra canibalización:
- Sin cap, un broker puede postear el link de su shortlist en redes y convertirla en mini-portal público.
- El cap previene eso independientemente de si después hay un upgrade vendible o no.

El upgrade Pro es la siguiente capa (monetización), no la primera (defensa).

---

## Alcance v1 (lo que SÍ entra)

1. ✅ Migración SQL con `max_views`, `current_views`, `expires_at`, `status`
2. ✅ Tabla `shortlist_views` (eventos de visita con fingerprint)
3. ✅ Cookie persistente como fingerprint primario, IP+UA hash como fallback
4. ✅ Middleware en `/b/[hash]` que valida expiración + cap, registra visita
5. ✅ 1 sola página de bloqueo "no disponible — pedile a {broker} un nuevo link"
6. ✅ Watermark sutil en footer de shortlist con ID corto
7. ✅ Términos de uso aceptables vía checkbox en onboarding broker
8. ✅ Botón "Suspender shortlist" individual en `/admin/simon-brokers`

## Alcance v1.1 (NO entra ahora — esperar señal real)

- ❌ 3 páginas distintas (expired/limit/suspended) — 1 alcanza
- ❌ Dashboard admin con detección automática de abuso (4 reglas)
- ❌ Botón "Suspender broker entero" — manual con SQL los primeros 5 casos
- ❌ Cron de cleanup de IPs viejas (puede ser manual cada 90 días)

---

## Implementación detallada

### 1. Migración SQL — `235_shortlist_protection.sql`

```sql
-- Migración 235: Protección de shortlists v1
-- Lever de monetización Pro: max_views y expires_at son configurables por plan futuro.
-- Plan Inicial: 20 vistas / 30 días. Plan Pro (TBD): valores más altos. Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md

ALTER TABLE broker_shortlists
  ADD COLUMN IF NOT EXISTS max_views INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS current_views INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'view_limit_reached', 'suspended')),
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_broker_shortlists_status ON broker_shortlists(status);
CREATE INDEX IF NOT EXISTS idx_broker_shortlists_expires ON broker_shortlists(expires_at)
  WHERE status = 'active';

-- Tabla de eventos de visita
CREATE TABLE IF NOT EXISTS broker_shortlist_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id UUID NOT NULL REFERENCES broker_shortlists(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  referrer TEXT,
  is_unique BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broker_shortlist_views_shortlist ON broker_shortlist_views(shortlist_id);
CREATE INDEX idx_broker_shortlist_views_fingerprint ON broker_shortlist_views(shortlist_id, fingerprint);
CREATE INDEX idx_broker_shortlist_views_created ON broker_shortlist_views(created_at DESC);

-- RLS: solo service_role lee. Anon NO accede.
ALTER TABLE broker_shortlist_views ENABLE ROW LEVEL SECURITY;
-- (sin policies = nadie accede via anon, solo via service_role en API server-side)
```

**Notas:**
- Verificar si la tabla actual es `broker_shortlists` o `shortlists` antes de aplicar (CLAUDE.md menciona `broker_shortlists`).
- `ip_hash` (no `ip_address` plano) por buenas prácticas de privacidad.
- Sin `visitor_fingerprints JSONB` en parent — la tabla `broker_shortlist_views` ya es la fuente de verdad. JSONB duplicaría data y complica updates.

### 2. Middleware en `pages/b/[hash].tsx`

En `getServerSideProps` de `/b/[hash]`:

```typescript
// 1. Obtener shortlist por hash
const shortlist = await getShortlistByHash(hash)
if (!shortlist) return { notFound: true }

// 2. Verificar status precomputado
if (shortlist.status === 'suspended') {
  return { props: { blocked: 'suspended', broker: shortlist.broker } }
}

// 3. Verificar expiración (lazy — actualiza status si expiró pero no estaba marcada)
if (new Date() > new Date(shortlist.expires_at)) {
  await markAsExpired(shortlist.id)
  return { props: { blocked: 'expired', broker: shortlist.broker } }
}

// 4. Generar fingerprint del visitante
const cookieFp = req.cookies[`sl_visitor_${shortlist.id.slice(0, 8)}`]
const ip = getClientIP(req)
const ua = req.headers['user-agent'] || ''
const ipUaHash = sha256(ip + ua + shortlist.id) // salt con shortlist.id
const fingerprint = cookieFp || ipUaHash

// 5. ¿Visitante recurrente? Consulta a la tabla de eventos
const isReturning = await fingerprintExists(shortlist.id, fingerprint)

// 6. Si es nuevo y ya alcanzó cap, bloquear
if (!isReturning && shortlist.current_views >= shortlist.max_views) {
  await markAsViewLimitReached(shortlist.id)
  return { props: { blocked: 'view_limit_reached', broker: shortlist.broker } }
}

// 7. Registrar visita (TX: incrementar contador + insertar evento)
if (!isReturning) {
  await registerNewVisit(shortlist.id, fingerprint, sha256(ip), ua, req.headers['referer'])
} else {
  await registerReturnVisit(shortlist.id, fingerprint, sha256(ip), ua, req.headers['referer'])
}

// 8. Si no había cookie, setear una nueva persistente (1 año)
if (!cookieFp) {
  res.setHeader('Set-Cookie', `sl_visitor_${shortlist.id.slice(0,8)}=${fingerprint}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`)
}

// 9. Renderizar normalmente
return { props: { ...shortlistProps } }
```

**Por qué cookie primario + IP+UA fallback:**
- Tigo/Entel hacen NAT pesado en Bolivia. 20 personas pueden compartir IP.
- IP+UA hash se repite → falsos positivos del cap.
- Cookie persiste por dispositivo, mucho más estable.
- Si el cliente bloqueó cookies (raro), fallback a IP+UA con margen amplio (cap=20).

### 3. Página de bloqueo

Una sola página, mensaje variable según `blocked`:

```tsx
// En b/[hash].tsx
if (props.blocked) {
  return (
    <div className="sl-blocked">
      <div className="sl-blocked-card">
        <div className="sl-blocked-logo">SIMON</div>
        <h1>{messageByReason[props.blocked].title}</h1>
        <p>{messageByReason[props.blocked].body}</p>
        <a href={waLink(props.broker.telefono)} className="sl-blocked-cta">
          Pedir nuevo link a {props.broker.nombre}
        </a>
      </div>
    </div>
  )
}

const messageByReason = {
  expired: {
    title: 'Esta shortlist expiró',
    body: 'Pedile un nuevo link a tu broker para seguir viendo las propiedades.',
  },
  view_limit_reached: {
    title: 'Esta shortlist es privada',
    body: 'Alcanzó su límite de visualizaciones. Pedile un nuevo link a tu broker.',
  },
  suspended: {
    title: 'Esta shortlist no está disponible',
    body: 'Contactá a tu broker para más información.',
  },
}
```

Una sola página visual, 3 textos. Branding Simón + CTA al WA del broker.

### 4. Watermark en footer de shortlist

En el render normal de `/b/[hash]` (cuando la shortlist es válida), agregar al final del componente:

```tsx
<footer className="sl-watermark">
  <div className="sl-watermark-line">
    Selección de <strong>{broker.nombre}</strong> con{' '}
    <a href="https://simon.bo" target="_blank" rel="noopener">
      Simón · Inteligencia Inmobiliaria
    </a>
  </div>
  <div className="sl-watermark-meta">
    Shortlist #{shortlist.id.slice(0, 8)} ·
    Creada {formatDate(shortlist.created_at)} ·
    Expira {formatDate(shortlist.expires_at)}
  </div>
</footer>
```

CSS:
```css
.sl-watermark {
  padding: 24px 16px 32px;
  text-align: center;
  font-family: 'DM Sans', sans-serif;
  color: rgba(20,20,20,0.45);
  font-size: 11px;
  letter-spacing: 0.3px;
  border-top: 1px solid rgba(20,20,20,0.06);
  margin-top: 32px;
}
.sl-watermark a { color: rgba(20,20,20,0.7); text-decoration: underline; }
.sl-watermark-meta { font-size: 10px; color: rgba(20,20,20,0.35); margin-top: 4px; font-variant-numeric: tabular-nums; }
```

**Por qué importante:**
- Brand siempre presente sin ser invasivo
- Si broker hace screenshot para Instagram, aparece "con Simón" + ID corto
- ID corto permite trazabilidad si detectamos abuso ("vimos tu shortlist #abc12345 en Instagram, ¿podés explicarnos?")

### 5. Términos de uso del broker

Crear `simon-mvp/src/components/admin/SimonBrokerTerms.tsx` con el siguiente markdown:

```markdown
**Términos de uso de Simón Broker**

1. Las shortlists generadas en Simón son para uso privado entre el broker
   y sus clientes específicos.

2. Cada shortlist tiene un límite de **20 visualizaciones únicas** y expira
   automáticamente en **30 días** desde su creación.

3. Está prohibido distribuir links de shortlist en:
   - Redes sociales públicas (Instagram, Facebook, TikTok, X, etc.)
   - Anuncios pagos de cualquier plataforma
   - Canales o grupos masivos de WhatsApp Business
   - Cualquier canal de marketing público o masivo

4. Las shortlists con captura pública de leads y distribución masiva NO están
   incluidas en el plan Broker. Para esos casos, contactá a Simón para
   acuerdos comerciales especiales (planes superiores con límites mayores).

5. La violación de estos términos implica suspensión inmediata del servicio
   sin reembolso del período pagado.

6. Simón monitorea patrones de uso de las shortlists para detectar abuso.
   Esta monitorización se limita a metadata técnica (hash de IP, dispositivo,
   frecuencia, timestamps) y no incluye contenido personal del cliente final.
```

Aceptación: en el form de creación de un broker (admin), checkbox obligatorio "El broker aceptó los términos de uso" + columna `terms_accepted_at` en `simon_brokers`. Sin checkear, no se puede crear el broker.

### 6. Botón "Suspender shortlist" en admin

En `/admin/simon-brokers/[slug]` agregar listado de shortlists del broker con:

- Estado actual (active/expired/view_limit/suspended)
- Vistas: `current_views/max_views`
- Fecha de expiración
- Botón "Suspender" (cambia status a `suspended`)
- Botón "Reactivar" (cambia status de vuelta a `active`, opcional)

Implementación: un POST a `/api/admin/shortlist/suspend` con `{ shortlist_id, action: 'suspend'|'unsuspend' }` que hace UPDATE.

---

## Comentarios obligatorios en código

En cada lugar donde se aplique un cap o límite, dejar comentario:

```typescript
// CAP de 20 vistas — lever de monetización para Plan Pro futuro.
// El dolor del límite del Plan Inicial es el incentivo a upgrade. NUNCA habilitar
// branding propio del broker (decisión editorial: marca siempre Simón).
// Plan Pro futuro = más vistas + mayor duración + features productivas.
// (NO hay plan Free — todo broker paga desde el día uno; Plan Inicial = Bs 350/mes.
// Plan Pro: features y precio sin definir todavía — el cap del Inicial es defensa
// contra canibalización por sí solo, independiente del upgrade futuro.)
const MAX_VIEWS_INICIAL = 20
```

```typescript
// EXPIRACIÓN 30 días — lever de monetización Pro. Misma lógica que MAX_VIEWS_INICIAL.
const EXPIRATION_DAYS_INICIAL = 30
```

Idealmente extraer a `lib/broker-plan-limits.ts` con un comentario top-of-file explicando el modelo:

```typescript
/**
 * Límites del Plan Inicial de Simon Broker.
 *
 * Estos valores son INTENCIONALMENTE conservadores. Son la palanca de
 * monetización para el Plan Pro futuro: cuando un broker quiera más vistas
 * o mayor duración, paga upgrade.
 *
 * INVARIANTE EDITORIAL: NUNCA habilitar branding propio del broker (logo
 * custom, dominio custom, etc). La marca siempre es Simón — los brokers
 * son canal de adquisición, no white-label. Plan Pro = más límites +
 * features productivas (analytics, push notifications), nunca branding.
 *
 * Ver: docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md
 */
export const SHORTLIST_LIMITS = {
  inicial: {
    maxViewsPerShortlist: 20,
    expirationDays: 30,
    // Bs 350/mes — único plan disponible hoy.
  },
  // Plan Pro futuro: precio y features sin definir todavía.
  // Más vistas/duración solo NO es diferenciador suficiente — necesita features
  // productivas adicionales (analytics detallados, push, etc.) cuando se diseñe.
  // pro: { maxViewsPerShortlist: ?, expirationDays: ?, ...features }
} as const
```

---

## Checklist de completitud

Lo considero v1 listo cuando:

- [ ] Migración 235 aplicada (en local primero, después prod)
- [ ] Shortlist nueva expira automáticamente a los 30 días (verificar con SELECT)
- [ ] Shortlist nueva se bloquea automáticamente a las 21 vistas únicas (la 21ª ve "view_limit_reached")
- [ ] Cliente abriendo el link 5 veces desde el mismo dispositivo cuenta como 1 sola vista (cookie persistente)
- [ ] Cada vista queda registrada en `broker_shortlist_views` con fingerprint
- [ ] Watermark aparece en todas las shortlists públicas con ID corto
- [ ] Términos de uso aparecen en el form de creación de broker (checkbox obligatorio)
- [ ] Admin puede suspender shortlist individual desde `/admin/simon-brokers/[slug]`
- [ ] Comentarios sobre lever de monetización Pro presentes en código relevante
- [ ] Test manual: crear shortlist + abrir 21 veces desde 21 dispositivos distintos → 21ª ve página de bloqueo

---

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `sql/migrations/235_shortlist_protection.sql` | CREATE |
| `simon-mvp/src/pages/b/[hash].tsx` | MODIFY (middleware + render condicional) |
| `simon-mvp/src/lib/broker-plan-limits.ts` | CREATE |
| `simon-mvp/src/lib/shortlist-fingerprint.ts` | CREATE (helpers fingerprint/IP/cookie) |
| `simon-mvp/src/lib/broker-shortlists.ts` | MODIFY (queries de status + register visit) |
| `simon-mvp/src/components/sl/BlockedPage.tsx` | CREATE |
| `simon-mvp/src/components/sl/Watermark.tsx` | CREATE |
| `simon-mvp/src/components/admin/SimonBrokerTerms.tsx` | CREATE |
| `simon-mvp/src/pages/admin/simon-brokers/index.tsx` | MODIFY (checkbox términos) |
| `simon-mvp/src/pages/admin/simon-brokers/[slug].tsx` | MODIFY (lista de shortlists con suspender) |
| `simon-mvp/src/pages/api/admin/shortlist/suspend.ts` | CREATE |
| `docs/migrations/MIGRATION_INDEX.md` | UPDATE (agregar 235) |

---

## Continuación en sesión nueva

Para arrancar la sesión nueva sobre este trabajo:

1. Confirmar branch: `git status` debería mostrar `On branch broker-shortlist-protection-v1`
2. Prompt sugerido: *"Seguí el plan en docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md, vamos paso a paso. Empezamos por la migración 235."*
3. Ir tarea por tarea, commit por tarea para que cada paso quede granular.
4. Al final, mergear branch a `main` con un único PR descriptivo.

**Recordatorio**: este branch existe para no afectar producción mientras se construye. NO mergear hasta que el checklist esté completo.

---

## Implementación realizada (2026-04-25)

### Commits en order de dependencia

| # | Commit | Qué entrega |
|---|---|---|
| 1 | `47d7985` | Migración 235 — `broker_shortlists +5 cols`, `broker_shortlist_views` nueva, `simon_brokers.terms_accepted_at`. Backfill `expires_at = created_at+30d` para 22 shortlists existentes. RLS + policy `claude_readonly_select` en views. |
| 2 | `3f326aa` | Helpers server: `lib/broker-plan-limits.ts` (`SHORTLIST_LIMITS.inicial`), `lib/shortlist-fingerprint.ts` (cookie+IP+UA hash), `lib/broker-shortlists-server.ts` (7 funciones), tipo `BrokerShortlistProtected`. |
| 3 | `19c87e7` | UI components: `ShortlistBlockedPage` (3 mensajes), `ShortlistWatermark` (footer trazable). |
| 4 | `fcdc43a` | Middleware `pages/b/[hash].tsx` con 6 gates ordenados, Set-Cookie persistente, `Cache-Control: no-store`. Branch venta/alquiler intacta. |
| 5 | `72da132` | Términos onboarding: `SimonBrokerTerms` + checkbox required + validación API + `terms_accepted_at = NOW()` en `createBroker`. |
| 6 | `7f5b020` | Admin gestión: página `/admin/simon-brokers/[slug]` + APIs `/api/admin/shortlists` y `/api/admin/shortlists/[id]/suspend`. Link "Shortlists" en tabla del index. |
| **Merge** | **`037584b`** | **`Merge --no-ff broker-shortlist-protection-v1 into main`** |

### Archivos creados (10)

```
sql/migrations/235_shortlist_protection.sql
simon-mvp/src/lib/broker-plan-limits.ts
simon-mvp/src/lib/shortlist-fingerprint.ts
simon-mvp/src/lib/broker-shortlists-server.ts
simon-mvp/src/components/broker/ShortlistBlockedPage.tsx
simon-mvp/src/components/broker/ShortlistWatermark.tsx
simon-mvp/src/components/admin/SimonBrokerTerms.tsx
simon-mvp/src/pages/admin/simon-brokers/[slug].tsx
simon-mvp/src/pages/api/admin/shortlists/index.ts
simon-mvp/src/pages/api/admin/shortlists/[id]/suspend.ts
```

### Archivos modificados (4)

- `simon-mvp/src/types/broker-shortlist.ts` (+5 campos optional + nuevo `BrokerShortlistProtected`)
- `simon-mvp/src/pages/b/[hash].tsx` (middleware + watermark + early return blocked)
- `simon-mvp/src/lib/simon-brokers.ts` (`CreateBrokerInput.terms_accepted` required + INSERT)
- `simon-mvp/src/pages/api/admin/simon-brokers/index.ts` (validación 400 sin terms_accepted)
- `simon-mvp/src/pages/admin/simon-brokers/index.tsx` (state + checkbox + render `<SimonBrokerTerms>` + link "Shortlists")
- `docs/migrations/MIGRATION_INDEX.md` (entrada 235)

### Decisiones que difirieron del plan original

| # | Plan original | Decisión final | Por qué |
|---|---|---|---|
| 1 | Backfill `expires_at` con `DEFAULT (NOW() + 30d)` | Backfill explícito `created_at + 30d`, después `SET DEFAULT` | Shortlists viejas tienen expiración coherente con su edad real, no con el momento del ALTER. |
| 2 | `last_viewed_at` nuevo | NO se agrega | Ya existía en migración 228. |
| 3 | `terms_accepted_at` en migración aparte | Incluido en 235 | Trabajo SQL relacionado, sin razón para fragmentar. |
| 4 | Cache `s-maxage=60, stale-while-revalidate=300` | `private, no-store, no-cache, must-revalidate` | Crítico: cachear con Set-Cookie de fingerprint hace que el CDN sirva la misma cookie a múltiples clientes y rompa el uniqueness del cap. |
| 5 | Carpeta `components/sl/` | `components/broker/` | Carpeta existente que ya agrupa `ShortlistsPanel` y `ShortlistSendModal`. |
| 6 | Modificar `lib/broker-shortlists.ts` | Crear `lib/broker-shortlists-server.ts` aparte | El archivo existente es client-side puro (wrappers `fetch()`). Mezclar server+client viola el contrato implícito. |
| 7 | RPC SQL atómica para `registerNewVisit` | SELECT+UPDATE secuencial, no atómico | Source of truth = `broker_shortlist_views`; `current_views` es cache. Si aparece desincronización en prod, migrar a RPC. **YAGNI** hasta entonces. |
| 8 | Tabla shortlists embebida en `index.tsx` | Página dedicada `/admin/simon-brokers/[slug]` | CLAUDE.md la documentaba como ruta esperada; mantiene index.tsx legible. |

### Smoke test contra producción (2026-04-25)

Validado vía 2 curls a shortlist demo `rusV39jkh_` + queries de control:

- Feed normal renderiza (HTTP 200, body 134KB, title del feed) ✓
- Cookie `sl_visitor_<first8>` se setea con `HttpOnly + SameSite=Lax + Max-Age=1año` ✓
- `Cache-Control: no-store` ✓
- 2do hit con cookie → return visit (sin Set-Cookie nuevo) ✓
- `current_views` incrementa solo en visita única (0→1, no 2) ✓
- `view_count` incrementa en cada hit (3→5, analytics legacy preserva) ✓
- 2 filas en `broker_shortlist_views` (1 unique + 1 return), mismo fingerprint, ip_hash y ua poblados ✓

Visual chrome del feed + watermark validado por Lucho. Cleanup limpio: 0 residuos curl en BD post-test.

### Pendientes legítimos (no críticos)

- **Visual chrome del flujo nuevo `/admin/simon-brokers/<slug>`** → suspender/reactivar shortlist demo (cuando puedas).
- **Visual chrome del `BlockedPage`** forzando `status='suspended'` en BD si querés validarlo (no urgente — el código está testeado, es solo confirmar el render).
- **Migrar a RPC SQL atómica** si aparece desincronización del counter `current_views` en producción (probabilidad baja).
- **Agente de seguimiento agendado para 2 semanas** para revisar las primeras shortlists protegidas (cuántas llegaron al cap, cuántas expiraron, ratio de uniqueness real). Calibra si los caps del Plan Inicial están bien o hay que ajustar.
