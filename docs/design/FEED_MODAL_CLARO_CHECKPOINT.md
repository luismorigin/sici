# Feed + Modal claro — Checkpoint (act. 14 Jul 2026)

> Handoff de la rama `claude/session-context-e0ffd1` (worktree). Resume TODO lo
> hecho para retomar en una sesión nueva. **Rama local, sin push** (esperar OK
> del founder). ~24 commits.

## Cómo correr / verificar
- **Dev server del worktree:** corre en **:3007** (el `:3000` es de OTRO worktree).
  `PORT=3007 npm run dev -- -p 3007` desde `simon-mvp/`.
- **Preview con data del híbrido:** `?shadow=1` en la URL:
  - `http://localhost:3007/ventas?shadow=1`
  - `http://localhost:3007/alquileres?shadow=1`
  El flag lee los **RPC shadow** (reader híbrido, split de amenidades poblado +
  TC nuevo). **Sin el flag = prod** (data vieja). ⚠️ El flag SE PIERDE al navegar
  (el logo/links vuelven a `/…` sin él) — reagregarlo.
  - Chequeo rápido de que estás en shadow: venta id 818 (Klug) = **$93.084** (no $140.805).
- **Verificación desktop:** Playwright headless (el preview MCP no hidrata desktop).
  Scripts `.mjs` en `simon-mvp/`, viewport 1440, borrarlos después. NUNCA
  `npm run build` con el dev corriendo.

## VENTAS — modal claro FASE 2b (hecho, base de la sesión)
Modal de detalle desktop = modal claro centrado estilo Zillow (`.bs-venta.bs-side`):
header en `headerBlock` (const, mobile antes de fotos / desktop en `bsm-main`),
nav de anclas, grilla de fotos 1+4 + `PhotoViewer`, 2 columnas con tarjeta WhatsApp
sticky (`bsm-body/main/aside`, `display:contents` en mobile). Comodidades modelo
"What's special" (`lib/amenity-icons.tsx`, `hasCanonicalIcon`; split del pipeline
vía RPC `buscar_extras`, mig 276 aplicada). Mercado v2 (lenguaje llano + medidor).
Fiduciario "vs. similares". Card `VentaListCard` rediseñada (precio héroe, un-color-
un-significado, contraste 4.5:1, "Nueva"). Filtro Comodidades + "Buscar edificio".
CompareSheet crema. Mapa hover-to-locate (anillo salvia). **+ esta sesión:**
`piso` agregado a los stats grandes del modal (a74f595).

## ALQUILERES — ESPEJO COMPLETO (esta sesión) ✅
Todo scopeado a desktop (`sideMode`/`splitDesktop`); **mobile intacto** (verificado
a 390px en cada pieza; `display:contents` en los wrappers).

1. **Fix mapa "Ver detalles"** (dcb007e) — mismo bug que ventas: el `BottomSheet
   sideMode` vivía dentro del gate `viewMode==='grid'`; se sacó fuera del gate.
2. **Comodidades "What's special"** (0ab42d3, luego reemplazado por el split del
   pipeline shadow, ver abajo).
3. **Card + fiduciario "vs. similares"** (19d569a) + fix badge "Nuevo" (6e426ba).
4. **Filtro de comodidades** (fb49990) — client-side sobre `amenities_lista`; solo
   diferenciadores de edificio (Amoblado/Parqueo/Mascotas ya son server-side).
5. **Modal claro** (f57fc82 · 3919db0 · 4473c7d · 297edc3): centrado ~900px + nav
   de anclas + header claro + scroll único; grilla de fotos 1+4 + `PhotoViewer`;
   Mercado v2 en Bs; 2 columnas + tarjeta WhatsApp sticky (footer movido al aside).
6. **Mapa hover-to-locate** (e3bb36f) — `AlquilerMapMulti` gana `highlightRef` + anillo.
7. **Botón Comparar + label "Mono"** (0fc177a) — `dormLabel(0)`: "Estudio"→"Mono"
   (unifica TODO; toca ventas también). Botón Comparar en la tarjeta.
8. **Línea Bs/m²** bajo el precio (36c53bb) — clase `bs-hr-permetro`.
9. **Alineación con ventas** (0ecc067): características = 3-4 STATS GRANDES limpios
   (no grilla de tiles) + fila de CHIPS de inclusión; se oculta la línea de specs
   de texto; orden botones WhatsApp·Comparar·Compartir; badge "Reciente".
