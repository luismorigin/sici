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
- ✅ **P3b (HECHO — rama `claude/session-context-e0ffd1`, sin push)** — re-theme visual del sheet
  mobile. Solución: se introdujo `richLayout = sideMode || (!isDesktop && !brokerMode && !publicShareMode)`
  y una clase marcadora `bs-rich` (`richLayout && !sideMode`) en la raíz del sheet. Las secciones
  ricas se gatearon `richLayout` (antes `sideMode`), las viejas `!richLayout` (antes `!sideMode`).
  **Ventas (oscuro)**: bloque de overrides scopeado a `.bs-venta.bs-rich` (~40 reglas) re-tematiza
  stats/inclusiones/especial/comodidades/mercado-v2 sobre `#1a1a1a`; el pin del medidor pasó a
  `fill=currentColor` (era `#141414` invisible en oscuro). **Alquileres (arena)**: el body mobile YA
  es arena (`.bs-section{background:#EDE8DC}`) y el CSS rico es global con colores claros → encajó
  **casi sin override** (solo ocultar specs de texto duplicados + Reciente plano). Además: sticky
  compacto (Comparar cableado al mobile via `onCompare`, label WhatsApp dinámico "N preguntas").
  Verificado con Playwright 390px (header blanco/arena, stats iconos, comodidades, mercado v2 con
  pin, costos/ingreso alquiler, preguntas, sticky). **Desvíos conscientes**: (1) el nav de anclas
  superior (`bsm-nav`) NO se llevó a mobile — se conservan los botones flotantes cerrar/fav; (2) el
  header de alquileres mobile queda OSCURO (diseño ya shippeado: header oscuro + body arena) en vez
  del arena del mockup — bajo riesgo, coherente con lo vivo.
- ✅ **Transversales CERRADAS** (misma rama, sin push):
  - **#8 comparador total + por m²** (`32367c5`) — el sheet rico mostraba solo /m² (ventas) o solo
    /mes (alquileres); ahora cada fila lleva total + por m². `marketData` calcula el rango de la
    otra dimensión (ventas: percentiles de `precio_usd`; alquiler: Bs/m²).
  - **Orden de secciones** (`32367c5`) — Ubicación caía al final en ventas mobile; se replicó el
    `order:` del modal desktop en `.bs-rich` (bsm-main pasa de `display:contents` a flex column).
  - **Mapa en alquileres** (`79f8de6`) — no existía (ni mobile ni desktop), solo el link a Google
    Maps. Se agregó `AlquilerMap` gateado `richLayout`.
  - **#5 TC del día** (`4f35698`) — la nota del filtro decía "TC Bs 6.96" (oficial muerto); ahora
    sale el paralelo vivo vía `/api/tc-actual` (hook cacheado `useTcParalelo` + `TcNote`).
  - **Logo en el filtro** (`5875aae`) y **buscador typewriter** (`2db9f82`, escribe el placeholder
    por ref → sin re-renders del feed).
  - **#3 histograma** (`cef62cb` mobile + `8c31e2b` desktop) — `components/feed/PriceHistogram.tsx`
    (estilos inline → sirve oscuro y arena). `priceValues` sale de las props cargadas.
  - **Mínimo en alquileres** (`569bef2` mobile + `8c31e2b` desktop) — deuda vieja: el filtro público
    era solo-MÁXIMO aunque el RPC y `FiltrosAlquiler` YA soportaban `precio_mensual_min`. Ahora es
    rango min–max. El sidebar `DesktopFilters` es solo-broker y no se tocó.
  - **Fixes de sheet mobile** (`4d31ee8`) — foto antes del header en ventas; sticky flush (la causa
    era `padding-bottom:72px` en `.bs-venta.bs`: el sticky se pega al *content box*); header de
    alquileres de negro a arena; fotos 4/3→16/9 + `max-height:32vh` para que entren en un SE.
