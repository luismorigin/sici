# Equipetrol Baseline — Narrativa editorial

> Copy del reporte público. Los valores entre {{llaves}} son placeholders que el
> generator rellena con números reales desde las tools. Los textos de tesis son
> específicos de esta edición — en ediciones futuras se reescriben si el hallazgo
> editorial cambia.

---

## hero.eyebrow
Simón · Inteligencia Inmobiliaria · Santa Cruz, Bolivia

## hero.title
{{zonaLabel}}.<br>Baseline de Inventario y Precios.

## hero.subtitle
Una radiografía del mercado portal-observable de departamentos en los {{zonasCount}} submercados de {{zonaLabel}} al {{fechaCorte}}. Primera edición de una serie trimestral.

## hero.foot
**{{edicion}}** · Edición 01

## hero.foot_right
16 páginas · Tiempo de lectura ~12 min

---

## s1.lead
{{zonaLabel}} no se comporta como una zona. Se comporta como {{zonasCount}} submercados con dinámicas divergentes que, agregados, producen promedios que esconden más de lo que revelan. Esta edición ofrece la lectura desagregada.

## s1.tesis_1.title
Tesis 1 — La antigüedad del listado es dual por producto, no por zona

## s1.tesis_1.quote
La antigüedad del listado corta más fuerte por tipo de unidad que por zona.

## s1.tesis_1.body
Los segmentos de 1 dormitorio en {{tesis1_zonas_rapidas}} muestran antigüedad mediana de {{tesis1_dias_min}} a {{tesis1_dias_max}} días de listado publicado. Los segmentos de 2 y 3 dormitorios en {{tesis1_zonas_lentas}} superan los {{tesis1_dias_largos}} días, con casos que escalan a {{tesis1_dias_extremo}} días. Esto no mide velocidad de venta (ver §2) — sí indica que <strong>hay productos donde los listings se renuevan mucho más seguido que otros</strong>, y que esa variable corta más fuerte por tipo de unidad que por zona.

## s1.tesis_2.title
Tesis 2 — La fase de delivery domina, pero Sirari es la excepción

## s1.tesis_2.quote
Sirari es el único submercado donde preventa supera a entrega inmediata.

## s1.tesis_2.body
El {{tesis2_pct_entrega}}% del inventario activo está en entrega inmediata, {{tesis2_pct_preventa}}% en preventa. El mix no es parejo entre zonas: <strong>Sirari concentra la mayor proporción de preventa ({{tesis2_sirari_pct}}% de sus {{tesis2_sirari_uds}} unidades) y es el único submercado donde preventa supera a entrega</strong>. {{tesis2_otras_zonas_entrega}}. Es una foto de un ciclo donde el pipeline de construcción de los últimos 24 meses está aterrizando en la mayoría de {{zonaLabel}}, mientras Sirari todavía construye.

## s1.tesis_3.title
Tesis 3 — Hay dos {{zonaLabel}}es en precio

## s1.tesis_3.quote
La variabilidad intrazonal es mayor que la interzonal.

## s1.tesis_3.body
Precio mediano por metro cuadrado entre submercados va de USD {{tesis3_m2_min}} ({{tesis3_zona_min}}) a USD {{tesis3_m2_max}} ({{tesis3_zona_max}}) — un rango del {{tesis3_rango_pct}}%. Pero la desviación dentro de cada submercado (P25 a P75) llega al 30-48% en segmentos de 2 y 3 dormitorios. La variabilidad intrazonal es mayor que la interzonal. Comprar por zona sin leer producto es una estrategia de precio ciega.

## s1.caveat
Esta edición no presenta tasas de absorción, meses de inventario, yields ni proyecciones de precio. La razón está explicada en la sección 9. La primera serie de absorción publicable se incorporará en la edición de julio 2026.

---

## s2.universo_p1
El universo de este reporte son los <strong>listings activos</strong> de departamentos publicados en los portales <strong>Century21 Bolivia</strong> y <strong>Remax Bolivia</strong> con GPS dentro de los polígonos de los {{zonasCount}} submercados de {{zonaLabel}}. A esta fecha, el corpus contiene {{totalVenta}} unidades de venta y {{totalAlquiler}} unidades de alquiler.

