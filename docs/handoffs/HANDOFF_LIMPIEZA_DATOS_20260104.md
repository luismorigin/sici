# SICI Handoff - Limpieza de Datos (4 Enero 2026)

## Resumen Ejecutivo

Sesión intensiva de auditoría y limpieza de `proyectos_master`. Se encontraron múltiples problemas de calidad de datos: duplicados, GPS incorrectos/copiados, y propiedades mal asignadas. Todo fue corregido manualmente verificando contra Google Maps.

---

## Cambios Realizados en la Base de Datos

### Proyectos Eliminados (4)

| ID | Nombre | Razón |
|----|--------|-------|
| 10 | Plaza Italia | Duplicado de Sky Plaza Italia (ID 280) - GPS idéntico |
| 78 | Smart Studio One | Duplicado de One Soul by Smart Studio (ID 226) |
| 237 | TEST - Edificio Seed Data | Proyecto de prueba |
| 279 | Westgate | No existe en Google Maps |

### Proyectos Eliminados por Migración 016 (5)

| ID | Nombre | Razón |
|----|--------|-------|
| 107 | Condominio Sky Eclipse | Duplicado de ID 30 |
| 100 | Condominio SKY Élite | Duplicado de ID 7 |
| 105 | Condominio SKY LEVEL | Duplicado de ID 16 |
| 51 | 58 - Sky Collection Art Deco | GPS era de Eurodesign Soho |
| 110 | Condominio Sky | Genérico, capturaba props de otros |

### GPS Corregidos (8)

| ID | Proyecto | Problema | Acción |
|----|----------|----------|--------|
| 3 | Spazios Edén | GPS copiado de Edificio Spazios | GPS removido (NULL) - ubicación real desconocida |
| 20 | Euro Design Le Blanc | GPS incorrecto (apuntaba a Sky Plaza) | Corregido: -17.7583519, -63.1969311 |
| 40 | Sky Lux | GPS muy incorrecto (~1km error) | Corregido: -17.7558581, -63.1974746 |
| 58 | Sky Collection Art Deco | GPS incorrecto | Corregido: -17.7689402, -63.1964929 + alias "Edificio Art Deco" |
| 104 | Sky Collection Equipetrol | GPS copiado de Sky Tower | Corregido: -17.7662511, -63.1956664 |
| 265 | SMART STUDIO EQUIPE 1.0 | GPS copiado de ISUTO | Corregido: -17.7680605, -63.1955699 |
| 16 | Sky Level | GPS ligeramente incorrecto | Corregido: -17.7682141, -63.1963337 |

### GPS Agregados (3 proyectos Sky nuevos)

| ID | Proyecto | GPS | Place ID |
|----|----------|-----|----------|
| 277 | Sky Aqualina Residence | -17.7679295, -63.1771671 | ChIJ0YZCkZTnEZMREWkvRedtu8Y |
| 278 | Madero Residence | -17.7679897, -63.1965672 | ChIJBU3GO_rnEZMROBNIODtuoAY |
| 280 | Sky Plaza Italia | -17.7695918, -63.1966907 | ChIJx_w6s18n8ZMRtAIQsjub-T8 |

### Proyectos Renombrados (1)

| ID | Antes | Después | Razón |
|----|-------|---------|-------|
| 33 | Mura | Edificio MURURE | Nombre incorrecto, Google Maps dice "MURURE" |

### Proyectos Creados (6)

| ID | Nombre | Desarrollador |
|----|--------|---------------|
| 275 | Eurodesign Soho | Eurodesign |
| 276 | Sky Icon | Sky Properties |
| 277 | Sky Aqualina Residence | Sky Properties |
| 278 | Madero Residence | Sky Properties |
| 280 | Sky Plaza Italia | Sky Properties |

### Propiedades Reasignadas (7)

| Prop ID | De Proyecto | A Proyecto | Razón |
|---------|-------------|------------|-------|
| 173 | ID 51 (eliminado) | ID 58 Sky Collection Art Deco | Limpieza Sky |
| 182 | ID 51 (eliminado) | ID 16 Sky Level | Limpieza Sky |
| 194 | ID 51 (eliminado) | ID 275 Eurodesign Soho | Limpieza Sky |
| 204 | ID 110 (eliminado) | ID 145 Sky art decor | Limpieza Sky |
| 238 | ID 110 (eliminado) | ID 48 Sky Tower | Limpieza Sky |
| 322 | ID 110 (eliminado) | ID 276 Sky Icon | Limpieza Sky |
| 237 | ID 40 Sky Lux | ID 109 Condominio SKY LUXIA | nombre_edificio decía "Sky Luxia" |

### Propiedades Corregidas Manualmente (3)

