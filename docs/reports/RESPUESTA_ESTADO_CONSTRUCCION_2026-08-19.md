# Respuesta — estado de construcción en venta (SICI → lab-kapso, 19-ago-2026)

**Respuesta corta: el dato existe y está resuelto desde el 5-ago. El bot está leyendo el campo
crudo en vez de la inferencia.** Sus mediciones son correctas — el 52,4% es real en
`estado_construccion` — pero ese campo **ya no es la fuente que usa el sitio**. La vista
`v_estado_obra_inferido_shadow` (migs 302/303/315) baja ese hueco al **18,4%**, y la RPC del feed
público la usa desde entonces. Las tres RPC del bot, no.

| | no especifica | preventa | entrega inmediata |
|---|---|---|---|
| **hoy** (lo que dice el bot) | **205** | 96 | 90 |
| **con la inferencia** | **72** | 98 | **221** |

Medido sobre las 391 de Equipetrol, hoy. El bot pasaría de *"202 no especifican estado"* a
**"72 no especifican"**, y de 90 a 221 en entrega inmediata.

---

## 1. ¿Es esperable el 52% en NULL? ¿Falló algo del pipeline?

**No falló nada, y sí es esperable — para ese campo.** `estado_construccion` guarda **solo lo que
el aviso dice de forma explícita**. Poco más de la mitad de los avisos no lo dice: es una propiedad
de los anuncios, no una falla de captura.

Lo que cambió es que **dejamos de depender de ese campo**. Desde la mig 302 el sistema infiere el
estado con señales laterales, y la 315 armó una cascada explícita.

## 2. ¿Cómo se llena hoy?

🔴 **La doc que leyeron describe un pipeline que ya no existe.** `merge_canonical.md` §2.1 (v2.4.0)
documenta el enrichment LLM de **n8n**, que está **apagado desde el 28-jul-2026** (el founder dio de
baja Firecrawl y el servidor).

Por eso `llm_output` les dio NULL en las 391 — y no es que el enrichment "no corrió":

```sql
SELECT COUNT(*) AS props_venta_vivas,
       COUNT(*) FILTER (WHERE datos_json_enrichment IS NOT NULL) AS con_enrichment_de_n8n
  FROM propiedades_v2 WHERE tipo_operacion='venta' AND es_activa;
-- → 869 props, 0 con enrichment. El campo entero quedó vacío al apagar n8n.
```

**El mecanismo vigente son dos capas:**

1. **Captura (el reader del híbrido).** Un lector en sesión extrae el estado del aviso cuando el
   aviso lo dice. Escribe `estado_construccion`. Es el 47,6% que tiene dato.
2. **Lectura (`v_estado_obra_inferido_shadow`).** Se calcula **al leer**, no se guarda. Cascada, del
   más fuerte al más débil:

   | origen | qué es | precisión medida |
   |---|---|---|
   | `verificado` | observación humana (`proyectos_master.entrega_verificada`) | lo único afirmable sin reservas |
   | `conflicto_resuelto` | el edificio se contradecía y se dictaminó | — |
   | `aviso` | lo que dice el anuncio, **solo si sigue vigente** | — |
   | `vecinos` | las otras unidades del mismo edificio, unánimes | **96,7%** |
   | `alquiler` | hay alquiler activo en el edificio (no se alquila lo no construido) | **95%** |

   Que se calcule al leer tiene una consecuencia buena: **una propiedad nueva sale inferida sola**, y
   cuando el edificio se entrega, el feed se corrige solo.

## 3. ¿`proyectos_master.estado_construccion` es confiable?

**No lo usen.** Es la trampa natural —190 de sus 205 tienen `id_proyecto_master`— y por eso está
advertido en CLAUDE.md. Backtest rehecho hoy, contra los avisos que sí declaran su estado:

```
casos comparables: 151 · acierta: 131 → 86,8%
```

Pero el número global engaña, porque **los errores no son simétricos**:

| | casos |
|---|---|
| el PM dice **preventa** y el aviso dice **entregado** | **16** |
| el PM dice entregado y el aviso dice preventa | 4 |

El error dominante es **el proyecto master envejecido**: quedó en "preventa" y el edificio ya se
entregó. Nadie lo actualiza cuando la obra termina. Y ese es justo el error caro: decirle a un
cliente que espere dos años por algo que ya está construido.

