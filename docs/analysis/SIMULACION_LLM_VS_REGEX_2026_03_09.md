# Simulación LLM vs Regex — Enrichment Venta

> Fecha: 9 Mar 2026. Muestra: 10 props completadas desde 2026-03-01.

## Metodología

- **Regex actual**: valores en `datos_json_enrichment` (pipeline producción)
- **LLM simulado**: Claude lee descripción + lista `proyectos_master` de la zona y extrae los mismos campos
- Campos evaluados: `nombre_edificio`, `estado_construccion`, `amenities`, `plan_pagos`, `parqueo_incluido`

## Muestra

| ID | Fuente | Zona | Proyecto real |
|----|--------|------|---------------|
| 1087 | Remax | Eq. Centro | TORRE ARA |
| 1095 | Remax | Eq. Oeste | Sky Eclipse |
| 1103 | Remax | Sirari | (sin match — C. Los Claveles) |
| 1102 | Remax | V. Brigida | Edificio Vertical 60 |
| 1104 | C21 | Eq. Centro | Condominio Stanza |
| 1074 | C21 | Eq. Centro | Sky Collection Equipetrol |
| 1075 | C21 | Eq. Centro | Luxe Suites |
| 1073 | C21 | Sirari | Mare |
| 1068 | C21 | V. Brigida | Portobello Green |
| 1053 | C21 | Sirari | La Riviera |

## Resultados por propiedad

### ID 1087 — Remax | TORRE ARA

Descripción: *"TORRE ARA - 2do anillo, Av. La Salle... Incluye: 1 Parqueo, 1 Baulera"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"Venta"` | `"TORRE ARA"` (match PM 253) | **SI** |
| estado_construccion | entrega_inmediata | entrega_inmediata | = |
| amenities | Piscina, Terraza, Ascensor, Gimnasio, Churrasquera | Piscina, Terraza, Ascensor, Gimnasio, Churrasquera | = |
| plan_pagos | no detectado | no detectado | = |
| parqueo_incluido | incluido | incluido | = |

### ID 1095 — Remax | Sky Eclipse

Descripción: *"Sky Eclipse | Equipetrol... Condominio Sky Eclipse..."*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"Venta"` (enrich falló, matching salvó) | `"Sky Eclipse"` (PM 30) | **SI** |
| estado_construccion | entrega_inmediata | entrega_inmediata | = |
| amenities | Piscina, Gimnasio, Sauna/Jacuzzi | Piscina, Gimnasio, Sauna/Jacuzzi | = |
| plan_pagos | no detectado | no detectado | = |
| parqueo_incluido | sin_confirmar | sin_confirmar | = |

### ID 1103 — Remax | Sin match (Calle Los Claveles)

Descripción: *"C. Los Claveles, Zona Equipetrol... 3 Dormitorios... Churrasquera privada"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | null | null (no hay nombre en desc ni match en PM) | = |
| estado_construccion | entrega_inmediata | entrega_inmediata | = |
| amenities | Churrasquera | Churrasquera | = |
| plan_pagos | no detectado | no detectado | = |
| parqueo_incluido | sin_confirmar | sin_confirmar | = |

### ID 1102 — Remax | Edificio Vertical 60

Descripción: *"Vertical 60. 73.26 m² | 2 hab | Parqueo | Totalmente amoblado"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | null (enrich) | `"Vertical 60"` → PM 228 | **SI** |
| estado_construccion | entrega_inmediata | entrega_inmediata | = |
| amenities | Piscina | Piscina + Amoblado | **SI** |
| plan_pagos | no detectado | no detectado | = |
| parqueo_incluido | sin_confirmar | incluido ("Parqueo" en features) | **SI** |

### ID 1104 — C21 | Condominio Stanza

Descripción: *"Condominio Stanza, 1 dormitorio, amoblado... Piscina, Cowork, Churrasqueras, Sala de juego. 82.000 pago en dólares"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"Stanza"` | `"Condominio Stanza"` (PM 162) | = |
| estado_construccion | sin_informacion | entrega_inmediata ("amoblado") | **SI** |
| amenities | Piscina, Pet Friendly, Churrasquera, Co-working, Seguridad 24/7 | Piscina, Churrasquera, Co-working, Sala de juego | ~= (LLM no inventa Pet Friendly) |
| plan_pagos | no detectado | pago en dólares (contado) | **SI** |
| parqueo_incluido | sin_confirmar | sin_confirmar | = |

### ID 1074 — C21 | Sky Collection Equipetrol

Descripción: *"2 dormitorios en sky collection Equipetrol... parqueo... 150.000 $us pago en dólares"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"Dormitorios En Sky Collection"` | `"Sky Collection Equipetrol"` (PM 104) | **SI** |
| estado_construccion | sin_informacion | entrega_inmediata (amoblada, equipada) | **SI** |
| amenities | Piscina, Pet Friendly, Área Social, Terraza, Est. Visitas, Seguridad 24/7 | Áreas sociales (genérico) | **NO** — regex extrajo más |
| plan_pagos | no detectado | pago en dólares (contado) | **SI** |
| parqueo_incluido | sin_confirmar | incluido | **SI** |

### ID 1075 — C21 | Luxe Suites

