# ¿El producto es Simón o el motor de datos? — Análisis de viabilidad

**Fecha:** 3 de agosto de 2026
**Tipo:** análisis estratégico (snapshot — los números son de esta fecha, sacados de la BD en vivo)
**Disparador:** una reflexión externa que plantea que el activo real de SICI no es el portal (Simón) sino el motor que convierte datos inmobiliarios caóticos en datos confiables y comparables.

---

## 1. El diagnóstico del texto: qué es cierto y qué hay que matizar

### Lo que es cierto (verificable en el repo y la BD)

La tesis central es correcta: **lo que se construyó acá no es un scraper, es infraestructura de datos**. La lista de problemas resueltos no es aspiracional — cada uno tiene código, migración o auditoría concreta:

| Problema | Solución que existe HOY |
|---|---|
| Tipos de cambio inconsistentes | Régimen TC completo: detección paralelo/oficial, `precio_normalizado()`, unificación TC-nuevo, serie reexpresada con error de método declarado (~7%) |
| Precios escondidos en texto | Extractor regex + LLM (Haiku) + reglas de arbitraje ($/m² coherente) + detector de outliers (BOB÷6,96 guardado como USD) |
| Duplicados | Dedup por URL + `duplicado_de` + detector apart-hotel + `dup-checks.mjs` |
| GPS incorrectos | 446 de 447 proyectos master con GPS verificado (99,8%) + polígonos PostGIS de zonas + trigger de asignación automática |
| Publicaciones recicladas / bajas fantasma | Verificador nocturno HTTP (aprendió que C21 devuelve 200 con `?json=true` aunque el aviso esté muerto) |
| Matching aviso→edificio | 87% en venta (829/955), 81% en alquiler (346/428) contra catálogo de 447 edificios + 45 condominios, con alias, desempate por zona y juez LLM para los dudosos |
| Estado de obra desactualizado | Inferencia por vecinos del edificio (96,7% acierto) + señal "hay alquiler activo" (95%) — calculada al leer, se corrige sola |
| Calidad sostenida en el tiempo | 5 routines nocturnas + 2 auditorías con juez LLM + versionado de series + memoria de decisiones (alias, descartes, rechazos con TTL) |

Eso último es lo que el texto llama "cientos de reglas, excepciones y aprendizaje acumulado" — y es verdad que **no se compra ni se replica con un modelo de IA genérico**. El corpus de casos raros (el TC paralelo boliviano, "Portofino IV vs V", el homónimo "Brickell 8", los avisos multiproyecto, el nombre de edificio en unicode decorativo) es conocimiento local acumulado noche a noche.

### Lo que hay que matizar (los tres "peros" honestos)

**1. La escala hoy es chica y local.** "Datos confiables a gran escala" todavía no: el inventario confiable (shadow, régimen nuevo) son **~1.220 propiedades activas en 2 macrozonas de Santa Cruz** (Equipetrol + Zona Norte). Prod acumula 3.695 filas históricas. El moat es real pero es un moat *profundo y angosto*: máxima calidad en un territorio acotado. Idealista no tardaría "meses" en igualar la calidad — tardaría meses **por zona**, y ese es justamente el punto: el costo de réplica escala con el territorio, igual que el nuestro.

**2. El motor todavía no es una máquina, es un método.** El híbrido corre en sesiones de Claude sobre la máquina del founder, con skills, subagentes-lectores y revisión matutina humana. El costo marginal es bajísimo ($0 bajo Max), pero **no es hoy un producto vendible como "Data Engine as a Service"**: no hay API pública, no hay SLA, y la operación depende de una persona. La visión de la Plataforma Híbrida Genérica (`docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md`) va en esa dirección, pero es visión, no producto.

**3. La historia limpia es corta.** La serie de precios del régimen nuevo arrancó el **21 de julio de 2026** (y con un corte metodológico el 3 de agosto). La serie vieja tiene 6 meses con bugs conocidos y sesgo de composición. Los productos de datos que más pagan (índices, valuación, riesgo bancario) se venden sobre **años** de serie, no semanas. El activo "historia" se está acumulando bien, pero el que ya existe es la *capacidad de generarla*, no la serie larga en sí.

---

## 2. El dato que ordena toda la discusión

