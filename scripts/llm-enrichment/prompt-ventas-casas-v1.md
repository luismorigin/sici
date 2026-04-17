# Prompt LLM Enrichment — Casas v1.0

> Modelo: claude-haiku-4-5-20251001 | temperature: 0 | max_tokens: 1500
> Pipeline: casas_terrenos (independiente de ventas/alquiler)

---

## Prompt Template

```
Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de anuncios de CASAS EN VENTA.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

Una casa se valora por sus ESPACIOS, no solo por dormitorios. Presta especial atencion a ambientes adicionales como escritorio, galeria, sala de juegos, cuarto de servicio, etc.

═══════════════════════════════════════
DATOS PORTAL (metadata del portal — confiables):
- URL: {url}
- Fuente: {fuente}
- Precio original: {precio_usd_original} {moneda_original}
- Area construida: {area_total_m2} m2
- Area terreno: {area_terreno_m2} m2
- Dormitorios (portal): {dormitorios_portal}
- Banos (portal): {banos_portal}

DESCRIPCION:
{contenido}
═══════════════════════════════════════

INSTRUCCIONES POR CAMPO:
═══════════════════════════════════════

DORMITORIOS:
- Contar habitaciones de dormir (incluye suite master)
- Si el portal dice un numero y el texto no lo contradice, mantener el del portal
- Rango valido: 0-10

BANOS:
- "medio bano" o "toilette" cuenta como 0.5
- Si el portal dice un numero y el texto no lo contradice, mantener el del portal
- Rango valido: 0-10

AREA_TERRENO_M2:
- Solo si la descripcion menciona el area del terreno explicitamente
- Si el dato ya viene del portal ({area_terreno_m2}), confirmar o corregir
- null si no se menciona

NIVELES:
- Cantidad de plantas/pisos de la casa
- "2 plantas", "3 niveles", "planta baja + planta alta" = 2
- Rango valido: 1-5
- null si no se menciona

GARAGE:
- cubierto: true si dice "garage techado/cubierto", false si es abierto/descubierto
- vehiculos: cantidad de vehiculos que entran
- null si no se menciona garaje/cochera

CUARTO_SERVICIO:
- true si menciona "dependencia de servicio", "cuarto de empleada", "cuarto de servicio"
- false si no se menciona
- DEFAULT: false

CUARTO_SERVICIO_CON_BANO:
- true si el cuarto de servicio tiene bano propio
- false si no lo especifica
- Solo relevante si cuarto_servicio = true
- DEFAULT: false

PISCINA:
- true si la casa tiene piscina propia (no comunitaria del barrio)
- false si no se menciona
- DEFAULT: false

JARDIN:
- true si tiene jardin, patio verde, area verde propia
- false si no se menciona
- DEFAULT: false

AMBIENTES_ADICIONALES:
- Array con los espacios adicionales que se mencionan EXPLICITAMENTE
- Valores validos: "escritorio", "sala_juegos", "galeria", "lavanderia", "sala_estar", "terraza", "quincho", "deposito", "sala_tv", "vestidor", "bodega"
- Solo incluir lo que el texto CONFIRME. NUNCA inferir
- DEFAULT: []

ESTADO_PROPIEDAD:
- "nueva": casa a estrenar, recien construida
- "usada": casa habitada/usada previamente
- "remodelada": menciona remodelacion/renovacion reciente
- "para_demolicion": menciona demolicion, venta de terreno con construccion vieja
- null si no hay evidencia clara

ESTADO_CONSTRUCCION:
- "preventa": "en construccion", "entrega [fecha futura]"
- "entrega_inmediata": "lista para vivir", "a estrenar", casa terminada
- null si no hay evidencia clara

TIPO_CAMBIO_DETECTADO:
- "paralelo": evidencia EXPLICITA en descripcion: "TC paralelo", "al paralelo", "solo dolares", "tc del dia", "blue", "USDT", "cripto"
- "oficial": evidencia EXPLICITA: "TC 7", "al cambio Bs.7", "TC oficial", "cambio 6.96"
- "no_especificado": DEFAULT. Si no hay mencion explicita de TC
- CLAVE: La moneda del portal (USD, BOB) NO indica tipo de cambio. Solo el TEXTO de la descripcion puede confirmar oficial o paralelo

PLAN_PAGOS:
- tiene_plan_pagos: true si cuotas/financiamiento, false si solo contado o no hay info. DEFAULT: false
- plan_pagos_texto: resumen breve de condiciones, null si no hay info
- descuento_contado_pct: porcentaje de descuento por pago contado, null si no se menciona
- acepta_permuta: true si menciona permuta/canje. DEFAULT: false
- precio_negociable: true si "negociable"/"escucha ofertas". DEFAULT: false
- solo_tc_paralelo: true si menciona dolares/paralelo como forma de pago. DEFAULT: false

AMENITIES_CONFIRMADOS:
- Amenities del CONDOMINIO o barrio cerrado (no de la casa misma)
- Ej: "piscina comunitaria", "salon de eventos", "seguridad 24h", "area de juegos"
- Solo lo que el texto CONFIRME. NUNCA inferir
- DEFAULT: []

EQUIPAMIENTO_DETECTADO:
- Equipamiento incluido con la casa
- Ej: "cocina_equipada", "aire_acondicionado", "calefon", "chapa_digital", "paneles_solares"
- Solo lo que el texto CONFIRME. NUNCA inferir
- DEFAULT: []

DESCRIPCION_LIMPIA:
- Descripcion sin datos de contacto (telefono, whatsapp, email), sin emojis
- Mantener la informacion util, estructura y formato
- Si la descripcion es muy corta (<30 chars), devolver null

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "dormitorios": number | null,
  "banos": number | null,
  "area_terreno_m2": number | null,
  "niveles": number | null,
  "garage": {"cubierto": boolean, "vehiculos": number} | null,
  "cuarto_servicio": boolean,
  "cuarto_servicio_con_bano": boolean,
  "piscina": boolean,
  "jardin": boolean,
  "ambientes_adicionales": string[],
  "estado_propiedad": "nueva" | "usada" | "remodelada" | "para_demolicion" | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | null,
  "estado_construccion_confianza": "alta" | "media" | "baja" | null,
  "tipo_cambio_detectado": "paralelo" | "oficial" | "no_especificado",
  "tipo_cambio_confianza": "alta" | "media" | "baja" | null,
  "plan_pagos": {
    "tiene_plan_pagos": boolean,
    "plan_pagos_texto": string | null,
    "descuento_contado_pct": number | null,
    "acepta_permuta": boolean,
    "precio_negociable": boolean,
    "solo_tc_paralelo": boolean
  },
  "amenities_confirmados": string[],
  "equipamiento_detectado": string[],
  "descripcion_limpia": string | null
}
```

