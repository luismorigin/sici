# ACM para brokers y clientes — contexto de arranque

**Rama:** `worktree-acm-broker-cliente` · **Abierta:** 5-ago-2026 · **Estado:** relevamiento hecho, sin código nuevo todavía.
**Objetivo:** llevar el patrón del paquete B2B de desarrolladoras (ver `docs/analysis/README_MESA_INFORME.md`) a las otras dos audiencias: **brokers** y **clientes compradores/vendedores**.

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

## ▶️ Próximo paso sugerido

Elegir UNA audiencia (mi recomendación: **vendedor**, por el hueco + porque el motor ya responde su pregunta) y cerrar su mapa de decisiones antes de tocar código. Después: extraer el módulo común de cohorts/percentiles (paso 0), y recién ahí la vista.

**Piezas server-side limpias para reutilizar:** `pages/api/shortlist-market.ts` (cohort por zona+dorms sobre las vistas shadow, MIN_COHORT=5) y `lib/superficies-data.ts:fetchContextoVenta` (patrón SSG con paginado).
