# Paquete TC NUEVO — decisión de detección + normalización

> **Estado: la DETECCIÓN de tag (Pieza 1) es el RÉGIMEN ACTIVO del HÍBRIDO** (READER_SPEC ya lo marca así).
> **PRODUCCIÓN = n8n**, que sigue con el régimen VIEJO — intacto. El híbrido/shadow NO es producción todavía.
> Pieza 2 (función `precio_normalizado_v2`) + Pieza 3 (re-tag) quedan **por APLICAR en shadow** (SQL, paso humano);
> el switch a n8n/prod es al cutover, cuando el oficial nuevo esté firme.
>
> Motivo: Bolivia unifica el oficial ≈ paralelo (Binance). Colapsan los tags; solo el precio anclado
> al oficial VIEJO (6.96/7 explícito) necesita trato especial. La normalización es en vivo (SQL) →
> el switch NO obliga a re-cargar (salvo el re-tag de data vieja + la repoblación por campos ricos).

## Régimen VIEJO (el de n8n = PRODUCCIÓN — NO tocar; legacy/rollback)
- Tags: `paralelo` / `oficial` / `no_especificado`.
- `precio_normalizado()`: `paralelo` → `precio_usd × tc_paralelo / 6.96` (×1.47); resto → directo.
- Se conserva para rollback (repuntar las vistas/RPC a la vieja). El híbrido NO lo usa.

---

## PIEZA 1 — Detección del tag (el LECTOR / flujo). Va PRIMERO.

Nuevo esquema de tags (2 que importan):

### `default` (oficial nuevo = USD real)
Cuando el texto: dice "paralelo" / "al día" · dice "oficial del día" (post-unificación = Binance, NO el viejo) ·
solo declara USD/moneda ("$us X", "dólares") · o CALLA. → normaliza **directo** (USD real).

### `oficial_viejo` (SOLO si el texto ancla EXPLÍCITO al rate muerto)
Cuando el texto dice literal: **"6.96"** · **"Bs 7"** · **"TC 7"** · **"al cambio oficial 7"** · "tipo de cambio 6.96".
→ se **descuenta** (fue coticado al rate viejo barato). Es el ÚNICO caso especial.

### Interacción con la MONEDA del portal (lo delicado)
- **Remax** trae el precio en **USD** (`price_in_dollars`) → `default` (USD real), salvo 6.96/7 explícito.
- **Century21** trae el precio en **BOB** →
  - texto calla → convertir BOB→USD a la **tasa nueva** (Binance, `config_global.tipo_cambio_paralelo`) → `default`. **[decisión: lo recomendado]**
  - texto dice "6.96/7" → `oficial_viejo`.

> ⚠️ El `oficial` del régimen viejo era AMBIGUO (mezclaba "6.96/7 explícito" con "oficial del día").
> Por eso el lector debe re-emitir el tag correcto — no se puede deducir 100% del tag viejo (está en el TEXTO).
> Ej del test: 3521 "a Bs 7" → `oficial_viejo`; 3578 "oficial del día" → `default` (Binance, no el viejo).

## PIEZA 2 — Función SQL (consume el tag). Va con la Pieza 1.

Función NUEVA aparte (NO sobrescribir la de prod hasta estar seguro):

```sql
CREATE OR REPLACE FUNCTION precio_normalizado_v2(p_precio_usd numeric, p_tipo_cambio_detectado text)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'oficial_viejo' THEN
      ROUND(p_precio_usd * 6.96 / (SELECT valor FROM config_global WHERE clave='tipo_cambio_paralelo'), 2)
    ELSE p_precio_usd   -- default (paralelo/oficial-nuevo/no_especificado) = USD real directo; se va el ×1.47
  END;
$$;
-- 6.96 = constante fija (rate muerto). tipo_cambio_paralelo = Binance dinámico (cron diario, "binance_p2p").
-- Switch = repuntar v_mercado_venta / buscar_unidades_simple a v2 (reversible: repuntar a la vieja).
```

