# Feed + Modal claro — Checkpoint (12 Jul 2026)

> Handoff de la rama `claude/session-context-e0ffd1` (worktree). El contexto de
> la sesión creció mucho; esto resume TODO lo hecho para retomar en una sesión
> nueva. Rama local, **sin push** (esperar OK del founder).

## Cómo correr / verificar
- **Dev server del worktree:** `PORT=3007 npm run dev -- -p 3007` desde `simon-mvp/`.
  ⚠️ El `:3000` es de OTRO worktree — este va en **:3007**.
- **Preview con data limpia:** `http://localhost:3007/ventas?shadow=1`
  (toggle `?shadow=1` lee el feed shadow del reader híbrido, con el split
  canónico/extra ya poblado; default sin el flag lee prod).
- **Verificación desktop:** Playwright headless (el preview MCP no hidrata el
  layout desktop). Scripts `.mjs` dentro de `simon-mvp/`, viewport 1440, borrarlos
  después. NUNCA `npm run build` con el dev corriendo.
- Migración `sql/migrations/276_buscar_extras_prod.sql` **YA aplicada** en prod.

## Qué se hizo (todo desktop, scopeado; mobile intacto salvo donde se indica)

### 1. Modal de detalle desktop → TEMA CLARO (`ventas.tsx`, `.bs-venta.bs-side`)
- Header extraído a `headerBlock` (const) → mobile lo renderiza antes de las
  fotos; desktop lo mete DENTRO de `bsm-main` para que la tarjeta WhatsApp del
  aside quede arriba integrada al precio. Stats con iconos; título 28px.
- Nav = Resumen · Mercado · Similares. Reorden por flex `order` en `bsm-main`.
- Reredundancias fuera (Características/Badges/Datos de compra plegado en Mercado).
- **1 foto** = `bsm-photo-solo` (contain sobre fondo borroso, no recorta); grid
  adaptado 1-4 fotos.
- **Inclusiones header**: chips incluidos (Equipado/N parqueo/Baulera iconos
  20px) + línea "Opcional: X +$us Y" (`parqueo_precio_adicional`/`baulera_precio_adicional`).
  **Baulera usa `p.baulera`** (la columna), NO `baulera_incluido` (que el reader
  deja en 0).
- Ver anuncio original ABIERTO (sin gate). WhatsApp salvia + Comparar + Compartir.

### 2. Comodidades — modelo "What's special"
- `lib/amenity-icons.tsx` (NUEVO, compartido): 31 iconos SVG de línea + chispita
  fallback + `hasCanonicalIcon`. Vocabulario real = `config/amenidades-mercado.ts`
  (amenidades) + READER_SPEC (equipamiento).
- Modal: **"Lo que la hace especial"** = `amenidades_extra` NO reconocidas (los
  estándar Terraza/Ascensor se reruteal a "En el edificio" vía `hasCanonicalIcon`,
  con alias terraza/sauna/roperos…). `equipamiento_otros` → departamento con chispita.
- Split lo hace el PIPELINE (READER_SPEC), no el cliente. Data vía **`buscar_extras`**
  (RPC nuevo, mirror de `buscar_extras_shadow`) mergeado en getStaticProps + `/api/ventas`
  (graceful). Campos nuevos en `UnidadVenta`: `amenidades_extra`, `equipamiento_otros`.

### 3. Mercado v2 (modal) — claro y para usuario común
- Veredicto llano + medidor accesible→premium + comparación por m² + nota.
- Sin "mediana", sin mezclar total con /m². "N días · publicado".

### 4. FIDUCIARIO — reframe "rango típico" → "vs. similares" (parejo)
- Card: "Más barato / En línea / Más caro **que similares**".
- Modal Mercado v2: "Más barato que deptos similares"; "Típico en la zona"→"Deptos similares".
- Motivo: "rango típico" es jerga; "similares" lo entiende cualquiera.

