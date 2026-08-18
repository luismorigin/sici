# Feed de Zona Norte: mostraba 24 de 305 — diagnóstico y plan de evaluación

**18-ago-2026.** Detectado por el founder mirando la pantalla, no por ninguna verificación automática.

## El síntoma

`/zona-norte/ventas` muestra **24 propiedades**. Hay **305** que cumplen sus filtros.
El DOM tiene exactamente 24 tarjetas y el contador del sidebar dice 24.

## La causa — una promesa que el código no cumplía

Los dos feeds cargan igual: `getStaticProps` trae **24 props** (solo el primer viewport, para no
hundir el LCP en mobile) y el resto lo pide el navegador después.

`/ventas` lo hace bien. ZN tenía esto (`zona-norte/ventas.tsx:2246`):

```js
useEffect(() => { if (publicShareMode) return; if (initialProperties.length === 0 || spotlightId) fetchProperties() }, [])
```

👉 **Solo pedía el listado completo cuando el SSG NO había traído nada.** Con 24 en
`initialProperties` la condición daba `false` y **el resto no llegaba nunca**.

🔑 **Era correcto hasta que dejó de serlo.** Cuando `getStaticProps` traía 500 props, no hacía falta
pedir más. El **11-ago** se bajó a 24 y **este `useEffect` no se actualizó**. El comentario del propio
`getStaticProps` ya prometía lo contrario — *"el resto lo trae el cliente al hacer idle"* — así que
**la promesa estaba escrita y el código no la cumplía**: el archivo se contradecía a sí mismo.

## El arreglo

Copiar el mecanismo de `/ventas`, que ya está probado en producción:

- sin datos del SSG, con `spotlightId` o con `?shadow=0` → fetch **inmediato**
- con datos del SSG → el listado completo se **difiere a idle** (`requestIdleCallback`, timeout 3 s;
  `setTimeout(1500)` de fallback)
- guard `fetchGenRef.current === 0`: si el usuario ya filtró, el diferido **no le pisa** su resultado

**Un solo archivo tocado: `simon-mvp/src/pages/zona-norte/ventas.tsx` (+21 / −1).**
`ventas.tsx` (Equipetrol) **no se toca** — es la restricción del goal.

## Línea de base, medida ANTES de desplegar

| | Valor |
|---|---:|
| ZN venta — lo que **debe** mostrar tras el fix | **305** |
| Equipetrol venta — **no se debe mover** | **351** |
| ZN hoy, en pantalla | 24 |

## Plan de evaluación

### El goal
1. **`/zona-norte/ventas` muestra ~305**, no 24. (Puede variar ±unas pocas si corre una captura en el
   medio: el número que vale es el que devuelva el API en ese momento, no el 305 fijo.)
2. El **contador del sidebar** acompaña — no puede decir 24 con 305 tarjetas.

### La restricción: no dañar Equipetrol
3. **`/ventas` sigue mostrando 351** y `/alquileres` 182. Son archivos distintos, pero se mide igual.
4. Los 5 feeds en **200**, sin errores nuevos en consola.

### Los efectos secundarios que este cambio puede tener
5. **El filtro del usuario no se pisa.** Entrar a ZN y aplicar un filtro *enseguida*, antes de que
   pase el idle: el resultado filtrado tiene que quedar. Es lo que protege el guard `fetchGenRef`, y
   es el modo de falla más plausible del arreglo.
6. **La carga inicial no empeora.** El SSG sigue trayendo 24, así que el HTML pesa igual; lo único
   nuevo es un pedido en segundo plano. Verificar que la página pinta rápido y **después** se
   completa.
7. **El salto de 24 → 305 no debe verse como un parpadeo molesto.** Es el mismo comportamiento que
   `/ventas` tiene hace un mes, así que el criterio es "igual que Equipetrol", no "perfecto".

### Criterio de aborto
**Si cualquier número de Equipetrol se mueve, revertir** — el commit toca un solo archivo, así que el
`git revert` es limpio. Que ZN muestre menos de lo esperado NO es motivo de aborto: es el estado que
ya tenía.

## Lo que este arreglo NO resuelve
- ZN sigue con el **diseño viejo** (grid + sidebar): nunca recibió el rediseño de julio
  (`splitDesktop` aparece 21 veces en `ventas.tsx` y 0 acá). Es otra deuda, aparte.
- El feed sigue en **dark launch** (`noindex`, no linkeado). Esto lo deja listo para cuando se lance.
