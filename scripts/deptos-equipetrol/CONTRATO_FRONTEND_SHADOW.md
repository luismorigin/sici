# Contrato de LECTURA (RPC → frontend) — feeds SHADOW del híbrido

> **Qué es:** lo que las RPCs shadow **devuelven** al frontend, campo por campo, con las reglas de
> render. Es el complemento de `CONTRATO_FEED.md` (que es el contrato de ESCRITURA loader→DB).
> Fuente para el equipo de frontend que consume `/ventas?shadow=1` y `/alquileres?shadow=1`.
>
> **Última act:** 14-jul-2026 (migs 274-280). Todo en SHADOW, prod intacto.

## Las 2 RPCs

| Feed | RPC | Tabla | Normalización |
|---|---|---|---|
| `/ventas?shadow=1` | `buscar_unidades_simple_shadow(jsonb)` | `propiedades_v2_shadow` | `precio_normalizado_shadow` (TC nuevo) |
| `/alquileres?shadow=1` | `buscar_unidades_alquiler_shadow(jsonb)` | `propiedades_v2_shadow` | `precio_normalizado_alquiler` (Bs-first) |

Se llaman con un `jsonb` de filtros (`{zonas_permitidas, dormitorios_lista, precio_min/max, limite, offset, ...}`).
GRANTs solo `service_role`+`claude_readonly` → invisibles al Data API público (dark launch).

## 🥇 Reglas de oro (para TODO el frontend)

1. **El precio ya viene NORMALIZADO** (`precio_usd` en venta, `precio_mensual_usd`/`precio_mensual_bob` en alquiler).
   El front lo muestra DIRECTO. **NUNCA recalcular** desde otro campo.
2. **`tipo_cambio_detectado` es METADATA cruda**, no el precio de display. Sirve para badges (ej. `tc_sospechoso`),
   NO para calcular. (Ver `oficial_viejo`/`bob`/`no_especificado` en `TIPO_CAMBIO_SICI.md` — el feed ya los resolvió.)
3. **`null` = "no sabemos"**, NO "no". Aplica a `amoblado`, `acepta_mascotas`, `expensas_incluidas`. No asumir "no".
4. **Canónicos = chips filtrables** (vocabulario fijo, hardcodeás iconos). **Colas = línea "También: …"** (no filtrable).

## Campos — ALQUILER (`buscar_unidades_alquiler_shadow`)

