# Simon Broker — PRD MVP Mínimo

**Fecha:** 2026-04-22
**Estado:** Scope congelado. Build en cola.
**Responsable producto:** Lucho
**Responsable data:** SICI team

---

## 1. Resumen ejecutivo

Simon Broker es una herramienta SaaS para brokers inmobiliarios que operan en Equipetrol. El producto reutiliza el feed `/ventas` existente y le agrega tres capas de valor: **ACM inline** en cada propiedad, **shortlists compartibles** por cliente, y **dashboard de mercado** para consulta interna.

El MVP se construye **sin login** — cada broker del Founding Program recibe una URL personalizada (`simonbo.com/broker/[slug]`) que funciona como su espacio de trabajo. Login se agrega cuando la base crezca.

**Timeline:** 3 semanas de build · demo usable al final de semana 2 · founding deployment al final de semana 3.

---

## 2. Contexto y tesis

### El problema

Los brokers de Equipetrol trabajan con data fragmentada:
- **Intramax / intranet Century21** les da analytics intra-red (pero nada cross-red)
- **Ultracasas / InfoCasas** tolera data sucia, duplicados, precios inflados
- Para comparar entre redes y responder "¿este precio está bien?" con rigor, improvisan

### La oportunidad

Simon ya hace el trabajo duro de ingesta: discovery nocturno C21 + Remax, dedup cross-red, matching a `proyectos_master`, normalización de precios (paralelo/oficial), filtros de calidad. La data limpia ya existe en `v_mercado_venta` y `v_mercado_alquiler`.

**Lo que falta es la UX para brokers**: poder mostrar esa data de forma profesional al cliente, armar paquetes de propiedades, y tener un ACM defendible sin tener que construirlo manualmente cada vez.

### Diferencial

| Fuente | Qué ofrece | Qué no ofrece |
|---|---|---|
| Ultracasas / InfoCasas | Feed amplio | Data sucia, duplicados, zero análisis |
| Intramax / intranet C21 | Analytics intra-red | Nada de Remax ni otras fuentes |
| Improvisación del broker | Conocimiento local | Escala cero, frágil bajo preguntas técnicas |
| **Simon Broker** | **Cross-red + curación + ACM + compartible + honestidad publicada** | — |

---

## 3. Personas

| Persona | Uso | Rigor requerido |
|---|---|---|
| **Broker frente a cliente comprador** | ACM para justificar que el precio está bien / mal. Comparables. | Alto — cliente puede preguntar "¿de dónde sale?" |
| **Broker frente a dueño** | ACM para convencer de ajustar precio de listing. | Alto — dueño defiende su precio |
| **Broker preparando propuesta asíncrona** | Armar shortlist, mandar link por WhatsApp. | Medio — formato importa |
| **Broker estudiando mercado** | Dashboard de inventario, absorción, precio/m² por zona. | Medio — uso interno |

### Flujos reales (no inventados)

1. **Cliente llega sin listing específico:** "Quiero depto en Equipetrol, 3 dorm, $200k máximo" → broker filtra en `/ventas`, marca 5-8 propiedades, arma shortlist "Juan Pérez", manda link.

2. **Cliente llega con listing específico del broker:** broker muestra la propiedad en el sheet con modo broker activo (ve ACM inline) → si el cliente no está convencido, el broker marca alternativas y manda shortlist.

3. **Broker sin listings propios:** usa Simon exclusivamente para encontrar ofertas que existen → mismo flujo que caso 1.

4. **Broker mantenéndose informado:** entra al dashboard de mercado 1-2 veces por semana. Lo usa para responder con propiedad al cliente ("esta semana salieron 12 unidades nuevas en Centro, el precio/m² mediano está en $2,340").

---

## 4. Scope MVP — 3 funcionalidades

### F1 · Página del broker `/broker/[slug]`

**Qué hace:** landing operativa del broker. Reutiliza el feed `/ventas` con modo broker activado + sidebar/tabs para shortlists y mercado.

