# Simon Broker — Backlog

Ideas, features y mejoras parqueadas para después del MVP.

**Regla:** cada entrada tiene una línea de rationale de por qué no entra ahora. Nada se borra — incluso ideas descartadas quedan con la razón por la que no se hacen.

**Formato:**
```
### Nombre de la idea
**Tier:** v2 | v2-premium | descartada | esperando-señal
**Agregado:** fecha
**Rationale:** por qué no ahora
**Cuándo reactivar:** señal que dispararía revisión
```

---

## Fase 2 — Extensión natural (1-1.5 semanas post-MVP)

### Extender Simon Broker a alquileres
**Tier:** v1.1 — cola inmediata post-MVP
**Agregado:** 2026-04-22
**Rationale:** El MVP cubre venta. La extensión a alquiler se apoya en infraestructura que ya existe en `/alquileres`: sistema de favoritos (corazones), CompareSheet, mini estudio de mercado en sheet, similares. **No se construye ACM de alquiler** — en alquiler el usuario elige rápido (no es decisión de inversión), el mini estudio de mercado ya existente alcanza, y los corazones + CompareSheet son herramienta de curación natural.

**Qué cambia específicamente (sobre infra existente):**
- **Modo broker en sheet de `/alquileres`** (mismo patrón que `/ventas`):
  - Quita "preguntas al broker"
  - Quita gate "ver anuncio original"
  - Agrega botón ⭐ (agrega a shortlist)
  - **Sin ACM construido** — mantiene el mini estudio de mercado que ya existe
- **Link compartido `/b/[hash]` soporta items de alquiler:**
  - Render según `tipo_operacion` de cada item
  - Cliente puede dar corazones dentro del link (reutiliza sistema de favoritos existente, scoped al hash)
  - Cliente puede abrir `CompareSheet` con 2+ favoritos (reutiliza componente existente)
- **Feedback del cliente al broker:**
  - Tabla nueva `broker_shortlist_hearts` registra qué propiedades marcó el cliente (por hash + `propiedad_id`)
  - El broker entra a su shortlist y ve *"cliente marcó corazón en 3 de 7 propiedades"*
  - Da contexto para decidir cuándo llamar/escribir
- **Tabs "Ventas / Alquileres"** en `/broker/[slug]`
- Shortlist acepta items mixtos (columna `tipo_operacion` en `broker_shortlist_items` desde día uno)

**Lo que NO se construye:**
- RPC `buscar_acm_alquiler` (descartado — innecesario)
- Página ACM dedicada de alquiler (descartado)
- PDF ACM alquiler (descartado)

**Preparar en MVP (cero costo, blinda Fase 2):**
- Columna `tipo_operacion` en `broker_shortlist_items` desde migración inicial
- Página `/broker/[slug]` con layout preparado para tabs

**Cuándo reactivar:** inmediatamente después de S3 del MVP ventas. Plan de 3-5 días:
- Día 1: Modo broker en sheet de `/alquileres` + botón ⭐
- Día 2: Link compartido `/b/[hash]` renderiza items de alquiler + favoritos/CompareSheet embebidos
- Día 3: Tabla `broker_shortlist_hearts` + feedback visible en panel del broker
- Día 4-5: Tabs venta/alquiler en `/broker/[slug]` + polish + testing

---

## Features producto

### PDF export del ACM
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** El 90% de casos se resuelve con ACM inline en el sheet. PDF agrega 2 semanas de build (template nuevo + `lib/informe/` extendido) sin validación de que los brokers lo quieran.
**Cuándo reactivar:** cuando 3+ brokers lo pidan explícito en feedback post-MVP.

### Toggles per-propiedad en link compartido
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Permitir al broker elegir qué datos del ACM aparecen en el link que manda al cliente (yield sí/no, histórico sí/no, etc). Es elegante pero complejo sin señal real. En MVP todos los links muestran el mismo set básico.
**Cuándo reactivar:** tras 2-3 semanas de uso real, cuando aparezca la pregunta "¿puedo ocultar X a clientes?".

### Open Graph dinámico para links compartidos
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Imagen preview custom en WhatsApp con collage de fotos + nombre del broker. Técnicamente propenso a romperse (cache, fuentes, timeouts). WhatsApp funciona OK sin preview custom.
**Cuándo reactivar:** cuando el producto esté estable y haya que pulir la presentación de share.

### Dashboard de mercado custom sin marca Simon
**Tier:** esperando-señal
**Agregado:** 2026-04-22
**Rationale:** El MVP resuelve "visión del mercado para el broker" reutilizando las páginas públicas `/mercado/equipetrol` existentes (hub + ventas + alquileres). Son más completas de lo que hubiera construido. El trade-off es que muestran branding Simon — aceptable para uso interno del broker.
**Cuándo reactivar:** si aparece demanda real de brokers que quieren compartir un dashboard de mercado con sus clientes bajo su propia marca (sin Simon visible). Entonces evaluar dashboard custom en `/broker/[slug]/mercado`.

