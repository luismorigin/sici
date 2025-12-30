# Sin Match Human-in-the-Loop - Especificación

> **Versión:** 1.0
> **Fecha:** 30 Diciembre 2025
> **Workflows:** `exportar_sin_match.json`, `supervisor_sin_match.json`

---

## Objetivo

Permitir asignación manual de proyectos a propiedades que el sistema automático no pudo matchear.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DIARIO                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  7:00 AM  ┌────────────────────┐                                │
│     ──────│ Exportar Sin Match │──▶ Sheet Tab "Sin_Match"       │
│           └────────────────────┘              │                 │
│                     │                         ▼                 │
│                     └── Slack ──▶ "X propiedades exportadas"    │
│                                                                 │
│  Durante el día: Humano revisa y decide en Google Sheets        │
│                                                                 │
│  8:30 PM  ┌────────────────────┐                                │
│     ──────│ Supervisor Sin Match│◀── Lee decisiones             │
│           └────────────────────┘                                │
│                     │                                           │
│                     ├── 📌 ASIGNAR ──▶ propiedades_v2           │
│                     ├── 🆕 CREAR ────▶ proyectos_master         │
│                     ├── ⛔ SIN PROY ─▶ es_para_matching=false   │
│                     │                                           │
│                     └── Slack ──▶ "X asignadas, Y creadas"      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Google Sheet

**Archivo:** SICI - Matching Bandeja de Aprobación (existente)
**Tab:** Sin_Match (nuevo)

### Columnas

| Col | Nombre | Editable | Descripción |
|-----|--------|----------|-------------|
| A | ID_PROPIEDAD | NO | ID de propiedades_v2 |
| B | FECHA_EXPORT | NO | Fecha de exportación |
| C | URL_PROPIEDAD | NO | Link a la propiedad |
| D | LINK_MAPS | NO | Google Maps con GPS |
| E | ZONA | NO | Zona de la propiedad |
| F | NOMBRE_EDIFICIO | NO | Si tiene (puede estar vacío) |
| G | PROYECTOS_CERCANOS | NO | Lista: "Torre Sol [ID:45] (32m)" |
| **H** | **ACCION** | **SÍ** | Decisión del humano |
| **I** | **PROYECTO_ID_O_NOMBRE** | **SÍ** | ID o nombre nuevo |
| **J** | **GPS_NUEVO** | **SÍ** | Coordenadas si crea |
| **K** | **NOTAS** | **SÍ** | Observaciones |

## Acciones Disponibles

### 📌 ASIGNAR EXISTENTE

**Uso:** El proyecto correcto existe en proyectos_master

**Columna I:** ID del proyecto (ej: `45`) o copiar de G (ej: `Torre Sol [ID:45]`)

**Resultado en BD:**
```sql
UPDATE propiedades_v2 SET id_proyecto_master = 45 WHERE id = X;
UPDATE sin_match_exportados SET estado = 'asignado';
```

### 🆕 CREAR PROYECTO

**Uso:** El edificio NO existe en proyectos_master

**Columna I:** Nombre del proyecto (ej: `Torre Nueva`)
**Columna J:** GPS del edificio (ej: `-17.77181, -63.19449`) - opcional

**Resultado en BD:**
```sql
INSERT INTO proyectos_master (nombre_oficial, latitud, longitud, zona, ...);
UPDATE propiedades_v2 SET id_proyecto_master = nuevo_id;
UPDATE sin_match_exportados SET estado = 'creado';
```

**Nota:** Si J está vacío, hereda GPS de la propiedad. Si tiene valor, se marca como `gps_verificado_google = true`.

### ⛔ SIN PROYECTO

**Uso:** La propiedad NO pertenece a un edificio (casa, terreno, local independiente)

**Resultado en BD:**
```sql
UPDATE propiedades_v2 SET es_para_matching = false;
UPDATE sin_match_exportados SET estado = 'sin_proyecto';
```

**Efecto:** La propiedad nunca más aparecerá en el Sheet ni intentará matchear.

### ⏳ PENDIENTE (default)

**Uso:** No se ha revisado aún

**Resultado:** La fila permanece en el Sheet.

## Tabla de Tracking

```sql
CREATE TABLE sin_match_exportados (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_v2(id),
    fecha_export TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(50) DEFAULT 'pendiente',
    -- pendiente, asignado, creado, sin_proyecto
    proyecto_asignado INTEGER REFERENCES proyectos_master(id_proyecto_master),
    fecha_procesado TIMESTAMP,
    notas TEXT,
    UNIQUE(propiedad_id)
);
```

## Funciones SQL

### obtener_sin_match_para_exportar(limit)

Retorna propiedades sin match que no han sido exportadas, con lista de proyectos cercanos (<200m).

```sql
SELECT * FROM obtener_sin_match_para_exportar(NULL);
-- Retorna: id, url, latitud, longitud, zona, nombre_edificio, proyectos_cercanos
```

### registrar_exportacion_sin_match(ids[])

Registra que las propiedades fueron exportadas (evita duplicados).

```sql
SELECT registrar_exportacion_sin_match(ARRAY[123, 456, 789]);
```

### procesar_decision_sin_match(propiedad_id, accion, ...)

Procesa la decisión del humano.

```sql
-- Asignar existente
SELECT * FROM procesar_decision_sin_match(123, 'asignar', 45, NULL, NULL, NULL);

-- Crear nuevo
SELECT * FROM procesar_decision_sin_match(123, 'crear', NULL, 'Torre Nueva', '-17.77,63.19', NULL);

-- Sin proyecto
SELECT * FROM procesar_decision_sin_match(123, 'sin_proyecto', NULL, NULL, NULL, 'Es una casa');
```

## Notificaciones Slack

### Exportación (7 AM)

```
📤 SICI Sin Match - Exportación Diaria

Propiedades exportadas: 12
Sin nombre_edificio: 8
Con proyectos cercanos: 10

[📂 Ir a Bandeja Sin Match]
```

### Procesamiento (8:30 PM)

```
✅ SICI Sin Match - Procesamiento Completado

📌 Asignadas: 5
🆕 Creadas: 2
⛔ Sin proyecto: 1
⏳ Pendientes: 4

Proyectos creados: Torre Nueva, Edificio Central

[📂 Ver Bandeja Sin Match]
```

## Instalación

1. Ejecutar migración `009_sin_match_exportados.sql` en Supabase
2. Crear tab "Sin_Match" en Google Sheet existente con headers:
   ```
   ID_PROPIEDAD | FECHA_EXPORT | URL_PROPIEDAD | LINK_MAPS | ZONA | NOMBRE_EDIFICIO | PROYECTOS_CERCANOS | ACCION | PROYECTO_ID_O_NOMBRE | GPS_NUEVO | NOTAS
   ```
3. Importar `exportar_sin_match.json` en n8n
4. Importar `supervisor_sin_match.json` en n8n
5. Configurar credenciales Postgres y Google Sheets
6. Actualizar GID del tab en URLs de Slack (reemplazar `SIN_MATCH_GID`)
7. Activar ambos workflows

## Horarios de Ejecución

| Hora | Workflow | Descripción |
|------|----------|-------------|
| 4:00 AM | Matching Nocturno | Genera sugerencias automáticas |
| 7:00 AM | **Exportar Sin Match** | Exporta props sin match al Sheet |
| 8:00 PM | Supervisor Matching | Procesa tab "Pendientes_Matching" |
| 8:30 PM | **Supervisor Sin Match** | Procesa tab "Sin_Match" |
| 9:00 AM | Auditoría Diaria | Reporte consolidado |

---

*Documentación generada el 30 de Diciembre 2025*
