---
description: Audit mensual del feed /ventas — drift Firecrawl + los 14 checks SQL afinados de la semanal (capa 2-4) + matching audit. Detector TC con verificación por lectura y regla multi-precio. Genera reporte ejecutivo con análisis humano.
---

# Audit mensual — feed /ventas

Auditoría completa del feed cruzando 3 capas:

1. **Capa 1 — Drift Firecrawl**: re-scrapea las props vivas y compara descripción guardada vs portal actual
2. **Capa 2 — Inconsistencias internas**: detecta desincronizaciones entre `precio_usd`, `tipo_cambio_detectado`, `nombre_edificio` y la descripción
3. **Capa 3 — Audit matching**: verifica que `nombre_edificio` BD aparece en slug/title/desc del listing, usando `proyectos_master.alias_conocidos`

## Argumentos

- (sin argumentos) — corrida normal con Firecrawl, costo ~$1.75
- `--use-cached <run-dir>` — re-procesa un reporte de Firecrawl previo (gratis, para test)
- `--skip-insert` — no escribe a Supabase (útil si la migración 242 no está aplicada)

## Flujo de ejecución

Cuando el usuario invoca `/audit-feed-ventas-mensual` (con o sin args):

### 1. Ejecutar el orquestador

Correr desde `sici/scripts/auditoria-feed-ventas/` (el worktree `sici-auditoria/` fue eliminado; el fix de aislamiento `zona_general` vive en este `lib/db.mjs`):

```powershell
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\scripts\auditoria-feed-ventas"
node audit-feed-ventas-mensual.mjs $ARGUMENTS
```

> **Pre-requisito:** si es la primera corrida tras un clone, `npm install` en esta carpeta (el `.mjs` usa `@supabase/supabase-js`, `firecrawl`, `dotenv`). La semanal no lo necesita (SQL puro vía MCP), la mensual sí.

Si el usuario pasó argumentos (ej. `--use-cached 2026-05-08-...`), reemplazar `$ARGUMENTS` con esos. Si no, correr sin args (modo normal).

**Importante**: el orquestador puede tardar 5-10 min en modo normal (350 props × Firecrawl). En modo cached es instantáneo.

### 2. Leer los outputs

El orquestador genera 3 archivos en `reports/mensual-<timestamp>/`:

- `combined.json` — detalle completo por prop (las 3 capas combinadas)
- `meta.json` — metadata: stats, runId DB, costo
- `summary.md` — reporte ejecutivo bruto

Leer los 3 archivos.

### 3. Análisis humano (acá está el valor)

**No te quedes con el reporte bruto del script.** Procesalo con contexto del proyecto y filtrá ruido conocido. Reglas de filtrado:

#### Ruido conocido (filtrar/agrupar, no flagear individualmente)

