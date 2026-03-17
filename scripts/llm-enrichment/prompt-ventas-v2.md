# Prompt LLM Enrichment — Ventas v4.0

> Modelo: claude-haiku-4-5-20251001 o claude-sonnet-4-6 | temperature: 0 | max_tokens: 1500
> Evolución: v1.0 → v2.0 → v3.0 → v3.1 → v3.2 → v4.0 (2026-03-16)

---

## Prompt Template

```
Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

═══════════════════════════════════════
TÍTULO DEL ANUNCIO:
{titulo_anuncio}

UBICACIÓN:
{ubicacion_detalle}

DATOS PORTAL (metadata estructurada del portal — confiables):
- URL: {url}
- Fuente: {fuente}
- Precio: ${precio_usd} USD (moneda original: {moneda_original})
- Área: {area_total_m2} m²
- Dormitorios (portal): {dormitorios_portal}
- Baños (portal): {banos_portal}

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: {nombre_edificio_regex}
- Estado construcción: {estado_construccion_regex}
- Tipo cambio: {tipo_cambio_regex}
- Zona GPS: {zona}

PROYECTOS CONOCIDOS EN ZONA {zona}:
{lista_proyectos_zona}

DESCRIPCIÓN:
{contenido}
═══════════════════════════════════════

INSTRUCCIONES POR CAMPO:
═══════════════════════════════════════

PRIORIDAD: Si título/ubicación/descripción CONTRADICE un dato portal o extractor, usar la evidencia del texto. Si no hay contradicción, mantener el dato existente.

NOMBRE_EDIFICIO:
- Buscá el nombre del edificio/condominio/proyecto en título, ubicación y descripción
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- Si encontrás match (incluso parcial: "Edif Nomad" → "Nomad by Smart Studio"), usá el nombre oficial de la lista
- Si no hay match pero el texto tiene un nombre claro, devolvelo tal cual
- Si no hay nombre en el texto, devolvé null
- NUNCA devolver: "Venta", "Pre Venta", "Departamento", fragmentos de oraciones

DORMITORIOS:
- Buscar en título/descripción: "monoambiente", "studio", "loft" = 0 dormitorios
- "1 dormitorio", "1 dorm", "1 hab" = 1
- Si el portal dice 1 pero el texto dice "monoambiente" o "studio" → usar 0
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Rango válido: 0-6

BAÑOS:
- Buscar en título/descripción cantidad de baños
- "medio baño" o "toilette" cuenta como 0.5
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Rango válido: 0-6

ESTADO_CONSTRUCCION:
- Solo 2 valores válidos:
  - "preventa": "precios desde", "entrega [fecha futura]", "en construcción", "obra gruesa", "avance X%", fecha de entrega futura
  - "entrega_inmediata": "listo para vivir", "entrega inmediata", "listo para ocupar", "a estrenar", inmueble terminado
- Si no hay evidencia clara → null
- CUIDADO: "amoblado" o "equipado" SOLOS no implican entrega_inmediata

TIPO_CAMBIO_DETECTADO:
- "paralelo": "TC paralelo", "al paralelo", "dólares o paralelo", "solo dólares", "tc del día", "pago en dólares", "blue", "dólar blue", "al blue", "USDT", "cripto"
- "oficial": "TC 7", "al cambio Bs.7", "TC oficial", "tipo de cambio 7", precio listado SOLO en Bs/bolivianos sin mención de USD
- "no_especificado": si no hay mención de TC ni forma de pago. NUNCA devolver null — usar "no_especificado"
- CLAVE: "solo dólares", "pago en dólares", "blue", "dólar blue", "USDT", "cripto" = PARALELO
- CLAVE: "TC 7" o "cambio 6.96" = OFICIAL
- CLAVE: Precio en "Bs" o "bolivianos" sin mención de dólares = OFICIAL (tasa BCB fija)
- CLAVE: "$us X" sin más contexto = "no_especificado" (moneda sola no indica TC)

PARQUEO_INCLUIDO:
- true: "incluye parqueo", "con parqueo" sin precio aparte
- false: "Parqueo: $us X" (precio explícito) O no se menciona parqueo en absoluto
- null: SOLO si "parqueo" aparece en áreas comunes sin detalle de inclusión
- DEFAULT: false (si no hay info de parqueo)

BAULERA_INCLUIDA:
- true: "incluye baulera", "con baulera" sin precio aparte
- false: si no se menciona baulera, o precio explícito por baulera
- DEFAULT: false (si no hay info de baulera)

ES_MULTIPROYECTO:
- true: el anuncio NO tiene precio + área + dormitorios definidos en DATOS PORTAL simultáneamente, Y la descripción habla del proyecto en general sin identificar una unidad específica
- false: si DATOS PORTAL tiene precio, área Y dormitorios definidos → siempre false, aunque la descripción mencione otras tipologías del mismo proyecto
- DEFAULT: false
- CLAVE: "departamentos de 1 y 2 dormitorios" en descripción con metadata completa = false (es una unidad específica con texto genérico del proyecto)
- CLAVE: solo marcar true cuando faltan 2 o más de estos 3 datos en metadata: precio, área, dormitorios

PLAN_PAGOS:
- tiene_plan_pagos: true si cuotas/financiamiento, false si solo contado o no hay info. DEFAULT: false
- plan_pagos_texto: resumen breve de condiciones, null si no hay info
- descuento_contado_pct: porcentaje de descuento por pago contado, null si no se menciona
- acepta_permuta: true si menciona permuta/canje, false si no. DEFAULT: false
- precio_negociable: true si "negociable"/"escucha ofertas", false si no. DEFAULT: false
- solo_tc_paralelo: true si la descripción menciona dólares o TC paralelo como forma de pago, en cualquier combinación. DEFAULT: false
- true: "pago en dólares", "solo dólares", "TC paralelo", "dólares o paralelo", "dólares y/o paralelo", "$us X (dolares)", "(TC paralelo)"
- false: solo si acepta explícitamente bolivianos o TC oficial como alternativa. Ej: "dólares o bolivianos", "se acepta Bs", "al cambio oficial"
- CLAVE: cualquier mención de dólares/paralelo SIN mención de bolivianos/oficial = true
- CLAVE: si no hay info de forma de pago = false (default)

AMENITIES y EQUIPAMIENTO:
- Solo lo que el texto CONFIRME explícitamente
- NUNCA inferir Pet Friendly, Sauna, etc. sin mención explícita

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "dormitorios": number | null,
  "dormitorios_confianza": "alta" | "media" | "baja" | null,
  "banos": number | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | null,
  "estado_construccion_confianza": "alta" | "media" | "baja" | null,
  "fecha_entrega_estimada": string | null,
  "es_multiproyecto": boolean | null,
  "tipo_cambio_detectado": "paralelo" | "oficial" | "no_especificado",
  "tipo_cambio_confianza": "alta" | "media" | "baja" | null,
  "piso": number | null,
  "parqueo_incluido": boolean | null,
  "parqueo_precio_adicional_usd": number | null,
  "baulera_incluida": boolean | null,
  "baulera_precio_adicional_usd": number | null,
  "plan_pagos": {
    "tiene_plan_pagos": boolean | null,
    "plan_pagos_texto": string | null,
    "descuento_contado_pct": number | null,
    "acepta_permuta": boolean | null,
    "precio_negociable": boolean | null,
    "solo_tc_paralelo": boolean | null
  },
  "descripcion_limpia": string,
  "amenities_confirmados": string[],
  "equipamiento_detectado": string[]
}
```

