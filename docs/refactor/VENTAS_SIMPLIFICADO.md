# Refactor Ventas — De Funnel Premium a Feed Simple

> **Inicio:** 18 Mar 2026
> **Estado:** En ejecución — Bloques 1-2 completados, Bloque 3 en progreso
> **Última actualización:** 18 Mar 2026

---

## Restricciones absolutas

Estas restricciones aplican a TODO el refactor. No hay excepciones sin aprobación explícita.

1. **NO modificar** ningún archivo en `components/results-premium/` — son Tier 2, se reconectan después
2. **NO modificar** ningún archivo en `components/filters-premium/` — son Tier 2
3. **NO modificar** `pages/filtros-v2.tsx`, `formulario-v2.tsx`, `resultados-v2.tsx` — quedan vivos por URL
4. **NO modificar** `pages/landing-v2.tsx` ni componentes en `components/landing-premium/` — se evalúa después
5. **NO modificar** la RPC `buscar_unidades_reales()` existente — otros flujos dependen de ella
6. **NO modificar** las API routes existentes (`razon-fiduciaria`, `generar-guia`, `informe`, `contactar-broker`)
7. **NO tocar** pipeline nocturno (n8n workflows, funciones SQL de discovery/enrichment/merge/matching)
8. **NO tocar** admin dashboard, HITL, health, broker pages

**Regla general:** `/ventas` solo CREA archivos nuevos y AGREGA al navbar. No modifica nada existente excepto `NavbarPremium.tsx` (Bloque 6) y `lib/supabase.ts` (agregar nuevo wrapper).

**Ante decisiones no resueltas durante ejecución:** Pausar y reportar antes de elegir.

---

## 1. Por qué este refactor

### Contexto estratégico

SICI construyó el flujo de ventas primero: un funnel de 4 pasos (landing → filtros → formulario nivel 2 → resultados con análisis fiduciario). El producto es sofisticado — análisis de posición de mercado, poder de negociación, ranking en edificio, síntesis fiduciaria por propiedad, informe PDF premium.

**Problema:** Poca tracción en go-to-market. El funnel es largo, los brokers ven sus propiedades expuestas con etiquetas como "Sospechoso" o "Premium" que las posicionan negativamente, y los usuarios no llegan al final del embudo.

### Pivote a alquileres

Se diseñó el flujo de alquileres con filosofía opuesta: página única, filtros inline, cards neutrales, feed TikTok en mobile. Sin formularios, sin barreras, sin análisis que expongan propiedades.

**Resultado:** Más tracción, feedback real de brokers y usuarios, aprendizajes concretos sobre qué funciona.

### Decisión

Aplicar los aprendizajes de alquileres al flujo de ventas. No borrar lo construido — simplificar la entrada y reservar el análisis premium para después, cuando haya tracción que lo justifique.

---

## 2. Diagnóstico: Ventas vs Alquileres hoy

| Dimensión | Ventas (actual) | Alquileres | Ventas (objetivo) |
|---|---|---|---|
| **Entrada** | Landing → Filtros → Formulario → Resultados (4 pasos) | `/alquileres` directo (1 página) | `/ventas` directo (1 página) |
| **Filtros** | 2 niveles: básicos + innegociables/deseables/trade-offs | 6 botones + slider, auto-apply 400ms | Similar a alquileres, adaptado a venta |
| **Cards** | 977 líneas, 6 secciones expandibles, análisis fiduciario | Specs + badges + foto + WhatsApp | Specs + badges + foto, neutral |
| **Mobile** | Grid scrollable | TikTok snap-scroll full-screen | TikTok snap-scroll |
| **Fricción** | Llenar formulario antes de ver resultados | Zero — scroll y descubrí | Zero |
| **Broker risk** | Expone "Sospechoso", "Premium", posición mercado | Solo datos neutrales | Solo datos neutrales |
| **Moat** | Visible desde el inicio (analysis-first) | No hay análisis visible | Oculto, activable post-tracción |

---

