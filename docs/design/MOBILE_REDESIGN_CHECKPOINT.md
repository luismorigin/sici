# Mobile Redesign — Checkpoint de mockups aprobados (15 Jul 2026)

> Sesión de **diseño** (mockups vía visualize, iterados con Lucho).
> Objetivo: llevar las mejoras del DESKTOP al MOBILE **sin quitar la base TikTok**.
> Este doc tiene todo lo necesario para armar el plan de implementación y codear.

## ⚙️ ESTADO DE IMPLEMENTACIÓN (rama `claude/session-context-e0ffd1`, sin push)
- ✅ **P1** (`b8dccf4`) — Cards: specs con iconos + chip fiduciario "vs. similares" (ambos feeds). Verificado 390px.
- ✅ **P2** (`166c761`) — Filtros: secciones Comodidades + Atributos, header "N resultados"
  centrado + ✕, footer Limpiar/Ver, números completos (no "K"). Verificado 390px.
- ✅ **P3a** (`2aa6f1a`) — Sheet: mercado mobile muestra total + por m²; sheet normal ya no
  muestra "Captado por [agente]" (solo en contactoDirecto). Ícono compartir ya era universal.
- 🔴 **P3b (PENDIENTE, tanda dedicada)** — el re-theme VISUAL del sheet mobile: des-gatear las
  secciones ricas (stats con iconos `bsm-stats`, split amenidades `bsm-comod-*`/`bs-especial-*`,
  mercado v2 con medidor `bs-mkt2-*`, costos/ingreso alquiler `bs-costos-*`) y **re-tematizarlas
  para mobile**. **Bloqueo técnico**: su CSS está scopeado a `.bs-venta.bs-side` / `.bs-side-alq`
  (modal claro desktop) con colores claros hardcodeados → en ventas mobile (oscuro) el texto
  oscuro queda invisible. Hay que gatear `!sideMode && isDesktop` (viejas) / `sideMode || !isDesktop`
  (ricas) + escribir estilos mobile (oscuro ventas / arena alquileres, que reusa más el estilo claro).
- 🔴 Transversales desktop PENDIENTES: #3 histograma (mobile+desktop), #5 TC dinámico, #8 comparador
  total+m² en DESKTOP (mobile ya hecho en P3a).

## Principio clave (lo que hace que NO se rompa TikTok)
- La **base TikTok = el FEED** (swipe vertical full-screen, foto grande, corazón en la
  foto, barra fija abajo). **NO se toca.**
- Casi todas las mejoras del desktop viven en el **SHEET de detalle** (lo que abre al
  tocar una card) → portarlas no toca la experiencia TikTok; mejora lo de después del tap.

## Temas (decisión Lucho)
- **VENTAS = OSCURO** (negro/arena claro sobre negro). Mantiene la inmersión.
- **ALQUILERES = ARENA** (fondo claro). Diferencia visual entre los dos feeds.
- Desktop: el modal claro de ventas y el de alquileres (light) ya existen; el mobile es
  lo que falta llevar a ese nivel.

## Mockups aprobados (visualize — NO se persisten como archivo; regenerar por esta spec)
Títulos: `mobile_ventas_sheet_ampliado_oscuro`, `mobile_ventas_feed_card`,
`mobile_ventas_filtros`, `mobile_alquileres_sheet`, `mobile_alquileres_feed_card`,
`mobile_alquileres_filtros` + enfocados `ventas_mercado_total_y_m2`,
`alquileres_mercado_con_m2`.

---

## SPEC POR SUPERFICIE

### A) Sheet de detalle
**Orden de secciones (igual al modal desktop real, verificado con Playwright):**
header → chips → **Lo que la hace especial** (chispita) → **Todas las comodidades**
(sub-secciones *En el edificio* / *En el departamento*, grilla 2-col con iconos canónicos;
la **chispita** marca la cola larga) → **Sobre esta propiedad** (+ Ver más) → **Ubicación**
(mapa + "Ver ubicación en Google Maps") → **Cómo está el precio** → *(SOLO alquiler:*
**Costo real mensual** *+* **Ingreso sugerido***)* → **Similares** (scroll horizontal) →
**Preguntas** (checkboxes) → **Ver el anuncio original** → sticky.