**Comportamiento del feed:**
- Filtros, mapa, cards y bottom sheet idénticos a `/ventas` público
- Modo broker activo por default: el bottom sheet cambia
  - **Quita:** "Preguntas para el broker" (no aplica — el usuario ES broker)
  - **Quita:** gate "Ver anuncio original" (broker tiene acceso directo a la URL)
  - **Agrega:** sección "Análisis de mercado" (ACM inline — ver F1.1)
  - **Agrega:** botón ⭐ "Agregar a shortlist"

**Sin auth:** el slug en la URL identifica al broker. Los primeros 15-25 se crean manualmente en BD por el equipo Simon.

#### F1.1 · ACM inline en el bottom sheet

**Qué muestra:**
- Precio por m² (en USD normalizado)
- Delta vs promedio del cohort zona + dormitorios
- Percentil en cohort (con tamaño de cohort explícito)
- Tiempo en mercado vs mediana zona
- Histórico de precio de la unidad (sparkline, desde `precios_historial`)
- Rango de valor estimado ($X - $Y)
- Ranking dentro de la torre (si hay ≥5 unidades)
- **Yield estimado** (si hay ≥5 alquileres comparables en el cohort, con disclaimer corto)

**Fuente:** RPC nueva `buscar_acm(propiedad_id)` → `v_mercado_venta` + `v_mercado_alquiler` + `precios_historial`.

**Reglas de display:**
- Si cohort < 10 propiedades → se muestra rango min-max en lugar de percentil
- Si no hay ≥5 alquileres → yield se oculta, no se inventa
- Si falta histórico de precio → sparkline se oculta
- Cada número con disclaimer corto cuando aplique

---

### F0 · `CompareSheet` en ventas (precede al MVP broker)

**Cuándo:** S0 — 2-3 días antes de arrancar el MVP broker. Deploy independiente a producción.

**Qué hace:** cuando el usuario tiene 2+ favoritos, puede abrir un comparativo lado a lado de hasta 3 propiedades. Mismo patrón que ya existe en `/alquileres`.

**Dónde funciona:**
- `/ventas` público (todos los usuarios)
- Más adelante se consume desde `/broker/[slug]` (S2) y `/b/[hash]` (S2) sin trabajo adicional

**Por qué se hace primero por fuera:**
1. Separa riesgos — feature estándar, sale a prod sin depender del MVP broker
2. Deploy independiente — feedback de usuarios reales antes de que lo use un cliente del broker
3. Menor complejidad en S2 — el componente ya está probado cuando arranca el MVP

**Campos de comparación venta:**
- Precio USD + precio/m² (resaltado el más barato)
- Tipo de cambio (paralelo / oficial / no especificado)
- Área, dormitorios, baños
- Estacionamientos, bauleras, piso
- Estado construcción (preventa / entrega inmediata)
- Plan de pagos cuando aplique
- Tiempo en mercado
- Link a ver detalle completo

**Implementación:**
- Portar `components/alquiler/CompareSheet.tsx` a `components/venta/CompareSheet.tsx`
- Adaptar campos (tipos de `UnidadVenta` en vez de `UnidadAlquiler`)
- Conectar botón "Comparar (N)" visible cuando hay 2+ favoritos en `/ventas`

**Estimación:** 2-3 días. Se trackea como task independiente, no forma parte del scope "broker" propiamente dicho.

---

### F2 · Shortlists compartibles

**Qué hace:** el broker selecciona propiedades, las agrupa en una shortlist nombrada (cliente X), y genera un link público `/b/[hash]` para mandar por WhatsApp.

**Flujo:**
1. Broker marca propiedades con ⭐ desde el sheet de `/ventas` (feed dentro de `/broker/[slug]`)
2. Al marcar la primera, aparece modal "¿A qué shortlist la agrego?" → elegir existente o crear nueva
3. La shortlist guarda: nombre del cliente, teléfono opcional, N propiedades, orden, comentario opcional por propiedad
4. Botón "Copiar link" → copia `simonbo.com/b/[hash]` al clipboard

