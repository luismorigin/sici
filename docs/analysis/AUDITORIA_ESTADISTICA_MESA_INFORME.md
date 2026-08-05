# Auditoría estadística de la Mesa de Guerra y el Informe — framework Decision Intelligence

**Fecha:** 4 de agosto de 2026
**Disparador:** preguntas del founder sobre qué significa "días en mercado", si faltan tipologías/entregas/alquileres en la Mesa, la preocupación por parqueo/baulera/amoblado embebidos en los precios, y si las afirmaciones son estadísticamente correctas.
**Método:** cada métrica se auditó leyendo la definición REAL en la vista (`pg_get_viewdef` de `v_mercado_venta_shadow`), no de memoria.

---

## 0. El framework: Decision Intelligence

La pregunta correcta nunca es "¿este número es exacto?" sino **"¿qué decisión alimenta este número, y puede llevar a esa decisión por el camino equivocado?"**. Un dato con error del 10% puede ser perfecto para una decisión (elegir zona) y peligroso para otra (fijar el precio de lista de una unidad). Toda esta auditoría clasifica cada métrica por la decisión que soporta:

| Decisión del cliente | Tolerancia al error | Métricas que la alimentan |
|---|---|---|
| ¿En qué zona compro suelo? | Alta (comparación relativa) | precio por zona, velocidad relativa, concentración |
| ¿Qué mix construyo? | Media | composición por tipología, rangos |
| ¿A qué precio listo? | **Baja** (números absolutos) | rangos p25-p75, comparador |
| ¿Cuándo lanzo / a qué ritmo? | Media | salidas, shock de oferta, serie |
| ¿Con quién distribuyo? | Alta | mapa del canal |

---

## 1. Respuestas directas a las preguntas del founder

### 1.1 ¿Qué es exactamente "X días en el mercado" en la ficha de un edificio?

**Definición real (verificada en la vista):** para cada aviso activo, `dias = HOY − fecha_publicacion` (la fecha que declara el portal; en Equipetrol shadow la cobertura es 100%, sin proxy). La ficha del edificio muestra la **MEDIANA** de sus avisos activos — mediana, no promedio, a propósito: un aviso zombie de 290 días no arrastra el número.

**Las tres trampas estadísticas de este número (ninguna estaba declarada en la Mesa):**

1. **Es la edad del stock, no el tiempo de venta (censura).** Medimos cuán viejo es lo que SIGUE publicado, no cuánto tardó en salir lo que salió. Son cosas distintas: técnicamente es una muestra censurada por la derecha, y además con sesgo de longitud (en una foto del stock, los avisos longevos están sobre-representados).
2. **La fecha la pone el portal.** Si el captador re-publica el aviso, el contador vuelve a cero. Caso concreto detectado: **Rhodium muestra "12 días" con 16 unidades activas** — eso huele a re-publicación en bloque del desarrollador/agencia, no a un edificio que vende en 12 días. La ficha debería advertir cuando un edificio tiene muchos avisos y edad sospechosamente baja y uniforme.
3. **Truncamiento del feed.** La vista corta a 300 días (730 preventa): lo ultra-estancado desaparece de la foto → la edad mediana del stock se ve más joven de lo que es.

**Veredicto DI:** el número **sirve para comparar zonas y edificios entre sí** (las tres trampas pegan parecido en todos lados) y **no sirve como "tiempo esperado de venta"**. Corrección editorial: renombrar a **"antigüedad mediana de la oferta activa"** y nunca decir "rota en X días".

### 1.2 El claim más débil de todo el paquete: "dentro del rango rota en 69 días, sobre el rango 83"

Mismo defecto, agravado: comparamos **edades de avisos vivos** entre grupos de precio. Hay dos explicaciones compatibles con el mismo número:

- (a) La que afirmamos: lo bien priceado sale más rápido.
- (b) La alternativa que NO descartamos: **con el mercado cayendo −15% en USD, un aviso viejo que no actualizó su precio queda "sobre el rango" automáticamente**. El aviso no se estancó por caro — quedó caro por viejo. La flecha causal apunta al revés.

Con una serie bajando 15%, la explicación (b) es muy plausible y probablemente conviven ambas. **Reformulación honesta:** "los avisos fuera del rango son, en mediana, más viejos — sea porque no rotan o porque quedaron desactualizados frente a un mercado que bajó; ambas lecturas le dicen lo mismo al vendedor: revisar el precio". La versión estadísticamente correcta requiere **análisis de supervivencia (Kaplan-Meier)** usando las salidas como evento — y el motor YA guarda `fecha_inactivacion`, así que con 2-3 meses de acumulación se puede hacer bien. Es el upgrade estadístico #1 del roadmap.

