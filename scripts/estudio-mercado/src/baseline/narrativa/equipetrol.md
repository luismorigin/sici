# Equipetrol Baseline — Narrativa editorial

> Copy del reporte público. Los valores entre {{llaves}} son placeholders que el
> generator rellena con números reales desde las tools. Los textos de tesis son
> específicos de esta edición — en ediciones futuras se reescriben si el hallazgo
> editorial cambia.

---

## hero.eyebrow
Análisis trimestral para desarrolladoras e inversores · Santa Cruz, Bolivia

## hero.title
{{zonaLabel}} no es una zona.<br>Son {{zonasCount}}.

## hero.subtitle
{{totalVenta}} listings de venta y {{totalAlquiler}} de alquiler portal-observables en {{zonaLabel}} al {{fechaCorte}}, desagregados por submercado, tipología, fase de obra y antigüedad. Primera edición de una serie trimestral.

## hero.foot
**{{edicion}}** · Edición 01

## hero.foot_right
16 páginas · Tiempo de lectura ~12 min

---

## s1.reader_note_title
Cómo leer este reporte

## s1.reader_note_body
Los números que siguen describen el <strong>inventario portal-observable</strong> — lo que está publicado en Century21 y Remax al {{fechaCorte}}. No es todo el mercado: una desarrolladora puede publicar solo parte de su inventario en portal (estrategia comercial), y hay ventas directas que nunca llegan al portal. Lo que este reporte captura con rigor es la <strong>vidriera pública</strong> — la oferta que un comprador ve cuando busca. Lo que no captura: inventario off-portal, velocidad real de venta, acuerdos directos entre desarrolladora y comprador. Para análisis exhaustivo de un proyecto específico (con data off-portal incluida), ver sección final — Simón hace estudios privados por encargo.

## s1.lead
Tres cosas del mercado de {{zonaLabel}} que al juntar todo en un promedio desaparecen. Salen de cruzar los {{totalVenta}} listings activos de venta al {{fechaCorte}} — no son opinión, es lo que los portales muestran cuando se los mira desagregados.

## s1.tesis_1.title
Los departamentos chicos se renuevan al doble de velocidad que los grandes.

## s1.tesis_1.quote
Elegís producto, no zona.

## s1.tesis_1.body
Los números son directos. Un 1 dormitorio típico en {{tesis1_zonas_rapidas}} lleva entre {{tesis1_dias_min}} y {{tesis1_dias_max}} días publicado en el portal. Un 2 o 3 dormitorios en {{tesis1_zonas_lentas}} llega a {{tesis1_dias_largos}} días. Mismo barrio, mismos portales — el corte lo hace la tipología, no la ubicación. Los 1D rotan al doble de velocidad que los 3D. Importante: este número no mide cierres de venta, mide cuánto tiempo lleva un aviso publicado (ver apéndice), pero es proxy decente de la velocidad del ciclo. Si vas a construir o comprar para mover stock rápido, el producto que elegís te define la velocidad más que el barrio.

## s1.tesis_2.title
Si buscás preventa en {{zonaLabel}} hoy, casi toda la oferta está en una zona: Sirari.

## s1.tesis_2.quote
4 zonas entregan. 1 construye.

## s1.tesis_2.body
{{tesis2_pct_entrega}}% del inventario activo está listo para entrega inmediata. Solo Sirari invierte la lógica: de sus {{tesis2_sirari_uds}} unidades, el {{tesis2_sirari_pct}}% están en preventa. Es la única zona donde la preventa supera al stock terminado. {{tesis2_otras_zonas_entrega}}. Esto pasa porque el pipeline de construcción de los últimos 24 meses ya aterrizó en el resto de {{zonaLabel}} — los proyectos que empezaron en 2023-2024 hoy están entregando. Sirari está un trimestre o dos atrás en el ciclo. Si sos dev buscando dónde hay espacio para arrancar un proyecto nuevo sin chocar con inventario terminado, la foto es clara: el resto de {{zonaLabel}} está en fase de vaciado, Sirari está en fase de construcción.

## s1.tesis_3.title
Dos departamentos iguales en la misma zona pueden costar USD 70,000 de diferencia.

## s1.tesis_3.quote
El edificio pesa más que el barrio.

## s1.tesis_3.body
En Equipetrol Centro, un 2 dormitorios se vende desde USD 154,000 hasta USD 228,000. Misma zona, misma tipología, los dos activos hoy en portales. Diferencia: USD 74,000, un 48%. La brecha entre el barrio más caro y el más barato de {{zonaLabel}} es del {{tesis3_rango_pct}}% — la brecha DENTRO de un mismo barrio llega al 30-48%. Traducido simple: la ubicación importa, pero menos de lo que se cree. Lo que define el precio real es el edificio — año de construcción, piso, vista, amenidades, terminaciones, orientación. Decirle a alguien "en Equipetrol Centro los 2D valen USD 192k" es un promedio que en la realidad describe a muy pocas unidades. Cada listing es un caso propio. Si vas a fijar precio de un proyecto o a evaluar una compra, el comparable útil es edificio-a-edificio, no zona-a-zona.

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
\* Mediana de antigüedad del listado por dormitorios: días desde que este aviso fue publicado en el portal hasta la fecha de corte. Celdas vacías ("—") son segmentos con menos de 3 unidades, insuficiente para reportar. No es velocidad de venta ni tiempo total en el mercado real — ver §2.

