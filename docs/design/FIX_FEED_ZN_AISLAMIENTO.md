# Feed de Zona Norte: mostraba 24 de 305 — y el arreglo rompió producción antes de salir bien

**18-ago-2026.** Dos intentos. El primero (`f790c3d`) **sirvió propiedades de Equipetrol en el feed
de Zona Norte** y se revirtió en caliente (`d32a926`). El segundo (`1459e38`) es el bueno.
Vale más el recorrido que el fix.

## El síntoma original
`/zona-norte/ventas` mostraba **24** propiedades habiendo **305**.

## Primer diagnóstico — correcto pero incompleto
Los dos feeds cargan igual: `getStaticProps` trae 24 (solo el primer viewport) y el resto lo pide el
navegador. ZN tenía:

```js
if (initialProperties.length === 0 || spotlightId) fetchProperties()
```

Solo pedía el resto si el SSG no había traído nada. Con 24, la condición daba `false`. Correcto
cuando el SSG traía 500; el 11-ago se bajó a 24 y **este `useEffect` no se actualizó**.

Se copió el mecanismo de `/ventas`. Compiló, pasó typecheck, se desplegó… **y el feed de ZN empezó a
mostrar "Eq. Centro" y "V. Brigida"**.

## La causa REAL, que el primer diagnóstico no vio

🔴 **`/api/ventas` tiene Equipetrol como DEFAULT.** Una llamada sin `zonas_permitidas` devuelve
Equipetrol — **no un error**.

En ZN los dos únicos caminos que llegaban al API sí las ponían:
- `buildFilters()` → `f.zonas_permitidas = zonas.size > 0 ? [...zonas] : getMicrozonasZN()`
- `getStaticProps` → `zonas_permitidas: getMicrozonasZN()`

**El agujero estaba tapado por costumbre, no por diseño.** El `useEffect` nuevo abrió un tercer
camino —`fetchProperties()` sin argumentos, que manda `filters` = `{orden:'recientes'}`— y lo destapó.

Medido desde la propia página:

| Llamada | Total | Primera zona |
|---|---:|---|
| sin `zonas_permitidas` | **351** | **Equipetrol Centro** |
| con las 13 microzonas ZN | **305** | 4to-6to anillo Banzer-Alemana |

## El arreglo

**No en el `useEffect`, sino en `fetchFromAPI`** — el único punto por donde pasan todas las llamadas
al API desde ese archivo:

```js
const filtrosZN: FiltrosVentaSimple = {
  ...filtros,
  zonas_permitidas: filtros.zonas_permitidas?.length ? filtros.zonas_permitidas : getMicrozonasZN(),
}
```

Así **cualquier camino futuro queda cubierto**, incluido el que agregue el próximo.
Más el `useEffect` diferido, que era el goal original.
Un solo archivo: `zona-norte/ventas.tsx`. `ventas.tsx` **no se toca**.

## 🔑 Las dos lecciones

**1. El aislamiento no puede depender de que cada llamador se acuerde.**
Es el mismo criterio que la perilla `--zona` de los scripts del híbrido: *un default cómodo para
quien escribe es peligroso para todos los demás*. Si el API hubiera exigido la macrozona en vez de
asumirla, este bug no existía — habría fallado ruidosamente en el primer intento, en local.

**2. `tsc` y `npm run build` no ven de qué zona son los datos.**
El primer intento pasó las dos verificaciones y rompió producción igual. Lo detectó el founder
mirando la pantalla, en el mismo minuto. **Un feed que muestra la macrozona equivocada compila
perfecto.**

## Cómo se verificó el segundo intento (antes de desplegar)
- Las dos llamadas al API desde la propia página: 351/Equipetrol vs 305/ZN.
- La página cargada en local: **17 menciones de zonas ZN, CERO de Equipetrol**.
- `tsc` 0 errores.
- ⚠️ Lo que no se pudo desde acá: leer el contador en pantalla (el DOM renderiza por viewport y el
  navegador no compone frames). **Lo confirmó el founder a ojo en local: 305 y todas ZN.**

## Lo que este arreglo NO resuelve
ZN sigue con el diseño viejo (grid + sidebar): nunca recibió el rediseño de julio (`splitDesktop`
aparece 21 veces en `ventas.tsx` y 0 acá). Y sigue en dark launch (`noindex`).
