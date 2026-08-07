# ACM para brokers y clientes — contexto de arranque

**Rama:** `worktree-acm-broker-cliente` · **Abierta:** 5-ago-2026 · **Última:** 7-ago-2026
**Estado:** prototipo funcional con **data real de anoche**, servido desde `simonbo.com/acm-b7k2.html`, con eval de 23 checks en verde. **No toca ninguna superficie de producción** — es una página suelta con `noindex` más dos API read-only nuevas.
**Objetivo:** llevar el patrón del paquete B2B de desarrolladoras (ver `docs/analysis/README_MESA_INFORME.md`) a las otras dos audiencias: **brokers** y **clientes compradores/vendedores**.

## 📦 Qué se puede hacer hoy y qué no

| Se puede | No se puede todavía |
|---|---|
| Armar un ACM real de cualquier depto de Equipetrol (≤3 dorm) pegando la URL de su aviso o cargándolo a mano | Que el broker tenga **su panel** con sus ACM guardados — hoy cada uno vive en su link y nada los lista |
| Ajustar el cohorte (radio 300/500/800 m, tolerancia de superficie), excluir comparables **con motivo** y firmar una recomendación | Saber **si el cliente lo abrió** — el registro de vistas está diseñado (copia el de shortlists) pero no construido |
| Compartir un link que **congela** el documento: los comparables viajan adentro, así que el número no cambia solo | El **vencimiento a 60 días** que le fabrica al broker un motivo de re-contacto |
| Abrir cada ficha en el feed de Simón desde el celular | Que la ficha **abra sola su bottom sheet** — requiere tocar `ventas.tsx`, y se dejó afuera a propósito |

---

## 🔴 Lo primero: el ACM YA EXISTE y está en producción

No arrancamos de cero. Hay un motor probado, hoy **escondido detrás del modo broker**:

| Pieza | Ruta | Qué hace |
|---|---|---|
| **RPC** | `sql/migrations/226_buscar_acm.sql` | `buscar_acm(propiedad_id)` — cohort zona+dorms+estado; devuelve mediana/p25/p75 de $/m², percentil, días vs mediana, ranking en la torre, **rango de valor** (p25·área – p75·área), yield si hay ≥5 comparables de alquiler, e histórico de precios |
| **API** | `simon-mvp/src/pages/api/acm.ts` | Wrapper GET del RPC. Exporta la interfaz `ACMData` = el contrato completo |
| **UI** | `simon-mvp/src/components/broker/ACMInline.tsx` | Render del bloque. Cableado sólo en `ventas.tsx:2141` y `zona-norte/ventas.tsx:1324`, **gated por `brokerMode`** |

**Consecuencia:** el trabajo no es "construir un ACM" sino **decidir a quién se lo mostramos, con qué envoltorio y qué se cobra**. El motor ya calcula el rango de valor de una propiedad concreta — que es exactamente lo que un vendedor quiere saber.

## ⚠️ Las tres trampas del terreno

1. **Hay un CMA legacy que NO es este.** `api/broker/generate-cma.ts` + `lib/pdf/CMAPDFDocument.tsx` (PDF de 4 páginas, consume créditos `cma_creditos`) cuelgan de la tabla **`brokers` legacy** y de `propiedades_broker` — no del feed de mercado. `lib/simon-brokers.ts` ya advierte que `brokers` ≠ `simon_brokers`. **No construir sobre esa rama**; el template PDF sí se puede reciclar re-alimentándolo desde `buscar_acm`.
2. **La lógica del chip fiduciario está duplicada en 5 lugares** (`ventas.tsx:3252`, `alquileres.tsx:1056`, `ShortlistCardChip.tsx`, los bloques "Cómo está el precio" de ambos sheets, y `superficies-data.ts:fetchContextoVenta`). Umbrales distintos entre sí (≥6 en las cards, ≥5 en los sheets). **Extraer un módulo común es el paso 0** de cualquier trabajo serio acá — si no, cada superficie nueva agrega una sexta copia.
3. **Hay decisiones previas ya tomadas** en `docs/broker/PRD.md` (§358-375) y `BACKLOG.md`: ACM inline **sí**, página ACM dedicada **no**, PDF del ACM **fuera del MVP**, ACM de alquiler **descartado**. No relitigarlas sin motivo nuevo — y si se cambian, dejar escrito el porqué.