### Editor de lectura semanal compartible
**Tier:** descartada (re-frame)
**Agregado:** 2026-04-22
**Rationale:** Originalmente era newsletter editorial que el broker edita y comparte al cliente. Se re-definió: la lectura semanal del broker es **uso interno** (dashboard de mercado `/broker/[slug]/mercado`). No se publica ni se comparte.
**Cuándo reactivar:** si aparece demanda explícita de brokers que quieren compartir contenido editorial con clientes. En ese caso evaluar si Simon provee el contenido o solo el canal.

### Branding custom del broker (logo, colores)
**Tier:** v2-premium
**Agregado:** 2026-04-22
**Rationale:** Permitir que el broker suba su logo y elija 1-2 colores para su link compartido. Buen hook de tier premium pero innecesario para validar valor en MVP.
**Cuándo reactivar:** al definir pricing tiers definitivos post-MVP.

### Dominio custom del broker vía CNAME
**Tier:** v2-premium
**Agregado:** 2026-04-22
**Rationale:** `selection.martinsilva.com` en lugar de `simonbo.com/b/[hash]`. Alta complejidad técnica (SSL wildcard, DNS, verificación). Gran gancho premium pero lejano.
**Cuándo reactivar:** cuando haya ≥20 brokers pagantes y al menos 3 hayan pedido custom domain.

### Tracking analytics del link compartido
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Dashboard del broker mostrando "link X visto N veces, propiedad Y fue la más clickeada". Útil pero no bloquea la venta. Se puede reemplazar por GA4 events mientras tanto.
**Cuándo reactivar:** post-MVP, cuando los brokers pregunten "¿cómo sé si el cliente abrió el link?".

### Comparación lado a lado (tabla de N propiedades)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Mostrar 3-5 propiedades en tabla comparativa (precio, m², dorm, yield, etc.). Es valor real pero el shortlist ya cumple función similar. Priorizar feedback real.
**Cuándo reactivar:** si los brokers piden comparar visualmente propiedades al armar shortlist.

### Exportables para co-brokering
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** PDFs pensados para compartir con otros brokers (no clientes). Requiere formato distinto al link público (más técnico, incluye comisión, etc.). Out of scope para MVP solo-broker.
**Cuándo reactivar:** cuando Simon tenga red de brokers que co-broquean y haya demanda de formato formal.

### Alertas de nuevas propiedades matching criterios de cliente
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** "Avisame cuando aparezca un 3 dorm en Equipetrol Centro bajo $180k" → notificación al broker. Extremadamente útil pero requiere infra de notificaciones + gestión de criterios guardados.
**Cuándo reactivar:** tras MVP, cuando los brokers pidan "¿cómo me entero de listings nuevos?".

---

## Bugs / deuda técnica detectada

### Detector TC sobre-atribuye 'oficial' cuando listing solo dice "USD"
**Tier:** bug — investigar post-MVP
**Agregado:** 2026-04-22
**Rationale:** Props como Sky Level 1584 tienen descripción que solo dice "USD 141,000.00" sin calificar oficial/paralelo. El detector (regex + LLM upgrade merge v2.5.0) las marca como `tipo_cambio_detectado = 'oficial'` cuando deberían quedar `'no_especificado'`. Consecuencia: escapan al badge "Confirmar TC" aunque su precio esté claramente debajo de mediana.
**Impacto estimado:** probablemente decenas de props en el feed. Requiere auditoría del detector + posible ajuste del prompt LLM.
**Workaround:** fix manual por propiedad con UPDATE + `campos_bloqueados`. Ver sesión 2026-04-22.
**Cuándo reactivar:** post-MVP broker, como sub-proyecto de calidad de datos.

### tc_sospechoso no dispara en cohorts chicos (<3 props declaradas)
**Tier:** edge case — aceptado para MVP
**Agregado:** 2026-04-22
**Rationale:** El criterio tc_sospechoso requiere `HAVING COUNT(*) >= 3` en el grupo de referencia (zona + dorms + estado, solo TC declarado). Cuando el cohort es muy chico, la mediana queda NULL y el badge no dispara aunque la prop esté claramente debajo del mercado.

Caso concreto: Sky Level 1584 en Eq. Centro 2-dorm preventa. Al forzar manualmente su TC a 'no_especificado' (fix del detector), el grupo quedó con solo 2 props declaradas → no dispara.

**Opciones futuras:**
- B) Bajar HAVING a ≥2 — pragmatico, reduce rigor estadístico
- C) Fallback a cohort más amplio (solo zona+dorms, o solo zona) si el específico es <3
- D) Override manual por prop — nueva columna `tc_confirmar_override` (nullable) que fuerza/suprime el badge

**Cuándo reactivar:** si aparecen más casos edge en feedback de brokers del Founding Program. Evaluar opción C como más robusta.

## Features data / metodología

