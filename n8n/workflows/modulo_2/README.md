# n8n Workflows — SICI Módulo 2 (Enrichment)

**Sistema:** SICI — Sistema Inteligente de Captura Inmobiliaria  
**Módulo:** Módulo 2 — Enrichment & Processing  
**Versión:** 3.0  
**Fecha:** Diciembre 2025

---

## 📁 Workflows Disponibles

| Archivo | Descripción | Versión | Estado |
|---------|-------------|---------|--------|
| `flujo_b_processing_v3.0.json` | Flujo B con arquitectura spread operator | v3.0 | ✅ Producción |

---

## 🔄 Flujo B — Processing v3.0

### Arquitectura

```
[Obtener Propiedades] → status=pendiente_enriquecimiento
        ↓
[Switch Fuente] → century21 / remax
        ↓                ↓
[Extractor C21 v16.5]  [Extractor Remax v1.9]
        ↓                ↓
    [Merge Resultados]
        ↓
[IF extraccion_exitosa]
    ↓ true         ↓ false
[registrar_enrichment]  [Log Error]
```

### Características v3.0

- ✅ Spread operator en extractores: `return { ...data, extraccion_exitosa: true }`
- ✅ Flag `extraccion_exitosa` para validación
- ✅ Campo `tipo_operacion` (antes `modalidad`)
- ✅ Manejo de inactivos mejorado
- ✅ Conexiones simplificadas

### Extractores Integrados

| Extractor | Versión | Ubicación |
|-----------|---------|-----------|
| Century21 | v16.5 | `n8n/extractores/extractor_century21.json` |
| Remax | v1.9 | `n8n/extractores/extractor_remax.json` |

### Cambios desde v2.x

1. **Spread operator:** Arquitectura simplificada para retorno de datos
2. **Campo tipo_operacion:** Homologado desde `modalidad`
3. **Validación IF:** Node dedicado para validar extracción exitosa
4. **Fix estacionamientos:** Validación regex antes de cast

---

## 📋 Prerequisitos

1. **SQL Functions desplegadas:**
   - `registrar_enrichment()` v1.4.1
   - `merge_discovery_enrichment()` v1.2.0

2. **Credenciales configuradas:**
   - Supabase PostgreSQL
   - Firecrawl API

---

## 🧪 Testing

### Verificar extracción exitosa

```sql
SELECT 
    id,
    fuente,
    status,
    tipo_operacion,
    estado_construccion,
    estacionamientos,
    fecha_enrichment
FROM propiedades_v2
WHERE fecha_enrichment >= NOW() - INTERVAL '1 hour'
ORDER BY fecha_enrichment DESC
LIMIT 10;
```

### Verificar propiedades pendientes

```sql
SELECT COUNT(*), fuente
FROM propiedades_v2
WHERE status = 'pendiente_enriquecimiento'
GROUP BY fuente;
```

---

## 📚 Documentación Relacionada

- **Canonical:** `docs/canonical/flujo_b_corepp_canonical.md`
- **SQL Enrichment:** `sql/functions/enrichment/README.md`
- **SQL Merge:** `sql/functions/merge/README.md`
- **Heuristics C21:** `docs/extractores/heuristics/extractor_heuristics_parte1_century21.md`
- **Heuristics Remax:** `docs/extractores/heuristics/extractor_heuristics_parte2_remax.md`

---

**Última actualización:** Diciembre 22, 2025
