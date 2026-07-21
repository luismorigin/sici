# Lanzamiento del TC nuevo — mostrar precios correctos en la app (SIN el cutover completo)

> Mapeado 20-jul-2026. **Esto NO es el cutover** (`CUTOVER_DATA_PLAN.md`). Es lo MÍNIMO para que la app
> pública (web + bot WhatsApp) muestre los precios del **régimen TC nuevo** (los reales), en vez del TC viejo
> inflado que muestra prod hoy. El cutover (apagar n8n, Paquete TC, audit ZN) queda para después y NO bloquea
> esto. Verificado en código + BD; ver "Cómo se verificó" al final.

## La idea (por qué es chico)

Mostrar precios nuevos = que las superficies **lean SHADOW** (que ya tiene el TC nuevo), igual que las
shortlists `/b/[hash]` ya lo hacen en prod. **NO** requiere swappear la función global `precio_normalizado()`
→ por eso **ZN no se toca, los snapshots siguen, y no hay audit de ZN**. Eso último es del cutover, no de esto.

Malentendido que frenaba: se confundía "cutover completo" con "mostrar precios correctos". Son cosas distintas.

## Precondiciones (confirmadas con el founder, 20-jul)

- **Solo Equipetrol** — shadow tiene Equipetrol completo (~460 venta + 216 alquiler). ZN NO está en shadow → ZN
  queda en prod (oculto/noindex), sin tocar.
- **n8n sigue prendido** un tiempo → prod fresco → **los snapshots NO se rompen** (siguen sobre prod).
- **Snapshots pueden esperar** → NO hace falta construir el snapshot shadow para lanzar.

## El escalón que ve el usuario (declararlo)

- **Venta:** el precio USD (display principal) **baja ~34%** — es el precio REAL (billete), no un bug. El
  viejo era el dólar-oficial-6.96 inflado.
- **Alquiler:** el display es **Bs → NO cambia**. Solo la referencia USD derivada baja ~35% (TC nuevo ~10.76).
  Mucho menos visible.

## Checklist de superficies (para consistencia — mismo precio en TODAS las caras)

> 🔴 **Todas juntas o ninguna.** Si una queda en prod, el usuario ve una prop a un precio en el feed y otro en
> la landing/bot → rompe la confianza fiduciaria. La consistencia es el requisito, no el detalle.

| # | Superficie | Archivo · líneas | Acción |
|---|---|---|---|
| 1 | **Feed venta + alquiler** | `simon-mvp/src/pages/ventas.tsx` / `alquileres.tsx` (pasan `shadow`) → API `pages/api/ventas.ts:116` / `alquileres.ts:66` | Que el frontend pase `shadow: true` por default para Equipetrol (hoy es opt-in `?shadow=1`). El RPC shadow ya existe (`buscar_unidades_simple_shadow` / `buscar_unidades_alquiler_shadow`, 4 migs). |
| 2 | **Landing — propiedades reales + banda de mercado viva** | `simon-mvp/src/lib/superficies-data.ts:105` (props venta) + `:172` (banda viva venta) | `v_mercado_venta` → `v_mercado_venta_shadow` (expone `precio_norm` nuevo). Alquiler (`:97`) es Bs → casi no cambia, pero apuntar igual por prolijidad. |
| 3 | **Bot WhatsApp** (el más importante) | `lab-kapso/src/sici.js:49,79,113,135` (OTRO repo) | `v_mercado_venta`/`v_mercado_alquiler` → `_shadow`. **+ GRANT (abajo)** — sin el grant, falla con *permission denied* (el bot NO usa `claude_readonly`). Columnas verificadas: todas presentes en las vistas shadow. |
| 4 | **/mercado/*** | `simon-mvp/src/lib/mercado-data.ts:144` (números actuales) + `:233` (histórico) · íd. `mercado-alquiler-data.ts` | Números actuales → leer de `v_mercado_venta_shadow` (TC nuevo). Historia de inventario/absorción = TC-independiente, queda. **Solo la LÍNEA de precio histórica venta (`venta_usd_m2`) queda en TC viejo → ponerla "EN CONSTRUCCIÓN"** (vuelve sola cuando el snapshot shadow acumule). Alquiler histórico es Bs → no se toca. |
| — | **ZN, snapshots, función global `precio_normalizado()`, Paquete TC, apagar n8n** | — | **NO SE TOCAN.** Eso es el cutover. |

## SQL del GRANT (paso 3 — lo aplica el humano por Supabase/psql)

El bot se conecta como **`bot_kapso_readonly`** (`SICI_READONLY_URL` en `lab-kapso/.env`). Las vistas shadow
hoy **solo** dan SELECT a `claude_readonly`. Hay que sumarlo:

```sql
-- Vistas shadow que el bot va a leer
GRANT SELECT ON v_mercado_venta_shadow, v_mercado_alquiler_shadow TO bot_kapso_readonly;
-- ⚠️ Si las vistas son SECURITY INVOKER (SICI evita SECURITY DEFINER, regla 13 CLAUDE.md), el caller
--    también necesita acceso a lo de abajo. Verificar y, si aplica:
GRANT SELECT ON propiedades_v2_shadow TO bot_kapso_readonly;
-- GRANT EXECUTE ON FUNCTION precio_normalizado_shadow(...) TO bot_kapso_readonly;  -- exportar firma con pg_get_functiondef
```

Nota de seguridad: esto **abre el shadow a un usuario más** (antes solo `claude_readonly` + `service_role`). Es
legítimo (el bot es consumidor real), pero es una decisión deliberada — el aislamiento del shadow lo evitaba por
default. Ver `docs/canonical/SEGURIDAD_SUPABASE.md`.

## La ÚNICA dependencia real (no son los snapshots)

Si las superficies leen shadow, **shadow tiene que mantenerse fresco** → lo hace el **cron híbrido Fase 0** (el
que corre local, ver `project_motor_hibrido_routine_local`). O sea: el verdadero prerequisito del lanzamiento
NO son los snapshots ni el audit ZN — es **que el cron corra confiable cada noche.**

Mitigantes (por qué es menos riesgoso de lo que suena):
1. Las shortlists YA dependen de esto (decisión 19-jul) y funcionan → precedente.
2. **Shadow-first tiene fallback a prod** (`shortlist-market.ts:58`): el fallback salta si la vista `_shadow`
   deja de EXISTIR (estructural), NO por datos viejos. Con data rancia igual muestra shadow (viejo, no vacío).
3. n8n sigue → prod queda de respaldo.

## Riesgos / caveats

- **Peor caso si el cron falla una noche:** el feed muestra inventario/precios **desactualizados** (no vacío) —
  shadow conserva sus ~460/216. Se refresca la próxima corrida buena.
- **El escalón de venta (-34%) es visible** → declararlo (es el precio real, no un bug). Doc de TC:
  `docs/arquitectura/TIPO_CAMBIO_SICI.md`, memoria `project_tc_marco_nuevo_shadow`.
- **/mercado línea de precio histórica venta = "en construcción"** hasta el snapshot shadow. NO fabricar
  (nada de ×0.66 a la historia vieja).
