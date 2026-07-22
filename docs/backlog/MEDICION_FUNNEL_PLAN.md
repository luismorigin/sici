# Plan de medición del funnel — SICI / Simón

> Creado 22 Jul 2026. Diagnóstico sobre datos reales (GA4 28d + `leads_alquiler`).
> **Número elegido (founder, 22-jul): CONTACTOS POR WHATSAPP POR SEMANA.** Todo lo demás es diagnóstico.
> Número de apoyo: **piezas publicadas por semana** (el tráfico depende 100% de publicar — confirmado
> por el founder: 175 leads en abril publicando, 2 en julio sin publicar).

---

## 🔴 ACCIONES MANUALES DEL FOUNDER (no se pueden hacer desde el repo)

### 1. Activar el filtro de tráfico interno en GA4 — **pendiente**

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

### Paso 2 · Endpoint `/ir/*` + registro propio — ⏳ pendiente
El pedido original está en `Higgsfield/publicacion/PEDIDO-DEV.md`. **Corregir antes de pasarlo al dev:**
sus criterios de aceptación 1 y 2 se contradicen — **un 302 server-side no ejecuta JavaScript, así que
nunca dispara GA4** (y acá GA carga con `strategy="lazyOnload"`, más tarde todavía). Registrar
server-side en Supabase + 302, como ya hace `pages/api/abrir-whatsapp.ts` con Slack.
La tabla de piezas ya existe en la BD: **`mkt_piezas`** (32 filas, `num`/`nombre`/captions por red) —
mejor fuente que el CSV, evita el hardcode. ⚠️ Filtrar bots: los crawlers de Facebook y WhatsApp
piden el link para armar el preview e inflan los clicks (`leads_alquiler` ya tiene `es_bot` por esta
misma lección).

### Paso 3 · Los 7 eventos unificados — ⏳ pendiente
Reemplazan a los ~50 actuales. **La operación va como parámetro, no como sufijo** — eso es lo que
permite un solo embudo y comparar venta contra alquiler en el mismo informe:

```
feed_view         { operacion, macrozona, n_resultados }
buscar            { operacion, texto, n_resultados, origen }
ficha_abrir       { operacion, property_id, zona, precio }
favorito          { operacion, property_id, accion }
contacto_whatsapp { operacion, property_id, ubicacion, zona, precio }   ← LA conversión
lead_gate         { operacion, property_id }
puente_click      { pieza, red }
```
Incluye: eventos en `/` y `/b/*`, y mandar `visitor_uuid` como `user_id` de GA4 (ya existe en
`lib/visitor.ts` y en `leads_alquiler.visitor_uuid`; hoy **no** se manda a GA4 — es el hilo que une
GA4 ↔ BD ↔ WhatsApp). Al hacerlo, **arreglar el funnel de `scripts/check_ga4_metrics.py`**.

**Expectativa honesta:** a 231 usuarios/mes el fondo del embudo tiene números demasiado chicos para
optimizar por porcentaje (de 3 a 4 contactos no es "+33%", es una persona). El embudo sirve para
cazar caídas **arriba**, donde hay volumen. Los contactos de abajo se miran **de a uno**.

### Paso 4 · Webhook de Kapso — ⏳ pendiente (ya diseñado, sin implementar)
Cierra el círculo: click en la pieza → conversación real. **No requiere darle permiso de escritura al
bot** (hoy es `bot_kapso_readonly`, solo lectura, y así debe quedar): Kapso **empuja** el evento a
`POST /api/kapso/webhook` y SICI escribe con sus propios permisos.
Diseño completo: `docs/backlog/CRM_CLIENTES_B2C_PLAN.md` (decisiones confirmadas 5-jun-2026) +
`lab-kapso/CRM_PENDIENTE_LAB_KAPSO.md` Tarea 1 (bloqueada esperando el endpoint de SICI).

---

## Lo que NO se va a hacer (decidido 22-jul)

- ❌ Dashboard propio — GA4 + SQL alcanza a este volumen.
- ❌ Google Tag Manager — una capa más para 7 eventos.
- ❌ Atribución multi-touch / modelos first-click vs last-click — con 231 usuarios/mes, no.
- ❌ Más eventos "por si acaso" — cada evento sin una pregunta detrás es deuda.
- ❌ Medir el bot de WhatsApp en detalle — con guardar el primer mensaje alcanza.
