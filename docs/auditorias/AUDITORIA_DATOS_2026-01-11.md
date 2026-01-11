# REPORTE COMPLETO DE AUDITORIA SICI - DATOS

**Fecha:** 11 Enero 2026
**Fuentes:** Documentacion del repo + Base de datos real (MCP PostgreSQL)

---

## RESUMEN EJECUTIVO

| Categoria | Contradicciones |
|-----------|-----------------|
| Conteos de datos | 8 |
| Migraciones SQL | 4 |
| Nomenclatura | 3 |
| Horarios/Schedules | 2 |
| Versiones | 3 |
| Keys JSON | 2 |
| **TOTAL** | **22 contradicciones** |

---

## 1. CONTEOS DE PROPIEDADES (CRITICO)

### Base de Datos REAL (Ground Truth)
```
Total propiedades:     453
Status completado:     331
Con proyecto match:    321 (97.0% de completadas)
Para matching:         430
Ventas:               409
Unidades buscables:   295 (venta + area>=20 + es_para_matching)
```

### Documentacion vs Realidad

| Documento | Total | Completadas | Matcheadas | Error |
|-----------|-------|-------------|------------|-------|
| **BD REAL** | **453** | **331** | **321 (97.0%)** | - |
| CLAUDE.md | 438 | 312 | 312 (100%) | -15, -19, +3% |
| README.md | 431 | 350 | 338 (96.6%) | -22, +19, -0.4% |
| ARQUITECTURA | 439 | - | - | -14 |
| GUIA_ONBOARDING | 431 | 350 | 338 | -22, +19 |

**Problema:** Cada documento tiene numeros diferentes, ninguno coincide con la BD.

---

## 2. CONTEOS DE PROYECTOS

### Base de Datos REAL
```
Total proyectos activos:  189
Con desarrollador:        173 (91.5%)
Sin desarrollador:        16 (8.5%)
GPS verificado:           165 (87.3%)
```

### Documentacion vs Realidad

| Documento | Proyectos | GPS % | Sin Desarrollador | Error |
|-----------|-----------|-------|-------------------|-------|
| **BD REAL** | **189** | **87.3%** | **16** | - |
| CLAUDE.md | 187 | 98.9% | 15 | -2, +11.6% |
| README.md | 190 | - | - | +1 |
| ARQUITECTURA | 188 | - | - | -1 |
| KNOWLEDGE_GRAPH | 188 | - | 84 | -1, +68 sin desarrollador |

**Problema:** KNOWLEDGE_GRAPH dice 84 proyectos sin desarrollador, BD tiene solo 16.

---

## 3. UNIDADES BUSCABLES PARA MVP

| Documento | Unidades | Error |
|-----------|----------|-------|
| **BD REAL** | **295** | - |
| MVP_SPEC.md | 238 | -57 |
| ARQUITECTURA | 371 | +76 |

**Problema:** MVP spec promete menos unidades de las que hay.

---

## 4. MIGRACIONES SQL (CRITICO)

### Archivos con numeros duplicados

```
020_leads_mvp.sql                     (7 Enero 2026)
020_fix_leads_mvp_permissions.sql     (fecha?)
020_limpieza_datos_vistas.sql         (8 Enero 2026)  <- TRES archivos 020

027_fix_tipo_propiedad_santorini.sql  (9 Enero 2026)
027_calcular_confianza_datos.sql      (11 Enero 2026) <- DOS archivos 027
```

### Rangos documentados vs reales

| Documento | Rango | Error |
|-----------|-------|-------|
| **Archivos reales** | **001-031** | - |
| README.md | 001-012 | Faltan 19 |
| GUIA_ONBOARDING | 001-013 | Faltan 18 |
| CLAUDE.md (tabla) | 001-024 | Faltan 7 |

**Problema:**
1. Hay **3 archivos con numero 020** y **2 archivos con numero 027**
2. Ningun documento refleja el rango real 001-031

---

## 5. NOMBRE DEL SISTEMA

| Documento | Nombre |
|-----------|--------|
| README.md | Sistema Inteligente de **Captura** Inmobiliaria |
| CLAUDE.md | Sistema Inteligente de **Captura** Inmobiliaria |
| ARQUITECTURA_MAESTRA | Sistema Inteligente de **Clasificacion** Inmobiliaria |

**Problema:** "Captura" vs "Clasificacion" - identidad inconsistente.

---

## 6. HORARIOS DEL PIPELINE NOCTURNO

### Version 1 (WORKFLOW_TRACKING_SPEC)
```
Discovery:         1:00 AM
Enrichment:        2:00 AM
Merge:             3:00 AM
Matching:          4:00 AM
Verificador:       6:00 AM
Export Sin Match:  7:00 AM
Supervisores:      8:00 PM / 8:30 PM
Auditoria:         9:00 AM
```

