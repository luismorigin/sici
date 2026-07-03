# Migración deptos Equipetrol al híbrido — ESTADO y mapa de estrangulamiento

> Actualizado: 2026-07-02. Contexto: Bloque 3 del plan strangler (ver
> `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md`). Memoria: `project_deptos_equipetrol_al_hibrido`.
> Contrato técnico: `CONTRATO_FEED.md` (qué escribir para que el feed lo lea).

## Decisiones (founder)

- **MOAT = el lector (Claude Code en sesión), NO API externa.** El script prepara el material ($0 fetch); yo leo precio/TC/dorms/edificio.
- **Cron = BACKLOG.** Por ahora comando on-demand corrido en sesión.
- **Cero escritura a producción.** Evolución: (a) carril de archivos → (b) **entorno SHADOW aislado** (mig 268): un clon entero (`propiedades_v2_shadow` + TC shadow + normalización shadow) donde el híbrido corre el flujo COMPLETO (write + matching + render) sin que el feed público lo vea. El corte real (híbrido escribe la tabla REAL / n8n se apaga) es tras validar varios lotes en el shadow, con OK del founder.
- **`datos_json` DIRECTO** (no reusar `merge_discovery_enrichment` SQL).

## Entorno SHADOW (mig 268 ✅ aplicada)

Clon aislado para la corrida completa sin tocar prod (verificado post-apply):
- **`propiedades_v2_shadow`** — copia exacta (`LIKE ... INCLUDING ALL`, 88 cols; `id` sin default = id real de prod para comparar fila-a-fila; sin FK ni triggers).
- **`config_global_shadow`** — TC shadow separado (paralelo 9.97 / oficial 6.96); el Binance del híbrido escribe acá (`--shadow`, seguro) + simula la unificación moviendo el oficial.
- **`precio_normalizado_shadow()`** — usa el oficial shadow como divisor (con la semilla = idéntica a la real: 100k paralelo→143.247).
- Aislada 100%: GRANTs `service_role`+`claude_readonly`, SIN anon/authenticated → invisible al Data API público. Rollback inline en la migración.

## Qué está construido (`scripts/deptos-equipetrol/`)

| Archivo | Qué hace | Estado |
|---|---|---|
| `lib/detalle-deptos.mjs` | Extractor depto C21+Remax (contacto/fotos/desc/precio + piso/expensas/parqueo/amenidades estructuradas + `parseAreaTexto` fallback BO) | ✅ |
| `lib/tc.mjs` | Clasificación TC contra Binance vivo (`cargarTC`, `clasificarTCporRatio`); texto manda, señal de respaldo | ✅ |
| `carril-paralelo.mjs` | Corre híbrido vs n8n sobre N deptos, arma contrato, compara, escribe a `output/` — CERO escritura a BD | ✅ |
| `actualizar-tc-binance.mjs` | Reemplaza el flujo n8n Binance (dry-run default) | ✅ validado dry-run (9.94 vs n8n 9.97) |
| `sonda-sombra-deptos.mjs` / `moat-material.mjs` | Herramientas de validación previas | ✅ |
| `CONTRATO_FEED.md` | Spec: columnas + `datos_json` que lee `buscar_unidades_simple` | ✅ |

## Resultado del test (100 deptos, cero prod)

- Estructurado (automatizado): contacto **100/100**, fotos 94/100, dorms 90/100 (recamaras=0→lector), área 82/100 (artefacto: viene del discovery).
- Lectura de los 100: **~85 IGUALA** (n8n correcto), **~15 el híbrido corrige/caza**: precio corrupto (3519 $7.5k→$52.6k), TC mal marcado (2761 "TC 6.96"→oficial), match recuperado (Baruc IV, Stone 3), PM_NUEVO (Piazza Once), anticrético mal clasificado (3492).
- **Balance honesto:** iguala o mejora, **cero downside**; pero n8n ya hace bien ~85% y el feed ya filtra basura (bauleras/parqueos/dups por área<20 / `duplicado_de` / `es_multiproyecto`). El valor real de migrar = **matar Firecrawl + código versionable + lector que caza lo mal catalogado**, NO "arreglar el feed".

