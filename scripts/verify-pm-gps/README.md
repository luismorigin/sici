# verify-pm-gps — Verificación gratuita de GPS de proyectos_master

Alternativa **gratis** a Google Places para verificar que el GPS de un `proyectos_master` cae sobre un edificio físico real.

Usa **Overpass API** (OpenStreetMap) para contar edificios mapeados a 30m del centroide del pm, y **Nominatim** para obtener la dirección textual.

- Costo: **$0**.
- Sin API key.
- Rate limit: 1 req/2s (cortesía con servidores públicos).
- Tiempo: ~2-3 min para 40 pm.

## Cómo correr

### 1. Exportar pm desde Supabase

En el SQL Editor de Supabase, correr:

```sql
SELECT json_agg(t) FROM (
  SELECT id_proyecto_master, nombre_oficial, latitud, longitud
  FROM proyectos_master
  WHERE zona = 'Zona Norte' AND activo = true
    AND latitud IS NOT NULL
    AND (gps_verificado_osm IS NULL OR osm_verified_at < NOW() - INTERVAL '90 days')
  ORDER BY id_proyecto_master
) t;
```

Copiar el JSON resultante y pegarlo en `scripts/verify-pm-gps/pm-input.json`.

### 2. Correr el script

```bash
node scripts/verify-pm-gps/verify-pm-gps.mjs
```

### 3. Aplicar resultados

- Abrir `verify-pm-gps.html` en el navegador → inspección visual de los 40 pins sobre el mapa OSM.
- Pegar `update.sql` en Supabase UI → actualiza columnas `gps_verificado_osm`, `osm_buildings_around_30m`, `osm_nominatim_address`, `osm_verified_at`.

## Outputs

| Archivo | Para qué |
|---|---|
| `osm-results.json` | Resultado crudo: para cada pm, count de buildings + address |
| `update.sql` | `UPDATE proyectos_master SET ...` listo para pegar en Supabase |
| `verify-pm-gps.html` | Mapa Leaflet con todos los pm coloreados (verde / naranja / rojo) |

## Interpretación

| Color | Significado | Acción sugerida |
|---|---|---|
| 🟢 Verde | ≥1 edificio OSM a 30m | OK, GPS confiable |
| 🟠 Naranja | 0 edificios OSM a 30m | Revisar: puede ser baldío, GPS desplazado, o OSM incompleto en esa zona |
| 🔴 Rojo | Error en consulta | Re-correr el script |

⚠️ **Falsos negativos esperados:** OSM tiene cobertura parcial en Santa Cruz. Que devuelva 0 buildings NO siempre significa GPS malo — puede ser que el edificio existe pero no está mapeado. Por eso el script genera también el HTML con el mapa: la revisión visual confirma.

## Política de uso

- Overpass API y Nominatim son servicios públicos de OSM. **Respetar el rate limit** (este script ya lo hace: 1 req/2s).
- User-Agent obligatorio (este script lo manda).
- Para uso masivo (>100 pm/día) considerar instancia self-hosted.
