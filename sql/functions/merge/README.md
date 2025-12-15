# Merge - Funciones de Fusión

**Versión:** 1.2.0 🔒  
**Archivos:**
- `merge_discovery_enrichment.sql`
- `funciones_auxiliares_merge.sql`

---

## Propósito

Fusiona datos de Discovery + Enrichment aplicando reglas de prioridad.

---

## Función Principal

```sql
merge_discovery_enrichment(p_identificador TEXT)
RETURNS JSONB
```

Acepta: `id`, `codigo_propiedad`, o `url`

---

## Reglas de Prioridad

1. **Candados manuales** → Siempre respetados
2. **Enrichment > Discovery** → Datos HTML priorizados
3. **GPS: Discovery > Enrichment** → Coordenadas de API más confiables

---

## Contrato Semántico

> **Status de salida: SIEMPRE `completado`**  
> Merge es el ÚNICO punto que cierra el pipeline.

---

## Funciones Auxiliares

| Función | Propósito |
|---------|-----------|
| `obtener_propiedades_pendientes_merge()` | Lista propiedades status=actualizado |
| `ejecutar_merge_batch()` | Merge en lote (max 50) |
| `obtener_discrepancias()` | Consulta conflictos detectados |
| `resetear_merge()` | Permite re-ejecutar merge |
| `estadisticas_merge()` | Dashboard de métricas |

---

## Respuesta

```json
{
  "success": true,
  "operation": "merge",
  "property_id": "C21-12345",
  "status_anterior": "actualizado",
  "status_nuevo": "completado",
  "cambios_merge": {
    "updated": ["precio_usd"],
    "kept": ["dormitorios", "latitud"],
    "blocked": []
  },
  "tiene_discrepancias": false
}
```

---

## Dependencias

- Tabla: `propiedades_v2`
- Requiere: Discovery + Enrichment completados

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