- **Broker shortlist mgmt** (`api/broker/shortlists/[id].ts`) lee `buscar_unidades_simple` (prod) — es
  broker-interno, menos crítico; decidir si entra en esta tanda o después.

## Cómo se verificó (20-jul)

- Feed venta+alquiler: flag `shadow` + RPC shadow existen (`ventas.ts:116`, `alquileres.ts:66`). Migs
  275/276/279/282 (alquiler).
- Shadow alquiler: 216 props / 193 en feed, mediana 4.500 Bs = $418 (TC implícito 10.76 = nuevo). Coherente.
- Bot: `lab-kapso/src/sici.js` lee vistas PROD; usuario `bot_kapso_readonly` SIN acceso a shadow (solo
  `claude_readonly` tiene SELECT). Columnas del bot: todas presentes en las vistas shadow.
- /mercado: `mercado-data.ts` lee `propiedades_v2` (actual, línea 144) + `market_absorption_snapshots`
  (histórico, 233). Solo `venta_usd_m2` histórico es TC-dependiente.

Contexto: `CUTOVER_DATA_PLAN.md` (el cutover completo, del que esto es un subconjunto anticipado) ·
`project_tc_marco_nuevo_shadow` · `CONTRATO_FRONTEND_SHADOW.md`.

## Prompt de arranque para la conversación nueva (copiar y pegar)

> Pensado para correr en **plan mode**: el primer entregable es un PLAN COMPLETO y ejecutable, no un resumen.
> El lanzamiento son cambios de **APP** (`simon-mvp` + `lab-kapso`) → un merge a main **dispara deploy en Vercel**.

```
Voy a ejecutar el lanzamiento del TC nuevo en la app: que el feed, la landing, el bot de
WhatsApp y /mercado muestren los precios reales (leyendo shadow), SIN el cutover completo.
Contexto y checklist: scripts/deptos-equipetrol/LANZAMIENTO_TC_NUEVO.md + la memoria
project_lanzamiento_tc_nuevo.

TU PRIMER ENTREGABLE ES UN PLAN LISTO PARA IMPLEMENTAR. No escribas código todavía.

Para armarlo:
1. LEÉ el doc y la memoria — ahí está el mapeo (superficies, archivos, líneas, SQL del GRANT).
2. RE-VERIFICÁ contra el repo y la BD reales: archivos, líneas, migraciones y grants pueden
   haber cambiado desde que se escribió el doc. NO confíes en él a ciegas. Si algo no coincide,
   eso va en el plan como hallazgo.

EL PLAN DEBE TRAER (si falta algo de esto, no está listo):
- Las 4 superficies, con el cambio EXACTO en cada una (archivo + línea + qué se reemplaza).
- El SQL del GRANT, verificado contra los permisos que existen hoy.
- El ORDEN de ejecución y por qué.
- Cómo se VERIFICA cada superficie (que muestre el precio nuevo, y que no se rompió nada).
- Cómo se REVIERTE si sale mal.
- Qué necesitás de mí y en qué momento.
- Los riesgos reales, incluido el escalón de precio visible al usuario.

REGLAS (no negociables, también durante la implementación):
- NO ejecutes el GRANT ni commits/pushes sin mi OK explícito en el momento.
- El bot vive en OTRO repo: C:\Users\LUCHO\Desktop\Censo inmobiliario\lab-kapso
- NO toques: la función global precio_normalizado(), ZN, los snapshots, n8n. Eso es el CUTOVER,
  no esto. Si algo te empuja ahí, PARÁ y preguntame.
- Al implementar: rama nueva desde main, UNA superficie a la vez, verificando cada una.
- Esto SÍ toca simon-mvp → el merge a main dispara deploy. Avisame antes.

DONE: las 4 superficies muestran el MISMO precio para una misma propiedad. Si una queda con
el precio viejo, NO se lanza — la inconsistencia (misma prop a dos precios) rompe la confianza
fiduciaria, que es el activo del producto.

Arrancá leyendo y verificando, y volvé con el plan.
```

> **Por qué el plan primero** (aprendido el 20-21 jul): el mapeo original decía "flipear el feed" y al
> verificar aparecieron **4 superficies en 2 repos + un GRANT** — el bot ni siquiera estaba en este repo y
> su usuario `bot_kapso_readonly` no tenía permiso sobre shadow. Improvisar superficie por superficie habría
> dejado precios inconsistentes en producción a mitad de camino.
