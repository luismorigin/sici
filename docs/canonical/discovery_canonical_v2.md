# DISCOVERY_CANONICAL_OUTPUT.md

**Contrato canónico — Output del Módulo 1 (Discovery)**

**Sistema:** SICI — Sistema Inteligente de Captura Inmobiliaria  
**Módulo:** Módulo 1 — Discovery & Existencia  
**Tipo de documento:** Contrato arquitectónico  
**Estado:** ✅ Definitivo  
**Versión:** 2.0.0  
**Fecha:** Diciembre 2025

---

## 0. Naturaleza de este documento

Este documento define el **contrato de salida** del Módulo 1 (Discovery).

**Es un contrato arquitectónico:**
- Define qué produce Discovery
- Define qué NO produce Discovery
- Define estados permitidos
- Define invariantes que nunca se rompen

**NO es:**
- ❌ Documentación de implementación
- ❌ Especificación de fuentes específicas
- ❌ Lógica de negocio o matching
- ❌ Estructura de base de datos

**Propósito:**
Garantizar que cualquier implementación de Discovery (actual o futura) produzca output consistente, predecible y válido.

---

## 1. Definición: ¿Qué es Discovery?

**CAMBIO CONCEPTUAL CRÍTICO (v2.0):**

Discovery en SICI **NO es un extractor stateless**. Discovery es un **proceso de detección de cambios de existencia del mercado**.

### Naturaleza real de Discovery

```
Discovery = Snapshot + Comparación + Decisión
```

**Discovery responde:**
> **"¿Qué cambió en el mercado público desde el último snapshot?"**

**Importante - Proceso vs Función:**
Discovery como **concepto** es un proceso completo que incluye snapshot, comparación y decisión. La función SQL `registrar_discovery()` es una **primitiva de persistencia** dentro de ese proceso, no su representación completa. El proceso de Discovery ocurre en n8n/código de orquestación que LLAMA a `registrar_discovery()` para persistir resultados.

### Las tres fases obligatorias

#### A. SNAPSHOT (Captura dual)

Discovery captura dos tipos de datos:

**1. Snapshot crudo (datos_json_discovery)**
- Payload RAW completo de la fuente
- **Inmutable** — evidencia histórica versionable
- Base para auditoría, reproceso y debug
- Nunca se sobreescribe, solo se versiona por fecha

**2. Datos observados (parseados)**

Discovery SÍ parsea ciertos campos, pero los trata como **datos observados**, no como enrichment:

| Campo | Propósito | Semántica |
|-------|-----------|-----------|
| `precio_usd` | Detectar cambios de precio | Observado, no oficial |
| `tipo_operacion` | Clasificación básica | Observado |
| `area_total_m2` | Detectar cambios físicos | Observado |
| `dormitorios` | Detectar cambios físicos | Observado |
| `latitud`, `longitud` | GPS básico (opcional) | Observado |
| `fecha_publicacion` | Señal de actividad | Observado (si disponible) |

**Importante:**
- ❌ NO son "verdad final"
- ❌ NO rompen candados
- ❌ NO reemplazan enrichment
- ✅ SÍ sirven para detectar cambios
- ✅ SÍ apoyan decisiones de existencia
- ✅ SÍ deciden si re-scrapear en Flujo B

#### B. COMPARACIÓN (Obligatoria)

Discovery **SIEMPRE compara**:

```
snapshot_actual_fuente
    VS
propiedades_v2 WHERE fuente = X
```

**Clasifica propiedades en:**
- **Nuevas:** No existen en BD
- **Existentes:** Ya están registradas
- **Ausentes:** Estaban en BD pero NO aparecieron hoy

**Esta comparación NO es Flujo C** — es parte integral de Discovery.

#### C. DECISIÓN (Estados de existencia)

Discovery decide **estados de existencia** (no de negocio):

| Estado | Significado |
|--------|-------------|
| `nueva` | Propiedad detectada por primera vez (estado inicial) |
| `inactivo_pending` | No apareció en el snapshot de hoy (solo para propiedades que existieron previamente) |

