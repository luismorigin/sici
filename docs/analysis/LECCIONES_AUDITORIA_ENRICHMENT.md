# Lecciones Auditoría Enrichment — Reglas para el LLM

> Fecha: 9 Mar 2026. Fuente: auditoría manual de 329 props venta completadas.
> Estas reglas deben incorporarse al prompt del LLM enrichment de ventas.

---

## 1. estado_construccion — NO inferir solo por "amoblado/equipado"

### Regla principal
"Amoblado" o "equipado" **NO implica automáticamente** `entrega_inmediata`. Es necesario cruzar con otras señales.

### Señales de entrega_inmediata (alta confianza)
- "listo para vivir", "listo para alquilar", "listo para ocupar", "entrega inmediata"
- "amoblado y equipado" + piso específico + precio fijo en USD → depto terminado que se vende con muebles
- Descripción detalla muebles específicos del depto (cama, ropero, sofá, TV, electrodomésticos) → ya está físicamente amoblado
- Fotos muestran muebles reales (no renders)

### Señales de preventa / en_construccion (descartan entrega_inmediata)
- **"Precios al cambio Bs.7"** o cualquier TC fijo en BOB → preventa con precio en bolivianos a TC pactado
- **"Precios desde $us X"** → rango de precios = múltiples unidades disponibles = proyecto en venta (puede ser preventa)
- Descripción genérica del proyecto sin detalles del depto específico ("equipados con mueblería alta y baja en cocina, cocina encimera, campana extractora") → es la ficha del proyecto, no un depto entregado
- "En construcción", "entrega [fecha futura]", "avance de obra X%"
- Renders en lugar de fotos reales

### Señales ambiguas (no usar solas)
- "Equipado" solo → puede ser promesa ("se entregará equipado") o realidad ("ya está equipado")
- Descripción mínima ("monoambiente amoblado en venta") sin más contexto → no alcanza para inferir

### Casos especiales
- **Un mismo edificio puede tener unidades en diferentes estados.** Ej: Sky Eclipse tiene dptos en preventa Y entrega inmediata. No generalizar por proyecto.
- **"Último depto disponible"** + equipado → probablemente entrega_inmediata (el proyecto ya se completó)

---

## 2. nombre_edificio — SIEMPRE preferir pm.nombre_oficial

### Regla principal
Si la propiedad tiene `id_proyecto_master`, el `nombre_edificio` DEBE ser `pm.nombre_oficial`. No usar el nombre extraído de la descripción.

### Lecciones del regex
El regex de Remax/C21 produce basura en ~25% de casos:
- Extrae fragmentos de la descripción: "PAGO AL CONTADO", "De Dise", "Consta De Seguridad Las", "Moderno Que Ofrece Una"
- Extrae prefijos genéricos: "Venta", "Pre Venta", "Venta En Equipetrol En Edificio Solo"
- Extrae nombres parciales: "Luxe Suites Dpto", "Dormitorios En Sky Collection", "Eco Sostenible Nomad By"

### Regla para el LLM
1. Recibir lista de `proyectos_master` de la zona como contexto
2. Intentar matchear nombre en descripción contra la lista de PM
3. Si hay match → usar `pm.nombre_oficial` exacto
4. Si no hay match → extraer el nombre más probable de la descripción, sin fragmentos genéricos
5. Nunca devolver: palabras sueltas de la descripción, prefijos como "Venta", "Pre Venta", fragmentos de oraciones

---

## 3. parqueo_incluido — Distinguir incluido vs venta separada

### Señales de parqueo incluido (true)
- "Incluye parqueo", "incluye 1 parqueo", "incluye garaje"
- "Con parqueo y baulera" como feature del depto (no con precio separado)
- "Cuenta con parqueo" en la descripción del depto
- "1 Parqueo + Baulera" listado en características SIN precio aparte
- "CON PARQUEO" en el título o encabezado del listing

### Señales de parqueo NO incluido (false)
- **"Parqueo: $us X"** o **"Parqueo + Baulera: $us X"** → se vende aparte (precio explícito)
- "Parqueo adicional $us X", "garaje $X extra"
- "NO INCLUYE GARAJE" (explícito)
- "Parqueo OPCIONAL (precio independiente)"
- Precio de parqueo listado separado del depto

### Trampas comunes — el regex se equivocó en estos casos reales
1. **"Parqueo" listado en "Áreas Sociales"** (ej: "Piscina, Churrasquera, Parqueo") → NO es parqueo propio incluido. Es el estacionamiento del edificio. Clasificar como `false` o `null`, no `true`.
2. **"Estacionamiento en subsuelo" + más abajo "Parqueo + Baulera: $14.000"** → El regex vio "estacionamiento" y dijo incluido, pero el precio separado indica lo contrario. **SIEMPRE buscar precio separado antes de clasificar como incluido.**
3. **"CON PARQUEO Y BAULERA GRANDE" + "Incluye 1 garage"** → El regex lo clasificó como no incluido (quizás por "baulera" confundiendo), pero claramente dice "incluye". **Buscar la palabra "incluye" como señal fuerte.**
4. **"1 parqueo" en lista de features sin precio** → El regex lo clasificó como no incluido, pero si no hay precio separado, es incluido en el precio del depto.

### Regla de decisión (orden de prioridad)
1. Si hay precio explícito para parqueo → `false` (se vende aparte, sin importar otras menciones)
2. Si dice "incluye parqueo/garage" explícitamente → `true`
3. Si "parqueo" aparece como feature del depto (junto a dormitorios, cocina, etc.) sin precio → `true`
4. Si "parqueo" aparece solo en "áreas sociales/comunes" → NO es parqueo propio, dejar `null`
5. Si no se menciona parqueo → `null` (no asumir)

