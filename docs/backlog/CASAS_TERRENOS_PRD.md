# PRD: Casas y Terrenos en Equipetrol

> Status: Fase 1 ✓ + Fase 2 ✓ completadas | Autor: Lucho + Claude | Fecha: 2026-04-17 (Fases 1-2)

---

## 1. Contexto y motivacion

SICI hoy captura exclusivamente departamentos y penthouses en Equipetrol (6 zonas, ~400 props activas, 3 fuentes). Los portales (Century21, Remax) tambien listan casas y terrenos en la zona, pero el discovery los ignora porque las URLs estan hardcodeadas a `tipo_departamento-o-penthouse`.

Equipetrol tiene volumen bajo de casas (~15-40 listings) y terrenos (~10-30 listings), pero esta data tiene valor para:
- Estudios de mercado completos para desarrolladoras (precio terreno/m2, oferta de casas demolibles)
- Feed publico que muestre que Simon cubre mas que departamentos
- Proof of concept en Equipetrol antes de escalar a zonas con alto volumen (Urubo, Norte, Sur)

## 2. Casos de uso

| # | Usuario | Necesidad | Prioridad |
|---|---------|-----------|-----------|
| 1 | Lucho (estudios de mercado) | Data de terrenos y casas para informes a desarrolladoras — precio/m2 terreno, inventario, ubicacion | Alta |
| 2 | Desarrolladora (cliente) | Entender oferta de terrenos disponibles en Equipetrol para evaluar compra | Alta |
| 3 | Usuario final (comprador casa) | Encontrar casas en venta en Equipetrol con la misma UX que /ventas | Media |
| 4 | Usuario final (comprador terreno) | Encontrar terrenos en Equipetrol con datos relevantes (frente, fondo, area, zonificacion) | Media |
| 5 | Simon (plataforma) | Ampliar cobertura de tipos de propiedad como paso hacia Santa Cruz completa | Estrategica |

## 3. Scope v1

### SI entra
- Discovery de casas y terrenos desde Century21 y Remax (Equipetrol)
- Almacenamiento en `propiedades_v2` con `tipo_propiedad_original` correcto
- Enrichment LLM con prompts especificos por tipo
- Feed publico separado (ruta propia, no mezclado con /ventas)
- Campos nuevos en schema: area_terreno_m2, frente_m, fondo_m
- Casas en demolicion: se capturan (el filtro es del usuario, no del pipeline)

### NO entra en v1
- Matching con `proyectos_master` (se skipea para casas/terrenos)
- Concepto de `condominios_master` para barrios cerrados (futuro)
- Bien Inmuebles como fuente (solo C21 + Remax inicialmente)
- Zonas fuera de Equipetrol
- KPIs de absorcion para casas/terrenos
- Merge complejo — usar merge simple o adaptar el existente

## 4. Fases de implementacion

### Fase 1 — Discovery crudo (MVP data) ✅ COMPLETADA (2026-04-17)
**Objetivo:** Tener casas y terrenos en BD para estudios de mercado.
**Resultado:** 40 props capturadas (26 casas + 14 terrenos), 23 dentro de Equipetrol. Superó criterio (>=10 casas, >=5 terrenos).

- [x] Migración 221: columnas `area_terreno_m2`, `frente_m`, `fondo_m` + filtro matching + `registrar_discovery(p_area_terreno_m2)`
- [x] Workflow n8n: `discovery_c21_casas_terrenos_v1.0.0.json` (tipo_casa + tipo_terreno, grid GPS)
- [x] Workflow n8n: `discovery_remax_casas_terrenos_v1.0.0.json` (`/casa/` + `/terreno/`)
- [x] `registrar_discovery()` guarda tipo_propiedad_original correctamente
- [x] Data cruda validada: GPS, precios, areas, codigo_propiedad correctos
- [x] Workflows activados en n8n (corren cada noche 1:15 AM)

**Learnings Fase 1:**
- Archivos de workflow: tratar `0` como `null` en campos numericos (area=0 rompe check_area_positive)
- Items vacios con `alwaysOutputData=true` requieren filtro `.filter(p => p.url)` antes de llegar a la función SQL
- `safeNum()` helper para evitar strings vacios/undefined en parametros NUMERIC
- C21 tiene listings mal categorizados (URL dice casa pero descripción dice terreno, etc.)
- Remax mezcla alquileres como ventas en `/casa/` endpoint → estas quedan con `excluido_operacion` (correcto)

