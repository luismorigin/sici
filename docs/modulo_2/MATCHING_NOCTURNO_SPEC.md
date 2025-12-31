# Sistema de Matching Nocturno con Human-in-the-Loop

> **Sistema:** SICI - Módulo 2 Matching
> **Estado:** ✅ COMPLETADO Y FUNCIONANDO
> **Versión:** 1.1
> **Fecha:** 31 Diciembre 2025
> **Basado en:** Patrón FASE 2/2.5 de subsistema-validacion-gps

---

## 1. Overview

### Objetivo

Completar el sistema de matching propiedades → proyectos con:
- Ejecución automática nocturna
- Interfaz humana para revisión de matches dudosos (70-84% confianza)
- Ciclo completo sin intervención SQL manual

### Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE NOCTURNO SICI                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1:00 AM  Flujo A Discovery (Century21 + Remax)                │
│     ↓                                                           │
│  2:00 AM  Flujo B Enrichment                                   │
│     ↓                                                           │
│  3:00 AM  Flujo Merge                                          │
│     ↓                                                           │
│  4:00 AM  ★ MATCHING NOCTURNO (NUEVO)                          │
│     │     └─ Ejecuta matching_completo_automatizado()          │
│     │     └─ Auto-aprueba ≥85%                                 │
│     │     └─ Pendientes 70-84% → Google Sheets                 │
│     ↓                                                           │
│  6:00 AM  Flujo C Verificador                                  │
│                                                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                                 │
│  DURANTE EL DÍA: Humano revisa Google Sheets                   │
│     └─ Cambia ⏳ PENDIENTE → ✅ APROBAR / ❌ RECHAZAR          │
│                                                                 │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                                 │
│  8:00 PM  ★ MATCHING SUPERVISOR (NUEVO)                        │
│     │     └─ Lee decisiones de Google Sheets                   │
│     │     └─ Aplica matches aprobados                          │
│     │     └─ Rechaza los rechazados                            │
│     └─ Slack: Resumen del día                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Componentes del Sistema

### 2.1 Workflow: Matching Nocturno

**Archivo:** `n8n/workflows/modulo_2/matching_nocturno.json`

**Trigger:** Cron `0 4 * * *` (4:00 AM todos los días)

**Flujo:**
```
Schedule Trigger (4 AM)
    ↓
Postgres: Ejecutar matching_completo_automatizado()
    ↓
Code: Procesar Resultados
    ↓
Postgres: Obtener Pendientes (70-84%)
    ↓
IF: ¿Hay pendientes?
    ├─ SÍ → Google Sheets: Agregar pendientes
    │       ↓
    │       Slack: "X nuevos pendientes para revisar"
    │
    └─ NO → Slack: "Todo auto-aprobado, sin pendientes"
```

### 2.2 Google Sheets: Matching Bandeja de Aprobación

**Nombre:** `SICI - Matching Bandeja de Aprobación`

**Hoja:** `Pendientes_Matching`

**Columnas:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `ID_SUGERENCIA` | INT | ID de matching_sugerencias |
| `FECHA` | DATE | Fecha de la sugerencia |
| `PROPIEDAD_ID` | INT | ID de propiedades_v2 |
| `URL_PROPIEDAD` | URL | Link a la propiedad |
| `NOMBRE_EDIFICIO` | TEXT | Nombre extraído (si existe) |
| `PROYECTO_SUGERIDO` | TEXT | nombre_oficial del proyecto |
| `PROYECTO_ID` | INT | ID del proyecto_master |
| `METODO` | TEXT | nombre/url/fuzzy/gps_verificado |
| `CONFIANZA` | INT | Score 70-84 |
| `DISTANCIA_M` | INT | Metros (solo para GPS) |
| `LINK_MAPS` | URL | Google Maps de la propiedad |
| `ACCION (Humano)` | ENUM | ⏳ PENDIENTE / ✅ APROBAR / ❌ RECHAZAR / 🔧 CORREGIR |
| `PROYECTO_ALTERNATIVO` | TEXT | (Opcional) Nombre del proyecto correcto si el sugerido es incorrecto |
| `GPS_ALTERNATIVO` | TEXT | (Opcional) Coordenadas copiadas de Google Maps "-17.756, -63.197" |

