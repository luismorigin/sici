# Cambios para Enrichment LLM Alquiler — Prompt v2.0

> Fecha: 28 Mar 2026
> Testeado: 5/5 props correctas con Haiku (scripts/test_prompt_v2.mjs)

## Cambio 1: Query SQL (nodo "Query Alquileres Sin Enrichment")

Reemplazar la query actual por:

```sql
SELECT p.id AS prop_id, p.url, p.fuente, p.codigo_propiedad,
  p.precio_mensual_bob, p.precio_usd, p.area_total_m2,
  p.dormitorios, p.banos, p.zona, p.tipo_propiedad_original,
  p.datos_json_discovery->>'nomb_img' AS nomb_img,
  p.datos_json_discovery->>'amigo_clie' AS amigo_clie,
  p.nombre_edificio AS nombre_edificio_regex,
  COALESCE((
    SELECT string_agg(pm.nombre_oficial, ', ' ORDER BY pm.nombre_oficial)
    FROM proyectos_master pm
    WHERE pm.activo = true AND pm.zona = p.zona
  ), '') AS proyectos_zona
FROM propiedades_v2 p
WHERE p.tipo_operacion = 'alquiler'
  AND p.status IN ('nueva', 'actualizado')
  AND p.fecha_enrichment IS NULL
ORDER BY p.fecha_discovery DESC LIMIT 20
```

Campos nuevos: `nombre_edificio_regex`, `proyectos_zona`.

## Cambio 2: Nodo "Construir Prompt" (solo el string del prompt)

Reemplazar TODO el contenido del nodo "Construir Prompt" por el código JS de abajo.
La lógica de extracción Remax/C21/BI es IDÉNTICA. Solo cambia:
- Lee `prop.nombre_edificio_regex` y `prop.proyectos_zona` de la query
- Prompt con instrucciones NOMBRE_EDIFICIO y DORMITORIOS mejoradas
- JSON de salida agrega `nombre_edificio_confianza` y `dormitorios_confianza`