## Mapa de estrangulamiento n8n

### CORE deptos-venta (el híbrido lo reemplaza — Bloque 3)
| Paso | Workflow n8n | Híbrido |
|---|---|---|
| Discovery C21+Remax | `modulo_1/flujo_a_discovery_*` | ✅ `c21Listado`/`remaxListadoSC` |
| Enrichment regex (**Firecrawl**) | `modulo_1/flujo_b_processing_v3.0` | ✅ extractor (fetch directo) |
| Enrichment LLM (**Firecrawl**) | `modulo_1/flujo_enrichment_llm_venta` | ✅ el lector |
| Merge | `modulo_1/Flujo Merge` | ✅ `datos_json` directo |
| Matching | `modulo_2/matching_nocturno` | ✅ reusa el SQL (`matching_completo_automatizado`) |
| Verificador | `modulo_1/flujo_c_verificador` | ✅ `verificador-casas.mjs` (modelo deptos) |

### SATÉLITES (estrangular aparte)
| Pieza | Qué hace | Estado |
|---|---|---|
| `tc_dinamico_binance` | Binance → `config_global.paralelo` | ✅ `actualizar-tc-binance.mjs` (a flipear) |
| Snapshot absorción | agrega `v_mercado_venta` → `market_absorption_snapshots` | 🔨 falta script chico |
| `auditoria_diaria_sici` | health/checks | ✅ cubierto por skills de audit |

### FUERA de alcance (después)
- **Alquiler** (`alquiler/*`, 7 wf, también Firecrawl) — otra operación, tras venta.
- **Casas/terrenos** (`casas_terrenos/*`) — DESACTIVADO (híbrido ya hace casas ZN).
- `modulo_2/archive/*` — deprecados.

## Reglas clave heredadas (no romper)

- **Precio: el híbrido guarda el CRUDO** (`precio_usd` billete-si-paralelo/directo) + `tipo_cambio_detectado`. La normalización a oficial-comparable la hace el FEED en vivo (`precio_normalizado()`). Pre-normalizar = bug doble-normalización.
- **Binance solo transforma** (no re-procesa): cambiar la tasa auto-actualiza todos los paralelo al leer.
- **Matching: NO `aplicar_matches_aprobados`** (loop K1) — UPDATE directo estilo mig 259, sin pisar `nombre_edificio`. Nombre-primario, GPS solo desempata.
- **Dorms=0 = monoambiente** (correcto, el frontend lo muestra "Monoambiente").
- **Área = discovery** (fallback texto si falta).

## Pendientes / futuro

- **`cargar-deptos-shadow.mjs`** — escribe la versión del híbrido en `propiedades_v2_shadow` (id real de prod, setea zona/microzona, respeta CHECK/NOT NULL heredados). Arrancar con lote chico.
- **`actualizar-tc-binance.mjs --shadow`** — flag para escribir `config_global_shadow` (el `--apply` ahí es seguro).
- **Migración 269** — vistas/RPC shadow (`v_mercado_venta_shadow` + `buscar_unidades_simple_shadow`) para renderizar el feed shadow y compararlo con el real.
- Cutover Binance real (flipear `--apply` a prod + apagar workflow n8n) — tras validar en shadow.
- Script snapshot absorción.
- Más lotes de carril paralelo → decidir corte de deptos.
- **TC transición**: correr `--full` (audit) y Binance MÁS SEGUIDO mientras dure; `precio_normalizado()` tiene 6.96 hardcodeado → actualizar la función cuando el oficial se unifique.
- Empaquetar cron delta (`cron-deptos-equipetrol.mjs`) — backlog.
- Alquiler (después de venta).
