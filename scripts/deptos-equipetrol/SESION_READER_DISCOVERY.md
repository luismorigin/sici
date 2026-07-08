# Sesión — Discovery propio + Reader extendido (handoff)

> Contexto para retomar. Complementa `ESTADO_MIGRACION.md` y `READER_SPEC.md`.
> Rama: `feat/deptos-hibrido-shadow`. Todo READ-ONLY salvo lo indicado. Prod intacto.

## Qué se hizo esta sesión

### 1. Discovery PROPIO (la pieza que faltaba) — `discovery-deptos.mjs`
El híbrido ya no depende de la discovery de n8n. Sale a los portales él mismo:
- `c21Listado` + `remaxListadoSC` (tipo=departamento, red ancha Equipetrol) → filtro por zona
  canónica `get_zona_by_gps` ∈ 6 microzonas → diff vs `propiedades_v2` (nuevas/existentes/desaparecidas).
- **Dry-run, cero escritura a BD.** Cooldown 20min + circuit breaker (anti-bloqueo IP).
- Nueva clave de zona `equipetrol-deptos` en `scripts/sonda-suelo/lib/zonas.mjs` (bbox ancho + `poligono:null`;
  la zonificación fina la da la BD, no un polígono duplicado).
- **Validado**: 423 deptos en zona (199 C21 + 224 Remax), 97 nuevas, 326 existentes, 307 desaparecidas.
  Cruce de códigos C21: **0 slug-drift** → el diff por URL es confiable.
- Bug corregido: `get_zona_by_gps` vía PostgREST devuelve `[{zona}]`, no string.

### 2. Reader (juez) EXTENDIDO — `READER_SPEC.md`
Antes el juez solo hacía precio/TC/dorms/nombre. Ahora hace **todo lo que aporta a la decisión**, leyendo el
texto (con estructurado como base donde aplica, y la descripción SIEMPRE manda):
- **baños** (cascada discovery→detalle→texto; mono→1; señal "en suite"→conteo)
- **piso** de la unidad (desambigua pisos de amenidades y altura del edificio)
- **amenidades** = SOLO diferenciadores (`esEstandar:false` de `simon-mvp/src/config/amenidades-mercado.ts`)
  + **`amenidades_extra`** (confirmadas no-canónicas, no se pierden) + **`equipamiento_unidad`** (atributos
  de la unidad; "suite" excluido → es señal de baños). NUNCA asumir/curar estándar (ascensor/seguridad).
- **parqueo/baulera** incluidos + costo si son aparte (texto manda)
- **estado_construccion** + **fecha_entrega_estimada** (port de prod `prompt-ventas.md`)
- **amoblado** (nuevo; true solo si "amoblado/amueblado"; "equipado" NO cuenta)
- **es_multiproyecto**: se TAGUEA y se guarda (feed lo excluye), NO se rechaza (para solución futura)
- Fuera (decidido, nice-to-have): plan-pagos, permuta, negociable, descuento, expensas, amoblado-en-alquiler.
  Área = discovery.

### 3. Validación end-to-end (40 deptos, 20 C21 + 20 Remax) — cero escritura a BD
`--prep --ids <40>` → 5 subagentes-lectores en paralelo (patrón `/audit-cola-matching`) → veredictos.
- **38 aceptar / 2 rechazar** correctos (2731 Condado VI multiproyecto → ahora se taguea; 3490 precio contradictorio).
- Cazó precio corrupto de n8n: 3542 ($7.557→$52.600), 3540 ($229k→$160k), 3539 ($411k→$292.5k).
- Amoblado real ×5 vs "equipado" (no contó). TC oficial ("a Bs 7") vs paralelo vs no_especificado, todo del texto.
- Corrigió matching (3578 "Torre ARA"→"Torre Santa Elena"). Sin-nombre → null (no fuerza GPS).
- **El lector se considera VALIDADO** (ambos portales, todos los campos, casos borde). No hace falta otra tanda.

