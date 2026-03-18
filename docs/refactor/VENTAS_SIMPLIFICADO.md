# Refactor Ventas — De Funnel Premium a Feed Simple

> **Inicio:** 18 Mar 2026
> **Estado:** Planificación
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

**Estado:** Pendiente

---

### Bloque 2 — Filtros simples inline

**Objetivo:** Filtros auto-apply estilo alquileres, adaptados a datos de venta.

**Filtros:**
| Filtro | Tipo | Valores | Notas |
|---|---|---|---|
| Zonas | Botones multi-select | 5 zonas canónicas | Mismo que alquileres |
| Presupuesto | Slider rango | $50k — $500k USD | En USD, no BOB |
| Dormitorios | Botones | Mono, 1, 2, 3+ | Mismo que alquileres |
| Entrega | Botones | Todo, Inmediata, Preventa | No existe en alquileres |
| Orden | Botones | Recientes, Precio ↑, Precio ↓ | Mismo que alquileres |

**Filtros que NO se incluyen (futuro):** Innegociables, deseables, trade-offs, parqueo/baulera.

**Referencia:** Filtros inline en `pages/alquileres.tsx` (no componente separado).

**Estado:** Pendiente

---

### Bloque 3 — Cards neutrales para ventas

**Objetivo:** Card de propiedad simple que no exponga análisis de mercado.

**Card propuesta (mobile):**
```
┌─────────────────────────┐
│  [Photo Carousel]       │
│  ♡ (favorite)  ↗ (share)│
├─────────────────────────┤
│ Nombre Edificio         │  ← Cormorant Garamond
│ ZONA · #1234            │
│ $145,000                │  ← Precio USD grande
│ $2,100/m²               │  ← Precio por m² en gold
│ 65m² · 2 dorm · 1 baño  │
│ [TC Paralelo] [Preventa]│  ← Badges neutrales
│ [Plan pagos] [-5% ctdo] │
│ Piscina · Gym · +3 más  │  ← Amenidades resumidas
├─────────────────────────┤
│  [♡ FAVORITO] [↗ COMPARTIR] │
└─────────────────────────┘
```

**Qué se muestra (neutral):**
- Foto carousel con navegación
- Nombre proyecto + zona + ID
- Precio USD + precio/m²
- Specs: m², dormitorios, baños
- Badges informativos: TC Paralelo, Negociable, Plan pagos, Descuento contado, Preventa
- Amenidades resumidas (3 + "+N más")
- Botones: favorito, compartir

**Qué NO se muestra (se reserva para Tier 2):**
- Síntesis fiduciaria (Oportunidad / Premium / Sospechoso)
- Posición vs mercado ("12% bajo mercado")
- Poder de negociación (estrellas)
- Ranking en edificio
- Precio real de compra (parqueo/baulera estimados)
- Costo mensual de vivir
- Innegociables/deseables del usuario

**Referencia:** `MobilePropertyCard` y card desktop en `pages/alquileres.tsx`.

**Estado:** Pendiente

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

### Bloque 5 — Compartir + Comparar

**Objetivo:** Share URL por propiedad y comparación side-by-side.

**Specs:**
- URL compartible: `/ventas?id=123` → spotlight mode
- Spotlight card con banner "Te compartieron este depto"
- Compare sheet adaptado a ventas (precio USD, $/m², estado construcción)
- Máximo 3 favoritos para comparar

**Referencia:** `CompareSheet.tsx` de alquileres + spotlight mode en `pages/alquileres.tsx`.

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
Bloque 1 (esqueleto) → Bloque 2 (filtros) → Bloque 3 (cards) → Bloque 4 (mobile)
     ↓ deployable                                                      ↓ deployable
Bloque 5 (compartir/comparar) → Bloque 6 (navbar/routing)
                                       ↓ deployable
```

- Bloques 1-3 se pueden trabajar juntos (son la página mínima funcional)
- Bloque 4 (mobile) puede ir en paralelo si las cards ya existen
- Bloque 5-6 son post-MVP

**MVP mínimo deployable:** Bloques 1 + 2 + 3 = página `/ventas` con filtros y cards en desktop. Mobile básico (grid, no TikTok todavía).

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
