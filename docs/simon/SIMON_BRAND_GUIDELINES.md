# Simon — Brand Guidelines
## Inteligencia Inmobiliaria Premium

---

## 1. Esencia de Marca

### Posicionamiento
**Simon** es inteligencia inmobiliaria premium para compradores exigentes en Equipetrol, Santa Cruz de la Sierra.

### Propuesta de Valor
> "Análisis IA contra todo el mercado. Sin vendedores. Sin sesgos. Solo datos."

### Personalidad de Marca
| Atributo | Descripción |
|----------|-------------|
| **Sofisticado** | Diseño limpio, tipografía elegante, espacios generosos |
| **Confiable** | Datos verificados, transparencia total, sin promesas vacías |
| **Inteligente** | IA que trabaja para vos, no contra vos |
| **Accesible** | Premium pero democrático ("100% gratis") |

### Tono de Voz
- **Directo**: Sin rodeos, respuestas claras
- **Calmado**: No presiona, no genera urgencia artificial
- **Experto**: Habla con autoridad pero sin jerga técnica
- **Cercano**: Usa "vos" (voseo rioplatense/cruceño)

---

## 2. Paleta de Colores

### Colores Principales

| Color | Hex | RGB | Uso |
|-------|-----|-----|-----|
| **Negro Premium** | `#0a0a0a` | 10, 10, 10 | Fondos principales, texto sobre crema |
| **Crema** | `#f8f6f3` | 248, 246, 243 | Fondos alternativos, contraste |
| **Oro Simon** | `#c9a959` | 201, 169, 89 | Acentos, destacados, CTAs hover |
| **Blanco** | `#ffffff` | 255, 255, 255 | Texto sobre negro, CTAs principales |

### Colores Secundarios (Opacidades)

| Color | Código | Uso |
|-------|--------|-----|
| Blanco 70% | `text-white/70` | Texto secundario sobre negro |
| Blanco 50% | `text-white/50` | Texto terciario, descripciones |
| Blanco 40% | `text-white/40` | Labels, metadata |
| Blanco 30% | `text-white/30` | Números decorativos, hints |
| Blanco 10% | `border-white/10` | Líneas divisorias sutiles |
| Gris medio | `#666666` | Texto sobre crema |
| Gris claro | `#999999` | Labels sobre crema |
| Oro 30% | `border-[#c9a959]/30` | Bordes sutiles dorados |

### Aplicación de Colores

```
┌─────────────────────────────────────────────────────────┐
│  FONDO NEGRO (#0a0a0a)                                  │
│                                                         │
│  Título: Blanco (#ffffff)                               │
│  Palabra destacada: Oro (#c9a959) + itálica             │
│  Subtítulo: Blanco 60% (text-white/60)                  │
│  Labels: Oro + MAYÚSCULAS + tracking amplio             │
│  Botón: Fondo blanco, texto negro                       │
│  Botón hover: Fondo oro, texto blanco                   │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FONDO CREMA (#f8f6f3)                                  │
│                                                         │
│  Título: Negro (#0a0a0a)                                │
│  Palabra destacada: Itálica (mismo color)               │
│  Subtítulo: Gris (#666666)                              │
│  Labels: Oro + MAYÚSCULAS                               │
│  Botón: Fondo negro, texto blanco                       │
│  Botón hover: Fondo oro                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Tipografía

### Familias Tipográficas

| Tipo | Fuente | Peso | Uso |
|------|--------|------|-----|
| **Display** | Cormorant Garamond | 300, 400 | Títulos, números grandes, logo |
| **Body** | Manrope | 300, 400, 500, 600 | Texto corrido, botones, labels |

### Importación (Google Fonts)
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Manrope:wght@300;400;500;600&display=swap');
```

