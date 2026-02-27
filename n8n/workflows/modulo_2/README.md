# n8n Workflows - SICI Módulo 2

**Sistema:** SICI - Sistema Inteligente de Captura Inmobiliaria
**Módulo:** Módulo 2 - Matching Propiedad-Proyecto
**Versión:** 2.1
**Fecha:** 1 Enero 2026

> **⚠️ NOTA (27 Feb 2026):** El sistema HITL migró a Admin Dashboard (`/admin/supervisor/*`).
> Los workflows históricos que usaban Google Sheets fueron movidos a `archive/`.
> Los 3 workflows activos en producción son: `matching_nocturno.json`, `auditoria_diaria_sici.json`, `tc_dinamico_binance.json`.

---

## Workflows Disponibles

### 1. Matching Nocturno v1.0
**Archivo:** `matching_nocturno.json`
**Schedule:** Diario a las 4:00 AM

**Función:**
- Ejecuta `matching_completo_automatizado()` para generar matches
- Auto-aprueba sugerencias ≥85% confianza
- Extrae pendientes 70-84% para revisión humana
- Llena Google Sheet tab `Pendientes_Matching`
- Envía notificación Slack

---

### 2. Matching Supervisor v1.1
**Archivo:** `matching_supervisor.json`
**Schedule:** Diario a las 8:00 PM

**Función:**
- Lee decisiones del supervisor desde Google Sheet
- Procesa acciones: **APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO**
- Aplica matches aprobados vía `aplicar_matches_revisados()`
- Crea proyectos alternativos vía `crear_proyecto_desde_sugerencia()`
- Corrige proyectos vía `corregir_proyecto_matching()`
- Limpia registros procesados del Sheet
- Envía resumen a Slack

**Acciones HITL:**
| Acción | Descripción |
|--------|-------------|
| ✅ APROBAR | Confirma match sugerido |
| ❌ RECHAZAR | Descarta match (sin alternativo) |
| 🔧 CORREGIR | Corrige nombre/GPS del proyecto sugerido y aprueba |
| 🆕 PROYECTO_ALTERNATIVO | Crea/usa proyecto diferente al sugerido |

---

### 3. Exportar Sin Match v1.0
**Archivo:** `exportar_sin_match.json`
**Schedule:** Diario a las 7:00 AM

**Función:**
- Obtiene propiedades sin proyecto asignado vía `obtener_sin_match_para_exportar()`
- Registra exportación vía `registrar_exportacion_sin_match()`
- Llena Google Sheet tab `Sin_Match`
- Envía notificación Slack

---

### 4. Supervisor Sin Match v1.1
**Archivo:** `supervisor_sin_match.json`
**Schedule:** Diario a las 8:30 PM

**Función:**
- Lee decisiones del Sheet tab `Sin_Match`
- Procesa acciones: **ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO**
- Ejecuta `procesar_decision_sin_match()` para cada decisión
- Sincroniza dropdown de proyectos (tab `Proyectos_Lista`)
- Elimina filas procesadas (ordenadas DESC para evitar index shift)
- Envía resumen a Slack

**Acciones HITL:**
| Acción | Descripción |
|--------|-------------|
| 📌 ASIGNAR | Asigna proyecto existente por ID |
| 🆕 CREAR | Crea proyecto nuevo con nombre/GPS |
| ✏️ CORREGIR | Corrige proyecto existente y asigna |
| ⛔ SIN_PROYECTO | Marca propiedad como no-edificio |

**Fixes aplicados (31 Dic 2025):**
- Rate limit 60/min: Execute Once + Remove Duplicates
- Row deletion: Ordenada DESC para evitar index shift
- Null handling: Migración 012 para "null" string de n8n

---

### 5. Auditoría Diaria v2.2
**Archivo:** `auditoria_diaria_sici.json`
**Schedule:** Diario a las 9:00 AM

**Función:**
- Recopila estadísticas de propiedades, matching y proyectos
- Genera reporte consolidado en Slack (7 secciones)
- ✅ **Guarda snapshots** en `auditoria_snapshots` via UPSERT

