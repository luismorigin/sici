# BUG-004: Precio sospechosamente bajo en Spazios Eden

**Fecha descubrimiento:** 11 Enero 2026
**Severidad:** Media
**Estado:** Documentado - Excluido de analisis pendiente verificacion
**Afectados:** 1 propiedad confirmada (ID 380)

---

## Resumen

Una unidad de 105m² en Spazios Eden aparece con precio de $57,153 ($544/m²) mientras que unidades identicas en el mismo proyecto cuestan $146,366 ($1,394/m²). Diferencia del 61% que requiere verificacion antes de incluir en analisis fiduciario.

---

## Evidencia

### Propiedad sospechosa (ID 380)
```
Proyecto:     Spazios Eden
Area:         105 m²
Precio:       $57,153 USD (397,782 BOB)
Precio/m²:    $544
URL:          https://c21.com.bo/propiedad/85952_departamento-de-lujo-en-preventa-cond-spazios-eden
```

### Comparacion con unidades identicas del mismo proyecto
| ID | Precio | Area | $/m² | Estado |
|----|--------|------|------|--------|
| 380 | $57,153 | 105m² | $544 | Sospechoso |
| 342 | $146,366 | 105m² | $1,394 | Normal |
| 344 | $146,366 | 105m² | $1,394 | Normal |
| 224 | $150,585 | 79m² | $1,906 | Normal |

### Discrepancia
- Diferencia de precio: **-61%** respecto a unidades identicas
- El API de Century21 devolvio 397,782 BOB (conversion correcta)
- La funcion `analisis_mercado_fiduciario` ya lo flaggeaba como alerta

---

## Hipotesis

1. **Cuota inicial / Enganche** - El precio podria ser solo el pago inicial, no el precio total
2. **Preventa con descuento extremo** - Promocion temporal no reflejada en otras unidades
3. **Error en el listing de Century21** - Precio mal cargado en su sistema
4. **Unidad diferente** - Podria ser una unidad sin terminar o con caracteristicas distintas

---

## Fix Aplicado

```sql
-- Ejecutado: 11 Enero 2026
UPDATE propiedades_v2
SET
  es_para_matching = false,
  flags_semanticos = flags_semanticos || '["precio_sospechoso_verificar"]'::jsonb,
  razon_inactiva = 'BUG-004: Precio $57k por 105m2 ($544/m2) vs $146k unidades identicas. Pendiente verificar.',
  fecha_actualizacion = NOW()
WHERE id = 380;
```

### Resultado
- `status` permanece `completado` (datos tecnicamente completos)
- `es_para_matching = false` (excluido de analisis fiduciario)
- `flags_semanticos` contiene `["precio_sospechoso_verificar"]` para auditoria

---

## Deteccion Automatica

La funcion `analisis_mercado_fiduciario` YA detecta estos casos:

```json
{
  "bloque_4_alertas": {
    "alertas": [{
      "tipo": "precio_sospechoso",
      "mensaje": "Precio/m² muy bajo ($544). Verificar antes de visitar.",
      "propiedad_id": 380
    }]
  }
}
```

### Query para encontrar mas casos similares
```sql
SELECT
  p.id,
  pm.nombre_oficial as proyecto,
  p.precio_usd,
  p.area_total_m2,
  ROUND(p.precio_usd / NULLIF(p.area_total_m2, 0), 2) as precio_m2,
  -- Precio promedio del proyecto
  (SELECT ROUND(AVG(p2.precio_usd / NULLIF(p2.area_total_m2, 0)), 2)
   FROM propiedades_v2 p2
   WHERE p2.id_proyecto_master = p.id_proyecto_master
     AND p2.id != p.id
     AND p2.status = 'completado') as precio_m2_proyecto,
  -- Diferencia porcentual
  ROUND(100.0 * (
    (p.precio_usd / NULLIF(p.area_total_m2, 0)) -
    (SELECT AVG(p2.precio_usd / NULLIF(p2.area_total_m2, 0))
     FROM propiedades_v2 p2
     WHERE p2.id_proyecto_master = p.id_proyecto_master
       AND p2.id != p.id
       AND p2.status = 'completado')
  ) / NULLIF((SELECT AVG(p2.precio_usd / NULLIF(p2.area_total_m2, 0))
     FROM propiedades_v2 p2
     WHERE p2.id_proyecto_master = p.id_proyecto_master
       AND p2.id != p.id
       AND p2.status = 'completado'), 0), 1) as diff_pct
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.status = 'completado'
  AND p.tipo_operacion = 'venta'
  AND p.es_para_matching = true
HAVING ROUND(100.0 * (
    (p.precio_usd / NULLIF(p.area_total_m2, 0)) -
    (SELECT AVG(p2.precio_usd / NULLIF(p2.area_total_m2, 0))
     FROM propiedades_v2 p2
     WHERE p2.id_proyecto_master = p.id_proyecto_master
       AND p2.id != p.id
       AND p2.status = 'completado')
  ) / NULLIF((SELECT AVG(p2.precio_usd / NULLIF(p2.area_total_m2, 0))
     FROM propiedades_v2 p2
     WHERE p2.id_proyecto_master = p.id_proyecto_master
       AND p2.id != p.id
       AND p2.status = 'completado'), 0), 1) < -40
ORDER BY diff_pct;
```

---

## Verificacion Pendiente

Para resolver este caso:

1. **Visitar URL original:** https://c21.com.bo/propiedad/85952
2. **Verificar si dice "desde" o "cuota inicial"**
3. **Contactar asesor:** +59169091740 (segun datos)
4. **Comparar con precio real de la unidad**

### Acciones segun resultado
- Si es cuota inicial → Marcar `es_multiproyecto = true` o calcular precio total
- Si es error de Century21 → Corregir precio manualmente y bloquear campo
- Si es precio real → Reactivar con `es_para_matching = true`

---

## Referencias

- Propiedad: https://c21.com.bo/propiedad/85952_departamento-de-lujo-en-preventa-cond-spazios-eden
- Proyecto: Spazios Eden (ID 3)
- Desarrollador: Constructora Alessia Spazios

---

## Historial

| Fecha | Accion |
|-------|--------|
| 11 Ene 2026 | Bug descubierto durante revision de ReportExample |
| 11 Ene 2026 | Excluido de analisis con es_para_matching=false |
| Pendiente | Verificar precio real con Century21 |