## Qué FALTA (para retomar, en orden)

1. **`--apply` extendido**: persistir los campos nuevos en `datos_json` de `propiedades_v2_shadow`
   (`amenidades`, `amenidades_extra`, `equipamiento`, parqueo/baulera, baños, piso, estado, fecha, amoblado,
   `es_multiproyecto`). Hoy el `--apply` solo escribe el veredicto viejo. **Cargar los 40 → ver en feed shadow.**
2. **Empalme discovery→carga de NUEVAS**: las 97 nuevas del discovery no están en prod → el `--prep` (que lee
   por id de prod) no las agarra; hay que fetchear su detalle desde la URL del portal (como `cron-casas`) y meterlas
   al lector. Es un empalme chico, no pieza nueva.
3. **Verificador integrado**: correr `verificador-casas.mjs` (modelo) sobre las desaparecidas → confirmar bajas por HTTP.
4. **Cron/infra**: el cron nocturno es BACKLOG **por infra** (la nube no llega a los portales bolivianos) → correr
   en local/VM. No es complejidad de código.
5. **Candados** (solo para la comparación shadow-vs-prod LIMPIA): sembrar `campos_bloqueados` prod→shadow. Para
   solo cargar/enriquecer NO hace falta.

## Decisión pendiente: TIPO DE CAMBIO (pensar ANTES de tocar nada)

**Regla clave que NO cambia**: el lector guarda el CRUDO (`precio_usd` billete/directo) + `tipo_cambio_detectado`.
La normalización la hace el FEED en vivo (`precio_normalizado()`). → **Cambiar el TC = cambiar la normalización UNA
vez; TODAS las filas (viejas y nuevas) se re-normalizan solas. NO hay que re-cargar.** Por eso cargar ahora NO es
trabajo perdido.

### Modelo del nuevo régimen (a validar antes de implementar)
Bolivia unifica el oficial ≈ paralelo (Binance). Entonces:
- **"paralelo" detectado → es el oficial NUEVO** (convergieron). Sin trato especial.
- **"oficial" (sin calificar) → es el oficial NUEVO** (el de Binance). Sin trato especial.
- **ÚNICO caso especial = precio anclado al oficial VIEJO** (explícito "6.96" / "Bs 7" / "TC 7"): otro tag,
  necesita conversión (se coticó al rate viejo barato).

Así los tags colapsan a: **default (oficial-nuevo, USD real)** vs **oficial-viejo (6.96/7 explícito → convertir)**.

### La parte delicada (lo que "hay que ver bien") — interacción con la MONEDA del portal
- **Remax trae el precio en USD** (`price_in_dollars`) → ya es USD real = oficial-nuevo. Default limpio.
- **Century21 trae el precio en BOB** → hay que decidir a qué rate convertir:
  - Texto calla → ¿rate unificado nuevo? (BOB / rate_nuevo = USD real).
  - Texto dice "6.96/7" → rate viejo (BOB/6.96), y ESO es lo que después se re-normaliza.
  - **Este es el caso ambiguo a resolver** (el seller que listó en Bs pensando "oficial 6.96" quería más USD real).

### Antes de implementar, definir:
1. El **valor del oficial nuevo** (¿= paralelo de Binance? ¿fijo?).
2. Qué hacer con **C21 en BOB** cuando el texto calla (rate nuevo vs interpretación).
3. Reinterpretación de los precios YA guardados (lo hace la normalización, no un re-read).
4. Si el **default del lector** pasa de `no_especificado` a `oficial-nuevo` (hoy es conservador = no_especificado).

Memorias relacionadas: `precio_paralelo_vs_oficial_billete`, `feedback_clasificacion_tc_por_m2`.
Doc TC: `docs/arquitectura/TIPO_CAMBIO_SICI.md`. Nota FUTURO en `READER_SPEC.md`.
