# PRD: Agente/Skill "Análisis de Mercado para Desarrolladoras"

> Status: Idea/Backlog — Autor: Lucho + Claude | Fecha: 2026-04-18

---

## 1. Contexto

SICI captura data del mercado inmobiliario Equipetrol (deptos venta/alquiler + casas/terrenos Fase 1-2). Con esa data + las relaciones entre proyectos master + zonas + absorción, un usuario puede hacerle preguntas a Claude tipo "¿qué oportunidades de desarrollo hay en Equipetrol?" y obtener respuestas fundamentadas.

Durante la sesión del 18 Abr 2026 probamos este flujo ad-hoc con queries manuales. Los hallazgos revelaron:
- La data existente responde bien preguntas sobre precios, inventario, absorción
- **Pero falta capa crítica del lado del desarrollador** (costos construcción, normativas, tiempos de licencia, ROI ajustado por tiempo real)
- El análisis requirió múltiples iteraciones porque Claude tuvo que aprender el negocio de desarrollo en vivo (márgenes por tipología, por qué ticket alto ≠ oportunidad, cronograma real 30-42 meses)

## 2. Objetivo

**Construir un agente SICI o skill especializado** que haga análisis de mercado para desarrolladoras de manera sistemática, cruzando:

- **Data propia SICI**: inventario, precios, absorción, proyectos_master, zonas
- **Data del lado desarrollador** (a incorporar): costos construcción, normativas municipales, tiempos trámites, benchmarks ROI
- **Contexto del usuario**: capital disponible, perfil riesgo, horizonte temporal, tipo de producto

Output esperado: análisis fiduciario con alternativas concretas de desarrollo, no solo data bruta.

## 3. Lo que ya se puede responder HOY (con SICI actual)

| Pregunta | Data disponible | Fuente |
|---|---|---|
| ¿Qué terrenos/casas para demolición hay en Equipetrol? | Sí | `propiedades_v2` casas/terrenos |
| ¿Cuál es el precio $/m² normalizado por zona y tipología? | Sí | `precio_normalizado()` + `v_mercado_venta` |
| ¿Cuántos proyectos activos compiten por zona? | Sí | `proyectos_master` + GPS haversine |
| ¿Cuál es la absorción por tipología (1/2/3 dorms)? | Sí | `market_absorption_snapshots` v3 |
| ¿Qué precios logran los proyectos en preventa vs entrega? | Sí | `estado_construccion` + filter |
| ¿Qué ticket promedio absorbe cada zona? | Sí | Snapshot por zona/dorms |
| ¿Qué competidor es agresivo en volumen? | Sí | Proyectos con 10+ unidades activas |

## 4. Data FALTANTE (a incorporar)

### 4.1 Costos de construcción

- [ ] Tabla `costos_construccion` con benchmarks por tipo de edificación
  - Edificio residencial estándar: $400-500/m² construido
  - Edificio residencial premium: $600-800/m²
  - Casa unifamiliar: $350-500/m²
  - Torre gama alta con amenidades completas: $800-1.200/m²
- [ ] Desglose: obra gruesa, acabados, instalaciones, amenidades, licencias
- [ ] Ajuste por inflación/USD (actualización semestral)

### 4.2 Normativas municipales (GAM Santa Cruz)

- [ ] Tabla `normativas_urbanismo` por zona/UV/distrito
  - Altura máxima permitida (pisos)
  - Retiro frontal obligatorio
  - Retiro lateral y posterior
  - Coeficiente de ocupación de suelo (COS)
  - Coeficiente de aprovechamiento (CA) → m² construibles por m² de lote
  - Zonificación permitida (residencial/comercial/mixto)
- [ ] Source: PLOT Santa Cruz, Honorable Alcaldía, Secretaría de Obras Públicas
- [ ] Ejemplos para Equipetrol:
  - Eq. Centro: alto (hasta 20+ pisos), mixto
  - Sirari: medio-alto (12-15 pisos), residencial
  - Villa Brígida: medio (6-8 pisos), residencial/mixto
  - Eq. Oeste: medio, residencial