## 3. Principio rector

```
HOY (validar tracción):
  /ventas → feed simple, zero fricción, cualquiera entra

DESPUÉS (cuando haya tracción):
  /ventas → feed simple (descubrimiento casual)
     ↓ CTA "Análisis detallado" o "Encontrá tu mejor opción"
  /filtros-v2 → formulario-v2 → resultados-v2 (análisis premium)
```

**El funnel premium no se borra.** Se desconecta del navbar y queda accesible por URL directa. Cuando haya tracción, se reconecta como upgrade path.

---

## 4. Inventario de features existentes y destino

### Tier 1 — Se simplifica para `/ventas`

Estas features se reemplazan con versiones simples en la nueva página.

| Feature actual | Archivo | Qué pasa |
|---|---|---|
| `PropertyCardPremium` (977L, 6 secciones) | `components/results-premium/PropertyCardPremium.tsx` | Card nueva simple estilo alquileres — foto, specs, badges, sin análisis |
| Funnel 4 pasos | `filtros-v2` → `formulario-v2` → `resultados-v2` | Reemplazado por página única `/ventas` |
| Formulario nivel 2 (innegociables, trade-offs) | `pages/formulario-v2.tsx` | No aparece en `/ventas` |
| Síntesis fiduciaria visible en card | Dentro de `PropertyCardPremium` | Se oculta — expone props negativamente |
| MOAT scoring | `resultados-v2.tsx` (scoring inline) | No se usa — requiere formulario previo |
| Landing hero "Recibí tu informe" | `components/landing-premium/StepsPremium.tsx` | Se adapta messaging |

### Tier 2 — Se mantiene intacto, se reconecta después

Estas features están construidas, funcionan, y se activan cuando haya tracción.

| Feature | Archivo(s) | Valor futuro |
|---|---|---|
| Razonamiento fiduciario (Claude Sonnet) | `pages/api/razon-fiduciaria.ts` | Análisis premium por propiedad |
| Guía fiduciaria personalizada | `pages/api/generar-guia.ts` | Feature premium para usuarios registrados |
| Informe HTML/PDF completo | `lib/informe/{types,helpers,template}.ts` | Producto pagado o lead magnet |
| `PropertyCardPremium` completa | `components/results-premium/PropertyCardPremium.tsx` | Vista detalle individual o informe |
| Formulario nivel 2 completo | `pages/formulario-v2.tsx` | Paso opcional post-discovery |
| Order favorites modal | `components/results-premium/OrderFavoritesPremium.tsx` | Comparación premium |
| Favorites progress bar | `components/results-premium/FavoritesProgressBarPremium.tsx` | Gamificación post-tracción |
| Mapa con filtros MOAT | `components/results-premium/MapaResultados.tsx` | Mapa simplificado primero, MOAT después |
| Lead capture + WhatsApp dinámico | `pages/api/contactar-broker.ts` | Reconectar cuando haya conversiones |
| Lead feedback modal | `FeedbackPremiumModal` en `resultados-v2.tsx` | Lead capture post-tracción |

### Tier 3 — No se toca

| Feature | Razón |
|---|---|
| Páginas `filtros-v2`, `formulario-v2`, `resultados-v2` | Quedan vivas por URL, sin link en navbar |
| `landing-v2.tsx` + componentes landing | Se evalúa después si el hero cambia |
| `buscar_unidades_reales()` RPC | `/ventas` usa RPC nueva separada |
| Pipeline nocturno completo | Cero cambios en data pipeline |
| Admin dashboard, HITL, health | Cero cambios |
| Páginas mercado (`/mercado/equipetrol/*`) | Independientes |

---

## 5. Decisiones resueltas

