# Zonas Zona Norte — Descripción canónica

> Paralelo a `ZONAS_EQUIPETROL.md`. Documenta las 14 microzonas de la macrozona "Zona Norte" definidas el 29-may-2026.

**Fuente de verdad**: tabla `zonas_geograficas` (14 polígonos PostGIS con `zona_general='Zona Norte'`).

---

## Descripción geográfica

Macrozona **Zona Norte** = todo lo que no es Equipetrol al norte de Santa Cruz. Grilla de **anillos viales × avenidas longitudinales**.

Orden de avenidas oeste→este según conocimiento local del director:
**La Salle → Banzer → Alemana → Mutualista**

A partir del 4to anillo, el extremo oeste pasa a ser **Radial 26**. A partir del 8vo anillo + barrios identitarios (Paraíso, Viru Viru).

### Grilla 4×3 + 2 microzonas (~12 km N-S × 9 km E-O)

| Anillo | Oeste | Centro | Este |
|---|---|---|---|
| **2do-3er** | 2do-3er anillo La Salle-Banzer | 2do-3er anillo Banzer-Alemana | 2do-3er anillo Alemana-Mutualista |
| **3er-4to** | 3er-4to anillo La Salle-Banzer | 3er-4to anillo Banzer-Alemana | 3er-4to anillo Alemana-Mutualista |
| **4to-6to** | 4to-6to anillo Radial 26-Banzer | 4to-6to anillo Banzer-Alemana | 4to-6to anillo Alemana-Mutualista |
| **6to-8vo** | 6to-8vo anillo Radial 26-Banzer | 6to-8vo anillo Banzer-Alemana | 6to-8vo anillo Alemana-Mutualista |
| **8vo+ Norte** | 8vo anillo Paraíso - Radial 26-Banzer | — | — |
| **8vo+ NE** | — | — | 8vo anillo Viru Viru - Banzer-G77 |

---

## Distribución de inventario (snapshot al 29-may-2026, post-migración 254)

| Microzona | pm | Props venta matched |
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
| 5 microzonas vacías (lado Mutualista + 8vo extremo) | 0 | 0 |
| **TOTAL** | **73** | **238** |

5 microzonas hoy sin oferta captarán props cuando el discovery se expanda a esas áreas.

---

## Nombres en BD

| Nombre BD | Slug (URL) | Display corto |
|---|---|---|
| 2do-3er anillo La Salle-Banzer | `zn_2_3_la_salle_banzer` | ZN 2-3 LS/Bz |
| 2do-3er anillo Banzer-Alemana | `zn_2_3_banzer_alemana` | ZN 2-3 Bz/Al |
| 2do-3er anillo Alemana-Mutualista | `zn_2_3_alemana_mutualista` | ZN 2-3 Al/Mu |
| 3er-4to anillo La Salle-Banzer | `zn_3_4_la_salle_banzer` | ZN 3-4 LS/Bz |
| 3er-4to anillo Banzer-Alemana | `zn_3_4_banzer_alemana` | ZN 3-4 Bz/Al |
| 3er-4to anillo Alemana-Mutualista | `zn_3_4_alemana_mutualista` | ZN 3-4 Al/Mu |
| 4to-6to anillo Radial 26-Banzer | `zn_4_6_radial_26_banzer` | ZN 4-6 R26/Bz |
| 4to-6to anillo Banzer-Alemana | `zn_4_6_banzer_alemana` | ZN 4-6 Bz/Al |
| 4to-6to anillo Alemana-Mutualista | `zn_4_6_alemana_mutualista` | ZN 4-6 Al/Mu |
| 6to-8vo anillo Radial 26-Banzer | `zn_6_8_radial_26_banzer` | ZN 6-8 R26/Bz |
| 6to-8vo anillo Banzer-Alemana | `zn_6_8_banzer_alemana` | ZN 6-8 Bz/Al |
| 6to-8vo anillo Alemana-Mutualista | `zn_6_8_alemana_mutualista` | ZN 6-8 Al/Mu |
| 8vo anillo Paraiso - Radial 26-Banzer | `zn_8_paraiso_radial_26_banzer` | ZN 8 Paraíso |
| 8vo anillo Viru Viru - Banzer-G77 | `zn_8_viru_viru_banzer_g77` | ZN 8 Viru Viru |

