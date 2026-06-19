# Diseño — Pipeline de Casas (vivienda final) en Zona Norte

> Status: DISEÑO (no implementado) · Fecha: 2026-06-18 · Autor: Lucho + Claude
> Basado en la sonda `scripts/sonda-suelo/` (ver memoria `project_sonda_suelo_zn_urubo_jun2026`)
> y en el estudio del sistema TC (`docs/arquitectura/TIPO_CAMBIO_SICI.md`) y de matching/amenidades.

## 1. Contexto y objetivo

El pipeline de deptos (discovery → enrichment regex → enrichment LLM → merge → **matching edificio**
→ HITL → aplicar → verificar → feed) nació de una idea y se fue parchando. Para **casas como
vivienda final** gran parte de esa complejidad sobra, y la sonda de jun-2026 mostró el camino para
un flujo más corto y más correcto. Objetivo: **feed de vivienda en Zona Norte** con los filtros que
ningún portal ofrece (barrio cerrado, piscina, quincho…), precio normalizado bien, sin dañar el
pipeline de deptos (strangler).

Volumen validado por la sonda: **ZN 264 casas únicas** (Urubó 44), tipología familiar (mediana 3
dorms, $/m² constr ~$954), **fotos abundantes** (95-100% con ≥5). Atributos de valor que viven en
el texto: condominio 25-75%, jardín 70-75%, quincho 30-75%, piscina 20-50%.

## 2. Principio rector

Una casa **no pertenece a un edificio** → se elimina el matching fuzzy de `proyectos_master` (la
capa más cara y bugueada del legacy). Pero **una casa en condominio cerrado SÍ pertenece a un área
con nombre, GPS y amenidades comunes** → se reintroduce un matching **areal** (point-in-polígono),
mecánica distinta a la de edificios.

## 3. Flujo (≈5 pasos propios vs ~9 del legacy)