- **Lofty Island contadores** (#43, 46, 49, 52, 511 y similares): broker rota descripción con números/fechas de unidades disponibles. Si el bucket es "cambio_menor" Y los `palabras_agregadas/quitadas` son números o nombres de meses → es ruido típico, agruparlo en una línea: "5 props Lofty Island con drift de contadores rotativos"
- **HTML entities** (`&nbsp;`, `&amp;` en `palabras_quitadas`): cambio cosmético del render del portal, no es drift real
- **Sky Plaza Italia** y proyectos donde `nombre_edificio` BD repite en muchas props pero la descripción es de UN edificio específico (ej: #874 era Eurodesign Soho asignado mal a Sky Plaza Italia): notar como "matching potencialmente errado" pero no alarmar

#### Patrones críticos (siempre reportar)

- **Doble normalización TC paralelo** (el ÚNICO bug de TC que se audita — usar el MODELO TC y el check 2.1 de `audit-feed-ventas-semanal.command.md`): props `tipo_cambio_detectado='paralelo'` donde `precio_usd` quedó en valor OFICIAL en vez del billete (ratio `precio_usd / billete_desc` ≈ 1.15–1.60) → el feed las infla ~30-46%.
  - ⚠️ **NO flaguear** el gap oficial↔billete en `no_especificado`/`oficial` (es esperado — fue el falso positivo del 25-may que marcó props correctas como infladas). El viejo check "no_especificado→paralelo" quedó **eliminado**.
  - ⚠️ **VERIFICACIÓN POR LECTURA OBLIGATORIA + regla multi-precio**: leé la desc de CADA prop a corregir y tomá el precio del **departamento solo**, NO el de parqueo/garaje/baulera ni otra unidad (caso #2142: "CON PARQUEO 105.000" / "SÓLO DPTO 95.000" → correcto 95.000). Si hay 2+ montos y no se desambigua → 🟡 verificar a mano, no dar número.
  - Fix: `UPDATE propiedades_v2 SET precio_usd = <billete del depto>, fecha_actualizacion=NOW() WHERE id=X;` + **candar `precio_usd`**.
- **Cambio de precio explícito en desc**: descripción menciona "Nuevo Precio" o el precio bajó significativamente (>10%) y `precio_usd` BD no se actualizó
- **Listings muertos** (`bucket='reescrita'` con `len_scraped=0`): Firecrawl trajo HTML vacío.
  - ⚠️ **VERIFICACIÓN HTTP OBLIGATORIA antes de marcar — el vacío puede ser FALLO DE RENDER (C21 es SPA), no muerte.** (1-jun-2026: de 8 candidatos, solo 3 eran 404 reales; 5 eran render fallido y estaban vivos.) Hacé `curl` del status code de cada candidato:
    ```bash
    curl -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36" -o /dev/null -w "%{http_code}" "<url>"
    ```
    - **404 / 302 → muerto real** → marcar `inactivo_pending`.
    - **200 → VIVO** (fallo de render de Firecrawl) → **descartar, NO tocar.**
  - ⚠️ El `og:title`/meta tags **NO** distinguen (C21 los devuelve incluso en 404). El **discovery tampoco** (su grid re-lista URLs cuyo detalle da 404). **Solo el status HTTP del fetch es confiable.**
  - SQL (solo para los 404/302 confirmados): `UPDATE propiedades_v2 SET status='inactivo_pending', fecha_actualizacion=NOW(), primera_ausencia_at=COALESCE(primera_ausencia_at,NOW()) WHERE id IN (...) AND status='completado';`
- **Mismatch de matching real**: capa 3 reporta `mismatch_real`. NO asumir que el matching está mal. Discriminar 3 casos:
  1. **Variante del nombre faltante en alias_conocidos** (más común): la desc dice un alias que el `proyectos_master` no tiene. Acción: agregar el alias al proyecto master (NO cambiar `nombre_edificio` de la prop). Ej: prop dice "UPTOWN EQUIPETROL", BD asigna "Edificio Uptown Equipetrol", agregar "UPTOWN EQUIPETROL" a `alias_conocidos` del proyecto.
  2. **Edificio realmente distinto**: la desc menciona un proyecto que NO existe en `proyectos_master` o existe con otro `id_proyecto_master`. Acción: verificar manualmente (puede ser matching errado real).
  3. **Falso positivo del regex**: el regex agarró texto descriptivo (ej: "Amoblado y equipado con menaje"). Acción: ignorar.
  
  Para distinguir, leer la descripción completa + revisar `nombre_oficial` + `alias_conocidos` del proyecto asignado.
- **Cambio de modelo comercial**: descripción cambió "incluye parqueo" ↔ "parqueo opcional" o similar
- **Cambio de unidad**: descripción cambió "Piso X" → "Piso Y" (broker reusó el listing para otra unidad — caso #100)

#### Cambios menores reales (revisar pero no urgente)

- Cambio de fecha de entrega (dic 2025 → mar 2026)
- Aparición de "SOLO CONTADO" como condición
- Cambio de números pequeños (m², piso) sin afectar precio

### 3.5 Capa 2-4 SQL afinada (importada de la semanal)

Además del drift Firecrawl (capa 1) y la capa 2 del orquestador `.mjs`, **correr también los checks SQL afinados de `audit-feed-ventas-semanal.command.md`** — están más calibrados que `internal-checks.mjs` y reusan el mismo MCP `postgres-sici`. La mensual = drift portal (capa 1, exclusivo) **+** los 14 checks SQL de la semanal:

- **Capa 2 (7 checks):** 2.1 doble normalización TC *(con verificación por lectura + regla multi-precio)*, 2.3 cambio de precio explícito, 2.4 precio absurdo, 2.5 nombre en casa/terreno, 2.6 nombre sospechoso, 2.7 booleanos vs desc, 2.8 dormitorios=0.
- **Capa 3 (4 checks):** 3.1 matching errado, 3.2 GPS fuera de radio, 3.3 prefijo ambiguo, 3.4 nombre en alias de otro pm.
- **Capa 4 (3 checks):** 4.1 área absurda, 4.2 desc corta, 4.3 TC NULL con BOB.

**Diferencia de ventana:** la mensual cubre **TODO el feed**, no solo props nuevas. Al ejecutar los checks de la semanal, usar el filtro base **solo** con `AND v.zona_general = 'Equipetrol'` (aislamiento mig 257) y **sin** el `fecha_creacion >= CURRENT_DATE - N`. El resto de cada query es idéntico al de la semanal. No dupliques las queries acá: leé `audit-feed-ventas-semanal.command.md` y aplicá cada check quitando la ventana temporal.

### 4. Reporte ejecutivo final al usuario

Estructura el output al usuario así:

```
# Audit Mensual — <YYYY-MM-DD>

## 🔴 CRÍTICO (X props con acción inmediata sugerida)

### TC paralelo mal mapeado (N props)
Impacto en feed: subestimación total de ~$Y miles
[tabla: ID | Edificio | BD precio | desc precio | impacto en feed]

→ SQL listos:
[bloques SQL con IDs]

### Cambios de precio reales (M props)
[tabla con BD vs portal vs acción sugerida]

### Listings muertos (P props)
[tabla + SQL para inactivo_pending]

### Mismatch de matching reales (Q props)
[tabla con BD asignado vs desc menciona]

## 🟡 ATENCIÓN (Z props para revisar)
[cambios de fecha, modelo comercial, unidad — decisiones humanas]

## 🟢 INFORMATIVO

- Total auditado: <N> de <M> props
- Drift detectado: <X>% (vs <prev>% mes pasado si hay histórico en `audit_descripciones_runs`)
- Listings muertos: <N> (en línea con histórico ~3/mes)
- Costo Firecrawl: $<Y>
- DB run_id: <uuid> (para queries posteriores)
- Lofty Island contadores: <N> props (ruido típico, sin acción)
- HTML entities: <N> props (cosmético, sin acción)

## Detalle completo
`<run_dir>/summary.md` y `<run_dir>/combined.json`
```

### 5. Pregunta al usuario qué accionar

Después del reporte ejecutivo, preguntá concretamente:

- ¿Aplicar los SQL críticos ahora? (TC mismatch + listings muertos suelen ser seguros)
- ¿Querés side-by-side de los cambios de precio reales para decidir?
- ¿Hay algún caso específico que querés que investigue más?

NO apliques mutations sin confirmación del usuario.

## Datos útiles para el análisis

- **TC paralelo actual**: 9.954 (oficial 6.96, ratio 1.43)
- **Total feed actual**: ~342 props vivas en `v_mercado_venta`
- **Casos canónicos** (referencia para reconocer patrones):
  - #317 La Riviera, #428 Las Palmeras: TC paralelo mal mapeado
  - #422 INIZIO: rebaja explícita "Nuevo Precio"
  - #874 Eurodesign Soho: matching errado a Sky Plaza Italia
  - #629/888/1141/1142/1143: listings muertos C21 con HTML 200 vacío

## Querys históricos útiles

Para comparar con audits previos (si la migración 242 está aplicada):

```sql
-- Tendencia mensual
SELECT * FROM audit_descripciones_tendencias;

-- Props con drift recurrente (en >=2 audits)
SELECT prop_id, COUNT(DISTINCT run_id) as veces
FROM audit_descripciones_items
WHERE bucket IN ('cambio_relevante', 'reescrita')
GROUP BY prop_id
HAVING COUNT(DISTINCT run_id) >= 2;
```
