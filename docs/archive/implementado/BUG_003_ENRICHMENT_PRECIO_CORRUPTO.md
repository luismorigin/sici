# BUG-003: Enrichment sobreescribio precio correcto con valor corrupto

**Fecha descubrimiento:** 11 Enero 2026
**Severidad:** Alta
**Estado:** Documentado - Fix manual aplicado
**Afectados:** 1 propiedad confirmada (ID 283)

---

## Resumen

El proceso de Enrichment extrajo un precio incorrecto ($13,000 USD) de la pagina web y sobreescribio el precio correcto que venia de Discovery (808,520 BOB = ~$116,178 USD). El Merge priorizo el precio de Enrichment sin validar coherencia.

---

## Root Cause

### Fuente del error
**Extractor de Enrichment (scraper web)** - Extrajo precio incorrecto de la pagina.
**Merge sin validacion** - No detecto discrepancia significativa entre Discovery y Enrichment.

### Evidencia (ID 283 - Lofty Island)
```
Discovery:   808,520 BOB → $116,178 USD (correcto)
Enrichment:  $13,000 USD              (incorrecto - 89% menos!)
Merge:       Tomo Enrichment          (error de priorizacion)
```

### Datos del registro
```json
{
  "precio_usd_original": 808520,      // BOB del API
  "precio_usd": 13000,                // Corrupto por Enrichment
  "tipo_cambio_usado": 6.96,
  "discrepancias_detectadas": {
    "precio": {
      "discovery": null,              // No se calculo!
      "enrichment": 13000,
      "fuente_usada": "enrichment"
    }
  }
}
```

### Por que no se detecto
1. `discrepancias_detectadas.precio.discovery = null` - No se propago el precio de Discovery
2. Sin valor de Discovery, no hay comparacion posible
3. Merge asumio que Enrichment era la unica fuente

---

## Impacto

| Metrica | Valor |
|---------|-------|
| Propiedades afectadas confirmadas | 1 |
| Error en precio | -89% ($116k → $13k) |
| Precio/m² resultante | $190/m² (imposible para Equipetrol) |

### Comparacion con unidades del mismo proyecto (Lofty Island)
| ID | Precio | Area | $/m² | Estado |
|----|--------|------|------|--------|
| 283 | $13,000 ❌ | 68m² | $190 | Corrupto |
| 284 | $76,278 | 43m² | $1,760 | OK |
| 449 | $165,595 | 94m² | $1,752 | OK |
| 282 | $184,414 | 101m² | $1,818 | OK |

El precio/m² de $190 es **10x menor** que las otras unidades del mismo edificio.

---

## Fix Aplicado

### Correccion manual (ID 283)
```sql
-- Ejecutado: 11 Enero 2026
-- Recalcular desde precio_usd_original: 808,520 / 6.96 = 116,178.16
UPDATE propiedades_v2
SET
  precio_usd = ROUND(precio_usd_original / tipo_cambio_usado, 2),
  razon_inactiva = NULL,
  fecha_actualizacion = NOW()
WHERE id = 283;

-- Resultado: precio_usd = 116,178.16
```

---

## Prevencion Futura

### Opcion A: Validacion en Merge (Recomendado)
```sql
-- En merge_discovery_enrichment()
-- Si hay discrepancia > 50% entre Discovery y Enrichment, flaggear

IF v_precio_discovery IS NOT NULL AND v_precio_enrichment IS NOT NULL THEN
  v_diff_pct := ABS(v_precio_enrichment - v_precio_discovery) / v_precio_discovery * 100;

  IF v_diff_pct > 50 THEN
    -- Discrepancia significativa - marcar para revision
    v_status := 'requiere_revision';
    v_razon := format('Discrepancia precio: Discovery=%s, Enrichment=%s (%s%%)',
                      v_precio_discovery, v_precio_enrichment, ROUND(v_diff_pct));
  END IF;
END IF;
```

### Opcion B: Validacion por precio/m² en Merge
```sql
-- Si precio/m² < $500 para Equipetrol, flaggear
IF v_precio_usd / NULLIF(v_area_total_m2, 0) < 500 THEN
  v_flags := v_flags || '["precio_m2_sospechoso"]'::jsonb;
END IF;
```

### Opcion C: Priorizar Discovery para precios BOB
```sql
-- Si moneda_original = 'BOB' y tenemos precio de Discovery, preferirlo
-- El API suele ser mas confiable que el scraping para precios en BOB
```

---

## Deteccion de casos similares

### Query para encontrar precios sospechosos
```sql
SELECT
  p.id,
  p.nombre_edificio,
  p.precio_usd,
  p.precio_usd_original,
  p.moneda_original,
  ROUND(p.precio_usd / NULLIF(p.area_total_m2, 0), 2) as precio_m2,
  -- Comparar con promedio del proyecto
  pm.nombre_oficial,
  (SELECT ROUND(AVG(p2.precio_usd / NULLIF(p2.area_total_m2, 0)), 2)
   FROM propiedades_v2 p2
   WHERE p2.id_proyecto_master = p.id_proyecto_master
     AND p2.id != p.id
     AND p2.status = 'completado') as precio_m2_promedio_proyecto
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.tipo_operacion = 'venta'
  AND p.status = 'completado'
  AND p.precio_usd / NULLIF(p.area_total_m2, 0) < 500
ORDER BY p.precio_usd / NULLIF(p.area_total_m2, 0);
```

---

## Flujo del Bug

```
Century21 API
    ↓
Discovery: precio=808520, moneda=BOB → precio_usd_original=808520
    ↓
Enrichment: scraper extrae $13,000 (error de parseo)
    ↓
Merge: discrepancias.precio.discovery=NULL (no propagado!)
       → Usa enrichment: precio_usd=13000
    ↓
Frontend: Muestra depto de $13,000 con precio/m² de $190
```

---

## Referencias

- Propiedad afectada: https://c21.com.bo/propiedad/71299_lofty-island-equipetrol-departamento-de-1-dormitorio-en-fachada-y-con-balcon
- Workflow Enrichment: `n8n/workflows/modulo_1/flujo_b_processing_v3.0.json`
- Funcion Merge: `sql/functions/merge/merge_discovery_enrichment.sql`
- Proyecto: Lofty Island (HH Desarrollos)

---

## Historial

| Fecha | Accion |
|-------|--------|
| 11 Ene 2026 | Bug descubierto durante revision de datos corruptos |
| 11 Ene 2026 | Root cause identificado: Enrichment + Merge sin validacion |
| 11 Ene 2026 | Fix manual aplicado a ID 283 (recalculo desde BOB original) |