### Fase 2 — Enrichment LLM ✅ COMPLETADA (2026-04-17)
**Objetivo:** Extraer campos específicos por tipo de propiedad + normalizar precios BOB→USD.
**Resultado:** 18 props enriquecidas + 1 excluida_zona + 4 excluido_operacion de las 23 dentro de Equipetrol.

- [x] Prompt LLM casas v1 (`scripts/llm-enrichment/prompt-ventas-casas-v1.md`) — 19 campos tipo-específicos
- [x] Prompt LLM terrenos v1 (`scripts/llm-enrichment/prompt-ventas-terrenos-v1.md`) — 11 campos
- [x] Workflow all-in-one: `n8n/workflows/casas_terrenos/enrichment_casas_terrenos_v1.0.0.json` (scrape + LLM + merge ligero)
- [x] Pipeline independiente — no usa flujo B ni merge ventas
- [x] TC dinámico: usa `obtener_tc_actuales()` (Binance), no claves hardcoded
- [x] Feature `zona_mencionada_en_texto`: LLM detecta zonas fuera de Equipetrol → marca `excluida_zona` automáticamente
- [x] Workflow activado en n8n (corre cada noche 2:30 AM)

**Campos LLM extrae (casas):** dormitorios, banos, area_terreno_m2, niveles, garage {cubierto, vehiculos}, cuarto_servicio (+con_bano), piscina, jardin, ambientes_adicionales (escritorio, galería, sala_juegos, quincho, etc.), estado_propiedad (nueva/usada/remodelada/para_demolicion), estado_construccion, tipo_cambio_detectado, zona_mencionada_en_texto, plan_pagos, amenities_confirmados, equipamiento_detectado, descripcion_limpia.

**Campos LLM extrae (terrenos):** area_terreno_m2, frente_m, fondo_m, uso_suelo, tiene_construccion, servicios_disponibles, topografia, tipo_cambio_detectado, zona_mencionada_en_texto, plan_pagos, descripcion_limpia.

**Learnings Fase 2:**
- n8n `$env.ANTHROPIC_API_KEY` con espacios en llaves falla en task runners 2.15+. Usar `={{$env.ANTHROPIC_API_KEY}}` sin espacios
- IF nodes con 2 ramas: en nodo posterior, usar `try/catch` para leer `$('NodeName').first().json` — tira error si el nodo no ejecutó
- Parsear node debe leer `upstream.descripcion` (del Build Prompt), NO `itemInput.descripcion` (es respuesta LLM, no tiene el campo)
- Firecrawl: `formats: ['markdown', 'rawHtml'], onlyMainContent: true, waitFor: 3000`
- Parsing por fuente: Remax usa `data-page="..."` del HTML → `listing.description_website`. C21 usa `markdown` directo
- TC Binance viene en `config_global` con claves en minúscula (`tipo_cambio_oficial`, `tipo_cambio_paralelo`)
- GPS portal no siempre coincide con zona real — LLM detecta mención explícita de otra zona (Cotoca, Urubo) y marca `excluida_zona`

### Fase 3 — Feed publico ⏳ PENDIENTE
**Objetivo:** Paginas publicas en simonbo.com para casas y terrenos.
**Criterio de avance:** Feed funcional con filtros relevantes por tipo, mobile-first.

- [ ] RPC `buscar_unidades_simple_casas()` y `buscar_unidades_simple_terrenos()` (o parametrizar existente con `tipo_propiedad`)
- [ ] Vistas `v_mercado_casas` y `v_mercado_terrenos` con filtros canónicos (status='completado', zona IS NOT NULL, area_total_m2 >= 20 para casas, area_terreno_m2 >= 100 para terrenos)
- [ ] Ruta `/ventas/casas` — feed casas con card adaptado
- [ ] Ruta `/ventas/terrenos` — feed terrenos con card adaptado
- [ ] Cards: renderizado condicional por tipo (terreno no muestra dorms, casa muestra ambientes_adicionales)
- [ ] Filtros específicos:
  - **Casas:** zona, precio, dormitorios, area construida, piscina, jardín, cuarto servicio, niveles, estado
  - **Terrenos:** zona, precio, area terreno, frente min, uso_suelo, tiene_construccion
- [ ] KPIs de mercado separados por tipo (mediana precio/m2 terreno vs construido)
- [ ] SEO: getStaticProps + meta tags por tipo

**Entregable:** Feed publico en simonbo.com.

**Dependencias:**
- Volumen suficiente (esperar 2-3 semanas de capturas nocturnas)
- Evaluar si el card de casa necesita badges para ambientes adicionales (piscina, cuarto servicio, etc.)
- Definir cómo mostrar TC en el feed (mostrar solo USD normalizado o también badge "TC paralelo"?)