## s2.universo_p2
La composición por fuente es: {{fuentesComposicion}}. <strong>Este reporte no incluye</strong> venta directa de desarrolladora fuera de portal, referidos privados, redes sociales ni Facebook Marketplace. La porción del mercado primario capturable vía portal es inherentemente parcial.

## s2.filtros_intro
Cada unidad que entra a los análisis de esta edición pasó los siguientes filtros:

## s2.filtros_list
- Propiedad activa: <code>status ∈ (completado, actualizado)</code>
- Sin duplicados: <code>duplicado_de IS NULL</code>
- Tipología depto: excluye parqueo, baulera, garaje, depósito
- Área mínima 20 m² (filtro secundario contra parqueos mal clasificados)
- Sin multiproyectos (una misma unidad no se cuenta dos veces)
- Antigüedad del listado: ≤300 días para entrega inmediata, ≤730 para preventa (venta); ≤150 días (alquiler)

## s2.inventario_estancado
El último filtro es una decisión editorial deliberada: esta edición reporta la oferta que un comprador típico ve hoy navegando portales. Al corte del {{fechaCorte}}, <strong>{{inventarioEstancado}} listings (~{{inventarioEstancadoPct}}% del corpus portal-observable de {{zonaLabel}})</strong> son avisos con antigüedad superior al corte — inventario estancado que lleva más de 300 días publicado sin aparente movimiento. <strong>No entran en los agregados de este reporte.</strong>
<br><br>
Esto mantiene paridad con lo que el lector ve en la landing pública de Simón y en los portales de origen. Los estudios de mercado privados que Simón produce por encargo a desarrolladoras sí incluyen el corpus completo (incluyendo listings >300 días), porque el cliente pagante evalúa su posición competitiva considerando el inventario estancado como señal de mercado. Son dos lentes editoriales distintos para dos lectores distintos.

## s2.tc_intro
En Bolivia coexisten dos tipos de cambio, y eso obliga a una decisión metodológica sin la cual las comparaciones de precio son inválidas.

## s2.tc_nota
<strong>Nota:</strong> el TC paralelo no es un número estático. SICI lo captura diariamente desde Binance P2P y lo aplica al cálculo correspondiente a cada fecha. El valor mostrado arriba corresponde al último snapshot disponible al corte de esta edición.

## s2.tc_explicacion_p1
Muchos brokers y desarrolladoras en {{zonaLabel}} publican precios en <strong>dólares al tipo de cambio paralelo</strong> (también llamado "dólar billete", "dólar al cambio libre" o "dólar físico"). Otros publican en <strong>dólares al oficial</strong>. El portal no siempre lo explicita, y el comprador tampoco siempre lo detecta.

## s2.tc_explicacion_p2
<strong>El precio normalizado lleva todos los precios a una misma base: dólares equivalentes al tipo de cambio oficial.</strong> Es la única forma de comparar listings publicados en bases cambiarias distintas sin distorsión.

## s2.tc_ejemplo_nota
Cálculo del Depto B: 150,000 × {{tcParalelo}} ÷ {{tcOficial}} = ${{tcEjemploCalculo}}. Los dos listings muestran el mismo "USD 150,000" en el anuncio, pero representan precios reales distintos — una diferencia del {{tcSpread}}% que un comprador desinformado absorbe al cerrar la operación.

## s2.tc_cierre
<strong>Todos los precios en USD de este reporte (tickets, medianas, P25/P75, $/m²) son precios normalizados.</strong> Cuando el reporte dice "mediana USD 105,000 para 1D en Equipetrol Centro", significa que esa es la mediana en dólares al oficial equivalente — ya sean listings originalmente al oficial o al paralelo, todos llevados a la misma base.

## s2.tc_no_es
No es el precio de cierre (la brecha típica publicación→cierre es 5-15% adicional en venta). No es una valuación de la propiedad. No es el monto exacto en efectivo que recibe el vendedor. Es, estrictamente, una unidad de comparación entre listings con bases cambiarias distintas.

## s2.antiguedad_intro
Esta es una distinción que el mercado inmobiliario confunde con frecuencia, y que cualquier análisis serio debe presentar con precisión.

## s2.antiguedad_body
SICI solo puede observar lo primero. La propiedad pudo haber estado antes en otra agencia, el broker puede haber <strong>borrado y republicado</strong> el aviso reiniciando el contador, o pudo haberse ofrecido por vías no-portal (Facebook, WhatsApp, referido vecinal). Nada de esto entra en nuestra data.