## s4.excluidos
Equipetrol 3er Anillo — franja comercial sobre el 3er anillo entre Av. Busch y Av. La Salle — aparece con pocas unidades residenciales en el corpus. Es una zona de uso mayoritariamente comercial, con muestra estadísticamente insuficiente para reportar como submercado residencial propio. Se excluye de las tablas comparativas y de los agregados zonales.

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
Los listings de alquiler declaran mayoritariamente su estado de amoblado, pero la declaración no es homogénea: {{pctAmoblado}}% se anuncia como amoblado, {{pctNoAmoblado}}% como no amoblado, {{pctSemi}}% semi y {{pctSinDeclarar}}% no declara. Mezclar los grupos en una sola renta mediana agregada produce un número que no representa a ningún segmento en particular.

## s8.anomalia_p1
En <strong>monoambientes</strong>, las rentas medianas declaradas amoblada (USD {{renta0DAmoblado}}) y no amoblada (USD {{renta0DNoAmoblado}}) son casi idénticas en valor nominal. Controlando por m² (ambos grupos tienen mediana cercana a 37 m², así que no hay sesgo de tamaño), la prima real del mobiliario es de apenas <strong>~8.5% en renta por m²</strong>. Cifra modesta — la intuición del broker suele ser superior. <strong>Importante:</strong> no controlamos por año de construcción, piso ni amenidades del edificio; un monoambiente nuevo con amenidades puede caer a cualquiera de los dos grupos. La lectura operativa para el propietario: amueblar un monoambiente no sube la renta mucho; el retorno viene de reducir vacancia y facilitar rotación.

## s8.anomalia_p2
En 1 dormitorio la relación se invierte: los listings "amoblados" tienen mediana USD {{renta1DAmoblado}}, <strong>menor</strong> que los "no amoblados" USD {{renta1DNoAmoblado}}. Contraintuitivo — el mobiliario debería agregar valor — y casi seguramente efecto de composición: el segmento amoblado en 1D captura un pool distinto (posiblemente unidades más viejas o con menor terminación) que el no amoblado. En 2 dormitorios la relación vuelve al orden esperado (amoblado USD {{renta2DAmoblado}} vs no amoblado USD {{renta2DNoAmoblado}}), pero muestra chica obliga a leer con cautela.

## s8.anomalia_cierre
Para un inversionista interesado en renta, la conclusión operativa es: <strong>no usar los promedios de renta publicados de esta edición para calcular yield</strong>. Usar la tabla desagregada solo como referencia directa del segmento que mejor coincida con el producto evaluado, y siempre aplicar descuento típico de cierre (10-20% por debajo de publicado).

---

## s9.lead
Un analista serio declara sus límites. Esta edición no publica:

## s9.no_presentamos
[
  {"titulo": "Tasa de absorción y meses de inventario", "cuerpo": "La serie actual tiene menos de 90 días. Incorporación prevista julio 2026."},
  {"titulo": "Yield, cap rate o retorno de inversión", "cuerpo": "Requiere precio de cierre, renta efectiva y vacancia — tres variables que no tenemos."},
  {"titulo": "Tasa de vacancia", "cuerpo": "Cero data empírica. Cualquier número sería conjetura."},
  {"titulo": "Apreciación o proyección de precios", "cuerpo": "Menos de 3 meses de serie longitudinal comparable. YoY publicable enero 2027."},
  {"titulo": "Precio de cierre real", "cuerpo": "Todo lo reportado es precio de publicación. Brecha típica al cierre: 5-15% venta, 10-20% alquiler."},
  {"titulo": "Ranking de zonas para invertir", "cuerpo": "Sin retorno calculable, un ranking sería opinión disfrazada de análisis."}
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

## cta.kicker
Producto Simón · Estudios privados

## cta.title
¿Tu desarrollo en {{zonaLabel}}?

## cta.body
Este baseline es la foto pública — la que ve tu comprador. Tu posición competitiva requiere otro ángulo: inventario real, brecha vs desarrolladoras vecinas, simulación de escenarios de precio y metodología ampliada para comité de inversión. Simón produce estudios de mercado por encargo a desarrolladoras, con acceso al corpus completo (incluyendo inventario estancado) y con el foco puesto en tu proyecto.

## cta.button
Pedir estudio privado

## cta.button_href
https://wa.me/59176308808?text=Hola%2C%20vi%20el%20baseline%20de%20{{zonaLabel}}%20y%20quiero%20pedir%20informaci%C3%B3n%20sobre%20estudios%20privados.

## cta.meta
También por <a href="mailto:directorcasapatio@gmail.com">directorcasapatio@gmail.com</a> o WhatsApp directo al <a href="https://wa.me/59176308808">+591 7 630 8808</a>

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
