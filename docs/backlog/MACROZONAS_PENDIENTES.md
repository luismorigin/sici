# Macrozonas — lo que falta para que una zona nueva esté completa

**18-ago-2026.** El feed de **ventas** ya es parametrizable: `components/feed/FeedVentas.tsx` recibe
una `Macrozona` y `/ventas` + `/zona-norte/ventas` son páginas delgadas que le pasan la suya.
Faltan **dos superficies** para que una macrozona esté entera.

## 🔑 El principio que hace esto fácil (y honesto)

`lib/macrozonas.ts` **declara qué superficies tiene cada zona**. Las que no existen se marcan `null`,
y **la interfaz oculta el enlace** en vez de apuntar a la zona de al lado.

```ts
EQUIPETROL:  rutaMercado: '/mercado/equipetrol'
ZONA_NORTE:  rutaMercado: null      // el nav no muestra "Mercado"
```

**Por qué importa:** hasta hoy el feed de ZN enlazaba a `/mercado/equipetrol`. El usuario veía las
medianas de Zona Norte, tocaba *"Ver mercado completo"* y **aterrizaba en otro mercado, sin aviso**.
No es un enlace roto: es un enlace que miente. Declarar `null` es más honesto que apuntar al vecino.

👉 **Cuando la superficie exista, se cambia `null` por la ruta y el enlace aparece solo en todos
lados.** Ese es todo el trabajo de "conectarla".

## Pendiente 1 — El feed de alquileres

**Qué:** `components/feed/FeedAlquileres.tsx` parametrizado, igual que ventas.
`/alquileres` y `/zona-norte/alquileres` quedan como páginas delgadas.

**Estado hoy:** `/zona-norte/alquileres` (3.893 líneas) es una copia sin el rediseño, igual que
estaba ventas. **Lo bueno:** ya fuerza sus zonas en `fetchFromAPI` y pide 200 con 107 disponibles,
así que **no tiene los dos bugs que sí tenía ventas**.

⚠️ **No es copiar-pegar del de ventas:** alquileres usa **CSS externo** (`styles/alquileres.css`) y
ventas **styled-jsx**. Está anotado como deuda del proyecto. Hay que decidir si se unifica o se
mantienen los dos sistemas.

**Los pozos ya conocidos** (todos mordieron en ventas el 18-ago):
1. 🔴 `/api/ventas` y su gemelo devuelven **Equipetrol por default** si no se pasan
   `zonas_permitidas` — forzarlas en `fetchFromAPI`, no en cada llamador.
2. La **lista de zonas del filtro** (`zonasCanonicas`), o el feed ofrece zonas de otra macrozona.
3. Los **ejemplos del buscador** (chips + placeholder animado).
4. Las **rutas** entre feeds y a mercado.
5. El **mensaje de WhatsApp** del broker ("Trabajo en X").

**Eval:** `node scripts/eval-feeds-zonas.mjs --comparar` (agregarle los feeds de alquiler).

## Pendiente 2 — La página de mercado

**Qué:** `/mercado/[zona]` en vez de una página por zona. Hoy solo existe `/mercado/equipetrol`
(+ `/ventas` y `/alquileres` adentro).

**Es la más nueva de las dos:** no es mover código existente, hay que pensar **el SEO y los textos**,
que son propios de cada zona — títulos, descripciones, Schema.org.

**Cuando exista:** poner la ruta en `ZONA_NORTE.rutaMercado` y **listo** — el nav, el menú y el botón
"Ver mercado completo" la toman solos.

## Y para lanzar una macrozona

Además de las dos superficies: `indexable: true` en su config, sacar el `noindex` de sus páginas y
**agregarlas al sitemap** (hoy ZN no está: sin eso, sacar el `noindex` no alcanza para que Google la
descubra).

Ver también `docs/design/PLAN_ZN_ALINEAR_Y_ESCALAR.md`.
