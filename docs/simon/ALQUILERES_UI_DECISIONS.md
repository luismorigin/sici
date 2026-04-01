# Alquileres — Decisiones UI (Brand v1.4)

> Migración completada: 25 Mar 2026 | Branch: `feat/alquileres-brand-v14`
> Referencia de diseño: `simon-brand/docs/simon-decisions.md` sección 14

## 1. Decisiones visuales

### Colores

| Elemento | Color | Justificación |
|----------|-------|---------------|
| WhatsApp CTA | `#1EA952` | Más oscuro que el estándar `#25d366` — menos chillón contra arena, mantiene reconocimiento |
| Corazón favorito activo | `#E05555` (rojo) | Única excepción de color fuera de la paleta Simon. Patrón UI universal (Airbnb, Instagram) |
| Corazón favorito inactivo | `#7A7060` outline (piedra) | Sutil, no compite con el contenido |
| Filtros activos (normal) | Borde salvia `#3A6A48` 2px + texto negro `#141414` | Texto negro y no salvia porque salvia <18px falla WCAG sobre arena |
| Filtro Mascotas activo | Fondo salvia `#3A6A48` + texto arena `#EDE8DC` | Diferenciado de filtros normales — es filtro "especial" |
| Filtro Amoblado activo | Fondo negro `#141414` + texto arena `#EDE8DC` | Se distingue del salvia — segundo nivel de filtro especial |
| Badge "Nuevo" | Fondo salvia + texto arena | Máximo protagonismo entre badges |
| Badge "Mascotas" | Fondo salvia + texto arena | Consistente con filtro mascotas |
| Badge "Amoblado" | Fondo negro + texto arena | Consistente con filtro amoblado |
| Badge "Mascotas: consultar" | Borde tinta + texto tinta | Señal de atención sin gritar |

### Componentes

| Elemento | Estilo | Notas |
|----------|--------|-------|
| Cards de propiedad (mobile) | Fondo arena `#EDE8DC` | La foto ocupa la parte superior, el contenido va sobre arena |
| Cards de propiedad (desktop) | Fondo blanco `#FAFAF8` + borde arena-mid + r14 + hover lift | `translateY(-4px)` + `box-shadow: 0 12px 32px rgba(58,53,48,0.08)` |
| Cards de características (bottom sheet) | Fondo blanco `#FAFAF8` + borde arena-mid + r14 + sombra | `box-shadow: 0 2px 8px rgba(58,53,48,0.06)` |
| Pills amenidades | Fondo blanco `#FAFAF8` + borde arena-mid | Se levantan del fondo arena |
| Pills filtro (inactivos) | Fondo blanco `#FAFAF8` + borde arena-mid | Elementos tocables se diferencian del fondo |
| Bottom sheet header | Fondo negro `#141414` + `border-radius: 20px 20px 14px 14px` | Transición suave negro→arena |
| Bottom sheet body | Fondo arena `#EDE8DC` | Consistente con el fondo general |
| Slider thumb | Blanco `#FAFAF8` + borde negro 2px, 18px | No sólido — más sutil y cálido |
| Botón mapa (mobile) | Fondo blanco + borde arena-mid + sombra | Ícono de mapa (pliegues), no ícono de ubicación (pin) |
| Compare banner (mobile) | `position: fixed; top` (debajo del top bar) | No tapa WhatsApp CTA en la zona inferior |
| Compare bar (desktop) | Sticky en barra de resultados | Siempre visible al scrollear |
| Gradiente foto→contenido | `linear-gradient(transparent, #EDE8DC)` 24px | Mínimo, no tapa la foto |
| Top bar mobile | Pill frosted glass arena + backdrop-filter blur | Símbolo Norte + Simon + label |
| Ubicación en bottom sheet | Link a Google Maps (no mapa embebido Leaflet) | Más ligero, UX más clara |

### Íconos

