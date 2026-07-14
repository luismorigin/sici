# Contrato del feed `/ventas` para DEPTOS — qué debe escribir el híbrido

> 🔗 **Contrato de LECTURA (RPC → frontend):** ver `CONTRATO_FRONTEND_SHADOW.md` — qué DEVUELVEN las RPCs
> shadow al front (campos nuevos, chip pet_friendly, null semantics, canónicos vs colas). Este doc es el de ESCRITURA.

> Fuente de verdad: `sql/functions/query_layer/buscar_unidades_simple.sql` (la RPC que sirve
> `/ventas` vía `pages/api/ventas.ts`). Este doc mapea, campo por campo, lo que la RPC LEE →
> lo que el híbrido debe PRODUCIR para que un depto salga idéntico a como lo carga n8n, sin
> tocar SQL ni frontend. Investigado 2-jul-2026 (migración deptos Equipetrol al híbrido).

## Reglas de oro

1. **Matching OBLIGATORIO.** `JOIN proyectos_master` es INNER → un depto **sin `id_proyecto_master` NO aparece** en el feed (a diferencia de casas, que tienen vista propia).
2. **El precio vive en COLUMNAS, no en `datos_json`.** El feed recalcula `precio_m2` y `tc_sospechoso` EN VIVO desde `precio_usd` + `tipo_cambio_detectado` + `area_total_m2`. El `precio_m2` guardado en `datos_json` se IGNORA.
3. **`datos_json` ≠ `datos_json_enrichment`.** El feed lee la columna consolidada **`datos_json`**. El extractor+lector arman `datos_json` en esta forma (decisión: escribir directo, no depender del merge de n8n).

## A) COLUMNAS de `propiedades_v2` que lee el feed

| Columna | Origen en el híbrido | Notas |
|---|---|---|
| `precio_usd` | **LECTOR** (texto) | billete si `paralelo`; USD directo si `oficial`/`no_especificado`. NUNCA normalizar al guardar |
| `tipo_cambio_detectado` | **LECTOR** (TEXTO primero, ratio de respaldo) | `paralelo`/`oficial`/`no_especificado`. **Precedencia**: (1) texto "paralelo"→paralelo; (2) "TC 7"/"oficial"/"a Bs 7"→oficial; (3) texto calla→ratio BOB/USD vs paralelo VIVO de Binance (`config_global`, hoy 9.97): ≈paralelo→paralelo, ≈6.96→`no_especificado` (NO forzar). Remax `exchange_rate_amount` = tasa GLOBAL del portal (no por-anuncio) → NO marcar paralelo solo por eso. Ver `lib/tc.mjs`. ⚠️ **RÉGIMEN NUEVO (híbrido, act. 10-jul)**: tags `bob` (C21 crudo en Bs → normaliza ÷paralelo vivo), `oficial_viejo` (texto ancla EXPLÍCITO a 6.96/"Bs 7" → descuenta) y **default** (paralelo/oficial/no_especificado → USD directo). El fallback C21-sin-precio-en-texto elige USD-directo vs `bob` por **$/m² coherente**. Detalle: `READER_SPEC.md` + `TC_NUEVO_DECISION.md`. El "paquete TC" (normalización con estos tags en SQL+vistas+estudios+snapshots) va JUNTO a prod al unificarse el oficial. |
| `area_total_m2` | DISCOVERY (search API) → **fallback texto** | C21 `m2C` / Remax `construction_area_m` (hoy 265/265 Remax la traen). **Si faltara: `parseAreaTexto()` de la descripción** (`lib/detalle-deptos.mjs`, `area_texto`) — tolerante a formatos BO `mts2`/`mts.`/`metros cuadrados`. NO está en slug ni título (verificado). |
| `dormitorios` | extractor + **LECTOR** corrige | **`0` = monoambiente = CORRECTO** (el frontend lo muestra "Monoambiente": `propiedad-constants.ts:52`, `usePropertyEditor.ts:168`, `VentaMap`/`CompareSheet` "Mono"). El extractor conserva 0 (`numOrZero`). El LECTOR sube 0→N **solo** si el texto dice "N dormitorios" y NO es monoambiente (ej. Sky Eclipse `recamaras=0` pero "2 DORMITORIOS"). |
| `banos` | extractor | |
| `piso` | **extractor estructurado** (C21 `pisoEnQueSeEncuentra`) / lector (Remax, del texto) | COLUMNA, no datos_json |
| `estacionamientos` | extractor / lector | COLUMNA |
| `baulera` | lector | COLUMNA (boolean) |
| `solo_tc_paralelo` | LECTOR (plan de pagos) | COLUMNA |
| `estado_construccion` | LECTOR | preventa/entrega_inmediata/… |
| `id_proyecto_master` | **MATCHING SQL + LECTOR confirma** | `matching_completo_automatizado()` propone; aplicar estilo mig 259 (UPDATE directo, NO pisar `nombre_edificio`, NO usar `aplicar_matches_aprobados` = bug K1). **El LECTOR confirma al ingerir** (nombre-primario: lee el nombre real del anuncio; GPS SOLO desempata, nunca criterio único — robusto a GPS mal puesto por el broker). Feedback: alias nuevos → `alias_conocidos`; edificio no catalogado → PM_NUEVO. Ver "Matching" abajo. |
| `latitud`,`longitud` | DISCOVERY | trigger asigna zona/microzona |
| `microzona` | trigger (desde GPS) | |
| `fecha_publicacion` | Remax=extractor `date_of_listing`; C21=DISCOVERY `fecha_alta` (NO está en el detalle) | Fecha REAL del anuncio (días-en-mercado). **Protegida con LEAST** en el cargador: la más antigua gana, nunca se pisa adelante (anti re-scrape + anti-bump). NUNCA usar `fecha_discovery`/`fecha_scraping` (se pisan con NOW). |
| `score_calidad_dato`, `es_multiproyecto`, `url`, `fuente` | pipeline / LECTOR | |