| Prop ID | Proyecto Asignado | Razón |
|---------|-------------------|-------|
| 433 | ID 129 NanoTec by Smart Studio | Sin match previo |
| 444 | ID 19 Domus Insignia | Sin match previo |
| 77 | ID 221 SANTORINI VENTURA | Sin match previo |

---

## Lecciones Aprendidas (Patrones de Error)

### 1. GPS Copiados
Muchos proyectos tenían GPS copiado de otro edificio cercano. Esto ocurrió porque:
- Scraper no encontró GPS y copió de propiedad cercana
- Proyectos en preventa sin ubicación real (ej: Spazios Edén)

### 2. Duplicados por Nombre Similar
- "Plaza Italia" vs "Sky Plaza Italia" → Mismo edificio
- "Smart Studio One" vs "One Soul by Smart Studio" → Mismo edificio
- "Mura" vs "MURURE" → Mismo edificio, nombre mal escrito

### 3. Propiedades Mal Asignadas
El matching por nombre falló en casos como:
- "Sky Luxia" asignado a "Sky Lux" (nombres similares pero edificios diferentes)

### 4. FK en Múltiples Tablas
Al eliminar proyectos, hay que limpiar FK en estas tablas:
1. `propiedades_v2`
2. `propiedades` (legacy)
3. `proyectos` (legacy)
4. `matching_sugerencias`
5. `proyectos_pendientes_google`
6. `sin_match_exportados`

---

## Estado Final de la Base de Datos

### Métricas Generales

| Métrica | Valor | % |
|---------|-------|---|
| Proyectos activos | 187 | - |
| Con GPS | 185 | 98.9% |
| Con Google Place ID | 137 | 73.3% |
| Con desarrollador | 41 | 21.9% |
| Sin propiedades | 78 | 41.7% |

### Propiedades (completadas + para matching)

| Métrica | Valor |
|---------|-------|
| Total | 312 |
| Con proyecto asignado | **312 (100%)** ✅ |

### Desarrolladores Asignados

| Desarrollador | Proyectos |
|---------------|-----------|
| Sky Properties | 24 |
| Otros | 17 |
| Sin asignar | 146 |

---

## Pendientes para Próximas Sesiones

1. **Fase 3 - IA Enrichment**: Asignar desarrollador a 146 proyectos
2. **Spazios Edén**: Agregar GPS cuando aparezca en Google Maps
3. **78 proyectos sin propiedades**: Son válidos (verificado), solo sin listings activos
4. **Migración 017**: Mejoras al sistema de matching (ya creada, pendiente ejecutar)

---

## Archivos de Migración

- `/sql/migrations/016_limpieza_sky_properties.sql` - Ejecutada ✅
- `/sql/migrations/017_mejoras_matching_system.sql` - Pendiente ejecutar ⏳

---

## Notas Técnicas

### Query para Detectar Duplicados por GPS
```sql
SELECT p1.id_proyecto_master, p1.nombre_oficial,
       p2.id_proyecto_master, p2.nombre_oficial,
       ROUND(111139 * SQRT(
           POWER(CAST(p1.latitud AS FLOAT) - CAST(p2.latitud AS FLOAT), 2) +
           POWER((CAST(p1.longitud AS FLOAT) - CAST(p2.longitud AS FLOAT)) *
                 COS(RADIANS(CAST(p1.latitud AS FLOAT))), 2)
       )) as distancia_metros
FROM proyectos_master p1
JOIN proyectos_master p2 ON p1.id_proyecto_master < p2.id_proyecto_master
WHERE p1.activo = true AND p2.activo = true
AND p1.latitud IS NOT NULL AND p2.latitud IS NOT NULL
HAVING distancia_metros < 50
ORDER BY distancia_metros;
```

### Proceso de Eliminación Segura
Siempre verificar y limpiar FK antes de DELETE:
```sql
-- 1. Verificar dependencias
SELECT
    (SELECT COUNT(*) FROM propiedades_v2 WHERE id_proyecto_master = X) as props_v2,
    (SELECT COUNT(*) FROM propiedades WHERE id_proyecto_master = X) as props_legacy,
    (SELECT COUNT(*) FROM matching_sugerencias WHERE proyecto_master_sugerido = X) as sugerencias;

-- 2. Limpiar referencias
UPDATE propiedades_v2 SET id_proyecto_master = NULL WHERE id_proyecto_master = X;
UPDATE propiedades SET id_proyecto_master = NULL WHERE id_proyecto_master = X;
DELETE FROM matching_sugerencias WHERE proyecto_master_sugerido = X;

-- 3. Eliminar proyecto
DELETE FROM proyectos_master WHERE id_proyecto_master = X;
```