**Aclaración crítica sobre inactividad:**
- Una propiedad que **nunca existió** en Discovery no tiene estado alguno (no existe en BD)
- `inactivo_pending` solo puede aplicarse a propiedades que **aparecieron al menos una vez** en un snapshot previo
- `inactivo_confirmed` es confirmación técnica posterior por Flujo C (solo aplica después de `inactivo_pending`)

**Transiciones de estado:**
- Discovery CREA propiedades → `nueva`
- Enrichment transiciona → `nueva` → `actualizado`
- Merge transiciona → `actualizado` → `completado`
- Discovery puede marcar → propiedades ausentes → `inactivo_pending` (desde orquestación)

**Regla crítica - Discovery NO promueve estados:**
- Discovery **NUNCA** cambia `nueva` → `actualizado`
- Discovery **NUNCA** cambia `actualizado` → `completado`
- Discovery solo **preserva** estados más avanzados (ej. `completado`) si la propiedad reaparece en snapshot sin regresión
- Solo **crea** `nueva` en INSERT
- Solo **marca** `inactivo_pending` en ausencias (UPDATE desde orquestación, no desde función)

**Flujo C (El Verificador):**
- **NO detecta ausencias** — eso es responsabilidad del proceso Discovery
- Solo confirma técnicamente (HTTP HEAD / 404)
- **Relevancia por fuente:**
  - Remax: HTTP 404 confiable, Flujo C efectivo
  - Century21: HTTP 200 aún con "Aviso terminado", Flujo C no confiable
- Discovery puede usar señales HTML ("Aviso terminado") y fechas de modificación como **datos observados**, pero NO como confirmación final

---

## 2. Concepto: Existencia en SICI

**Existencia** significa que una propiedad:

1. Apareció en el snapshot actual de su fuente
2. Tiene URL única en su fuente
3. Fue detectada en un momento específico
4. Tiene ubicación geográfica (GPS) - recomendado pero opcional

**Ausencia** significa que una propiedad:

1. Existía en snapshots previos (apareció al menos una vez)
2. NO apareció en el snapshot actual
3. Transiciona a `inactivo_pending`

**Aclaración importante:**
Una propiedad que nunca fue detectada en ningún snapshot NO está "ausente" — simplemente no existe en el sistema. Los estados de inactividad (`inactivo_pending`, `inactivo_confirmed`) solo aplican a propiedades que existieron previamente.

**Existencia NO implica:**
- Calidad de datos
- Completitud de información
- Matching exitoso con proyectos
- Validación de negocio

---

## 3. Firma de la función registrar_discovery()

### Función SQL real

```sql
CREATE OR REPLACE FUNCTION registrar_discovery(
    -- Identificación
    p_url VARCHAR,
    p_fuente VARCHAR,
    p_codigo_propiedad VARCHAR DEFAULT NULL,
    
    -- Clasificación
    p_tipo_operacion VARCHAR DEFAULT NULL,
    p_tipo_propiedad_original TEXT DEFAULT NULL,
    p_estado_construccion VARCHAR DEFAULT NULL,
    
    -- Financiero
    p_precio_usd NUMERIC DEFAULT NULL,
    p_precio_usd_original NUMERIC DEFAULT NULL,
    p_moneda_original VARCHAR DEFAULT NULL,
    
    -- Físico
    p_area_total_m2 NUMERIC DEFAULT NULL,
    p_dormitorios INTEGER DEFAULT NULL,
    p_banos NUMERIC DEFAULT NULL,
    p_estacionamientos INTEGER DEFAULT NULL,
    
    -- GPS
    p_latitud NUMERIC DEFAULT NULL,
    p_longitud NUMERIC DEFAULT NULL,
    
    -- Metadata
    p_fecha_publicacion DATE DEFAULT NULL,
    p_metodo_discovery VARCHAR DEFAULT 'api_rest',
    
    -- JSON completo discovery
    p_datos_json_discovery JSONB DEFAULT NULL
)
RETURNS TABLE(
    id INTEGER,
    status estado_propiedad,
    es_nueva BOOLEAN,
    cambios_detectados JSONB
)
```