### Acciones Disponibles

| Acción | Descripción | Resultado |
|--------|-------------|-----------|
| ⏳ PENDIENTE | No revisado aún | Permanece en Sheet |
| ✅ APROBAR | Confirma match sugerido | Aplica vía `aplicar_matches_revisados()` |
| ❌ RECHAZAR | Descarta match | Marca como rechazado |
| 🔧 CORREGIR | Corrige nombre/GPS del proyecto sugerido | Aplica vía `corregir_proyecto_matching()` |
| 🆕 PROYECTO_ALTERNATIVO | Crea/usa proyecto diferente | Vía `crear_proyecto_desde_sugerencia()` |

### 2.3 Workflow: Matching Supervisor

**Archivo:** `n8n/workflows/modulo_2/matching_supervisor.json`

**Trigger:** Cron `0 20 * * *` (8:00 PM todos los días)

**Flujo:**
```
Schedule Trigger (8 PM)
    ↓
Google Sheets: Leer Pendientes_Matching
    ↓
Code: El Auditor
    │
    ├─ Contar: pendientes, aprobados, rechazados
    ├─ Detectar: rechazados CON proyecto_alternativo
    └─ Decisión: SYNC si pendientes == 0, sino BLOQUEAR
    ↓
IF: ¿decision == SYNC?
    │
    ├─ TRUE (Sin pendientes) ─────────────────────────┐
    │       ↓                                         │
    │   Code: Preparar IDs                            │
    │       ↓                                         │
    │   Postgres RPC: aplicar_matches_revisados()     │
    │       ↓                                         │
    │   IF: ¿Hay proyectos alternativos?              │
    │       ├─ SI → Postgres: crear_proyecto_sugerido │
    │       └─ NO → Continuar                         │
    │       ↓                                         │
    │   Slack: "✅ X matches aplicados, Y rechazados" │
    │       ↓                                         │
    │   Google Sheets: Limpiar filas procesadas       │
    │                                                 │
    └─ FALSE (Hay pendientes) ────────────────────────┤
            ↓                                         │
        Slack: "🛑 Aún hay X pendientes sin revisar"  │
                                                      │
                                        FIN ←─────────┘
```

### 2.4 Funcionalidad: Proyecto Alternativo

**Escenario:** El humano rechaza un match pero identifica el edificio correcto.

**Flujo:**
1. Humano ve sugerencia con `PROYECTO_SUGERIDO = "Torre Zenith"`
2. Humano busca en Google Maps el edificio correcto
3. Click derecho en el edificio → Copia coordenadas
4. Escribe en Sheet:
   - `PROYECTO_ALTERNATIVO` = "Torres del Sol"
   - `GPS_ALTERNATIVO` = "-17.75669, -63.19757"
5. Marca `ACCION = ❌ RECHAZAR`
6. Supervisor procesa:
   - Busca proyecto existente por nombre exacto
   - Si no encuentra: busca por GPS < 15m + nombre 70%+ similar
   - Si encuentra: usa proyecto existente
   - Si no encuentra: crea proyecto nuevo con GPS verificado
   - Crea nueva sugerencia con 95% confianza
7. Próximo ciclo: aparece nueva sugerencia para aprobar

**Validación anti-duplicados:**
```
GPS < 15m + Nombre >= 70% similar → Mismo edificio (usar existente)
GPS < 15m + Nombre < 70% similar  → Edificios diferentes (crear nuevo)
GPS >= 15m                        → Crear nuevo
```

---

## 3. Funciones SQL Requeridas

### 3.1 Función RPC: aplicar_matches_revisados

**Propósito:** Aplicar decisiones humanas del Google Sheets

**Archivo:** `sql/functions/matching/funciones_rpc_matching.sql`

