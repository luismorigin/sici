# CRM de Clientes B2C (leads del bot Simón) — PLAN (v2, decisiones confirmadas)

> ✅ **Estado: PLAN — decisiones confirmadas, SIN implementar.**
> - v1 (4-jun-2026): primer borrador del modelo de datos.
> - v2 (5-jun-2026): incorpora la revisión de datos de SICI (verificada contra producción)
>   + la verificación de capacidades de webhook de Kapso (lab-kapso).
> - **v2.1 (5-jun-2026): el founder confirmó los cierres del §7. Diseño listo para implementar
>   (por fases). Nada implementado todavía.**

## 1. Problema / motivación

La data de los clientes que pasan por el **bot de WhatsApp** (`simon-asistente`) está
**fragmentada y sin entidad de cliente**:

- **Kapso** tiene las conversaciones, pero como memoria efímera (variables execution-scoped)
  + el historial en su plataforma. No es nuestro, no es consultable/agregable.
- **Supabase** tiene `broker_shortlists`, pero **una fila suelta por shortlist**, con
  `cliente_nombre`/`cliente_telefono` denormalizados y **sin nada que vincule** las
  interacciones de la misma persona. No hay tabla de "cliente".

**Objetivo** (founder): un CRM donde se vea a los clientes por nombre, con sus **mensajes
guardados** (revisar cómo se comporta el agente), las **shortlists generadas**, y señales para
**mejorar el sistema**. Por ahora **observa y organiza**; no automatiza follow-up. Es la feature
"Cliente como entidad" ya prevista en la migración 234 y la visión "Simón con CRM" (lab-kapso D25).

## 2. ⚠️ Supuesto corregido por SICI (leer antes que nada)

El draft v1 asumía que `broker_shortlists` era B2C. **No lo es** — verificado contra producción:

1. **Mezcla dos poblaciones.** Solo `simon-asistente` (21 shortlists, 6 teléfonos) es el bot B2C.
   El resto son clientes de **brokers reales B2B** (abel-flores 39, laurent-eguez 10, demo/otros).
   → Un `contacto_id` backfilleado sobre **toda** la tabla crearía "contactos B2C" que son
   clientes de un broker. **Todo el CRM se scopea a `broker_slug = 'simon-asistente'`.**
2. **El teléfono está sucio y no se normaliza al escribir.** El mismo número vive en 3 formatos
   (`+59176308808`, `76308808`, `59176308808`). Causa: `pages/api/broker/shortlists/index.ts`
   hace solo `.trim()`, sin normalizar.
3. **El teléfono NO es único por persona globalmente.** El número de test del founder aparece bajo
   5 brokers distintos en 59 shortlists. Es único **dentro del universo del bot**, no en toda la tabla.
   → El contacto B2C se arma **solo desde shortlists del bot**; las apariciones B2B del mismo número
   no cuentan.
4. **`hearts`/`views` son a nivel shortlist, no persona** (decisión deliberada de mig 234). El
   "marcó favoritos" se atribuye a la shortlist, no a la persona → declararlo como **limitación**.

## 3. Principios de diseño

1. **El teléfono normalizado (`+591…`) es la identidad — dentro del universo del bot.** Todo el CRM
   se construye scopeado a `simon-asistente`.
2. **Supabase es el dueño del CRM, no Kapso.** Kapso es una fuente que se ingiere vía webhook.
3. **Mensajes espejados a Supabase** (decisión tomada): se ingiere cada mensaje (in y out) a tabla propia.
4. **Aditivo y por capas.** El bot de Kapso y el pipeline SICI no se tocan.
5. **No duplicar lo que ya existe.** El funnel y los contadores se **derivan** en vistas; solo se
   crean tablas nuevas para lo que no tiene hogar.

## 4. Identidad: reusar `lib/phone.ts`, NO inventar formato

