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
No se guardó HTML aparte (evitar duplicar ~400 líneas). Es **idéntico al de alquileres** salvo:
- **Tema oscuro** (paleta abajo) en vez de arena.
- Moneda **$us** (precio total + $us/m²), no Bs/mes.
- Estado = **preventa/entrega inmediata** (preventa con fecha, ámbar), no amoblado.
- **SIN** las secciones "Costo real mensual" ni "Ingreso sugerido" (son solo de alquiler).
- Nav de anclas: Resumen · Mercado · Similares (sin "Costos").
- Nombre del edificio en **blanco puro** (ancla); "Reciente" texto verde.

**Paleta oscura (ventas):** fondo sheet `#141210`, cards `#1d1a15`, texto `#ECE6D8`, nombre/precio
`#FFFFFF`, muted `#B8AD9E`, hint `#7A7060`, líneas `#2c2822`, salvia `#7BB389`, salvia-bg
`rgba(58,106,72,.16)`. (Para derivar el HTML de ventas: tomar este archivo, swap de esos colores.)

## Mockups YA IMPLEMENTADOS (referencia = código vivo, no hace falta HTML)
- **Cards del feed** (P1, `b8dccf4`): specs con iconos + chip fiduciario. Ver `/ventas`, `/alquileres` en mobile.
- **Filtros** (P2, `166c761`): Comodidades + Atributos + header "N resultados" + Limpiar/Ver + números completos.
- **Comparador mercado total+m²** (P3a, `2aa6f1a`): ya en el sheet mobile de ambos feeds.

## Pendiente de mockup→código
- **P3b**: el re-theme del sheet (usar `mobile-alquileres-sheet.html` como target).
- **Desktop**: histograma en el filtro (#3), TC dinámico (#5), comparador total+m² en desktop (#8).
- **TBD sin resolver**: isologo real de Simon; "modal de captura" del ver-anuncio-original
  (hoy es el lead-gate `bs-gate` inline).

## Cómo ver el target de P3b sin mockup
El **modal claro de DESKTOP ya existe y funciona** — es la referencia de estructura. Abrir con
Playwright: `/ventas?shadow=1` o `/alquileres?shadow=1` a ancho ≥1200px, click en una card →
side sheet (`.bs-side` / `.bs-side-alq`). P3b = ese modal, pero en mobile (oscuro ventas / arena alquileres).