Efecto (con paralelo 10.222): paralelo $100k → $100k (era $146.868, se va el premium); `oficial_viejo` "$100k al 7" → $68.088.

## PIEZA 3 — Re-tag de la data vieja (acompaña el switch)
- `paralelo` → `default` (mecánico). `no_especificado` → `default` (mecánico).
- `oficial` → AMBIGUO: re-leer los que aplique (o heurística) para separar `oficial_viejo` vs `default`.
- One-time SQL UPDATE + candado.

## 4 decisiones (tomadas — confirmar valor)
1. **Oficial nuevo = Binance dinámico** ✅ (ya vive en `config_global.tipo_cambio_paralelo`, cron diario; no hace falta cron nuevo).
2. **C21 BOB sin TC → tasa nueva (USD real)** ✅ [lo recomendado].
3. **Tag nuevo `oficial_viejo`** ✅ (solo 6.96/7 explícito).
4. **Default pasa a oficial nuevo** ✅ (paralelo/oficial/no_especificado colapsan a directo).
   - Pendiente: ¿el valor del oficial nuevo se fija o queda 100% dinámico Binance? · el descuento de `oficial_viejo`
     es la interpretación fiduciaria ("al oficial" = acepta Bs baratos) — confirmar antes del switch.

## PRINCIPIO DE ARQUITECTURA — normalización = FRONTERA de acceso (portable)
La regla "nunca leas `precio_usd` directo, siempre `precio_normalizado()`" NO debe ser una convención
de CLAUDE.md (repo-específica, recordable, violable). Debe ser una **frontera de acceso** encodada en el sistema:

```
DATOS (interna)      →  crudo + moneda_original + tag   (verdad en bruto; NADIE la lee directo)
NORMALIZACIÓN        →  UNA función (crudo, moneda, tag) → precio comparable; keyed en el tag; 1 sola vez
ACCESO (vistas/RPC)  →  ÚNICO camino de lectura; SIEMPRE normaliza; NUNCA expone el crudo
CONSUMIDORES         →  frontend / comando / otro repo → reciben SIEMPRE el normalizado (no pueden leer mal lo que no se expone)
```
- **Discovery** produce `crudo + tag` (no normaliza). **Comando/pipeline** escribe `crudo + tag` (no normaliza).
  **Frontend** solo muestra lo que el acceso da (ya normalizado). La invariante vive en la **capa de acceso**.
- Hoy SICI lo tiene A MEDIAS: `buscar_unidades_simple` devuelve `precio_normalizado() AS precio_usd` → el feed ya
  recibe el normalizado. Gap: scripts/queries del backend aún pueden leer el crudo → por eso la regla en CLAUDE.md
  es para ellos. Para portabilidad plena: el crudo = interno por diseño, no regla de honor.
- **Para la Plataforma Híbrida Genérica**: este contrato (crudo+tag adentro, normalizado afuera, la función es el
  único traductor) es agnóstico de repo/tipo/operación/zona. Hornearlo ahí. Ver `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md`.

### C21-BOB — decisión final (crudo real, NO crudo-falso)
Guardar `precio_usd = BOB/tasa` = guardar una **normalización disfrazada de crudo** → riesgo de doble-normalización
(el dolor viejo del cron `recalcular-precios-diario`). Decisión: **guardar el BOB CRUDO** (`precio_usd`=monto BOB,
`moneda_original='BOB'`, tag `bob`) y que la normalización haga `crudo / tasa_paralelo` **en vivo, una vez**.
El TAG es lo que evita re-normalizar: la función mira el tag y convierte una sola vez; el crudo nunca está
pre-normalizado. Mata el freezing Y la doble-norm. (Reemplaza el fix "BOB/tasa en el fill", que era el approach A congelado.)

## Orden de ensamble
Pieza 1 (lector) **+** Pieza 2 (función) se prenden JUNTOS (atómico) · Pieza 3 (re-tag) acompaña ·
**probar todo en shadow** (`precio_normalizado_shadow`) antes de tocar prod · switch junto a prod.
NO bloquea seguir cargando shadow con el lector actual (crudo + tag conservador).