### Admin Dashboard — pendiente ⏳
**Objetivo:** Panel admin para seguimiento y edición de casas/terrenos, alineado con los panels existentes de ventas y alquileres.

**Justificación:** Las casas/terrenos tienen campos únicos (area_terreno, frente, fondo, niveles, ambientes_adicionales, cuarto_servicio, piscina, jardín, uso_suelo, topografía, servicios_disponibles) que no existen en los editores actuales de deptos. El admin necesita revisar, corregir errores del LLM y mantener candados (`campos_bloqueados`) igual que en ventas.

**Scope:**
- [ ] Ruta `/admin/casas-terrenos` — listado con filtros (tipo, zona, status, precio, con/sin descripción)
- [ ] Ruta `/admin/casas-terrenos/[id]` — editor por tipo con renderizado condicional:
  - **Casa**: dormitorios, baños, niveles, garage, piscina, jardín, cuarto servicio, ambientes_adicionales (chips), amenities, equipamiento, estado_propiedad, plan_pagos
  - **Terreno**: area_terreno, frente, fondo, uso_suelo, tiene_construccion, servicios_disponibles (toggles), topografía, plan_pagos
- [ ] Candados (`campos_bloqueados`) para campos tipo-específicos nuevos (area_terreno, frente, fondo, niveles, etc.)
- [ ] Galería de fotos + lightbox (cuando Fase 2 extraiga fotos)
- [ ] Descripción original + descripción limpia LLM side-by-side para validar
- [ ] Badge de `excluida_zona` si el LLM detectó otra zona — con CTA "confirmar exclusión" o "override y volver a completado"
- [ ] Badge de TC detectado (oficial/paralelo/no_especificado) con link para corregir
- [ ] Supervisor HITL para casos edge:
  - Props con `zona_mencionada_en_texto != null` pero el admin sabe que es Equipetrol
  - Props con `tipo_propiedad_original` mal categorizado en portal (C21 dice casa, pero el LLM detectó terreno)
  - Props con `descripcion_limpia = null` (Firecrawl falló)

**Reusa:**
- Patrón `tipos → constantes → hook → componentes → pagina orquestadora` de `/admin/propiedades/[id]` (ver `hooks/usePropertyEditor.ts`)
- `LockPanel`, `LockIcon`, `PropertyGallery` components (adaptados o copiados)
- Hook nuevo: `useCasaTerrenoEditor` (similar a `usePropertyEditor`)

**Dependencias:**
- Esperar volumen (~2-3 semanas captura nocturna) para tener backlog real
- Decidir si viven como ruta separada `/admin/casas-terrenos` o tab en `/admin/propiedades` (probablemente separada por campos muy distintos)

### Auditoría Slack — pendiente ⏳
**Objetivo:** Enterarse por Slack si los workflows casas/terrenos fallan o dejan de capturar data.

- [ ] Agregar `discovery_casas_terrenos_c21` a la auditoría nocturna que consulta `workflow_executions`
- [ ] Agregar `discovery_casas_terrenos_remax` a la auditoría
- [ ] Agregar `enrichment_casas_terrenos` a la auditoría
- [ ] Alerta específica: si >5 props en `status='nueva'` con >3 días → problema en enrichment
- [ ] Alerta: si `zona_mencionada_en_texto` se dispara >3 veces por semana → revisar polígonos

### Fase 4 — Matching y condominios (futuro)
**Objetivo:** Matching inteligente para casas en barrios cerrados.

- [ ] Concepto `condominios_master`: tabla nueva o extension de `proyectos_master` con `tipo_proyecto`
- [ ] Matching condicional: departamento → `proyectos_master`, casa en condominio → `condominios_master`, terreno/casa individual → sin matching
- [ ] Absorcion de mercado por tipo

### Fase 5 — Casas en alquiler y anticrético en Equipetrol (futuro)
**Objetivo:** Extender el pipeline a operaciones distintas a venta para casas.
**Motivación:** Las casas en alquiler (mensualidad) y anticrético (contrato pre-pagado) son un segmento relevante en Equipetrol — complementa la data de ventas con dinámica de rentas/anticréticos para estudios más completos.