## 🕳️ El hueco real: no existe el lado VENDEDOR

Todo lo de cliente hoy es **lado comprador** (shortlists `/b/[hash]`, mini estudio del sheet, informe fiduciario). **No hay ningún flujo para el dueño que quiere saber cuánto vale lo suyo** — y el motor ya lo puede responder (`buscar_acm` devuelve rango de valor). Ese es el espacio más grande y el que más se parece a un producto nuevo.

## 🧭 El principio de diseño (no negociable)

**No copiar las secciones del informe de desarrolladoras.** Lo que se reutiliza es la *arquitectura* (fuente única de data + CONF/SLOTS/EDITORIAL + disciplina fiduciaria), no el contenido. Cada audiencia tiene **preguntas distintas**, y las preguntas definen las vistas:

| Audiencia | Sus decisiones | Qué necesita ver |
|---|---|---|
| **Desarrolladora** (ya hecho) | dónde compro suelo · qué construyo · a qué precio salgo · cuándo lanzo · por qué no vendo | Mesa + informe de mercado |
| **Broker** | qué capto · a qué precio lo listo · qué le muestro al cliente para cerrar · contra quién compito | ACM por propiedad + material presentable con su marca |
| **Comprador** | ¿me están cobrando de más? · ¿qué alternativas hay? · ¿cuánto renta? | Chip fiduciario + comparables + yield |
| **Vendedor** (hueco) | ¿cuánto vale lo mío? · ¿por qué no se vende? · ¿bajo el precio? | Rango de valor + posición vs cohort + antigüedad |

**Antes de escribir código: cerrar el mapa de decisiones de la audiencia elegida.** El error a evitar es tomar la Mesa y "adaptarla".

## ⚖️ Reglas fiduciarias que aplican acá

Heredadas de `docs/analysis/AUDITORIA_ESTADISTICA_MESA_INFORME.md`, `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` y `METODOLOGIA_FIDUCIARIA_PARTE_1.md`:

- **Antigüedad del stock ≠ tiempo de venta.** Nunca prometer plazos.
- **Salida ≠ venta.** El motivo de una baja no es observable.
- **Precios pedidos, no de cierre** (Bolivia no tiene registro público de transacciones). Un ACM da **rango**, nunca número seco.
- Todo contraste sin test → **"indicativo"**. Nunca aseverar ausencias. Todo % de precio **declara su moneda**.
- **n declarado siempre**; sin base suficiente → "sin base", no un número flojo.
- Al **broker** se le venden herramientas — **nunca posición en el feed** ni el chip (vale porque no se compra).
- Al **comprador/vendedor**: datos, **nunca consejo de inversión personalizado**.

## 🔄 El flujo del producto (decidido 5-ago-2026) — prototipado en `acm-prototipo.html`

**La observación de fondo:** el ACM son **dos productos en una pantalla**. El broker EDITA en privado; el cliente LEE un documento congelado. Mismo patrón que las shortlists (`/admin` arma → `/b/[hash]` lee), y conviene copiarlo tal cual, incluido el registro de vistas.

| Estado | Quién | Qué pasa | Al 7-ago |
|---|---|---|---|
| **1 · Borrador** | broker | Pre-llenado desde el feed si la propiedad ya está publicada. El formulario en blanco es para lo **no publicado** — que es el caso de oro: la captación, cuando el dueño todavía está decidiendo con quién firma. | ✅ y además **pegando la URL del aviso** |
| **2 · Recomendación** | broker | Escribe **a qué precio saldría y por qué**. Sin esto el broker es un cartero que reenvía un reporte de Simón; con esto **el broker es el autor y Simón la evidencia**. | ✅ |
| **3 · Publicado** | sistema | Congela comparables, corte de data, exclusiones y recomendación → link `/acm/[hash]`. | ✅ **sin tabla**: el documento entero viaja comprimido en el hash de la URL. Sirve para probar; para el panel del broker hará falta persistirlo |
| **4 · Compartido** | cliente | Link limpio con la marca del broker. Dos acciones: compartir y hablar. El broker ve que lo abrió. | ⚠️ el link anda; **el aviso de apertura no existe** |
| **5 · Vencido** | sistema | A ~60 días se marca solo y avisa al broker. Le fabrica un **motivo legítimo de re-contacto** — un ACM v2 es una excusa para llamar; "¿cómo venís pensando?" no lo es. | ❌ el documento muestra su fecha de corte, pero nada vence ni avisa |