10. **Chips amoblado/equipado** (e929f0b): amoblado si/semi/no + "Equipado" como
    chips; amoblado sale de la sub-línea del precio.
11. **Expensas incluidas** (b1fb245 + 7e4dead): chip + fila Costos. **Fiduciario:**
    solo el positivo cuando `expensas_incluidas===true`; el costo mensual estimado
    NUNCA sube por suposición — solo suma expensas si el aviso confirma explícito
    que van aparte (`false`); `null`≠aparte. Ver [[project_expensas_fiduciario]].
12. **`pet_friendly` (2fb173e) + `piso` en cards + filtro Pet Friendly** (9c4879b,
    58c53d6): el chip de mascotas pasa de `acepta_mascotas` (unidad, inflado) a
    **`pet_friendly`** (política del edificio, derivada en el cron); `piso` en los
    specs de las cards de ambos feeds; filtro "Pet Friendly" en el pill Comodidades
    (ventas+alquileres). **`pet_friendly` NO es más limpio** — hereda la inflación
    del reader y la esparce por el OR a nivel edificio (68/161 vs 31 acepta). Se
    auto-limpia cuando se arregle el reader + corran los crons.

### Cableado del feed a la SHADOW (d8d1815) — clave. **Contrato: `scripts/deptos-equipetrol/CONTRATO_FRONTEND_SHADOW.md`** (del worktree `hybrid-worktree-structure-3b7b53`, migs 274-280) = fuente de verdad de qué devuelve cada RPC shadow campo por campo.
`/alquileres?shadow=1` lee el **RPC `buscar_unidades_alquiler_shadow`** vía
`/api/alquileres` (server, service_role — el flag va en el body). `/ventas?shadow=1`
= `buscar_unidades_simple_shadow` vía `/api/ventas` (**el fetch cliente mapea con
`mapRow`, NO el mapper de getStaticProps** — agregar campos nuevos ahí). Columnas
NUEVAS del RPC shadow: `amenities_extra` (cola larga / "lo que la hace especial"),
`equipamiento_otros`, `equipado`, `uso_inmueble`, `expensas_incluidas`,
**`pet_friendly`** (chip del edificio; "Pet Friendly" ya sale de `amenities_lista`).
Mapeadas en `UnidadAlquiler`/`UnidadVenta`. El modal usa el split del PIPELINE
(fallback client-side en prod). **Los RPC de PROD siguen con el bug
`equipamiento_lista=null` / sin pet_friendly** — solo el shadow los trae bien.

## TC — MARCO NUEVO (aprendido esta sesión, CRÍTICO)
El shadow usa un marco de TC NUEVO (`precio_normalizado_shadow_v2`):
- **Paralelo = el nuevo oficial** (el real). Si el aviso dice "oficial" → nuevo
  oficial. SOLO si dice explícito **6.96 / TC 7** → `oficial_viejo`.
- `oficial_viejo` → se convierte a USD real: `precio × 6.96 / tc_paralelo` (baja).
- paralelo / oficial-nuevo / no_especificado → USD real DIRECTO (no toca).
- Ej: Santorini "$53.000 (TC 7)" → muestra **$35.239** (correcto). Klug id 818
  en shadow = $93.084 (en prod = $140.805 con la normalización vieja).
- El label `(T.C. oficial)` del front es **correcto** en el marco nuevo (paralelo
  = el nuevo oficial), no hay que tocarlo. Ver [[project_tc_marco_nuevo_shadow]].

## Calidad de datos alquiler
- ✅ **Mascotas — revisado y OK (Lucho, 14-jul).** `acepta_mascotas` quedó validado;
  ya no es pendiente. El filtro de mascotas se consolidó en `acepta_mascotas`
  (server-side, alquiler); `pet_friendly` queda solo como chip de card. Ver
  [[project_bug_acepta_mascotas_llm]].

## Pendiente
- 🔴 **Cutover shadow→prod** (decisión founder): hoy la data limpia solo se ve con
  `?shadow=1`. Para prod: o parchar los RPC de prod, o apuntar el front a shadow.
