# Flujo Merge - Nocturno v1.0.0

> **Estado:** ✅ IMPLEMENTADO  
> **Fecha:** 23 Diciembre 2025  
> **Archivo:** `flujo_merge_v1.0.0.json`

---

## 📋 Propósito

El Flujo Merge ejecuta la función `merge_discovery_enrichment()` v2.0.0 sobre todas las propiedades con `status='actualizado'`, fusionando los datos de Discovery y Enrichment en el campo `datos_json` final.

---

## ⏰ Schedule Nocturno

| Hora | Flujo | Descripción |
|------|-------|-------------|
| 1:00 AM | Flujo A Discovery | Detecta URLs nuevas |
| 2:00 AM | Flujo B Enrichment | Extrae datos HTML |
| **3:00 AM** | **Flujo Merge** | Fusiona Discovery + Enrichment |
| 6:00 AM | Flujo C Verificador | Verifica propiedades inactivas |

---

## 🔄 Arquitectura

```
[Trigger 3:00 AM]
       ↓
[Query Postgres] → SELECT id FROM propiedades_v2 
                   WHERE status = 'actualizado'
       ↓
[Loop Propiedades]
       ↓
[Ejecutar Merge] → merge_discovery_enrichment(id)
       ↓
[Procesar Resultado]
       ↓
[Agregar Resultados]
       ↓
[Generar Resumen]
       ↓
[Slack Resumen] (si hay trabajo)
```

---

## 📊 Nodes del Workflow

| # | Node | Tipo | Función |
|---|------|------|---------|
| 1 | Trigger 3:00 AM | scheduleTrigger | Cron `0 3 * * *` |
| 2 | Query Propiedades Actualizadas | postgres | Obtiene props pendientes |
| 3 | Hay propiedades? | if | Bifurca flujo |
| 4 | Sin Pendientes | code | Resumen vacío |
| 5 | Loop Propiedades | splitInBatches | Procesa 1 a 1 |
| 6 | Ejecutar Merge | postgres | Llama función SQL |
| 7 | Procesar Resultado | code | Parsea respuesta |
| 8 | Agregar Resultados | aggregate | Recopila resultados |
| 9 | Generar Resumen | code | Estadísticas finales |
| 10 | Merge Outputs | merge | Combina ramas |
| 11 | Enviar Slack? | if | Solo si hay trabajo |
| 12 | Slack Resumen | httpRequest | Notificación |
| 13 | Skip Slack | code | Sin notificación |

---

## ⚙️ Configuración Requerida

### 1. Credenciales Postgres
El workflow usa la credencial existente:
- **ID:** `zd5IroT7BxnpW5U6`
- **Nombre:** `Supabase - Censo Inmobiliario`

### 2. Webhook Slack
⚠️ **IMPORTANTE:** Reemplazar `YOUR_WEBHOOK_URL` en el nodo "Slack Resumen":
```
https://hooks.slack.com/services/YOUR_WEBHOOK_URL
```

---

## 📈 Métricas de Salida

El resumen final incluye:

```json
{
  "status": "completed",
  "flujo": "Flujo Merge - Nocturno v1.0.0",
  "total_procesadas": 50,
  "exitosas": 48,
  "errores": 2,
  "con_discrepancias": 5,
  "tasa_exito": 96,
  "emoji_status": "⚠️"
}
```

---

## 🔗 Dependencias SQL

- `merge_discovery_enrichment()` v2.0.0
- `get_discovery_value()` v2.0.0
- `calcular_scoring_propiedad()` (integrado en merge)

---

## 📝 Changelog

### v1.0.0 (2025-12-23)
- ✅ Implementación inicial
- ✅ Integración con merge_discovery_enrichment v2.0.0
- ✅ Notificación Slack con métricas
- ✅ Manejo de errores por propiedad
- ✅ Tracking de discrepancias

---

## 🚀 Deployment

1. Importar `flujo_merge_v1.0.0.json` en n8n
2. Verificar credencial Postgres
3. Configurar webhook Slack
4. Activar workflow
5. Verificar ejecución test manual

---

**Archivo:** `n8n/workflows/modulo_1/flujo_merge_v1.0.0.json`
