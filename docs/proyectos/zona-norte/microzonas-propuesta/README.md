# Microzonas de Zona Norte — versión final

> Trabajo del 29-may-2026. Estado: **14 microzonas definidas, GeoJSON recortado contra Equipetrol, listo para aplicar a BD**. NO se ha aplicado nada todavía.

---

## Resultado

**14 microzonas** que cubren Zona Norte desde el 2do anillo hasta Viru Viru, definidas por **anillos viales × avenidas longitudinales** (criterio híbrido tipo Equipetrol).

| # | Anillo | Avenidas |
|---|---|---|
| 1 | 2do-3er | La Salle - Banzer |
| 2 | 2do-3er | Banzer - Alemana |
| 3 | 2do-3er | Alemana - Mutualista |
| 4 | 3er-4to | La Salle - Banzer |
| 5 | 3er-4to | Banzer - Alemana |
| 6 | 3er-4to | Alemana - Mutualista |
| 7 | 4to-6to | Radial 26 - Banzer |
| 8 | 4to-6to | Banzer - Alemana |
| 9 | 4to-6to | Alemana - Mutualista |
| 10 | 6to-8vo | Radial 26 - Banzer |
| 11 | 6to-8vo | Banzer - Alemana |
| 12 | 6to-8vo | Alemana - Mutualista |
| 13 | 8vo | Paraíso - Radial 26 - Banzer |
| 14 | 8vo | Viru Viru - Banzer - G77 |

**Distribución de inventario (sobre los 73 pm + 238 props venta matched de ZN al 29-may)**:

| Microzona | pm | Props matched |
|---|---|---|
| 3er-4to anillo La Salle-Banzer (incluye **K1**) | 8 | **67** |
| 2do-3er anillo Banzer-Alemana | 13 | 43 |
| 4to-6to anillo Banzer-Alemana | 13 | 40 |
| 4to-6to anillo Radial 26-Banzer | 11 | 31 |
| 6to-8vo anillo Radial 26-Banzer | 7 | 27 |
| 2do-3er anillo La Salle-Banzer | 14 | 11 |
| 3er-4to anillo Banzer-Alemana | 3 | 8 |
| 6to-8vo anillo Banzer-Alemana | 3 | 8 |
| 2do-3er anillo Alemana-Mutualista | 1 | 3 |
| 5 microzonas vacías (lado Alemana-Mutualista + 8vo extremo) | 0 | 0 |
| **TOTAL** | **73** | **238** |

5 microzonas hoy vacías captarán oferta cuando el discovery se expanda a esas áreas (8vo anillo + lado Mutualista).

---

## Archivos en esta carpeta

| Archivo | Para qué |
|---|---|
| **`microzonas-zn-final-recortado.geojson`** | Fuente de verdad. 14 polígonos recortados con ST_Difference vs Equipetrol para evitar overlap. Tilde de "Paraíso" removida para BD. |
| `auditor-microzonas.html` | Visualizador interactivo (Leaflet + Esri satelital). Arrastrá un `.geojson` para ver overlaps, problemas de nombres, sin nombre. |
| `editor-microzonas.html` | Editor con Leaflet.Draw. Permite dibujar polígonos nuevos sobre el mapa con input de nombre individual por polígono (evita el bug de tabla de geojson.io). |
| `propuesta-microzonas.html` | Visualización de la propuesta inicial mía de 4 microzonas (descartada — fue input al proceso). |
| `README.md` | Este archivo. |

---

## Criterio aplicado

**Anillos viales × avenidas longitudinales** — mismo patrón que Equipetrol (que también combina anillos + avenidas + identidad de barrio).

Orden de avenidas oeste→este según el director: **La Salle → Banzer → Alemana → Mutualista**. Sobre el 4to anillo en adelante el extremo oeste pasa a ser **Radial 26**.

Identidades del 8vo anillo: **Paraíso** y **Viru Viru** son barrios reconocidos hacia el norte extremo.

---

## Cronología del trabajo (29-may)

