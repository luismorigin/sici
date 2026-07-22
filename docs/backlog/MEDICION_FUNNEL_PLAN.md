# Plan de medición del funnel — SICI / Simón

> Creado 22 Jul 2026. Diagnóstico sobre datos reales (GA4 28d + `leads_alquiler`).
> **Número elegido (founder, 22-jul): CONTACTOS POR WHATSAPP POR SEMANA.** Todo lo demás es diagnóstico.
> Número de apoyo: **piezas publicadas por semana** (el tráfico depende 100% de publicar — confirmado
> por el founder: 175 leads en abril publicando, 2 en julio sin publicar).

---

## 🔴 ACCIONES MANUALES DEL FOUNDER (no se pueden hacer desde el repo)

### 1. Activar el filtro de tráfico interno en GA4 — ✅ **ACTIVADO por el founder (22-jul)**

> ⚠️ **Todavía no surte efecto: el código que pone la etiqueta no está en producción.** El filtro
> excluye los hits con `traffic_type=internal`, y ese parámetro lo manda el `gtag('config', …)` de
> `_app.tsx` — que vive en la rama `fix/analytics-atribucion`, sin pushear. Filtro activo + nadie
> etiquetando = no filtra nada. Empieza a funcionar con el deploy.


**Qué es, en simple:** el código ya le pone una **etiqueta** a las visitas del equipo (a quien pasó
alguna vez por `/admin` o `/broker`). Pero **poner la etiqueta y descartar la visita son dos cosas
distintas**: GA4 recibe el hit etiquetado y lo sigue contando hasta que alguien, desde el panel, le
dice "a los que traen esta etiqueta, ignoralos". Ese permiso se da una sola vez y a mano — Google no
deja hacerlo desde el código, justamente porque **descartar tráfico es destructivo**.

**Dónde:** GA4 → **Administrar** (engranaje abajo a la izquierda) → **Configuración de datos** →
**Filtros de datos**. Ahí suele existir ya un filtro llamado **"Internal Traffic"** creado por Google,
en estado **"Probando"** (`Testing`). Hay que abrirlo y ponerlo en **"Activo"**.
Si no existe: **Crear filtro** → tipo *Tráfico interno* → acción *Excluir* → valor del parámetro
`traffic_type` = `internal` → Activo.

**Por qué importa:** hoy el desktop del sitio son **154 sesiones de solo 34 usuarios con ~992 s de
duración promedio** — o sea, nosotros trabajando. Mientras eso esté adentro, toda métrica de
"cuánto se queda la gente" está inflada y no sirve para decidir nada.

⚠️ **Dos advertencias antes de activarlo:**
- **No es retroactivo.** Los datos viejos siguen incluyendo nuestro tráfico. El corte es desde el día
  que lo activás.
- **Es irreversible hacia atrás.** Un hit excluido no se recupera nunca. Es lo correcto acá (queremos
  que desaparezca), pero conviene saberlo.

**Cómo verificar que quedó bien:** a los 2-3 días, en *Informes → Adquisición*, el promedio de
duración de sesión de desktop tiene que **bajar** bastante. Si sigue en ~900 s, el filtro no está activo.

### 2. Marcar `contacto_whatsapp` como conversión (key event) en GA4 — **pendiente**
Va junto con el paso 3 (cuando exista el evento unificado). GA4 → Administrar → **Eventos** →
marcar como *evento clave*. Sin esto, GA4 no lo trata como conversión en ningún informe.

### 3. Confirmar si Kapso puede mandar webhooks en el plan actual — **pendiente**
Ver paso 4. El diseño ya existe; falta confirmar que el plan contratado de Kapso lo incluye.

### 5. Activar el webhook de Kapso — **pendiente, es lo único que falta**

> Fuente: doc oficial `docs.kapso.ai` → *Webhooks overview* (la doc local de `lab-kapso` es más
> vieja y omite el formato de lote y la opción de fijar el secreto).

**Tiene que ser un webhook de WhatsApp (por número), NO de proyecto.** Textual de la doc:
*"Project webhooks … No message or conversation events here. Use a WhatsApp webhook per phone
number."* Si se crea a nivel proyecto no llega ningún mensaje y **no hay error visible**. El bot
tiene **dos números** (`597907523413541` y `998245303375051`, en `lab-kapso/workflows/simon/workflow.js`)
→ **un webhook por número**.

#### Opción A — por API (permite FIJAR el secreto, así que es la más simple)