- **Fuente de verdad: `simon-mvp/src/lib/phone.ts` → `normalizePhone()`** (formato `+591[67]\d{7}`),
  ya usada en leads, modal de captura y admin de brokers. **NO crear un formato nuevo** (el doc v1
  proponía dígitos pelados `59177066308` → sería un tercer formato y más duplicados).
- **Cablear `normalizePhone()` donde hoy falta:** (a) el create de shortlists (`shortlists/index.ts`,
  hoy solo `.trim()`), (b) el webhook de ingest, (c) el bot.
- Para el backfill SQL, una función Postgres que **replique exactamente** `+591…` (espejo de
  `lib/phone.ts`; el TS manda). `CHECK (telefono ~ '^\+591[67][0-9]{7}$')` en `simon_contactos`.
- Bonus: el webhook de Kapso ya entrega el teléfono en `+` E.164 (`conversation.phone_number`).

## 5. Esquema (3 capas) — v2 con ajustes de SICI

### Capa 1 · `simon_contactos` (entidad cliente, solo bot)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `telefono` | text **UNIQUE** + `CHECK (~ '^\+591[67][0-9]{7}$')` | identidad |
| `nombre` | text NULL | último conocido (puede venir vacío/sucio) |
| `estado` | text | etapa del pipeline (§7.1) — **estado real, editable** |
| `notas` | text | notas manuales del founder |
| `created_at` / `updated_at` | timestamptz | |

> **Sacado del v1 a propósito:**
> - `total_shortlists`, `total_mensajes`, `primer/ultimo_contacto_at` → **derivables**, se calculan en
>   una **vista de resumen** (con el volumen actual no vale un trigger).
> - `operacion_ult`, `zona_ult`, `presupuesto_ult`, `dorms_ult` → **NO van en el contacto**. La intención
>   de búsqueda **no es un atributo de la persona, es de cada búsqueda** (un cliente puede pedir 2
>   shortlists o cambiar de criterio → "último" pisaría el historial). Van al **grano de la búsqueda**
>   (ver Capa 3 · Criterios). Si se quiere un "último criterio" para mostrar rápido, se **deriva** de la
>   última shortlist en una vista; el dato vive por-búsqueda.
> En la tabla queda solo lo que es **estado real editado a mano** (`estado`, `notas`).

**Se puebla:** (a) *backfill* agrupando `broker_shortlists` **WHERE broker_slug='simon-asistente'**,
normalizando el teléfono **antes** de agrupar, **excluyendo números de test** (`+59177777777`,
`+59177777778`, `70000000`, `+59170000001`, el del founder `76308808`); (b) *upsert* en cada mensaje
entrante (crea el contacto aunque no haya shortlist → tope del funnel) y en cada shortlist del bot.

### Capa 2 · `simon_mensajes` (conversación espejada)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `contacto_id` | uuid FK → `simon_contactos` | |
| `telefono` | text | denormalizado (robustez en el ingest) |
| `direccion` | text | `in` / `out` |
| `texto` | text | |
| `tipo` | text | text/image/interactive… |
| `kapso_message_id` | text **UNIQUE** | = `wamid` de WhatsApp; idempotencia |
| `kapso_conversation_id` | text | `conversation.id` |
| `enviado_at` | timestamptz | timestamp real del mensaje |
| `metadata` | jsonb | **mínimo** — no "todo por las dudas" (evitar PII innecesaria) |

- **Índice** `(contacto_id, enviado_at DESC)` para el timeline.
- **Idempotencia real:** `INSERT … ON CONFLICT (kapso_message_id) DO NOTHING` (el UNIQUE solo no
  alcanza; el upsert evita el 23505 en cada reintento del webhook).
- **Fuente (verificado, §8):** `whatsapp.message.received` (in) + `whatsapp.message.sent` (out).

**`simon_agente_acciones` (tool-calls del agente) → FUERA de v1.** No hay evento de webhook para
tool-calls (§8). Es la capa más valiosa para auditar al agente, pero es **fase 2** vía la API de
execution-events de Kapso (pull).