🔴 **Congelar no es un detalle técnico.** Si el link recalcula cada noche, el cliente abre a los diez días y el número cambió sin que nadie se lo dijera — el broker queda desautorizado por su propia herramienta. Un ACM es **un documento fechado**, no un tablero. Y es lo fiduciariamente correcto.

**Tres decisiones que sostienen el flujo:**
1. **La recomendación va tipográficamente separada de la medición**, rotulada *"criterio profesional de [broker], no una medición de Simón"*. Protege a Simón de recomendar precio (no puede) **y** al broker, cuyo criterio queda destacado en vez de diluido.
2. **Excluir un comparable exige MOTIVO, y el cliente lo lee.** Sin eso el ✕ es una herramienta para maquillar el rango y Simón queda de cómplice. El rango con los originales queda al lado del recalculado.
3. **El cliente ve el simulador, pero DESPUÉS de la recomendación.** Si juega antes, la recomendación del broker se lee como una opinión más entre las que él mismo generó moviendo la barra.

**Implicancia comercial:** si el momento de valor es la reunión de captación, **cobrar por ACM es contraproducente** — hace que lo use menos justo cuando querés que lo use siempre. Suscripción por broker, ACM ilimitados. Además **cada ACM compartido es distribución**: el cliente lo reenvía a su pareja o su socio, y cada reenvío es una superficie con la marca de Simón llegando a gente que nunca buscó nada.

**Fuera de alcance por ahora:** el ACM del comprador (documento distinto, input distinto, orden distinto — mismo motor, otro modo), el PDF (el link se comparte mejor, se versiona y se mide), y que el cliente edite supuestos (si puede, el documento deja de ser del broker).

## 🔴 Antes de escribir una query: `DONDE_VIVE_CADA_DATO.md`

Cuatro de los errores de esta sesión fueron el mismo: **buscar el dato donde no vivía**.
Las fotos en la tabla de snapshots (58% de cobertura) en vez de donde las saca el feed
(100%); la fecha de entrega en el snapshot (11 avisos) en vez de `proyectos_master` (88);
`precio_norm` pedido a la tabla cuando lo calcula la vista.

Ninguno falló: devolvieron datos incompletos que el documento mostró como ciertos.

`docs/broker/DONDE_VIVE_CADA_DATO.md` tiene la lista de dónde vive cada cosa y dónde ya
busqué mal. **La regla que resume todo:** si una pantalla de Simón ya muestra ese dato,
mirá de dónde lo saca ella antes de construir un camino nuevo.

## ▶️ Cómo se corre hoy (5-ago-2026)

El prototipo dejó de ser un archivo con datos congelados: **lee el mercado de anoche**.

```bash
# 1 · el servidor (una vez)
cd simon-mvp && npm run dev -- -p 3300

# 2 · generar la copia que se sirve  →  simon-mvp/public/acm-b7k2.html
node docs/broker/preparar-para-web.mjs

# 3 · abrirlo
#     http://localhost:3300/acm-b7k2.html
#     (en prod: simonbo.com/acm-b7k2.html, con el deploy normal de Vercel)

# 4 · el semáforo, antes de cada cambio
node simon-mvp/scripts/eval-acm.mjs
```