### Parámetros obligatorios

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `p_url` | VARCHAR | URL única de la propiedad |
| `p_fuente` | VARCHAR | Fuente de origen (century21, remax) |
| `p_datos_json_discovery` | JSONB | Snapshot crudo completo (obligatorio a nivel proceso) |

**Nota sobre `datos_json_discovery`:**
Aunque tiene `DEFAULT NULL` en la firma SQL, es **obligatorio a nivel de proceso Discovery**. El DEFAULT existe solo por compatibilidad técnica, pero todo proceso de Discovery debe proporcionar el snapshot completo.

### Parámetros opcionales (datos observados)

Todos los demás parámetros son **datos observados** extraídos durante Discovery:

| Grupo | Parámetros | Propósito |
|-------|-----------|-----------|
| Identificación | `codigo_propiedad` | ID externo de la fuente |
| Clasificación | `tipo_operacion`, `tipo_propiedad_original`, `estado_construccion` | Clasificación básica observada |
| Financiero | `precio_usd`, `precio_usd_original`, `moneda_original` | Precio observado (no oficial) |
| Físico | `area_total_m2`, `dormitorios`, `banos`, `estacionamientos` | Características observadas |
| GPS | `latitud`, `longitud` | Ubicación básica (opcional, recomendado) |
| Metadata | `fecha_publicacion`, `metodo_discovery` | Contexto de captura |

### Parámetro especial: datos_json_discovery

**`p_datos_json_discovery`** (JSONB):
- Contiene el payload RAW completo de la fuente
- Es la **fuente de verdad histórica**
- Inmutable, se versiona por fecha
- Base para auditoría y reproceso
- Los datos observados (parámetros individuales) se extraen de aquí

**Relación entre parámetros y JSONB:**
- Los parámetros individuales (precio, área, etc.) son **extracciones convenientes** del JSONB
- Permiten queries rápidas sin parsear JSON
- El JSONB siempre contiene más información que los parámetros individuales
- En caso de discrepancia, el JSONB es la fuente de verdad

**Unicidad:**
- Por `(url, fuente)`, NO por `(codigo_propiedad, fuente)`
- La URL es el identificador único real

---

## 4. Estados permitidos en Discovery

Discovery produce o mantiene registros en los siguientes estados:

| Estado | Significado | Cuándo |
|--------|-------------|--------|
| `nueva` | Propiedad detectada por primera vez | Primera aparición en snapshot |
| `inactivo_pending` | Propiedad ausente en snapshot actual | No apareció hoy (solo para propiedades que existieron previamente) |
| Estados avanzados | Ej: `completado`, `actualizado` | Discovery los **mantiene** si no hay regresión |

**Pipeline completo de estados:**
```
Discovery CREA → nueva
Enrichment → nueva → actualizado
Merge → actualizado → completado
Discovery MARCA ausencias → inactivo_pending
Flujo C CONFIRMA → inactivo_pending → inactivo_confirmed
```

**Aclaración semántica sobre inactividad:**
- Una propiedad que **nunca apareció** en Discovery no existe en BD (sin estado)
- `inactivo_pending` representa **ausencia detectada** en propiedades que aparecieron al menos una vez previamente
- `inactivo_confirmed` representa **confirmación técnica** posterior por Flujo C (transición desde `inactivo_pending`)

**Regla crítica - Discovery NO promueve estados:**
Discovery NO crea estados avanzados (como `actualizado` o `completado`). Solo los **preserva** si la propiedad ya los tenía y reaparece sin cambios que requieran regresión.

**Estados que Discovery SÍ maneja:**
- **Crea:** `nueva` (INSERT de propiedad nueva)
- **Marca:** `inactivo_pending` (UPDATE desde orquestación cuando detecta ausencia)
- **Preserva:** Cualquier estado más avanzado (ej. `completado`) si reaparece sin regresión

**Estados que Discovery NO toca:**
- ❌ `actualizado` → Creado por Enrichment (Flujo B)
- ❌ `completado` → Creado por Merge
- ❌ `inactivo_confirmed` → Creado por Flujo C (verificación técnica)
- ❌ `matched` → Pertenece a Matching