---

## Changelog

### v4.0 (2026-03-16) — Dormitorios + Baños + Secciones Input

Cambios desde v3.2:
- **DORMITORIOS/BAÑOS agregados**: campos de salida con confianza. Regla: si portal dice 1 dorm pero texto dice "monoambiente" → LLM gana con 0.
- **ESTADO_CONSTRUCCION simplificado**: solo 2 valores (`preventa` / `entrega_inmediata`). `en_construccion`, `nuevo_a_estrenar`, `usado` eliminados — `en_construccion` y `nuevo_a_estrenar` mapeados a preventa/entrega_inmediata respectivamente.
- **Secciones de input**: TÍTULO, UBICACIÓN, DATOS PORTAL (metadata), DATOS EXTRACTOR (regex) separados. Permite al LLM distinguir fuentes de datos.
- **Regla de prioridad explícita**: "si título/ubicación/descripción contradice dato portal, usar evidencia del texto"
- **`dormitorios_confianza`**: nuevo campo de confianza para dormitorios
- **`depende_de_tc` removido**: ya estaba excluido del prompt desde v1.0, ahora también de la función SQL
- **`solo_tc_paralelo` redefinido**: true si menciona dólares/paralelo como forma de pago (cualquier combinación). false solo si acepta explícitamente bolivianos/oficial como alternativa. Antes era true solo si exigía exclusivamente dólares sin alternativa.

### v3.2 (2026-03-10)

Cambios desde v3.1:
- ESTADO_CONSTRUCCION: eliminar "precios al cambio Bs.7" de preventa (pertenece a tipo_cambio, no a estado)
- ESTADO_CONSTRUCCION: eliminar "amoblado CON piso específico y precio fijo USD" de entrega_inmediata (inferencia frágil)

### v3.1 (2026-03-10)