---

## 4. tipo_cambio_detectado — Señales de TC

### Paralelo
- "TC paralelo", "T/C paralelo", "tipo de cambio paralelo"
- "al paralelo", "dólares o paralelo", "dólares o al paralelo"
- "TC/PARALELO", "t/c paralelo del día"
- "Pago en dólares", "solo dólares", "pago solo en dólar" → **paralelo** (en Bolivia, exigir USD = operar al paralelo)
- **"tc del dia"**, **"tc del día"** → paralelo (nadie dice "tc del día" para oficial)

### Oficial (tasa fija, no fluctúa)
- "TC oficial", "al oficial", "tipo de cambio oficial"
- **"TC 7"**, **"al cambio Bs.7"**, **"cambio 7"**, **"a T/C 7"** → oficial redondeado (7 ≈ 6.96). Es tasa fija, NO fluctúa como el paralelo
- **"Precios al cambio Bs.7"** → oficial (precio fijo en BOB a tasa fija)

### "Solo dólares" / "pago en dólares" = PARALELO (no oficial)
- En Bolivia, si el vendedor exige "solo dólares" o "pago en dólares", es porque quiere operar al TC paralelo (evitar BOB al oficial)
- "Pago solo en dólar", "solo dólares", "pago en dólares" → **paralelo**
- **"$us X"** (precio en USD sin más contexto) → `no_especificado`. La moneda sola no indica nada.

### No especificado
- Si no hay mención de TC ni forma de pago → `no_especificado`
- Precio solo en BOB sin TC → `no_especificado` (podría ser cualquiera)

### Reglas importantes

**1. tipo_cambio_detectado vs depende_de_tc — son campos independientes:**
- `tipo_cambio_detectado`: qué TC acepta el vendedor (paralelo/oficial/no_especificado)
- `depende_de_tc`: si `precio_usd` fue derivado de BOB (`true`) o es USD real del listing (`false`)
- Si dice "$us 100.000 (TC paralelo)" → `precio_usd = 100000`, `depende_de_tc = false`, `tipo_cambio_detectado = 'paralelo'`
- Si dice "Bs. 700.000 (TC 7)" → `precio_usd = 100000` (derivado), `depende_de_tc = true`, `tipo_cambio_detectado = 'paralelo'`

**2. El extractor NO debe multiplicar precio USD por TC:**
- Bug histórico CASO 2: el extractor veía "$us 133.720 (paralelo)" y multiplicaba 133720 × TC / 6.96 = 173276. El precio ya era USD → inflación del 29%.
- Regla: si la moneda del listing es USD (`$us`, `USD`, `$`), `precio_usd` = ese número exacto. NUNCA multiplicar.
- Solo convertir si el precio original es en BOB y hay TC explícito.

**3. "TC 7" = oficial (no paralelo):**
- TC oficial = 6.96 (fijo por BCB). "TC 7" es el oficial redondeado a 7 por conveniencia.
- TC paralelo = fluctúa diariamente según Binance P2P (significativamente mayor al oficial)
- La diferencia clave: TC 7/oficial es **fijo** (no cambia), paralelo **fluctúa**
- Si dice "precio $us X a TC 7" → `tipo_cambio_detectado = 'oficial'`
- Si dice "precio $us X al paralelo del día" → `tipo_cambio_detectado = 'paralelo'`
- La diferencia 230.000 × 7 / 6.96 = 231.322 — es redondeo del oficial, no inflación CASO 2

**4. Impacto real:**
- `paralelo` afecta `precio_normalizado()`: ajusta el precio para comparaciones de mercado
- `oficial` y `no_especificado` tienen CERO diferencia en queries — es solo metadata de higiene

---

## 5. plan_pagos — El campo con mayor gap (regex 0%, LLM ~60%)

### Señales detectables
- "Plan de pagos", "financiamiento directo", "facilidades de pago"
- "Reserva + cuotas", "30% anticipo + saldo"
- "Pago al contado", "pago en dólares" → contado
- "Cuotas mensuales de $X"
- "Precio al contado $X / Precio financiado $Y"

### Estructura sugerida para extracción
```json
{
  "tiene_plan_pagos": true/false,
  "tipo": "contado" | "financiamiento_directo" | "bancario" | "mixto",
  "detalle_texto": "30% anticipo + 36 cuotas sin interés",
  "moneda_pago": "USD" | "BOB" | "ambos"
}
```

---

## 6. Lecciones generales para el prompt LLM

### Descripción genérica vs específica
- Muchos brokers C21 copian la misma descripción para múltiples unidades del mismo proyecto
- Si la descripción NO menciona piso específico, unidad específica, ni detalles únicos → probablemente es template genérico
- Templates genéricos son menos confiables para inferir estado_construccion

### Proyectos con múltiples estados
Un proyecto puede tener simultáneamente:
- Unidades en preventa (pisos altos aún no terminados)
- Unidades entrega inmediata (pisos bajos ya entregados)
- Unidades a estrenar (terminadas pero sin amueblar)

→ No asignar estado por proyecto, sino por unidad individual.

### Confianza de inferencia
El LLM debe devolver un nivel de confianza para cada campo:
- `alta`: keyword explícito ("entrega inmediata", "incluye parqueo")
- `media`: inferencia contextual ("amoblado + piso específico + precio USD")
- `baja`: inferencia indirecta ("precios al cambio Bs.7" → probablemente preventa)
- `sin_datos`: no hay información suficiente → dejar null/no_especificado

### Nunca inventar
- Si la descripción no da información suficiente, devolver null/no_especificado
- Preferible dejar vacío que adivinar mal
- El regex actual inventa (Pet Friendly sin evidencia, Sauna sin mención) → el LLM NO debe hacer esto
