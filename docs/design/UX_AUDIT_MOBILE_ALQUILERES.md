# Auditoría UX/UI Mobile — /alquileres

> Fecha: 1 abril 2026
> Fuentes: GA4 (31 mar), revisión de código (`alquileres.tsx`, `PhotoViewer.tsx`), inspección visual desktop
> Autor: Auditoría automatizada desde simon-mkt

---

## Contexto

Datos de GA4 del 31 marzo 2026 (5 usuarios, 11 sesiones):

| Métrica | Valor | Señal |
|---------|-------|-------|
| `view_property` | 10 | Ven cards |
| `apply_filters` | 20 | Filtran activamente (~4x por usuario) |
| `open_detail` | 1 | **Solo 1 de 10 abre detalles (10%)** |
| `click_whatsapp` | 0 | **Ningún contacto** |
| `bounce_no_action` | 5 | 45% de sesiones sin acción útil |
| `no_results` | 3 | 60% de usuarios se topó con filtro vacío |

El embudo está roto entre **ver propiedad → abrir detalle → WhatsApp**.

---

## Flujo actual mobile

```
FEED VERTICAL (100dvh por card, scroll-snap = TikTok)
│
├── ZONA FOTOS (55% alto) ─── PhotoCarousel
│   ├── Swipe horizontal → pasa fotos (scroll-snap CSS nativo)
│   ├── Dots indicadores (max 8, 6px)
│   ├── Counter "1/7" (pill abajo derecha)
│   └── Hint "Desliza para mas fotos" (solo card 1, fade 3s)
│
├── ZONA INFO (45% alto) ─── mc-content
│   ├── Nombre → Zona → Precio (28px) → Specs → Badges (max 4)
│   ├── Descripción (italic, 2 líneas)
│   ├── ─── border-top ───
│   ├── Acciones: [❤️ Fav] [⬆️ Share] [ⓘ Detalles]
│   └── [███ Consultar por WhatsApp ███]
│
├── TAP en foto → PhotoViewer (fullscreen)
│   ├── Controles auto-hide 3s (PhotoViewer.tsx:48)
│   ├── Mobile: SIN flechas (display:none <768px, línea 172-184)
│   ├── Solo swipe horizontal + tap para toggle controles
│   └── Escape o X (invisible por defecto) para cerrar
│
├── TAP "Detalles" → BottomSheet (80vh, sube desde abajo)
│   ├── Header negro: nombre, precio, zona, días
│   ├── WhatsApp CTA
│   ├── Grid características (3 cols)
│   ├── Amenidades, Google Maps, Ver anuncio original (con gate)
│   └── **NO incluye fotos**
│
└── Scroll vertical → siguiente propiedad
```

---

## Hallazgos priorizados

### #1 — BottomSheet sin fotos (ALTA prioridad, esfuerzo MEDIO)

**Archivo:** `src/pages/alquileres.tsx`, líneas 2243-2422 (componente `BottomSheet`)

**Problema:** El BottomSheet muestra nombre, precio, características, mapa y WhatsApp, pero NO incluye galería de fotos. El usuario tiene que elegir: o swipea fotos en la card, o abre detalles. Nunca los dos juntos.

**Impacto:** Experiencia fragmentada. El usuario que abre detalles pierde las fotos. El que mira fotos no tiene la info completa.

**Fix sugerido:** Agregar galería horizontal scrollable (reutilizando `PhotoCarousel` o un componente similar) en el top del BottomSheet, entre el header negro y la sección de características. Las fotos ya están disponibles en `property.fotos_urls`.

---

### #2 — Tap en foto abre visor redundante en mobile (ALTA, esfuerzo BAJO)

**Archivo:** `src/pages/alquileres.tsx`, línea 2061 (`onClick` en `PhotoCarousel`)
**Archivo:** `src/components/alquiler/PhotoViewer.tsx` (componente completo)