| Contexto | Ícono | Estilo |
|----------|-------|--------|
| Características bottom sheet | SVG línea (Lucide-style) | `stroke: #7A7060`, 20px — área, cama, baño, edificio, auto, caja, sofá, pata, monedas, casa, archivo |
| Mapa (botón + toggle) | Mapa con pliegues | No pin de ubicación |
| Ver mas (mobile actions) | Chevron down (▾) | Pill con fondo `rgba(216,208,188,0.45)`, color `#4A4438` |
| Ver anuncio / Google Maps | External link (cuadrado + flecha) | Indica que sale de Simon |
| Labels de sección | Punto salvia 6px | Antes de CARACTERISTICAS, AMENIDADES, MICROZONA, etc. |

## 2. Excepciones a la paleta Simon

Solo dos colores fuera de `arena/negro/salvia/tinta/piedra/arena-mid/blanco`:

| Color | Uso | Justificación |
|-------|-----|---------------|
| `#E05555` (rojo) | Corazón favorito activo | Patrón UI universal. El rojo es el único color que comunica "guardado" sin aprendizaje |
| `#1EA952` (verde oscuro) | Botón WhatsApp | Verde es identidad de WhatsApp. Bajado del estándar `#25d366` para menor contraste con arena |

Ningún otro color fuera de la paleta debería aparecer en `/alquileres`.

## 3. Tamaños de texto (mobile)

| Elemento | Font | Peso | Tamaño | Extras |
|----------|------|------|--------|--------|
| Nombre propiedad | Figtree | 500 | 22px | — |
| Precio | DM Sans | 500 | 28px | `font-variant-numeric: tabular-nums` |
| Labels sección | DM Sans | 600 | 12px | `uppercase`, `letter-spacing: 0.5px`, punto salvia antes |
| Body / specs | DM Sans | 300 | 15px | — |
| Zona / metadata | DM Sans | 400 | 12px | `letter-spacing: 0.5px` |
| Badges | DM Sans | 500 | 12px | `border-radius: 100px` |
| Botones | DM Sans | 500 | 15px | `border-radius: 10px`, `min-height: 44px` |
| IDs (#123) | DM Sans | 400 | 12px | Color piedra `#7A7060` |

**Piso absoluto: 12px.** Ningún texto visible por debajo de 12px en toda la página.

## 4. Patrones reutilizables (para /ventas y /mercado)

Estos patrones se validaron en `/alquileres` y deberían replicarse al migrar otras páginas:

### Header negro + body arena en sheets/modals
```
Header: background #141414, border-radius inferior 14px
Textos: Figtree 22px arena, DM Sans 28px arena (precio), DM Sans 13px dark-label
Body: background #EDE8DC
```

### Punto salvia antes de labels
```html
<span style="width:6px;height:6px;border-radius:50%;background:#3A6A48" />
LABEL TEXT
```
Usado en: labels de sección (bottom sheet, filtros), datos del mercado.

### Cards blanco sobre arena
```
background: #FAFAF8
border: 1px solid #D8D0BC
border-radius: 14px
box-shadow: 0 2px 8px rgba(58,53,48,0.06)
```
Usado en: cards de características, cards de propiedad (desktop), insights comparativo.

### Pills blanco con borde
```
background: #FAFAF8
border: 1px solid #D8D0BC
border-radius: 100px
```
Usado en: amenidades, filtros inactivos, badges neutros.

### Filtros activos — 3 niveles
```
Normal:     borde salvia 2px + texto negro + sombra salvia sutil
Especial 1: fondo salvia + texto arena (mascotas)
Especial 2: fondo negro + texto arena (amoblado)
```

### Mapa
```
Tiles: filter brightness(1.05) saturate(0.4) sepia(0.15) — cálido, no dark
Pins: fondo blanco/negro, borde arena-mid, DM Sans 12px tabular-nums
Tooltips: fondo blanco, borde arena-mid, border-radius 14px
Zoom: fondo blanco, texto negro, borde arena-mid
```