---

## 5. Invariantes arquitectónicos

### Invariante 1: Separación de responsabilidades

```
Discovery captura existencia + datos observados
Enrichment valida y profundiza
Merge unifica datos
Flujo C confirma técnicamente (cuando aplica)
```

**Romper esta separación rompe el sistema.**

### Invariante 2: Snapshot como evidencia histórica

```
datos_json_discovery es evidencia histórica del mercado
Se persiste el último snapshot por propiedad
Versionado histórico completo: evolución futura preparada
Es auditable y base para reproceso
```

### Invariante 3: Comparación obligatoria

```
Discovery SIEMPRE compara snapshot_actual vs histórico
Detecta: nuevas, existentes, ausentes
NO delega detección de ausencias a Flujo C
```

### Invariante 4: Datos observados ≠ Enrichment

```
Datos observados (parámetros de registrar_discovery):
- Sirven para detectar cambios
- NO son verdad final
- NO rompen candados
- NO reemplazan enrichment

Enrichment:
- Es la verdad validada
- Puede romper candados si explícito
- Es la fuente oficial para Merge
```

### Invariante 5: Independencia de fuente

```
El contrato de output es idéntico para:
- Century21
- Remax
- Cualquier fuente futura
```

---

## 6. Ejemplo de proceso completo

### Caso 1: Propiedad nueva

**Input (fuente):**
```json
{
  "id": "12345",
  "url": "/propiedad/12345",
  "precio": 120000,
  "area": 85,
  "lat": -17.765,
  "lon": -63.192
}
```

**Proceso Discovery:**
1. **Snapshot:** Guardar RAW en `p_datos_json_discovery`
2. **Parseo:** Extraer datos observados como parámetros individuales
3. **Comparación:** No existe en BD (verificar por url + fuente)
4. **Decisión:** `status = 'nueva'`

**Output (llamada a función):**
```sql
SELECT * FROM registrar_discovery(
  p_url := 'https://c21.com.bo/propiedad/12345',
  p_fuente := 'century21',
  p_codigo_propiedad := '12345',
  p_precio_usd := 120000,
  p_area_total_m2 := 85,
  p_dormitorios := 2,
  p_banos := 2,
  p_latitud := -17.765,
  p_longitud := -63.192,
  p_metodo_discovery := 'map_grid',
  p_datos_json_discovery := '{
    "id": "12345",
    "precio": 120000,
    "area": 85,
    "lat": -17.765,
    "lon": -63.192
  }'::jsonb
);

-- Resultado en BD:
-- INSERT INTO propiedades_v2 con status='nueva'
```

### Caso 2: Propiedad existente sin cambios

**Proceso Discovery:**
1. **Snapshot:** Guardar nuevo snapshot
2. **Parseo:** Extraer datos observados
3. **Comparación:** Existe (por url + fuente), sin cambios significativos
4. **Decisión:** **Preservar** estado actual (puede ser `nueva`, `actualizado`, `completado`, etc.)

**Nota:** Discovery NO promueve estados. Si una propiedad está en `nueva`, permanece en `nueva` hasta que Enrichment la procese.

**Output (llamada a función):**
```sql
SELECT * FROM registrar_discovery(
  p_url := 'https://c21.com.bo/propiedad/12345',
  p_fuente := 'century21',
  p_datos_json_discovery := '{...nuevo snapshot...}'::jsonb,
  -- otros parámetros observados...
);

-- Resultado en BD:
-- UPDATE propiedades_v2 SET
--   datos_json_discovery = {...nuevo snapshot...},
--   fecha_discovery = NOW()
-- WHERE url = '...' AND fuente = 'century21';
-- status se PRESERVA sin cambios (Discovery NO promueve estados)
```

### Caso 3: Propiedad ausente

**Proceso Discovery (a nivel orquestación):**
1. **Snapshot:** Barrido completo de fuente
2. **Comparación:** Propiedad con url X NO apareció en snapshot
3. **Decisión:** Marcar como `inactivo_pending`