## s2.antiguedad_consecuencia
<strong>Consecuencia fiduciaria:</strong> todo número de antigüedad del listado que aparece en este reporte es un <em>piso</em> del tiempo real en venta. Una mediana de "35 días" significa que el dueño lleva al menos 35 días intentando vender — puede ser más, rara vez menos. Interpretarlo como "velocidad de venta" o "liquidez del mercado" sobreestima lo que la data soporta.

## s2.fechas_corte
Inventario, precios y antigüedad del listado: corte al <strong>{{fechaCorte}}</strong>. El tipo de cambio paralelo usado para la normalización corresponde al snapshot de Binance P2P del {{fechaCorteTCParalelo}} ({{tcParalelo}} Bs/USD), última captura disponible antes del corte. Las series históricas (cuando se utilicen en ediciones futuras) tendrán cortes metodológicos declarados.

---

## s3.nota_estado
La diferencia con {{totalVenta}} corresponde a unidades con estado nulo. El predominio de entrega inmediata ({{pctEntrega}}%) sobre preventa ({{pctPreventa}}%) sugiere un mercado en fase de delivery dominante, no de lanzamientos nuevos.

---

## s4.lead
{{zonaLabel}} se divide en {{zonasCount}} submercados geográficos distintos. Cada uno tiene un perfil de producto, un rango de precio y un patrón de antigüedad del listado propios. Agregar los {{zonasCount}} en un solo promedio produce un número que no describe a ninguno.

## s4.tabla_nota
\* Mediana de antigüedad del listado (1 dormitorio): días desde que este aviso fue publicado en el portal hasta la fecha de corte. No es velocidad de venta ni tiempo total en el mercado real — ver §2.

## s4.excluidos
Equipetrol 3er Anillo aparece con pocas unidades en el corpus. El tamaño es estadísticamente insuficiente para reportar como submercado propio. Se excluye de las tablas comparativas y de los agregados zonales.

### Perfiles por submercado (para §4 lectura)

## s4.perfil.Equipetrol Centro
Con {{uds}} unidades, es el corazón del mercado en volumen. Mix entrega/preventa de {{pctEntrega}}/{{pctPreventa}}% (resto nuevo o no especificado). Ticket mediano USD {{medianaTicket}}. Concentra proyectos de desarrolladoras grandes y medianas. La antigüedad mediana del listado en 1D y 2D es relativamente alta ({{dias1D}} y {{dias2D}} días), señal de que los avisos en este segmento tienden a renovarse con menos frecuencia.

## s4.perfil.Sirari
La segunda zona por volumen ({{uds}} unidades) y la de mayor peso de preventa: {{preventaUds}} de {{uds}} unidades ({{pctPreventa}}%) están en construcción — el único submercado donde preventa supera a entrega. Ticket mediano USD {{medianaTicket}}. Antigüedad mediana del listado baja tanto en 1D como en 2D ({{dias1D}} y {{dias2D}} días), indicando avisos relativamente recientes. Posicionamiento premium con desarrolladoras establecidas.

## s4.perfil.Villa Brigida
$/m² más bajo del conjunto (USD {{medianaM2}} mediano). {{uds}} unidades con {{pctEntrega}}% en entrega. Es la puerta de entrada de precio a {{zonaLabel}}. Los segmentos con dormitorios muestran antigüedad del listado alta ({{dias1D}}, {{dias2D}} y {{dias3D}} días medianas para 1D, 2D y 3D) — los avisos llevan más tiempo publicados en promedio que en otros submercados.

## s4.perfil.Equipetrol Oeste
{{uds}} unidades, mix {{pctEntrega}}/{{pctPreventa}}% entrega/preventa. Submercado mixto con demanda heterogénea (premium y universitaria conviven). $/m² USD {{medianaM2}} — posición intermedia. Unidades de 2 dormitorios con tamaño mediano entre los más grandes del conjunto.

## s4.perfil.Equipetrol Norte
Solo {{uds}} unidades — el inventario más chico. $/m² mediano USD {{medianaM2}}, el más alto del conjunto. Ticket mediano USD {{medianaTicket}}. Antigüedad mediana del listado en 1D es {{dias1D}} días, la más baja del conjunto. Perfil de zona financiera con inventario acotado y avisos relativamente recientes.

---