### Capa 3 · Señales / funnel (DERIVADA) + Criterios de búsqueda

- **Criterios de búsqueda (la intención) — por shortlist, NO por contacto.** Cada shortlist guarda los
  criterios con que se buscó: `operacion` (ya está como `tipo_operacion`), `zona`, `presupuesto`, `dorms`.
  **Grano = la búsqueda**, para preservar historial cuando el cliente pide varias o cambia de idea.
  - **Quién los llena:** el bot, que **ya los tiene** en sus variables de sesión (`simon_operacion`,
    `simon_zona`, `simon_presupuesto`, `simon_dorms`) → los pasa en el `crear_shortlist`. **No se parsean
    de los mensajes** (eso sería sobre-ingeniería y propenso a error).
  - **Dónde guardarlos (decisión de implementación):** columnas nullable en `broker_shortlists`, o una tabla
    companion `simon_busquedas(shortlist_id, operacion, zona, presupuesto, dorms)` scopeada al bot. Recomiendo
    la **companion** (no ensucia la tabla compartida con B2B, alinea con "scope al bot"). Para B2B no aplica
    (los brokers eligen a mano, no buscan por criterio).
  - **Por qué importa:** habilita análisis real — distribución de demanda (operación/zona/presupuesto),
    evolución de la intención de un cliente, conversión por criterio. Sin esto la base no sirve para analizar.
- **Shortlists** → `broker_shortlists.contacto_id` (UUID **NULL** FK → `simon_contactos`).
  Backfill **scopeado a `simon-asistente`** (las B2B quedan NULL — semánticamente correcto).
  **Índice parcial:** `… ON broker_shortlists(contacto_id) WHERE contacto_id IS NOT NULL`.
  Mantenerlo poblado en el create path del bot (scopeado al slug).
- **Abrió el link** → `broker_shortlist_views` (existe). · **Favoritos** → `broker_shortlist_hearts`
  (existe, **a nivel shortlist** — declarar limitación). · **Pidió más alternativas** → mensaje
  `ref:v1` en `simon_mensajes`. · **Escaló a humano** → evento `workflow.execution.handoff` (§8).
- **`v_simon_contacto_timeline`**: `UNION ALL` de mensajes + shortlists + hearts + views **por
  `contacto_id`** (NUNCA por join de teléfono — colapsaría el número de test en un contacto
  monstruoso). Más una **vista de resumen** para los contadores/`*_ult`.
- **No crear `simon_eventos` genérico** ahora (EAV = deuda prematura). Reconsiderar solo si aparecen
  eventos sin hogar.

## 6. Flujo de ingest + webhook

```
Cliente ⇄ WhatsApp ⇄ Kapso
   └─ whatsapp.message.received / .sent ─→ POST /api/kapso/webhook (simon-mvp, service_role)
                                             ├─ valida HMAC/secreto (rechaza lo no firmado)
                                             ├─ normalizePhone(conversation.phone_number)
                                             ├─ upsert simon_contactos
                                             └─ INSERT simon_mensajes ON CONFLICT (kapso_message_id) DO NOTHING
crear_shortlist (existe) ─→ broker_shortlists ─→ set contacto_id (scopeado a simon-asistente)
```

**Obligatorio en el endpoint (SEGURIDAD_SUPABASE.md):**
- **Autenticación del webhook (HMAC / secreto compartido de Kapso).** Sin esto, cualquiera con la URL
  inyecta mensajes falsos al CRM — **el agujero más grande del plan**.
- `service_role` server-side (nunca `NEXT_PUBLIC_`).
- **GRANTs explícitos (Regla 6 / `_template.sql`):** tablas nuevas post-30-oct-2026. Preset PII:
  `service_role ALL` + `claude_readonly SELECT`, **sin anon**.
- **RLS deny-all** (sin policy anon/authenticated), igual o más estricto que `broker_shortlists`.

### Relaciones