| # | Decisión | Resolución | Razón |
|---|---|---|---|
| D1 | ¿`buscar_unidades_reales()` directo o RPC nueva? | **RPC nueva `buscar_unidades_simple()`** | La actual desperdicia ~8-15ms/row en `razon_fiduciaria_texto()` + rankings edificio/tipología (2 subqueries COUNT). Con ~300 props = 2.4-4.5 seg de overhead innecesario. Copiar, eliminar ~35 líneas premium, retornar 35 campos en vez de 43. |
| D2 | ¿Cuántas props cargar? | **Todas, sin LIMIT** | ~297 activas actualmente. ~300KB raw / ~60KB gzip. LIMIT 200 deja 97 props invisibles sin que el usuario lo sepa. Virtualización maneja el render. Si crece a 500+ se agrega paginación server-side. |
| D3 | ¿Paginación o virtual scroll? | **Virtual scroll (±3 cards)** | Probado en alquileres con ~185 props. Mismo patrón TikTok: solo ~7 DOM nodes en cualquier momento. |
| D4 | ¿Navbar "Ventas" + "Alquileres" o dropdown? | **Dos links separados** | Más directo, menos fricción. El dropdown "Mercado" ya existe para otra cosa. |
| D5 | ¿Landing apunta a `/ventas` o al funnel? | **A `/ventas`** | El punto del refactor es eliminar fricción. La landing debe llevar al feed directo. |
| D6 | ¿Redirect 301 de `/filtros-v2`? | **NO redirect, mantener ambas** | El funnel viejo queda como opción futura. Un 301 es irreversible y mata la URL si queremos reactivar. |

---

## 6. Bloques de trabajo

Cada bloque es independiente y deployable por separado.

### Bloque 1 — Página `/ventas` (esqueleto)

**Objetivo:** Crear la página single-page con la misma arquitectura que `/alquileres`.

**Alcance:**
- Nueva RPC `buscar_unidades_simple()` (sin razon_fiduciaria, sin rankings, 35 campos)
- Nuevo wrapper `buscarUnidadesSimple()` en `lib/supabase.ts` + tipo `UnidadSimple`
- Nueva página `pages/ventas.tsx`
- Layout responsive: mobile (feed vertical) + desktop (sidebar + grid)
- Carga completa (~297 props) + virtualización
- Cards placeholder (se diseñan en Bloque 3)
- Sin mapa todavía

**Referencia:** `pages/alquileres.tsx` — misma estructura pero adaptada a venta.

**Pasos:**

| Paso | Descripción | Entregable | ~Tiempo |
|---|---|---|---|
| 1.1 | Exportar `buscar_unidades_reales()` de producción con `pg_get_functiondef()`. Copiar, eliminar `razon_fiduciaria_texto()` + rankings edificio/tipología + `calcular_posicion_mercado()`. Crear `buscar_unidades_simple()`. | Función SQL deployable | 30 min |
| 1.2 | Agregar wrapper `buscarUnidadesSimple()` en `lib/supabase.ts` + tipo `UnidadSimple` en `types/` | Función TS que llama la RPC y mapea tipos | 30 min |
| 1.3 | Crear `pages/ventas.tsx` esqueleto — layout desktop (sidebar placeholder + grid placeholder), llamada a RPC, loading state | Página que carga datos y muestra lista cruda | 30 min |
| 1.4 | Layout desktop — sidebar con espacio para filtros (Bloque 2) + grid responsive de cards placeholder | Estructura visual, cards muestran nombre+precio | 30 min |
| 1.5 | Layout mobile — detección `isMobile`, contenedor scroll vertical, cards apiladas (grid básico, no TikTok — eso es Bloque 4) | Versión mobile funcional | 30 min |
| 1.6 | Smoke test — verificar carga, props reales, responsive, performance (~300 props) | Verificado en dev | 15 min |

**Commit:** `2f2b752` — RPC + API proxy + página esqueleto + Playwright
**Estado:** Completado

---

### Bloque 2 — Filtros simples inline

**Objetivo:** Filtros auto-apply estilo alquileres, adaptados a datos de venta.