**Ruta pública `/b/[hash]`:**
- Muestra el feed curado en orden elegido por el broker
- Cada propiedad: fotos, specs, precio, mapa aproximado, comentario del broker si lo agregó
- Data básica inline en cada card (precio/m² vs zona, tiempo en mercado, "3 similares cerca")
- Header: nombre del broker + foto + teléfono WhatsApp
- **Sin:** logo Simon, NavSimon, footer Simon, link a simonbo.com raíz
- **Con:** paleta Simon (arena, negro, salvia) — diseño se mantiene, marca se oculta
- `robots.txt` bloquea `/b/*` de indexación

**Modelo de datos:**

```sql
broker_shortlists
  id uuid PK
  broker_slug text              -- referencia al slug del broker (sin FK por ahora)
  cliente_nombre text
  cliente_telefono text NULL
  hash text UNIQUE              -- para URL pública
  created_at timestamptz
  updated_at timestamptz
  is_published boolean DEFAULT true

broker_shortlist_items
  id uuid PK
  shortlist_id uuid FK
  propiedad_id uuid FK → propiedades_v2
  tipo_operacion text NOT NULL         -- 'venta' | 'alquiler' (preparado para Fase 2)
  comentario_broker text NULL
  orden int
  added_at timestamptz
```

**Nota:** `tipo_operacion` en items se incluye desde día uno para no requerir migración cuando se extienda a alquileres en Fase 2. En el MVP siempre será `'venta'`.

---

### F3 · Acceso a mercado (reutiliza páginas existentes)

**Qué hace:** la página del broker tiene un bloque/botón *"Ver mercado Equipetrol"* que abre en nueva pestaña las páginas públicas `/mercado/equipetrol` (hub, ventas, alquileres) — ya construidas y con más data de la que el MVP requería.

**NO es:** dashboard custom. **NO es:** newsletter editorial. Es acceso directo a la vista de mercado que ya existe.

**Contenido (lo que ya ofrecen las páginas existentes):**
- Hub (`/mercado/equipetrol`): KPIs totales de ventas + alquileres, mediana precio/m², renta mediana Bs
- Ventas (`/mercado/equipetrol/ventas`): por zona, por tipología, histórico temporal, percentiles
- Alquileres (`/mercado/equipetrol/alquileres`): rentas Bs por zona, yield estimado, tipologías

**Caveat de marca:** las páginas muestran branding Simon. Es aceptable porque el broker las usa para **consulta interna** — la info es igual accesible para cualquier visitante en `simonbo.com/mercado`. No se expone nada privado.

**Implementación:** link + card explicativa en `/broker/[slug]`. **Cero build nuevo.**

**Decisión de producto:** si post-MVP el broker necesita una versión sin branding Simon para compartir con clientes, eso pasa al backlog como dashboard custom. Hoy no hay señal de esa demanda.

---

## 5. Arquitectura técnica

### Archivos nuevos

```
simon-mvp/src/
├── pages/broker/
│   └── [slug].tsx                      → F1: página principal del broker
├── pages/broker/[slug]/
│   └── shortlists/[id].tsx             → F2: editor de shortlist
├── pages/b/
│   └── [hash].tsx                      → F2: ruta pública shortlist
├── components/venta/
│   └── CompareSheet.tsx                → F1.2: comparativo 2+ favoritos (portado de alquiler)
├── components/broker/
│   ├── ACMInline.tsx                   → F1.1: sección ACM en bottom sheet
│   ├── ShortlistPanel.tsx              → F2: panel gestión shortlists
│   ├── ShortlistAddModal.tsx           → F2: modal al marcar ⭐
│   └── SharedFeed.tsx                  → F2: feed público del link compartido
├── hooks/
│   ├── useBrokerMode.ts                → F1: context del modo broker
│   └── useShortlists.ts                → F2: CRUD shortlists
└── lib/
    └── broker-queries.ts               → wrapper RPCs específicos
```

### Archivos modificados

```
simon-mvp/src/
├── components/venta/
│   └── PropertySheet.tsx               → condicional mode: 'user' | 'broker'
└── pages/ventas/
    └── index.tsx                       → acepta prop brokerSlug opcional
```

### SQL nuevo

```
sql/functions/query_layer/
└── buscar_acm.sql                      → RPC del ACM inline
sql/migrations/
└── 22X_broker_shortlists.sql           → tablas shortlists + RLS básico
sql/functions/broker/
└── create_shortlist_hash.sql           → generador de hash único
```