La métrica elegida del negocio es contactos de WhatsApp por semana (`wa_clicks`). Desde que se mide con datos limpios (28-jul): **2 clics reales**.

Esto no es un fracaso — el producto B2C casi no tiene tráfico pagado todavía y el marketing recién arranca. Pero sí ordena las prioridades: **la demanda B2C aún no está probada, mientras que la demanda B2B por la DATA ya tiene una señal real** — Condado pagó USD 250 por un estudio de mercado (cobro pendiente, pero la disposición a pagar existió), y el framework `scripts/estudio-mercado/` + `docs/backlog/ESTUDIOS_MERCADO_SAAS.md` ya existen.

Traducción: hoy hay más evidencia de que alguien paga por *el análisis que sale del motor* que por *el buscador que se apoya en el motor*.

---

## 3. ¿Qué se puede monetizar siendo fiduciario? La regla que resuelve la tensión

El miedo implícito: "si monetizo, ¿pierdo lo fiduciario?" La respuesta es que depende de **quién paga y por qué**:

> **Regla de oro: cobrar siempre del lado de quien CONSUME la verdad, nunca del lado de quien querría torcerla.**

- ❌ **Rompe el moat:** cobrar a anunciantes por destaque, posiciones, "recomendados", leads premium. Es el modelo portal — en el momento en que el orden del feed se vende, la palabra "fiduciario" deja de ser cierta y no se recupera.
- ✅ **Refuerza el moat:** cobrar a quien necesita que el dato sea verdad — compradores, inversores, desarrolladoras, bancos, tasadores, y brokers que quieren *servir mejor* (no aparecer más arriba). Para ellos, cuanto más insobornable el dato, más vale. La monetización y lo fiduciario apuntan al mismo lado.

Hay un matiz regulatorio/ético que ya está en las reglas del sistema: **vender datos e informes sí; vender recomendaciones de inversión personalizadas no**. "El m² en Sirari se movió X% en Bs y el yield bruto observado es Y%" es data fiduciaria. "Comprá en tal edificio" no lo es (ver `docs/canonical/LIMITES_DATA_FIDUCIARIA.md`).

---

## 4. Las opciones de monetización, rankeadas por viabilidad real

### Corto plazo (0–6 meses) — ya casi construido

**A. Informes de mercado para desarrolladoras y constructoras** ⭐ el más viable
- **Qué es:** el estudio tipo Condado, productizado. "¿A cuánto salgo en preventa? ¿Qué absorbe la zona? ¿Contra qué compito edificio por edificio?"
- **Por qué es viable:** el framework existe, hubo un cliente real, y el comprador (desarrolladora que va a enterrar millones en un terreno) paga cientos o miles de USD por reducir incertidumbre. Es el único cliente en Bolivia con presupuesto probado para data inmobiliaria.
- **Por qué es fiduciario:** la desarrolladora paga por la verdad del mercado, no por aparecer en el feed. Cero conflicto.
- **Riesgo:** es servicio, no producto — escala con horas del founder. Mitigación: el motor ya hace el 80% del informe; el framework de `estudio-mercado/` es exactamente el intento de productizarlo.

**B. Simón Broker (B2B para captadores)**
- **Qué es:** ya existe el MVP (shortlists, CMA, fotos, PDF, prospección). Cobrar suscripción al broker por herramientas que lo hacen ver profesional ante su cliente.
- **Matiz fiduciario:** cobrar por *herramientas* está bien; lo que nunca se vende es posición en el feed ni el chip "dentro del rango" (ese chip vale precisamente porque no se puede comprar).
- **Riesgo:** el broker boliviano promedio paga poco y tarde. Validar con 3-5 brokers pagando antes de construir más (la memoria `broker_monetization_idea` ya decía esto).

### Mediano plazo (6–18 meses) — necesita más serie y cobertura