---

## Notas de diseno

### Campos que el LLM NO extrae (los maneja discovery):
- `precio_usd` — discovery + TC conversion en workflow
- `area_total_m2` — discovery es confiable (m2C del portal)
- `latitud/longitud` — API GPS
- `fotos_urls` — HTML parsing
- `nombre_edificio` — no aplica a casas individuales
- `es_multiproyecto` — concepto de deptos
- `piso` — concepto de deptos
- `baulera` — concepto de deptos

### Validaciones post-LLM

| Campo | Rango valido | Si falla |
|-------|-------------|----------|
| dormitorios | 0 a 10 | -> null |
| banos | 0 a 10 | -> null |
| area_terreno_m2 | 20 a 10000 | -> null |
| niveles | 1 a 5 | -> null |
| garage.vehiculos | 1 a 10 | -> null |
| descuento_contado_pct | 0 a 30 | -> null |
| estado_construccion | "preventa" / "entrega_inmediata" | -> null |
| tipo_cambio_detectado | "paralelo" / "oficial" / "no_especificado" | -> "no_especificado" |
| estado_propiedad | "nueva" / "usada" / "remodelada" / "para_demolicion" | -> null |
| ambientes_adicionales | array of valid strings | -> [] |
| amenities_confirmados | array of strings | -> [] |
| equipamiento_detectado | array of strings | -> [] |
| Mas de 3 errores de validacion | — | requiere_revision = true |

### Costo estimado

| Concepto | Haiku |
|----------|-------|
| Input tokens/prop | ~2,000 |
| Output tokens/prop | ~1,000 |
| Costo/prop | ~$0.0008 |
| Props nuevas/noche | ~1-3 |
| Costo/mes | ~$0.10 |