### Decisión: sin RLS estricto en MVP

Las tablas `broker_shortlists` tienen lectura pública via `/b/[hash]` sin auth. Escritura está expuesta (cualquiera que conozca un slug puede crear shortlists en nombre del broker). **En fase founding con 15-25 brokers conocidos y zero dato sensible, el riesgo es aceptable.** Se agrega auth + RLS cuando la base crezca.

---

## 6. Cronograma

| Semana | Entregable | Estado |
|---|---|---|
| **S0** | `CompareSheet` en `/ventas` público — componente portado desde alquiler, 4 insights validados con data (TC sospechoso, mejor precio/m², valor por espacio, misma area distinto precio, parqueo diferenciador), cohort comparable strict (mismo dorms + mismo estado normalizado), limite 3 favoritos, banner "Comparar (N)" + boton × limpiar, filas ocultas cuando todas NULL | ✅ **Completado 2026-04-22** (commit `0de872b`) |
| **S1** | `/broker/[slug]` funcional con feed + modo broker + botón ⭐ (UI no persiste) + RPC `buscar_acm` + ACM inline en sheet | ✅ **Completado 2026-04-22** (commits `c6f3379`, `eb4e919`, `dc984c4`, `97f0917`, `da3bbd9`, `ed2a32d`, `e2f5717`) |
| **S2** | Tablas shortlists + panel gestión + ruta pública `/b/[hash]` + demo end-to-end (reutiliza CompareSheet ya desplegado en S0) | ⏳ Pendiente — siguiente |
| **S3** | Link a `/mercado/equipetrol` en la página broker + polish + creación de slugs para 3 founders + testing | Pendiente |

**Hito de demo:** final de S2 ya hay producto demo-able (broker arma shortlist, manda link, cliente lo abre).

### Handoff S0 → S1

**S0 entregado:** CompareSheet vive en `/ventas` público. Feedback de usuarios reales comienza ahora.

**Para arrancar S1 necesito:**

1. **Luz verde del usuario** para arrancar build de `/broker/[slug]`.
2. **Lista de slugs founding** — nombres de los 3 primeros brokers del Founding Program (pueden ser tentativos, los creo en BD manualmente). Formato sugerido: `martin-silva`, `ana-vargas`, `juan-perez`. Si no hay aún, arranco con slugs demo (`demo`, `test`).
3. **Confirmación de branding** en `/broker/[slug]`: ¿muestro Simon en NavBar o escondo marca como el link compartido? Mi default: mostrar Simon porque el broker es usuario interno, no cliente.

**Primer archivo que crearía en S1:**
- `simon-mvp/src/pages/broker/[slug].tsx` — reutiliza el feed `/ventas` con prop `brokerMode={true}` + slug en URL.
- `simon-mvp/src/hooks/useBrokerMode.ts` — context simple para prop drilling sin volver al feed.
- Migración SQL para tabla `brokers` (slug, nombre, telefono, foto_url).

**Tiempo S1:** 5-7 días de dev.

---

## 7. Decisiones de producto tomadas