> Nota: el Paso 4 SÍ es un matching (areal, a condominios). Se elimina el matching **fuzzy de
> edificios** del legacy, no el matching en general. (Versión previa de este doc decía "4 pasos /
> sin matching" — corregido tras reincorporar condominios.)

```
0. Geocerca: polígonos de zona (zonas_geograficas, ZN ya está)
   + catálogo CURADO de condominios_master (polígono + amenidades comunes)
1. Descubrir   → traer todo SC + filtrar por polígono GPS + dedup cross-portal (ADR-004)
2. Detallar+LLM → detalle estructurado (dorms/baños/garage/área/fotos) SIN regex
                  + 1 pase LLM sobre la descripción que devuelve:
                    amenidades casa, estado, niveles, es_condominio_cerrado,
                    PRECIO billete + tipo_cambio_detectado (+confianza)
3. Consolidar  → MERGE LIGERO: contrastar metadata (discovery) ↔ descripción (LLM) por campo
   (merge)       · físicos (dorms/área/GPS): gana metadata · precio/TC: gana descripción
                 · amenidades/condominio/estado: solo texto · candados: gana manual
                 → precio_usd=billete + precio_normalizado() [TC Binance] + AUDITORÍA coherencia
4. Vincular    → ¿casa ∈ polígono de un condominio? → match + heredar amenidades comunes
                  (NULL = casa individual, estado final válido). NO matching de edificio.
5. Verificar   → verificador_venta HTTP existente (ya procesa casas)
6. Feed        → /ventas/casas: filtros MOAT (cerrado, piscina, dorms, $/m² normalizado)
```

## 4. TC — reusar el aparato de deptos, arreglar el origen

**Contrato (igual que deptos):** `precio_usd` = USD **billete** (lo que pide el vendedor en dólares
físicos); `tipo_cambio_detectado` ∈ {paralelo, oficial, no_especificado}; `precio_normalizado()`
convierte en query time con el TC paralelo dinámico (Binance → `config_global`). NO se reinventa nada.

**Mejora sobre deptos (elimina el bug histórico de Remax):** la metadata de moneda del portal NO
es confiable; la verdad está en la descripción. Como el pase LLM del Paso 2 ya lee la descripción,
que **extraiga ahí mismo** `{precio_billete_usd, tipo_cambio_detectado, confianza}`. El precio del
portal es solo un *candidato* que el LLM confirma/corrige. (El bug de Remax nace de confiar en
`currency_id` y hacer `BOB/6.96` a ciegas, separado del TC.)

**Auditoría como parte del diseño (no parche):** el TC es ambiguo por naturaleza y ningún extractor
lo caza al 100% → red de coherencia:
- gate en pipeline: `tc_sospechoso` si `$/m²` se sale del rango de su cohorte por factor >3×,
  o si `precio_usd ≈ BOB/6.96` cuando el texto dice USD (patrón del bug Remax).
- extender la audit semanal de ventas a casas (mismos checks de doble-normalización).

## 4b. Merge ligero — contraste metadata ↔ descripción

SÍ hay merge, pero **no la etapa pesada de deptos** (`merge_discovery_enrichment`, 3 fuentes,
TC paralelo, ~800 líneas). Acá son **2 fuentes** (metadata estructurada del discovery/detalle +
LLM sobre la descripción) y el LLM ya viene limpio (billete+TC en una pasada). Resolución por campo:

| Campo | Gana | Razón |
|---|---|---|
| Físicos: dorms, baños, área, GPS, fotos | **Metadata** | el portal los estructura bien |
| **Precio / TC** | **Descripción (LLM)** | la moneda de la metadata miente (47% C21) |
| Amenidades, condominio, estado, niveles | **Solo descripción** | no existen en metadata |
| Campo con candado (`campos_bloqueados`) | **Manual** | regla 1 SICI |

**El contraste ES la red de TC:** si metadata y texto discrepan en precio (ej. metadata `160920 BOB`
vs texto `$us 160.000 tc 7` → gana texto = $160.000 USD), y la brecha es grande → `tc_sospechoso`.
Si el LLM no halla precio en el texto → fallback a metadata (Remax-USD confiable, C21-BOB sospechoso).

## 5. Matching de condominios — areal, no fuzzy de edificio

| | Edificio (deptos) | Condominio (casas) |
|---|---|---|
| Geometría | N unidades en el mismo punto | N casas dispersas en un área |
| Matcher | fuzzy nombre + GPS exacto | **point-in-polígono/radio + nombre** |
| Riesgo a evitar | bug loop (pisa `nombre_edificio`) | no pisar nombre de la casa |

`condominios_master` se clona de `proyectos_master` (reusa modelo de amenidades, candados, herencia,
`radio_metros`) pero el matcher es geográfico-areal — más parecido a la asignación de zona (que ya
funciona) que al matching fuzzy. **Arranque curado**: cargar a mano los condominios grandes de ZN
(polígono + amenidades), como se hizo con los `pm` de ZN. Nada de auto-match masivo por GPS.

**Fuentes del nombre (todas por `fetch`, sin Firecrawl) — prioridad por portal:**
- **C21**: `encabezado` (viene en el LISTADO, barato) → `entity.encabezado`/`title` (detalle) → descripción.
- **Remax**: `listing.title` (detalle, data-page) → descripción. El `slug` Remax es genérico
  (`venta-casa-...-norte-ID`): da **zona/tipo** (check redundante del GPS) pero **no el nombre**.
- El matcher combina point-in-polígono (GPS) + nombre desde estas fuentes; el slug confirma zona.

**⚠️ El matcher debe ser NOMBRE-primario, no GPS-primario (hallazgo 18-jun):** los condominios de
las familias **Sevilla** (8) y **Riviera del Remanso** (5) son **contiguos** — 27 pares a <500m,
varios a <250m (La Fontana Riviera 1↔2 a 71m). Con radio el matching solapa (una casa cae en varios).
Orden correcto: (1) matchear `nombre_condominio_mencionado` (LLM) contra `alias_conocidos` —
desambigua "Riviera 1" de "2"; (2) GPS confirma/desempata y cubre casas sin nombre; (3) polígonos
para los contiguos. El `radio_metros` NO alcanza solo para estas familias.

**Migración en 2 fases:** Fase 1 = `CREATE TABLE condominios_master` + INSERT de los 36 curados +
columna FK `id_condominio_master` en `propiedades_v2` (segura, no toca deptos). Fase 2 = función de
matching (nombre+GPS, con polígonos para contiguos). Catálogo curado: `scripts/sonda-suelo/catalogo-condominios-zn-FINAL.json`.

**Triple valor de `condominios_master`:**
1. Convierte el filtro "barrio cerrado" de keyword ruidoso (25-75%) a hecho (¿cayó en el polígono?).
2. Hereda amenidades comunes (piscina, seguridad 24h, club house) a todas las casas del condominio.
3. Da el **grupo de comparación de precio** para cazar TC sucio (lo que una casa suelta no tiene).

### Esquema propuesto `condominios_master`
```
id_condominio_master    serial PK
nombre_oficial          text
alias_conocidos         text[]
poligono                geometry(Polygon)   -- o centroide + radio_metros
zona / zona_general     text                -- reusa zonas_geograficas
amenidades_comunes      jsonb               -- ["Piscina","Seguridad 24h","Club house",...]
equipamiento_base       jsonb
gps_verificado          boolean
activo                  boolean
```

**Ubicación canónica (regla de GPS) — validado 18-jun:** para una casa EN condominio, la ubicación
que vale es la del **condominio** (centroide robusto/polígono), NO el GPS individual del anuncio. Los
brokers lo ponen inconsistente: a veces el punto del condominio (spread ~17m entre casas), a veces
disperso (~400m), a veces mal (Villa Fátima cayó en zona sur). El GPS de la casa es solo **insumo**
(matchear + derivar el polígono); una vez asignado el condominio, la casa **hereda su ubicación**
(igual que las amenidades). Para casa INDIVIDUAL, el GPS propio (verificado) sí es la ubicación.
→ Beneficio: se verifica el GPS **una vez por condominio (~30) + individuales**, no por cada casa (264).
El centroide de varias casas del mismo condominio fue confirmado por OSM (12/16 a ≤600m); donde OSM
discrepó eran **nombres genéricos** (homónimos), no GPS malo — el centroide ganó.

## 6. Casas individuales (sin condominio) — segmento de primera clase

`condominio_master_id = NULL` es estado **final válido** ("calle abierta"), NO cola de HITL.

- **Amenidades:** 100% del LLM de su propio anuncio (no heredan, no lo necesitan).
- **Filtro "cerrado = no":** atributo filtrable valioso (hay demanda de casa individual: más terreno,
  sin expensas, privacidad).
- **Cohorte de precio para auditar TC (jerarquía):** `condominio` → `microzona + dorms + banda área`
  → `zona + dorms`.
- **Evitar falso "calle abierta"** cruzando dos señales independientes:

  | Matchea polígono | LLM "cerrado" | Resultado |
  |---|---|---|
  | ✅ | ✅ | Cerrado confirmado + hereda amenidades |
  | ✅ | — | Cerrado por catálogo (alta confianza) |
  | ❌ | ✅ | **Condominio no catalogado → alimenta curación del catálogo** |
  | ❌ | — | Casa individual genuina (calle abierta) |

  El cuadrante "LLM cerrado + sin match" es un loop de mejora: dice qué falta cargar, sin frenar la publicación.
- **Segmentación dual:** casa individual = vivienda final **o** suelo demolible (conecta con el
  producto para desarrolladoras); casa en condominio = solo vivienda final (reglamento, no se demuele).

## 7. Contrato del pase LLM (Paso 2)

Entrada: descripción del anuncio + precio candidato del portal. Salida JSON forzada:
```json
{
  "precio_billete_usd": 175000,
  "tipo_cambio_detectado": "paralelo|oficial|no_especificado",
  "tc_confianza": "alta|media|baja",
  "es_condominio_cerrado": true,
  "nombre_condominio_mencionado": "Las Palmas" ,
  "estado": "nueva|usada|remodelada|para_demolicion",
  "niveles": 2,
  "amoblado": false,
  "amenidades": ["piscina","churrasquera","dependencia_servicio","jardin","garage"],
  "amenidades_condominio": ["cancha de tenis","parque infantil","club house"],
  "caracteristicas_extra": ["escritorio","aire acondicionado","paneles solares","vestidor"]
}
```
**Amenidades = TRES campos (no descartar info + no confundir casa con condominio):**
- `amenidades`: lista **canónica cerrada de la CASA** para filtros — solo
  `piscina, jardin, churrasquera (NO "quincho", es rioplatense), dependencia_servicio, garage`.
- `amenidades_condominio`: **abierta**, áreas COMUNES (cancha de tenis/fútbol/polifuncional, parque
  infantil, club house, gimnasio, seguridad 24h, áreas verdes…). **Idealmente viven en
  `condominio_master`** (curadas una vez, heredadas a todas las casas); el LLM las captura best-effort
  para alimentar el catálogo.
- `caracteristicas_extra`: **abierta**, todo lo demás de la casa (escritorio, galería, lavandería,
  vestidor, home office, A/C, fibra…).

El feed filtra por las canónicas; la ficha muestra las tres. Prompt vigente:
`scripts/llm-enrichment/prompt-casas-vivienda-v4.md`.

`es_condominio_cerrado` y `nombre_condominio_mencionado` alimentan el matching (Paso 4) y el cuadrante de la §6.

## 8. Publicación y feed

- A `propiedades_v2` con `tipo='casa'`, respetando `campos_bloqueados` (reusar helper de candados).
- **Vista nueva `v_mercado_casas`** (aislada de `v_mercado_venta` de deptos — blindaje del análisis
  de riesgo: las casas nunca contaminan el feed/métricas de departamentos).
- Feed `/ventas/casas` ZN: filtros **cerrado** (= tiene condominio), piscina, quincho, dorms, $/m²
  normalizado, microzona. Galería abundante (ojo costo imágenes Vercel → CDN directo, ya en backlog).

## 9. Reuso vs nuevo

- **Reuso:** `precio_normalizado()`, TC Binance/`config_global`, `depende_de_tc`, candados +
  `proteger_amenities`, `propagar`/JOIN de amenidades, verificador HTTP, `zonas_geograficas`,
  audit semanal (extendida a casas).
- **Nuevo:** `condominios_master` + matcher areal, parser de detalle, pase LLM unificado
  (amenidades + precio/TC), `v_mercado_casas`, cohorte de comparación para casas individuales.
- **Elimina del legacy:** enrichment regex, merge regex+LLM de deptos, matching **fuzzy de edificios**.

## 10. Scraping y forma de implementación

### 10.1 Scraping — qué hace Firecrawl hoy y por qué el rediseño puede evitarlo

**Ingeniería inversa del uso actual de Firecrawl (18-jun):** Firecrawl en el pipeline (extractor
`flujo_b_processing`, enrichment casas/terrenos, alquiler) extrae **una sola cosa: la descripción
en texto** (+ fotos/agente en alquiler). Todo lo estructurado (precio, dorms, baños, área, GPS,
fotos-metadata) ya viene del **discovery JSON del listado**, no de Firecrawl. El enrichment LLM de
venta NO usa Firecrawl (lee la descripción ya guardada en BD). → Firecrawl es un **transporte** para
bajar la descripción, no aporta dato único.

**Hallazgo de la sonda:** esa misma descripción se obtiene con `fetch` simple, sin Firecrawl:
- C21 detalle: `{url}?json=true` → `entity.descripcion` (completa, sin render JS).
- Remax detalle: el `data-page` (Inertia) viene **en el HTML crudo** → `fetch` + regex + `JSON.parse`.
- Listados (Paso 1) y BI son APIs JSON directas.

**La incógnita a validar antes de eliminar Firecrawl:** Firecrawl resuelve "renderizar JS"
(innecesario para estos endpoints) PERO podría estar cumpliendo otra función no testeada por la
sonda: **evasión de anti-bot a escala** (cientos de requests/noche; la sonda hizo decenas). Antes de
sacarlo, **correr la sonda 1-2 noches a volumen real con fetch directo y medir tasa de bloqueo/error**.
- Si pasa limpio → eliminar Firecrawl en casas **y oportunidad de eliminarlo en deptos** (ahorro).
- Si bloquean → Firecrawl se mantiene como transporte (proxies/IPs), no por el dato.

Riesgo adicional: APIs no documentadas → smoke test diario que alerte si cambia la estructura.

### 10.2 n8n vs código — separar orquestación de lógica
Los bugs recurrentes del legacy (`land_area_m` vs `land_m2`, `number_parking` sin leer,
`discovery_remax`→`century21`) son el mismo patrón: **lógica compleja dentro de nodos Code de n8n**
(sin tests, diffs ilegibles, copy-paste entre workflows). Este flujo es casi todo lógica de datos
(parsers, dedup, point-in-polígono, LLM, TC, auditoría) → justo lo que n8n hace mal.

**Decisión:**
- **Lógica** → script Node versionado en git (la sonda `scripts/sonda-suelo/` ya es ~70% de los
  Pasos 1-2). Tests, diffs revisables, debug local.
- **Orquestación** (disparar en horario + alertar) → n8n (1 nodo) o cron/pg_cron. Reusa la
  observabilidad y el Slack existentes.

No se reescribe deptos ni se abandona n8n (el TC Binance sigue ahí). Al ser greenfield, es la
oportunidad de no repetir el parche-sobre-parche. **Strangler:** nada toca Equipetrol ni deptos;
tabla compartida pero `tipo` + vistas aisladas. Costo de salir de n8n (perder UI nodo-a-nodo) se
cubre con logging + reporte que el script ya escribe + `try/catch`→Slack.

## 11. Riesgos / decisiones abiertas

- **✅ DECISIÓN DE MODELO: casas usa Sonnet (no Haiku) — validado 18-jun.** Prueba sobre 14 casas
  reales, mismo prompt v4:
  - **Haiku** fue inestable: en una corrida perdió **4 precios y 2 condominios cerrados** que el texto
    SÍ menciona (no determinista; prompt cargado le roba foco al precio).
  - **Sonnet** acertó **7/7** de lo que Haiku falló: todos los precios/TC del texto, los 3 condominios
    cerrados con nombre, sin perder nada. Estable.
  - **Por qué se puede:** el volumen de casas es bajo (~264 + pocas/noche) → Sonnet cuesta centavos.
    A diferencia de deptos (miles), acá el modelo bueno es asumible. Haiku queda descartado para casas.
  - Igual mantener: **auditoría de coherencia** + **fallback a metadata** (merge §4b) como red.
- **TC sucio** (47% C21): mitigado por extracción LLM en origen + auditoría de coherencia, pero
  requiere monitoreo (es el riesgo #1 del feed).
- **Falsos positivos LLM** en "cerrado"/amenidades: validar con muestra; el cruce de la §6 los acota.
- **Catálogo de condominios**: empezar curado y chico; el cuadrante "LLM cerrado + sin match" lo amplía.
- **Costo de imágenes** (Vercel): servir del CDN directo (backlog existente).
- ~~¿`condominios_master` tabla nueva o `proyectos_master` con `tipo_proyecto`?~~ **RESUELTO:
  tabla nueva (mig 260 aplicada), evita contaminar el matching de deptos.**

## 12. Estado y orden de construcción

**Fase 1 — ✅ HECHA (18-jun-2026):** catálogo de 36 condominios cargado en `condominios_master`
(mig 260, aislada). Sonda, diseño, modelo LLM (Sonnet) y prompt v4 validados.

**Fase 2 — orden de construcción (próxima/s sesión/es):**

| # | Paso | Riesgo | Nota |
|---|------|--------|------|
| 1 | **Matcher EN SECO** (offline: casas de la sonda × catálogo) | 🟢 nulo | Valida la pieza más incierta (solapamiento Sevilla/Riviera) sin tocar nada. **Empezar acá.** |
| 2 | **Discovery producción** (la sonda escribe casas ZN a `propiedades_v2` tipo=casa, dedup, zona) | 🟡 toca `propiedades_v2` | Primer eslabón con datos reales en BD |
| 3 | **Enrichment (Sonnet) + merge ligero** | 🟡 | Prompt v4 ya validado; falta correrlo en pipeline |
| 4 | **Matcher en producción + columna FK** `id_condominio_master` | 🟡 ALTER a `propiedades_v2` | Solo después de que el matcher en seco (paso 1) funcione |
| 5 | **Verificación + cron n8n** | 🟢 | Verificador HTTP ya existe; n8n solo dispara el script |
| 6 | **Feed** `v_mercado_casas` + `/ventas/casas` | 🟢 | Vista aislada de deptos |

Principio: cada paso valida antes de avanzar (como toda la sonda). El paso 1 es offline y de máximo
aprendizaje/mínimo riesgo — reusa `scripts/sonda-suelo/` y el catálogo, sin tocar producción.
