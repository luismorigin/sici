# SICI - Guía de Onboarding para Claude

**Propósito:** Permitir que cualquier instancia de Claude (chat, Claude Code, nueva conversación) entienda rápidamente el proyecto SICI y sepa dónde encontrar información.

**Última actualización:** 24 Diciembre 2025

---

## 🎯 ¿Qué es SICI?

**SICI = Sistema Inteligente de Captura Inmobiliaria**

Es una plataforma de inteligencia inmobiliaria para Bolivia que crea un "censo vivo" de propiedades en Equipetrol, Santa Cruz. Captura datos de portales inmobiliarios (Century21, Remax), los enriquece, y los asocia con proyectos/edificios conocidos.

---

## 📁 ESTRUCTURA DE REPOS LOCALES

Hay **2 repositorios principales** en el escritorio de Luis:

```
C:\Users\LUCHO\Desktop\Censo inmobiliario\
├── sici\                      ← REPO PRINCIPAL (Módulo 1 - Producción)
└── sici-matching\             ← REPO MATCHING (Módulo 2 - En desarrollo)
```

---

## 📂 REPO 1: sici\ (Principal)

**Ruta:** `C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\`

### Estructura
```
sici\
├── docs\
│   ├── canonical\           ← 📌 DOCUMENTOS DEFINITIVOS
│   │   ├── discovery_canonical_v2.md
│   │   ├── flujo_b_corepp_canonical.md
│   │   ├── flujo_c_verificador_canonical.md
│   │   └── merge_canonical.md
│   ├── extractores\
│   │   └── heuristics\      ← Lógica de extracción por portal
│   ├── research\            ← Investigación de APIs/portales
│   ├── modulo_2\            ← PLAN MÓDULO 2
│   │   └── PLAN_MODULO_2_v2.0.md  ← 📌 PLAN ACTUAL
│   ├── MODULO_1_ESTADO_FINAL.md  ← 📌 ESTADO ACTUAL MÓDULO 1
│   └── GUIA_ONBOARDING_CLAUDE.md ← 📌 ESTE ARCHIVO
│
├── n8n\
│   ├── extractores\         ← JSONs de extractores
│   │   ├── extractor_century21.json
│   │   └── extractor_remax.json
│   └── workflows\
│       └── modulo_1\        ← 📌 WORKFLOWS PRODUCCIÓN
│           ├── flujo_a_discovery_century21_v1.0.3_FINAL.json
│           ├── flujo_a_discovery_remax_v1.0.2_FINAL.json
│           ├── flujo_b_processing_v3.0.json
│           ├── flujo_c_verificador_v1.1.0_FINAL.json
│           └── Flujo Merge - Nocturno v1.0.0.json
│
├── sql\
│   ├── functions\
│   │   ├── discovery\       ← registrar_discovery.sql
│   │   ├── enrichment\      ← registrar_enrichment.sql
│   │   ├── merge\           ← 📌 merge_discovery_enrichment.sql (v2.0.1)
│   │   └── tc_dinamico\     ← Tipo de cambio dinámico
│   ├── schema\
│   │   └── propiedades_v2_schema.md  ← 📌 SCHEMA TABLA PRINCIPAL
│   └── migrations\
│
└── README.md
```

### Archivos Clave para Leer Primero
1. `docs/GUIA_ONBOARDING_CLAUDE.md` - Este archivo
2. `docs/modulo_2/PLAN_MODULO_2_v2.0.md` - Plan del Módulo 2
3. `docs/MODULO_1_ESTADO_FINAL.md` - Estado completo del sistema
4. `sql/schema/propiedades_v2_schema.md` - Estructura de la BD
5. `sql/functions/merge/merge_discovery_enrichment.sql` - Función de merge

---

## 📂 REPO 2: sici-matching\ (Matching)

**Ruta:** `C:\Users\LUCHO\Desktop\Censo inmobiliario\sici-matching\`

### Estructura
```
sici-matching\
├── assets\
│   └── zonas-geograficas\   ← GeoJSON de Equipetrol
│
├── Docs\
│   ├── catalogo_post_fase1.md
│   └── proyectos_master_catalogo.md  ← 📌 LISTA DE 165 PROYECTOS
│
├── subsistema-matching-propiedades\
│   ├── Sql\
│   │   ├── funciones\       ← 📌 FUNCIONES DE MATCHING
│   │   │   ├── matching_completo_automatizado.sql
│   │   │   ├── generar_matches_por_nombre.sql
│   │   │   ├── generar_matches_por_url.sql
│   │   │   ├── generar_matches_fuzzy.sql
│   │   │   ├── generar_matches_gps_limpio.sql
│   │   │   └── aplicar_matches_aprobados.sql
│   │   └── schema\
│   │       └── tablas.sql   ← 📌 SCHEMA MATCHING (¡USA TABLA VIEJA!)
│   │
│   ├── n8n\                 ← Workflows de extractores con fuzzy
│   ├── extractores\         ← Documentación de extractores
│   ├── workflows\           ← Docs de Flujo A, B, C
│   ├── matching-nocturno.md ← 📌 DISEÑO DEL MATCHING NOCTURNO
│   ├── Funciones_SQL.md     ← Documentación de funciones
│   └── Arquitectura_de_Base_de_Datos.md
│
└── subsistema-validacion-gps\
    ├── sql\
    │   ├── funciones\       ← Funciones GPS/Google Places
    │   └── schema\
    │       └── sql_proyectos_master_schema.sql  ← 📌 SCHEMA PROYECTOS
    ├── n8n\                 ← Workflows validación GPS
    └── FASE1_VALIDACION_GPS.md