| Decisión | Rationale |
|---|---|
| **Sin login en MVP** | Slug en URL es suficiente para 15-25 founders conocidos. Ahorra semanas de build. Se agrega después. |
| **Sin yield en link compartido (cliente final)** | Cliente típico es comprador para habitar, no inversionista. Yield pertenece a Simon Advisor (futuro). |
| **Yield sí en ACM del broker (interno)** | Broker lo usa para argumentar frente a dueño/inversionista. Con disclaimer corto. |
| **ACM inline en sheet, no página dedicada** | El 90% de casos se resuelve viendo el sheet. Página dedicada + PDF son v2 si algún broker lo pide. |
| **Lectura semanal = dashboard, no newsletter** | Uso real del broker es consulta interna, no compartir con cliente. Ahorra 2.5 semanas de build. |
| **Dashboard mercado = link a páginas existentes** | `/mercado/equipetrol` ya tiene más data que cualquier dashboard custom (KPIs, tipologías, zonas, históricos, yield). Cero build. Ahorra ~0.5 semana. Rev-alimenta también el backlog "dashboard custom sin marca Simon" si aparece esa demanda. |
| **`/ventas` público sigue intacto** | Es el lead magnet. No se oculta captador ahí. Lo que cambia es el link compartido `/b/[hash]`. |
| **Link compartido oculta marca Simon** | Paleta y diseño se mantienen (son buenos), logo y links desaparecen. El broker firma el link. |
| **5 shortlists activas en Básico, ilimitadas en Pro** | Pricing alineado con uso real. Auto-archivo a 90 días sin actividad. |
| **Branding custom del broker = v2 premium** | Logo/colores custom por broker no entra en MVP. Por ahora solo nombre + teléfono visible. |
| **Alquileres = Fase 2 (extensión natural)** | MVP cubre venta. Extender a alquiler es 3-5 días post-MVP reutilizando el sistema de favoritos, `CompareSheet` y mini estudio de mercado ya existentes en `/alquileres`. **No se construye ACM de alquiler** — innecesario. Dejar preparado en MVP: columna `tipo_operacion` en items + layout con tabs. |

---

## 8. Qué NO entra al MVP

Ver [BACKLOG.md](BACKLOG.md) para la lista completa con rationale.

Highlights de lo parqueado:
- PDF export del ACM
- Toggles per-propiedad en link compartido (qué mostrar/ocultar al cliente)
- Open Graph dinámico (imagen preview en WhatsApp)
- Editor de lectura semanal compartible
- Proyección de apreciación histórica
- Yield a nivel edificio individual
- Tracking analytics del link compartido
- Dominio custom del broker (CNAME)

---

## 9. Métricas de éxito

### S3 — lanzamiento a 3 founders
- 3 brokers activan al menos 1 shortlist cada uno
- Al menos 1 link `/b/[hash]` abierto por un cliente real
- Cero errores críticos en producción durante 7 días

### 30 días post-lanzamiento
- 10+ founders activos (slug en uso)
- Mediana de 3+ shortlists por broker activo
- 20+ links abiertos por clientes
- 1+ testimonial cualitativo de broker

### 90 días — criterio de continuidad
- 15+ brokers pagantes (conversión desde founding gratuito)
- NPS ≥ 40 en encuesta broker
- Si se cumple → se avanza con features del backlog v2
- Si no → revisar qué no está funcionando antes de sumar scope

---

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Yield mal calculado expone al broker frente a cliente** | Revisión metodológica SICI antes de activar. Disclaimer visible. Si cohort < 5 alquileres, no se muestra. |
| **Link compartido indexado por Google accidentalmente** | `robots.txt` + meta `noindex` + URL con hash no guessable. Testear con Search Console. |
| **Broker espera features que están en BACKLOG** | Lista visible de "qué entra ahora / qué viene después" comunicada al Founding Program. |
| **Scope creep durante build** | **Regla firme:** toda idea nueva va al BACKLOG con una línea de rationale. Cero litigio en el momento. Revisión conjunta al final del MVP. |
| **Slug enumerado por tercero que crea shortlists fake** | Riesgo aceptado en fase founding. Se mitiga con auth real cuando crezca la base. |
| **Absorción de mercado inestable (v3 con 9 días de data)** | Se presenta con disclaimer explícito "rotación observada ≠ ventas". No se publica hasta tener ≥60 días. |

---

## 11. Referencias

- Consulta metodológica SICI → `estrategia/personas/_referencias/consulta-sici-metodologia-data-2026-04-22.md` (repo externo Simon marketing)
- Filtros de calidad mercado → `docs/reports/FILTROS_CALIDAD_MERCADO.md`
- Zonas Equipetrol → `docs/canonical/ZONAS_EQUIPETROL.md`
- Límites data fiduciaria → `docs/canonical/LIMITES_DATA_FIDUCIARIA.md`
- Absorción limitaciones → `docs/canonical/ABSORCION_LIMITACIONES.md`
- Refactor ventas (completado) → `docs/refactor/VENTAS_SIMPLIFICADO.md`