**Scope:**
- [ ] Discovery C21 casas alquiler (`tipo_casa` + `operacion_alquiler`)
- [ ] Discovery Remax casas alquiler (`/api/search/casa/` con filtro alquiler)
- [ ] Discovery C21/Remax casas anticrético (validar que los portales lo listen como operación separada)
- [ ] Enrichment específico: campos de alquiler (`precio_mensual_bob`, `amoblado`, `acepta_mascotas`, `servicios_incluidos`, `contrato_minimo_meses`, `deposito_meses`) y anticrético (`monto_total_anticretico`, `duracion_contrato_meses`)
- [ ] Filtros: precio mensual, amoblado, mascotas (alquiler); monto total, duración (anticrético)
- [ ] Feed público condicional — mismo `/ventas/casas` agrega tab alquiler/anticrético, o rutas separadas `/alquileres/casas`, `/anticretico/casas`
- [ ] Absorción por operación (cuánto dura un alquiler de casa en mercado vs venta)

**Dependencias:**
- Verificar que C21 y Remax publiquen casas en alquiler con volumen relevante en Equipetrol (estimado: 5-15 props)
- Evaluar si el anticrético merece pipeline propio o se integra con alquiler (pregunta de negocio)
- Definir si el pipeline es compartido con deptos alquiler existente o paralelo (probablemente paralelo, como el de venta)

**Riesgos/caveats:**
- Volumen posiblemente muy bajo (casas en alquiler/anticrético son segmento chico)
- Remax mezcla alquileres de casas dentro del endpoint `/casa/` (venta) — ya lo filtramos como `excluido_operacion`. Para Fase 5 habría que invertir: capturarlos explícitamente
- El TC en anticrético es siempre en Bs, no USD — adaptar merge ligero

## 5. Diseno tecnico

### 5.1 Schema BD

Columnas nuevas en `propiedades_v2`:

```sql
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS area_terreno_m2 NUMERIC;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS frente_m NUMERIC;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS fondo_m NUMERIC;
```

`tipo_propiedad_original` ya existe y acepta cualquier texto. Los portales envian "casa", "terreno", "lote". No se necesita enum.

### 5.2 Discovery — URLs por portal

**Century21** (VALIDADO 2026-04-17):
```
# Actual (deptos) — grid GPS con 6 cuadrantes:
tipo_departamento-o-penthouse/operacion_venta/layout_mapa/coordenadas_{N},{E},{S},{W},15?json=true

# Nuevo casas — MISMO formato grid GPS (tipo_casa-o-terreno combinado da 404, separados SI):
tipo_casa/operacion_venta/layout_mapa/coordenadas_{N},{E},{S},{W},15?json=true
# Resultado: 6+ casas en 2 cuadrantes. Estructura JSON IDENTICA a deptos (lat, lon, precio, m2T, m2C, recamaras, etc.)

# Nuevo terrenos — mismo grid:
tipo_terreno/operacion_venta/layout_mapa/coordenadas_{N},{E},{S},{W},15?json=true
# Resultado: 1+ terreno. Misma estructura. Volumen bajo (esperable).
```

> NOTA: `tipo_casa-o-terreno` (combinado) da 404. Hay que hacer 2 requests separadas por tipo por cuadrante (12 requests totales vs 6 actuales de deptos). Alternativa: 1 workflow con loop tipo_casa + tipo_terreno sobre los mismos 6 cuadrantes. La URL `en-municipio` funciona pero es imprecisa — trae props fuera de Equipetrol (ej: Zona Norte G77, Cotoca). Usar grid GPS como los deptos.

**Remax** (VALIDADO 2026-04-17):
```
# Actual (deptos):
/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste?page={1-8}

# Nuevo casas — misma estructura de respuesta que deptos:
/api/search/casa/santa-cruz-de-la-sierra/equipetrolnoroeste?page={1-8}
# Resultado: 8 casas, incluye area_terreno + area_construccion

# Nuevo terrenos — misma estructura, dorms=0, banos=0:
/api/search/terreno/santa-cruz-de-la-sierra/equipetrolnoroeste?page={1-8}
# Resultado: 3 terrenos
```

**Workflow n8n:** Un workflow de discovery por portal (2 total). Cada uno captura casas+terrenos en una corrida. El portal devuelve `tipo_propiedad_original` que los distingue en BD.

### 5.3 Enrichment LLM — Prompts separados

| Prompt | Campos clave que extrae | Campos que NO extrae (vs deptos) |
|--------|------------------------|----------------------------------|
| `prompt-ventas-casas-v1.md` | area_terreno_m2, niveles, garage_cubierto, estado_construccion, tipo_cambio, plan_pagos, amenities | piso, nombre_edificio, es_multiproyecto, baulera |
| `prompt-ventas-terrenos-v1.md` | area_terreno_m2, frente_m, fondo_m, uso_suelo, tiene_construccion, tipo_cambio, plan_pagos | dormitorios, banos, piso, nombre_edificio, amenities, estado_construccion, parqueo, baulera |

