# Contrato de atribución SICI ↔ marketing (repo Higgsfield)

> **Para qué es este doc:** que quien trabaje del lado de marketing sepa **qué está
> implementado**, **cómo funciona** y **qué le toca resolver a él**. Se escribe acá porque
> la implementación vive en SICI; el repo de marketing no se toca desde acá.
>
> **Cómo usarlo:** pasarle a la IA/persona de marketing este path absoluto —
> `C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/docs/canonical/CONTRATO_ATRIBUCION_MARKETING.md`
> (mismo patrón que se usa con `simon-brand` y `lab-kapso`).
>
> Verificado contra producción el 25-jul-2026.

---

## 1. Lo primero: el endpoint YA ESTÁ HECHO

`Higgsfield/publicacion/PEDIDO-DEV.md` dice **"Estado: PENDIENTE"** y que *"bloquea toda la
atribución orgánica"*. **Está desactualizado.**

✅ **`/ir/*` está vivo en `simonbo.com` desde el 22-jul-2026** (migs 290-293, PRs #34/#35).
La atribución orgánica **no está bloqueada**. Se puede publicar.

## 2. ⚠️ NO registra en GA4 — registra en Supabase

El pedido original pedía "registrar la visita en GA4". **No se hizo así, y por una razón
dura:** un redirect 302 del servidor **no ejecuta JavaScript**, así que `gtag` nunca dispara.
Un endpoint que redirige en <300 ms jamás va a registrar nada en GA4 por la vía del browser.

**Consecuencia práctica:** buscar estos clics en GA4 lleva a concluir en falso que "no
funciona". Están en la base de datos:

| Qué | Dónde |
|---|---|
| Clics del puente | tabla `mkt_clicks_puente` |
| Catálogo de piezas | tabla `mkt_piezas` |
| Qué pieza generó conversación | vista `v_atribucion_contactos` |

*(Ganancia lateral: al vivir en Supabase se puede cruzar con las piezas y con los leads, cosa
que GA4 no permitiría.)*

## 3. Cómo funciona el link puente

```
https://simonbo.com/ir/f03        ← forma corta, la del caption
https://simonbo.com/ir?p=id03&s=facebook&m=organic&o=bio   ← forma larga (bio)
```

**Formato del código:** `<letra><número>` → `f`=facebook · `i`=instagram · `t`=tiktok · `m`=meta.
El número se resuelve contra `mkt_piezas.num` para obtener el **nombre** de la pieza.

**Tres niveles de degradación** (el diseño nunca se queda sin marca de origen):

| Nivel | Cuándo | Texto que le llega a Simón por WhatsApp |
|---|---|---|
| 1 | El número está en `mkt_piezas` | *"vi tu publicación **«Equipetrol no es caro»**"* |
| 2 | El código parseó pero el número **no está** en la tabla | *"vengo de tu publicación **(m51)**"* |
| 3 | Sin código | `wa.me` pelado |

🔑 **En los tres niveles el clic SE REGISTRA igual**, con su `codigo`, `pieza_num`, `red` y UTM.
La medición **no se pierde nunca**. Lo que cambia entre nivel 1 y 2 es **lo que lee el cliente
en su propio mensaje**: el nombre de la pieza, o un código técnico.

---

## 4. 🔴 EL PROBLEMA A RESOLVER (del lado de marketing)

**`mkt_piezas` tiene 32 piezas (`num` 1-32).** Es el slate original de marzo-abril 2026 —
incluye piezas en todos los estados (15 pendientes, 6 listas, 3 publicadas, etc.), así que
**no es una tabla de "solo lo publicado"**: es el plan.

**`Higgsfield/publicacion/utm-por-pieza.csv` tiene 45 piezas (IDs 1-66).** La tanda **42-66**
existe y está **aprobada** (hay ~20 docs de producción en `Higgsfield/videos/ID-*.md` con
`status: aprobada`). **Nadie sincronizó la tabla con esa tanda nueva.**

### El impacto, medido (25-jul-2026)

De las 196 filas del CSV, **95 tienen link puente** (las demás son IG feed / TikTok, sin link
clickeable):

| | Links | Piezas | Qué lee el cliente |
|---|---|---|---|
| Nombre lindo | 45 | 20 | *"vi tu publicación «…»"* |
| **Solo código** | **50** | **25** (las 42-66) | *"vengo de tu publicación (m51)"* |

**Más de la mitad de los links mostrarían un código técnico en el mensaje del cliente.**

### Qué NO es

- ❌ No es un bloqueante: se puede publicar hoy y la medición funciona.
- ❌ No se pierde ningún clic ni ninguna atribución de pieza (el `pieza_num` se guarda igual).
- ❌ No es "piezas que no existen": existen y están aprobadas.

### Qué SÍ es

Un tema de **tono**: para un producto que cuida cómo habla, que el cliente escriba
*"vengo de tu publicación (m51)"* chirría. Es la diferencia entre que el mensaje diga el
**nombre de tu pieza** o un **código interno**.

### Cómo se resuelve

**Marketing entrega la lista de las piezas 42-66** con dos campos mínimos:

```
num  | nombre
-----|--------------------------------
42   | <nombre de la pieza>
43   | <nombre de la pieza>
...
```

(El resto de columnas de `mkt_piezas` —funnel, formato, avatar, captions— son opcionales;
`/ir` solo necesita `num` + `nombre`.)

**SICI las carga** en `mkt_piezas`. Es un INSERT, sin cambios de código. Los datos ya existen
en los `.md` de Higgsfield.

⚠️ **Regla que evita que esto se repita:** cuando marketing agregue piezas nuevas al slate,
avisar para cargarlas en `mkt_piezas` **antes de publicarlas**. Son dos fuentes de verdad
distintas (el CSV/slate y la tabla) y **divergen solas** si nadie las cruza.

---

## 5. Antes de la primera publicación

**Estado al 25-jul-2026: `mkt_clicks_puente` = 0 clics.** No es una falla — **todavía no se
publicó ningún link `/ir`**. La cadena completa nunca circuló en el mundo real.

🔴 **Recomendación: publicar UNA pieza primero y verificar.** No se sabe cómo trata el link el
navegador interno de Instagram/Meta, ni si el texto precargado llega entero a WhatsApp. Si algo
falla, es mejor descubrirlo con una pieza que con la campaña entera.

Verificación: `SELECT * FROM mkt_clicks_puente ORDER BY created_at DESC LIMIT 5;`

## 6. Trampa de GA4 que ya costó caro una vez

⚠️ **`source`, `medium` y `campaign` son nombres RESERVADOS de GA4.** Usarlos como parámetro
de un evento **pisa la fuente de tráfico de la sesión**. Ensuciaba el 29% de las sesiones —
justo las de quien más interactuaba. **El parámetro se llama `origen`.** Ver
`docs/backlog/MEDICION_FUNNEL_PLAN.md`.

---

## Referencias

| Qué | Path |
|---|---|
| Endpoint `/ir` | `simon-mvp/src/pages/api/ir/[[...slug]].ts` |
| Persistencia de UTM en el sitio | `simon-mvp/src/lib/utm.ts` (sessionStorage) |
| Plan de medición completo | `docs/backlog/MEDICION_FUNNEL_PLAN.md` |
| Migraciones | 290 (`mkt_clicks_puente`) · 292 (`simon_contactos`/`simon_mensajes`) · 293 (atribución por código) |
| Convención UTM (lado marketing) | `Higgsfield/publicacion/utm-y-links.md` |
| Pedido original (desactualizado) | `Higgsfield/publicacion/PEDIDO-DEV.md` |