**Header:** nombre del edificio en **BLANCO puro** (ancla; ventas oscuro) / negro (alquiler
arena). "Reciente" = **texto verde plano** (NO píldora con fondo). Subtítulo `zona · #id ·
Hace N días`. Precio con **barra salvia** a la izquierda; per-m² debajo. **Foto = single +
swipe + contador** (decisión UX: NO grilla 1+4 — en mobile empuja el precio/specs abajo del
pliegue; la grilla es afordancia de desktop). Nav de anclas: Resumen · Mercado ·
*[Costos, solo alquiler]* · Similares.

**Stats:** iconos (dorm / m² / baños / piso) — reemplaza el grid de tiles viejo.

**Chips de inclusión:** ventas = Equipado/Parqueo/Baulera · alquiler = Amoblado/Parqueo/
Pet friendly (+ Expensas incluidas cuando aplica).

**Cómo está el precio:** verdicto (check + "En línea/Más barato/Más caro con similares") +
medidor (más accesible ↔ más premium) + **comparación con TOTAL + por m²** (task #8: cada
fila muestra total grande + $/m² o Bs/m² chico) + caveat ("Comparamos el precio total y por
m²… el /m² permite comparar aunque cambie el tamaño") + fila **días · estado** (estado:
ventas = Entrega inmediata / Preventa·fecha ámbar; **alquiler = amoblado**, ej. "Amoblado" /
"Sin amoblar").

**Costo real mensual (SOLO alquiler):** Alquiler + Expensas (*aparte* → `+ Bs X/mes`;
*incluidas* → "Incluidas") = **Costo mensual estimado** (fila resaltada) · Depósito de
entrada `Bs X (N meses)`. Regla fiduciaria: el costo solo sube si el aviso confirma expensas
aparte; `incluidas`=no sube; `null`≠aparte. Ver `project_expensas_fiduciario`.

**Ingreso sugerido (SOLO alquiler):** `≈ 3× el costo mensual` — ingreso recomendado para
alquilar cómodo (que el costo no pase ~1/3 de ingresos). Es una GUÍA, no un requisito del aviso.

**Preguntas = CHECKBOXES** que se suman al mensaje de WhatsApp (el botón verde muestra
"N preguntas"; solo "WhatsApp" si 0 tildadas). Ventas = "Preguntas para el vendedor";
alquiler = "Preguntas para el broker".

**Ver el anuncio original** = link/sección aparte → abre un **MODAL de captura de datos del
usuario** (a definir en otra sesión). NO decir "se desbloquea al contactar por WhatsApp".

**Barra sticky COMPACTA (~44px):** `[ícono WhatsApp + "N preguntas"]` (verde, flex) ·
`[Comparar]` con texto · `[Compartir]` **ícono universal de nodos** (no "↗"). El ícono de
WhatsApp reemplaza la palabra para ahorrar ancho.

**NO mostrar** la línea "Captado/Publicado por [agente]" (task #7).

### B) Card del feed (TikTok — cambio mínimo)
Mantiene TODO lo de hoy: foto full-screen + swipe + contador, corazón EN la foto, barra fija
abajo (Ver mapa · Guardá para comparar · contador N/total), "Nueva" sobre la foto.
**Cambios:** (1) specs con **iconos** (dorm/m²/baño/piso). (2) chips de inclusión (ventas:
Equipado/Parqueo/Baulera · alquiler: Amoblado/Parqueo/Pet friendly). (3) **chip fiduciario
"vs. similares"** en su **propia fila** — texto EXACTO del desktop: "Más barato / En línea /
Más caro que similares", **SIN** "· N comparables", con iconito de barras. (4) estado inline
con el $/m² (ventas: Entrega inmediata / Preventa·fecha ámbar; alquiler: sin preventa).
**Regla:** estado y chip fiduciario NUNCA comparten fila (el fiduciario va solo). Foto ~55%
para que entre todo sin perder inmersión.

### C) Filtros (sheet)
**Header:** número de resultados **grande, blanco, centrado** (reemplaza "Filtros") + **✕ a
la derecha** + **logo/bolita de Simon a la izquierda** (placeholder; isologo real TBD, pero
el logo SÍ debe estar). **Búsqueda inteligente arriba** con placeholder que se **escribe
solo** (typewriter, ejemplos reales) — "o afiná con los filtros".
**Secciones:** Edificio (buscar por nombre) · **Presupuesto** (histograma de distribución
tipo Zillow — barras, parte salvia = rango; MIN/MAX en **número completo**, no "K"; **TC del
día de Binance**, no 6.96) · Zona · Dormitorios · *[Entrega, SOLO ventas]* · **Comodidades**
(amenidades de edificio, con aclaración fiduciaria "filtramos por lo que el anuncio
confirma…") · **Atributos del departamento** (ventas: Amoblado/Equipado/Parqueo/Baulera;
alquiler: **+ Mascotas**) · Ordenar.
**Sticky:** `Limpiar filtros` (izq) + `Ver resultados` (salvia, primario) — sin repetir el
número (ya está arriba). El navy de Zillow → **salvia de marca**.

---

## TAREAS REGISTRADAS (transversales / desktop) — pendientes de implementar
- **#3** Desktop: histograma en el filtro de precio (ventas + alquileres).
- **#4** Desktop: MIN/MAX en número completo, no "K" (ventas + alquileres).
- **#5** Desktop: TC del filtro = TC del día (Binance), no hardcoded 6.96 (ventas + alquileres).
- **#6** Ventas mobile sheet: paridad con alquileres (preguntas checkbox + ver anuncio
  original + sticky compacto + ícono compartir universal).
