# Enrichment - registrar_enrichment()

**Versión:** 1.3.0 🔒  
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
- `property_id` o `url` (identificador)

---

## Campos que Procesa

- Precio y moneda original
- Tipo de cambio usado/detectado
- Área, dormitorios, baños, estacionamientos
- GPS (lat/lon)
- Multiproyecto (si aplica)
- Match sugerido (`id_proyecto_master_sugerido`)
- Scores de calidad

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

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