### Yield a nivel edificio individual
**Tier:** descartada (cobertura insuficiente)
**Agregado:** 2026-04-22
**Rationale:** Solo 6.7% de las props venta tienen ≥3 alquileres comparables en el mismo edificio. 77.5% no tienen ninguno. Yield a nivel unidad es matemáticamente engañoso.
**Cuándo reactivar:** solo si crece dramáticamente la cobertura de alquileres por edificio. Improbable.

### Proyección / tendencia de apreciación
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** 4 meses de tracking no sostienen una tendencia estadística defendible. Prometer apreciación con este horizonte es arriesgado.
**Cuándo reactivar:** cuando haya ≥12 meses de histórico limpio (aprox. diciembre 2026). Revisar metodología con SICI.

### Absorción como serie temporal presentable
**Tier:** esperando-señal
**Agregado:** 2026-04-22
**Rationale:** Serie v3 limpia tiene 9 días (22 Abr 2026). Necesita ≥90 días para ser estable. Antes del 14 Jul 2026, solo se presenta como snapshot mensual con disclaimer.
**Cuándo reactivar:** 14 Jul 2026. Revisar calidad de v3 con SICI.

### Real estate mercado secundario (portales adicionales)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** Expandir más allá de C21 + Remax para cobertura más amplia. Requiere nuevos extractores + lógica de merge.
**Cuándo reactivar:** cuando el producto broker tenga tracción y necesite escalar cobertura.

---

## Roadmap de data externa

### Derechos Reales — precios reales de cierre
**Tier:** P1 (gestión institucional paralela)
**Agregado:** 2026-04-22
**Rationale:** Única forma de validar absorción real vs aparente y habilitar apreciación + yield reales. Acceso institucional complejo, sin API pública.
**Cuándo reactivar:** arrancar trámite en paralelo al build del MVP. Tiempo estimado 6-12 meses hasta tener data.

### Red de brokers-sensor
**Tier:** P2 (post-MVP inmediato)
**Agregado:** 2026-04-22
**Rationale:** Los brokers del Founding Program reportan "se vendió / se retiró" → convierte absorción aparente en señal de venta real. Requiere feature broker-sensor no incluida en MVP.
**Cuándo reactivar:** a partir de la semana 4 post-MVP, cuando haya founders activos.

### Acuerdos con desarrolladoras — inventario no publicado
**Tier:** P4 (post product-market-fit)
**Agregado:** 2026-04-22
**Rationale:** Sales cycle con cada desarrolladora, zero leverage si Simon no tiene red grande de brokers. Valor alto para preventa pero no es SaaS, es hand-crafted.
**Cuándo reactivar:** cuando haya ≥50 brokers activos.

### Catastro SC — uso de suelo + licencias
**Tier:** P5 (para Simon Advisor futuro)
**Agregado:** 2026-04-22
**Rationale:** Data dispersa, acceso complicado. Más útil para inversionistas/desarrolladores que para brokers.
**Cuándo reactivar:** cuando se inicie build de Simon Advisor.

### GA4 + CRM broker como señal de interés
**Tier:** v2 (quick win)
**Agregado:** 2026-04-22
**Rationale:** "Unidad con 40 views vs 3 views = precio bien/mal puesto" → indicador barato. Ya tenemos GA4.
**Cuándo reactivar:** post-MVP, sumar al dashboard de mercado como indicador de atención.

---

## Infra / arquitectura

### Login y auth reales (email/password o magic link)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** MVP usa slug en URL. Auth se agrega cuando la base crezca o haya datos sensibles.
**Cuándo reactivar:** cuando ≥15 brokers activos o aparezca data sensible (información de clientes, comisiones, etc.).

### RLS estricto en tablas broker
**Tier:** v2 (con login)
**Agregado:** 2026-04-22
**Rationale:** MVP tiene tablas `broker_shortlists` con escritura abierta. En fase founding con 15-25 brokers conocidos, riesgo aceptable.
**Cuándo reactivar:** junto con login real.

### Onboarding self-serve (formulario público de alta)
**Tier:** v2
**Agregado:** 2026-04-22
**Rationale:** MVP crea slugs manualmente. Cuando la base quiera crecer más allá del Founding Program, hace falta landing `/broker/signup`.
**Cuándo reactivar:** post-MVP, tras validar product-market-fit.

---

## Ideas sueltas sin clasificar

*(Zona libre para ideas que aparecen en conversación y todavía no se piensan. Se clasifican en la próxima revisión del backlog.)*

- **Integración WhatsApp Business API** — notificaciones y leads del link compartido entrando a un número único.
- **Simon Agent para desarrolladoras** — skill/agente separado que cruza SICI + normativas + costos construcción (ver `docs/backlog/AGENTE_DESARROLLADORAS_PRD.md`).
- **Feed privado del broker con propiedades exclusivas** — el broker sube listings que solo aparecen en su slug (no en `/ventas` público).
- **"Mi opinión" del broker por propiedad** — nota persistente visible solo al broker ("cliente Juan la vio, no le gustó la orientación").
- **Sincronización bidireccional con Intramax/CRM broker** — tomar captaciones propias del broker en lugar de solo C21/Remax.