**Problema:** En mobile, el usuario ya puede swipear fotos dentro de la card (scroll-snap horizontal). Pero si hace tap en la foto, abre `PhotoViewer` fullscreen — que en mobile no tiene flechas (display:none bajo 768px, línea 172-184) y los controles se auto-ocultan en 3s. El visor mobile es redundante y confuso:
- El usuario pierde todo el contexto (precio, nombre, WhatsApp)
- Para cerrar tiene que hacer tap + encontrar la X (que puede estar oculta)
- Ya podía swipear fotos SIN abrir el visor

**Fix sugerido:** En mobile, `onPhotoTap` debería abrir el BottomSheet (con fotos, ver fix #1) en lugar del PhotoViewer. O desactivar `onPhotoTap` en mobile y dejar solo el swipe inline.

---

### #3 — Botón "Detalles" con bajo peso visual (MEDIA, esfuerzo BAJO)

**Archivo:** `src/pages/alquileres.tsx`, líneas 1950-1954 (mobile), línea 1835 (desktop)

**Problema:** El botón usa ícono ⓘ (círculo con i) + texto "Detalles" en 12px gris (`#7A7060`) sobre fondo beige (`#EDE8DC`). Bajo contraste. El ícono ⓘ es ambiguo — puede parecer "info de la app" en lugar de "más datos de este depto".

**Datos:** 10 `view_property` → 1 `open_detail` = 10% conversion. Debería ser 40-60%.

**Fix sugerido:** 
- Opción A: Cambiar texto a "Ver más ▾" con fondo sutil (`#D8D0BC`) o borde visible
- Opción B: Hacer toda la zona de info (nombre, precio, specs) tappeable para abrir el BottomSheet — tap en cualquier parte de `mc-content` abre detalles

---

### #4 — BottomSheet sin gesture dismiss (MEDIA, esfuerzo MEDIO)

**Archivo:** `src/pages/alquileres.tsx`, líneas 2379-2382 (CSS del BottomSheet)

**Problema:** El BottomSheet solo se cierra con el botón X (línea 2307). No hay swipe-down para cerrar. El handle (`.bs-handle`, 36x4px) es decorativo — `rgba(237,232,220,0.3)` sobre `#EDE8DC` es prácticamente invisible. En mobile, los usuarios esperan poder deslizar un bottom sheet hacia abajo para descartarlo.

**Fix sugerido:** Implementar touch gesture dismiss (touchstart/touchmove/touchend tracking delta Y) y subir la opacidad del handle a 0.5+. Referencia: patrón de iOS/Google Maps sheets.

---

### #5 — PhotoViewer desktop: controles invisibles por defecto (MEDIA, esfuerzo BAJO)

**Archivo:** `src/components/alquiler/PhotoViewer.tsx`, líneas 44-54

**Problema:** Los controles (X cerrar, counter, flechas, caption) se auto-ocultan después de 3 segundos. El usuario hace click en una foto, ve pantalla negra con la imagen, y no sabe que puede hacer click para ver los controles. Parece una trampa.

**Fix sugerido:** Mantener el botón X y el counter siempre visibles (solo ocultar flechas y caption con el timer). Cambiar línea 48: en vez de ocultar todo, ocultar solo elementos secundarios.

---

### #6 — Hint de swipe solo en card 1 (BAJA, esfuerzo BAJO)

**Archivo:** `src/pages/alquileres.tsx`, líneas 2091-2096

**Problema:** El overlay "Desliza para mas fotos" solo aparece en la primera card (`isFirst && total > 1`). Se desvanece en 3s. Si el usuario no lo vio, en las cards siguientes no hay indicación de swipe más allá de los dots.

**Fix sugerido:** Mostrar hint en las primeras 3 cards (`cardIndex < 3` en vez de `isFirst`). Los dots ya ayudan pero son pequeños (6px).

---

### #7 — Ícono de Share es iOS-style (BAJA, esfuerzo BAJO)

**Archivo:** `src/pages/alquileres.tsx`, líneas 1944-1948

**Problema:** El SVG (caja con flecha arriba) es el ícono de "share" de iOS. En Android, el ícono estándar de compartir son 3 puntos conectados con líneas. El `aria-label` dice "Compartir por WhatsApp" pero no es visible.

**Fix sugerido:** Agregar label visible "Compartir" debajo del ícono, o cambiar a un ícono más universal. Considerar que la audiencia en SCZ es mayoritariamente Android.

---

## Recomendación principal

El fix de mayor impacto con menor esfuerzo combinado es **#2 + #1 juntos**:

1. En mobile, tap en foto abre el BottomSheet (no el PhotoViewer)
2. El BottomSheet incluye galería de fotos arriba

Esto:
- Unifica fotos + datos + WhatsApp en un solo flujo
- Elimina el visor fullscreen redundante en mobile
- Le da al usuario todo lo que necesita para decidir sin alternar entre vistas
- Es patrón estándar (Airbnb, Idealista, MercadoLibre hacen exactamente esto)

El swipe horizontal en la card del feed se mantiene como preview rápido. El BottomSheet es la vista "completa".

---

## Validación contra código (1 abril 2026)

> Revisión línea por línea de `alquileres.tsx` y `PhotoViewer.tsx` para confirmar que los hallazgos son reales y las líneas correctas.

| # | Hallazgo | Veredicto | Líneas | Notas |
|---|----------|-----------|--------|-------|
| 1 | BottomSheet sin fotos | ✅ CONFIRMED | Exactas (2243-2422) | `fotos_urls` disponible en prop pero nunca referenciado en el componente |
| 2 | Tap foto abre visor redundante | ✅ CONFIRMED | Exactas (2061, 172-184) | `openViewer()` en línea 526 dispara fullscreen; flechas `display:none` bajo 768px |
| 3 | Botón Detalles bajo peso visual | ⚠️ PARCIAL | Exactas (1950-1954, 1835) | Mobile: confirmado (12px, #7A7060, sin borde). Desktop: tiene `border: 1px solid #D8D0BC` — la auditoría no distingue. **Fix debe focalizarse en mobile** |
| 4 | BottomSheet sin gesture dismiss | ✅ CONFIRMED | Exactas (2379-2382, 2307) | Handle `.bs-handle` a `rgba(237,232,220,0.3)` sobre `#EDE8DC` = prácticamente invisible |
| 5 | PhotoViewer controles invisibles | ⚠️ PARCIAL | Exactas (44-54) | Controles arrancan visibles 3s (`useState(true)` línea 13), no "invisibles por defecto". Fix más complejo: X está dentro de `.pv-top` junto al counter, hay que reestructurar el hide logic |
| 6 | Hint swipe solo en card 1 | ✅ CONFIRMED | Exactas (2091-2096) | `isFirst && total > 1` confirmado |
| 7 | Ícono Share iOS-style | ✅ CONFIRMED | Exactas (1944-1948) | SVG box-with-arrow-up confirmado |

**Resultado: 5/7 confirmados exactos, 2/7 parcialmente correctos** (matices en descripción de comportamiento, no en ubicación de código). Todas las líneas citadas son correctas. Todos los fixes son técnicamente viables.

---

## Plan de implementación

**Branch:** `fix/ux-mobile-alquileres`

### Fase 1 — Mayor impacto (combo #1 + #2)
1. Agregar galería de fotos horizontal al top del BottomSheet
2. En mobile, tap en foto abre BottomSheet en vez de PhotoViewer

### Fase 2 — Quick wins (#3, #5, #6, #7)
3. Mejorar peso visual del botón Detalles en mobile
4. Mantener X y counter siempre visibles en PhotoViewer desktop
5. Mostrar hint de swipe en primeras 3 cards
6. Agregar label "Compartir" al ícono de share

### Fase 3 — Esfuerzo medio (#4)
7. Gesture dismiss (swipe-down) para BottomSheet