| Pieza | Qué hace |
|---|---|
| `simon-mvp/src/pages/api/acm-pool.ts` | Sirve los comparables de Equipetrol (**hasta 3 dorm**) desde `v_mercado_venta_shadow`, con foto, aviso original, fecha de entrega, amenidades y estado de obra con su origen. **Alcance declarado**: los 4+ dorm quedan afuera porque hay **uno solo** — no hay con qué compararlo. |
| `simon-mvp/src/pages/api/acm-buscar.ts` | Resuelve una URL de C21/Remax → la propiedad, **por el código**, no por la URL (C21 reescribe el slug al editar el aviso). Cuando no la encuentra devuelve **cuál de los 8 motivos** fue, en castellano. |
| `docs/broker/acm-prototipo.html` | El documento. Pide el pool al abrir; si el servidor no está, sigue con su copia guardada **y lo dice en el sello**. Archivo de trabajo: se edita este, nunca la copia servida. |
| `docs/broker/preparar-para-web.mjs` | Genera la copia servida: sin las fotos embebidas (1.247 KB → 156 KB) y con `noindex`. **Correrlo después de cada cambio del HTML**, o el eval mide una versión vieja. |
| `docs/broker/fotos-embebidas.py` | Solo para el archivo suelto (`file://`), donde las fotos del CDN no cargan. La copia servida no las necesita. Sus insumos `.txt` no se versionan: salen del pool. |
| `docs/broker/poner-id-en-el-pool.mjs` | Migración de una sola vez, **ya aplicada**: metió el `id` en cada fila del pool embebido. Queda porque si algún día se regenera ese pool, hay que volver a correrla. |
| `simon-mvp/scripts/eval-acm.mjs` | El eval. **23 checks** en 3 niveles. Necesita el servidor arriba. |

🔴 **El enlace compartido lleva los comparables adentro, no solo los datos que cargó el
broker.** Con pool vivo, guardar solo las entradas haría que el mismo link diera otro
número cada noche. Verificado alterando el pool +25%: el rango no se movió.

## 📏 Cómo medir el prototipo sin engañarse (5-ago-2026)

Hay dos formas de recorrer el motor y **dan resultados muy distintos**:

| Método | Qué mide | Estado de obra mezclado |
|---|---|---|
| **Grilla sintética** — 117 edificios × 3 tipologías × 3 superficies × 2 estados = 2.106 | cobertura del código (sirve para cazar excepciones) | 25% de los que emiten · 11,8% mezcla total |
| **Pool real** — cada una de las 282 propiedades pide su propio ACM | algo parecido a la demanda | **8% parcial · 0,4% mezcla total (1 caso)** |

🔴 **La grilla sirve para buscar crashes, no para dimensionar problemas.** Pide combinaciones que nadie pediría (monoambiente de 90 m², 2 dorm de 40 m²); esas encuentran pocos comparables y hacen que el motor caiga a mezclar estados mucho más seguido que en la vida real. El "25% mezclado" que llegó a un mensaje de commit es un artefacto de ese método — el número honesto es 0,4%.

**Regla:** para verificar que nada rompe, grilla sintética. Para decir *"esto pasa X% de las veces"*, pool real — y decir cuál de los dos se usó.

## ▶️ Próximo paso

**El prototipo ya es presentable a un broker.** Lo que sigue no es más documento: es lo que hace falta para que un broker lo use solo, sin nosotros al lado.

1. **Ponerlo delante de un broker** y mirar dónde se traba. Todo lo de abajo se decide mejor después de eso.
2. **Persistir el ACM** (tabla + `/acm/[hash]`) — es la pieza que desbloquea las otras dos: el panel del broker con sus ACM, el registro de vistas y el vencimiento. Hoy el documento vive en el hash de la URL, que alcanza para probar y no para un producto.
3. **Extraer el módulo común de cohorte/percentiles.** Sigue pendiente y ahora hay una copia más: el motor del prototipo. Son **seis** implementaciones del mismo cálculo con umbrales distintos (`ventas.tsx:3252`, `alquileres.tsx:1056`, `ShortlistCardChip.tsx`, los dos sheets, `superficies-data.ts`).
4. **Que la ficha abra su bottom sheet.** Requiere una línea en `ventas.tsx` y quedó afuera a pedido explícito: **no tocar producción** en esta rama.

**Piezas server-side limpias para reutilizar:** `pages/api/shortlist-market.ts` (cohort por zona+dorms sobre las vistas shadow, MIN_COHORT=5) y `lib/superficies-data.ts:fetchContextoVenta` (patrón SSG con paginado).