## s5.tamano_nota
Cada zona revela su estrategia de posicionamiento por el tamaño de producto que construye. Observar las columnas 1D y 3D permite distinguir entre zonas que polarizan producto (compacto chico + amplio grande) y zonas que convergen (tamaños intermedios en ambos extremos).

## s5.dias_subtitle
No mide velocidad de venta ni tiempo real en el mercado — mide antigüedad del listado publicado. Ver §2.

## s5.mix_lectura
Sirari es el único submercado donde preventa supera claramente a entrega. Los otros están en fase de delivery dominante. Leído desde el pipeline: Sirari es donde más construcción está en curso hoy; los demás ya lo hicieron.

---

## s6.lead
Las tablas de esta sección presentan medianas y rangos intercuartiles (P25 a P75) solo para segmentos donde el tamaño de muestra permite una lectura robusta. Los segmentos con n < 20 se reportan al nivel de agregación inmediatamente superior o se omiten.

## s6.tabla_nota
\* Filas con n < 20. Se reportan con valores atenuados para indicar muestra marginal. Interpretar con cautela; no extrapolar tendencias.

## s6.lectura_p1
El rango intercuartílico en segmentos grandes (2D y 3D del core del mercado) puede llegar al 48% dentro del mismo producto en la misma zona. La dispersión refleja factores que no resuelven en un promedio: año de construcción, nivel de terminaciones, amenidades del edificio, piso y orientación.

## s6.lectura_p2
En $/m², la paradoja del mercado es que zonas con inventario chico pueden publicar el precio por metro más alto. Monoambientes en zonas core suelen ser caros por metro pero accesibles por ticket absoluto. La lectura correcta combina ambas métricas, nunca una sola.

---

## s7.lead
Esta sección presenta los proyectos individuales con mayor volumen de unidades activas en portales. No es un ranking de calidad ni una recomendación: es la foto de concentración del lado de la oferta.

## s7.tabla_nota
"No esp." indica estado de construcción sin declarar en el listado del portal — la unidad existe y es vigente, el dato de fase es el ausente.

## s7.concentracion_intro
Agregando múltiples proyectos de la misma desarrolladora entre los top listados:

## s7.concentracion_cierre
El top de proyectos representa {{totalTopUnidades}} unidades — el {{pctTopSobreTotal}}% del inventario total de venta en {{zonaLabel}}. La concentración del lado de la oferta es moderada: ninguna desarrolladora individual controla más del {{pctMaxDesarrolladora}}% del total del mercado.

---

## s8.lead
El mercado de alquiler de {{zonaLabel}} es considerablemente más chico en listings observables ({{totalAlquiler}} unidades vs {{totalVenta}} de venta). La lectura que sigue se hace con esa limitación declarada, y con un segundo caveat sobre el dato de amoblado que requiere atención.

## s8.rentas_nota
\* n < 20. Lectura marginal, reportar con cuidado. Solo las zonas con muestra ≥20 soportan comparaciones robustas. El resto se presenta para completitud del panorama.

## s8.caveat_amoblado
Los listings de alquiler no declaran consistentemente si el departamento es amoblado. Del total del corpus, {{pctAmoblado}}% declara amoblado, {{pctSinDeclarar}}% no declara nada, {{pctNoAmoblado}}% declara no amoblado, {{pctSemi}}% semi. Mezclar los tres en un promedio produce un número que no representa ningún segmento.

## s8.anomalia_p1
En 1 dormitorio, la renta mediana de listings que declaran "amoblado" (USD {{renta1DAmoblado}}) es <strong>menor</strong> que la de listings que declaran "no amoblado" (USD {{renta1DNoAmoblado}}). Es contraintuitivo. Dos hipótesis plausibles: (i) el segmento amoblado captura una subcategoría de producto más chico o de menor terminación no capturada en el filtro, (ii) la declaración "amoblado" en portales es inconsistente y mezcla semi-amoblados o equipamiento mínimo.

## s8.anomalia_p2
En 2 dormitorios, las tres categorías (amoblado USD {{renta2DAmoblado}} / no amoblado USD {{renta2DNoAmoblado}} / sin declarar USD {{renta2DSinDeclarar}}) son estadísticamente cercanas — sugiere que en tickets más altos la declaración del estado amoblado pesa menos en el precio que otras variables (ubicación específica, piso, terminaciones).