### Clases CSS
```css
.font-display {
  font-family: 'Cormorant Garamond', Georgia, serif;
}

.font-body {
  font-family: 'Manrope', -apple-system, sans-serif;
}

body {
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

### Jerarquía Tipográfica

| Elemento | Fuente | Tamaño | Peso | Características |
|----------|--------|--------|------|-----------------|
| **H1 Hero** | Cormorant | 5xl-7xl | light | leading-[1.1], tracking-tight |
| **H2 Sección** | Cormorant | 4xl-5xl | light | leading-tight |
| **H3 Card** | Manrope | xl | light | — |
| **Párrafo** | Manrope | lg | light | leading-relaxed |
| **Label** | Manrope | 0.7rem | light | MAYÚSCULAS, tracking-[3px]-[4px] |
| **Botón** | Manrope | xs-sm | normal | MAYÚSCULAS, tracking-[2px]-[3px] |
| **Número grande** | Cormorant | 3xl-6xl | light | — |

### Énfasis en Títulos
La palabra clave de cada título va en **itálica** y opcionalmente en **oro**:

```
"¿El precio por ese departamento es justo?"
                    ↑ itálica + oro

"Buscar departamento no deberia ser un trabajo..."
                     ↑ itálica (sin oro en fondo crema)

"Tres pasos hacia tu nuevo hogar"
                  ↑ itálica + oro
```

---

## 4. Componentes de Diseño

### Labels de Sección
Siempre antes de cada título de sección:

```
── Inteligencia Inmobiliaria

[línea dorada 12px] + [texto oro mayúsculas] + [línea dorada 12px]
```

Código:
```tsx
<div className="flex items-center gap-4 mb-8">
  <span className="w-8 h-px bg-[#c9a959]" />
  <span className="text-[#c9a959] text-[0.7rem] tracking-[3px] uppercase">
    El problema
  </span>
</div>
```

### Botones

**Primario (sobre negro):**
```tsx
<button className="bg-white text-[#0a0a0a] px-12 py-5 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] hover:text-white transition-all duration-300">
  Obtener análisis
</button>
```

**Primario (sobre crema):**
```tsx
<button className="bg-[#0a0a0a] text-white px-10 py-4 text-xs tracking-[3px] uppercase hover:bg-[#c9a959] transition-all duration-300">
  Ver datos del mercado
</button>
```

**Características:**
- Padding generoso: `px-10 py-4` a `px-16 py-6`
- MAYÚSCULAS siempre
- Letter-spacing: `tracking-[2px]` a `tracking-[3px]`
- Transición suave: `transition-all duration-300`
- Hover: Fondo cambia a oro

### Cards (sobre crema)
```tsx
<div className="bg-white p-6 border border-[#0a0a0a]/10 hover:border-[#c9a959]/50 transition-colors">
  {/* contenido */}
</div>
```

### Stats Box (caja negra sobre crema)
```tsx
<div className="bg-[#0a0a0a] p-8 md:p-12">
  <div className="flex justify-between items-end pb-6 border-b border-white/10">
    <span className="text-white/50 text-sm tracking-wide">Label</span>
    <span className="font-display text-3xl text-white">Valor</span>
  </div>
</div>
```

### Divisores
```tsx
// Línea horizontal sutil
<div className="border-t border-white/10" />

// Línea vertical (entre métricas)
<div className="w-px h-12 bg-white/10" />

