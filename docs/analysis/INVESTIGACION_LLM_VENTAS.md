# Investigación: LLM Enrichment para Ventas

> Fecha: 9 Mar 2026 | Rama: `feature/llm-enrichment-ventas`

---

## 1. Pipeline Actual de Ventas (Regex)

### Flujo end-to-end

```
1:00 AM  Discovery C21 + Remax → propiedades_v2 (datos_json_discovery, status='nueva')
2:00 AM  Enrichment Regex → datos_json_enrichment (C21 v16.5 / Remax v1.9)
3:00 AM  Merge v2.3.0 → columnas consolidadas (status='completado')
4:00 AM  Matching v3.1 → id_proyecto_master + nombre_edificio
6:00 AM  Verificador ausencias (Remax, LIMIT 200)
9:00 AM  Auditoría + Snapshots absorción
```

### Extractores actuales

| Extractor | Archivo | Líneas | Método principal |
|-----------|---------|--------|-----------------|
| C21 v16.5 | `n8n/extractores/extractor_century21.json` | ~2,431 | HTML regex + JSON-LD + fuzzy matching |
| Remax v1.9 | `n8n/extractores/extractor_remax.json` | ~1,468 | `data-page` JSON parsing + regex fallback |

### Campos que extrae el regex actual

| Campo | C21 | Remax | Notas |
|-------|-----|-------|-------|
| precio_usd | ✅ (5 patrones, prioridad meta → desc) | ✅ (JSON prices.amount) | Robusto en ambos |
| area_total_m2 | ✅ (meta MC → tabla → desc) | ✅ (JSON construction_area → desc) | Robusto |
| dormitorios | ✅ (6 patrones + monoambiente) | ✅ (JSON bedrooms → desc) | Robusto |
| banos | ✅ (meta → tabla → desc → inferencia) | ✅ (JSON → desc) | Inferencia dudosa |
| estacionamientos | ✅ (incluido/no_incluido/sin_confirmar) | ✅ (similar) | Casi siempre sin_confirmar |
| nombre_edificio | ✅ (URL slug → ubicación → desc → fuzzy) | ❌ Produce basura ("Venta", "De Dise") | **MAYOR DEBILIDAD REMAX** |
| estado_construccion | ✅ (patrones preventa/entrega/usado) | ✅ (similar) | Falla con "amoblado"→entrega |
| tipo_cambio_detectado | ✅ (paralelo/oficial/no_especificado) | ✅ (similar) | Funciona bien |
| amenities | ✅ (JSON-LD + 16 regex) | ✅ (desc regex) | Inventa (Pet Friendly, Sauna) |
| equipamiento | ✅ (12 patrones) | ✅ (similar) | OK para items explícitos |
| GPS | ✅ (JSON-LD structured data) | ✅ (data-page JSON) | Confiable |
| fotos_urls | ✅ (HTML parsing) | ✅ (multimedias array) | Confiable |
| agente | ✅ (meta tags) | ✅ (data-page agent) | Confiable |
| **parqueo_incluido** | ❌ (casi siempre sin_confirmar) | ❌ | **77% NULL en BD** |
| **plan_pagos** | ❌ (no extrae) | ❌ | **0% detección** |
| **piso** | ❌ (raro) | ❌ | **10% detección** |
| **baulera** | ❌ (no extrae) | ❌ | **0% detección** |
| **descripcion_limpia** | ❌ (no existe) | ❌ | Campo nuevo |
| **fecha_entrega_estimada** | ✅ (patrones fijos) | ✅ | Funciona para formatos estándar |

### Merge v2.3.0 — Prioridades

| Campo | Prioridad actual | Con LLM (propuesto) |
|-------|-----------------|---------------------|
| area, dormitorios, banos | Discovery > Enrichment | **Enrichment > Discovery** (LLM valida rangos) |
| precio_usd | Complejo (depende TC) | **Enrichment** si detectó moneda/TC |
| latitud/longitud | Discovery > Enrichment | **Sin cambio** (API GPS más preciso) |
| nombre_edificio | Discovery > Enrichment | **Enrichment** (LLM con contexto PM) |
| zona | PostGIS trigger | **Sin cambio** |

---

## 2. Pipeline de Alquileres (Referencia Arquitectónica)

### Patrón técnico (NO campos)

El pipeline de alquileres ya usa LLM enrichment con este patrón:

```
1. "Construir Prompt" (Code node)
   - Parsea HTML según fuente (C21=markdown, Remax=data-page, BI=HTML regex)
   - Extrae agente y fotos directamente (no depende del LLM)
   - Inyecta datos del discovery como contexto
   - Construye prompt con schema JSON esperado

2. "Anthropic Haiku" (HTTP Request)
   - POST https://api.anthropic.com/v1/messages
   - model: claude-haiku-4-5-20251001
   - temperature: 0, max_tokens: 1024
   - Headers: x-api-key, anthropic-version: 2023-06-01

3. "Parsear y Validar" (Code node)
   - Extrae JSON de response.content[0].text
   - Maneja ```json wrappers y raw JSON
   - Valida rangos por campo (precio, area, dorms, banos)
   - Merge agente: data-page directo > LLM
   - Si >2 errores → requiere_revision = true

4. "Registrar Enrichment" (SQL)
   - Llama registrar_enrichment_alquiler(p_id, p_datos_llm, ...)
   - Respeta campos_bloqueados
   - Guarda en datos_json_enrichment + columnas directas
   - Sets status = 'actualizado'
```

**Adaptaciones para ventas:**
- Campos completamente diferentes (precio_usd vs precio_mensual_bob, etc.)
- Inyectar `proyectos_master` de la zona en el prompt
- Validaciones de precio venta (5K-2M USD) vs alquiler (0-50K BOB)
- No escribir en propiedades_v2 durante tests

---

## 3. Análisis por Portal

### Century21

**Cómo llega la data:**
1. Discovery extrae via API REST de C21 (JSON estructurado: `recamaras`, `banosTxt`, `precioFormat`, etc.)
2. Enrichment scrape HTML con Firecrawl → markdown → regex C21 v16.5
3. datos_json_enrichment tiene ~75 keys

**Campos confiables:**
- `precio_usd`: robusto (5 patrones, prioridad meta tags)
- `area_total_m2`: robusto (meta "MC", "area", tabla HTML)
- `dormitorios`: robusto (6 patrones + monoambiente)
- `GPS`: confiable (JSON-LD structured data)
- `fotos_urls`: confiable (HTML parsing)
- `tipo_cambio_detectado`: bueno (patrones paralelo/oficial)

**Campos problemáticos:**
- `nombre_edificio`: ~50% correcto. Fuzzy matching ayuda pero threshold 60% acepta basura
- `estado_construccion`: falla con "amoblado" (asume entrega_inmediata)
- `amenities`: inventa Pet Friendly y Sauna sin evidencia
- `parqueo_incluido`: casi siempre `sin_confirmar`
- `plan_pagos`: no extrae en absoluto
- `equipamiento`: regex `/ac/i` matchea "acondicionado" pero también "acceso", "acerca"

**Patrones de error C21:**
1. `nombre_edificio = null` en 5/5 props de muestra (regex C21 falla en detectar nombre de descripción libre)
2. `estado_construccion = 'no_especificado'` cuando descripción dice "amoblado" o "a estrenar"
3. `amenities` incluye "Pet Friendly" sin mención explícita (inferido de "área social")
4. `parqueo_incluido = null` cuando descripción dice "incluye parqueo" o "parqueo: $14,000"

### Remax

**Cómo llega la data:**
1. Discovery extrae via scraping web Remax (HTML)
2. Enrichment parsea `data-page` JSON del HTML → extractor Remax v1.9
3. datos_json_enrichment tiene ~76 keys

**Campos confiables:**
- `precio_usd`: robusto (JSON `prices.amount` + `currency_id`)
- `area_total_m2`: robusto (JSON `construction_area`)
- `dormitorios`: robusto (JSON `bedrooms`)
- `GPS`: confiable (JSON data-page)
- `fotos_urls`: confiable (`multimedias` array)
- `agente`: confiable (data-page `agents[0]`)

**Campos problemáticos:**
- `nombre_edificio`: **73% basura en 15 props** ("Venta", "Pre Venta", "De Dise", "Equipetrol Mas Parqueo")
- `estado_construccion`: muchos `no_especificado`
- `parqueo_incluido`: casi siempre `null`
- `tipo_cambio_detectado`: ~60% `no_especificado`

**Patrones de error Remax:**
1. Regex toma el título de página Remax (eg. "DEPARTAMENTO EN VENTA") como nombre_edificio
2. `depende_de_tc = true` en TODAS las props (incluso las con precio USD real) — bug de discovery
3. Muchos campos `no_especificado` porque Remax data-page no tiene metadata semántica

### Bien Inmuebles

**No tiene pipeline de venta.** Solo alquileres (3ra fuente). No relevante para este proyecto.

---

## 4. Gaps en BD (367 props venta activas)

| Campo | NULL/vacío | % | Impacto |
|-------|-----------|---|---------|
| **parqueo_incluido** | 283 | **77%** | ALTO — dato clave para compradores |
| **tipo_cambio** (null o no_especificado) | 219 | **60%** | ALTO — afecta precio_normalizado |
| **nombre_edificio** (null) | 33 | 9% | MEDIO — matching ya compensa |
| **estado_construccion** (null) | 0 | 0% | OK — pero calidad dudosa |
| **id_proyecto_master** (null) | 8 | 2% | OK — matching rate 98% |
| plan_pagos_desarrollador | ~350 | ~95% | ALTO — casi nunca detectado |
| piso | ~330 | ~90% | MEDIO |
| baulera | ~360 | ~98% | BAJO |
| descuento_contado_pct | ~365 | ~99% | BAJO |

---

## 5. Muestra de 30 Propiedades para Testing

### Remax (15 props)

| ID | Zona | Proyecto | Dorms | Área | Precio USD | Estado | Parqueo |
|----|------|----------|-------|------|------------|--------|---------|
| 30 | Eq. Centro | Torre Oasis* | 1 | 31m² | $65,000 | entrega_inmediata | null |
| 35 | V. Brigida | Condominio Avanti | 2 | 73m² | $135,776 | entrega_inmediata | null |
| 43 | Eq. Oeste | Lofty Island | 2 | 86m² | $146,442 | preventa | false |
| 48 | Eq. Oeste | Lofty Island | 1 | 70m² | $112,257 | preventa | false |
| 59 | Eq. Oeste | Sky Eclipse | 2 | 95m² | $218,391 | entrega_inmediata | null |
| 101 | Eq. Centro | Atrium | 2 | 95m² | $184,540 | no_especificado | null |
| 418 | Sirari | SKY DESIGN | 2 | 149m² | $277,371 | entrega_inmediata | null |
| 465 | Eq. Centro | Sky Plaza Italia | 1 | 42m² | $89,128 | entrega_inmediata | null |
| 470 | Sirari | Las Dalias | 1 | 51m² | $102,803 | preventa | null |
| 519 | V. Brigida | Garden Equipetrol | 1 | 47m² | $99,673 | entrega_inmediata | null |
| 574 | Eq. Centro | Luxe Tower | 1 | 63m² | $132,300 | preventa | null |
| 621 | Sirari | Las Dalias | 2 | 75m² | $188,575 | preventa | null |
| 909 | Eq. Oeste | Alto Busch | 3 | 114m² | $112,031 | entrega_inmediata | null |
| 920 | Eq. Centro | Sky Level | 2 | 94m² | $179,626 | preventa | null |
| 1095 | Eq. Oeste | Sky Eclipse | 2 | 106m² | $223,391 | entrega_inmediata | null |

*ID 30: nombre_edificio dice "Torre Oasis" pero descripción dice "Sky Luxia" — error de matching conocido.

### Century21 (15 props)

| ID | Zona | Proyecto | Dorms | Área | Precio USD | Estado | Parqueo |
|----|------|----------|-------|------|------------|--------|---------|
| 183 | Eq. Centro | Sky Level | 2 | 89m² | $181,832 | preventa | null |
| 234 | Eq. Centro | Edificio MURURE | 0 | 38m² | $68,965 | nuevo_a_estrenar | null |
| 296 | Eq. Norte | Sky Moon | 1 | 66m² | $179,526 | entrega_inmediata | null |
| 370 | Eq. Centro | HH Once | 1 | 61m² | $112,462 | preventa | null |
| 450 | Eq. Centro | Edificio Ariaa | 2 | 160m² | $249,000 | no_especificado | true |
| 455 | Eq. Centro | HH Once | 1 | 37m² | $77,111 | preventa | null |
| 479 | Eq. Oeste | Sky Eclipse | 1 | 68m² | $110,000 | entrega_inmediata | null |
| 530 | Eq. Centro | Macororo 12 | 2 | 87m² | $140,000 | no_especificado | true |
| 559 | V. Brigida | Edificio PLATINUM | 1 | 64m² | $115,000 | entrega_inmediata | true |
| 569 | V. Brigida | STONE 2 | 1 | 54m² | $92,529 | nuevo_a_estrenar | null |
| 611 | V. Brigida | Condominio Cruz | 2 | 92m² | $115,460 | entrega_inmediata | false |
| 849 | Eq. Centro | Edificio Spazios | 3 | 165m² | $312,717 | nuevo_a_estrenar | null |
| 1006 | Sirari | Impera Tower | 2 | 75m² | $147,845 | no_especificado | true |
| 1009 | Sirari | Onix Art | 1 | 35m² | $109,195 | entrega_inmediata | null |
| 1049 | Sirari | null | null | 35m² | $72,069 | preventa | null |

### Descripción resumida de cada prop (para validar output LLM)

Ver sección 8 del documento para descripciones completas extraídas de `datos_json_enrichment->>'descripcion'`.

---

## 6. Campos Target para LLM Enrichment

Basado en gaps documentados, lecciones de auditoría, y comparativa ventas/alquileres:

| # | Campo | Tipo | Hoy (regex) | Con LLM | Prioridad |
|---|-------|------|-------------|---------|-----------|
| 1 | `nombre_edificio` | VARCHAR | 0-60% según portal | 90%+ | CRÍTICO |
| 2 | `estado_construccion` | ENUM | 60% correcto | 85%+ | ALTO |
| 3 | `tipo_cambio_detectado` | VARCHAR | 75% | 90%+ | ALTO |
| 4 | `parqueo_incluido` | BOOLEAN | 0% | 40%+ | ALTO |
| 5 | `plan_pagos_desarrollador` | BOOLEAN | 0% | 60%+ | ALTO |
| 6 | `descripcion_limpia` | TEXT (JSONB) | no existe | 100% | ALTO |
| 7 | `piso` | INTEGER | 10% | 40%+ | MEDIO |
| 8 | `baulera` | BOOLEAN | 0% | 25%+ | MEDIO |
| 9 | `baulera_incluido` | BOOLEAN | 0% | 25%+ | MEDIO |
| 10 | `parqueo_precio_adicional` | NUMERIC | 0% | 15%+ | MEDIO |
| 11 | `descuento_contado_pct` | NUMERIC | 0% | 10%+ | BAJO |
| 12 | `acepta_permuta` | BOOLEAN | 0% | 10%+ | BAJO |
| 13 | `precio_negociable` | BOOLEAN | 0% | 10%+ | BAJO |
| 14 | `solo_tc_paralelo` | BOOLEAN | 0% | 30%+ | MEDIO |
| 15 | `fecha_entrega_estimada` | TEXT | 15% (regex) | 30%+ | MEDIO |
| 16 | `amenities_confirmados` | JSONB | regex (inventa) | más preciso | MEDIO |
| 17 | `equipamiento_detectado` | JSONB | regex (AC bug) | más preciso | MEDIO |
| 18 | `depende_de_tc` | BOOLEAN | buggy (siempre true) | correcto | ALTO |

### Campos que el LLM NO debe tocar

| Campo | Razón |
|-------|-------|
| `precio_usd` | Regex ya es robusto, riesgo de error alto |
| `area_total_m2` | Discovery/regex confiable |
| `dormitorios` | Discovery/regex confiable |
| `banos` | Discovery/regex confiable (LLM como validación) |
| `latitud/longitud` | API GPS es fuente de verdad |
| `fotos_urls` | HTML parsing es más confiable |
| `agente_*` | data-page/meta tags son fuente directa |

---

## 7. Diseño del LLM Enrichment

### Arquitectura propuesta

```
Pipeline actual (NO se modifica):
Discovery → Regex Enrichment → Merge → Matching