**Filtros implementados:**
| Filtro | Tipo | Valores |
|---|---|---|
| Zonas | Botones multi-select pill | 5 zonas canónicas (match exacto BD) |
| Presupuesto | Slider rango doble (min+max) | $30k — $500k USD, step $10k |
| Dormitorios | Botones multi-select | Mono, 1, 2, 3+ |
| Entrega | Botones single-select | Todo, Inmediata, Preventa |
| Orden | Botones single-select | Recientes, Precio asc/desc |

Auto-apply con debounce 400ms (desktop). Botón "APLICAR FILTROS" (mobile).
Count "{filtered} de {total}" preserva total sin filtros.

**Commit:** `2a4fae8` — filtros desktop + mobile panel expandible
**Estado:** Completado

---

### Bloque 3 — Cards neutrales para ventas

**Objetivo:** Card de propiedad simple que no exponga análisis de mercado.

**Card implementada:**
```
┌─────────────────────────┐
│  [Photo Carousel 1/7 ▸] │
│  ♡  ↗                   │
├─────────────────────────┤
│ Nombre Edificio         │  ← Cormorant Garamond
│ ZONA · #1234            │
│ $145,000                │  ← Precio USD (normalizado)
│ $2,100/m²               │  ← gold
│ 65m² · 2 dorm · 1 baño · 5° piso
│ [Preventa · Mar 2026]   │  ← Con fecha entrega si tiene
│ [Negociable] [Plan pagos]│
│ 🏢 Piscina · Gym · +4   │  ← Amenidades edificio (hint)
│ 🏠 Cocina · AC · +1     │  ← Equipamiento depto (hint, gold)
│ [Ver detalles] [Ver original ↗]
└─────────────────────────┘
```

**Qué se muestra (neutral):**
- Photo carousel con background-image (cover), prev/next, counter
- Heart (favorito) + Share (copiar URL) overlay sobre foto
- Nombre proyecto + zona + ID
- Precio USD normalizado + precio/m²
- Specs con separadores: m² · dorms · baños · piso
- Badges pill: Negociable, Plan pagos, Descuento contado, Preventa (con fecha), Parqueo incl., Baulera incl.
- Dos líneas hint con íconos diferenciados: edificio (blanco) + depto (gold)
- "Ver detalles" (placeholder → Bloque 5) + "Ver original ↗"

**Qué NO se muestra:**
- TC Paralelo (confunde — precios ya normalizados a oficial, se mueve a "Ver detalles")
- Síntesis fiduciaria, posición mercado, negociación, ranking
- Precio real de compra, costo mensual, innegociables/deseables

**Decisiones de diseño:**
- `style jsx global` (no scoped) para que CSS aplique a componentes hijos
- Íconos edificio vs casa diferenciados por color (blanco vs gold muted)
- "+N" en hints NO es clickeable — solo visual. "Ver detalles" es el CTA
- Badge "Preventa · Mar 2026" enriquece con fecha_entrega cuando está disponible

**Estado:** En progreso

---

### Bloque 4 — Mobile TikTok feed

**Objetivo:** Experiencia mobile idéntica a alquileres — snap-scroll, virtualización, filter card embebida.

**Specs:**
- `scroll-snap-type: y mandatory` en container
- Cada card ocupa `100dvh`
- Virtualización: solo renderizar ±3 cards del índice activo
- Filter card insertada en posición 3 del feed
- Detección de card activa por scroll position
- Floating: favorites banner (bottom), mapa button (bottom-right)

**Referencia:** Sección mobile de `pages/alquileres.tsx` (buscar `isMobile` y `scroll-snap`).

**Estado:** Pendiente

---

### Bloque 5 — Vista detalle + Compartir + Comparar

**Objetivo:** Bottom sheet/panel de detalle por propiedad + share URL + comparación.