```bash
curl -X POST https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/<PHONE_NUMBER_ID>/webhooks   -H "X-API-Key: $KAPSO_API_KEY" -H "Content-Type: application/json"   -d '{"whatsapp_webhook":{"kind":"kapso",
       "url":"https://simonbo.com/api/kapso/webhook",
       "events":["whatsapp.message.received","whatsapp.message.sent"],
       "secret_key":"<EL SECRETO QUE ELIJAS>"}}'
```
Con el secreto elegido de antemano, se puede poner primero en Vercel y no hay ventana de 401.

#### Opción B — por la UI (Kapso genera el secreto)

**Integrations → Webhooks → pestaña *WhatsApp webhooks*** (no *Platform webhooks*) → Add Webhook →
URL `https://simonbo.com/api/kapso/webhook`, eventos `whatsapp.message.received` +
`whatsapp.message.sent`, payload version **v2**. Kapso muestra un secreto auto-generado: copiarlo.

#### En los dos casos

1. `KAPSO_WEBHOOK_SECRET` en Vercel (Production) con ese valor.
2. **Redeploy** — Vercel no toma variables nuevas sin volver a deployar.
3. Recién entonces dejar el webhook activo, y repetir para el segundo número.

Si se activa Kapso antes de que Vercel tenga el secreto: el endpoint responde 401, Kapso reintenta
a los 10s/40s/90s y después **descarta** esos mensajes.

**Verificar** escribiéndole al bot desde otro teléfono:
```sql
SELECT COUNT(*) FROM simon_mensajes;                        -- > 0
SELECT pieza, COUNT(*) FROM v_atribucion_contactos
  WHERE atribuido GROUP BY 1 ORDER BY 2 DESC;               -- qué pieza trajo la conversación
```
Si queda vacío: en Kapso, historial de entregas del webhook. **401** = el secreto no coincide ·
**503** = falta la variable o el redeploy · **sin intentos** = se creó a nivel proyecto.

### 4. Aplicar la migración 290 en Supabase — **pendiente, bloquea el registro de `/ir`**
`sql/migrations/290_mkt_clicks_puente.sql` desde Supabase UI o psql (el MCP es readonly).
**El endpoint ya funciona sin ella** — redirige bien y con el texto correcto — pero **cada click
se pierde** hasta que la tabla exista (el insert falla con `PGRST205` y el código lo absorbe a
propósito: se prefiere perder el dato antes que el lead). Verificar después:
`SELECT relacl::text FROM pg_class WHERE relname='mkt_clicks_puente';` → no debe aparecer `anon`.

---

## Diagnóstico (22 Jul 2026, datos reales)

**Volumen:** 231 usuarios / 392 sesiones / 28 días · 381 sesiones de Bolivia ·
mobile 269 ses / 207 usuarios (121 s) · desktop 154 ses / 34 usuarios (992 s, = nosotros).
**Conversión real: 3 contactos en 28 días** (2 alquiler + 1 venta). Coincide con `leads_alquiler`.

**Los 6 problemas encontrados, por daño:**

| # | Problema | Estado |
|---|---|---|
| 1 | `source` como parámetro pisaba la fuente de tráfico (29% de sesiones mal atribuidas) | ✅ resuelto 22-jul |
| 2 | UTM se perdían al navegar dentro del sitio (~40% de leads sin origen) | ✅ resuelto 22-jul |
| 3 | Tráfico propio contaminaba los promedios | ⚠️ código listo, **falta el click en GA4** |
| 4 | Eventos duplicados `_venta` vs alquiler → imposible un embudo único | ⏳ paso 3 |
| 5 | `/` (home, la entrada), `/b/*` (shortlists) y `/whatsapp` sin eventos | ⏳ paso 3 |
| 6 | Nada mide del lado de WhatsApp — el click no se une al lead | ⏳ paso 4 |

**Sobre el #4, ejemplo concreto del costo:** `scripts/check_ga4_metrics.py` reporta *"conversión
total 0.87%"*. Es falso: el embudo persigue `view_property → open_detail → click_whatsapp`, que son
los nombres de **alquileres**, e ignora las **442 aperturas de ficha de ventas**.

**Sobre el #5, el caso que lo justifica:** el **17-jul entraron 143 personas en un día**, todas de
Bolivia, todas mobile, todas `(direct)`, 1 sola página por persona. No hay forma de saber de dónde
salieron (probablemente un link compartido por WhatsApp, que no manda referrer). Ese día se perdió
la respuesta a la única pregunta que importaba.