// Línea decorativa gradiente
<div className="w-px h-32 bg-gradient-to-b from-transparent to-[#c9a959]/30" />
```

---

## 5. Iconografía

### Estilo de Iconos
- **Línea fina**: strokeWidth="1.5"
- **Sin relleno**: fill="none"
- **Tamaño estándar**: 16px (inline), 20px (listas), 32px (features)
- **Color**: Hereda del texto o `text-[#c9a959]`

### Iconos Core

**Flecha derecha (CTAs):**
```tsx
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
  <path d="M5 12h14M12 5l7 7-7 7" />
</svg>
```

**Check (listas, trust indicators):**
```tsx
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
  <polyline points="20 6 9 17 4 12" />
</svg>
```

**Búsqueda:**
```tsx
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
  <circle cx="11" cy="11" r="8" />
  <path d="M21 21l-4.35-4.35" />
</svg>
```

**Gráfico/Chart:**
```tsx
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
  <path d="M3 3v18h18" />
  <path d="M18 9l-5 5-4-4-3 3" />
</svg>
```

**Escudo/Seguridad:**
```tsx
<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
</svg>
```

---

## 6. Espaciado y Layout

### Espaciado Vertical (Secciones)
```
py-32  →  128px  →  Entre secciones principales
py-20  →  80px   →  Dentro de secciones
py-16  →  64px   →  Sub-secciones
py-8   →  32px   →  Entre elementos
py-5   →  20px   →  Padding interno
```

### Márgenes de Contenedor
```
max-w-7xl  →  Navbar
max-w-6xl  →  Secciones de contenido
max-w-5xl  →  Hero
max-w-4xl  →  CTAs, formularios
max-w-2xl  →  Párrafos de texto
```

### Padding Horizontal
```
px-4   →  Mobile
px-8   →  Desktop
```

### Grid System
```tsx
// 2 columnas con gap generoso
<div className="grid md:grid-cols-2 gap-12 md:gap-24">

// 3 columnas para steps/features
<div className="grid md:grid-cols-3 gap-12">

// 5 columnas para microzonas
<div className="grid grid-cols-2 md:grid-cols-5 gap-4">
```

---

## 7. Copy Guidelines

### Headlines - Fórmulas que Funcionan

**Pregunta directa:**
> "¿El precio por ese departamento en Equipetrol es justo?"

**Problema + Negación elegante:**
> "Buscar departamento no debería ser un trabajo de tiempo completo"

**Destino aspiracional:**
> "Tres pasos hacia tu nuevo hogar"

**Invitación personal:**
> "¿Listo para encontrar tu lugar en Equipetrol?"

### Subheadlines - Claridad y Beneficio

| ✓ Bien | ✗ Evitar |
|--------|----------|
| "Análisis IA contra todo el mercado. Sin vendedores. Sin sesgos. Solo datos." | "La mejor plataforma de búsqueda inmobiliaria con tecnología de punta" |
| "Analizá el mercado en segundos con datos verificados en tiempo real." | "Utilizamos algoritmos avanzados para encontrar propiedades" |

### Trust Indicators (Badges)
Siempre en grupos de 3, separados por puntos o espacios:

```
Sin cuenta · Datos verificados · 100% gratis
```

```
✓ Sin cuenta    ✓ Datos actualizados    ✓ 100% gratis
```

### CTAs - Verbos de Acción

| Contexto | CTA |
|----------|-----|
| Hero | "Obtener análisis" |
| Navbar | "Comenzar" |
| Post-explicación | "Descubrí las mejores opciones" |
| Market data | "Ver datos del mercado" |
| Informe premium | "Quiero mi informe gratis" |

### Palabras Clave de Marca

| Usar | Evitar |
|------|--------|
| Análisis | Algoritmo |
| Datos verificados | Big data |
| Inteligencia | Tecnología |
| Transparente | Disruptivo |
| Precio justo | Mejor precio |
| Tiempo real | En vivo |

---

## 8. Aplicaciones

### Navbar
```
[Logo: "Simon" en Cormorant]     [Mercado] [Proceso] [Contacto] [CTA: Comenzar]
```

### Hero Section
```
                    ── Inteligencia Inmobiliaria ──

                    ¿El precio por ese
                    departamento en
                    Equipetrol es justo?

        Análisis IA contra todo el mercado. Sin vendedores.
                    Sin sesgos. Solo datos.

                    [ OBTENER ANÁLISIS → ]

                    ✓ Precios en dólares reales (TC oficial)

            Sin cuenta · Datos actualizados · 100% gratis

        ─────────────────────────────────────────────────

        $2,022              189+              24h
        Precio promedio     Proyectos         Actualización
        /m²                 activos           diaria
```

### Sección Problema (fondo crema)
```
── El problema

Buscar departamento                    Decenas de portales, cientos de
no debería ser                         publicaciones, información
un trabajo de tiempo                   desactualizada, precios inflados,
completo                               fotos repetidas de diferentes
                                       inmobiliarias.

                                       El mercado inmobiliario de Santa
                                       Cruz es opaco y fragmentado.
                                       Nosotros lo hacemos transparente.
```

### Steps (fondo negro)
```
── Cómo funciona

Tres pasos hacia
tu nuevo hogar

[🔍]                    [📊]                    [🛡️]
01                      02                      03
Contanos qué buscás     Analizamos el mercado   Recibí tu informe

Respondé algunas        Nuestra IA revisa       Te enviamos las 3
preguntas sobre tus     +300 propiedades        mejores opciones
necesidades...          y cruza datos...        con análisis...
```

---

## 9. Responsive Breakpoints

| Breakpoint | Ancho | Cambios principales |
|------------|-------|---------------------|
| Mobile | < 768px | 1 columna, texto más pequeño, menú oculto |
| Tablet | md: 768px | 2 columnas, padding aumenta |
| Desktop | lg: 1024px | Layout completo |

### Ajustes Mobile
- Hero H1: `text-5xl` → `md:text-7xl`
- Sección H2: `text-4xl` → `md:text-5xl`
- Grid: `grid-cols-1` → `md:grid-cols-2`
- Padding: `px-4` → `md:px-8`
- Gaps: `gap-6` → `md:gap-16`

---

## 10. Assets y Recursos

### Logo
- Texto: "Simon" en Cormorant Garamond
- Sin símbolo/ícono
- Color: Blanco sobre negro, Negro sobre crema

### Favicon
- `/favicon.ico`

### Google Fonts CDN
```
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Manrope:wght@300;400;500;600&display=swap
```

---

## 11. Checklist de Diseño

Antes de publicar cualquier pieza, verificar:

- [ ] ¿Usa solo colores de la paleta?
- [ ] ¿Los títulos usan Cormorant Garamond?
- [ ] ¿El texto corrido usa Manrope?
- [ ] ¿Los CTAs son mayúsculas con tracking amplio?
- [ ] ¿Hay una palabra en itálica/oro en el título?
- [ ] ¿Los iconos son línea fina (strokeWidth 1.5)?
- [ ] ¿El espaciado es generoso?
- [ ] ¿El copy es directo y sin jerga?
- [ ] ¿Incluye trust indicators?

---

## 12. Ejemplos de Ads

### Formato: Feed Instagram (1080x1080)

```
┌────────────────────────────────────┐
│                                    │
│  Fondo: Negro #0a0a0a              │
│                                    │
│        ── Simon ──                 │
│                                    │
│     ¿El precio es justo?           │
│     (Cormorant, blanco)            │
│                                    │
│     "justo" en itálica + oro       │
│                                    │
│     [Dato en vivo:]                │
│     $2,022/m² promedio             │
│     (Cormorant 3xl, oro)           │
│                                    │
│     [ ANALIZAR GRATIS ]            │
│     (botón blanco)                 │
│                                    │
│     simonbo.com                    │
│     (Manrope xs, blanco 40%)       │
│                                    │
└────────────────────────────────────┘
```

### Formato: Stories (1080x1920)

```
┌────────────────────────────────────┐
│  Fondo: Degradado negro → crema    │
│                                    │
│                                    │
│        ── Simon ──                 │
│                                    │
│     189 proyectos                  │
│     monitoreados                   │
│     (Cormorant 5xl)                │
│                                    │
│     en Equipetrol                  │
│     (Manrope, oro)                 │
│                                    │
│                                    │
│     ↑ Swipe para analizar          │
│                                    │
└────────────────────────────────────┘
```

---

**Documento creado:** Febrero 2026
**Versión:** 1.0
**Autor:** Equipo Simon