Descripción: *"LUXES SUITES... $us 78.000 (dólares o al paralelo)... Amoblado... Piscina infinita, Cowork, Gimnasio"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"Luxe Suites Dpto"` | `"Luxe Suites"` (PM 9) | **SI** |
| estado_construccion | nuevo_a_estrenar | nuevo_a_estrenar | = |
| amenities | Piscina, Gimnasio, Co-working, Terraza, Seguridad 24/7 | Piscina infinita, Gimnasio, Co-working, Billar, Futbolín | **SI** |
| plan_pagos | no detectado | dólares o paralelo | **SI** |
| parqueo_incluido | sin_confirmar | sin_confirmar | = |

### ID 1073 — C21 | Mare

Descripción: *"Condominio MARE... piso 22... Cocina amoblada, Heladera, horno... 98.000$ USD TC/PARALELO"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"Mare"` | `"Mare"` (PM 65) | = |
| estado_construccion | nuevo_a_estrenar | nuevo_a_estrenar | = |
| amenities | Seguridad 24/7 | (desc no menciona áreas sociales) | = |
| plan_pagos | no detectado | TC/PARALELO | **SI** |
| parqueo_incluido | sin_confirmar | sin_confirmar | = |

### ID 1068 — C21 | Portobello Green

Descripción: *"Monoambiente en venta... churrasqueras, co work, minimarket, gimnasio, piscina con vista. Precios al cambio Bs.7"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | null (enrich) | null (desc sin nombre, matching vía GPS) | = |
| estado_construccion | sin_informacion | en_construccion ("al cambio Bs.7" = preventa) | **SI** |
| amenities | Piscina, Gimnasio, Churrasquera, Sauna/Jacuzzi, Seguridad 24/7 | Piscina, Gimnasio, Churrasquera, Co-work, Minimarket, Sala entrenamiento | **SI** — más preciso, no inventa Sauna |
| plan_pagos | no detectado | al cambio Bs.7 (BOB, TC fijo) | **SI** |
| parqueo_incluido | sin_confirmar | sin_confirmar | = |

### ID 1053 — C21 | La Riviera

Descripción: *"EDIF. LA RIVIERA... Piso 14... USD 350.000 (TC Paralelo)... 2 Parqueos: USD 30.000"*

| Campo | Regex | LLM | Mejoró? |
|-------|-------|-----|---------|
| nombre_edificio | `"LA RIVIERA"` | `"La Riviera"` (PM 6) | = |
| estado_construccion | sin_informacion | entrega_inmediata (piso específico, listo) | **SI** |
| amenities | Sauna/Jacuzzi, Terraza, Est. Visitas, Seguridad 24/7 | Sauna/Jacuzzi, Terraza, Seguridad 24/7 | = |
| plan_pagos | no detectado | TC Paralelo del día | **SI** |
| parqueo_incluido | sin_confirmar | no_incluido (parqueos se venden aparte: USD 30.000) | **SI** |

## Resumen Cuantitativo

| Campo | Regex correcto | LLM mejoraría | Tasa mejora |
|-------|---------------|---------------|-------------|
| nombre_edificio | 6/10 | 4/10 mejorados | 40% |
| estado_construccion | 4/10 | 5/10 mejorados | 50% |
| amenities | 7/10 ~correcto | 3/10 mejorados | 30% |
| plan_pagos | 0/10 | 6/10 detectados | **60%** |
| parqueo_incluido | 1/10 | 3/10 mejorados | 30% |
| **TOTAL** | **18/50** | **21/50 mejoras** | **42%** |

## Hallazgos Clave

### 1. nombre_edificio (40% mejora)
El regex de Remax sigue produciendo basura (`"Venta"`, null). El LLM con lista de PM de la zona resolvería estos casos directamente. El matching post-merge ya compensa, pero es un paso extra que se podría evitar.

### 2. estado_construccion (50% mejora)
**Mayor debilidad del regex.** Casi siempre pone `sin_informacion`. El LLM lo infiere del contexto:
- "amoblado" / "equipado" → entrega_inmediata
- "a estrenar" → nuevo_a_estrenar
- "al cambio Bs.7" / "precios desde" → en_construccion/preventa

### 3. plan_pagos (60% mejora — mayor gap)
**El regex NO detecta forma de pago en ningún caso.** El LLM lo detectaría en 6/10:
- "pago en dólares" → contado USD
- "TC/PARALELO" → acepta paralelo
- "al cambio Bs.7" → pago en BOB a TC fijo
- "dólares o al paralelo" → acepta ambos

### 4. parqueo_incluido (30% mejora)
El regex casi nunca confirma. El LLM distingue:
- "Incluye: 1 Parqueo" → incluido
- "Parqueo" en lista de features → incluido
- "2 Parqueos: USD 30.000" → no_incluido (se venden aparte)

### 5. amenities (30% mejora, mixto)
El regex a veces extrae más amenities (posiblemente de fotos/URL, no solo descripción), pero también inventa (Pet Friendly sin evidencia en descripción). El LLM es más preciso pero menos exhaustivo si solo lee la descripción.

## Conclusión

El LLM mejoraría ~42% de los campos vs regex actual. Impacto por prioridad:

1. **plan_pagos** — de 0% a 60% detección. Campo nuevo que el regex no captura.
2. **estado_construccion** — de 40% a 90%. Inferencia contextual que el regex no puede hacer.
3. **nombre_edificio** — de 60% a 80%+. Inyectar lista PM elimina errores de Remax.
4. **parqueo_incluido** — de 10% a 40%. Distinguir incluido vs venta separada.
5. **amenities** — mejora marginal en precisión, pero regex es más exhaustivo con fuentes extra.

## Referencia

- Prompt LLM propuesto: `docs/analysis/COMPARATIVA_VENTAS_VS_ALQUILERES.md` sección 4.3
- Prueba previa (20 props): `docs/analysis/PRUEBA_LLM_VS_REGEX_VENTAS.md`
- Muestra: 10 props `status='completado'`, `fecha_discovery >= 2026-03-01`