**Output (actualización manual o script de ausencias):**
```sql
UPDATE propiedades_v2 SET
  status = 'inactivo_pending',
  fecha_discovery = NOW()
WHERE url = 'https://c21.com.bo/propiedad/67890'
  AND fuente = 'century21'
  AND status IN ('nueva', 'actualizado', 'completado');
```

**Nota:** La detección de ausencias ocurre en la capa de orquestación (n8n), NO dentro de `registrar_discovery()`. Esta función solo persiste propiedades que SÍ aparecieron.

---

## 7. Interfaz con el sistema

### Input → Discovery (Proceso completo)

El proceso Discovery (orquestación) recibe:
- Configuración de fuentes
- Parámetros de ejecución
- Snapshot histórico para comparación

### Discovery → Output (Función primitiva)

La función `registrar_discovery()` recibe 17+ parámetros (ver sección 3) y produce:

```sql
RETURNS TABLE (
  id INTEGER,
  status estado_propiedad,
  es_nueva BOOLEAN,
  cambios_detectados JSONB
)
```

### Output → Sistema (Persistencia)

**Responsabilidad de registrar_discovery():**
- Validar existencia por (url, fuente)
- Persistir snapshot crudo en `datos_json_discovery` (obligatorio)
- Persistir datos observados en columnas individuales
- Decidir INSERT (nueva) o UPDATE (existente)
- Respetar candados
- Preservar estados avanzados si reaparece sin regresión
- NO sobreescribir datos de enrichment
- NO aplicar lógica de matching
- NO promover estados (solo crea `nueva`, preserva avanzados)
- NO detectar ausencias (eso es responsabilidad de la orquestación)

---

## 8. Extensibilidad

### Agregar nuevas fuentes

Para agregar una nueva fuente (ej: "infocasas"):

1. ✅ Implementar captura específica de la fuente
2. ✅ Implementar comparación histórica en orquestación
3. ✅ Transformar datos al formato esperado
4. ✅ Llamar a `registrar_discovery()` con los parámetros necesarios
5. ❌ NO modificar la firma de `registrar_discovery()`

**Principio:**
> Nuevas fuentes extienden el enum de valores permitidos en `p_fuente` sin modificar la firma de la función.

### Agregar datos observados

Campos observados adicionales pueden agregarse **sin romper el contrato**.

**Regla:**
```
Nuevos datos observados: Permitido (agregar parámetros)
Modificar campos obligatorios: Prohibido
Eliminar campos obligatorios: Prohibido
Cambiar semántica datos observados → enrichment: Prohibido
```

---

## 9. Instrucciones para Claude Code

Si estás leyendo esto como IA para implementar Discovery:

### ✅ DEBES HACER:

1. Producir snapshot crudo en `datos_json_discovery`
2. Extraer datos observados como parámetros de `registrar_discovery()`
3. Comparar snapshot actual vs histórico en BD
4. Detectar: nuevas, existentes, ausentes
5. Decidir estados: `nueva` o `inactivo_pending`
6. Validar tipos de datos
7. Validar rangos (GPS)
8. Respetar la separación: Discovery ≠ Enrichment

### ❌ NO DEBES HACER:

1. NO tratar datos observados como "verdad final"
2. NO romper candados con datos observados
3. NO inferir o calcular datos de negocio
4. NO aplicar lógica de matching
5. NO transformar datos observados en enrichment
6. NO modificar el contrato de output
7. NO delegar detección de ausencias a Flujo C

### Patrón de implementación