Cambios desde v3.0:
- TIPO_CAMBIO: agregados sinónimos de paralelo: "blue", "dólar blue", "al blue", "USDT", "cripto"

### v3.0 (2026-03-10) — Production-ready

Cambios desde v2.0:
- TIPO_CAMBIO: precio en Bs/bolivianos sin mención USD = `oficial` (fix ID 234)
- SOLO_TC_PARALELO: "dólares O paralelo" = `false` (fix ID 519). Solo `true` sin alternativa.

### v2.0 (2026-03-10)

Cambios desde v1.0:
- Booleanos DEFAULT false: `baulera_incluida`, `parqueo_incluido`, `plan_pagos.*`, `acepta_permuta`, `precio_negociable`, `solo_tc_paralelo`
- `tipo_cambio_detectado`: agregado `"no_especificado"` como valor válido. NUNCA devolver null.
- Resultado: no_detecta 90→2 (-98%), llm_agrega 68→143 (+110%)

### v1.0 (2026-03-10) — Versión inicial

- Prompt base con 15 campos

---

## Notas de diseño

### 17 campos de salida

| # | Campo | Nuevo en v4.0 | Confianza |
|---|-------|:---:|:---:|
| 1 | nombre_edificio | | si |
| 2 | dormitorios | **si** | si |
| 3 | banos | **si** | no |
| 4 | estado_construccion | simplificado | si |
| 5 | fecha_entrega_estimada | | no |
| 6 | es_multiproyecto | | no |
| 7 | tipo_cambio_detectado | | si |
| 8 | piso | | no |
| 9 | parqueo_incluido | | no |
| 10 | parqueo_precio_adicional_usd | | no |
| 11 | baulera_incluida | | no |
| 12 | baulera_precio_adicional_usd | | no |
| 13 | plan_pagos (7 sub-campos) | | no |
| 14 | descripcion_limpia | | no |
| 15 | amenities_confirmados | | no |
| 16 | equipamiento_detectado | | no |

### Campos que el LLM NO extrae (los maneja el regex/discovery):
- `precio_usd` — regex es robusto, riesgo de error LLM alto
- `area_total_m2` — discovery/regex confiable
- `latitud/longitud` — API GPS es fuente de verdad
- `fotos_urls` — HTML parsing más confiable
- `agente_*` — data-page/meta tags son fuente directa
- `depende_de_tc` — determinístico desde `moneda_original`

### Por qué dormitorios/baños se agregan en v4.0

**Problema:** El pipeline regex clasifica monoambientes como 1 dormitorio porque los portales reportan "1 dormitorio" para studios/lofts. El LLM puede leer "monoambiente" en la descripción y corregir a 0.

**Diseño:** El LLM recibe los datos del portal como referencia. Si el texto no contradice, el LLM debe devolver el valor del portal (o null). Solo corrige cuando hay evidencia textual clara.

### Inyección de proyectos_master
La lista se inyecta como texto plano:
```
- Torre Mirador Norte (ID 15)
- Condominio Las Dalias (ID 1)
- Sky Eclipse (ID 30)
...
```
~50 proyectos por zona x ~15 chars = ~750 tokens extra. Insignificante.

### Manejo de contenido por portal

| Portal | Método | Contenido enviado al LLM |
|--------|--------|--------------------------|
| Century21 | datos_json_enrichment.descripcion | Descripción markdown (max 3000 chars) |
| Remax | datos_json_enrichment.descripcion | `TÍTULO: {title}\n\nDESCRIPCIÓN:\n{description}` (max 3000 chars) |

### Validaciones post-LLM

| Campo | Rango válido | Si falla |
|-------|-------------|----------|
| dormitorios | 0 a 6 | → null |
| banos | 0 a 6 | → null |
| piso | -2 a 40 | → null |
| parqueo_precio_adicional_usd | 0 a 50,000 | → null |
| baulera_precio_adicional_usd | 0 a 20,000 | → null |
| descuento_contado_pct | 0 a 30 | → null |
| estado_construccion | "preventa" / "entrega_inmediata" only | → null |
| tipo_cambio_detectado | "paralelo" / "oficial" / "no_especificado" | → "no_especificado" |
| amenities_confirmados | array of strings | → [] |
| equipamiento_detectado | array of strings | → [] |
| Más de 3 errores de validación | — | requiere_revision = true |

### Costo estimado

| Concepto | Haiku | Sonnet |
|----------|-------|--------|
| Input tokens/prop | ~2,500 | ~2,500 |
| Output tokens/prop | ~1,200 | ~1,200 |
| Costo/prop | ~$0.0010 | ~$0.012 |
| Props/noche | ~7-10 | ~7-10 |
| Costo/mes | ~$1.00 | ~$3.00 |