## B) `datos_json` (columna consolidada) — lo que arma el híbrido

```jsonc
{
  "agente":   { "nombre": "...", "telefono": "+591...", "oficina_nombre": "..." },   // CONTACTO (línea 88-90)
  "contenido": {
    "fotos_urls":  ["https://cdn…", …],   // fuente PRIMARIA de fotos del feed
    "descripcion": "…",                    // fallback 3º (tras enrichment/discovery)
    // estacionamientos/baulera acá SOLO los usa buscar_unidades_reales (no el feed vivo)
  },
  "amenities": {
    "lista":              ["Piscina", "Gimnasio", …],  // chips — SOLO diferenciadores canónicos (esEstandar:false)
    "estado_amenities":   { "Piscina": { "valor": true, "fuente": "lector|structured", "confianza": "alta" }, … },
    "extra":              ["Rooftop", "Cine", …],       // amenidades de edificio CONFIRMADAS no-canónicas (no se pierden)
    "equipamiento":       ["Cocina equipada", "Heladera", …],   // canónico de UNIDAD (FILTRABLE) → RPC `equipamiento_detectado`
    "equipamiento_otros": ["Doble vidrio", "Espejos", …]        // cola larga de UNIDAD (mostrar, no filtrar)
  },
  "plan_pagos": { "cuotas": [...], "texto": "…" },     // LECTOR
  "fecha_entrega": "…",                                 // LECTOR (preventa)
  "amoblado": null, "equipado": null,                   // FLAGS de decisión (LECTOR): muebles / electrodomésticos (distintos)
  // flags escalares (LECTOR, del texto):
  "plan_pagos_desarrollador": false, "acepta_permuta": false, "precio_negociable": false,
  "descuento_contado_pct": null,
  "parqueo_incluido": false, "parqueo_precio_adicional": null,   // 🔴 APARTE ⟺ incluido=false + estac=0 (regla dura, no coexisten)
  "baulera_incluido": false,  "baulera_precio_adicional": null   // ídem baulera
}

> **Extras vía helper (mig 271):** `amenidades_extra`, `equipamiento_otros`, `amoblado`, `equipado` los expone
> `buscar_extras_shadow` y el `/api/ventas-shadow` los mergea. **Pendiente para prod: portar ese merge al
> `/api/ventas`** para que el front nuevo los reciba (hoy solo el shadow). Los demás campos salen directo de la RPC.
```

### Vocabulario canónico de amenidades (SOLO diferenciadores — act. 10-jul-2026)
`amenidades` = SOLO **diferenciadores** del edificio (`esEstandar:false` de `amenidades-mercado.ts`):
`Piscina, Gimnasio, Sauna/Jacuzzi, Churrasquera, Co-working, Salón de Eventos, Pet Friendly, Parque Infantil,
Jardín, Estacionamiento para Visitas`. **Las `esEstandar` (Seguridad 24/7, Ascensor, Recepción, Área Social,
Terraza, Lavandería, Cámaras) NO van a `amenidades`** — casi todo edificio las tiene, no diferencian. Si el texto
las nombra explícito → `extra`.

