# Dónde retomar — Zona Norte al híbrido (cierre del 28-jul-2026)

> Rama `worktree-zn-perilla-zona`, worktree `.claude/worktrees/zn-perilla-zona`.
> **3 commits, sin push.** Las routines nocturnas corren `main`, que no se tocó.

## Lo que quedó andando (aplicado y verificado)

| | |
|---|---|
| **mig 309** | `buscar_similares` ya no puede cruzar de macrozona. Las 8 shortlists sin perfil siguen devolviendo similares (cascada vista→shadow→prod); si ni así hay perfil, devuelve vacío en vez de "cualquier cosa". |
| **mig 310** | 2 brochures de ZN que quedaron etiquetados 'equipetrol'. |
| **mig 311** | "TC 7" deja de descontar + badge "Confirmar tipo de cambio". Verificado: las 42 del feed pasaron de $1.139/m² a **$1.905/m²**, que es exactamente lo que predijo el test del mismo edificio. |
| **ZN en la base nueva** | **109 props**, matching **67,9%** (venía de 59,8%), 35 brochures a la cola. |

## Lo primero al retomar

```bash
node scripts/deptos-equipetrol/test-perilla-zona.mjs      # 24 checks, ~5s
```
Si sale verde, la perilla está sana y Equipetrol intacto.

## La próxima tanda (lo que el founder pidió)

```bash
cd scripts/deptos-equipetrol
node cargar-deptos-shadow.mjs --prep 105 --zona=zona-norte      # ~12 min, ~11 MB de proxy
node partir-lectura.mjs output/material-<ts>-zn.json 15         # → 7 chunks
#   → 7 subagentes-lectores (el prompt que funcionó está más abajo)
node inyectar-veredictos.mjs output/material-<ts>-zn.json output/veredictos-venta-zn-*.json
node medir-relectura.mjs output/material-<ts>-zn.json           # qué aportó
node cargar-deptos-shadow.mjs --apply output/material-<ts>-zn.json --zona=zona-norte
```

🔴 **SIN `--local`.** El modo local no trae el precio en bolivianos del portal, y sin eso el
lector queda ciego en el ~60% de los avisos (los que no traen el monto en el texto). Ver
`RECONOCIMIENTO_ZN.md` §"El portal miente el precio". El fetch cuesta ~11 MB por tanda: barato.

🔴 **Archivar los veredictos de la tanda anterior antes de partir** (`output/tanda-N/`): los
nombres solo llevan la fecha, así que dos tandas el mismo día se pisan.

**Faltan ~300 props de venta** (109 de 448 hechas) + **101 de alquiler**.

### Lo que hay que pasarle a los lectores
Está en el prompt de la última tanda: banda de $/m² **por microzona**, el patrón ×1,4 del portal
y cómo desempatar con `precio_bob_portal`, que `recamaras` no distingue monoambientes, que Remax
descuenta 1 m², que "TC oficial del día" sin número NO es `oficial_viejo`, y el test de $/m²
uniforme para separar brochure de unidad.

## Decisiones abiertas (del founder, no técnicas)

1. **Los "Precios desde"**: la spec los manda a brochures aunque traigan una sola tipología con
   área y monto propios. Cuesta ~8 unidades legítimas por tanda (Mangales Blue 2, Miro Tower).
   El test de $/m² uniforme dice que esos no fabricaron nada. La spec **no se tocó**.
2. **Ajuste del TC por vecinos**: decidir caso por caso comparando contra el mismo edificio
   (arquitectura del estado de obra inferido, migs 302/303). **No se puede todavía**: en ZN solo
   4 de 18 tienen vecino releído. Requiere terminar de releer la zona.

## Pendientes concretos

- [ ] **21 edificios nuevos** para `proyectos_master` (Rise 2, Soma, Torre Murano, Mythos,
      Condominio Benidorm, Solaris, Vivaldi, Tribu…). Sale del apply, lo aplica el founder.
- [ ] **Re-leer las 8 Rhodium** (8000209-8000219): el captador reemplazó la portada y las cards
      salen vacías. El detector nuevo ya las caza.
- [ ] **Alquiler ZN** (101 props) — la perilla ya lo cubre.
- [ ] **Snapshot de alquiler** está filtrado a Equipetrol: la venta de ZN entra sola a la serie,
      el alquiler no. Es una línea.
- [ ] **Verificar el interruptor `?shadow=1` de ZN a nivel UI** — ver abajo.

## Dos cosas a medias, dichas como son

**El interruptor de ZN quedó a medio verificar.** El contrato está probado (la API responde 251
en producción y 0 en la base nueva), pero **no logré que el feed de ZN llame a la API** en las
pruebas automatizadas: no hace pedidos al cargar (usa el SSG) ni lee filtros por URL. O sea el
interruptor solo actúa **cuando el usuario filtra a mano**. Para verlo de entrada habría que
tocar el SSG.

**El navegador integrado no sirve para estos feeds.** No hidrata: React no se monta, y todo lo
que se mida ahí es basura (perdí un rato largo por eso). Está documentado en
`docs/design/VERIFICAR_FEEDS_DESKTOP.md` y ahora hay herramienta:
```bash
node simon-mvp/scripts/verificar-chip-fiduciario.mjs http://localhost:3100
```
Y para levantar el worktree sin pisar el server del repo principal, se agregó
`simon-mvp-worktree-zn` (puerto 3100) al `.claude/launch.json`, que está gitignored.

## Los dos bugs que llegaron de marketing

- ✅ **Chip "vs. similares" invisible en móvil** — arreglado. El comparador de `React.memo` de la
  tarjeta móvil no incluía `marketChip`, así que bloqueaba el re-dibujo cuando el chip llegaba
  (se calcula después del primer render). Medido con Playwright: 430px pasó de 0 a 4/4 tarjetas.
  ⚠️ Ojo al leer el reporte original: el "0 vs 200" comparaba un feed virtualizado (móvil, ~4
  tarjetas dibujadas) contra uno que no lo está (escritorio, 200). El bug era real, la magnitud no.
- ✅ **Fotos de Rhodium** — el captador reemplazó la **portada**. De 11 fotos, 8 siguen vivas,
  pero la primera da 403 y es la única que pinta la tarjeta. Detector agregado a
  `auditar-shadow.mjs`, sin costo extra de pedidos. Probado: caza las 3, no marca las sanas.

## Lo que NO hay que volver a hacer

- Optimizar el fetch a costa de la lectura: el proxy sobra (2 GB), la cuota no.
- Confiar en el navegador integrado para los feeds.
- Editar un comparador de `memo` sin mirar **a qué componente pertenece** (el archivo de
  alquileres tiene dos, y el primer intento fue en el equivocado).
