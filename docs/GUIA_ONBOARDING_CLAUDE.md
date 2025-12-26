# SICI - Guía de Onboarding para Claude

**Propósito:** Permitir que cualquier instancia de Claude (chat, Claude Code, nueva conversación) entienda rápidamente el proyecto SICI y sepa dónde encontrar información.

**Última actualización:** 26 Diciembre 2025  
**Versión:** 2.0

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
└── sici-matching\             ← REPO MATCHING (Funciones SQL legacy)
```

---

## 📂 REPO 1: sici\ (Principal - ACTIVO)

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
│   ├── MODULO_1_ESTADO_FINAL.md  ← 📌 ESTADO ACTUAL MÓDULO 1
│   ├── GUIA_ONBOARDING_CLAUDE.md ← 📌 ESTE ARCHIVO
│   └── modulo_2\            ← Documentación Módulo 2
│       ├── PLAN_MODULO_2_v2.1.md        ← Plan general
│       └── PLAN_MATCHING_MULTIFUENTE_v3.0.md ← 🔥 Plan activo FASE 1
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
│   │   ├── merge\           ← 📌 merge_discovery_enrichment.sql (v2.0.0)
│   │   └── tc_dinamico\     ← Tipo de cambio dinámico
│   ├── schema\
│   │   └── propiedades_v2_schema.md  ← 📌 SCHEMA TABLA PRINCIPAL
│   └── migrations\
│
└── README.md
```

### Archivos Clave para Leer Primero
1. `docs/GUIA_ONBOARDING_CLAUDE.md` - Este archivo (contexto general)
2. `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` - Plan activo
3. `docs/MODULO_1_ESTADO_FINAL.md` - Estado del Módulo 1
4. `sql/schema/propiedades_v2_schema.md` - Estructura de la BD

---

## 📂 REPO 2: sici-matching\ (Funciones SQL - REQUIERE MIGRACIÓN)

**Ruta:** `C:\Users\LUCHO\Desktop\Censo inmobiliario\sici-matching\`

### ⚠️ ESTADO CRÍTICO
Las funciones SQL en este repo **apuntan a tabla `propiedades` (deprecada)**.
Deben migrarse a `propiedades_v2`. Ver `sici/docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md`.

### Estructura
```
sici-matching\
├── assets\
│   └── zonas-geograficas\   ← GeoJSON de Equipetrol
│
├── Docs\
│   ├── catalogo_post_fase1.md
│   └── proyectos_master_catalogo.md  ← 📌 LISTA DE 152+ PROYECTOS
│
├── subsistema-matching-propiedades\
│   ├── Sql\
│   │   ├── funciones\       ← 📌 FUNCIONES DE MATCHING (¡MIGRAR!)
│   │   │   ├── matching_completo_automatizado.sql
│   │   │   ├── generar_matches_por_nombre.sql
│   │   │   ├── generar_matches_por_url.sql
│   │   │   ├── generar_matches_fuzzy.sql
│   │   │   ├── generar_matches_gps_limpio.sql (OFF)
│   │   │   └── aplicar_matches_aprobados.sql
│   │   └── schema\
│   │       └── tablas.sql   ← ⚠️ USA TABLA VIEJA
│   │
│   ├── matching-nocturno.md ← Diseño del pipeline
│   └── Funciones_SQL.md     ← Documentación de funciones
│
└── subsistema-validacion-gps\
    └── (GPS validation workflows)
```

---

## 🗄️ BASE DE DATOS (Supabase)

### Tablas Principales

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `propiedades_v2` | ~214+ | **TABLA PRINCIPAL** - Propiedades activas |
| `proyectos_master` | 152+ | Edificios/proyectos verificados |
| `matching_sugerencias` | Variable | Cola de sugerencias de matching |
| `propiedades` | legacy | ⚠️ **DEPRECADA - NO USAR** |

### Columnas Críticas de propiedades_v2

```sql
-- Identificación
id, url, fuente, codigo_propiedad

-- Datos físicos
area_total_m2, dormitorios, banos, latitud, longitud

-- Precios
precio_usd, moneda_original, tipo_cambio_usado

-- Matching (OBJETIVO MÓDULO 2)
id_proyecto_master          ← 100% NULL actualmente
id_proyecto_master_sugerido ← Del extractor fuzzy
metodo_match, confianza_match

-- Estado
status, es_activa, es_para_matching, es_multiproyecto

-- Arquitectura Dual (JSONB)
datos_json_discovery   ← Snapshot de API (inmutable)
datos_json_enrichment  ← Datos de HTML scraping (inmutable)
datos_json             ← Merge consolidado
campos_bloqueados      ← Candados para proteger datos manuales

-- IMPORTANTE: nombre_edificio
nombre_edificio        ← Columna (a veces NULL)
-- O extraer del JSON:
datos_json_enrichment->>'nombre_edificio'
```

---

## 🔄 PIPELINE ACTUAL (Módulo 1 - Producción)

```
1:00 AM  → Flujo A Discovery (Century21 + Remax)
           Captura ~180 C21 + ~160 Remax propiedades
           ↓
2:00 AM  → Flujo B Enrichment
           Extrae detalles de HTML + fuzzy pre-matching
           ↓
3:00 AM  → Flujo Merge
           Combina Discovery + Enrichment
           ↓
4:00 AM  → Matching Nocturno ← 🔥 PENDIENTE IMPLEMENTAR
           Asocia propiedades → proyectos_master
           ↓
6:00 AM  → Flujo C Verificador
           Confirma propiedades inactivas