```sql
CREATE OR REPLACE FUNCTION aplicar_matches_revisados(
    p_ids_aprobados INTEGER[],
    p_ids_rechazados INTEGER[]
)
RETURNS TABLE(
    aprobados_aplicados INTEGER,
    rechazados_marcados INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_aprobados INT := 0;
    v_rechazados INT := 0;
BEGIN
    -- 1. Aprobar las sugerencias seleccionadas
    UPDATE matching_sugerencias
    SET estado = 'aprobado',
        revisado_por = 'humano_sheets',
        fecha_revision = NOW()
    WHERE id = ANY(p_ids_aprobados)
      AND estado = 'pendiente';

    GET DIAGNOSTICS v_aprobados = ROW_COUNT;

    -- 2. Rechazar las sugerencias seleccionadas
    UPDATE matching_sugerencias
    SET estado = 'rechazado',
        revisado_por = 'humano_sheets',
        fecha_revision = NOW()
    WHERE id = ANY(p_ids_rechazados)
      AND estado = 'pendiente';

    GET DIAGNOSTICS v_rechazados = ROW_COUNT;

    -- 3. Aplicar los matches recién aprobados
    PERFORM aplicar_matches_aprobados();

    RETURN QUERY SELECT v_aprobados, v_rechazados;
END;
$$;
```

### 3.2 Función: obtener_pendientes_para_sheets

**Propósito:** Obtener pendientes con datos enriquecidos para el Sheet

```sql
CREATE OR REPLACE FUNCTION obtener_pendientes_para_sheets()
RETURNS TABLE(
    id_sugerencia INTEGER,
    propiedad_id INTEGER,
    url_propiedad TEXT,
    nombre_edificio TEXT,
    proyecto_sugerido TEXT,
    proyecto_id INTEGER,
    metodo TEXT,
    confianza INTEGER,
    distancia_metros NUMERIC,
    latitud NUMERIC,
    longitud NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ms.id,
        ms.propiedad_id,
        p.url,
        COALESCE(
            NULLIF(TRIM(p.nombre_edificio), ''),
            TRIM(p.datos_json_enrichment->>'nombre_edificio'),
            'SIN NOMBRE'
        ),
        pm.nombre_oficial,
        ms.proyecto_master_sugerido,
        ms.metodo_matching,
        ms.score_confianza::INTEGER,
        ms.distancia_metros,
        p.latitud,
        p.longitud
    FROM matching_sugerencias ms
    JOIN propiedades_v2 p ON p.id = ms.propiedad_id
    JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
    WHERE ms.estado = 'pendiente'
      AND ms.score_confianza BETWEEN 70 AND 84
    ORDER BY ms.score_confianza DESC, ms.created_at DESC;
END;
$$;
```

---

## 4. Configuración Google Sheets

### 4.1 Crear el Spreadsheet

1. Crear nuevo Google Sheets: `SICI - Matching Bandeja de Aprobación`
2. Renombrar primera hoja a: `Pendientes_Matching`
3. Crear headers en fila 1:

```
A1: ID_SUGERENCIA
B1: FECHA
C1: PROPIEDAD_ID
D1: URL_PROPIEDAD
E1: NOMBRE_EDIFICIO
F1: PROYECTO_SUGERIDO
G1: PROYECTO_ID
H1: METODO
I1: CONFIANZA
J1: DISTANCIA_M
K1: LINK_MAPS
L1: ACCION (Humano)
```

### 4.2 Validación de Datos

En columna L (`ACCION (Humano)`):
1. Seleccionar columna L (desde L2)
2. Datos → Validación de datos
3. Criterio: Lista de elementos
4. Valores: `⏳ PENDIENTE,✅ APROBAR,❌ RECHAZAR`
5. Mostrar advertencia / Rechazar entrada

### 4.3 Formato Condicional

- `⏳ PENDIENTE` → Fondo amarillo
- `✅ APROBAR` → Fondo verde
- `❌ RECHAZAR` → Fondo rojo

---

## 5. Instalación

### Paso 1: Crear funciones SQL

```bash
# En Supabase SQL Editor, ejecutar:
\i sql/functions/matching/funciones_rpc_matching.sql
```

### Paso 2: Crear Google Sheets

Seguir instrucciones de sección 4.

### Paso 3: Importar workflows n8n

```bash
# En n8n:
1. Import → From File → matching_nocturno.json
2. Import → From File → matching_supervisor.json
3. Configurar credenciales:
   - Postgres (Supabase)
   - Google Sheets OAuth2
   - Slack Webhook
```