### Version 2 (ARQUITECTURA_MAESTRA)
```
Discovery:         2:00 AM
Enrichment:        3:00 AM
Matching:          4:00 AM
Refresh Views:     4:30 AM
```

### Version 3 (TC_DINAMICO_BINANCE_SPEC)
```
TC Binance:        00:00 AM (antes de Discovery 1:00 AM)
```

**Problema:** Discovery es 1:00 AM o 2:00 AM segun documento.

---

## 7. VERSIONES DE COMPONENTES

### Auditoria Diaria

| Documento | Version |
|-----------|---------|
| README.md | v2.2 |
| AUDITORIA_SPEC | v2.5 |
| CLAUDE.md | v2.8 |

### Merge

| Documento | Version |
|-----------|---------|
| merge_canonical.md | v2.1.0 |
| README.md | v2.0.0 |
| CLAUDE.md | v2.1.0 |

**Problema:** Versiones inconsistentes entre documentos.

---

## 8. KEYS JSON EN datos_json

### Documentacion vs BD Real

| Design Doc | BD Real | Impacto |
|------------|---------|---------|
| `datos_json->'asesor'` | `datos_json->'agente'` | Funciones rotas |
| `datos_json->'asesor'->>'inmobiliaria'` | `datos_json->'agente'->>'oficina_nombre'` | Funciones rotas |
| `datos_json->'contenido'->'fotos'` | `datos_json->'contenido'->'fotos_urls'` | Funciones rotas |

**Fuente:** KNOWLEDGE_GRAPH_VALIDATED_PLAN.md lo documenta pero otras funciones pueden no estar corregidas.

---

## 9. BUGS DOCUMENTADOS VS BACKLOG

### docs/bugs/
- BUG_001: Century21 tipo_operacion incorrecto (1 prop, ID 249)
- BUG_002: Baulera en analisis (1 prop, ID 130)
- BUG_003: Enrichment precio corrupto (1 prop, ID 283)
- BUG_004: Precio sospechoso Spazios (1 prop, ID 380)

### CLAUDE.md Backlog
- Solo menciona ID 380 (Spazios) como dato corrupto

**Problema:** CLAUDE.md no menciona bugs 001-003 que estan documentados.

---

## 10. FECHAS DE ACTUALIZACION

| Documento | "Ultima actualizacion" | Contenido desactualizado |
|-----------|------------------------|--------------------------|
| README.md | 1 Enero 2026 | Si - conteos erroneos |
| GUIA_ONBOARDING | 2 Enero 2026 | Si - migraciones 001-013 |
| ARQUITECTURA | 6 Enero 2026 | Si - conteos erroneos |
| CLAUDE.md | 8 Enero 2026 | Si - conteos, GPS %, migraciones |

---

## MATRIZ DE DOCUMENTOS DESACTUALIZADOS

| Documento | Conteos | Migraciones | Horarios | Versiones | Prioridad Fix |
|-----------|---------|-------------|----------|-----------|---------------|
| **CLAUDE.md** | X | X | ? | X | ALTA |
| **README.md** | X | X | OK | X | ALTA |
| GUIA_ONBOARDING | X | X | ? | - | MEDIA |
| ARQUITECTURA | X | - | X | - | MEDIA |
| MVP_SPEC | X | - | - | - | BAJA |
| KNOWLEDGE_GRAPH | X | - | - | - | BAJA |

---

## RECOMENDACIONES

### Inmediatas (Prioridad Alta)
1. **Renumerar migraciones 020 y 027** - eliminar duplicados
2. **Actualizar CLAUDE.md** con conteos reales de BD
3. **Actualizar README.md** con estado actual

### Corto Plazo
4. **Unificar nombre** - decidir "Captura" o "Clasificacion"
5. **Documentar horarios canonicos** en un solo lugar
6. **Actualizar GUIA_ONBOARDING** para nuevos desarrolladores

### Mejoras Estructurales
7. **Crear script de validacion** que compare docs vs BD
8. **Agregar timestamps automaticos** a documentacion
9. **Single source of truth** para conteos (query en CLAUDE.md?)

---

## DATOS REALES PARA ACTUALIZAR DOCUMENTACION

```sql
-- Copiar estos valores a la documentacion:

-- Propiedades
Total:                453
Completadas:          331
Matcheadas:           321 (97.0%)
Para matching:        430
Ventas:               409
Unidades buscables:   295

-- Proyectos
Activos:              189
Con desarrollador:    173 (91.5%)
Sin desarrollador:    16 (8.5%)
GPS verificado:       165 (87.3%)

-- Migraciones
Rango real:           001-031 (con duplicados en 020 y 027)
```

---

*Auditoria generada automaticamente - 11 Enero 2026*