**Routing:** El workflow n8n decide que prompt usar basado en `tipo_propiedad_original`:
- `casa` → prompt casas
- `terreno`, `lote` → prompt terrenos
- Cualquier otro → prompt deptos (existente)

### 5.4 Matching — Skipear para v1

```sql
-- En matching_completo_automatizado o donde se invoque:
-- Solo matchear departamentos y penthouses
WHERE lower(COALESCE(p.tipo_propiedad_original, '')) IN ('departamento', 'penthouse')
```

Casas y terrenos quedan con `id_proyecto_master = NULL`. No es un problema — el feed no depende de tener proyecto asignado.

### 5.5 Feed UI — Cards por tipo

**Card Casa:** Foto, zona, precio, area construida + area terreno, dormitorios, banos, niveles, garage, estado construccion, precio/m2 construido.

**Card Terreno:** Foto (o placeholder mapa), zona, precio, area terreno, frente x fondo, precio/m2 terreno, uso suelo si disponible.

**Filtros Casa:** zona, precio, dormitorios, area construida, estado entrega.
**Filtros Terreno:** zona, precio, area terreno, frente minimo.

### 5.6 Estructura en el repo

```
n8n/workflows/
├── modulo_1/              → Discovery/enrichment/merge DEPARTAMENTOS (sin cambios)
├── modulo_2/              → Matching/auditoria (sin cambios)
├── alquiler/              → Pipeline alquiler (sin cambios)
└── casas_terrenos/        → NUEVO
    ├── discovery_c21_casas_terrenos_v1.0.0.json
    ├── discovery_remax_casas_terrenos_v1.0.0.json
    ├── enrichment_llm_casas_v1.0.0.json
    └── enrichment_llm_terrenos_v1.0.0.json

scripts/llm-enrichment/
├── prompt-ventas-v2.md             → Deptos (sin cambios)
├── prompt-ventas-casas-v1.md       → NUEVO
└── prompt-ventas-terrenos-v1.md    → NUEVO

sql/migrations/
└── 221_casas_terrenos_schema.sql   → NUEVO (columnas + ajuste matching)
```

## 6. Riesgos y decisiones abiertas

| Riesgo | Mitigacion |
|--------|------------|
| Volumen muy bajo en Equipetrol (10-30 terrenos) | Es proof of concept — el valor real esta en escalar a otras zonas |
| Terrenos sin fotos atractivas → feed se ve pobre | Placeholder con mapa/ubicacion en vez de foto. O filtrar `solo_con_fotos` como opcion |
| Casas en demolicion contaminan metricas | Documentar como caveat en estudios. No filtrar — es data valiosa para desarrolladoras |
| Enrichment LLM tiene poco texto para terrenos | Los listings de terrenos son cortos. El prompt debe ser conservador — extraer poco pero bien |
| GPS de terreno matchea con edificio vecino | Matching skipeado para v1. Resuelto |

**Decisiones resueltas (validacion 2026-04-17):**
1. ~~Remax: verificar paths API~~ → CONFIRMADO: `/casa/` y `/terreno/` funcionan, misma estructura que deptos
2. ~~C21: verificar formato JSON~~ → CONFIRMADO: `tipo_casa` y `tipo_terreno` funcionan con grid GPS (`layout_mapa`). Estructura JSON identica a deptos. `tipo_casa-o-terreno` combinado NO funciona (404) — usar requests separadas. URL `en-municipio` descartada (trae props fuera de Equipetrol)
3. Feed: rutas `/ventas/casas` y `/ventas/terrenos` vs `/casas` y `/terrenos` top-level — decidir en Fase 3
4. Merge: adaptar merge existente o crear merge simplificado para casas/terrenos — decidir en Fase 2

## 7. Metricas de exito

### Fase 1 (Discovery)
- >= 10 casas capturadas en Equipetrol con precio + area + GPS
- >= 5 terrenos capturados con precio + area + GPS
- `tipo_propiedad_original` correcto en 100% de capturas
- Data usable en al menos 1 estudio de mercado

### Fase 2 (Enrichment)
- Precision > 90% en campos clave por tipo
- area_terreno_m2 extraido en > 80% de terrenos
- frente_m/fondo_m extraido en > 50% de terrenos (depende de lo que publican los portales)

### Fase 3 (Feed)
- Feed funcional con >= 15 props visibles
- Mobile-first, misma calidad UX que /ventas
- Tiempo de carga < 3s en 4G

---

*Documento vivo. Actualizar conforme avanzan las fases.*