```

### Archivos Clave para Leer Primero
1. `subsistema-matching-propiedades/matching-nocturno.md` - Diseño del matching
2. `subsistema-matching-propiedades/Sql/funciones/` - Todas las funciones SQL
3. `Docs/proyectos_master_catalogo.md` - Lista de proyectos

---

## 🗄️ BASE DE DATOS (Supabase)

### Tablas Principales

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `propiedades_v2` | 427 | **TABLA PRINCIPAL** - Propiedades activas |
| `proyectos_master` | 165 | Edificios/proyectos verificados |
| `matching_sugerencias` | 152 | Cola de sugerencias de matching |
| `propiedades` | legacy | ⚠️ DEPRECADA - No usar |

### Columnas Críticas de propiedades_v2

```sql
-- Identificación
id, url, fuente, codigo_propiedad

-- Datos físicos
area_total_m2, dormitorios, banos, estacionamientos, latitud, longitud

-- Precios
precio_usd, moneda_original, tipo_cambio_usado, precio_usd_actualizado

-- Matching
id_proyecto_master, id_proyecto_master_sugerido, metodo_match, confianza_match

-- Estado
status, es_activa, es_para_matching, es_multiproyecto

-- Arquitectura Dual (JSONB)
datos_json_discovery   ← Snapshot de API (inmutable)
datos_json_enrichment  ← Datos de HTML scraping (inmutable)
datos_json             ← Merge consolidado (actualizable)
campos_bloqueados      ← Candados para proteger datos manuales
```

### ⚠️ PROBLEMAS CONOCIDOS (24 Dic 2025)

**1. Columnas faltantes en propiedades_v2:**

| Columna | Matching la necesita | Ubicación actual | Solución |
|---------|---------------------|------------------|----------|
| `nombre_edificio` | ✅ Crítica | `datos_json.proyecto.nombre_edificio` | Agregar + modificar merge |
| `zona` | ✅ Crítica (filtro fuzzy) | `datos_json.ubicacion.zona_validada_gps` | Agregar + modificar merge |

**2. Funciones de matching apuntan a tabla incorrecta:**
- Actualmente: `FROM propiedades` (deprecada)
- Correcto: `FROM propiedades_v2` (producción)

**Solución planificada:** Ver `docs/modulo_2/PLAN_MODULO_2_v2.0.md` Fase 0

---

## 🔄 PIPELINE ACTUAL (Módulo 1 - Producción)

```
1:00 AM  → Flujo A Discovery (Century21 + Remax)
           Captura ~273 C21 + ~160 Remax propiedades
           ↓
2:00 AM  → Flujo B Enrichment
           Extrae detalles de HTML
           ↓
3:00 AM  → Flujo Merge
           Combina Discovery + Enrichment
           ↓
6:00 AM  → Flujo C Verificador
           Confirma propiedades inactivas
```

### Módulo 2 (Por Implementar)
```
4:00 AM  → Matching Nocturno (PENDIENTE)
           Asocia propiedades → proyectos_master
```

---

## 🔧 STACK TECNOLÓGICO

| Componente | Tecnología |
|------------|------------|
| Orquestación | n8n (self-hosted en Elestio) |
| Base de Datos | Supabase PostgreSQL |
| Scraping HTML | Firecrawl API |
| GPS Validation | Google Places API |
| Notificaciones | Slack |
| Version Control | GitHub Desktop |

---

## 📋 QUERIES ÚTILES

### Ver estado general
```sql
SELECT status, COUNT(*) 
FROM propiedades_v2 
GROUP BY status;
```

### Ver propiedades sin proyecto
```sql
SELECT COUNT(*) 
FROM propiedades_v2 
WHERE id_proyecto_master IS NULL 
  AND status IN ('completado', 'actualizado', 'nueva');
