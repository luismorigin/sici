# Worklist de revisión — barridos a shadow (revisar al FINAL, antes del cutover)

> Casos que NO bloquean el barrido pero merecen una pasada al final. Acumulativo por lote.
> No son observaciones del reader/spec v4 (ese convergió); son de datos estructurados / matching / audit.

## Lote 100 — 2026-07-11

### ✅ Área faltante (discovery, no reader) — RESUELTO 11-jul
- **570/571 (Stratto Up, 0.01), 1728 (121), 1730 (98.33), 1731 (87.60)** — el área estaba en el TEXTO;
  el discovery la pisó con basura. Recuperada del texto y actualizada en shadow ($/m² todas en banda
  $1.500–1.700). `area_total_m2 < 20` en shadow ahora = 0. Ya entran al feed.
- **Causa raíz (para el cutover):** el discovery Remax deja área basura (0.01/1.00) cuando el portal no la
  expone estructurada; `parseAreaTexto` no la rescató en estos casos. Al cutover, reforzar el fallback de área
  del texto en el extractor (`detalle-deptos.mjs`).

### ✅ Área/tipo incoherente — RESUELTO 11-jul
- **3660 (Condominio Hamburgo)** — el texto dice explícito "65,44M²"; el `area=130` del discovery era del
  lote/otra cosa. Corregido a 65.44 en shadow ($/m² $405→$804; zona 4to anillo noroeste, más barata = coherente).
  El slug decía "terreno" pero el reader acertó (texto manda). Sigue sin PM (ver abajo).

### Matching pendiente (al audit / cutover — NO se toca prod en fase shadow)
- **3660** — PM_NUEVO "Condominio Hamburgo" (no está en catálogo). Crear PM al cutover.
- **595** — PM_NUEVO "Bloque La Salle" (dúplex 4 suites, 243m², $315k). El candidato pm88 "Equipetrol Norte -
  Calle H" es falso positivo del fuzzy (bien rechazado). Crear PM al cutover.
- **1674** — "Sky Collection Plaza Italia": fuzzy débil (mejor candidato "Sky Plaza Italia" 0.481) → sin auto-match.
- **8 sin-nombre legítimos**: 1728, 1724, 1718, 1688, 1294, 1267, 1256, 1222 (el aviso no da nombre de edificio).

### $/m² bajos (verificados OK, no acción salvo 3660)
- 1733 Santorini Suites ($814/m²) y 1754 Santorini Ventura ($825/m², previo) — `oficial_viejo` descuenta
  legítimamente, precio real bajo. Sanos.

### Alias sugeridos — CLASIFICADOS 11-jul (85 únicos de los 3 lotes)
- **50 redundantes** (ya en `alias_conocidos`) → no hacer nada.
- **24 nuevos SEGUROS** en 16 pms → SQL listo en `output/alias-nuevos-11jul.sql` (agrega sin duplicar,
  no toca precio/feed, reversible). Aplicar en Supabase cuando se quiera (no requiere esperar al cutover;
  solo mejora matching). Ej: Stone 3←"Stone III", Fragata←"Torre Fragata", Itaju←"Edificio Itajú".
- **10 sin pm** (multiproyecto Spazios/Itaju + 3660/595) → no aplican.
- **1 PELIGROSO — RECHAZADO:** id 1244 sugería "Domus Luxury" para pm18 (Domus Infinity), pero "Domus Luxury"
  ya es pm73 (otro edificio). NO aplicar. + revisar si 1244 (slug domus-luxury / texto Domus Infinity) está
  bien en pm18 o era pm73.

### PM nuevos a crear (cutover) — escritura a prod, NO en fase shadow
- **Condominio Hamburgo** (3660) — GPS del anuncio -17.76697/-63.19290. Dirección: "media cuadra del 4to
  anillo, entre Av. Roca y Coronado". Ya en el feed con nombre.
- **Bloque La Salle** (595) — GPS del anuncio -17.76745/-63.19100. Dirección: "entre Av. Ovidio Barberi y
  Av. La Salle, 2do-3er anillo". "Torre La Salle" (pm264) está a 347m + nombre distinto → otro edificio. Ya en feed.
- **NO requieren Google Maps.** El GPS sale del propio anuncio (ya poblado); ambos YA aparecen en el feed
  shadow con nombre_edificio. Falta solo el pm (para agrupar + matchear futuras). Matching es name-first →
  GPS aproximado del anuncio alcanza; verificación visual del founder al crear (patrón Domus Onix pm523,
  `gps_verificado_visual`). Sin bloqueo.

### Conflictos PRE-EXISTENTES del catálogo (no del híbrido, anotar para limpieza)
- pm35 "Edificio Uptown Equipetrol" tiene alias "Uptown NUU" = nombre oficial de pm54 → colisión.
- pm221 "SANTORINI VENTURA" tiene aliases "Santorini Suites"/"Condominio Santorini Suites" que son de pm516
  (Santorini Suites) → aliases cruzados entre 2 edificios.
- pm73 "Domus Luxury" (Eq Centro) y pm356 "DOMUS LUXURY" (4to anillo) — nombre idéntico, edificios distintos.

## ✅ Bug de flujo del cargador — RESUELTO 11-jul
- **Los multiproyecto REAPARECÍAN en cada `--prep`.** `traerLote()` excluía por `propiedades_v2_shadow` +
  `rechazados.json`, pero los multiproyecto van a `proyectos_detectados` (NO a ninguno de esos dos) → el
  siguiente prep los volvía a traer. **Fix aplicado** (`cargar-deptos-shadow.mjs`): `traerLote()` ahora
  también excluye los `url` ya en `proyectos_detectados` (macrozona equipetrol). Verificado: `--prep 30`
  post-cierre devuelve 0 (antes traía los 8 fantasma).
- **Discrepancia inter-lector sobre 1289 (Itaju):** lote A → multiproyecto (varias tipologías 212/242/329 +
  "desde 359.000"); lote B → unidad. El correcto es **multiproyecto** (es aviso-proyecto). Ya quedó en
  `proyectos_detectados` por el lote A; en el lote B se excluye (no re-aplicar como unidad).