### 5. CARD lista (`VentaListCard`) rediseñada
- Jerarquía: **precio héroe** → specs con iconos → inclusiones muteadas
  (equipado/parqueo/baulera) → **nombre BLANCO** + zona + #id chiquito → estado
  (Preventa destacada ámbar / Inmediata muteada) + chip fiduciario · **"Nueva"**
  sobre foto si `dias_en_mercado ≤ 60`.
- Lecciones founder: **un color = un significado** (specs a gris, sacado ámbar,
  "más caro"=neutro); **piso de contraste ~4.5:1** (los grises arena estaban
  ilegibles); nombre blanco como 2º anchor.

### 6. Filtro de COMODIDADES (feed desktop, client-side)
- Filtro **DURO + aclaración** fiduciaria (se descartó el patrón de 2 grupos
  confirmados/no-listados = overengineering). Solo diferenciadores bien-listados:
  Piscina 71% · Churrasquera 69% · Gimnasio 46% · Co-working 33% · Salón 31% ·
  Sauna 29%. Sacados por dato: Pet Friendly 1.6% (subreportado), Jardín 0%,
  Estac.Visitas/Parque Infantil (raros), Balcón 8% (subreportado).
- Pill **"Comodidades"** (2 secciones: Del edificio + Del departamento).
- **"Buscar edificio"** = pill propio destacado (diferenciador Simon). "Más filtros" eliminado.
- `propMatchesAmen` client-side; `cardChips` ahora computa siempre (sin gate splitDesktop).

### 7. Comparativo Express (`components/venta/CompareSheet.tsx`, CREMA — NO tocar a oscuro)
- Título "Comparativo Express" → **"Comparar favoritos"**.
- Fila **"vs. similares"** (posición fiduciaria; prop `chips` = `cardChips` de la página).
- Filas **"Incluye"** (equipado/parqueo/baulera campos correctos) + **"Amenidades"**.
- "Días publicado"→"Publicado". INSIGHTS→"Lo que dicen los datos" + insight fiduciario.

### 8. Mapa — hover-to-locate + `VentaMap`
- Hover en una card (split desktop) → `hoveredId` → mapa del panel muestra un
  **anillo salvia en el punto exacto** (por encima de clusters) + pan suave SOLO
  si está fuera de vista. Sin rebuild.
- Pin clásico de gota para el mapa de 1 propiedad (modal), centrado tras `invalidateSize`.
- **"Ver detalles" de la mini-card del mapa completo abre el mismo modal Zillow**
  (13-jul). Antes el `BottomSheet sideMode` se renderizaba DENTRO del bloque
  `splitDesktop && viewMode === 'grid'` → en mapa completo (`viewMode === 'map'`)
  ese bloque se desmonta y el clic no mostraba nada. Fix: el modal se renderiza
  fuera del gate de `viewMode` (junto al `!splitDesktop`), gateado solo por
  `splitDesktop && sheetOpen && sheetProperty`. Es `position:fixed`, el lugar en
  el DOM no importa. Abre igual desde lista, mixto y mapa completo. Verificado
  con Playwright (1440, `?shadow=1`).

## Pendiente (para la próxima sesión)
- 🔴 **Espejo en `/alquileres`**: replicar TODO el patrón (modal + comodidades +
  mercado v2 + card + filtros + comparativo), reusando `lib/amenity-icons.tsx`.
  Distinto: tema/tab Costos, `AlquilerMapMulti`, precios `precio_mensual_bob` (Bs).
- Menor: card dice "Mono" vs comparativo "Estudio" (`dormLabel`) — alinear.
- Pasada de contraste global al feed oscuro (fuera de la card).
- Todo depende del **cutover shadow→prod** para verse con data limpia en prod
  (hoy `?shadow=1`).
- Review del founder + commit/push.

## Archivos tocados
- `simon-mvp/src/pages/ventas.tsx` (grande) · `src/components/venta/CompareSheet.tsx`
  · `src/components/venta/VentaMap.tsx` · `src/lib/supabase.ts` · `src/pages/api/ventas.ts`
- NUEVOS: `src/lib/amenity-icons.tsx` · `sql/migrations/276_buscar_extras_prod.sql`
- Memoria: `project_frontend_desktop_feeds` (bloque FASE 2b).