**5a — Vista detalle (bottom sheet):**
El botón "Ver detalles" de la card (Bloque 3) abre un panel con información completa organizada:
- Amenidades del edificio (lista completa)
- Equipamiento del departamento (lista completa)
- Descripción del listing
- Info de pago: TC paralelo (sí/no), plan de pagos, descuento contado
- WhatsApp del broker/agente (sin gate, acceso directo)
- **"Ver anuncio original"** — detrás de gate: nombre + teléfono + correo. El gate aparece solo al clickear este link, NO para acceder al sheet. Esto captura leads reales antes de salir a los portales.
- Referencia: `BottomSheet` pattern de alquileres (`pages/alquileres.tsx`)
- **Deuda técnica:** Verificación de datos falsos en el gate (email válido, teléfono boliviano, etc.) queda para después.
- **Deuda técnica:** Agregar sección "Transparencia de precio" en el sheet que muestre: TC detectado del anunciante (paralelo/oficial/no especificado), el valor normalizado vs el valor original, y disclaimer: "El precio normalizado es para comparación — el precio real de transacción depende de la forma de pago acordada con el vendedor."

**5b — Compartir:**
- URL compartible: `/ventas?id=123` → spotlight mode
- Spotlight card con banner "Te compartieron este depto"
- Share button ya existe en card (copia URL al clipboard)

**5c — Comparar:**
- Compare sheet adaptado a ventas (precio USD, $/m², estado construcción)
- Máximo 3 favoritos para comparar
- Referencia: `CompareSheet.tsx` de alquileres

**Estado:** Pendiente

---

### Bloque 6 — Navbar y routing

**Objetivo:** Integrar `/ventas` al navbar y ajustar navegación.

**Cambios:**
- Navbar: agregar "Ventas" como link directo a `/ventas` (igual que "Alquileres")
- Navbar: remover o renombrar "Comenzar" (actualmente va a `/filtros-v2`)
- Funnel viejo: mantener accesible por URL directa, sin link en navbar
- Landing CTA: apuntar a `/ventas` en vez de `/filtros-v2`

**Estado:** Pendiente

---

### Bloque 7 — Mapa simplificado

**Objetivo:** Vista de mapa con pins de propiedades, sin categorías MOAT ni análisis.

**Desktop:**
- Toggle Grid/Mapa en la barra superior del main (mismo patrón que alquileres)
- Mapa Leaflet ocupa el área del grid cuando está activo
- Pins con precio (`$145k`) — click en pin muestra card flotante
- Filtros del sidebar siguen aplicando al mapa

**Mobile:**
- Botón flotante "Mapa" (bottom-right, como alquileres)
- Click abre overlay fullscreen con el mapa
- Pins con precio, tap muestra card resumida
- Botón cerrar vuelve al feed

**Qué NO incluye (diferencia con mapa viejo de ventas):**
- Sin filtros MOAT (Oportunidad/Justo/Premium)
- Sin color-coding por categoría de precio
- Sin clustering por tipología
- Pins neutrales — solo precio

**Referencia:**
- `components/alquiler/AlquilerMapMulti.tsx` — mapa multi-pin para alquileres
- `components/results-premium/MapaResultados.tsx` — mapa viejo de ventas (Tier 2, no modificar)

**Estado:** Pendiente (post Bloques 4-6)

---

## 7. Learnings de alquileres aplicables

Extraídos de `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` y la experiencia de construcción.

### UX y producto

| Learning | Aplicación a ventas |
|---|---|
| Feed TikTok en mobile genera más engagement que grid | Bloque 4: snap-scroll para ventas |
| Filtros auto-apply eliminan fricción vs botón "Aplicar" | Bloque 2: debounce 400ms |
| Filter card embebida en feed (posición 3) funciona | Bloque 4: misma posición |
| Cards neutrales no asustan brokers | Bloque 3: sin análisis fiduciario visible |
| Compartir por WhatsApp con spotlight mode genera leads orgánicos | Bloque 5: `/ventas?id=123` |
| Compare sheet 3-way es la feature más usada post-favoritos | Bloque 5: adaptar a ventas |
| Virtualización ±3 cards es suficiente para 200+ props | Bloque 4: mismo approach |

### Técnicos (del pipeline)

