# Simon Brand Tokens — Plan de Implementación

> Creado: 24 Mar 2026 | Branch: `feat/simon-tokens` | Estado: **en branch, pendiente merge**

## Contexto

El brandbook Simon v1.3 define una nueva paleta (arena/negro/salvia) y tipografía (Figtree/DM Sans/DM Mono) que reemplaza el sistema anterior (negro premium #0a0a0a / crema #f8f6f3 / oro #c9a959 + Cormorant/Manrope).

Source of truth de la marca: repo `simon-brand` (github.com/luismorigin/simon-brand)

## Qué se hizo (branch feat/simon-tokens)

| Archivo | Cambio | Riesgo |
|---------|--------|--------|
| `src/lib/simon-design-tokens.ts` | **Nuevo** — tokens completos (colores, tipografía, spacing, símbolo, motion, voz) | Ninguno — archivo nuevo |
| `tailwind.config.js` | **Extendido** — colores `s-*` y fonts `s-*` agregados | Ninguno — solo agrega, no modifica |
| `src/pages/_app.tsx` | **Modificado** — Figtree/DM Sans/DM Mono en rutas premium | Bajo — rutas premium ya no tenían fonts asignadas (className era `''`) |

Build verificado: compila sin errores.

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

## Estrategia de migración

**Principio: no romper nada existente.**

1. Componentes nuevos → usar tokens `s-*`
2. Componentes existentes → migrar solo cuando se tocan por otra razón
3. No migrar todo de una — demasiado riesgo con colores hardcodeados dispersos

## Relación con archivos existentes

| Archivo existente | Estado | Acción futura |
|-------------------|--------|---------------|
| `src/styles/premium-theme.ts` | Sistema viejo (#0a0a0a etc.) | Eliminar cuando todos los componentes migren |
| `tailwind.config.js` colores viejos | brand/state/premium/lens/simon/condado | No tocar — coexisten con s-* |
| `docs/simon/SIMON_BRAND_GUIDELINES.md` | Paleta vieja (#0a0a0a) | Actualizar cuando se haga merge |
| `globals.css` | CSS vars viejas | Migrar gradualmente |
