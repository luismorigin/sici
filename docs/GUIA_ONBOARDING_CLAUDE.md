# SICI - Guía de Onboarding para Claude

**Propósito:** Permitir que cualquier instancia de Claude (chat, Claude Code, nueva conversación) entienda rápidamente el proyecto SICI y sepa dónde encontrar información.

**Última actualización:** 1 Enero 2026
**Versión:** 3.1

---

## 🎯 ¿Qué es SICI?

**SICI = Sistema Inteligente de Captura Inmobiliaria**

Es una plataforma de inteligencia inmobiliaria para Bolivia que crea un "censo vivo" de propiedades en Equipetrol, Santa Cruz. Captura datos de portales inmobiliarios (Century21, Remax), los enriquece, y los asocia con proyectos/edificios conocidos.

---

## 📊 MÉTRICAS ACTUALES (1 Ene 2026)

| Métrica | Valor |
|---------|-------|
| Total propiedades | 431 |
| Propiedades completadas | 350 |
| Con proyecto asignado | 338 (**96.6%**) |
| Pendientes de match | 1 |
| Proyectos activos | 190 |
| Microzonas GPS | 7 (Equipetrol) |

---

## 📁 ESTRUCTURA DEL REPOSITORIO

```
C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\
├── CLAUDE.md                  ← Configuración Claude Code
├── README.md                  ← Estado general del proyecto
├── config.local.json          ← Credenciales (gitignored)
│
├── docs/
│   ├── canonical/             ← Documentos definitivos (Módulo 1)
│   ├── modulo_2/              ← Specs y planes de matching
│   │   ├── MATCHING_NOCTURNO_SPEC.md
│   │   ├── SIN_MATCH_SPEC.md
│   │   ├── AUDITORIA_DIARIA_SPEC.md
│   │   ├── PLAN_MODULO_2_v2.1.md
│   │   └── PLAN_MATCHING_MULTIFUENTE_v3.0.md
│   ├── GUIA_ONBOARDING_CLAUDE.md  ← Este archivo
│   └── MODULO_1_ESTADO_FINAL.md
│
├── n8n/
│   ├── extractores/           ← JSONs de extractores
│   └── workflows/
│       ├── modulo_1/          ← Flujos A, B, C, Merge
│       └── modulo_2/          ← Matching, Supervisores, Auditoría
│
├── sql/
│   ├── functions/
│   │   ├── discovery/         ← registrar_discovery.sql
│   │   ├── enrichment/        ← registrar_enrichment.sql
│   │   ├── merge/             ← merge_discovery_enrichment.sql
│   │   └── matching/          ← Funciones v3.1 + RPCs
│   ├── migrations/            ← 001-012
│   └── schema/                ← propiedades_v2_schema.md
│
└── geodata/
    └── microzonas_equipetrol_v4.geojson
```

---

## 🗄️ BASE DE DATOS (Supabase)

### Tablas Principales

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| `propiedades_v2` | 431 | **TABLA PRINCIPAL** - Propiedades activas |
| `proyectos_master` | 190 activos | Edificios/proyectos verificados |
| `matching_sugerencias` | Variable | Cola de sugerencias de matching |
| `sin_match_exportados` | Variable | Tracking de props exportadas al Sheet |
| `zonas_geograficas` | 7 | Polígonos PostGIS de microzonas |
| `auditoria_snapshots` | Variable | ✅ Poblada diariamente (v2.2+) |
| `propiedades` | legacy | **DEPRECADA - NO USAR** |

### Columnas Críticas de propiedades_v2

```sql
-- Identificación
id, url, fuente, codigo_propiedad

-- Datos físicos
area_total_m2, dormitorios, banos, latitud, longitud

-- Precios
precio_usd, moneda_original, tipo_cambio_usado

-- Matching (96.6% poblado)
id_proyecto_master          ← Proyecto asignado
metodo_match, confianza_match

-- Estado
status, es_activa, es_para_matching, es_multiproyecto

-- Arquitectura Dual (JSONB)
datos_json_discovery   ← Snapshot de API (inmutable)
datos_json_enrichment  ← Datos de HTML scraping (inmutable)
datos_json             ← Merge consolidado
campos_bloqueados      ← Candados para proteger datos manuales
```

---

## 🔄 PIPELINE NOCTURNO

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
4:00 AM  → Matching Nocturno ✅
           Ejecuta matching_completo_automatizado()
           Auto-aprueba ≥85%, pendientes → Sheet
           ↓
6:00 AM  → Flujo C Verificador
           Confirma propiedades inactivas
           ↓
7:00 AM  → Exportar Sin Match
           Propiedades sin proyecto → Sheet Sin_Match
           ↓
8:00 PM  → Matching Supervisor
           Procesa decisiones de Pendientes_Matching
           ↓
8:30 PM  → Supervisor Sin Match
           Procesa decisiones de Sin_Match
           ↓
9:00 AM  → Auditoría Diaria v2.2
           Reporte Slack + guarda snapshots