```

---

## 🎯 ESTADO ACTUAL DEL PROYECTO

### Módulo 1: Discovery & Existencia ✅ COMPLETADO
- Pipeline nocturno operativo
- ~214 propiedades procesadas
- Extractores con fuzzy pre-matching integrado

### Módulo 2: Matching Propiedades → Proyectos 🔥 EN PROGRESO

**Problema actual:**
- 100% de propiedades SIN `id_proyecto_master`
- Funciones SQL existen pero apuntan a tabla legacy
- `nombre_edificio` a veces NULL en columna, pero existe en JSON

**Plan activo:** `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md`

**Enfoque v3.0:**
1. ❌ NO perseguir mejoras de regex en extractores
2. ✅ Potenciar matching SQL con multi-fuente
3. ✅ Migrar funciones a `propiedades_v2`
4. ✅ Usar URL directamente para matching (no depende del extractor)

**Fases:**
```
FASE 1: Migrar funciones SQL (1 día)
FASE 2: Ejecutar y medir (1 día)
FASE 3: Optimizar para escalabilidad (1-2 días)
FASE 4: Recuperar datos existentes (opcional)
FASE 5: Activar matching nocturno
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
| Desarrollo | Claude Code + Plugin dev-workflows |

---

## 📋 QUERIES ÚTILES

### Ver estado general
```sql
SELECT status, fuente, COUNT(*) 
FROM propiedades_v2 
GROUP BY status, fuente;
```

### Ver propiedades sin proyecto (el problema actual)
```sql
SELECT COUNT(*) as sin_proyecto
FROM propiedades_v2 
WHERE id_proyecto_master IS NULL 
  AND status IN ('completado', 'actualizado');
```

### Extraer nombre_edificio (columna O JSON)
```sql
SELECT 
  id,
  url,
  COALESCE(
    NULLIF(nombre_edificio, ''),
    datos_json_enrichment->>'nombre_edificio'
  ) as nombre_edificio,
  datos_json_enrichment->>'fuente_nombre_edificio' as fuente
FROM propiedades_v2
WHERE status IN ('completado', 'actualizado')
LIMIT 20;
```

### Ver proyectos master disponibles
```sql
SELECT id_proyecto_master, nombre_oficial, alias_conocidos, zona
FROM proyectos_master
WHERE activo = TRUE
ORDER BY nombre_oficial;
```

### Diagnóstico de matching
```sql
SELECT 
  fuente,
  COUNT(*) as total,
  COUNT(nombre_edificio) as con_nombre_columna,
  COUNT(datos_json_enrichment->>'nombre_edificio') as con_nombre_json,
  COUNT(id_proyecto_master) as con_match
FROM propiedades_v2
WHERE status IN ('completado', 'actualizado')
GROUP BY fuente;
```

---

## 🎯 CONTEXTO PARA NUEVAS CONVERSACIONES

Si empiezas una nueva conversación con Claude, copia esto:

```
Estoy trabajando en SICI, un sistema de inteligencia inmobiliaria para Bolivia.

REPOS LOCALES:
- sici\ = Repo principal (Módulo 1 completado, producción)
- sici-matching\ = Funciones SQL de matching (requieren migración)

ESTADO ACTUAL (Dic 2025):
- ~214 propiedades en propiedades_v2
- 152+ proyectos en proyectos_master  
- 100% propiedades SIN id_proyecto_master (problema a resolver)
- Funciones de matching existen pero usan tabla deprecada

PLAN ACTIVO: docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md
- Enfoque: Potenciar SQL, no regex de extractores
- Paso 1: Migrar funciones de `propiedades` → `propiedades_v2`
- Paso 2: Ejecutar matching y medir resultados
- Paso 3: Optimizar para escalabilidad

ARCHIVOS CLAVE:
- sici/docs/GUIA_ONBOARDING_CLAUDE.md (este archivo)
- sici/docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md
- sici/docs/modulo_2/PLAN_MODULO_2_v2.1.md
- sici-matching/subsistema-matching-propiedades/Sql/funciones/
```

---

## 🔑 PRINCIPIOS DEL PROYECTO

1. **"Manual wins over automatic"** - Datos corregidos manualmente nunca se sobrescriben (sistema de candados)
2. **Discovery > Enrichment** - Para datos físicos, Discovery tiene prioridad
3. **Scoring post-merge** - La calidad se calcula sobre datos consolidados
4. **Incremental > Rewrite** - Preferir mejoras pequeñas sobre reescrituras totales
5. **SQL > Regex** - Potenciar matching en BD, no perseguir patrones en extractores
6. **Zero human-in-the-loop** - Diseño orientado a automatización completa

---

## 📚 DOCUMENTOS DE REFERENCIA

| Documento | Ruta | Propósito |
|-----------|------|-----------|
| Plan Matching v3.0 | `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` | 🔥 Plan activo FASE 1 |
| Plan Módulo 2 | `docs/modulo_2/PLAN_MODULO_2_v2.1.md` | Plan completo (Fases 1-4) |
| Estado Módulo 1 | `docs/MODULO_1_ESTADO_FINAL.md` | Cierre formal Módulo 1 |
| Funciones SQL | `sici-matching/.../Sql/funciones/` | Código a migrar |
| Catálogo Proyectos | `sici-matching/Docs/proyectos_master_catalogo.md` | Lista de 152+ proyectos |

---

## 🚀 COMANDOS CLAUDE CODE

```bash
# Iniciar en proyecto SICI
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici"
claude

# Para features complejas
/dev-workflows:implement [descripción]

# Para diagnóstico
/dev-workflows:diagnose

# Limpiar conversación
/clear
```

---

**FIN DE LA GUÍA DE ONBOARDING v2.0**
