# Discovery - registrar_discovery()

**Versión:** 2.0.0 🔒  
**Archivo:** `registrar_discovery.sql`

---

## Propósito

Registra datos de la **Fase Discovery** (Flujo A).  
Fuentes: API REST, Map Grid, Scraping ligero.

---

## Firma

```sql
registrar_discovery(
  p_url VARCHAR,
  p_fuente VARCHAR,
  p_codigo_propiedad VARCHAR,
  p_tipo_operacion VARCHAR,
  p_tipo_propiedad_original TEXT,
  p_estado_construccion VARCHAR,
  p_precio_usd NUMERIC,
  p_area_total_m2 NUMERIC,
  p_dormitorios INTEGER,
  p_banos NUMERIC,
  p_estacionamientos INTEGER,
  p_latitud NUMERIC,
  p_longitud NUMERIC,
  p_metodo_discovery VARCHAR,
  p_datos_json_discovery JSONB
) RETURNS TABLE (id, status, es_nueva, cambios_detectados)
```

---

## Comportamiento

| Escenario | Acción |
|-----------|--------|
| URL nueva | INSERT completo → status `nueva` |
| URL existe, sin enrichment | UPDATE respetando candados |
| URL existe, con enrichment | Solo actualiza `datos_json_discovery` |

---

## Status de Salida

- Nueva propiedad: `nueva`
- Existente: No cambia status

---

## Dependencias

- Tabla: `propiedades_v2`
- ENUMs: `tipo_operacion_enum`, `estado_construccion_enum`
- Funciones auxiliares: `registrar_discrepancia_cambio()`, `determinar_status_post_discovery()`

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
