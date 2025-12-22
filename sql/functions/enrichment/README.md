# Enrichment - registrar_enrichment()

**Versión:** 1.4.1 ✅  
**Archivo:** `registrar_enrichment.sql`

---

## Propósito

Registra datos de la **Fase Enrichment** (Flujo B).  
Fuente: HTML scraping detallado con Firecrawl.

---

## Firma

```sql
registrar_enrichment(p_data JSONB)
RETURNS JSONB
```

**Input requerido en p_data:**
- `id` (preferido), `property_id` o `url` (identificador)

---

## Campos que Procesa

- Precio y moneda original
- Tipo de cambio usado/detectado
- Área, dormitorios, baños
- Estacionamientos (con validación regex `^[0-9]+$`)
- GPS (lat/lon)
- tipo_operacion (venta/alquiler/anticretico)
- estado_construccion (con mapeo automático)
- Multiproyecto (si aplica)
- Match sugerido (`id_proyecto_master_sugerido`)
- Scores de calidad

---

## Cambios v1.4.1 (Diciembre 2025)

1. **Fix estacionamientos:** Validación regex `^[0-9]+$` antes de cast INTEGER
   - Ignora strings como "sin_confirmar"
   
2. **Fix estado_construccion:** Mapeo automático `"sin_informacion"` → `"no_especificado"`

3. **Campo tipo_operacion:** Acepta campo `tipo_operacion` (antes `modalidad`)
   - Cast a `tipo_operacion_enum`

4. **Compatible con spread operator** de extractores v16.5/v1.9

---

## Contrato Semántico

> **Status de salida: SIEMPRE `actualizado`**  
> Nunca `completado`. El cierre es responsabilidad de merge.

---

## Respuesta

```json
{
  "success": true,
  "operation": "enrichment",
  "property_id": "C21-12345",
  "status_anterior": "nueva",
  "status_nuevo": "actualizado",
  "cambios_enrichment": {
    "updated": ["precio_usd", "area_total_m2"],
    "skipped": ["dormitorios"],
    "blocked": []
  },
  "listo_para_merge": true
}
```

---

## Dependencias

- Tabla: `propiedades_v2`
- Tabla: `config_global` (para TCs)
- Requiere: propiedad existente (Discovery primero)
- Extractores: Century21 v16.5, Remax v1.9

---

**Última actualización:** Diciembre 22, 2025