### 4.3 Tiempos y costos de trámites

- [ ] Tiempo promedio licencia de construcción por zona: 3-12 meses
- [ ] Costos licencias municipales: ~2-3% del valor de obra
- [ ] Impuestos transferencia (compra terreno): 3% del precio
- [ ] ITPV (Impuesto Transferencia Patrimonial Vecino): variable

### 4.4 Benchmarks de ROI de desarrollo real

- [ ] Base de datos de proyectos completados: terreno comprado → precio venta final
- [ ] Márgenes típicos: edificio chico 15-25%, mediano 25-35%, grande 30-45%
- [ ] Factores de éxito/fracaso observados

### 4.5 Inventario de constructoras y arquitectos

- [ ] Tabla `constructoras_master` con track record
- [ ] Precio de construcción promedio por constructora
- [ ] Tiempo promedio por proyecto

## 5. Casos de uso del agente

### Caso 1: "Tengo $1.5M USD, ¿qué puedo hacer en Equipetrol?"

Output esperado:
- 3-5 alternativas concretas (IDs específicos de propiedades o lotes)
- Math de ROI ajustado por tiempo real
- Comparativa: desarrollar vs preventa-flip vs buy-and-hold
- Riesgos específicos de cada alternativa
- Próximos pasos (visita física, due diligence, cotizaciones)

### Caso 2: "Quiero entrar con $400K, ¿alquiler o preventa?"

Output esperado:
- Tickets factibles en cada zona
- Yield de alquiler estimado (5-8%)
- Preventa temprana con upside (15-30%)
- Tax implications
- Liquidez relativa

### Caso 3: "¿Cuánto puedo construir en este terreno específico?"

Input: GPS o ID de terreno SICI
Output:
- Normativa aplicable (altura, COS, CA)
- m² construibles máximos
- Mix óptimo de unidades sugerido según absorción de zona
- Precio venta estimado por tipología
- Ingresos totales proyectados
- Margen esperado

### Caso 4: "Comparame esta zona con otra"

Input: 2 zonas o 2 props
Output:
- Tabla comparativa absorción, precios, competencia
- Pros/contras de cada una
- Perfil de comprador target
- Time-to-sell esperado

## 6. Diseño técnico (opciones)

### Opción A — Skill Claude (producir-pieza style)

Un archivo `.skill/` que instruye a Claude a:
1. Cargar contexto: SICI data + normativas + costos
2. Hacer queries específicos según la pregunta
3. Armar respuesta estructurada con caveats

Pros: simple, reusa Claude Code sin infra adicional
Contras: depende de que usuario le hable a Claude

### Opción B — Subagent especializado

Definir en `.claude/agents/analista-desarrolladoras.md` un agente que:
- Tiene acceso a postgres-sici
- Tiene contexto pre-cargado de normativas y costos
- Sigue framework de análisis estandarizado

Pros: se invoca con subagent Task, respuesta más consistente
Contras: requiere mantener prompt del agente

### Opción C — Tool/API dentro de simon-mvp

Exponer como endpoint API + UI para desarrolladoras cliente:
- Input: presupuesto, zona de interés, perfil
- Output: dashboard interactivo con alternativas
- Monetización: servicio premium/consultoría

Pros: producto vendible, independiente de Claude
Contras: mucho trabajo frontend + backend

### Opción D — Informe automático mensual

Cron semanal/mensual que genera PDF "Oportunidades del mes":
- Ranking de propiedades/lotes
- Alertas de precios atípicos (bajo mediana zonal)
- Cambios de absorción relevantes
- Reporte por email a lista de desarrolladores cliente

Pros: producto recurrente, vinculado a `docs/backlog/ESTUDIOS_MERCADO_SAAS.md`
Contras: requiere equipo comercial para distribuir

**Recomendación**: empezar por A (skill) para validar demanda interna, escalar a D (informe recurrente) si el flujo tiene valor comercial.

## 7. Learnings capturados de la sesión 18 Abr 2026

Durante la exploración ad-hoc aprendimos:

### 7.1 Insights que el agente debe tener pre-cargados

