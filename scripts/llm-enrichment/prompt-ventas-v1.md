# Prompt LLM Enrichment — Ventas v3.2

> Modelo: claude-haiku-4-5-20251001 | temperature: 0 | max_tokens: 1500
> Evolución: v1.0 → v2.0 → v3.0 → v3.1 → v3.2 (2026-03-10)

---

## Prompt Template

```
Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

DATOS YA EXTRAÍDOS (del pipeline regex — pueden tener errores):
- URL: {url}
- Fuente: {fuente}
- Precio: ${precio_usd} USD (moneda original: {moneda_original})
- Área: {area_total_m2} m²
- Dormitorios: {dormitorios}
- Baños: {banos}
- Nombre edificio (regex): {nombre_edificio_regex}
- Estado construcción (regex): {estado_construccion_regex}
- Zona GPS: {zona}

PROYECTOS CONOCIDOS EN ZONA {zona}:
{lista_proyectos_zona}

TEXTO DE LA PÁGINA:
{contenido}

═══════════════════════════════════════
INSTRUCCIONES POR CAMPO:
═══════════════════════════════════════

NOMBRE_EDIFICIO:
- Buscá el nombre del edificio/condominio/proyecto en el texto
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- Si encontrás match (incluso parcial: "Edif Nomad" → "Nomad by Smart Studio"), usá el nombre oficial de la lista
- Si no hay match pero el texto tiene un nombre claro, devolvelo tal cual
- Si no hay nombre en el texto, devolvé null
- NUNCA devolver: "Venta", "Pre Venta", "Departamento", fragmentos de oraciones

ESTADO_CONSTRUCCION:
- "entrega_inmediata": "listo para vivir", "entrega inmediata", "listo para ocupar"
- "preventa": "precios desde", "entrega [fecha futura]"
- "en_construccion": "en construcción", "obra gruesa", "avance X%"
- "nuevo_a_estrenar": "a estrenar", depto terminado sin amueblar
- "usado": "segunda mano", "de ocasión"
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

PLAN_PAGOS:
- tiene_plan_pagos: true si cuotas/financiamiento, false si solo contado o no hay info. DEFAULT: false
- plan_pagos_texto: resumen breve de condiciones, null si no hay info
- descuento_contado_pct: porcentaje de descuento por pago contado, null si no se menciona
- acepta_permuta: true si menciona permuta/canje, false si no. DEFAULT: false
- precio_negociable: true si "negociable"/"escucha ofertas", false si no. DEFAULT: false
- solo_tc_paralelo: true SOLO si exige exclusivamente dólares/paralelo ("solo dólares", "pago en dólares", "solo paralelo"). false si acepta ambas opciones. DEFAULT: false
- CUIDADO: "dólares O paralelo" = false (acepta ambas opciones, no exige una sola)
- CUIDADO: "Se acepta dólares o al tipo de cambio paralelo" = false (da opciones)
- Solo true cuando NO hay alternativa: "Pago en Dolares" (sin "o"), "SOLO EN DOLARES"

AMENITIES y EQUIPAMIENTO:
- Solo lo que el texto CONFIRME explícitamente
- NUNCA inferir Pet Friendly, Sauna, etc. sin mención explícita

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | "en_construccion" | "nuevo_a_estrenar" | "usado" | null,
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

### v3.2 (2026-03-10)

Cambios desde v3.1:
- ESTADO_CONSTRUCCION: eliminar "precios al cambio Bs.7" de preventa (pertenece a tipo_cambio, no a estado)
- ESTADO_CONSTRUCCION: eliminar "amoblado CON piso específico y precio fijo USD" de entrega_inmediata (inferencia frágil)
- ESTADO_CONSTRUCCION: eliminar CUIDADO "Precios al cambio Bs.7 = preventa" (incorrecto, contradictorio)

### v3.1 (2026-03-10)

Cambios desde v3.0:
- TIPO_CAMBIO: agregados sinónimos de paralelo: "blue", "dólar blue", "al blue", "USDT", "cripto". En Bolivia el mercado informal usa estos términos para referirse al TC paralelo.

### v3.0 (2026-03-10) — Production-ready

Cambios desde v2.0:
- TIPO_CAMBIO: precio en Bs/bolivianos sin mención USD = `oficial` (fix ID 234)
- SOLO_TC_PARALELO: "dólares O paralelo" = `false` (fix ID 519). Solo `true` sin alternativa.
- Instrucciones con ejemplos negativos para prevenir falsos positivos

### v2.0 (2026-03-10)

Cambios desde v1.0:
- Booleanos DEFAULT false: `baulera_incluida`, `parqueo_incluido`, `plan_pagos.*`, `acepta_permuta`, `precio_negociable`, `solo_tc_paralelo`
- `tipo_cambio_detectado`: agregado `"no_especificado"` como valor válido. NUNCA devolver null.
- Instrucciones expandidas para BAULERA (sección propia)
- Instrucciones expandidas para PLAN_PAGOS (detalle por subcampo)
- Resultado: no_detecta 90→2 (-98%), llm_agrega 68→143 (+110%)

### v1.0 (2026-03-10) — Versión inicial

- Prompt base con 15 campos
- `depende_de_tc` incluido (removido post-v1, ver "Campos excluidos")
- Resultado: 30 props, $0.026, 90 no_detecta por desalineación de defaults

---

## Notas de diseño

### Campos que el LLM NO extrae (los maneja el regex/discovery):
- `precio_usd` — regex es robusto, riesgo de error LLM alto
- `area_total_m2` — discovery/regex confiable
- `dormitorios` — discovery/regex confiable
- `banos` — discovery/regex confiable
- `latitud/longitud` — API GPS es fuente de verdad
- `fotos_urls` — HTML parsing más confiable
- `agente_*` — data-page/meta tags son fuente directa
- `depende_de_tc` — ver explicación abajo

### Por qué `depende_de_tc` se excluyó del prompt (v1.0, 2026-03-10)

**Contexto:** `depende_de_tc` indica si el precio USD depende de una conversión desde BOB (true) o es USD directo (false). Trabaja en conjunto con `tipo_cambio_detectado` — ambos alimentan `precio_normalizado()`.

**Problema:** En el test de 30 props, el LLM falló en 23/30 (77%). Decía `false` donde BD tenía `true`. El error es sistemático: el LLM lee "$us 72,000" en la descripción y concluye que el precio es USD directo. Pero la metadata del portal (`moneda_original`) dice BOB — el portal publicó en bolivianos y el extractor convirtió a USD.

**Causa raíz:** El LLM solo ve el texto de la descripción. No tiene acceso a `moneda_original`, que es metadata estructurada del portal (viene de `data-page` en Remax, JSON-LD en C21). La descripción frecuentemente menciona precios en "$us" aunque el listing original esté en BOB.

**Decisión:** `depende_de_tc` es 100% determinístico: si `moneda_original = BOB` → true, si `moneda_original = USD` → false. Se calcula en el merge sin necesidad de NLP. No tiene sentido pedirle al LLM que infiera algo que ya se sabe con certeza desde la metadata.

**Nota:** `tipo_cambio_detectado` (paralelo/oficial) SÍ se mantiene en el prompt porque es textual — el LLM detecta "solo dólares" = paralelo, "TC 7" = oficial. Son campos complementarios: `depende_de_tc` dice SI normalizar, `tipo_cambio_detectado` dice CON QUÉ tasa.

### Inyección de proyectos_master
La lista se inyecta como texto plano:
```
- Torre Mirador Norte (ID 15)
- Condominio Las Dalias (ID 1)
- Sky Eclipse (ID 30)
...
```
~50 proyectos por zona × ~15 chars = ~750 tokens extra. Insignificante.

### Manejo de contenido por portal

| Portal | Método | Contenido enviado al LLM |
|--------|--------|-----------------------------|
| Century21 | Markdown de Firecrawl | `scrape.markdown` (max 3000 chars) |
| Remax | data-page parsed | `TÍTULO: {title}\n\nDESCRIPCIÓN:\n{description}` (max 3000 chars) |

### Validaciones post-LLM

| Campo | Rango válido | Si falla |
|-------|-------------|----------|
| piso | -2 a 40 | → null |
| parqueo_precio_adicional_usd | 0 a 50,000 | → null |
| baulera_precio_adicional_usd | 0 a 20,000 | → null |
| descuento_contado_pct | 0 a 30 | → null |
| estado_construccion | enum values only | → null |
| tipo_cambio_detectado | "paralelo" / "oficial" / "no_especificado" | → "no_especificado" |
| amenities_confirmados | array of strings | → [] |
| equipamiento_detectado | array of strings | → [] |
| Más de 3 errores de validación | — | requiere_revision = true |

### Costo estimado

| Concepto | Valor |
|----------|-------|
| Input tokens/prop | ~2,200 (prompt + PM list + contenido) |
| Output tokens/prop | ~1,200 |
| Costo/prop (Haiku 4.5) | ~$0.0010 |
| Props/noche | ~40-50 |
| Costo/mes | ~$1.50 |