| Learning | Ref | Status venta |
|---|---|---|
| `expirado_stale` para props viejas sin confirmación | Migración 164 | Pendiente — implementar con umbral ~400d |
| `fecha_discovery` debe ser inmutable post-INSERT | Migración 165 | Verificar `registrar_discovery()` |
| Status activos ≠ solo `completado` | Learning #5 | Verificar dashboards venta |
| Búsqueda por ID debe ignorar todos los filtros | Learning #6 | Implementar en `/ventas` |

---

## 8. Stack técnico

La nueva página `/ventas` usa exactamente el mismo stack que `/alquileres`:

- **Framework:** Next.js 14 (Pages Router)
- **Styling:** Tailwind CSS inline (mismo que alquileres, no CSS modules)
- **Data:** Supabase RPC nueva `buscar_unidades_simple()` (35 campos, sin premium)
- **Mapa:** Leaflet dinámico (no SSR)
- **State:** React useState + localStorage para favoritos
- **Fonts:** Cormorant Garamond (display) + Manrope (body)
- **Colores:** Negro (#0a0a0a) + Crema (#f8f6f3) + Oro (#c9a959)

---

## 9. Orden de ejecución recomendado

```
Bloque 1 (esqueleto) ✅ → Bloque 2 (filtros) ✅ → Bloque 3 (cards) ✅ → Bloque 4 (mobile TikTok)
     ↓ MVP deployable                                                          ↓ deployable
Bloque 5 (detalle/compartir/comparar) → Bloque 6 (navbar/routing) → Bloque 7 (mapa)
                                               ↓ deployable               ↓ deployable
```

- **MVP alcanzado:** Bloques 1+2+3 = página `/ventas` con filtros, cards y datos reales
- Bloque 4: mejora mobile a TikTok feed
- Bloque 5-6: features de engagement + integración navegación
- Bloque 7: mapa simplificado, independiente, post-MVP

---

## 10. Métricas de éxito

| Métrica | Cómo medir | Target |
|---|---|---|
| Visitas a `/ventas` | GA pageview | > visitas a `/filtros-v2` en mismo período |
| Scroll depth mobile | GA scroll event | >50% llegan a card 5+ |
| Shares por WhatsApp | GA event / Slack notificación | >0 shares/semana |
| Favoritos marcados | GA event `favorite_toggle` | >0 por sesión |
| Compare sheet abiertos | GA event | Signal de intención |
| Feedback broker cualitativo | Conversaciones directas | No rechazo, interés |

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Perder el moat del análisis fiduciario | No se borra — se desconecta temporalmente. Reconectable en cualquier momento |
| Brokers ven TODAS las propiedades sin filtro | Ya pasa en alquileres y no fue problema. Cards neutrales no comparan |
| Usuarios extrañan el análisis detallado | No hay usuarios activos del funnel actual — no hay base que perder |
| `/ventas` canibaliza landing premium | Landing sigue viva. Si `/ventas` tiene más tracción, es señal positiva |
| ~297 props activas en carga inicial | ~300KB raw / ~60KB gzip. Virtualización ±3 cards en DOM. Si crece a 500+ se agrega paginación server-side |

---

## Changelog

| Fecha | Cambio |
|---|---|
| 18 Mar 2026 | Documento inicial — planificación completa, inventario de features, 6 bloques definidos |
| 18 Mar 2026 | Sección "Restricciones absolutas" agregada. 6 decisiones resueltas (RPC nueva, sin LIMIT, virtual scroll, navbar 2 links, landing→/ventas, no redirect 301). Bloque 1 desglosado en 6 pasos de 30 min. |
| 18 Mar 2026 | Bloque 1 completado (`2f2b752`). Bloque 2 completado (`2a4fae8`). Bloque 3 en progreso. |
| 18 Mar 2026 | Bloque 5 expandido: "Vista detalle" (bottom sheet) agregado como 5a. TC Paralelo movido de badges de card a vista detalle. Íconos edificio/depto diferenciados por color. Preventa badge enriquecido con fecha_entrega. |
