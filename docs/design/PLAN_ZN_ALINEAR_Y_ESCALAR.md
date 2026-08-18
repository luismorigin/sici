# Zona Norte: alinear el feed con Equipetrol y dejar base para escalar

**Plan acordado el 18-ago-2026.** Escrito antes de tocar código, con la disciplina del proyecto:
goal en una frase · línea de base medida · evals con criterio de aborto.

## Goal

**Que `/zona-norte/ventas` se vea y funcione igual que el feed de Equipetrol, y que agregar la
próxima macrozona de departamentos (Urubó, Las Palmas, Zona Este) sea declarar sus zonas y una página
delgada — no copiar 6.000 líneas.**

Con una restricción que no se negocia: **cada macrozona muestra solo lo suyo.** Ninguna filtra
propiedades de la otra.

### Qué NO entra
- **El bot.** No se toca. Sus 3 RPC hardcodean `zona_general='Equipetrol'` y extenderlo a ZN es
  trabajo aparte, ya identificado.
- **Alquileres.** Primero ventas. Alquileres viene después **sobre la misma base**, mucho más barato.
- **Lanzar ZN** (sacar `noindex` + sitemap). Decisión aparte, cuando el founder quiera.
- **Migrar Equipetrol a los componentes nuevos.** Ver "el camino elegido".

## 🔴 El camino elegido: UNA página parametrizada (revisado el 18-ago)

**La primera versión de este plan decía "no tocar `ventas.tsx`, copiar las piezas a componentes".
Se descartó al medir bien.** El founder señaló dos cosas que el inventario inicial no vio: el
**resumen de mercado** del panel desktop, y que **todo el rediseño mobile** también falta.

Medido después de eso — ZN no tiene **casi nada** del rediseño:

| Pieza | `/ventas` | ZN |
|---|---:|---:|
| Resumen de mercado (desktop) | sí | **no** |
| Buscador natural | 3 | **0** |
| Header sticky mobile | 47 | **0** |
| Menú hamburguesa | 30 | **0** |
| Carrusel del mapa · barra inferior · chip de área · botón "ver los N" | sí | **0** |
| Perfil mobile · histograma · buscador de edificios | sí | **0** |

👉 **A ZN no le falta el rediseño desktop: le falta el rediseño entero, mobile incluido** — las
~2.400 líneas de diferencia entre los dos archivos, casi completas.

**Y eso da vuelta la decisión.** Con 3 piezas faltantes, copiarlas era razonable. Con todo faltando,
"copiar sin tocar Equipetrol" significa **mantener dos feeds completos** — exactamente lo que
queríamos evitar, y peor cuando venga Urubó.

### Lo que se hace en su lugar
El cuerpo de `ventas.tsx` pasa a **un componente que recibe la macrozona**, y quedan **dos páginas
delgadas** que le pasan la suya. **No se reescribe: se mueve.** Misma lógica, mismo diseño, mismo
tracking, en otro archivo.

| | Duplicar | **Página parametrizada** |
|---|---|---|
| Agregar Urubó | copiar 6.000 líneas | **una página de ~20** |
| Mejorar el feed | hacerlo en cada zona | **una vez, llega a todas** |
| Riesgo sobre Equipetrol | cero | **una ventana, verificable y revertible** |

### El riesgo, dicho con precisión
**No es permanente: es una ventana.** Se despliega, se verifica, y si algo falla se revierte con un
comando — como pasó hoy con ZN: se rompió, se vio, se revirtió en quince minutos. La diferencia es
que `/ventas` factura, así que esa ventana cuesta más. **Por eso el verificador corre ANTES del
deploy, no después.**

⚠️ **Y lo que sí cambia para siempre:** cuando un cambio llega a todas las zonas, **un error también**.
Hoy romper ZN dejaba Equipetrol intacto; después, no. Consecuencia obligatoria: **el verificador mide
TODAS las zonas en cada cambio**, no solo la que se toca.

### Lo que NO se comparte
Parametrizar no es uniformar. Cada macrozona conserva **su título y su SEO**, **su resumen de mercado
calculado sobre su propio inventario** (nunca mezclado), **sus microzonas** y **su ruta**. Se comparte
*cómo se ve y cómo funciona*; es propio *qué muestra y cómo se llama*.

## Las fases

### Fase 0 — El verificador (antes de tocar nada)
`simon-mvp/scripts/eval-feeds-zonas.mjs`, con **Playwright** y no el navegador interno:
`VERIFICAR_FEEDS_DESKTOP.md` documenta que el preview MCP **no hidrata el layout desktop**.
Selectores del propio doc: `.vd-cols` (desktop montado) · `.vlc` (cards de lista) · `.vfp` (pills) ·
`.bs-side` (panel lateral).

**Mide, por feed:** cuántas propiedades · **de qué macrozona son** · qué piezas del rediseño están
presentes · errores de consola. Deja la **línea de base** de hoy.
🔑 El chequeo "de qué macrozona son" es el que **habría atajado el incidente del 18-ago** antes de
llegar a producción.

**Eval:** corre y reporta el estado actual sin fallar.

### Fase 1 — La base de macrozonas
`lib/macrozonas.ts`: cada macrozona declarada con sus microzonas, título, rutas y etiquetas.
🔑 **Sin valor por defecto, y Equipetrol declarado como una más.** Hoy Equipetrol es "lo normal" —está
en la raíz de la URL y es el default del API— y **esa asimetría causó el incidente del 18-ago**. Si
falta la macrozona, tiene que **fallar ruidosamente**.

**Eval:** el verificador sigue dando idéntico (todavía no se usa en ninguna página).

### Fase 2 — El movimiento
El cuerpo de `ventas.tsx` → componente parametrizado. `/ventas` y `/zona-norte/ventas` quedan como
páginas delgadas que pasan su config.

**Eval — y es el criterio de aborto:**
- `/ventas` **idéntico** a la línea de base: 351 propiedades, 0 de ZN, todas las piezas presentes
- `/zona-norte/ventas`: **305**, **0 de Equipetrol**, y **ahora con las piezas del rediseño**
- `tsc` 0 · `build` exit 0 · sin errores nuevos de consola
- Se verifica **en local, antes de desplegar**

🔴 Si `/ventas` cambia en algo, se revierte. Es un commit.

## Visión, para no cerrarse puertas
Hoy la macrozona es **la puerta de entrada**. Con 4-5 zonas eso es fricción: el comprador piensa
"2 dorm hasta 150k", no "Zona Norte". El modelo probable a futuro es **un feed general** (donde el
mapa y el buscador natural acotan, piezas que **ya existen**) **+ landings por zona para SEO**.
🔑 Lo que sí hay que respetar siempre: **se puede unificar la navegación, nunca las métricas.** La
mediana de dos macrozonas mezcladas no significa nada.
Esta base sirve para los dos modelos, así que **no hay que decidirlo ahora**.