| Campo | Tipo | Uso en el front |
|---|---|---|
| `precio_mensual_bob` | numeric | Bs efectivo (display principal) |
| `precio_mensual_usd` | numeric | USD normalizado (comparable) |
| `amoblado` | text | `'si'`/`'no'`/`'semi'`/**`null`** (null=no sé) |
| `acepta_mascotas` | boolean | true/false/**null** (preferencia del DUEÑO de la unidad) |
| `equipado` | boolean | true/**null** — flag electrodomésticos (chip) |
| `expensas_incluidas` | boolean | true/**null** — "incluye expensas" |
| `monto_expensas_bob` | numeric | monto si lo da (raro) |
| `deposito_meses` / `contrato_minimo_meses` | numeric/int | condiciones de arriendo |
| `uso_inmueble` | text | `'residencial'`/`'mixto'` — filtro, NO exclusión |
| `amenities_lista` | text[] | amenidades EDIFICIO **canónicas** (chips) — ya SIN "Pet Friendly" |
| `equipamiento_lista` | text[] | equipamiento UNIDAD **canónico** (chips) |
| `amenities_extra` | text[] | cola edificio → "También: …" |
| `equipamiento_otros` | text[] | cola unidad → "También: …" |
| `pet_friendly` | boolean | **chip del EDIFICIO** (derivado, ver abajo) |
| + | | dormitorios, banos, area_m2, piso, fotos_urls, agente_*, id_proyecto_master, dias_en_mercado, descripcion, servicios_incluidos, estacionamientos, baulera |

## Campos — VENTA (`buscar_unidades_simple_shadow`)

| Campo | Tipo | Uso en el front |
|---|---|---|
| `precio_usd` | numeric | USD normalizado (display) |
| `precio_m2` | numeric | $/m² normalizado |
| `equipado` | boolean | true/**null** — chip electrodomésticos |
| `uso_inmueble` | text | null hoy en deptos (útil al escalar a casas/mixto) |
| `amenities_lista` | jsonb | amenidades EDIFICIO (array jsonb) — ya SIN "Pet Friendly" |
| `amenities_confirmados` | text[] | = amenidades confirmadas (chips) — ya SIN "Pet Friendly" |
| `amenities_por_verificar` | text[] | ⚠️ **LEGACY/vacío en el híbrido** — ignorar |
| `equipamiento_detectado` | text[] | equipamiento UNIDAD **canónico** (chips) |
| `equipamiento_otros` | text[] | cola unidad → "También: …" |
| `pet_friendly` | boolean | **chip del EDIFICIO** (derivado) |
| `tc_sospechoso` | boolean | badge (precio dudoso vs mediana) |
| + | | dormitorios, banos, area_m2, piso, fotos_urls, agente_*, estado_construccion, fecha_entrega, plan_pagos_*, parqueo/baulera, etc. |

## El chip `pet_friendly` (venta + alquiler)

- Es una **política del EDIFICIO** (no de la unidad): "¿este edificio admite mascotas?".
- **Derivado** (mig 278 + refresco en el cron): `true` si CUALQUIER unidad del edificio (venta o alquiler) da señal
  positiva (`acepta_mascotas=true` o mencionó "Pet Friendly"). Solo positivos.
- Vive en `proyectos_master.pet_friendly`; las RPCs lo exponen como `pet_friendly`.
- **"Pet Friendly" SALE de las amenidades** (ya no está en `amenities_lista`/`confirmados`) → se muestra como
  **chip dedicado**, no como una amenidad más. El front NO tiene que filtrarlo (la RPC ya lo saca).
- Distinto de `acepta_mascotas` (solo alquiler) = la preferencia del DUEÑO de esa unidad.

## Diferencias venta vs alquiler (no son gemelas)

- **Solo alquiler:** `acepta_mascotas`, `expensas_incluidas`, `deposito_meses`, `contrato_minimo_meses` (condiciones de arriendo, N/A en compra).
- **Amenidades:** alquiler usa `amenities_lista`(text[]) + `amenities_extra`; venta usa `amenities_lista`(jsonb) +
  `amenities_confirmados`(text[]) + `amenities_por_verificar`(legacy, ignorar). Distinto esquema → mapper distinto.
- **Precio:** venta = `precio_usd` (USD); alquiler = `precio_mensual_bob` (Bs) display + `precio_mensual_usd` comparable.

## Migraciones que respaldan este contrato

| Mig | Qué |
|---|---|
| 274/275 | base alquiler shadow (TC + RPC feed) |
| 276 | RPC alquiler + equipado/uso_inmueble/expensas_incluidas/amenities_extra/equipamiento_otros |
| 277 | RPC venta + equipado/uso_inmueble/equipamiento_otros |
| 278 | `proyectos_master.pet_friendly` (columna + derivación) |
| 279/280 | las 2 RPCs exponen `pet_friendly` + sacan "Pet Friendly" de amenidades |

## ⚠️ `buscar_extras_shadow` (mig 271) — NO dropear en VENTA (verificado 17-jul)
El feed shadow de venta (`ventas-shadow.ts`) llama aparte a `buscar_extras_shadow` para mergear
`amenidades_extra, equipamiento_otros, amoblado, equipado`. **De esos, a la RPC principal de VENTA
(`buscar_unidades_simple_shadow`, mig 277) SOLO migraron `equipado` + `equipamiento_otros` (+uso_inmueble).
`amoblado` y `amenidades_extra` NO están en el RETURNS de venta** — se verificó llamando la RPC real, y
`ventas-shadow.ts` los consume del helper (líneas ~96/98/160/162). **Dropear el helper = el feed de venta
pierde `amoblado` y `amenidades_extra`.** → En VENTA el helper NO es redundante, NO dropear.
> Ojo con la confusión: la mig **276 (ALQUILER)** SÍ trae `amenities_extra` en su RPC → para el feed de
> alquiler el helper puede que sí sobre, pero **venta ≠ alquiler** (mig 277 es más acotada). Verificar por
> operación antes de tocar. (Ver la tabla de migraciones arriba: 277 = venta = equipado/uso/equipamiento_otros.)

## Baños — regla ≤1 dorm (venta + alquiler, alineados desde mig c78aaad)
`banos`: **≤1 dorm (mono o 1 dorm) → 1** (definicional); **2+ dorm sin info → `null`** (no "1" — sería
engañoso). El front puede confiar: un `null` en baños solo aparece en 2+ dorm sin dato.

## También en la base (NO expuesto por la RPC hoy — pedir si se necesita)
- `datos_json.senales_portal` = crudo del portal (checkbox mascotas, etc.) — provenance para auditoría, no display.
- `amoblado_confianza`, y otros flags de `datos_json` — se agregan a la RPC si el front los pide.
