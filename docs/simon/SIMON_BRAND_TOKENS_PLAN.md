# Simon Brand Tokens — Plan de Implementación

> Creado: 24 Mar 2026 | Estado: **landing migrada en branch, pendiente aprobación visual**

## Contexto

El brandbook Simon v1.3 define una nueva paleta (arena/negro/salvia) y tipografía (Figtree/DM Sans/DM Mono) que reemplaza el sistema anterior (negro premium #0a0a0a / crema #f8f6f3 / oro #c9a959 + Cormorant/Manrope).

Source of truth de la marca: repo `simon-brand` (github.com/luismorigin/simon-brand)
Decisiones detalladas: `simon-brand/docs/simon-decisions.md`

## Qué se hizo

### Fase 1: Tokens (mergeado a main — `48fd79d`)

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `src/lib/simon-design-tokens.ts` | **Nuevo** — tokens completos (colores, tipografía, spacing, símbolo, motion, voz) | Ninguno — archivo nuevo |
| `tailwind.config.js` | **Extendido** — colores `s-*` y fonts `s-*` agregados | Ninguno — solo agrega, no modifica |
| `src/pages/_app.tsx` | **Modificado** — Figtree/DM Sans/DM Mono en rutas premium | Bajo — rutas premium ya no tenían fonts asignadas |

### Fase 2: Migración landing (branch `feat/simon-landing-migration`)

| Archivo | Cambio |
|---------|--------|
| `landing-v2.tsx` | Removido Cormorant/Manrope, usa `font-s-body` (fonts vienen de `_app.tsx`) |
| `NavbarPremium.tsx` | `bg-s-negro`, `text-s-dark-*`, `font-s-display/body`, hover `bg-s-salvia` |
| `HeroPremium.tsx` | **Fondo arena** (era negro), `font-s-display/mono/body`, líneas salvia |
| `ProblemPremium.tsx` | `bg-s-blanco` (diferencia sutil vs arena), `text-s-tinta` para itálica |
| `StepsPremium.tsx` | **Fondo arena con cards blanco** (era negro), bordes arena-mid, hover salvia |
| `MarketLensPremium.tsx` | `bg-s-arena`, stats box `bg-s-negro rounded-2xl`, cards `bg-s-blanco`, `font-s-mono` para datos |
| `CTAPremium.tsx` | `bg-s-negro` (cierre dramático), botón arena→salvia hover |
| `FooterPremium.tsx` | `bg-s-negro`, `text-s-dark-*` |
| `landing-data.ts` | **Nuevo campo `zonasAlquiler`** — mediana/avg Bs por zona desde `v_mercado_alquiler` |
| `supabase.ts` | **Nueva función `obtenerZonasAlquiler()`** + tipo `ZonaAlquilerData` |

### Decisiones de diseño (landing)

- **Proporción 70/25/5**: arena dominante (hero, problem, steps, market lens), negro como acento (navbar, CTA, footer, stats box), salvia solo en líneas decorativas y dots
- **Fondo negro descartado como base**: el brandbook lo decidió — difícil en PDFs, Instagram, presentaciones
- **Oro/dorado eliminado**: reemplazado por salvia (elementos gráficos) y tinta (texto de acento)
- **Salvia nunca como texto**: solo como líneas, puntos, bordes, hover de botones (WCAG)
- **Precios en `font-s-mono`**: DM Mono para todos los datos numéricos

## Clases Tailwind disponibles

### Colores (prefijo s-)
```
bg-s-arena      text-s-arena      border-s-arena       (#EDE8DC)
bg-s-negro      text-s-negro      border-s-negro       (#141414)
bg-s-salvia     text-s-salvia     border-s-salvia      (#3A6A48)
bg-s-tinta      text-s-tinta                           (#3A3530)
bg-s-piedra     text-s-piedra                          (#7A7060)
bg-s-arena-mid  text-s-arena-mid  border-s-arena-mid   (#D8D0BC)
bg-s-blanco     text-s-blanco                          (#FAFAF8)
bg-s-dark-1     text-s-dark-1     (texto sobre negro — 15:1 AAA)
bg-s-dark-2     text-s-dark-2     (texto sobre negro — 9.3:1 AAA)
bg-s-dark-3     text-s-dark-3     (labels sobre negro — 5.7:1 AA)
```

### Fonts
```
font-s-display   → Figtree (títulos, datos grandes, peso 500)
font-s-body      → DM Sans (cuerpo, UI, peso 300/400)
font-s-mono      → DM Mono (precios, métricas, peso 300/400)
```

### Reglas críticas
- Salvia NUNCA como texto (falla WCAG). Solo como elemento gráfico.
- Datos numéricos siempre en negro o dark-1, nunca en salvia.
- Min 12px en cualquier texto. Botones min-height 44px.

## Datos disponibles en landing (fetchLandingData)

| Campo | Tipo | Fuente |
|-------|------|--------|
| `heroMetrics` | `{ propertyCount, projectCount, avgPriceM2 }` | propiedades_v2 + proyectos_master |
| `snapshot` | `Snapshot24h` (TC, nuevos, retirados, etc.) | auditoria_snapshots + tc_binance |
| `microzonas` | Venta por zona: total, precio_m2, proyectos, categoria | propiedades_v2 agregado en JS |
| `zonasAlquiler` | **NUEVO** — Alquiler por zona: total, mediana_bob, avg_bob | v_mercado_alquiler agregado en JS |

### Variación trimestral por zona — NO IMPLEMENTAR AÚN

`market_absorption_snapshots` por zona tiene **1 solo día** de historia (24 Mar 2026). El global tiene 41 días (desde 12 Feb). No hay suficiente data para calcular variación trimestral confiable. Implementar cuando haya ≥30 días por zona (~24 Abr 2026).

## Tareas pendientes

| # | Tarea | Estado | Notas |
|---|-------|--------|-------|
| 1 | ~~Tokens a main~~ | HECHO | `48fd79d` |
| 2 | ~~Migrar landing a brand v1.3~~ | HECHO | Branch `feat/simon-landing-migration` — pendiente aprobación visual |
| 3 | Aprobar look en localhost | **SIGUIENTE** | `npm run dev` → ver `/` y `/landing-v2` |
| 4 | Merge landing → main | PENDIENTE | Solo después de aprobar |
| 5 | Actualizar `SIMON_BRAND_GUIDELINES.md` | PENDIENTE | Solo después de aprobar look nuevo |
| 6 | Migrar resto de páginas gradualmente | PENDIENTE | Componente por componente |
| 7 | Eliminar `premium-theme.ts` | PENDIENTE | Solo cuando no queden imports |
| 8 | Limpiar hex hardcodeados en JSX | PENDIENTE | `bg-[#0a0a0a]` → `bg-s-negro`, etc. |
| 9 | Variación trimestral por zona | BLOQUEADO | Necesita ≥30 días de snapshots por zona (~24 Abr) |

## Relación con archivos existentes

| Archivo existente | Estado | Acción futura |
|-------------------|--------|---------------|
| `src/styles/premium-theme.ts` | Sistema viejo (#0a0a0a etc.) | Eliminar cuando todos los componentes migren (tarea 7) |
| `tailwind.config.js` colores viejos | brand/state/premium/lens/simon/condado | No tocar — coexisten con s-* |
| `docs/simon/SIMON_BRAND_GUIDELINES.md` | Paleta vieja (#0a0a0a) | Actualizar después de aprobar look nuevo (tarea 5) |
| `globals.css` | CSS vars viejas | Migrar gradualmente |
