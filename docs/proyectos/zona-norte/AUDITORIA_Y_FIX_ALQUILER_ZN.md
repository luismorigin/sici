# Ticket #7 — Auditoría Fase 4 Alquiler ZN + Diseño del fix (con doble-check senior)

> **Fecha:** 30 May 2026
> **Estado:** DISEÑO — nada aplicado. Solo lectura/diagnóstico contra producción. **Pasó doble-check adversarial independiente** (ver §0).
> **Principio rector:** no dañar Equipetrol producción.

Este documento reemplaza la idea inicial de "#7 = replicar el pipeline de venta para alquiler". La auditoría contra producción mostró que **el pipeline de alquiler ya procesa Zona Norte solo** (Remax trae todo Santa Cruz, los triggers GPS/HITL ya soportan ZN). El trabajo real de #7 es mucho más acotado y, sobre todo, distinto de lo que el título sugería.

---

## 0. Correcciones del doble-check independiente (30-may)

> Un segundo ingeniero revisó este diseño adversarialmente contra producción **y encontró 3 errores en la versión original de este doc**. Se dejan acá arriba porque cambian el plan. Las secciones de abajo conservan el análisis con estas correcciones marcadas inline.

| # | Corrección | Efecto en el plan |
|---|---|---|
| C1 | **Hallazgo 1 estaba SOBREDIMENSIONADO.** El snapshot global de alquiler **no tiene ningún consumidor**: ni el feed público (`lib/mercado-alquiler-data.ts:117` lee `v_mercado_alquiler` live) ni `/admin/market-alquileres` (`market-alquileres.tsx:107` lee `propiedades_v2` live). **El feed público NUNCA estuvo contaminado.** A1 baja de 🔴 "limpia EQ hoy" a 🟡 "higiene de dato latente sin consumidor". | A1 sigue valiendo (para cuando #6/#12 conecten frontend ZN) pero **no es urgente**. |
| C2 | **Impacto real de A1 = 1-5%, no 30-50%.** Medido: mediana global vs solo-EQ por dorm mueve 0d +5%, 1d +2%, 2d +1.4%, 3d +3.3%. | Sin "comunicación de corrección" estilo "-2 props venta". Trivial. |
| C3 | 🔴 **FIX B1 con guard de distancia SOLA dañaría EQ.** ~15 matches EQ alquiler auto-aprobados hoy superan 800m y la mayoría son **mismo edificio con GPS de agente desplazado** (Condominio Mirage 1663m, Sky Moon, MARE, Elite Sirari...). El guard los degradaría a HITL erróneamente. **B1 DEBE llevar carve-out por nombre** (no degradar si `similarity>=0.85` o exact_key); degradar solo con nombre dudoso **Y** distancia alta. Sin esto, NO aplicar B1. | B1 reescrito (ver §5). |
| C4 | 🟡 **FIX A2 tiene bug de cobertura.** El LOOP 2 hace `IF v_venta_activas=0 THEN CONTINUE` por celda `(zona,dorm)` → una celda con alquiler pero 0 venta en ese dorm **no escribe fila** y se pierde. Justo las microzonas ZN chicas (n=1, varias) caen en ese hueco. "Reemplazar los NULL del INSERT" NO alcanza. | A2 reescrito (ver §5). |
| C5 | 🟡 **dorm=4 queda fuera** (loops `0..3`). `v_mercado_alquiler` tiene 3 props de 4 dorms → nunca tendrán serie. Caveat, no regresión. | Documentar; decidir si extender a 0..4. |
| C6 | 🟢 El falso Portobello existe **también en venta** (2107/2108 a ~3962m, path `nombre_exacto`). B1 (alquiler) NO lo cierra. | Declarar alcance; el lado venta es otro ticket. |
| C7 | 🟢 Usar `precio_mensual_bob/6.96` en A2, no `precio_mensual_usd` directo (regla 10, alinear con frontend). | Ajuste en A2. |

**Veredicto del revisor: GO-CON-CORRECCIONES.** El corazón A1+A2 es seguro para EQ y reversible (`CREATE OR REPLACE`); A2 necesita el fix de cobertura; B1 es el único riesgo real a EQ y requiere el carve-out por nombre. Hay base para un plan implementable de bajo riesgo.

---

## 1. Cómo se llegó acá (método)

1. Mapa del pipeline alquiler vía agente + canonical (`docs/canonical/pipeline_alquiler_canonical.md`).
2. **Validación contra producción** (la lección meta del 28-29 may: medir antes de construir/optimizar). Todas las cifras de abajo son queries readonly del 30-may, no supuestos.
3. Export de las funciones de prod con `pg_get_functiondef` (Regla 7 — nunca confiar en archivos de migración locales).

El agente de mapeo fue **alarmista** (predijo que el discovery EQ "masacraba" ZN cada noche). Producción lo desmintió: solo 2 props ZN en `inactivo_pending`. El motor está sano. Este doc se queda con lo que la BD confirma.

---

## 2. Estado real de alquiler ZN (verificado en prod, 30-may)

### Inventario por macrozona × status

| Macrozona | completado | inactivo_pending | inactivo_confirmed | excluida_zona |
|---|---|---|---|---|
| Equipetrol | 145 | 22 | 430 | — |
| **Zona Norte** | **31** | **2** | 25 | 4 |

Las 31 ZN completado: **30 de Remax + 1 de C21**, todas con discovery del 30-may.

**Por qué ya fluye:** Remax alquiler trae **todo Santa Cruz** (API base sin slug) → el trigger `trg_asignar_zona_alquiler` (mig 232, usa `zonas_geograficas`) las zonifica a microzonas ZN automáticamente. C21 filtra `zona=Equipetrol` en el portal (por eso solo 1) y Bien Inmuebles filtra `barrio=Equipetrol` (0 props ZN).

**El "BUG #1 de venta" (marcar ausentes sin filtro de zona) es BENIGNO en alquiler:** al revés que venta. En venta, C21 usaba bbox y *excluía* ZN del scrape → las marcaba ausentes. En alquiler, Remax trae todo SC → las props ZN **están** en el scrape → no se marcan ausentes (de ahí solo 2 pending, no una masacre).

### Calidad de las 31 completado

| Métrica | Valor | Lectura |
|---|---|---|
| Sin precio | 4 (13%) | a revisar, menor |
| Área < 20 / null | 1 | menor |
| Sin dormitorios | 0 | ✅ |
| **Sin nombre_edificio** | **15 (48%)** | cola larga normal (sin nombre → sin match), igual que venta arrancando |
| Nombre basura (Preventa/Venta/etc.) | 0 | ✅ el prompt alquiler v2.0/v2.1 es mejor que el de venta |
| Sin amoblado | 2 | ✅ (default "no" del v2.1 funciona) |
| Duplicados | 0 | ✅ |
| Matcheadas | 5 (de las completado) | ver §3 |

### Inactivos (25 inactivo_confirmed)

21 C21 + 4 Remax, casi todos `aviso_terminado`, mayoría legacy feb-may. **6 cayeron en los últimos 30 días** → arrancarán la serie de absorción ZN con ruido (absorbida ≠ alquilada; regla 12 de CLAUDE.md). Mismo caveat que el baseline ruidoso de venta.

---

## 3. Componente por componente: qué funciona y qué no

| Componente | Estado en prod | Acción #7 |
|---|---|---|
| Discovery **Remax** ZN | ✅ Trae 30 props ZN (todo SC) | Nada |
| Discovery **C21** ZN | ❌ Filtra Equipetrol (1 prop) | Opcional (cobertura) |
| Discovery **Bien Inmuebles** ZN | ❌ Filtra barrio=Equipetrol (0) | Opcional (cobertura) |
| Trigger zona GPS alquiler (`trg_asignar_zona_alquiler`) | ✅ Asigna microzonas ZN solo | Nada |
| Enrichment LLM (`prompt-alquiler-v2.md`) | ✅ Zone-agnostic (`{zona}` variable) | Nada |
| Merge (`merge_alquiler`) | ✅ Zone-agnostic | Nada |
| Verificador alquiler (`v2.0.0`) | ✅ Zone-agnostic (status + tipo_operacion) | Nada |
| HITL separado ZN | ✅ 10 sugerencias en `pendiente_zona_norte` (trigger mig 254 ya cubre alquiler) | Nada |
| **Matching (`matchear_alquiler`)** | ⚠️ 16 matches ZN→ZN, **0 contaminación hoy**, pero **Tier 1/2 auto-aprueban sin guard GPS/zona** | **FIX B** |
| **Snapshot (`snapshot_absorcion_mercado`)** | 🔴 Ver §4 — contamina EQ + no genera serie ZN | **FIX A** |

---

## 4. Doble-check senior: lo que destapó leer las funciones de prod

> Esta sección es el "revisor senior de clase mundial" que pediste. Sale de leer el código real de producción, no los docs.

### 🟡 Hallazgo 1 — El snapshot global de alquiler NO está blindado (dato latente, SIN consumidor — ver C1)

> **Corregido por el doble-check (C1/C2):** la versión original decía "contamina Equipetrol HOY" y "feed público contaminado". **Es falso** — ningún frontend consume las columnas de alquiler del snapshot. El impacto es 1-5%, no 30-50%. Queda como higiene de un dato latente, no como bug urgente.

`snapshot_absorcion_mercado` tiene 2 loops:

- **LOOP 1 (`zona='global'`):** la parte de **venta** está blindada a las 6 zonas EQ (`AND zona IN ('Equipetrol Centro',...)`). La parte de **alquiler NO tiene filtro de zona**. Su propio comentario lo admite:
  > `-- ALQUILER (sin filtro de zona en el original; lo dejamos igual, no agregaba zonas extras hasta ahora porque solo había Equipetrol)`

  Consecuencia: `alquiler_activas`, `alquiler_mensual_mediana`, `roi_*` del registro `zona='global'` **cuentan las 31 props ZN junto con las 145 EQ**. Ese registro alimenta el dashboard `/admin/market-alquileres` **y el feed público `/mercado/equipetrol/alquileres`** (yield estimado). → **El yield/renta "de Equipetrol" está hoy contaminado con ZN** (props ~30-50% más baratas bajan la mediana). Es el inverso del riesgo que buscábamos: no es que el fix *amenace* EQ, es que **EQ ya está sucio y el fix lo limpia**.

- **LOOP 2 (por zona, `DISTINCT zona`):** computa **solo venta**; el INSERT escribe `alquiler_* = NULL` **literal** para toda zona. Por eso las 14 microzonas ZN tienen `alquiler_activas=NULL` — y, de hecho, **ninguna zona (ni EQ) tiene serie de alquiler por-zona**. Nunca se implementó.

**Verificado:** `v_mercado_alquiler` muestra ~31 props ZN activas repartidas en microzonas (p.ej. `3er-4to La Salle-Banzer` = 6 monoambientes + 3 de 2 dorms), pero el snapshot las dejó en NULL.

### 🔴 Hallazgo 2 — `matchear_alquiler` Tier 1/2 auto-aprueba sin guard de GPS ni zona

- **Tier 1 (exact lookup, `auto_approve=true`)** y **Tier 2 (normalized, `auto_approve=true`)** matchean por nombre y **no miran GPS ni zona**.
- **Tier 2.5 (trigram)** sí usa GPS (penaliza >500m) y **nunca** auto-aprueba (va a HITL).
- El auto-approve se aplica con `UPDATE propiedades_v2 SET id_proyecto_master` **directo** en `matching_alquileres_batch` / trigger — **no pasa por `matching_sugerencias`**, así que el trigger `trg_separar_hitl_por_macrozona` (que separa ZN) **no lo intercepta**. Los auto-aprobados cross-zona no tienen red.

**Caso real (el falso de la auditoría):** prop **2307** (alquiler, "CONDOMINIO PORTOBELLO ISUTO") → Tier 1 exact → pm **269** (mismo nombre) a **3.1 km**, microzona distinta. Y las ventas **2107/2108** (mismo nombre) están matcheadas al mismo pm 269 a **~4 km**. pm 269 absorbe 3 clusters GPS dispersos del mismo nombre. "ISUTO" es una desarrolladora con varios proyectos homónimos → o son edificios distintos o GPS de agente desplazado. **Requiere verificación visual** (HTML generado, ver §6), NO corrección a ciegas (lección 24-may).

### ⚠️ Observaciones menores (no bloqueantes)

- El blindaje a nivel **microzona** sería demasiado estricto (bloquearía matches intra-ZN legítimos entre microzonas vecinas) — es exactamente el trade-off documentado en el ticket #13 de venta. El guard correcto para alquiler es **GPS + macrozona (`zona_general`)**, no microzona.
- `matching_alquileres_batch` hace `REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup` al inicio — costo OK, pero notar que corre sobre toda la tabla.

---

## 5. Diseño del fix (NADA aplicado todavía)

### FIX A — Snapshot alquiler (2 sub-cambios, ambos additive/protectores)

**A1 — Blindar el bloque de alquiler del LOOP 1 a las 6 zonas EQ.** Agregar a las 3 sub-queries de alquiler global el mismo `AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')` que ya usa venta. **Esto LIMPIA el global EQ** (saca las props ZN). Riesgo EQ: positivo (corrige un sesgo actual). Riesgo de regresión: el número de `alquiler_activas` global bajará ~31 props — hay que avisarlo como corrección, igual que el "-2 props venta" documentado en el README del 27-may.

**A2 — Computar alquiler en el LOOP 2 por-zona.** Genera la serie de alquiler/yield **por microzona ZN y también por zona EQ** (hoy ninguna existe), filtrando por `propiedades_v2.zona = v_zona` y usando `precio_mensual_bob/6.96` (regla 10, **no** `precio_mensual_usd` directo — C7). Additive: no toca venta.
> 🔴 **Corrección C4 (bug de cobertura real):** NO basta con "reemplazar los `NULL` del INSERT". El LOOP 2 hace `IF v_venta_activas=0 THEN CONTINUE` por celda `(zona,dorm)` → una celda con alquiler pero **0 venta en ese dorm** no escribe fila y se pierde. Varias microzonas ZN chicas (n=1) caen ahí. A2 debe **cambiar la condición de skip a `(venta_activas>0 OR alquiler_activas>0)`** o computar alquiler en un paso/CTE que itere también zonas con alquiler. Validar puntualmente con las microzonas ZN de n=1.
> 🟡 **C5:** los loops son `0..3` → dorm=4 (hay 3 props alquiler) nunca tendrá serie. Decidir si extender a `0..4`.

> **Decisión de versión:** se puede hacer **in-place sobre v3** (la función actual) porque A1 sólo *quita* contaminación del global y A2 sólo *llena* NULLs por-zona — ninguno cambia la serie de venta que consumen los 2 frontends. **No hace falta `filter_version=4` ni paralelización** (misma conclusión que cerró #8). El agregado `'global_zona_norte'` sigue siendo el ticket #12 (additive, cuando lo pida el frontend ZN #6).

### FIX B — Guard de GPS/zona en matching alquiler (preventivo + corrige el falso)

**B1 — Guard de distancia + nombre en auto-approve.** En `matchear_alquiler`, antes de `auto_approve=true` en Tier 1/2: degradar a HITL solo si **distancia alta Y nombre dudoso**.
> 🔴 **Corrección C3 (sin esto NO aplicar B1):** el guard de distancia **sola** dañaría EQ. Medido: **~15 matches EQ alquiler auto-aprobados hoy superan 800 m** y la mayoría son **mismo edificio con GPS de agente desplazado**, nombre idéntico (Condominio Mirage 1663m, Sky Moon, MARE, Elite Sirari). Degradarlos a HITL sería un falso-positivo en Equipetrol. El guard debe ser: **no degradar si `similarity(nombre_prop, nombre_proy) >= 0.85` o exact_key**; degradar solo cuando el nombre NO es claramente el mismo **y** la distancia es alta. Con el carve-out por nombre, el umbral exacto de distancia importa menos (800 m es arbitrario). El cluster legítimamente dudoso a separar es `Sky Luxia↔Sky Lux` ×7 a ~1100-1223m (homónimos de mismo desarrollador, patrón ISUTO).
  - Alternativa/complemento: `pm.zona_general = prop.zona_general`. Requiere derivar `zona_general` — usar **`IN`-subquery, NO JOIN-por-nombre** (`Equipetrol Norte` tiene 2 polígonos; el propio `separar_hitl_por_macrozona` en prod ya hace JOIN-por-nombre = deuda latente — C8).
  - ⚠️ **C6:** B1 toca solo `matchear_alquiler`. El mismo falso Portobello existe en **venta** (2107/2108 a ~3962m vía path `nombre_exacto`) — B1 NO lo cierra; es otro ticket.

**B2 — Limpiar el falso 2307** (y revisar 2107/2108) **después** de la verificación visual del director, no antes.

> ⚠️ `matchear_alquiler` procesa EQ **y** ZN. B1 cambia el comportamiento para ambos. Antes de aplicar: **medir cuántos matches EQ existentes superan el umbral** (si hay muchos a >800 m que son correctos por GPS de agente desplazado, recalibrar). Es el mismo cuidado que pidió el ticket #13.

### Lo que el fix NO toca (intacto)

Discovery Remax/EQ, enrichment, merge, verificador, triggers de zona/HITL, prompt LLM. Cero cambios a funciones de **venta**. El snapshot es compartido venta+alquiler pero los cambios son additive sobre el lado alquiler + blindaje (protege venta global, no la altera).

---

## 6. Verificación Portobello — ✅ RESUELTA + FIX B2 APLICADO (30-may)

- **HTML:** `verify-portobello.html` (mapa Leaflet satelital). El director verificó GPS en terreno.
- **Veredicto:** pm 269 absorbía 3 edificios por el agujero del Tier 1 (familia Portobello del desarrollador: 6/Green/Isuto + alianza Stone). Las URLs/slugs lo confirmaron.
- **Aplicado** (`cleanup-portobello-stone-praga-30may.sql`, DO block desde Supabase): 3 pm nuevos (Portobello 6 #421, Stone By Portobello #422, Edificio Praga #423) + 7 props reasignadas + candados (nombre en las 7; id_pm en 2307/2387 por GPS de agente desplazado). pm 269 quedó limpio. Ver BITACORA "30 May continuación 2".
- **El parche de datos NO cierra la causa raíz** → FIX B1 (guard GPS en Tier 1 con carve-out por nombre) sigue pendiente.

---

## 7. Plan implementable propuesto (orden, bajo riesgo a EQ)

| Paso | Qué | Riesgo EQ | Reversible |
|---|---|---|---|
| 0 | Re-exportar defs de prod a archivo antes de tocar (Regla 7) | — | — |
| 1 | **FIX A1** (blindar global alquiler) — corrige contaminación EQ | 🟢 Positivo | CREATE OR REPLACE |
| 2 | **FIX A2** (serie alquiler por-zona) — additive | 🟢 Nulo | CREATE OR REPLACE |
| 3 | Validar 1 corrida: global EQ alquiler baja ~31 props (esperado); microzonas ZN con `alquiler_activas` pobladas | 🟢 | — |
| 4 | Verificación visual Portobello (HTML) → veredicto | 🟢 | — |
| 5 | **FIX B2** (cleanup falso 2307 ± 2107/2108) con candado `nombre_edificio` | 🟢 Acotado a ZN/dispersos | UPDATE reversible |
| 6 | **FIX B1** (guard GPS auto-approve) — medir impacto EQ primero | 🟡 Toca EQ | CREATE OR REPLACE |
| — | Cobertura C21+BI ZN alquiler | 🟢 | (opcional, decisión aparte) |

**Pasos 1-3 son el corazón y son net-positivos para Equipetrol.** El paso 6 (guard matching) es el único que toca el comportamiento de EQ y merece medición previa.

---

## 8. Riesgos residuales / preguntas abiertas para validar antes de aplicar

1. **A1 baja el `alquiler_activas` global** → confirmar que el feed público y `/admin/market-alquileres` no rompen con el cambio de números (es una corrección, pero hay que comunicarla).
2. **A2 con muestras chicas:** 31 props ÷ 14 microzonas × 4 dorms → muchas celdas con n=1 o 0. Mediana/yield por celda serán ruidosos. Mostrar con caveat (≥90 días, regla 12). No es bug, es naturaleza del dato joven.
3. **B1 umbral:** 800 m es propuesta. Medir distribución de distancias en matches EQ auto-aprobados antes de fijar. Riesgo de degradar a HITL matches EQ correctos con GPS de agente desplazado.
4. **`zona_general` no está materializado** en las tablas — derivar via JOIN a `zonas_geograficas` (cuidado con el duplicado `Equipetrol Norte`, 2 polígonos — usar `IN`-subquery, no JOIN-por-nombre, como enseñó el descarte de v4 en #8).
5. **Portobello:** no tocar hasta veredicto visual.