1. **Propuesta inicial** (Claude): 4 microzonas rectangulares por bandas latitudinales (Hamacas, Banzer Norte, Banzer Sur, Frontera EQ). Descartada — el director propuso criterio más granular.
2. **Primer borrador** (director): 3 polígonos del 2do-3er anillo dibujados en geojson.io.
3. **Auditoría**: detectó duplicados, nombres cruzados, typos y un polígono con coords del macro entero. Cleanup.
4. **Expansión** (director): grilla completa de 14 polígonos desde el 2do hasta el 8vo anillo + Viru Viru.
5. **Validación geométrica**: 6 solapamientos internos ZN (de borde, aceptables) + 2 conflictos con EQ (184m y 142m adentro).
6. **Recorte automático** vía `ST_Difference` contra Equipetrol: 574 m² + 165 m² removidos. Overlap residual final: 4 m² (irrelevante).
7. **Normalización**: nombres con espaciado uniforme, "Paraíso" → "Paraiso" sin tilde para BD.

---

## Plan de aplicación (NO ejecutado todavía)

Resumido en este doc. Detalle completo en BITACORA + DECISIONES + ADR pendiente.

### Lo que va a hacer la aplicación

1. **INSERT 14 polígonos ZN** en `zonas_geograficas` con `zona_general='Zona Norte'`, `activo=true`.
2. **UPDATE polígono macro "Zona Norte"** → `activo=false`. Las 14 microzonas lo reemplazan.
3. **Re-correr `get_zona_by_gps()`** sobre las 393 props ZN actuales. Sus `zona` se setean al nombre de microzona específica.
4. **`lib/zonas.ts`**: agregar 14 entries nuevas (display names + slugs). Las 6 EQ quedan intactas.
5. **Workflow de discovery ZN**: en `flujo_discovery_*_zonanorte.json`, el array `ARRAY['Zona Norte']` pasa a las 14 nombres.
6. **NO modificar** el trigger `trg_asignar_zona_venta`. Sigue copiando `nombre` a `zona` y `microzona` como hoy.
7. **Documentar**: crear `docs/canonical/ZONAS_ZONA_NORTE.md` + ADR-010 + updates a BITACORA/README/DECISIONES del proyecto.

### Por qué este plan no toca Equipetrol producción

- Las 14 microzonas no se solapan con los 6 polígonos EQ (4 m² residual = irrelevante).
- Las queries que filtran `zona='Equipetrol Centro'` etc. siguen funcionando idénticas.
- El trigger de asignación no se modifica.
- `lib/zonas.ts` para EQ no se toca.
- El feed `/mercado/equipetrol` sigue igual.

### Lo que queda pendiente para una sesión futura

**Refactor jerárquico EQ**: cuando se decida activar el modelo macro/micro completo, hacer backfill `UPDATE propiedades_v2 SET zona='Equipetrol', microzona=zona_actual WHERE zona IN (6 zonas EQ)` y agregar lógica de jerarquía. Hoy `zona_general` ya está poblada en BD pero no se usa activamente — está latente para ese día.

---

## Modelo conceptual final (decisión del director)

**Dos macrozonas hermanas, cada una con sus microzonas internas**:

```
EQUIPETROL (macrozona — densidad alta)
├── Equipetrol Centro
├── Equipetrol Norte
├── Sirari
├── Villa Brígida
├── Equipetrol Oeste
└── Eq. 3er Anillo

ZONA NORTE (macrozona — densidad menor + expansión hasta 8vo anillo + Viru Viru)
└── 14 microzonas (anillos × avenidas)
```

A nivel de UX y mercado, Equipetrol y Zona Norte son entidades separadas. Aunque Equipetrol geográficamente está dentro del norte de Santa Cruz, **nadie habla de "Equipetrol como parte de Zona Norte"** — son macrozonas hermanas en el habla cotidiana.

**URLs futuras**:
- `/mercado/equipetrol` → 6 microzonas (estado actual)
- `/mercado/zona-norte` → 14 microzonas (a construir, ticket #6 del BACKLOG ZN)