- **#7** Desktop: quitar "Captado/Publicado por [agente]" del sheet (ventas + alquileres).
- **#8** Sheet: comparador de "Cómo está el precio" muestra **total + por m²** en ambos
  feeds, mobile **y desktop**.

(Además, dos cosas quedan **pendientes de definir**: el **isologo real** y el **modal de
captura** del "ver anuncio original".)

---

## COMPONENTES A REUSAR (bajan el riesgo técnico)
- **`BottomSheet`** (compartido; prop `sideMode` = desktop). El sheet mobile = el mismo
  componente sin `sideMode`. Casi todas las secciones ya existen ahí (por eso el sheet es
  "adaptar", no "inventar").
- **`lib/amenity-icons.tsx`** — iconos canónicos + `hasCanonicalIcon` (split "En el edificio"
  vs "especial"). Ya cubre las 16 amenidades del config.
- **`config/amenidades-mercado.ts`** — `AMENIDADES_FILTRABLES` (fuente única del pill
  Comodidades). Ya conectado en desktop (ver [[project_frontend_desktop_feeds]]).
- **`PhotoViewer`**, **`VentaMap`/`AlquilerMapMulti`**, **`lib/busqueda-natural.ts`**
  (parser $0 sin IA para la búsqueda inteligente), **`CompareSheet`**.

## DÓNDE VIVE EL CÓDIGO
- **Ventas:** `pages/ventas.tsx` — CSS styled-jsx inline. Mobile = clases `mc-*`/`mfh-*`/`mt-*`.
- **Alquileres:** `pages/alquileres.tsx` + `styles/alquileres.css`. Mobile = `amc-*`/`mfh-*`/`mt-*`.
- **Sheet:** `BottomSheet` compartido (mobile = rama sin `sideMode`). El sheet mobile HOY es
  la versión vieja oscura (grid de tiles, chips planos) — ese es el grueso del trabajo.
- ⚠️ **Gemelos con CSS distinto** (ventas styled-jsx / alquileres CSS externo) → cada pieza
  se toca **2 veces**. Extraer piezas compartidas ahorraría tiempo (FeedDesktopNav ya es el patrón).

## ORDEN DE IMPLEMENTACIÓN SUGERIDO
1. **Sheet mobile** (el cambio grande, reusa componentes). Empezar por UN feed (¿ventas?),
   validar, luego el otro.
2. **Card del feed** (chip fiduciario + iconos en specs + chips) — cambio chico.
3. **Filtros** (Comodidades/Atributos + búsqueda inteligente + histograma + sticky).
4. **Cross-cutting desktop** (#3–#8) al final del lote, cuando el patrón esté probado en mobile.

## VERIFICACIÓN
Playwright headless (el preview MCP no hidrata bien): **mobile 390px** (`isMobile:true`) +
**desktop 1440px**. Dev server del worktree (esta sesión corrió en `:3010`). Borrar los `.mjs`
después. NUNCA `npm run build` con el dev corriendo.

## RELACIONADO
- [[project_frontend_desktop_feeds]] (rediseño desktop, fuente de las mejoras a portar).
- Tarea A/B ya hechas: filtros alineados + fuente única de amenidades (`config/amenidades-mercado`).
- `docs/design/FEED_MODAL_CLARO_CHECKPOINT.md` (modal claro desktop — la base del sheet).