**Nota**: en BD "Paraíso" se guarda como `Paraiso` (sin tilde) para evitar issues de encoding. Display puede mostrar con tilde via `displayZona()`.

---

## Modelo conceptual

**Zona Norte y Equipetrol son macrozonas hermanas operativamente** (no jerárquicas, aunque geográficamente Zona Norte contiene a Equipetrol).

```
EQUIPETROL (macrozona — densidad alta)
├── Equipetrol Centro
├── Equipetrol Norte
├── Sirari
├── Villa Brigida
├── Equipetrol Oeste
└── Eq. 3er Anillo

ZONA NORTE (macrozona — densidad menor + expansión 8vo + Viru Viru)
└── 14 microzonas (anillos × avenidas)
```

A nivel UX y mercado, son entidades separadas en el habla común. Las URLs futuras serán `/mercado/equipetrol` y `/mercado/zona-norte`.

Ver ADR-010 en `DECISIONES.md` para racional completo.

---

## Caveats sobre series históricas

### Serie `zona='Zona Norte'` en `market_absorption_snapshots`

Desde el 26-may al 29-may-2026, la serie de `market_absorption_snapshots` con `zona='Zona Norte'` representó el agregado del polígono macro. **A partir de la migración 254 (29-may-2026), esa serie queda congelada** — ya no se generan filas nuevas con ese nombre.

Las nuevas series son por microzona específica (LOOP 2) y por macrozona global (LOOP 1 v4: `zona='global_zona_norte'`).

**Para queries que comparan series por zona, considerar el corte temporal**:
- Pre 29-may-2026: `zona='Zona Norte'` (agregado macro)
- Post 29-may-2026: `zona IN (14 nombres)` o `zona='global_zona_norte'` (filter_version=4)

### Gaps de cobertura

La unión de las 14 microzonas tiene **3 gaps relevantes dentro del polígono macro original** (~43 hectáreas en total, 1.56% del área):

| Gap | Tamaño | Centro |
|---|---|---|
| 1 | 28.8 ha | -17.755, -63.168 (4to-6to franja central) |
| 2 | 13 ha | -17.730, -63.183 (norte 6to-8vo lado oeste) |
| 3 | 1.4 ha | -17.709, -63.188 (norte extremo cerca 8vo) |

**Hoy (29-may-2026): 0 props o pm caen en estos gaps**. Si en el futuro un discovery captura una prop dentro de un gap, va a quedar con `zona=NULL` (trigger venta) o `status='excluida_zona'` (trigger alquiler).

Query de monitoreo diario en `operacion.md`.

---

## Referencias técnicas

- **Trigger**: `trg_asignar_zona_venta` y `trg_asignar_zona_alquiler` (sin cambios en mig 254 — siguen copiando nombre a `zona` y `microzona`).
- **Trigger HITL**: `trg_separar_hitl_por_macrozona` (mig 254 — usa `zona_general` dinámicamente).
- **Función**: `get_zona_by_gps(lat, lon)` (mig 254 — fix `AND activo=TRUE`).
- **Función**: `snapshot_absorcion_mercado_v4()` (mig 255 — refactor dinámico, paralelo a v3 durante 14 días).
- **Código frontend**: `simon-mvp/src/lib/zonas.ts` exporta `ZONAS_ZONA_NORTE` + helper `getMicrozonasZN()`.
- **Conteos actuales**: `SELECT zona, COUNT(*) FROM v_mercado_venta GROUP BY zona WHERE zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte')`.

---

## Próximos pasos (no en este ticket)

1. **Frontend `/mercado/zona-norte`** (ticket #6 del BACKLOG ZN).
2. **Refactor zonas dinámico** (ticket #11 nuevo) — endpoint `/api/zonas`, hook `useZonas()`, sistema escalable para Urubó.
3. **Detector automático de clusters emergentes** (ticket #1.7) — agrega pm sin sesión manual.