- **Ticket alto + baja rotación ≠ oportunidad**: ej Sirari 3 dorms a $397K con 1.2 meses inventario parece ganga, pero ese segmento compra en proyectos grandes con amenidades premium. Desarrollador chico no compite.
- **Sweet spot del desarrollador mediano**: 1-2 dorms con ticket <$180K. Mercado elástico, muchos compradores, menos requisitos de amenidades.
- **Cronograma real de desarrollo**: 30-42 meses desde compra a entrega. El ROI anualizado REAL divide por ese tiempo, no por los 5-10 meses de venta.
- **Preventa reduce capital comprometido**: con cronograma de cobros, el capital máximo comprometido es ~50-60% del costo total.
- **TC paralelo vs oficial distorsiona precios**: usar `precio_normalizado()` SIEMPRE para comparaciones. Mostrar nominal solo para "cuánto USD billete".
- **3 estrategias distintas con perfiles distintos**:
  - Desarrollar: ROI 25-45% anual, riesgo alto, capital alto, 30m
  - Preventa + flip: 15-30% anual, riesgo medio, capital medio, 18-24m
  - Buy & hold + alquiler: 5-8% yield + 3-5% apreciación = 12-15%, riesgo bajo

### 7.2 Patrones de datos sucios en BD

- GPS falso de portal: un terreno listado en Cotoca aparece con GPS dentro de Equipetrol
- Remax mezcla tipologías: un depto puede estar categorizado como "terreno" en el portal
- Solución actual: doble validación GPS polígono + regex whitelist descripción (ver `n8n/workflows/casas_terrenos/enrichment_casas_terrenos_v1.0.0.json` Merge Ligero v1.1)

### 7.3 Preguntas clave a hacerle siempre al usuario

Antes de analizar, el agente debe preguntar:
- ¿Capital disponible?
- ¿Horizonte temporal? (< 2 años / 2-5 años / largo plazo)
- ¿Tenés equipo constructor/arquitecto propio?
- ¿Tolerancia a riesgo? (conservador/moderado/agresivo)
- ¿Primer desarrollo o tenés track record?
- ¿Objetivo? (ROI máximo / flujo de caja / diversificación patrimonial)

Sin esta info, el "mejor" depende y las recomendaciones son genéricas.

## 8. Roadmap sugerido

### Fase 1 — Validar con skill interno
- [ ] Crear skill `analizar-mercado-desarrolladoras.md` basado en learnings
- [ ] Testear con 3-5 preguntas tipo de usuarios reales
- [ ] Refinar framework de respuesta

### Fase 2 — Incorporar normativas básicas
- [ ] Investigar y documentar COS/CA Equipetrol (6 zonas)
- [ ] Tabla `normativas_urbanismo` en BD
- [ ] Agregar costos construcción baseline

### Fase 3 — Producto consultivo
- [ ] Ofrecer análisis ad-hoc a 1-2 desarrolladoras piloto
- [ ] Cobrar $500-1500 por análisis profundo
- [ ] Iterar según feedback

### Fase 4 — SaaS/Dashboard
- [ ] Endpoint API con los análisis
- [ ] UI para desarrolladoras (simon-mvp o repo propio)
- [ ] Modelo de suscripción mensual

## 9. Referencias cruzadas

- **Data casas/terrenos Fase 1-2**: `docs/backlog/CASAS_TERRENOS_PRD.md`
- **Estudios de mercado SaaS** (roadmap general producto recurrente): `docs/backlog/ESTUDIOS_MERCADO_SAAS.md`
- **Absorción canonical**: `docs/canonical/ABSORCION_LIMITACIONES.md`
- **Sistema TC y precio normalizado**: `docs/architecture/TIPO_CAMBIO_SICI.md`
- **Zonas y polígonos**: `docs/canonical/ZONAS_EQUIPETROL.md`

## 10. Decisión abierta

¿Agente interno (herramienta para Lucho) o producto comercial (servicio a desarrolladoras)? Las dos son posibles con el mismo stack, cambia solo la UX final y la monetización.

---

*Documento vivo. Actualizar conforme evolucione la idea.*