### 1.3 Tipologías en la ficha y entregas de preventa — SÍ, y la data ya existe

- **Tipologías por edificio:** cada aviso tiene `dormitorios` → la ficha puede mostrar "3 monos · 8×1D · 5×2D". Regla fiduciaria: con n<3 por celda se muestran **conteos, no medianas** (una mediana de 2 avisos es ruido con disfraz de dato).
- **Entregas de preventa:** `fecha_entrega` está capturada en **65 de los 100 avisos preventa** de Equipetrol ("Septiembre 2026" ×17, "Diciembre 2026" ×12, "Junio 2027" ×6, "Marzo 2028" ×5…). Y al verificarla apareció un hallazgo gratis: **hay avisos en preventa con entrega declarada YA VENCIDA** (dic-2025, ene/feb/may-2026). Eso significa: o el edificio se entregó y el aviso quedó desactualizado, o hay atraso de obra. **Ambas cosas le importan muchísimo a una desarrolladora** (benchmark de atrasos de la competencia + calidad de actualización del canal). Capa nueva propuesta para la Mesa: "⏳ Preventa y entregas" — timeline de qué se entrega cuándo, con los vencidos marcados como "declara entrega vencida: atraso o aviso desactualizado" (declarado, nunca afirmado).

### 1.4 Parqueo, baulera, amenidades y amoblado DENTRO del precio — la preocupación más estructural, y es correcta

El problema real no son las amenidades como atributo: es que **`precio_m2 = precio ÷ area_total_m2` compara precios que incluyen cosas distintas**:

- **Parqueo:** 131 avisos lo declaran incluido, 88 no incluido, **183 (46%) no dicen nada**. Un parqueo vale ~$8.000-15.000; en un monoambiente de $69.000 eso es hasta ~15-20% del precio. El $/m² de un mono con parqueo incluido NO es comparable con uno sin.
- **Baulera:** mismo problema, menos plata.
- **area_total_m2 es auto-declarada:** a veces incluye balcón/terraza, a veces no → ruido en el DENOMINADOR además del numerador.
- **Amoblado en venta:** casi nunca declarado → un depto que se vende amoblado lleva $5-10k de muebles invisibles dentro del precio.

**Consecuencia estadística precisa:** los rangos p25-p75 son más ANCHOS de lo que el mercado real es — parte de la "dispersión de precios" es en realidad heterogeneidad de qué incluye el precio. Las **MEDIANAS por zona/tipología sobreviven bien** (el error de bundling es aproximadamente simétrico y la mediana es robusta), pero las **comparaciones finas absorben ese ruido**: edificio vs edificio con pocos avisos, y los contrastes de atributos (el +5,8% del aire acondicionado, n=61 vs 94, **no tiene test de significancia** — puede ser real o ruido; mantener la palabra "se asocia" y agregarle "indicativo").

- Otro matiz que el informe hoy no hace: **parte del premium del monoambiente (+16% $/m²) puede ser bundling** — parqueo/equipamiento pesan proporcionalmente más en un ticket chico. La dirección del hallazgo es robusta; el tamaño exacto, no.

**Qué hacer:** (1) declarar en Mesa e informe que el $/m² es "el precio pedido tal como se publica, incluya lo que incluya"; (2) publicar como sensibilidad el rango solo-con-parqueo-declarado; (3) regla editorial: **contraste sin test estadístico → se llama "indicativo"**, sin excepciones.

### 1.5 ¿Falta una sección/capa de alquileres? — SÍ

189 avisos de alquiler shadow con GPS y edificio matcheado. Capa "🏠 Alquiler" viable hoy: dónde hay oferta de renta y a qué Bs mediano por edificio. El cruce más valioso ya existe en el feed (señal "hay alquiler activo" = edificio entregado, 95% de acierto) y habilita **yield por edificio** — pero solo con n≥3 en AMBOS lados (venta y alquiler del mismo edificio); si no, "sin base". El yield por tipología actual queda como está (vara comparativa, bruto, declarado) con una mejora: poner "bruto, antes de expensas/vacancia" al lado del número, no solo en el disclaimer.

---

## 2. Auditoría claim por claim

