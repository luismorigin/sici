# Prompt LLM Enrichment — Ventas v1.0

> Modelo: claude-haiku-4-5-20251001 | temperature: 0 | max_tokens: 1500

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

PROYECTOS CONOCIDOS EN ESTA ZONA ({zona}):
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
- "entrega_inmediata": "listo para vivir", "listo para ocupar", "entrega inmediata", amoblado CON piso específico y precio fijo USD
- "preventa": "precios desde", "precios al cambio Bs.7", "entrega [fecha futura]", "avance de obra X%"
- "en_construccion": "en construcción", "obra gruesa"
- "nuevo_a_estrenar": "a estrenar", depto terminado sin amueblar
- "usado": "segunda mano", "de ocasión"
- CUIDADO: "amoblado" o "equipado" SOLOS no implican entrega_inmediata
- CUIDADO: "Precios al cambio Bs.7" = preventa (precio fijo BOB a TC oficial)
- CUIDADO: Un mismo edificio puede tener unidades en diferentes estados

TIPO_CAMBIO_DETECTADO:
- "paralelo": "TC paralelo", "al paralelo", "dólares o paralelo", "pago en dólares", "solo dólares", "tc del día" (sin número fijo)
- "oficial": "TC 7", "al cambio Bs.7", "TC oficial", "tipo de cambio 7", "cambio 6.96"
- null: si no hay mención de tipo de cambio ni forma de pago
- CLAVE: "solo dólares" o "pago en dólares" = PARALELO (en Bolivia, exigir USD = operar al paralelo)
- CLAVE: "TC 7" = OFICIAL (6.96 redondeado, tasa fija BCB)
- CLAVE: "$us X" sin más contexto = null (la moneda sola no indica TC)

PARQUEO_INCLUIDO:
- true: "incluye parqueo", "incluye 1 parqueo", "con parqueo y baulera" (sin precio aparte)
- false: "Parqueo: $us X", "parqueo adicional", precio explícito por parqueo
- null: si "parqueo" aparece solo en áreas comunes, o no se menciona
- PRIORIDAD: precio explícito → false (sin importar otras menciones)

PLAN_PAGOS:
- Detectá si hay información sobre forma de pago:
  - "plan de pagos", "financiamiento directo", "cuotas mensuales"
  - "reserva + cuotas", "30% anticipo + saldo"
  - "pago al contado", "solo contado"
- tiene_plan_pagos: true si hay financiamiento/cuotas, false si solo contado
- plan_pagos_texto: resumen breve de las condiciones

PISO:
- Extraé el número de piso si se menciona: "piso 7", "planta 3", "PB"
- PB/planta baja = 0
- Si no se menciona, null

AMENITIES Y EQUIPAMIENTO:
- Solo listá amenities que el texto CONFIRME explícitamente
- NUNCA inferir Pet Friendly si no dice "pet friendly" o "acepta mascotas"
- NUNCA inferir Sauna si no dice "sauna" o "jacuzzi"
- Amenities = áreas del edificio (piscina, gym, churrasquera, cowork, etc.)
- Equipamiento = del departamento (A/C, cocina equipada, lavadora, etc.)
- A/C: solo si dice "aire acondicionado", "split", "climatización". NO si dice "acceso", "acústico"

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | "en_construccion" | "nuevo_a_estrenar" | "usado" | null,
  "estado_construccion_confianza": "alta" | "media" | "baja" | null,
  "fecha_entrega_estimada": string | null,
  "es_multiproyecto": boolean | null,
  "tipo_cambio_detectado": "paralelo" | "oficial" | null,
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
|--------|--------|--------------------------|
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
| tipo_cambio_detectado | "paralelo" / "oficial" / null | → null |
| amenities_confirmados | array of strings | → [] |
| equipamiento_detectado | array of strings | → [] |
| Más de 3 errores de validación | — | requiere_revision = true |

### Costo estimado

| Concepto | Valor |
|----------|-------|
| Input tokens/prop | ~1,800 (prompt + PM list + contenido) |
| Output tokens/prop | ~600 |
| Costo/prop (Haiku 4.5) | ~$0.0006 |
| Props/noche | ~40-50 |
| Costo/mes | ~$0.90 |