```
simon_contactos (telefono UNIQUE, +591…)
   ├─< simon_mensajes (contacto_id)            [in/out, idempotente por wamid]
   └─< broker_shortlists (contacto_id NULL)  ─< broker_shortlist_items
                                               ├─< broker_shortlist_hearts   [nivel shortlist]
                                               └─< broker_shortlist_views
   (simon_agente_acciones → fase 2, pull de execution-events)
```

## 7. Decisiones (§7 v1) — RESUELTAS con defaults de SICI

| # | Decisión | Resolución |
|---|---|---|
| 1 | `estado` | **Derivado del funnel** (nuevo→activo→contactó→cerrado) con **override manual** del founder. |
| 2 | Mensajes `out` | ✅ **RESUELTO**: Kapso los emite (`whatsapp.message.sent`). Espejo in+out viable día 1. |
| 3 | Tool-calls | **Fase 2** — sin evento de webhook; pull de execution-events. `simon_agente_acciones` fuera de v1. |
| 4 | Click captador | Solo es medible el **clic** (intención), NO el envío real (ocurre en el WhatsApp del captador, fuera de nuestra plataforma → imposible). Cierre: **fase 2**, vía redirect por `/api/abrir-whatsapp`. V1 no lo necesita. |
| 5 | Formato teléfono | **Cerrado**: `+591…` de `lib/phone.ts`. |
| 6 | Backfill histórico | Contactos/shortlists: mirar el pasado (scopeado al bot + normalizado + sin test). Conversaciones: espejo **desde hoy** (histórico de Kapso = fase 2 opcional). |
| 7 | Retención / RLS | **Mensajes: 18 meses + purge mensual.** Contactos + shortlists: se mantienen. deny-all + service_role + claude_readonly; al `SUPABASE_RLS_BACKLOG.md` día 1. |
| 8 | Variables de intención | **Cerrado**: se guardan **por búsqueda** (Capa 3 · Criterios), las pasa el bot al crear la shortlist. NO se parsean de los mensajes. |

**Todas las decisiones confirmadas por el founder (5-jun-2026).** Ninguna bloquea arrancar por la Capa 1.

## 8. Verificación de capacidades de Kapso (5-jun, lab-kapso)

Fuente: `integrate-whatsapp/references/webhooks-event-types.md`.
- ✅ **Outbound del bot por webhook**: `whatsapp.message.sent` (`direction: outbound`, con texto).
- ✅ **Inbound**: `whatsapp.message.received` (`direction: inbound`).
- ✅ Webhook trae teléfono `+591…` (`conversation.phone_number`) + nombre (`conversation.kapso.contact_name`)
  + `wamid` (`message.id`) para idempotencia.
- ⚠️ **Tool-calls: NO hay evento** → fase 2 vía API de execution-events.
- ➕ Eventos útiles para funnel/alertas: `workflow.execution.handoff`, `whatsapp.conversation.inactive`/`.ended`.
- Nota: `whatsapp.message.received` soporta buffering/batch → contemplarlo en el ingest.

## 9. Fuera de alcance (por ahora)

- No es el CRM de **brokers** (`broker_prospection`, B2B) — no mezclar.
- No manda mensajes ni automatiza follow-up — solo **observa y organiza**.
- No hay scoring/priorización de leads (posible fase futura sobre el funnel).

## 10. Referencias

- Esquema shortlists: CLAUDE.md Regla 14. · Seguridad: `docs/canonical/SEGURIDAD_SUPABASE.md`.
- Normalización: `simon-mvp/src/lib/phone.ts`. · Write path a corregir: `pages/api/broker/shortlists/index.ts`.
- Webhooks Kapso: `lab-kapso/.claude/skills/integrate-whatsapp/references/webhooks-*.md`.
- Bot y variables: `lab-kapso/CLAUDE.md` (Regla 9), `DECISIONES.md` (D25 visión CRM, D27 variables, D29 loop alternativas).
- Cliente-como-entidad ya previsto: migración 234 (`broker_shortlist_hearts`).