Nuevo (paralelo, post-merge):
Props completadas → LLM Enrichment → registrar_enrichment_venta_llm()
                                        ↓
                                    Escribe en datos_json_enrichment.llm_output
                                    + columnas directas (respetando candados)
```

### Diferencias clave vs alquileres

| Aspecto | Alquileres | Ventas |
|---------|------------|--------|
| Prompt | Campos alquiler (precio_bob, amoblado, mascotas) | Campos venta (TC, estado_construccion, plan_pagos) |
| Contexto extra | Solo datos discovery | **+ lista proyectos_master de la zona** |
| Validación precio | 0-50,000 BOB | 5,000-2,000,000 USD |
| Validación área | 15-500 m² | 20-1,000 m² |
| Nivel confianza | No reporta | **Por campo** (alta/media/baja) |
| Modelo | Haiku 4.5 | Haiku 4.5 |
| Costo/prop | ~$0.004 | ~$0.006 (prompt más largo por PM context) |

---

## 8. Descripciones de Muestra (30 props)

### Remax

**ID 30** — Sky Luxia, monoambiente 31.20m², $65,000 dólares/paralelo. Amoblado: cama, sofá, TV, A/C. Áreas: piscina, sauna, churrasqueras, sala reuniones.

**ID 35** — Condominio Avanti, 2 dorms en suite, cocina equipada, living amplio. Acabados alta calidad.

**ID 43** — Lofty Island preventa. 1 y 2 dorms, A/C instalados, cocina equipada: encimera, horno, extractor, heladera panelable.

**ID 48** — Lofty Island (otra unidad), misma descripción.

**ID 59** — Sky Eclipse, 95m², 2 dorms. $161,500 TC paralelo. Cocina equipada. Áreas: piscina, gym, churrasqueras, salón eventos, cowork.

**ID 101** — Atrium sobre E. Finot. 95m², Bs 1,463,000. 2 dorms, piso 8, A/C todos ambientes. Áreas: piscina piso 14, churrasquera, gym.

**ID 418** — SKY DESIGN, Sirari. 148.7m², $195,000. 2 dorms suite, 1 parqueo + baulera. Áreas: piscinas, churrasqueras, gym, seguridad 24/7.

**ID 465** — Sky Plaza Italia, monoambiente amoblado 42.43m². Cocina eléctrica, microondas, heladera, A/C. Áreas: piscina, churrasquera, lounge.

**ID 470** — Las Dalias, Eq Norte. 51m² 1D piso 1. Equipamiento: A/C wifi, termotanque, cocina eléctrica, horno, heladera, roperos.

**ID 519** — Garden Equipetrol, B. Brigida. Piso 7, 46.2m², $74,900 dólares/paralelo. 1 dorm suite. Áreas: piscina, churrasquera, cowork.

**ID 574** — Luxe Tower, Finot esq Guemes. Preventa 63m². Chapas digitales, domótica. $132,300 TC oficial. Entrega nov 2026.

**ID 621** — Las Dalias dpto 110. 75.23m² 2D piso 1.

**ID 909** — Alto Busch, 3er anillo. 114.12m², 3 dorms. Cerca UDABOL/UTEPSA. Áreas: piscina panorámica, churrasquera, sala TV/juego.

**ID 920** — SKY LEVEL, preventa 1-2 dorms, 52-94m². Entrega dic 2026.

**ID 1095** — Sky Eclipse, 106m², 2 dorms. Garaje + baulera. Áreas: piscina, jacuzzi, gym, salas reuniones.

### Century21

**ID 183** — SKY LEVEL, preventa 1-2 dorms. Entrega dic 2026.

**ID 234** — Monoambiente a estrenar, Edificio Murure, 38m², piso 5, balcón. Bs 480,000. Áreas: piscina, churrasqueras, salón eventos, lavandería.

**ID 296** — 1 dorm en SKY MOON. 66.10m². Equip: encimera, horno, extractor, muebles, termotanque, A/C. Áreas: piscina, gym, sauna, cowork, paddle, mirador 360.

**ID 370** — HH Once Equipetrol. 1 dorm, 61.68m², $112,300. Cerradura inteligente, video portero. Áreas: piscina, lounge, churrasqueras, cowork. Entrega dic 2025.

**ID 450** — Aria Dpto, 3 baños. Áreas: piscina, área social, ascensor, terraza, parking visitas, seguridad 24/7.

**ID 455** — HH Once, monoambiente preventa. $77,000 contado. 37.05m². Áreas: piscina, lounge, churrasqueras, cowork, lavandería.

**ID 479** — Sky Eclipse, piso 13, 68m², $110,000 TC paralelo. 1 dorm suite. Cocina Tramontina, domótica. Áreas premium.

**ID 530** — Macororo 12. 2 dorms, 87m². $140,000 incluye parqueo. Áreas: piscina, churrasquera, sauna, salón eventos.

**ID 559** — Edificio Platinum 1, 1 dorm amoblado, piso 6. Parqueo. $115,000 en dólares.

**ID 569** — Stone II, Barrio Brigida. 1 suite, piso 7, 54.34m², $92,000. Áreas: piscina, gym, cowork, billar.

**ID 611** — Equipetrol Norte, 91.84m², $114,800 ($1,250/m² TC 7). 2 dorms suite. Parqueo +$10k, baulera +$3k.

**ID 849** — 3 dorms suite, 165m², $312,717 dólares o TC paralelo. Piso 4. Áreas: lobby, piscina temperada, churrasqueras, salón uso común vista 180, sauna, sala TV.

**ID 1006** — Sirari. 74.60m², $147,000 TC 7, incluye parqueo. 2 dorms, piso 6. Áreas: piscina temperada, churrasqueras, cowork, fogatero, pet-shower.

**ID 1009** — Onix Art By EliTe, dpto amoblado 1 dorm, 35.30m². Cocina equipada, terraza. (Descripción corta.)

**ID 1049** — SKY EQUINOX preventa. Monos, 1D, 2D penthouse. Entrega jun 2027. Solo dólares $71,890. (Multiproyecto.)

---

*Generado por investigación automatizada. Rama: `feature/llm-enrichment-ventas`*