| Claim | Veredicto | Por qué |
|---|---|---|
| Serie −15% USD / −5,6% Bs | **SÓLIDO con matiz** | Misma tipología toda la serie (bien), error ±7% declarado. Matiz: la canasta de edificios cambia mes a mes (composición). La DIRECCIÓN es robusta (cae monotónico 7 meses en ambas monedas); el nivel puntual, no. |
| Mono +16% $/m² vs 3D | **SÓLIDO con matiz** | n grande y diferencia grande. Matiz: parte puede ser bundling (parqueo pesa más en ticket chico). |
| Preventa −2,9% vs entrega | **DÉBIL, bien declarado** | Composición de edificios distinta + pozo real ausente de portales + estado inferido tiene 3-5% de error. Mantener solo como "la preventa PUBLICADA no muestra descuento". |
| Dentro del rango 69 días vs 83 | **REFORMULAR** | Edades censuradas + deriva de precios genera el mismo patrón sin que "lo barato rote". Ver §1.2. Es el único claim que afirma más de lo que el diseño muestral permite. |
| "Inventario se renueva cada ~5-6 meses" | **DÉBIL** | Extrapolación de UN mes de flujo; julio pudo ser atípico (limpieza acumulada del verificador). Bajar a: "en julio salió el ~18% del stock". |
| Shock de oferta +47% | **SÓLIDO como orden de magnitud** | Aritmética correcta, pero stock = avisos (≠ unidades únicas por dedup imperfecto) y la oferta real incluye salas de venta que no publican. Decir "orden de magnitud". |
| Canal: 59 oficinas, ninguna >9% | **SÓLIDO** | Es un censo de lo publicado, no una muestra. |
| Amenidades no discriminan / trampa de composición | **SÓLIDO como asociación** | El control por tipología es correcto; falta test formal — el lenguaje actual ("≈0") es defendible. |
| Altura +15% | **INDICATIVO** | n=47 en 10º+, sin controlar por edificio: altura y torre-premium vienen juntas (confusión). Reformular: "los pisos altos piden +15% — altura y edificio premium vienen juntos; este dato no los separa". |
| Aire acondicionado +5,8% (1D) | **INDICATIVO** | Sin test de significancia; posible proxy de edificio nuevo/equipado. Ya está como "se asocia"; agregar "indicativo". |

---

## 3. Los sesgos de fondo (que ningún claim individual muestra)

1. **Universo = oferta publicada en portales.** La venta directa de desarrollador (la mayor parte del pozo real) y el dueño-directo no están. Para una desarrolladora es EL sesgo más importante: su competencia real incluye salas de venta que no publican. Se declara en §Metodología pero merece más jerarquía.
2. **Dedup imperfecto cross-agencia.** El mismo depto con 3 agencias y URLs distintas puede contar 2-3 veces → n inflado y medianas sesgadas hacia lo multi-listado (que suele ser justamente lo difícil de vender). El detector de duplicados existe; su tasa de escape no está medida.
3. **No-independencia.** Los 22 avisos de Maré no son 22 observaciones independientes (mismo edificio, mismos captadores, precios ancla). El n efectivo es menor al nominal → cualquier test formal debe clusterizar por edificio.
4. **Serie corta.** 7 meses no permiten separar tendencia de estacionalidad (¿julio siempre es lento?). Se resuelve solo con tiempo.
5. **Volatilidad de foto.** El conteo "402 activos" varió a 400 entre dos queries de la misma sesión — la foto nocturna se mueve ±0,5%. Irrelevante para decisiones, relevante para no prometer números exactos reproducibles.

---

## 4. Roadmap estadístico (en orden de retorno)

1. **Kaplan-Meier de tiempo-a-salida** con `fecha_inactivacion` como evento (2-3 meses de acumulación bastan) → reemplaza "días en mercado" por la métrica correcta y única en el país: curva de supervivencia por zona/tipología/posición de precio.
2. **Índice repeat-listing:** el motor ya guarda el historial de cambios de precio del MISMO aviso → un índice tipo repeat-sales (con re-listados en vez de re-ventas) elimina el sesgo de composición de la serie. Nadie en Bolivia puede construirlo sin este historial.
3. **Sensibilidad de bundling:** publicar $/m² con y sin parqueo declarado; empujar la cobertura de `parqueo_incluido` (hoy 54%).
4. **Tests formales:** Mann-Whitney + IC bootstrap clusterizado por edificio para todo contraste de atributos; regla editorial "sin test → 'indicativo'".
5. **Features con data ya capturada:** tipologías en ficha de edificio · capa preventa/entregas (con vencidos marcados) · capa alquiler + yield por edificio (n≥3 ambos lados).

---

## 5. Lo que está bien y hay que proteger

Medianas en vez de promedios · n declarado en cada cifra · números débiles omitidos y DICHO (Eq. 3er Anillo) · trampa de composición mostrada a propósito · "salida ≠ venta" en la leyenda misma · serie en dos monedas · rangos en vez de puntos · límites metodológicos con página propia. **La cultura de declarar el hueco es el activo del producto — esta auditoría existe porque esa cultura se aplicó a sí misma.**