### Paso 4: Configurar credenciales

En cada workflow:
- Actualizar ID del Google Sheets
- Verificar Slack Webhook URL
- Verificar conexión Postgres

### Paso 5: Testing

```bash
# 1. Ejecutar matching nocturno manualmente
# 2. Verificar que llena el Google Sheets
# 3. Cambiar algunas acciones en el Sheet
# 4. Ejecutar matching supervisor manualmente
# 5. Verificar que aplica los cambios
```

### Paso 6: Activar schedules

```bash
# En n8n, para cada workflow:
1. Abrir workflow
2. Toggle "Active" → ON
3. Verificar ícono de reloj ⏰
```

---

## 6. Operación Diaria

### Ciclo Normal

| Hora | Evento | Acción Requerida |
|------|--------|------------------|
| 4:00 AM | Matching Nocturno ejecuta | Ninguna |
| 4:05 AM | Slack: Resumen de matching | Revisar |
| Durante día | Revisar Google Sheets | Cambiar ⏳ → ✅/❌ |
| 8:00 PM | Matching Supervisor ejecuta | Ninguna |
| 8:05 PM | Slack: Resumen de aplicación | Verificar |

### Si hay bloqueo

Si el Supervisor detecta pendientes sin revisar:
1. Slack envía alerta 🛑
2. Ir a Google Sheets
3. Completar revisión
4. Ejecutar Supervisor manualmente o esperar al día siguiente

---

## 7. Métricas Esperadas

### Volumen Diario

| Métrica | Estimado |
|---------|----------|
| Propiedades nuevas/día | 5-15 |
| Matches auto-aprobados (≥85%) | 80% |
| Matches pendientes (70-84%) | 15% |
| Matches rechazados (<70%) | 5% |

### Tiempo de Revisión

| Tarea | Tiempo |
|-------|--------|
| Revisar 10 pendientes | 5-10 min |
| Revisar 50 pendientes | 20-30 min |

---

## 8. Troubleshooting

### Google Sheets no se llena

1. Verificar credenciales OAuth2 en n8n
2. Verificar ID del documento
3. Verificar nombre de la hoja (`Pendientes_Matching`)

### Supervisor siempre bloquea

1. Verificar que no hay filas viejas sin procesar
2. Limpiar filas antiguas del Sheet
3. Verificar formato de columna `ACCION (Humano)`

### Matches no se aplican

1. Verificar que la función RPC existe
2. Verificar permisos en Supabase
3. Revisar logs del workflow

---

## 9. Archivos del Sistema

```
sici/
├── docs/modulo_2/
│   └── MATCHING_NOCTURNO_SPEC.md          ← Este archivo
│
├── n8n/workflows/modulo_2/
│   ├── matching_nocturno.json             ← Workflow 4 AM
│   └── matching_supervisor.json           ← Workflow 8 PM
│
└── sql/functions/matching/
    └── funciones_rpc_matching.sql         ← Funciones RPC
```

---

## 10. Referencias

### Documentación Relacionada

- `sici-matching/subsistema-validacion-gps/fase25-supervisor-doc.md` - Patrón original
- `sici/docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` - Plan general
- `sici/sql/functions/matching/matching_completo_automatizado.sql` - Orquestador

### Workflows de Referencia

- `sici-matching/subsistema-validacion-gps/n8n/fase2-radar-mensual.json`
- `sici-matching/subsistema-validacion-gps/n8n/fase2.5-supervisor.json`

---

## 11. Migraciones Relacionadas

| # | Archivo | Propósito |
|---|---------|-----------|
| 003 | `matching_sugerencias_fk_v2.sql` | FK hacia propiedades_v2 |
| 006 | `crear_proyecto_desde_sugerencia.sql` | RPC crear proyecto |
| 007 | `crear_proyecto_con_gps_validacion.sql` | RPC v2 + validación GPS |
| 011 | `corregir_proyecto_matching.sql` | Acción CORREGIR |

---

**Fin de Especificación - Matching Nocturno v1.1**

*Actualizado el 31 de Diciembre 2025*