🔑 **Un edificio no vuelve al pozo.** "Entregado" es evidencia positiva; "preventa" es el default
que nadie actualizó. Por eso la cascada de la inferencia nunca resuelve por mayoría — en HH Once la
mayoría dice preventa y está equivocada.

**El dato duro:** en 34 casos un humano verificó que el edificio ya estaba entregado **mientras el
aviso seguía diciendo preventa**. Al revés: **cero**.

## 4. ¿Es recuperable?

**Ya está recuperado.** El trabajo no es reconstruir el dato: es que el bot lea la vista que el
sitio ya usa.

```sql
-- quién usa la inferencia hoy
buscar_unidades_simple_shadow  → SÍ   (la RPC del feed público)
resumen_mercado                → NO   ┐
buscar_propiedades             → NO   ├ las 3 del bot
buscar_similares               → NO   ┘
```

El patrón a copiar está en `buscar_unidades_simple_shadow`:

```sql
LEFT JOIN public.v_estado_obra_inferido_shadow inf ON inf.propiedad_id = p.id
...
COALESCE(p.estado_construccion::TEXT, inf.estado_efectivo, 'no_especificado')
```

**Esfuerzo:** una migración que agrega ese `LEFT JOIN` a las tres RPC. **Confianza:** alta para
`verificado`/`vecinos`/`alquiler` (96,7% y 95% con backtest); el resto queda en "no especifica"
igual que hoy.

### 🔴 Pero no alcanza con el JOIN — hay que declarar el origen

La vista expone **`estado_origen`** a propósito. Un estado inferido **no se afirma con la misma
fuerza que uno declarado por el aviso**: es la línea del proyecto (`LIMITES_DATA_FIDUCIARIA.md`).

Si el bot va a decir "entrega inmediata" sobre las 131 propiedades que hoy dice que no sabe, tiene
que poder decir **de dónde lo sabe** cuando el cliente pregunte — *"las otras unidades del edificio
están entregadas"*, *"hay alquileres activos en el edificio"*. Con eso el bot gana el dato **sin**
perder lo que lo hace confiable: **sigue sin afirmar lo que no puede sostener**.

Sugerencia concreta: que las RPC devuelvan `estado_origen` junto a `estado_construccion`, y que el
prompt del bot use un calificador distinto según el origen (`verificado` → afirmar · `vecinos` /
`alquiler` → "según el resto del edificio" · `aviso` → "el anuncio indica").

## 5. Los dos vocabularios

Son distintos, y **no a propósito** — es deuda:

| | valores |
|---|---|
| **enum de la unidad** (`estado_construccion_enum`) | `entrega_inmediata` · `preventa` · `construccion` · `planos` · `no_especificado` · `usado` · `nuevo_a_estrenar` |
| **`proyectos_master`** (texto libre, no enum) | `entrega_inmediata` · `no_especificado` · `nuevo_a_estrenar` · `preventa` |

`proyectos_master.estado_construccion` es **TEXT sin constraint**, así que admite cualquier cosa. La
vista de mercado expone el enum de la unidad. Como la recomendación es **no usar el campo del
proyecto master**, unificar los vocabularios no es urgente — pero conviene saber que `nuevo_a_estrenar`
y `no_especificado` no aparecen en el feed porque vienen de la otra tabla.

---

## Resumen

| pregunta | respuesta |
|---|---|
| ¿el 52% indica que algo falló? | **No.** Es real para ese campo, pero ese campo dejó de ser la fuente |
| ¿cómo se llena hoy? | reader del híbrido al capturar + **inferencia al leer**. La doc de n8n está muerta |
| ¿sirve `proyectos_master`? | **No.** 86,8%, y su error dominante es el caro (dice pozo, ya está entregado) |
| ¿es recuperable? | **Ya lo está.** Falta que las 3 RPC del bot hagan el `LEFT JOIN` que el feed ya hace |
| ¿vocabularios? | distintos, es deuda; irrelevante si no usan el campo del proyecto master |

**El cambio no es menor para el cliente**: de 205 "no sé" a 72, y de 90 a 221 entrega inmediata.
Por eso vale hacerlo con el `estado_origen` a la vista y no sólo con el `COALESCE`.

Referencias: `CLAUDE.md` §Estado de obra inferido · migs 302/303/315 ·
`docs/canonical/LIMITES_DATA_FIDUCIARIA.md`