**C. Índice de precios + reporte de mercado recurrente (suscripción)**
- **Qué es:** "El índice Simón del m² en Santa Cruz", mensual, en USD y Bs, con metodología publicada. Suscriptores: desarrolladoras, fondos, bancos, prensa (la prensa gratis — es marketing del índice).
- **Por qué encaja:** es la versión recurrente del producto A. En un país sin INE inmobiliario confiable ni MLS, ser *la* referencia de precios es una posición que se toma una vez y cuesta muchísimo disputar. El TC dual hace que nadie más pueda calcularlo bien — esa complejidad que fue un parto es acá una barrera de entrada.
- **Qué falta:** 12+ meses de serie limpia del régimen nuevo (se cumple ~julio 2027; la serie reexpresada puede adelantar la narrativa con su ~7% de error declarado) y al menos 3-4 macrozonas.

**D. API de datos / data feed**
- **Qué es:** el "Data Engine" del diagrama, vendido como API a bancos (garantías hipotecarias), aseguradoras, proptechs.
- **Veredicto: todavía no.** El comprador institucional boliviano es lento, exige cobertura nacional y años de historia. Es el destino correcto a 2-3 años, no el próximo paso. Construir la API hoy sería construir para un cliente que aún no existe.

### Largo plazo / opcional

**E. Valuador automático (AVM):** necesita C funcionando + más transacciones observadas. El estado de obra inferido y el matching a edificio son exactamente los insumos de un AVM — el camino natural existe, pero después del índice.
**F. Radar de oportunidades para inversores:** vendible como *alertas de datos* ("apareció un 2D un 20% bajo la mediana de su edificio") sin cruzar a consejo de inversión. Buen upsell del índice, no un producto inicial.

---

## 5. Entonces, ¿el producto es el motor o es Simón?

**Los dos, en capas — y la reflexión externa acierta en la jerarquía pero se equivoca si implica pivotear.**

- **El motor es el activo.** Es lo difícil, lo acumulativo, lo que un entrante no puede comprar. Todo lo monetizable de la lista de arriba (A, B, C, D, E, F) son *ventanas de venta distintas sobre el mismo motor*.
- **Simón es la prueba viviente del motor y el generador del moat futuro.** El feed público hace tres cosas que el motor solo no hace: (1) demuestra la calidad en público (nadie compra un índice de una empresa sin vitrina), (2) genera la marca "el que no te miente" que después le pone precio al informe, y (3) produce señales de demanda (favoritos, búsquedas, wa_clicks) que ningún competidor tiene — datos del lado comprador, no solo del lado oferta.
- **La secuencia recomendada no es "construir la API"**, es: **A ahora** (informes — cobrar el de Condado, salir a vender 2-3 más con el mismo formato), **B en paralelo barato** (validar que 3 brokers paguen), **C cuando la serie madure** (el índice como producto recurrente), **D/E cuando C tenga tracción**. Cada paso financia el siguiente y ninguno compromete lo fiduciario.

**La frase para quedarse:** los portales venden *visibilidad* a la oferta; Simón puede vender *certeza* a la demanda. Son dos negocios distintos y el segundo es el único compatible con ser fiduciario — que es, al final, el moat.

---

## 6. Qué haría falta hacer (concreto, sin comprometer nada hoy)

1. **Cobrar lo de Condado** (USD 250 pendiente desde abril) — es literalmente el primer revenue del motor.
2. **Empaquetar el informe tipo A**: una plantilla de 10-15 páginas que el framework `estudio-mercado/` llene en un 80%, con precio de lista (referencia regional: USD 300-800 por estudio de zona). Venderlo a 2-3 desarrolladoras con obra en Equipetrol/ZN — el catálogo de 447 edificios ya dice cuáles son.
3. **Dejar que la serie shadow madure** sin tocarla (ya corre sola cada noche) — cada mes que pasa, el activo "historia limpia" se aprecia solo.
4. **No construir API, AVM ni radar todavía.** Anotarlos como destino, no como backlog.
5. **Decisión explícita de NUNCA vender destaque en el feed** — conviene escribirla en `docs/canonical/` como principio, para que ninguna urgencia de caja futura la erosione en silencio.

---

*Números de este documento: BD en vivo al 3-ago-2026 (shadow: 1.383 props, 1.221 activas; matching venta 829/955, alquiler 346/428; 447 proyectos master, 446 con GPS; 45 condominios; serie prod 12-feb→27-jul, 6.446 filas; serie shadow 586 filas desde 21-jul; reexpresada ene→jul; wa_clicks limpios: 2). Son un snapshot para fechar el análisis, no cifras a mantener.*