## s8.anomalia_cierre
Para un inversionista interesado en renta, la conclusión operativa es: <strong>no usar los promedios de renta publicados de esta edición para calcular yield</strong>. Usar la tabla desagregada solo como referencia directa del segmento amoblado que mejor coincida con el producto evaluado, y siempre aplicar descuento típico de cierre (10-20% por debajo de publicado).

---

## s9.lead
Un analista serio exhibe sus límites. Esta sección lista las métricas que un lector podría esperar en un reporte de mercado inmobiliario, y por qué esta edición no las presenta.

## s9.no_presentamos
[
  {"titulo": "Tasa de absorción / Meses de inventario", "cuerpo": "La serie diaria de absorción disponible cambió de metodología el 14 de abril de 2026. La nueva serie (filter_version 3) tiene pocos días. Una métrica de absorción publicada requiere al menos 90 días de serie estable. Se incorporará en la edición de julio 2026."},
  {"titulo": "Yield / Cap rate / Retorno de inversión", "cuerpo": "Calcular retorno requiere precios de cierre (no tenemos), rentas efectivas (no tenemos) y vacancia medida (no tenemos). El ratio entre precios publicados de venta y rentas publicadas es un indicador bruto con doble incertidumbre. No lo presentamos como retorno para no legitimar interpretaciones que los datos no sostienen."},
  {"titulo": "Tasa de vacancia", "cuerpo": "Cero datos empíricos de vacancia en {{zonaLabel}}. Cualquier número publicado sería conjetura. Lo declaramos explícitamente."},
  {"titulo": "Apreciación / Proyección de precios", "cuerpo": "SICI tiene menos de 3 meses de serie longitudinal de precios comparable. Proyectar apreciación con esa ventana es inválido. La primera serie año-sobre-año publicable será en enero 2027."},
  {"titulo": "Precio de cierre real", "cuerpo": "Todo lo reportado son precios de publicación. La brecha típica entre publicación y cierre es 5-15% en venta y 10-20% en alquiler. Lo declaramos consistentemente a lo largo del documento."},
  {"titulo": "Ranking de 'mejores zonas para invertir'", "cuerpo": "Un ranking de inversión requiere tesis de retorno. Sin retorno calculable (ver arriba), un ranking sería sugerir una conclusión que la data no sostiene. No publicamos rankings editoriales de zonas."}
]

## s9.agenda
[
  {"edicion": "02", "fecha": "Julio 2026", "incorpora": "Primera serie de absorción publicable (filter_version 3 con 90+ días). Capítulo de rotación observada por submercado."},
  {"edicion": "03", "fecha": "Octubre 2026", "incorpora": "Separación completa amoblado / no amoblado en alquiler. Lectura limpia de rentas. Primera estimación de spread venta-alquiler por submercado."},
  {"edicion": "04", "fecha": "Enero 2027", "incorpora": "Primera serie longitudinal de precios año-sobre-año. Capítulo de dinámica 2026 completo. Comparativa trimestre a trimestre."}
]

## s9.agenda_nota
El ritmo de incorporación no es comercial: es el tiempo real que necesita la infraestructura de captura y limpieza para generar cada nivel de profundidad.

---

## s10.ficha
[
  {"label": "Reporte", "valor": "{{zonaLabel}} — Baseline de Inventario y Precios"},
  {"label": "Edición", "valor": "{{edicion}}"},
  {"label": "Fecha de corte", "valor": "{{fechaCorte}}"},
  {"label": "Universo observable", "valor": "{{universoObservable}}"},
  {"label": "Tamaño de corpus", "valor": "{{totalVenta}} unidades en venta · {{totalAlquiler}} unidades en alquiler"},
  {"label": "Fuente de datos", "valor": "{{fuenteDatos}}"},
  {"label": "Próxima edición", "valor": "{{proximaEdicion}}"}
]

## footer.firma
Simón · Inteligencia Inmobiliaria

## footer.body
Santa Cruz de la Sierra, Bolivia. Este reporte es de distribución libre. Para consultas, estudios específicos por proyecto o acceso a metodología ampliada: <strong>simonbo.com</strong> · contacto directo por WhatsApp.

## footer.disclaimer
Documento generado a partir del corpus de SICI al {{fechaCorte}}. Los datos presentados son precios de publicación normalizados. Ninguna sección debe interpretarse como recomendación de inversión o valuación de propiedad específica.