---

### 6. Radar Mensual v1.0
**Archivo:** `SICI - Radar Mensual v1.0.json`
**Schedule:** Día 1 de cada mes a las 3:00 AM

**Función:**
- Escanea zonas via Google Places API
- Detecta edificios nuevos (apartment_complex, condominium_complex)
- Filtra duplicados por google_place_id y proximidad GPS (<50m)
- Inserta en `proyectos_pendientes_google`
- Llena Google Sheet para revisión
- Actualiza estadísticas de zonas

---

## Google Sheets

**Documento:** [SICI - Matching Bandeja de Aprobación](https://docs.google.com/spreadsheets/d/1Ra3-MWhSiaI6ixRg-YX2KlB3rZE_LHzttPdPhzER4Xw/edit)

| Tab | Workflow | Propósito |
|-----|----------|-----------|
| `Pendientes_Matching` | Matching Nocturno/Supervisor | Sugerencias 70-84% |
| `Sin_Match` | Exportar/Supervisor Sin Match | Props sin proyecto |
| `Proyectos_Lista` | Supervisor Sin Match | Dropdown sincronizado |

---

## Arquitectura Human-in-the-Loop

```
                    ┌─────────────────────────────────────────┐
                    │            PIPELINE NOCTURNO             │
                    └─────────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐            ┌───────────────┐            ┌───────────────┐
│ 4:00 AM       │            │ 7:00 AM       │            │ 9:00 AM       │
│ Matching      │            │ Exportar      │            │ Auditoría     │
│ Nocturno      │            │ Sin Match     │            │ Diaria        │
└───────┬───────┘            └───────┬───────┘            └───────────────┘
        │                            │
        ▼                            ▼
┌───────────────┐            ┌───────────────┐
│ Sheet:        │            │ Sheet:        │
│ Pendientes    │            │ Sin_Match     │
└───────┬───────┘            └───────┬───────┘
        │                            │
        │    DURANTE EL DÍA:         │
        │    Humano revisa y         │
        │    toma decisiones         │
        │                            │
        ▼                            ▼
┌───────────────┐            ┌───────────────┐
│ 8:00 PM       │            │ 8:30 PM       │
│ Matching      │            │ Supervisor    │
│ Supervisor    │            │ Sin Match     │
└───────────────┘            └───────────────┘
```

---

## Credenciales Requeridas

| Credencial | ID n8n | Uso |
|------------|--------|-----|
| Postgres (Supabase) | `zd5IroT7BxnpW5U6` | Todos los workflows |
| Google Sheets | `DbMNipx0RBpm2Hhu` | Matching, Sin Match, Radar |
| Google Places API | `Mhl3Ef3vxc89rpQi` | Solo Radar |
| Slack Webhook | `$env.SLACK_WEBHOOK_SICI` | Notificaciones |

---

## Importación a n8n

1. Abrir n8n: http://localhost:5678
2. Click en "..." > "Import from file"
3. Seleccionar el archivo JSON
4. Verificar que las credenciales estén vinculadas
5. Configurar variable de entorno `SLACK_WEBHOOK_SICI`
6. Probar con "Manual Trigger" antes de activar Schedule

---

## Documentación Relacionada

- **Spec Matching:** `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md`
- **Spec Sin Match:** `docs/modulo_2/SIN_MATCH_SPEC.md`
- **Spec Auditoría:** `docs/modulo_2/AUDITORIA_DIARIA_SPEC.md`
- **Plan Matching:** `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md`
- **Funciones RPC:** `sql/functions/matching/funciones_rpc_matching.sql`
- **Migraciones:** `sql/migrations/009-012` (Sin Match + CORREGIR + Fixes)

---

## Pendientes

| Tarea | Prioridad |
|-------|-----------|
| Workflow Enriquecedor IA | 🟡 Media |
| Workflow Validador GPS | 🟢 Baja |

---

**Última actualización:** 1 Enero 2026
