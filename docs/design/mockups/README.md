# Mockups de referencia — Rediseño mobile

Guías visuales aprobadas (15 Jul 2026). Abrir los `.html` en el navegador.
Spec completa + estado de implementación: `../MOBILE_REDESIGN_CHECKPOINT.md`.

## Archivos

### `mobile-alquileres-sheet.html` — 🎯 REFERENCIA PRINCIPAL PARA P3b
El sheet de detalle mobile completo, en **arena**. Es el target visual del re-theme del
sheet (P3b). Contiene todo el orden y contenido reales: header (nombre + Reciente + zona·#id·días,
precio con barra salvia + Bs/m²) → stats con iconos → chips (Amoblado/Parqueo/Pet friendly) →
Lo que la hace especial → Todas las comodidades (En el edificio / En el departamento, iconos +
chispita) → Sobre esta propiedad → Ubicación → **Cómo está el precio** (verdicto + medidor +
comparador **total + por m²** + caveat + días·estado) → **Costo real mensual** (expensas aparte →
total) → **Ingreso sugerido** → Similares (scroll) → **Preguntas (checkboxes)** → **Ver anuncio
original** → sticky compacto ([WhatsApp + "N preguntas"] · Comparar · Compartir universal).

### El sheet de VENTAS = misma estructura en OSCURO
No se guardó HTML aparte a propósito: la versión de ventas que se mockeó era ANTERIOR a los
refinamientos finales (checkboxes, ver-original, sticky compacto) que se decidieron iterando el
de alquileres — guardarla mostraría cosas viejas. La referencia correcta de ESTRUCTURA es el
`mobile-alquileres-sheet.html`; la de CONTENIDO ventas-específico es el **modal claro desktop de
ventas ya vivo** (`/ventas?shadow=1`, ≥1200px, click card → `.bs-side`). **P3b re-tematiza código
existente**, no reconstruye: todo lo de ventas ya está renderizado hoy en ese modal desktop.

**Diferencias de VENTAS vs. el sheet de alquileres (COMPLETO):**
- **Tema oscuro** (paleta abajo) en vez de arena.
- Moneda **$us**: precio total + `$us N/m²` (no Bs/mes ni Bs/m²).
- **Nombre del edificio en blanco puro** (`#FFFFFF`, ancla); "Reciente" texto verde plano.
- Estado (en la fila días·estado de Mercado) = **preventa / entrega inmediata**; la preventa
  muestra su **fecha de entrega en ámbar** (no "amoblado/sin amoblar" como alquiler).
- **SIN** secciones "Costo real mensual" ni "Ingreso sugerido" (son exclusivas de alquiler).
- Nav de anclas: **Resumen · Mercado · Similares** (sin la pestaña "Costos").
- Chips de inclusión: **Equipado / Parqueo / Baulera** (no Amoblado/Mascotas/Pet friendly).
- Preguntas = **"Preguntas para el vendedor"** (no "broker"); su set incluye preguntas propias de
  ventas (preventa, plan de pagos, TC) — ya en el código (`brokerQuestions` de ventas.tsx).
- Puede mostrar **badges de venta** (preventa destacada, negociable, plan de pagos, -% contado,
  parqueo/baulera incluida, TC paralelo) y "**Opcional: parqueo +$us / baulera +$us**" — ya en código.
- Comparador de mercado (`bs-mkt2`/`bs-mktv`): por **$us/m²** + total; caveat "comparamos por m²".

**Paleta oscura (ventas):** fondo sheet `#141210`, cards `#1d1a15`, texto `#ECE6D8`, nombre/precio
`#FFFFFF`, muted `#B8AD9E`, hint `#7A7060`, líneas `#2c2822`, salvia `#7BB389`, salvia-bg
`rgba(58,106,72,.16)`, ámbar (preventa) `#E7B24A`.

## Mockups YA IMPLEMENTADOS (referencia = código vivo, no hace falta HTML)
- **Cards del feed** (P1, `b8dccf4`): specs con iconos + chip fiduciario. Ver `/ventas`, `/alquileres` en mobile.
- **Filtros** (P2, `166c761`): Comodidades + Atributos + header "N resultados" + Limpiar/Ver + números completos.
- **Comparador mercado total+m²** (P3a, `2aa6f1a`): ya en el sheet mobile de ambos feeds.

## Mockup→código — ✅ TODO IMPLEMENTADO
- **P3b** ✅: re-theme del sheet mobile (oscuro ventas / arena alquileres) — `3027867` + transversales.
- **Desktop** ✅: histograma en el filtro (#3, `8c31e2b`), TC dinámico (#5, `4f35698`), comparador total+m² desktop (#8, `32367c5`).
- **TBD sin resolver** (definición, no implementación): isologo real de Simon; "modal de captura"
  del ver-anuncio-original (hoy es el lead-gate `bs-gate` inline).

## Cómo ver el target de P3b sin mockup
El **modal claro de DESKTOP ya existe y funciona** — es la referencia de estructura. Abrir con
Playwright: `/ventas?shadow=1` o `/alquileres?shadow=1` a ancho ≥1200px, click en una card →
side sheet (`.bs-side` / `.bs-side-alq`). P3b = ese modal, pero en mobile (oscuro ventas / arena alquileres).