- ✅ **Alinear filtros ventas↔alquileres — HECHO (14-jul, verificado Playwright 1440px).**
  Ambos feeds ahora tienen la misma estructura: **Comodidades** = solo amenidades
  diferenciadoras de EDIFICIO (Piscina · Churrasquera · Gimnasio · Co-working ·
  Salón · Sauna); **Más filtros** = ATRIBUTOS de la unidad. Ventas: `AMEN_ATRIBUTOS`
  = Amoblado · Equipado · Parqueo · Baulera (sin Mascotas — venta no tiene
  `acepta_mascotas` y no es criterio de compra); pill "Más filtros" nuevo, se sacó
  la sección "DEL DEPARTAMENTO" y "Pet Friendly" de Comodidades. Alquileres:
  `AMEN_ALQ_ATRIBUTOS` = Equipado · Baulera (client-side, vía `amenSel`) sumados a
  Amoblado/Parqueo/Mascotas (server) en "Más filtros"; "Pet Friendly" fuera de
  Comodidades. Los badges cuentan por separado (`comodCount` vs `atribCount`+server).
  Objetivo original — **misma estructura en los dos feeds**:
  - **"Más filtros"** = ATRIBUTOS de la propiedad: Amoblado · Equipado · Parqueo ·
    Baulera · **Mascotas** (`acepta_mascotas`, decisión de Lucho: consolidar a
    este, NO `pet_friendly`, NO dos).
  - **"Comodidades"** = SOLO amenidades del edificio: Piscina · Churrasquera ·
    Gimnasio · Co-working · Salón · Sauna. **Pet Friendly y Equipado NO son
    comodidades** → van a Más filtros.
  - Estado actual a corregir: (a) alquileres tiene "Pet Friendly" en Comodidades
    (commit 58c53d6) — sacarlo; agregar Equipado a Más filtros. (b) VENTAS **no
    tiene pill "Más filtros"** (se eliminó) y su Comodidades tiene sección "DEL
    DEPARTAMENTO" (Equipado/Parqueo/Baulera) — hay que **crear el pill Más filtros**
    en ventas y mover ahí esos + dejar Comodidades solo con amenidades.
  - Ojo mezcla server/client: en alquiler amoblado/mascotas/parqueo son server
    (RPC `FiltrosAlquiler`); equipado/pet_friendly son client (`amenSel`). El chip
    de display sigue usando `pet_friendly` (edificio); el FILTRO de mascotas usa
    `acepta_mascotas`.
- ✅ **Categorización de amenidades ESTÁNDAR — HECHO (14-jul).** Fuente de verdad
  única = **`config/amenidades-mercado.ts`** (frontend). Se agregó el flag
  `filtrable` y se reorganizó en 3 tiers documentados (FILTRABLE / ESTÁNDAR /
  DIFERENCIADOR NO FILTRABLE). Exports derivados: `AMENIDADES_FILTRABLES` (lista
  del pill, ordenada) y `AMENIDADES_ESTANDAR`. Los feeds ahora **derivan**
  `AMEN_DIFERENCIADORES` / `AMEN_ALQ_DIFERENCIADORES` de `AMENIDADES_FILTRABLES`
  (antes hardcodeado y duplicado = drift). Las estándar → nunca filtrables. El
  split display "En el edificio" vs "especial" ya era robusto: el modal re-rutea
  los ítems canónicos de la cola a "En el edificio" vía `hasCanonicalIcon`
  (`lib/amenity-icons.tsx`), cuyo catálogo cubre las 16 amenidades del config → una
  estándar nunca cae en "especial" aunque el reader la mande a la cola. Contrato con
  el pipeline documentado en el header del config: el vocabulario canónico del
  READER_SPEC debe ser superconjunto de estas claves. Verificado Playwright 1440px.
  **Pendiente reader-side (otro worktree):** alinear READER_SPEC a este archivo.
- Cablear `uso_inmueble` como filtro (no exclusión) cuando se escale a casas/mixto.
- Pasada de contraste global al feed oscuro (fuera de la card).
- Review del founder + commit/push (~31 commits locales).

## Archivos tocados (esta sesión)
- `simon-mvp/src/pages/alquileres.tsx` (grande) · `pages/ventas.tsx` ·
  `pages/api/alquileres.ts` · `pages/api/ventas.ts` · `lib/supabase.ts` ·
  `lib/format-utils.ts` · `components/alquiler/AlquilerMapMulti.tsx` ·
  `styles/alquileres.css`
- Memoria: `project_frontend_desktop_feeds`, `project_tc_marco_nuevo_shadow`,
  `project_bug_acepta_mascotas_llm`, `project_expensas_fiduciario`.