```javascript
async function executeDiscovery(fuente) {
  // 1. SNAPSHOT
  const snapshotCrudo = await fetchFromSource(fuente);
  
  // 2. COMPARACIÓN
  const propiedadesExistentes = await db.query(`
    SELECT url, precio_usd, area_total_m2, status
    FROM propiedades_v2
    WHERE fuente = $1 AND status NOT IN ('inactivo_confirmed', 'error')
  `, [fuente]);
  
  const urlsExistentes = new Set(propiedadesExistentes.map(p => p.url));
  const urlsSnapshot = new Set(snapshotCrudo.map(p => p.url));
  
  const nuevas = snapshotCrudo.filter(p => !urlsExistentes.has(p.url));
  const existentes = snapshotCrudo.filter(p => urlsExistentes.has(p.url));
  const ausentes = propiedadesExistentes.filter(p => !urlsSnapshot.has(p.url));
  
  // 3. DECISIÓN - PERSISTIR PRESENTES
  for (const prop of nuevas) {
    await db.query(`
      SELECT * FROM registrar_discovery(
        p_url := $1,
        p_fuente := $2,
        p_codigo_propiedad := $3,
        p_precio_usd := $4,
        p_area_total_m2 := $5,
        p_latitud := $6,
        p_longitud := $7,
        p_datos_json_discovery := $8,
        p_metodo_discovery := $9
      )
    `, [
      prop.url,
      fuente,
      prop.codigo,
      prop.precio,
      prop.area,
      prop.lat,
      prop.lon,
      JSON.stringify(prop),
      'api_rest'
    ]);
  }
  
  for (const prop of existentes) {
    await db.query(`
      SELECT * FROM registrar_discovery(
        p_url := $1,
        p_fuente := $2,
        p_datos_json_discovery := $3,
        -- otros parámetros observados...
      )
    `, [
      prop.url,
      fuente,
      JSON.stringify(prop)
    ]);
  }
  
  // 4. DECISIÓN - MARCAR AUSENTES (orquestación, no función)
  for (const prop of ausentes) {
    await db.query(`
      UPDATE propiedades_v2 
      SET status = 'inactivo_pending', fecha_discovery = NOW()
      WHERE url = $1 AND fuente = $2
        AND status NOT IN ('inactivo_pending', 'inactivo_confirmed')
    `, [prop.url, fuente]);
  }
}
```

**Nota crítica:**
La función `registrar_discovery()` NO detecta ausencias. La detección de ausencias ocurre en la capa de orquestación que compara el snapshot actual contra la BD y ejecuta UPDATEs manuales para marcar `inactivo_pending`.

---

## 10. Versionado del contrato

### Versión actual: 2.0.0

**BREAKING CHANGES desde v1.0.0:**
- Discovery ahora es detector de cambios (no extractor puro)
- Snapshot crudo obligatorio (`datos_json_discovery`)
- Comparación histórica obligatoria (a nivel proceso)
- Detección de ausencias incluida (a nivel orquestación)
- Estados de existencia: `nueva` (inicial), `inactivo_pending` (ausencias)
- Función `registrar_discovery()`: 17+ parámetros (datos observados)
- Unicidad por `(url, fuente)`, no por `(codigo_propiedad, fuente)`
- Datos observados como parámetros individuales + JSONB completo

**Cambios que incrementan versión:**

- **MAJOR (X.0.0):** Cambios incompatibles (ej: cambiar firma de función)
- **MINOR (2.X.0):** Agregar datos observados opcionales
- **PATCH (2.0.X):** Aclaraciones, correcciones de documentación

### Política de cambios

**Cambios PROHIBIDOS:**
- Eliminar campos obligatorios
- Cambiar tipos de campos existentes
- Cambiar semántica de campos existentes
- Eliminar comparación histórica
- Eliminar detección de ausencias

**Cambios PERMITIDOS:**
- Agregar datos observados opcionales (MINOR)
- Agregar valores permitidos en enums (MINOR)
- Mejorar documentación (PATCH)

---

## 11. Responsabilidades por capa

| Capa | Responsabilidad |
|------|----------------|
| **Discovery** | Snapshot + Comparación + Decisión de existencia (crea `nueva`, marca `inactivo_pending`) |
| **Enrichment** | Validar y profundizar datos observados (transiciona a `actualizado`) |
| **Merge** | Unificar Discovery + Enrichment (transiciona a `completado`) |
| **Matching** | Vincular con base de datos maestra |
| **Flujo C** | Confirmar técnicamente (HTTP HEAD/404) cuando aplica (transiciona a `inactivo_confirmed`) |
| **QA** | Validar calidad y completitud |

**Cada capa tiene su contrato.**  
**Este documento define solo el contrato de Discovery.**