```

### Extraer nombre_edificio del JSON
```sql
SELECT 
    id,
    url,
    datos_json->'proyecto'->>'nombre_edificio' as nombre_edificio
FROM propiedades_v2
WHERE datos_json->'proyecto'->>'nombre_edificio' IS NOT NULL
LIMIT 10;
```

### Ver proyectos master
```sql
SELECT id_proyecto_master, nombre_oficial, zona
FROM proyectos_master
WHERE activo = TRUE
ORDER BY nombre_oficial;
```

### Ver funciones de matching existentes
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_type = 'FUNCTION'
  AND routine_name LIKE '%match%';
```

---

## 🎯 CONTEXTO PARA NUEVAS CONVERSACIONES

Si empiezas una nueva conversación con Claude, copia esto:

```
Estoy trabajando en SICI, un sistema de inteligencia inmobiliaria para Bolivia.

REPOS LOCALES:
- C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\ = Repo principal (Módulo 1 completado)
- C:\Users\LUCHO\Desktop\Censo inmobiliario\sici-matching\ = Repo de matching (Módulo 2 en desarrollo)

ESTADO ACTUAL (24 Dic 2025):
- 427 propiedades en propiedades_v2
- 165 proyectos en proyectos_master  
- 395 propiedades SIN proyecto asignado (100%)
- Funciones de matching existen pero apuntan a tabla vieja (`propiedades` en vez de `propiedades_v2`)

PROBLEMAS POR RESOLVER:
1. Funciones SQL en sici-matching usan `propiedades` (deprecada) → migrar a `propiedades_v2`
2. Faltan columnas en propiedades_v2 que matching necesita:
   - `nombre_edificio` (está en datos_json.proyecto.nombre_edificio)
   - `zona` (está en datos_json.ubicacion.zona_validada_gps)
3. Merge debe modificarse para poblar estas columnas automáticamente

ARCHIVOS CLAVE PARA LEER:
- sici/docs/GUIA_ONBOARDING_CLAUDE.md (este archivo)
- sici/docs/modulo_2/PLAN_MODULO_2_v2.0.md (plan detallado)
- sici/docs/MODULO_1_ESTADO_FINAL.md
- sici/sql/functions/merge/merge_discovery_enrichment.sql
- sici-matching/subsistema-matching-propiedades/Sql/funciones/
```

---

## 🔑 PRINCIPIOS DEL PROYECTO

1. **"Manual wins over automatic"** - Datos corregidos manualmente nunca se sobrescriben
2. **Discovery > Enrichment** - Para datos físicos, Discovery tiene prioridad
3. **Scoring post-merge** - La calidad se calcula sobre datos consolidados
4. **Incremental > Rewrite** - Preferir mejoras pequeñas sobre reescrituras totales
5. **Columnas sostenibles** - Si un módulo necesita una columna:
   - Agregarla al schema (una vez)
   - Modificar merge para poblarla automáticamente (permanente)
   - Migrar datos existentes (una vez)
   - **NUNCA** depender solo de scripts one-time

---

## 📊 ESTADO POR MÓDULO

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| Módulo 1 | ✅ 100% | Discovery + Enrichment + Merge |
| Módulo 1.5 | ✅ 100% | Merge v2.0.1 |
| Módulo 2 | 📋 0% | Matching de Propiedades (Plan listo) |
| Módulo 3 | 🔴 Diseño | Unidades Reales/Virtuales |
| Módulo 4 | 🔴 Diseño | Matching Clientes |

---

## 📝 CÓMO USAR ESTA GUÍA

### En Claude.ai (chat web)
1. Copia la sección "Contexto para nuevas conversaciones"
2. Pégala al inicio de tu mensaje
3. Claude tendrá contexto básico inmediato

### En Claude Code
1. Apunta al repo con `--directory`
2. Pide leer `docs/GUIA_ONBOARDING_CLAUDE.md` primero
3. Luego lee los archivos clave según el módulo que trabajes

### En caso de conversación cortada
1. Abre nueva conversación
2. Pega el contexto rápido
3. Continúa donde quedaste

---

**FIN DE LA GUÍA DE ONBOARDING**

*Última actualización: 24 Diciembre 2025*
