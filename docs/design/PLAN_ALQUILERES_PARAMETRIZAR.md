# Alquileres: parametrizar el feed por macrozona

**Plan escrito el 18-ago-2026**, después de hacer lo mismo con ventas. Misma disciplina:
goal en una frase · línea de base medida · evals con criterio de aborto.
Antecedente y patrón: `PLAN_ZN_ALINEAR_Y_ESCALAR.md`.

## Goal

**Que `/zona-norte/alquileres` se vea y funcione igual que `/alquileres`, y que el feed de alquiler
de una macrozona nueva sea una página delgada.**

Restricción: **cada macrozona muestra solo lo suyo.** `/alquileres` (Equipetrol) no se puede mover.

### Qué NO entra
- **El bot** (sus RPC hardcodean `zona_general='Equipetrol'`) · **la página de mercado** ·
  **lanzar ZN**. Los tres siguen en `docs/backlog/MACROZONAS_PENDIENTES.md`.

## Estado medido (18-ago)

| | `/alquileres` | `/zona-norte/alquileres` |
|---|---:|---:|
| Líneas | **5.356** | **3.893** |
| `FilterPillsAlquiler` · `AlquilerListCard` · `MapRailCardAlq` | sí | **0** |
| `FeedDesktopNav` | sí | **0** |
| `.ad-cols` · `.afp-` · `.alc-` · `.bs-side-alq` · `.alq-rail` | sí | **0** |
| `.mfh-` (header mobile) · `.mt-bottombar` | sí | **0** |

Mismo cuadro que ventas antes de hoy: **Equipetrol con el rediseño, ZN sin nada.**

## 🟢 Por qué esto es MÁS fácil que ventas

**1. ZN alquileres ya está aislado.** `pages/zona-norte/alquileres.tsx:572` ya fuerza
`getMicrozonasZN()` cuando los filtros no traen zonas, y el SSG pide **200** con **107** disponibles.
👉 **No tiene los dos bugs que sí tenía ventas** (el default del API y el límite de 24), que fueron
lo que más costó.

**2. El CSS no hay que unificarlo.** `styles/alquileres.css` (1.439 líneas) **se importa en
`_app.tsx`: ya es global** y aplica a todo el sitio. Ventas lo *sobrescribe* con su tema oscuro en
styled-jsx (~4.200 líneas embebidas). No son dos sistemas paralelos: **alquileres es la base**.
Mover el código no toca el CSS.
⚠️ *Corrección de una advertencia previa: se había dicho que "usan sistemas distintos y hay que
unificarlos". Es inexacto.*

**3. `FeedDesktopNav` ya está parametrizado** (se hizo con ventas). El feed solo tiene que pasarle su
macrozona — `/alquileres` ya lo hace con `EQUIPETROL` explícito.

## 🔴 La lista de chequeo: los 5 pozos conocidos

Los cinco mordieron en ventas el 18-ago. Acá son verificación, no descubrimiento:

1. **El default del API.** `/api/alquileres` (o el que use) devuelve Equipetrol si no se pasan
   `zonas_permitidas`. **Forzarlas en el punto único de salida**, no en cada llamador.
   *En ZN alquileres ya está — verificar que el componente compartido lo conserve.*
2. **Las zonas del filtro** (`zonasCanonicas`), o el feed ofrece zonas de otra macrozona.
3. **Los ejemplos del buscador**: chips + placeholder animado.
4. **Las rutas**: entre feeds, a mercado (ocultar si `rutaMercado` es `null`), y el nav.
5. **El mensaje de WhatsApp** del broker ("Trabajo en X").

## ➕ Lo propio de alquileres (superficie extra a verificar)
Precios en **bolivianos** (no USD) · filtros de **amoblado** y **mascotas** · el mini estudio de
mercado con sus métricas · el modal de captura de WhatsApp. Nada cambia el enfoque, pero hay que
mirarlo.

## Fase 0 — Extender el eval

`scripts/eval-feeds-zonas.mjs` ya mide los dos feeds de venta. Agregarle `/alquileres` y
`/zona-norte/alquileres` con sus selectores (`.ad-cols`, `.alc`, `.afp`) y **guardar la línea de base
de los cuatro**.

**Eval de la fase:** corre y reporta los 4 sin fallar.

## Fase 1 — El movimiento

El cuerpo de `alquileres.tsx` → `components/feed/FeedAlquileres.tsx`, parametrizado por macrozona.
`/alquileres` y `/zona-norte/alquileres` quedan como páginas delgadas con su Head y su
`getStaticProps`.

**Eval — y criterio de aborto:**
- `/alquileres` **idéntico** a la línea de base (propiedades y piezas)
- `/ventas` y `/zona-norte/ventas` **idénticos** — 🔑 esta vez hay 4 feeds: un cambio puede llegar a
  todos, así que se miden todos
- `/zona-norte/alquileres`: sus ~107, **0 de Equipetrol**, y **ahora con las piezas**
- `tsc` 0 · `build` exit 0 · sin errores nuevos de consola
- Se verifica **en local antes de desplegar**, y después **contra producción** con
  `EVAL_BASE=https://simonbo.com`

🔴 Si cualquier feed de Equipetrol se mueve, se revierte. Es un commit.

## Fase 2 — El barrido de lo que varía

No esperar a que el eval lo marque: **recorrer el eje completo** (los 5 pozos + lo propio de
alquileres) y verificar con `grep` que no queden menciones de Equipetrol hardcodeadas en el
componente.
🔑 En ventas esto se hizo tarde y reactivo — el founder tuvo que señalar el filtro de zonas y los
enlaces del nav. **Acá va como paso explícito.**

## Cómo se sabe que salió bien
Agregar el feed de alquiler de Urubó = declararlo en `lib/macrozonas.ts` + una página delgada.
Y `/alquileres` sin moverse ni una propiedad.
