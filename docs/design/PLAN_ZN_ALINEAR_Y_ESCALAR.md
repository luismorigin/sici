# Zona Norte: alinear el feed con Equipetrol y dejar base para escalar

**Plan acordado el 18-ago-2026.** Escrito antes de tocar código, con la disciplina del proyecto:
goal en una frase · línea de base medida · evals con criterio de aborto.

## Goal

**Que `/zona-norte/ventas` se vea y funcione igual que el feed de Equipetrol, y que agregar la
próxima macrozona de departamentos (Urubó, Las Palmas, Zona Este) sea declarar sus zonas y una página
delgada — no copiar 6.000 líneas.**

Con una restricción que no se negocia: **cada macrozona muestra solo lo suyo.** Ninguna filtra
propiedades de la otra.

### Qué NO entra
- **El bot.** No se toca. Sus 3 RPC hardcodean `zona_general='Equipetrol'` y extenderlo a ZN es
  trabajo aparte, ya identificado.
- **Alquileres.** Primero ventas. Alquileres viene después **sobre la misma base**, mucho más barato.
- **Lanzar ZN** (sacar `noindex` + sitemap). Decisión aparte, cuando el founder quiera.
- **Migrar Equipetrol a los componentes nuevos.** Ver "el camino elegido".

## 🔴 El camino elegido: NO se toca `ventas.tsx`

Había dos formas de compartir el diseño:

| | Toca Equipetrol | Riesgo sobre lo que factura |
|---|---|---|
| Extraer y que ambos usen lo mismo | **Sí** | **Real, en cada paso** |
| **Copiar a componentes que solo usa ZN** ← **elegido** | **No** | **Cero** |

Las piezas nuevas se crean **a partir del código de `ventas.tsx`**, pero solo las usan ZN y las
macrozonas futuras. **`ventas.tsx` no se modifica ni una línea.**

**El costo, declarado:** por un tiempo hay dos implementaciones del mismo diseño — la de Equipetrol
(inline, como hoy) y la compartida. Es deuda reversible y sin urgencia.
**Lo que se gana:** cuando se migre Equipetrol, las piezas ya van a llevar semanas probadas en ZN.
Es mucho mejor momento que ahora, con campaña corriendo.

## El estado de partida (medido el 18-ago)

- `/ventas` **6.037** líneas · `/zona-norte/ventas` **3.605** · ZN no tiene **ninguna** de las piezas
  del rediseño (`splitDesktop`, pills, list card, side sheet, nav, rail: 0 menciones).
- Las piezas están **inline en `ventas.tsx`**, no son componentes. `components/venta/` solo tiene
  `VentaMap` y `CompareSheet`.
- Tamaños: `BottomSheet` **905** · `FilterPillsVentas` **197** · `VentaCard` **230** ·
  `VentaListCard` **105** · `MapRailCard` **31**. Total ~**1.470**.
- `FeedDesktopNav` **ya es compartido** — ZN puede usarlo sin extraer nada.
- Los dos usan **el mismo sistema de estilos** (styled-jsx), así que la copia es mecánica.

## Fase 0 — El verificador (antes de tocar nada)

Un script Playwright (`simon-mvp/scripts/eval-feeds-zonas.mjs`) que mide **los dos feeds** y deja la
foto de hoy. Playwright y no el navegador interno: `docs/design/VERIFICAR_FEEDS_DESKTOP.md` explica
que el preview MCP **no hidrata el layout desktop** — se queda en mobile. Ignorar eso costó tiempo el
18-ago.

**Qué mide, por feed:**
1. cuántas propiedades muestra
2. **de qué macrozona son** (0 de la otra) ← el eval que habría atajado el incidente del 18-ago
3. si el layout desktop se arma (columnas, pills, panel)
4. errores en consola

**Eval de la fase:** el script corre y reporta el estado actual sin fallar.

## Fases 1-N — Las piezas, de a una

Cada fase: **copiar la pieza a un componente parametrizado por macrozona → usarla en ZN → correr el
verificador**.

| Fase | Pieza | Por qué en ese orden |
|---|---|---|
| **1** | `VentaListCard` (105) + `FeedDesktopNav` (ya existe) | la más visible y la más chica; valida el enfoque con poco expuesto |
| **2** | `FilterPillsVentas` (197) | los filtros; toca estado pero no layout |
| **3** | El layout partido + toggle lista/mixto/mapa | reordena la página; es el cambio estructural |
| **4** | `BottomSheet` en modo lateral (905) | el más grande, y el que más depende de lo anterior |
| **5** | `MapRailCard` (31) + revisar mobile | cierre |

**Eval de cada fase (idéntico, y es el criterio de aborto):**
- ZN sigue mostrando **305** propiedades, **todas de Zona Norte, 0 de Equipetrol**
- `/ventas` **idéntico**: 351, 0 de ZN — y como no se toca su archivo, cualquier cambio ahí es un
  fallo grave
- `tsc` 0 errores · `build` exit 0 · sin errores nuevos en consola
- La pieza se ve en ZN como en Equipetrol

🔴 **Si algo de eso falla, se revierte esa fase sola.** Cada fase es un commit.

## La base para escalar

`lib/macrozonas.ts` — un solo lugar que declara cada macrozona: sus zonas de BD, título, rutas,
etiquetas.

🔑 **Sin valor por defecto, y Equipetrol declarado como una macrozona más.** Hoy Equipetrol es "lo
normal" —está en la raíz de la URL y es el default del API— y **esa asimetría fue la causa del
incidente del 18-ago**: una llamada sin zonas devolvió Equipetrol en el feed de ZN, sin fallar.
Si falta la macrozona, tiene que **fallar ruidosamente**.

**Cómo se ve terminado:** agregar Urubó = declarar sus microzonas + una página delgada que pasa esa
config a los componentes.

## Visión, para no cerrarse puertas
Hoy la macrozona es **la puerta de entrada**. Con 4-5 zonas eso es fricción: el comprador piensa
"2 dorm hasta 150k", no "Zona Norte". El modelo probable a futuro es **un feed general** (donde el
mapa y el buscador natural acotan, piezas que **ya existen**) **+ landings por zona para SEO**.
🔑 Lo que sí hay que respetar siempre: **se puede unificar la navegación, nunca las métricas.** La
mediana de dos macrozonas mezcladas no significa nada.
Esta base sirve para los dos modelos, así que **no hay que decidirlo ahora**.