- 🟡 Pendiente/opcional: nav de anclas superior en mobile (se conservan los flotantes cerrar/fav);
  isologo real (el logo del filtro es placeholder); refinar el lead-gate del "ver anuncio original".
- ⚠️ **Bug de preview shadow corregido aparte** (`9232c0f`): el feed sirve data PROD por SSG/ISR (el
  build no conoce `?shadow=1`) y el refetch shadow estaba **diferido a idle** → el preview mostraba
  precios prod (ej. #3580 Maré: $275k prod vs $180k shadow). Ahora con `?shadow=1` el fetch shadow
  es inmediato. **Prod sigue con el precio inflado hasta el cutover** (es data, no frontend).

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

## 🗺️ MAPA DEL CÓDIGO PARA P3b (del análisis de agentes — guardado para no re-mapear)
- **El sheet NO es un componente compartido**: hay dos `function BottomSheet` inline —
  ventas `pages/ventas.tsx` (~L1417, prop `isOpen`, raíz `bs bs-venta … bs-side`) y alquileres
  `pages/alquileres.tsx` (~L3850, prop `open`, raíz `bs … bs-side-alq`). (Line numbers ~ aprox,
  corridos por los commits P1-P3a.)
- **`sideMode` NO es mobile-vs-desktop**: `sideMode` = side sheet / modal claro DESKTOP-split.
  Mobile = siempre `sideMode=false`. La variable página que decide split es `splitDesktop`.
  El sheet recibe `isDesktop` (lo usa en la clase raíz: `sideMode ? 'bs-side' : (isDesktop ? 'bs-desktop' : '')`).
- **Para traer las ricas a mobile SIN tocar broker/publicShare-desktop-no-split** (que usan la rama
  `!sideMode` con `isDesktop=true` → clase `bs-desktop`): gatear **viejas** `{!sideMode && isDesktop && …}`
  y **ricas** `{(sideMode || !isDesktop) && …}`. Así real-mobile (`isDesktop=false`) recibe las ricas y no las viejas.
- **Secciones VIEJAS mobile a reemplazar**: Características = tiles `bs-grid`/`bs-feat`; Amenidades =
  chips planos `bs-aw`/`bs-at` (ventas 2 bloques Edificio/Departamento; alquileres 1 bloque); Mercado =
  `bs-mktv` (ventas) / `bs-mkta` (alquileres).
- **Secciones RICAS gateadas `sideMode`** (existen, hay que des-gatear+tematizar): stats `bsm-stats`(v)/`bsm-stats-alq`(a)
  + inclusiones `bsm-incl`/`bsm-incl-chips`; split amenidades `bsm-comod-*`/`bsm-especial`(v) · `bs-comod-*`/`bs-especial`(a)
  con `hasCanonicalIcon`; mercado v2 `bs-mkt2-*` (verdict/gauge/compare/note); **Costos `bs-costos-*` + Ingreso sugerido (SOLO alquiler)**.
- **CSS a re-tematizar**: hoy scopeado a `.bs-venta.bs-side` (ventas.tsx styled-jsx) y `.bs-side-alq`
  (alquileres.css) con colores CLAROS hardcodeados (`.bsm-especial-pill{background:#FFF;color:#141414}`,
  `.bsm-comod-item{color:#141414}`, `.bs-mkt2-track::before{background:#E7E1D3}`). Mobile ventas raíz =
  `.bs.bs-venta` (sin bs-side/bs-desktop) → escribir overrides oscuros con selector `.bs-venta:not(.bs-side):not(.bs-desktop) …`.
  Alquileres mobile raíz = `.bs` (sin bs-side-alq) → arena, reusa más el estilo claro (menos overrides).
- **Preguntas YA son checkboxes** que se suman al WhatsApp (`bs-q-item` toggle, ambos feeds). **"Ver anuncio original"**
  YA existe con lead-gate `bs-gate` (el "modal de captura" del mockup = ese gate, queda TBD refinarlo).

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