```

---

## 🎯 ESTADO DE FASES - MÓDULO 2

### ✅ COMPLETADAS

| Fase | Descripción | Fecha |
|------|-------------|-------|
| **FASE 1** | Matching Nocturno + Migración SQL v3.0 | 28 Dic 2025 |
| **FASE 2** | Human-in-the-Loop completo | 31 Dic 2025 |
| **FASE 5** | Pipeline activado (crons activos) | 29 Dic 2025 |

**Sistema HITL Implementado:**
- Matching Supervisor: APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO
- Supervisor Sin Match: ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO
- Dropdown de proyectos con sincronización automática
- Eliminación de filas procesadas (ordenada DESC para evitar index shift)
- Fix de "null" string de n8n (migración 012)

### ❌ PENDIENTES

| Fase | Descripción | Esfuerzo Est. |
|------|-------------|---------------|
| **FASE 3** | Enriquecimiento IA de Proyectos | ~16h |
| **FASE 4** | Validación GPS (parcial) | ~8h |

**FASE 3 - Detalle Pendiente:**
```sql
-- Columnas a agregar a proyectos_master
ALTER TABLE proyectos_master ADD COLUMN IF NOT EXISTS
  desarrolladora VARCHAR(100),
  ano_construccion INTEGER,
  total_unidades INTEGER,
  amenities_ia JSONB,
  descripcion_marketing TEXT,
  segmento_mercado VARCHAR(50),
  metadata_ia JSONB,
  fecha_enriquecimiento TIMESTAMPTZ;
```

**Funciones Pendientes:**
- `heredar_metadata_proyecto()` - Trigger para heredar metadata a propiedades
- `validar_sugerencias_extractor()` - Combinar sugerencias extractor + matching

---

## 📋 QUERIES ÚTILES

### Estado general
```sql
SELECT status, fuente, COUNT(*)
FROM propiedades_v2
GROUP BY status, fuente;
```

### Tasa de matching
```sql
SELECT
    COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto,
    COUNT(*) FILTER (WHERE status = 'completado') as completadas,
    ROUND(100.0 * COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) /
          NULLIF(COUNT(*) FILTER (WHERE status = 'completado'), 0), 1) as tasa_matching
FROM propiedades_v2;
```

### Pendientes de revisión
```sql
SELECT COUNT(*) as pendientes
FROM matching_sugerencias
WHERE estado = 'pendiente';
```

### Proyectos activos
```sql
SELECT id_proyecto_master, nombre_oficial,
       gps_verificado_google, google_place_id IS NOT NULL as tiene_place_id
FROM proyectos_master
WHERE activo = TRUE
ORDER BY nombre_oficial;
```

---

## 🔧 STACK TECNOLÓGICO

| Componente | Tecnología |
|------------|------------|
| Orquestación | n8n (self-hosted en Elestio) |
| Base de Datos | Supabase PostgreSQL + PostGIS |
| Scraping HTML | Firecrawl API |
| GPS Validation | Google Places API |
| Notificaciones | Slack |
| Revisión Humana | Google Sheets |
| Version Control | GitHub |
| Desarrollo | Claude Code |

---

## 🎯 CONTEXTO PARA NUEVAS CONVERSACIONES

Si empiezas una nueva conversación con Claude, copia esto:

```
Estoy trabajando en SICI, un sistema de inteligencia inmobiliaria para Bolivia.

ESTADO ACTUAL (1 Ene 2026):
- 431 propiedades en propiedades_v2
- 338 matcheadas (96.6%) con id_proyecto_master
- 190 proyectos activos en proyectos_master
- Sistema Human-in-the-Loop COMPLETO y funcionando

FASES COMPLETADAS:
- FASE 1: Matching Nocturno v3.1 ✅
- FASE 2: HITL (APROBAR, RECHAZAR, CORREGIR, CREAR, ASIGNAR) ✅
- FASE 5: Pipeline nocturno activo ✅

PENDIENTE:
- FASE 3: Enriquecimiento IA de proyectos
- FASE 4: Validación GPS completa

ARCHIVOS CLAVE:
- sici/CLAUDE.md (configuración)
- sici/docs/GUIA_ONBOARDING_CLAUDE.md (este archivo)
- sici/docs/modulo_2/*.md (specs)
- sici/sql/migrations/ (001-012)

REPO LEGACY:
- sici-matching/ = NO USAR (deprecado)
```

---

## 🔑 PRINCIPIOS DEL PROYECTO

1. **"Manual wins over automatic"** - Datos corregidos manualmente nunca se sobrescriben
2. **Discovery > Enrichment** - Para datos físicos, Discovery tiene prioridad
3. **SQL > Regex** - Potenciar matching en BD, no perseguir patrones en extractores
4. **Human-in-the-Loop** - Sistema completo para revisión humana cuando confianza < 85%
5. **Incremental > Rewrite** - Preferir mejoras pequeñas sobre reescrituras totales

---

## 📚 DOCUMENTOS DE REFERENCIA

| Documento | Ruta | Propósito |
|-----------|------|-----------|
| Configuración Claude | `CLAUDE.md` | Quick context + MCP |
| Plan Matching v3.2 | `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` | Estado actual |
| Spec Matching | `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` | Arquitectura HITL |
| Spec Sin Match | `docs/modulo_2/SIN_MATCH_SPEC.md` | Sistema Sin Match |
| Estado Módulo 1 | `docs/MODULO_1_ESTADO_FINAL.md` | Cierre formal |
| CHANGELOG Matching | `sql/functions/matching/CHANGELOG_MATCHING.md` | Historial |

---

## 🚀 COMANDOS CLAUDE CODE

```bash
# Iniciar en proyecto SICI
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici"
claude

# Para consultas de BD
# MCP postgres-sici está configurado con usuario readonly
```

---

**FIN DE LA GUÍA DE ONBOARDING v3.1**