**Dato de producto, no de medición:** las shortlists `/b/[hash]` son la página con **más engagement
del sitio** (700-860 s por sesión, contra 121 s del feed mobile) **y son las que menos medimos**.

---

## Plan — 4 pasos

### Paso 1 · Reparar lo que miente — ✅ HECHO (22-jul, rama `fix/analytics-atribucion`)
`source`→`origen` (48 llamadas, 8 archivos) · `lib/utm.ts` (origen persistido en sessionStorage) ·
`traffic_type: internal`. Verificado con Playwright. Cortes de datos en `docs/meta/GA4_EVENTOS.md`.

### Paso 2 · Endpoint `/ir/*` + registro propio — ✅ HECHO (22-jul) · ⚠️ falta aplicar la mig 290

`simon-mvp/src/pages/api/ir/[[...slug]].ts` + rewrite en `next.config.js` + mig 290.

**Se apartó del pedido original** (`Higgsfield/publicacion/PEDIDO-DEV.md`) en un punto: sus criterios
de aceptación 1 y 2 **se contradicen** — un 302 server-side no ejecuta JavaScript, así que nunca
dispara GA4 (y acá GA carga con `strategy="lazyOnload"`, más tarde todavía). El registro va a
Supabase, como ya hace `pages/api/abrir-whatsapp.ts` con Slack. Todo lo demás del pedido se cumple.

Decisiones:
- **Piezas desde `mkt_piezas`** (no el CSV, no hardcode), cacheadas 1h en memoria: el redirect no
  puede pagar un roundtrip a la BD solo para armar el texto.
- **Bots filtrados por user-agent** y NO registrados: los crawlers de FB/WhatsApp piden el link para
  armar el preview de la tarjeta. Sin esto, cada vez que alguien comparte el link se cuenta un click
  que nadie hizo (misma lección que `leads_alquiler.es_bot`).
- **Nada bloquea la llegada a WhatsApp:** timeout de 800 ms al registro y `try/catch` que redirige
  igual. Perder el dato es aceptable; perder el lead no.
- Códigos inválidos (`/ir/zzz`) redirigen sin texto pero **se registran con `valido=false`** — un pico
  ahí significa que hay un caption publicado con el link mal escrito.

**Verificado con curl** (dev): `f03` → texto de la pieza 3 · `i05` → pieza 5 · forma larga → pieza 1 ·
`zzz` → sin texto · bot FB y preview de WhatsApp → sin registro. **100-130 ms** (requisito: <300 ms).

🐛 **Bug cazado en la verificación, vale recordarlo:** el query builder de supabase-js es un
*thenable* — tiene `.then()` pero **no `.catch()`**. Pasarlo a un helper tipado como `Promise`
compila sin chistar y revienta en runtime; como el handler atrapa todo y redirige igual, **el fallo
era invisible**: redirigía sin texto y sin registrar nada. Se arregló con `Promise.resolve()` y
tipando `PromiseLike`. Sin probarlo de verdad, esto se iba a producción "funcionando".

### Paso 3 · Los 7 eventos unificados — ✅ HECHO (22-jul)

`simon-mvp/src/lib/analytics.ts` + `feed_view` en ventas + `buscar` en la home + `user_id` en `_app`.

**Cómo, sin romper nada:** no se tocaron los ~25 call-sites repartidos en 9 archivos (superficie
enorme para un cambio de nombres). `lib/analytics.ts` **traduce**: cuando un feed dispara su evento
legacy, se emiten los dos — el legacy conserva la serie histórica y el canónico alimenta el embudo.
Para retirar los legacy (~1 mes) alcanza con borrar el mapa `CANONICO`, sin tocar los feeds.

También: se eliminaron las **copias locales de `trackEvent`** en `alquileres.tsx` y
`zona-norte/alquileres.tsx` (idénticas a la central, pero al no pasar por ella dejaban al feed
principal fuera del embudo), y `visitor_uuid` se manda a GA4 como `user_id` — el hilo que une
GA4 ↔ BD ↔ (a futuro) WhatsApp.

🔴 **Hallazgo grande: los eventos de entrada se estaban perdiendo.** GA se inyecta con
`strategy="lazyOnload"` (después de `window.onload` + idle) pero `feed_view` / `page_enter_alquiler`
se disparan en el mount, mucho antes; `trackEvent` era no-op si `gtag` no existía todavía. **Está en
los datos:** `/alquileres` tuvo **202 sesiones** en 28 días y `page_enter_alquiler` registró solo
**23 usuarios** — el primer paso del embudo sub-reportado ~10x, lo que además inflaba toda tasa de
conversión calculada sobre él. Ahora se encolan hasta que `gtag` aparece. Verificado con Playwright:
antes del fix `/ventas` y `/alquileres` emitían **cero** eventos en carga directa; después, todos.