⚠️ **El CANON del cargador se limpió (10-jul, commit 72cd780):** se sacaron las `esEstandar` porque el fallback
estructurado (checkbox C21) las volcaba a `amenidades` inventando amenidades falsas (auditoría 2674/3343).

**Relleno:** estructurado primero (C21 `caracteristicasJSON.campos[valor=true]` / Remax `features[].name`); el
lector completa del texto. NUNCA inferir/promover `esEstandar`, ni derivar amenidades del NOMBRE del edificio.

## C) Fallbacks (el feed cae a estos si falta lo de arriba)
- Fotos: `datos_json_discovery.default_imagen.url` (Remax) / `datos_json_discovery.fotos.propiedadThumbnail` (C21).
- Descripción: cascade `datos_json_enrichment.descripcion` → `datos_json_discovery.descripcion` → `datos_json.contenido.descripcion`.

## D) DERIVADO en vivo (NO se guarda — no lo escribas)
- `precio_m2` = `precio_normalizado(precio_usd, tc) / area_total_m2`.
- `tc_sospechoso` = `tc='no_especificado' AND precio_m2 < mediana_grupo × 0.70` (grupo = zona×dorms×estado; mediana solo de TC confiable, mín 3). Red de seguridad para paralelo no detectado.
- `dias_en_mercado` = `hoy − fecha_publicacion`.

## Matching de edificios (deptos)
- **Motor = SQL reusable** (no JS de n8n): `matching_completo_automatizado()` genera candidatos (nombre→URL→trigram→fuzzy→GPS), auto-aprueba ≥85, cola 70-84. **NO reescribir nada.**
- **NO usar `aplicar_matches_aprobados()`** (bug loop K1: pisa `nombre_edificio`, se re-confirma solo). Aplicar con UPDATE directo estilo **mig 259** (`WHERE id_proyecto_master IS NULL`, sin tocar `nombre_edificio`).
- **JUNTOS al ingerir (nuevas):** el LECTOR, en la misma lectura del anuncio, confirma/corrige el match → nombre-primario, GPS solo desempata. Previene el match malo en el origen (importa el doble por el INNER JOIN: match malo = edificio equivocado; sin match = no aparece).
- **SEPARADO recurrente (base):** re-matching retroactivo cuando el catálogo crece + drift → `/audit-cola-matching` (ya existe, agente-lector). Distinto scope: nuevas vs base.
- **Círculo virtuoso:** el lector alimenta el catálogo (alias + PM_NUEVO) → el mecánico mejora solo → menos intervención con el tiempo.

## Estado y decisiones (2-jul-2026)
- **MOAT = yo (agente-lector en la sesión), NO API.** El comando prepara el material ($0 fetch); yo leo precio/TC/dorms/edificio.
- **Cron nocturno = BACKLOG** (el sandbox en la nube no llega a los portales). Por ahora **comando on-demand** que se corre en sesión.
- **CARRIL PARALELO, cero escritura a producción:** los deptos YA están en `propiedades_v2` (los carga n8n) → escribir ahí choca/duplica. El híbrido escribe a **archivos locales** (`carril-paralelo.mjs` → `output/`) y se **compara** vs n8n (solo SELECT). El corte (híbrido escribe / n8n se apaga) es MUCHO más adelante, con ok del founder tras varios lotes.

## Verificación (carril paralelo → entorno shadow)
`carril-paralelo.mjs` corre el híbrido sobre deptos que n8n ya cargó, arma este contrato, y compara
campo por campo vs n8n → archivo local + tabla. Validado (2-jul): iguala donde n8n acierta, corrige
donde falla (precio corrupto, match recuperado, anticrético mal clasificado).

**Evolución (mig 268):** además del carril de archivos, hay un **entorno SHADOW aislado**
(`propiedades_v2_shadow` + `config_global_shadow` + `precio_normalizado_shadow()`) para correr el
flujo COMPLETO (write real + matching + render del feed shadow) sin tocar producción. Ver
`ESTADO_MIGRACION.md`. Cuando el shadow dé confianza en varios lotes —mismas columnas/conteos,
**mismo `precio_m2` y `tc_sospechoso`** o mejores— recién se decide el corte de n8n.