---

## 12. Principios de diseño

### 1. Discovery como detector de cambios

Discovery NO es un extractor puro — es un **detector de deltas del mercado**.

### 2. Snapshot inmutable + Datos observados

Snapshot crudo es evidencia histórica. Datos observados son auxiliares para detectar cambios.

### 3. Comparación obligatoria

Discovery SIEMPRE compara contra histórico. NO delega detección de ausencias.

### 4. Estabilidad del contrato

El contrato está diseñado para **no cambiar** en años.

### 5. Composabilidad

Discovery produce output que **alimenta** Enrichment sin acoplamiento.

---

## 13. Antipatrones

### ❌ Antipatrón 1: Discovery sin comparación

```javascript
// ❌ MAL
function discovery() {
  const props = fetchFromSource();
  return props.map(p => ({
    id_externo: p.id,
    // Todas quedan como 'nueva' sin detectar si ya existían
  }));
}
```

### ❌ Antipatrón 2: Datos observados como enrichment

```javascript
// ❌ MAL
{
  precio_usd: 120000,  // Observado
  // Tratarlo como "verdad final" sin validación
  // ❌ PROHIBIDO
}
```

### ❌ Antipatrón 3: Delegar ausencias a Flujo C

```javascript
// ❌ MAL
function discovery() {
  // Solo registra presentes
  // Espera que Flujo C detecte ausencias
  // ❌ PROHIBIDO - Discovery DEBE detectar ausencias
}

// ✅ BIEN
function discovery() {
  const snapshot = fetchFromSource();
  const existentes = getFromDB();
  const ausentes = detectarAusentes(snapshot, existentes);
  
  for (const ausente of ausentes) {
    marcarInactiva(ausente, 'inactivo_pending');
  }
}
```

---

## 14. Checklist de validación

Antes de ejecutar el proceso Discovery, verificar:

**A nivel función `registrar_discovery()`:**
- [ ] URL válida y completa (con http/https)
- [ ] Fuente válida (century21, remax, etc.)
- [ ] JSONB obligatorio en `datos_json_discovery` (snapshot completo)
- [ ] Método discovery especificado
- [ ] GPS opcional - validar rangos solo si se proporciona
- [ ] codigo_propiedad presente (si disponible en fuente)

**A nivel proceso (orquestación):**
- [ ] Snapshot crudo capturado completamente
- [ ] Comparación histórica ejecutada (por url + fuente)
- [ ] Ausencias detectadas correctamente
- [ ] Ausencias marcadas como `inactivo_pending`
- [ ] Propiedades nuevas insertadas con status='nueva'
- [ ] Propiedades existentes actualizadas sin perder estado
- [ ] Sin duplicados por `(url, fuente)`
- [ ] Candados respetados en datos observados
- [ ] Sin lógica de matching aplicada

---

## 15. Casos límite

### ¿Qué pasa si no hay GPS?

**Respuesta:** El registro es **válido**.  
GPS (`latitud`, `longitud`) es campo **opcional** pero muy recomendado para:
- Matching con proyectos
- Validación geográfica
- Análisis de mercado por zona

### ¿Qué pasa si el precio cambió?

**Respuesta:** Discovery registra el nuevo precio como **dato observado**.
- NO rompe candados
- NO reemplaza enrichment
- SÍ puede disparar re-scraping en Flujo B

### ¿Qué pasa si una propiedad no aparece?

**Respuesta:** La orquestación de Discovery detecta la ausencia y marca `inactivo_pending`.
- La función `registrar_discovery()` NO maneja ausencias
- La orquestación (n8n) ejecuta UPDATE separado
- Flujo C puede confirmar técnicamente después

### ¿Qué pasa si faltan datos observados?

**Respuesta:** Se persiste con lo que hay.
- Todos los parámetros excepto url y fuente son opcionales
- El JSONB contiene el snapshot completo
- Enrichment puede llenar los vacíos después

---

**FIN DEL DOCUMENTO**

⚠️ Este contrato es la fuente de verdad para Discovery. Cualquier cambio debe seguir el proceso de versionado semántico.