También se arregló `scripts/check_ga4_metrics.py`, que perseguía los nombres de alquileres e
ignoraba ventas: reportaba "conversión total 0.87%" dejando fuera 442 aperturas de ficha de venta.

**Verificado:** 14/14 casos de la capa de traducción contra el código real compilado (los 4 caminos
al contacto, casas=venta, `lead_gate` que no se duplica, nulls filtrados, eventos ajenos intactos)
+ en navegador real el recorrido `buscar` (home) → `feed_view` (alquiler) y `feed_view` con
`operacion=venta` en el otro feed: **el mismo nombre de evento en ambos, que es todo el punto.**

⚠️ **Corte de datos:** los canónicos existen desde el 22-jul. Consultarlos en ventanas anteriores
da vacío. Y el volumen del primer paso del embudo **sube** por el fix de la cola: no es que llegue
más gente, es que antes no se contaba.

### Paso 4 · Webhook de Kapso — ✅ **VERIFICADO EN PRODUCCIÓN (22-jul)**

> **Prueba end-to-end real:** el founder abrió `simonbo.com/ir/f03` desde su celular, WhatsApp se
> abrió con el texto precargado, envió el mensaje y el bot respondió. Quedó registrado:
> `v_atribucion_contactos` → pieza **3 "Los 5 barrios de Equipetrol"**, `atribuido=true`, `via=nombre`
> · `simon_contactos` → 1 contacto con **2 mensajes (1 in + 1 out)** — el webhook captura también las
> respuestas del bot. Migraciones 290-293 aplicadas. Webhook activo en Kapso (número `simon`, Kapso
> events, v2) + `KAPSO_WEBHOOK_SECRET` en Vercel.

`simon-mvp/src/pages/api/kapso/webhook.ts` + mig 292 (`simon_contactos`, `simon_mensajes`,
`v_atribucion_contactos`). Es el subconjunto de MEDICIÓN de `CRM_CLIENTES_B2C_PLAN.md` (capas 1 y 2
tal cual el diseño del 5-jun); la capa 3 (criterios por búsqueda, timeline, UI admin) es CRM y sigue
en ese plan.

**El bot NO escribe en SICI y no hay que cambiarlo.** Kapso EMPUJA el evento y SICI escribe con su
propio `service_role`. `bot_kapso_readonly` sigue siendo incapaz de modificar nada.

🎯 **`v_atribucion_contactos` es lo que cierra el círculo.** El endpoint `/ir` precarga en WhatsApp
*«Hola Simón, vi tu publicación "X" y quiero saber más»*, así que el nombre de la pieza viaja DENTRO
del mensaje. Cruzándolo con `mkt_piezas` se obtiene lo que hasta ahora era imposible: **qué
publicación generó una conversación real**, no solo un click.

⚠️ **Límites declarados de esa atribución:** la persona puede borrar el texto antes de enviar; dos
piezas con nombres parecidos pueden confundirse; solo cubre a quien llegó por `/ir`. **Sirve para
comparar piezas entre sí, no como conteo absoluto.**

**Verificado con curl** contra el dev server: sin firma → 401 · firma falsa → 401 · firma de otro
secreto → 401 · **body alterado con la firma del original → 401** (detecta manipulación) · firma
válida → procesa. Contrato tomado de la doc real de Kapso
(`lab-kapso/.agents/skills/integrate-whatsapp/references/webhooks-overview.md`): header
`X-Webhook-Signature` = `HMAC-SHA256(secret, raw body)` en hex, verificado contra los **bytes crudos**
(por eso `bodyParser: false` — si Next parsea, el JSON re-serializado ya no es el que se firmó).

## Lo que NO se va a hacer (decidido 22-jul)

- ❌ Dashboard propio — GA4 + SQL alcanza a este volumen.
- ❌ Google Tag Manager — una capa más para 7 eventos.
- ❌ Atribución multi-touch / modelos first-click vs last-click — con 231 usuarios/mes, no.
- ❌ Más eventos "por si acaso" — cada evento sin una pregunta detrás es deuda.
- ❌ Medir el bot de WhatsApp en detalle — con guardar el primer mensaje alcanza.
