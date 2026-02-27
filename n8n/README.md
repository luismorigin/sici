# n8n Workflows — SICI

## Workflows Activos en Producción

### Venta (modulo_1) — 4 workflows

| Workflow | Horario | Archivo |
|----------|---------|---------|
| Discovery C21 + Remax | 1:00 AM | `modulo_1/flujo_a_discovery_century21_v1.0.3_FINAL.json` |
| Enrichment LLM | 2:00 AM | `modulo_1/flujo_b_processing_v3.0.json` |
| Verificador | (post-merge) | `modulo_1/flujo_c_verificador_v1.1.0_FINAL.json` |
| Merge Nocturno | 3:00 AM | `modulo_1/Flujo Merge - Nocturno v1.0.0.json` |

### Matching + Auditoría (modulo_2) — 3 workflows activos

| Workflow | Horario | Archivo |
|----------|---------|---------|
| Matching Nocturno | 4:00 AM | `modulo_2/matching_nocturno.json` |
| Auditoría Diaria | 9:00 AM | `modulo_2/auditoria_diaria_sici.json` |
| TC Dinámico Binance | 00:00 AM | `modulo_2/tc_dinamico_binance.json` |

> Los demás workflows en `modulo_2/archive/` son snapshots históricos (usaban Google Sheets, reemplazados por Admin Dashboard).

### Alquiler — 6 workflows

| Workflow | Horario | Archivo |
|----------|---------|---------|
| Discovery C21 | 1:30 AM | `alquiler/flujo_discovery_c21_alquiler_v1.0.0.json` |
| Discovery Remax | 1:30 AM | `alquiler/flujo_discovery_remax_alquiler_v1.0.0.json` |
| Discovery Bien Inmuebles | 2:30 AM | `alquiler/flujo_discovery_bien_inmuebles_alquiler_v1.0.0.json` |
| Enrichment LLM | 2:30 AM | `alquiler/flujo_enrichment_llm_alquiler_v1.0.0.json` |
| Merge | 3:30 AM | `alquiler/flujo_merge_alquiler_v1.0.0.json` |
| Verificador | 7:00 AM | `alquiler/flujo_c_verificador_alquiler_v1.0.0.json` |

## Workflows Archivados (modulo_2/archive/)

Estos workflows usaban Google Sheets para HITL. El sistema HITL migró a Admin Dashboard (`/admin/supervisor/*`).

- `matching_supervisor.json` — Procesar decisiones matching desde Sheets
- `supervisor_sin_match.json` — Procesar decisiones sin-match desde Sheets
- `supervisor_excluidas.json` — Procesar decisiones excluidas desde Sheets
- `exportar_sin_match.json` — Exportar huérfanas a Sheets
- `exportar_excluidas.json` — Exportar excluidas a Sheets
- `SICI - Radar Mensual v1.1.json` — Escaneo mensual Google Places

## Credenciales

| Credencial | Uso |
|------------|-----|
| Postgres (Supabase) | Todos los workflows |
| Slack Webhook | Notificaciones (`$env.SLACK_WEBHOOK_SICI`) |

## Importar a n8n

1. n8n → Import from file → seleccionar JSON
2. Verificar credenciales vinculadas
3. Configurar `SLACK_WEBHOOK_SICI` en Settings → Environment Variables
4. Probar con Manual Trigger antes de activar Schedule
