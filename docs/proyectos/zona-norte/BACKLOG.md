# Backlog — Proyecto Zona Norte

> Tickets pendientes que surgieron de la validación Fase 3+4. Organizados por prioridad y por scope.

**Última actualización:** 29 May 2026 (FASE 1 del #8 aplicada en producción; v4 snapshot descartado).

**🎯 Próxima sesión:** **FASE 5-7 del Ticket #8** — `lib/zonas.ts` (14 microzonas en filtro admin) → workflows n8n ZN → docs. Branch: `feat/zn-microzonas-aplicacion`. NO dependen del snapshot. **Recordar reactivar el workflow `auditoria_diaria_sici_v3.0` en n8n** (se desactivó para la ventana de mig).

---

## Visión del proyecto (post-ADR-009)

**El proyecto Zona Norte deja de ser "piloto aislado" y pasa a ser "prototipo de la arquitectura multi-macrozona de Simón Santa Cruz".**

**Estrategia:** strangler pattern. **Equipetrol producción NO se toca.** Se construye lo nuevo en paralelo:

- `pages/ventas.tsx` (Equipetrol) intacto.
- `pages/mercado/zona-norte/*` se construye nuevo con patrón multi-macrozona.
- Workflows ZN (`*_zonanorte_v1.0.0`) son **los workflows universales multi-macrozona** — leen polígonos activos de BD; agregar Urubó/Polanco = editar 1 array.
- Workflows Equipetrol intactos (siguen procesando solo Equipetrol).

**Coexistencia indefinida.** Migrar Equipetrol al patrón nuevo = decisión futura (3-6 meses), no hoy.

Ver `DECISIONES.md` ADR-009 para detalle completo.

---

## 🟡 Tickets de calidad de matching (paralelos a #8, no bloquean)

> Esta sección era "🔴 Críticos próxima sesión" hasta el 28-may-2026. El #1 fue archivado por otro camino, el #1.5 se completó. El #1.7 sigue vigente como ticket no urgente.

### ✅ #1 — Mejorar criterios de confianza del prompt LLM v4.0 + merge acepta 'media' — **ARCHIVADO 28-may-2026**

> Ver detalle del archivado en sección "#1 — REPLANTEO 28-may-2026 sesión 2 (RESUELTO POR OTRO CAMINO)" más abajo. El problema raíz era otro y se resolvió cargando pm ZN (#1.5).

**Contenido histórico mantenido abajo para trazabilidad de las 3 iteraciones de análisis.**

### #1 — Mejorar criterios de confianza del prompt LLM v4.0 + merge acepta 'media' (versión original)

> **Reformulado tras 3 iteraciones de investigación 27-may-2026.** El ticket original ("Mejorar prompt LLM" / "Decidir A o B") era erróneo — el merge v2.6.0 YA tiene lógica híbrida correcta. La causa raíz real es que el **prompt nunca define criterios** sobre cuándo usar cada nivel de confianza → el LLM lo interpreta binario (alta/null).

**Contexto histórico (revisado git):** El sistema ya tuvo auditoría profunda sobre LLM (commits `dc4e4d7` 24-may, `5d86301` 22-may, `d00129b` 22-may). Decisiones en `docs/backlog/DEUDA_TECNICA.md` "Discovery pisa correcciones del LLM" (AUDITADO Y CERRADO 24-may-2026):

> "⚠ 'El LLM tiene razón' NO es universal. Distinguir por campo:"
> - **dormitorios**: LLM gana (cruda es árbitro)
> - **nombre_edificio**: LLM gana solo si regex sospechoso o no matchea pm (v2.6.0)
> - **estado_construccion, tipo_cambio_detectado**: existing_protected by-design (LLM puede leer aviso viejo)

→ La asimetría LLM-por-campo es **decisión consciente**, no bug. Cualquier cambio al prompt debe respetar esto.

**Datos medidos (27-may-2026):**

Auditoría sobre 824 props con LLM:
- 643 (78%) con confianza='alta'.
- 166 (20%) con confianza=null.
- 15 (2%) con confianza='media'.
- **0 (0%) con confianza='baja'.**

→ El LLM es **binario en la práctica**.

**Impacto real Zona Norte:**
- **135 props ZN con LLM=null** (32% del inventario).
- 22 tienen pattern `edificio-X` / `torre-X` / `condominio-X` en URL.
- 13 contienen nombre de edificio conocido en URL/slug.
- **~30-50 props ZN recuperables** post-fix del prompt.

**Impacto Equipetrol:** 42 props con LLM=null. Mayoría enmascaradas por matching que pisa con `pm.nombre_oficial`. Cambio probable: 0-3 props con cambios visibles.

**Acción (3 capas):**

1. **Agregar bloque al prompt** sobre cuándo usar cada nivel para `nombre_edificio_confianza` ESPECÍFICAMENTE:
   - `alta`: nombre explícito en descripción libre (texto del avisador).
   - `media`: nombre solo en título/URL/slug (señal indirecta pero verificable).
   - `baja`: inferido por modelo/código interno (ej. "modelo MA-8" → "Edificio Mangales").
   - `null`: no hay forma de extraerlo.

2. **NO cambiar criterios para `estado_construccion`, `tipo_cambio_detectado`.** Mantener existing_protected by-design (lecciones de los commits 22/24-may).

3. **Modificar merge** SOLO para `nombre_edificio`: cambiar `v_llm_nombre_edificio_confianza = 'alta'` a `IN ('alta', 'media')` en la rama LLM híbrida.

4. **Re-procesar las 166 props con LLM=null** post-fix del prompt. Algunas extraerán vía título/URL.

**Riesgos:**
- LLM más permisivo con "media" → falsos positivos. Mitigación: definir "media" muy estricto en el prompt (solo URL/título exacto, no inferencia).
- Equipetrol: las 643 con confianza=alta no cambian; algunas con LLM=null podrían reclasificar a "media" en re-procesamiento.

**Prioridad: MEDIA.** ZN ya tiene 388/388 props con nombre (regex backfill manual). El bug afecta calidad, no funcionalidad. Pero la deuda **crece cada noche** con props nuevas.

**Estimación:** 2-3 horas + testing + re-procesamiento (~$3 Haiku).

---

### #1 — RE-ANÁLISIS 28-may-2026 (post-sesión audit GPS)

> **El plan original sigue siendo válido en dirección pero subestimaba el riesgo en Equipetrol.** Re-medición con queries específicas EQ cambió 3 cosas clave del análisis. Plan revisado: staged en 6 fases (A→F) + wording "Opción 1D" estricto + suffix-aware.

#### Lo que cambió respecto al análisis del 27-may

**1. Las 42 props EQ con LLM=null NO son recuperables en su mayoría.**

Auditoría sobre URLs/regex revela: son **casas y terrenos sin edificio**, no departamentos. URLs tipo `casa-en-venta-zona-equipetrol`, `terreno-premium-en-venta`, `casa-comercial-con-locales`, coords como `calle-los-gomeros`. El LLM=null es la respuesta CORRECTA. La estimación "0-3 props con cambios visibles en EQ" era acertada en magnitud, pero por razón distinta a la documentada (no "matching enmascara" sino "no hay edificio que extraer").

**2. Equipetrol tiene 20+ pares de pm con nombres muy parecidos → riesgo de falsos `media` ALTO.**

Pares riesgosos detectados (similarity > 0.45):

| pm A | pm B | Similitud |
|---|---|---|
| Edificio Condado II | Edificio Condado III | 0.95 |
| Smart studio Equipe 3.0 | SMART STUDIO EQUIPE 1.0 | 0.84 |
| Euro Design Le Blanc | Eurodesign Le Blanc | 0.78 (parece duplicado) |
| Edificio Macororó 11 | Edificio Macororó 9 (+ Macororó 5) | 0.70-0.78 |
| Condominio Portofino 1/2/Delux | (3 variantes) | 0.72 |
| Condominio Avanti vs Avanti Deluxe | | 0.72 |
| Omnia Lux vs Omnia Eco Lux | | 0.71 |
| Condominio Sky (5+ variantes: Blue/Luxia/Equinox/Lumiere/Magnolia) | | 0.63-0.75 |
| Edificio ITAIPU vs ITAJU | | 0.63 |

**Implicación:** el blindaje cross-zona NO protege contra confusión cross-pm dentro de la misma zona EQ. Si el LLM con `media` extrae "Condado" sin sufijo, el matching `nombre_exacto` no falla (porque no matchea ninguno literal), pero el matching `fuzzy_nombre` puede generar falsos. Y aunque el matching no aplique, el `nombre_edificio` queda ambiguo en BD.

**3. Las 9 props EQ con `confianza='media'` actuales ya muestran 22% de error LLM.**

Inspección de las 9 props EQ con `media` hoy en BD:
- 7/9 correctas (variantes notacionales: "Sky Luxury" / "Sky Lux", "Stone VI" / "Stone 6", "SOLO" / "SÖLO Industrial Apartments")
- **2/9 EQUIVOCADAS**: prop 1825 con LLM="Edificio San Martin" para edificio real "Torre Real"; prop 1841 con LLM="Equipetrol Day Apartaments & Suites" para "EURODESIGN SUITES".

**Tasa de error en media actual: 22%**. El merge actual ignora `media` → estos errores son invisibles hoy. Si Fase D activa `media` en merge, **el 22% se vuelve visible como falsos positivos**.

#### Plan revisado: 6 fases staged (A→F)

| Fase | Acción | Riesgo | Tiempo |
|---|---|---|---|
| **A — Solo prompt** | Agregar bloque `nombre_edificio_confianza` al prompt (Opción 1D — estricto + suffix-aware). NO modificar merge, NO reprocesar. Activa solo en cron nocturno para props nuevas. | 🟢 Cero (no toca BD) | 30 min |
| **B — Observar 1 noche** | Medir distribución real de `media/alta/null` en props nuevas del día siguiente. | 🟢 Cero | 0 |
| **C — Dry-run focal EQ** | Tomar 10 props EQ con LLM=null actual. Re-correr enrichment LLM con prompt nuevo manualmente (sin pisar BD). Comparar nombres. Si <2 falsos sospechosos → seguir. Si más → ajustar prompt. | 🟢 Bajo | 30 min + ~$0.10 |
| **D — Snapshot + modificar merge** | Crear backup table `_pre_ticket1_snapshot` con (id, nombre_edificio, datos_json_enrichment) de las props a tocar. Modificar `merge_discovery_enrichment` para aceptar `'media'` en rama LLM híbrida de `nombre_edificio` SOLO. | 🟡 Medio | 30 min |
| **E — Reproceso staged** | Reprocesar primero las 135 ZN (zona piloto, menor riesgo). Verificar deltas. Si OK → procesar las 42 EQ. | 🟡 Medio | 1-2h + $3 |
| **F — Plan de rollback** | SQL que restaure desde la backup table si hace falta. Documentado antes de cualquier mudanza. | 🟢 Cero | 15 min |

#### Wording aprobado del prompt (Opción 1D — estricto + suffix-aware)

```
NOMBRE_EDIFICIO_CONFIANZA:
- "alta": nombre EXPLÍCITO en el cuerpo de la DESCRIPCIÓN libre del avisador,
  INCLUYENDO sufijo/número si aplica.
  Ej: "Departamento en Edificio Condado III" con "III" explícito.
- "media": nombre presente SOLO en TÍTULO o URL/slug, NO en descripción,
  PERO incluye sufijo/número que permite identificar el edificio específico.
  Ej: URL `edificio-macororo-11` o título "Venta en Macororó 11".
  Si el nombre tiene número/sufijo y no podés confirmar ese sufijo
  (II vs III, 1 vs 2, Delux vs sin Delux, Lux vs Eco Lux), preferir null.
- "baja": nombre INFERIDO desde código interno, modelo o referencia indirecta
  sin nombre literal en ningún lado. Ej: "monoambiente modelo MA-8".
- null: no hay forma de extraer el nombre completo con sufijo
  desde texto/título/URL/código.
- REGLA ESTRICTA DE SUFIJO: si la zona tiene edificios con nombre similar
  diferenciados por número/sufijo (Condado II vs III, Macororó 5 vs 9 vs 11,
  Portofino 1 vs 2 vs Delux, Smart Studio 1.0 vs 3.0, Avanti vs Avanti Deluxe,
  Omnia Lux vs Omnia Eco Lux, Sky vs Sky Blue/Luxia/Equinox/Lumiere),
  DEBE confirmarse el sufijo literal. Si dudás → null.
- En caso de duda entre niveles → preferir el nivel MÁS bajo
  (alta→media, media→null, null se queda null).
```

**Por qué Opción 1D y no 1A (estricto simple):** EQ tiene mucha más densidad de pm con sufijos discriminantes que ZN. Sin "suffix-aware" se abre la puerta a falsos del tipo Condado II → III (similitud 0.95).

**Por qué no Opción 1C (no introducir media):** ZN se beneficia del `media` para recuperar las ~30-60 props donde el nombre aparece solo en título/URL. Renunciar a `media` reduce el beneficio del ticket a cero.

#### Asimetría EQ vs ZN — costo/beneficio actualizado

| Aspecto | Zona Norte | Equipetrol |
|---|---|---|
| Props target (LLM=null) | 135 | 42 (mayoría casas/terrenos) |
| Recuperaciones esperadas | 30-60 | 0-3 |
| Densidad pm/zona | Baja (39 pm) | Alta (290+ pm) |
| Pares pm riesgosos | 0 detectados | 20+ detectados |
| Sensibilidad a falsos `media` | Baja | Alta (22% error en muestra actual) |
| **Beneficio neto del ticket** | 🟢 Alto | 🟡 Marginal o negativo si wording no es estricto |

**Implicación de prioridad:** el ticket #1 tiene **prioridad ALTA para ZN** (target real, riesgo bajo) y **prioridad BAJA para EQ** (sin target real, riesgo alto si wording flojo). Wording Opción 1D busca proteger EQ mientras habilita ZN.

#### Plan de rollback documentado (Fase F)

Antes de Fase D:
```sql
CREATE TABLE _pre_ticket1_snapshot AS
SELECT id, nombre_edificio, datos_json_enrichment, NOW() AS snapshot_at
FROM propiedades_v2
WHERE datos_json_enrichment->'llm_output'->>'nombre_edificio_confianza' IS NULL
   OR datos_json_enrichment->'llm_output'->>'nombre_edificio_confianza' = 'media';
```

Si algo sale mal post-reproceso:
```sql
UPDATE propiedades_v2 p
SET nombre_edificio = s.nombre_edificio,
    datos_json_enrichment = s.datos_json_enrichment
FROM _pre_ticket1_snapshot s
WHERE p.id = s.id;
-- Si también hay que revertir el merge, dropear cambios en sql/functions/merge/
```

#### Estado actual del ticket

- **Fase A**: pendiente — aprobado wording Opción 1D, falta editar `scripts/llm-enrichment/prompt-ventas.md` y verificar propagación a n8n.
- **Fases B-F**: pendientes.

---

### #1 — REPLANTEO 28-may-2026 sesión 2 (RESUELTO POR OTRO CAMINO)

> **El ticket #1 no fue ejecutado. El problema se resolvió por una solución completamente distinta tras medir los datos REALES.**

Pregunta del usuario clave: *"¿Estamos complicando las decisiones del LLM?"* — Sí, estábamos.

#### Lo que medimos (que cambió el camino)

Antes de tocar el prompt, query directa sobre las 279 props ZN sin match reveló:
- **70% (195/279) TIENEN nombre extraído** (por LLM o regex) **pero no existe pm para ese edificio**.
- **30% (84/279) sin nombre** — de los cuales 59 con LLM=null (probable correcto), 14 LLM no corrió, 11 limbo.

**El LLM no era el cuello de botella.** El 70% de las props sin match tenían el nombre bien pero faltaba cargar el pm.

#### Solución aplicada (sin tocar prompt ni merge)

| Acción | Resultado |
|---|---|
| Aliases por nombre exacto (MACORORO 15 → pm 361, Vila Real DUO → pm 353) | +4 props matched |
| Limpiar `Venta` basura del regex (6 props) | ruido limpiado |
| Mover pm 276 Sky Icon de Equipetrol Centro → Zona Norte (estaba en zona errada, cluster de 4 props ZN era el GPS real) | +4 props matched, 1 prop EQ con aviso terminado marcada `inactivo_confirmed` |
| INSERT 11 pm nuevos compactos (Edificio Raizant Botanic con alias RAIZANT BOTANIC, Jazmines del parque - Torre 3, ORANGE RESIDENCE, Gaudí Tower, CONDOMINIO DISART, Condominio Torres Gemelas, Condominio La Sierra, Cond. Ecosostenible Lusitano, Condominio Gran Grigotá, CONDOMINIO TRIBU URBANA, Condominio RISE Uno) con `gps_verificado_visual=NULL` (pendientes verificación visual) | +29 props matched |
| Verificación visual de los 12 pm pendientes (HTML `verify-pm-nuevos-zn.html`) | 12/12 confirmed, 3 GPS corregidos con coords Maps usuario (pm 375, 377, 380) |

**Resultado total:** match rate 28.6% → **38.1%** (+9.5 pp) en 30 min, sin tocar prompt LLM ni merge, sin riesgo en Equipetrol.

#### Por qué el ticket #1 (plan original) ya NO se necesita

- El target principal del ticket #1 era recuperar nombres en las props con LLM=null. Pero al medir, vimos que casi todas las que el LLM clasificó null era porque NO TENÍAN edificio (casas, terrenos, listings genéricos). El LLM hizo bien su trabajo.
- El 70% del problema era falta de pm, no calidad del LLM. Se resuelve con `INSERT` + aliases, mucho más simple y barato.
- Modificar el prompt LLM + merge con criterios "media" suffix-aware introducía riesgo en Equipetrol (22% error medido en muestra) por un beneficio marginal (~10-20 props recuperadas vs +37 con el camino simple).

#### Estado final del ticket #1

**Estado: ARCHIVADO COMO INNECESARIO POR AHORA.** No se ejecutó porque el problema raíz era otro. Si en el futuro emerge un patrón donde nombres reales solo aparezcan en URL/título (y se pueda extraer con confianza media sin riesgo), reabrir.

#### Lección meta principal

**Medir antes de optimizar.** Habíamos pasado horas diseñando un plan staged de 6 fases (A→F) con wording suffix-aware "Opción 1D" para mitigar 20+ pares de pm parecidos en Equipetrol, plan de rollback con snapshot table, y dry-run focal. Todo eso era resolver un problema que NO era el cuello de botella real. Una sola query con `GROUP BY CASE WHEN nombre_edificio IS NULL THEN ... ELSE ...` lo demostró.

La intuición correcta del usuario fue: *"explicame el problema que estamos tratando de resolver"* — al reformular y medir, se vio que era otro problema.

---

### #1.7 — Detector automático de clusters emergentes (infraestructura para no cargar pm manual)

> **Pregunta del usuario que motivó este ticket (28-may-2026 sesión 2):** *"el trabajo de match se tiene que hacer, pero ¿hay una manera más eficiente o solo con Places?"*

**Contexto:** las 2 sesiones de hoy mostraron que cargar pm uno a uno funciona pero **no escala**. Sesión 1: 20 pm. Sesión 2: 12 pm + aliases. Match rate subió de 19.7% a 40.7%. Cada noche llegan props con nombres nuevos que requieren carga manual. Necesitamos que el sistema **detecte solo cuándo emerge un cluster** y nos avise.

**Qué construir:**

1. **Función SQL** `detectar_clusters_emergentes(p_zona text)` que devuelve nombres de edificio con:
   - `COUNT(*) >= 3` props en BD con ese nombre + sin pm + same zone
   - Dispersión GPS interna `< 30m` (cluster real, no GPS falsos)
   - `MIN dist a pm más cercano > 100m` (no son alias de pm existente)

2. **Workflow n8n semanal** (lunes 8 AM Bolivia):
   - Llama `detectar_clusters_emergentes('Zona Norte')` y `('Urubó')`, etc.
   - Para cada candidato: `INSERT INTO proyectos_master` con `gps_verificado_visual=NULL`, GPS centroide, `gps_verificacion_notas='Detector automatico — pendiente verificacion visual'`.
   - Manda mail/Slack al user con link a HTML.

3. **HTML genérico `verify-pm-pendientes.html`** que lee de BD los pm con `gps_verificado_visual IS NULL` (sin data hardcoded como los actuales). Endpoint API simple `/api/admin/pm-pendientes` que devuelve JSON.

**Beneficios:**
- Escalable a Urubó, Polanco, futuras macrozonas (sólo cambia la zona en el cron).
- Vos solo dedicás ~15 min/semana a verificar los nuevos en HTML.
- Reduce ~80% del trabajo manual de las sesiones tipo hoy.

**Riesgos:**
- Si el detector mete pm falsos (cluster compacto de un nombre genérico), tu verificación visual los frena. La columna `gps_verificado_visual=NULL` los aísla del flujo confiable hasta que vos los apruebes.
- Necesita testing inicial para calibrar umbrales (3 props? 5? dispersión <30m? <50m?).

**Costo:** $0. Todo SQL + cron n8n + HTML existente extendido.

**Estimación:** 2-3 horas de construcción + 1 semana de observación calibrando umbrales.

**Prioridad: MEDIA-ALTA, pero NO bloquea #8 microzonas ni #6 frontend.** Puede ir en paralelo. Recomendado construirlo después de #8 para tenerlo listo cuando llegue Urubó/Polanco y la carga manual se vuelva ineficiente.

---

### ✅ #1.5 — Cargar proyectos master para edificios reconocibles de Zona Norte — **COMPLETADO 28-29 may-2026**

> **73 pm verificados al 100% visualmente.** Match rate ZN venta subió de 19.7% a 60.6%. Ver BITACORA entradas 28-may y 29-may. Las 3 micro-cargas finales del 29-may (STONE 7, Sky Line, Mangales Blue) cierran el ticket.

**Contexto histórico mantenido abajo para trazabilidad metodológica.**

### #1.5 — Cargar proyectos master para edificios reconocibles de Zona Norte (versión histórica)

> **Ataque alternativo/complementario al #1.** Beneficio inmediato y visible.

**Contexto:** ADR-003 decidió arrancar ZN sin proyectos master. Pero el dark launch reveló que **muchos edificios ZN son recurrentes** y reconocibles. Cargarlos como `pm` elimina el problema "sin match" de raíz para esas props.

**Cuando hay match → matching pisa `nombre_edificio` con `pm.nombre_oficial` → no importa qué haya extraído el regex.** Es el mecanismo que protege Equipetrol del bug del regex.

**Edificios candidatos (visible en el inventario ZN actual):**

Identificados en el dark launch de hoy (con conteo de props):
- EDIFICIO K1 (3 props reales — el resto fue cleanup)
- Mangales Blue 2 (9+)
- HH HOME (14)
- Essenzia (6+)
- Vilareal Duo (8)
- Torre Moderna (9)
- Community Alto Norte (12)
- Blue Garden (6)
- STONE 4 (5)
- BLESS TOWER (5)
- Torres Evolution (5)
- Raizant Blend / Botanic (5)
- Ergo Experience (6)
- Sky Icon (4 — el real, no el cross-zona Equipetrol)

**Beneficio si se carga (~14 pm):**
- 100+ props ZN matchean automáticamente → `nombre_edificio` correcto vía `pm.nombre_oficial`.
- Cobertura de ~25% del inventario ZN.
- Elimina la dependencia del bug del regex para esas props.
- Habilita estudios de mercado por edificio.

**Precaución crítica detectada 27-may-2026:** **los GPS de las props NO son siempre confiables.** Los agentes a veces cargan GPS falsos. Análisis de cluster reveló:

- ~15 edificios con **dispersión GPS <50m** (confiables): Mangales Blue 2, Vilareal Duo, HH HOME, Blue Garden, Domus Luxury, BLESS TOWER, Torres Evolution, Sky Icon, KERONI, Essenzia, K1, ZIRI ZWEI, Macororo, Galil Parque III, ONE.
- 4-5 edificios con **dispersión >100m** (dudosos): Community Alto Norte (270-696m), STONE 4 (930-1015m), Curupaú Isuto (492-1588m), Cantabria (501m).

**Causa de dispersión:** condominio multi-torre, GPS falso de agente, o mismo nombre en edificios distintos.

**Acción refinada — metodología 3 pasos:**

**1. Auto-cargar solo los confiables (cluster <50m):**
- Calcular centroide GPS (promedio).
- INSERT en `proyectos_master` con `zona='Zona Norte'`, `nombre_oficial`, `latitud=centroide_lat`, `longitud=centroide_lon`, `activo=true`, `gps_verificado_google=false`.
- ~15 pm cargados → cobertura ~25% inventario ZN.

**2. Verificación con Google Places (post-INSERT):**
- El sistema YA tiene infraestructura: `gps_google_lat`, `gps_google_lng`, `gps_discrepancia_metros`, `gps_verificado_google`.
- Correr el verificador (función o workflow existente) sobre los nuevos pm.
- Si Google confirma GPS → flag `gps_verificado_google=true`.
- Si Google dice GPS muy distinto (>200m) → marcar para revisión admin.

**3. Dudosos (dispersión >100m): NO cargar automático**:
- Listar en `docs/proyectos/zona-norte/pm-pendientes-revision.md`.
- Admin revisa caso por caso (puede ser 1 condominio multi-torre que merece 2-3 pm distintos, o GPS falso a descartar).

**4. Re-correr matching:**
- Las props con GPS dentro de 250m del pm matchean automáticamente (matching GPS).
- Las sugerencias caen a `pendiente_zn` (HITL separado por mig 253) para validación humana opcional.

**Riesgo:** **BAJO** si se respeta el filtro de cluster <50m. **MEDIO** si se cargan dispersos sin revisión.

**Estimación:**
- Solo confiables (15 pm): 1-2 horas (query + INSERT + verificación Google + matching).
- Con dispersos revisados manual: +2-3 horas.

**Recomendación:** ejecutar **ANTES** del #1. Beneficio más rápido y concreto. Si #1.5 cubre el 25% del inventario, el #1 ataca el 7-15% restante (cola larga de edificios únicos).

---

## 🟡 Tickets medianos (post-validación piloto)

### #2 — Catalogar los 22 proyectos satélite "Sin zona"

**Contexto:** del backfill quedaron 22 proyectos master con `zona='Sin zona'` (edificios físicamente fuera del polígono Equipetrol pero cerca). Ejemplos: Brickell 7, Riviera 155, Portofino, Swissôtel, Sirari, etc.

**Decisión pendiente:**
- Ampliar el polígono Equipetrol para incluirlos.
- Crear polígonos para zonas vecinas (Polanco, Las Palmas, etc.).
- Aceptar "Sin zona" como categoría y darles tratamiento especial.

Sin esto: matching automático no los toca (blindajes filtran zona estricta).

**Estimación:** 1-2 horas decisión + ejecución.

---

### #3 — Subir verificador throttle (Fase 6 PRD)

**Contexto:** verificador venta tiene `LIMIT 150/noche`. Equipetrol normal procesa ~3-5 pending. Zona Norte agregará 30-50 nuevas pending/día.

**Acción:** subir a `LIMIT 200/noche` para tener margen.

**Cuándo:** cuando el verificador empiece a tener backlog (>50 pending viejos).

**Estimación:** 5 min — cambiar LIMIT en `flujo_c_verificador_v2.0.0.json`.

---

## 🟢 Tickets de producto (post-piloto)

### #4 — Crear UI para HITL Zona Norte

**Contexto:** desde mig 253, las sugerencias ZN están en `estado='pendiente_zn'`, NO en el HITL Equipetrol (`/admin/supervisor/matching`).

**Tres opciones documentadas en README:**

1. **UI separada:** `/admin/supervisor/matching-zona-norte` filtrada por `estado='pendiente_zn'`.
2. **Toggle/dropdown** en UI actual de matching: alternar Equipetrol / ZN.
3. **Migración total:** `UPDATE estado='pendiente' WHERE estado='pendiente_zn'` + DROP trigger.

**Cuándo:** cuando las pendientes ZN crezcan a >200 o post-ejecución de #1.5 (donde van a crecer mucho).

**Estimación:** 1-2 horas según opción elegida.

---

### #5 — Exposición pública de Zona Norte

**Contexto:** hoy ZN es dark launch. Frontend `/ventas` filtra solo Equipetrol. Admin tiene "Zona Norte (piloto)" via `ZONAS_ADMIN_FILTER` (commit `115b1e5`).

**Niveles de exposición:**

- **Mínimo (actual):** admin filter solo.
- **Beta soft:** agregar a `ZONAS_CANONICAS` para que aparezca en filtro público pero sin promoción (sin landing dedicada, sin SEO).
- **Producción completa:** rutas `/mercado/zona-norte/*`, SEO ad-hoc, copy hardcoded ajustado, mapa con bounds dinámicos.

**Bloqueador:** validar calidad data ≥90 días post-Fase 3 (regla 12 CLAUDE.md).

**Cuándo:** post-validación piloto + decisión de producto.

**Estimación:**
- Beta soft: 1 línea + 30 min validar.
- Producción completa: 1-2 semanas.

---

### #6 — Construir `/mercado/zona-norte` (prototipo del patrón multi-macrozona)

**Reformulado tras ADR-009:** ya no es "preview privada" — es **el primer prototipo del patrón `/mercado/[macrozona]` que escalará a Urubó/Polanco/etc.**

**Decisión clave:** NO requiere tocar `pages/ventas.tsx` (intacto, Equipetrol sigue ahí). Se construye página y componente **nuevos** en paralelo.

**Arquitectura propuesta:**
```
pages/
├── ventas.tsx                            ← Equipetrol, INTACTO
├── mercado/
│   ├── equipetrol/                       ← rutas existentes, INTACTAS
│   │   ├── index.tsx
│   │   ├── ventas.tsx
│   │   └── alquileres.tsx
│   └── zona-norte/                       ← NUEVO
│       ├── index.tsx                     ← hub (similar a equipetrol/index)
│       └── ventas.tsx                    ← feed específico ZN
components/
└── mercado/
    └── FeedMacrozona.tsx                 ← NUEVO componente reusable
                                            (lo consume mercado/zona-norte/ventas)
```

**Fases:**
1. **Fase A — Privado por token** (mientras se valida calidad):
   - URL: `/mercado/zona-norte/ventas?token=zn-piloto`.
   - SSR valida token, si no hay → 404.
   - `noindex` + sin links desde landing.
2. **Fase B — Beta soft** (post-validación piloto):
   - URL pública sin token.
   - `noindex` removido.
   - Sin promoción activa todavía.
3. **Fase C — Producción completa**:
   - Link desde landing.
   - SEO ad-hoc.
   - Branding global "Simón Santa Cruz" (decisión separada).

**Componente `<FeedMacrozona>` requisitos:**
- Acepta prop `macrozona`.
- Aplica filtros por microzona dentro de esa macrozona.
- Mapa con bounds dinámicos según macrozona.
- Cards idénticas (estilo, formato, comportamiento) al feed Equipetrol actual.
- Reusable: cuando llegue Urubó, `/mercado/urubo/ventas` lo consume con `macrozona="Urubó"`.

**Estimación:**
- Fase A (privado token): 3-4 horas.
- Fase B (publicar): 30 min (remover noindex, agregar a sitemap).
- Fase C (branding global): scope mayor, separado.

**Prioridad:** ALTA en cuanto se quiera mostrar ZN visualmente a alguien. Hoy podés usar `/admin/propiedades` como sustituto temporal.

---

### #7 — Fase 5 PRD: Alquiler Zona Norte

**Contexto:** Fase 3+4 cubrió venta. Falta replicar para alquiler:
- Workflows: `flujo_discovery_c21_alquiler_zonanorte.json`, `flujo_discovery_remax_alquiler_zonanorte.json`, `flujo_discovery_bien_inmuebles_alquiler_zonanorte.json`.
- Endpoint base SC + filtro polígono GPS.
- Adaptar prompt LLM alquiler v2.0 con PROYECTOS CONOCIDOS de ZN.

**Bloqueador:** validar venta primero (Fase 4 confirma calidad de data).

**Estimación:** 2-3 horas (es replicar el patrón de venta).

---

### #8 — Definir microzonas de Zona Norte (subdivisión + refinar polígono macro) — **FASE 1 APLICADA ✅ · FASES 2-4 DESCARTADAS · FASES 5-7 PENDIENTES**

**Estado al 29-may-2026 (aplicación):**
- ✅ **FASE 1 (mig 254) aplicada en producción.** 8/8 CHECKs, EQ intacto (CHECK 5 diff=0), 520 props + 73 pm redistribuidos en 14 microzonas (0 en gaps), trigger HITL `pendiente_zona_norte`. Commit `3a8309f`. Se fixeó un bug `LATERAL`-sobre-target al aplicar (ver BITACORA).
- 🗑️ **FASES 2-4 (snapshot v4 + paralelización) DESCARTADAS.** La constraint `(fecha,dorm,zona)` impide coexistir v3/v4 en `zona='global'` sin pisar el feed público; y el `INNER JOIN` de v4 duplicaba `Equipetrol Norte` (2 polígonos). La paridad del enfoque dinámico se validó **compute-only** (diff=0) y **v3 sin cambios ya genera las series por-microzona ZN** (12 microzonas con venta). No se necesita v4. mig 255 marcada `NO APLICAR`. El agregado `global_zona_norte` → ticket #12.
- ⬜ **FASES 5-7 pendientes:** frontend `lib/zonas.ts`, workflows n8n ZN, docs.

**Estado histórico del diseño (mantenido para trazabilidad):** ✅ Diseño y plan de implementación cerrados.

- **Documento maestro de implementación:** `docs/proyectos/zona-norte/PLAN_IMPLEMENTACION_MICROZONAS.md`
- **Migración SQL preparada:** `sql/migrations/254_microzonas_zona_norte.sql`
- **Rollback preparado:** `sql/migrations/254_microzonas_zona_norte_rollback.sql`
- **Refactor snapshot paralelo:** `sql/migrations/255_snapshot_absorcion_v4_dinamico.sql`
- **Canonical zonas ZN:** `docs/canonical/ZONAS_ZONA_NORTE.md`
- **ADR-010** ("EQ y ZN son macrozonas hermanas operativamente") en `DECISIONES.md`

**Resultado del diseño (14 microzonas, no 4 como inicialmente):**
- Grilla 4×3 + 2 (anillos viales × avenidas longitudinales).
- Recortadas con `ST_Difference` para no solapar con EQ (overlap residual 4 m²).
- 73 pm y 393 props venta activas distribuidos sin pérdida.
- 5 microzonas hoy vacías (lado Mutualista + 8vo anillo extremo) — captarán oferta cuando discovery se expanda.

**Decisiones tomadas:**
- Camino **A simple** (zonas hermanas, no jerárquico). ADR-010.
- Camino **B refactor snapshot** con paralelización filter_version=4 (escalable a futuras macrozonas).
- Camino **W** (3 mejoras chicas + ticket #11 para refactor escalable completo).

**Estimación de aplicación:** ~7h en sesión 1 + 14 días paralelización pasiva + 30 min switch final.

**Hallazgos durante el diseño** que generaron tickets nuevos:
- #11 nuevo: refactor zonas dinámico (sistema escalable).
- Bug latente en `insertar_proyectos_aprobados()` (zona='Equipetrol' sin sufijo, no existe en CHECK).
- Bug latente en `resumen_mercado()` y `buscar_propiedades()` (falta 'Eq. 3er Anillo' en `zonas_canon`).

---

### #11 — Refactor de zonas a sistema dinámico (escalabilidad multi-macrozona)

**Motivación:** Hoy agregar una macrozona o microzona requiere tocar **7 lugares diferentes**: CHECK constraint, lib/zonas.ts, workflows n8n, snapshot, HITL trigger, operacion.md, scripts. No escala a partir de 3-4 macrozonas.

**Trigger para activar este ticket:** cuando se confirme la siguiente macrozona (Urubó/Polanco/otras). Antes de eso, este ticket es OPCIONAL — el modelo plano actual aguanta 1-2 macrozonas más con esfuerzo aceptable.

**Scope** (~1 semana, dividido en sesiones):

**Fase 1 SQL (~5h, alto valor):**
- Refactor `snapshot_absorcion_mercado_v4()` → switch desde v3 deprecated (cuando paridad confirmada 14 días).
- CHECK `zona_valida` → FK contra `zonas_geograficas.nombre` (eliminar lista hardcoded).
- Agregar campos `incluir_en_discovery BOOLEAN`, `incluir_en_global BOOLEAN`, `prioridad INT` a `zonas_geograficas`.
- Backfill esos campos para zonas existentes.
- Refactor `resumen_mercado()` y `buscar_propiedades()` para que `zonas_canon` sea dinámico por `zona_general` (arregla bug latente de falta 'Eq. 3er Anillo').
- Investigar y arreglar `insertar_proyectos_aprobados()` que asigna `zona='Equipetrol'` sin sufijo.

**Fase 2 Workflows n8n (~6h):**
- Workflow discovery único que lee de BD `WHERE incluir_en_discovery=TRUE`.
- Deprecar workflows separados por macrozona (Equipetrol exclusivo + ZN exclusivo → uno solo dinámico).

**Fase 3 Frontend (~1-2 días):**
- Endpoint `/api/zonas` (cacheable, paginado si necesario).
- Hook `useZonas()` con React Query.
- Reemplazar hardcoded en `lib/zonas.ts` por consumo dinámico.
- Reemplazar `ZONAS_ZONA_NORTE` static export por fetch.

**Beneficio:** agregar nueva macrozona pasa a ser **1 sola operación**:
```sql
INSERT INTO zonas_geograficas (nombre, zona_general, geom, activo, incluir_en_discovery, incluir_en_global)
VALUES ('Urubó Sur', 'Urubó', ST_GeomFromGeoJSON(...), TRUE, TRUE, TRUE);
```
El workflow, snapshot, HITL, frontend y filtros se actualizan automáticamente.

**Riesgo de NO hacerlo:** deuda técnica acumulativa. Cada macrozona nueva toma 3-4x más esfuerzo del necesario. Ver inventario completo en `PLAN_IMPLEMENTACION_MICROZONAS.md` sección "Inventario del hardcoding actual".

**Estimación:** ~1 semana repartida en 3 sesiones.

---

### #12 — Agregado snapshot `global_zona_norte` (reemplaza la "paralelización v4" descartada)

**Contexto:** el 29-may se descartó la mig 255 (snapshot v4 paralelo). Motivo: la unique constraint de `market_absorption_snapshots` es `(fecha, dorm, zona)` (sin `filter_version`), así que v3 y v4 no pueden coexistir en `zona='global'` sin que v4 pise la serie de producción que consumen `/admin/market` **y el feed público** `/mercado/equipetrol/ventas`. Y el `INNER JOIN` de v4 duplicaba `Equipetrol Norte` (2 polígonos, mismo nombre).

**Lo que YA está cubierto sin hacer nada:** la función v3 actual genera las series **por-microzona ZN** automáticamente (su LOOP 2 itera `DISTINCT zona`). 12 microzonas ZN con venta `completado` → 12 series al correr el cron.

**Lo que falta (este ticket):** un **agregado por macrozona** `zona='global_zona_norte'` (las 14 microzonas sumadas), análogo a `'global'` para EQ. Solo hace falta cuando se construya el frontend ZN (#6).

**Opciones de implementación (decidir cuando se active):**
- **Opción simple (recomendada):** agregar al LOOP 1 de v3 un bloque que, además de `'global'` (EQ), compute y escriba `'global_zona_norte'` usando el filtro dinámico `p.zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte' AND activo=TRUE)`. Es additive (fila nueva, no pisa `'global'`). **La paridad del enfoque dinámico ya se validó (diff=0 compute-only).** Cuidado: `'global_zona_norte'` aparecería en `zonaRows` de `/admin/market` (filtra `zona!=='global'`) — decidir si se filtra o se acepta.
- **Opción escalable:** parte del ticket #11 (snapshot dinámico por `zona_general` + agregar `filter_version` a la constraint + filtrar versión en los 2 consumidores). Más caro, hacerlo cuando llegue Urubó.

**NO hacer:** revivir la mig 255 tal cual (tiene el bug del JOIN y el choque de constraint).

**Validación previa hecha (29-may):** paridad EQ dinámico vs v3 = diff=0 en activas/absorbidas/pending/nuevas × 4 dorms. Serie ZN tendría 379 activas (48/180/106/45).

**Prioridad:** BAJA. No bloquea nada. Se activa con #6 (frontend ZN).

**Estimación:** Opción simple ~1h + verificar dashboard. Opción escalable: dentro de #11.

---

### Deuda menor — `Equipetrol Norte` tiene 2 polígonos en `zonas_geograficas`

Detectado el 29-may al validar el snapshot. `zona_general='Equipetrol'` tiene 7 polígonos / 6 nombres únicos — `Equipetrol Norte` está duplicado. **Inofensivo hoy** (producción usa `ST_Contains`/`LIMIT 1` o `IN`, no JOIN-por-nombre que cuente). Solo mordería a quien escriba un `JOIN zonas_geograficas ON nombre` + agregación (fue el bug de la mig 255 v4). Revisar si los 2 polígonos deberían fusionarse o si son intencionales (cobertura geográfica partida).

---

### #13 — Blindaje matching a nivel `zona_general` en vez de microzona

**Contexto:** El matching está blindado con `p.zona = pm.zona` (ADR-006, migs 251/252) — diseñado cuando ZN era **un solo polígono**, para evitar contaminación **cross-macrozona** (un edificio ZN con nombre igual a uno de EQ). La **mig 254** subdividió ZN en 14 microzonas; ahora `p.zona = pm.zona` exige igualdad de **microzona**, lo que bloquea matches **intra-ZN legítimos** cuando la prop y su pm caen en microzonas vecinas distintas (los GPS de los pm se corrigieron a mano al edificio real, distinto del GPS de los listings).

**Datos medidos (29-may, post-mig 254):**
- **69 de 255 props ZN matched** tienen `p.zona ≠ pm.zona`. **NO corren peligro**: el PASO 8 de `matching_completo_automatizado()` auto-rechaza sugerencias de props ya matched (el matching solo asigna, nunca desmatchea). El `id_proyecto_master` persiste.
- **Riesgo futuro acotado:** de 112 props ZN sin match con pm cercano (<250m), 109 matchean igual (misma microzona) y **solo 3 se pierden** por el blindaje a nivel microzona.

**Funciones con el blindaje `p.zona = pm.zona`:** `generar_matches_gps`, `generar_matches_por_nombre`, `generar_matches_fuzzy`, `generar_matches_trigram` (verificar cada una).

**Fix propuesto:** cambiar el blindaje de `p.zona = pm.zona` a **misma macrozona** vía `zona_general`:
```sql
-- En vez de:  AND p.zona = pm.zona
-- Usar:       AND EXISTS (SELECT 1 FROM zonas_geograficas zp JOIN zonas_geograficas zm
--               ON zp.zona_general = zm.zona_general
--               WHERE zp.nombre = p.zona AND zm.nombre = pm.zona)
-- (o cachear zona_general en propiedades_v2/proyectos_master para no joinear 2x)
```
Esto restaura el matching intra-ZN sin reabrir la contaminación cross-macrozona (EQ↔ZN siguen separados por `zona_general`).

**⚠️ Riesgo del fix:** estas funciones **también procesan Equipetrol**. Pasar a `zona_general` permitiría matchear, dentro de EQ, una prop de `Equipetrol Centro` con un pm de `Sirari` (ambos `zona_general='Equipetrol'`) si están a <250m — hoy NO matchean cross-zona EQ. Puede ser deseable (edificios en borde de zona) o introducir falsos. **Analizar impacto en EQ antes de aplicar** (medir cuántos matches nuevos cross-zona EQ aparecerían y si son correctos).

**Prioridad: BAJA.** 3 props afectadas hoy. Reconsiderar si el match rate ZN futuro se estanca o el problema crece con más microzonas/macrozonas. Encaja naturalmente dentro del refactor del **ticket #11** (sistema de zonas dinámico).

**Estimación:** 2-3h (fix + medición de impacto EQ + testing) si se hace aislado; o dentro de #11.

---

## ⚪ Investigación / no priorizar

### #9 — Causa raíz del re-fetch bucle al usar query param + ventas.tsx

**Contexto:** intento 27-may de hacer `/preview/zn-piloto-mayo2026 → /ventas?_zn_preview=1` causó bucle de re-render. Posible hydration mismatch + `fetchProperties` con dependencias circulares.

**Investigación:** entender la causa exacta para hacer un refactor robusto cuando se implemente #6.

**Estimación:** 1-2 horas debug.

---

### #10 — Fix bug del regex en `flujo_b_processing_v3.0` (BLACKLIST_CRITICA) — NO PRIORIZAR

> **Ticket movido de crítico → no priorizar tras investigación 27-may.**

**Contexto:** el flujo B tiene una `BLACKLIST_CRITICA` que SUPONE filtrar "preventa", "venta", "moderna", etc., pero no funciona. El regex extrae estas palabras como `nombre_edificio` y las mete en `datos_json_enrichment`.

**Por qué NO priorizarlo:**
- Perseguir cada palabra mala del regex es **jugar al topo** (parche infinito).
- El #1 (mejorar prompt LLM) y #1.5 (cargar pm ZN) **atacan el síntoma de forma estructural**.
- Tocar el flujo B en producción es RIESGO ALTO (workflow crítico que procesa todas las zonas).

**Cuándo reconsiderar:** si después de aplicar #1 y #1.5 todavía aparecen casos problemáticos visibles. Por ahora, dejar como deuda conocida.

**Estimación:** 2-3 horas + testing en sandbox de n8n (si alguna vez se hace).

---

## Tickets ya resueltos hoy 27-may-2026

- ✅ Bug discovery Equipetrol marcando ZN como pending (commit `fb78d23`)
- ✅ Blindaje `generar_matches_trigram` cross-zona (mig 252)
- ✅ HITL separado ZN vs Equipetrol (mig 253 + trigger)
- ✅ Limpieza props legacy backfilleadas con status confirmed/excluida
- ✅ Reversión 15 cross-zona aplicados + archivado en `obsoleto_cross_zona`
- ✅ Reversión 52 K1 falsos
- ✅ Backfill `nombre_edificio` con `llm_output` (acotado a ZN)
- ✅ Agregado "Zona Norte (piloto)" a `ZONAS_ADMIN_FILTER` (commit `115b1e5`)
- ✅ Doc `operacion.md` con kill-switch + monitoreo diario
- ✅ Investigación profunda del prompt LLM + criterios de confianza (documentado en #1, no aplicado fix)

## Tickets resueltos 28-may-2026 — auditoría completa GPS

Sesión larga de audit + cleanup + carga de pm + verificación visual con herramienta nueva.

### Cleanup adicional matching legacy (post-blindaje 251/252)

- ✅ **K1 (pm 272) — 54 falsos positivos restantes** desmatcheados (el cleanup del 27-may fue parcial). Quedaron 8 props reales con GPS coherente <100m del pm.
- ✅ **STONE 4 (pm 268) — 3 falsos** desmatcheados (2 eran STONE 7, 1 URL genérica). Quedan 8 reales.
- ✅ **CURUPAU ISUTO (pm 271) — 2 falsos** desmatcheados (URLs genéricas). Quedan 8 reales.
- ✅ **Cross-zona restantes** — 5 props matched a pm de Equipetrol limpiadas (deuda pre-blindaje).
- ✅ **Nombres basura en `nombre_edificio`** — 32 props con "Preventa"/"Moderna"/"Venta"/"Con" nuleadas o backfilleadas (las 9 "Moderna" eran "Torre Moderna" recuperables vía URL).
- ✅ **Re-merge masivo de 147 props ZN** con `nombre_edificio = NULL` para que el LLM re-popule el nombre (recuperó +73 nombres reales).

### Ticket #1.5 ejecutado — 20 pm cargados

- ✅ INSERT de 20 pm con cluster GPS <100m de dispersión (centroides de props matched).
- ✅ Matching automático same-zone (`generar_matches_por_nombre`) re-corrido: +47 props matched a los pm nuevos (de 77 a 124).
- ✅ Aliases configurados para HH HOME (`'HH HOME'`), Essenzia (`'Essenzia'`).

### Verificación GPS automática + visual (38 pm ZN)

- ✅ **Nueva herramienta `scripts/verify-pm-gps/`** — verificación gratuita de GPS de pm vía Overpass API + Nominatim (OpenStreetMap). $0, sin API key. Reutilizable para Urubó/Polanco cuando se agreguen.
- ✅ **Nuevas columnas** `gps_verificado_osm`, `osm_buildings_around_30m`, `osm_nominatim_address`, `osm_verified_at` en `proyectos_master`.
- ✅ Verificación OSM aplicada a los 38 pm ZN: 13 con edificio OSM a 30m, 25 sin (OSM tiene cobertura parcial en SC).
- ✅ **HTML interactivo `verify-sospechosos.html`** con mini-mapa Leaflet (tile satelital Esri) y botones a Google Maps/Street View por prop individual. Permite comparación visual sin abrir 10 tabs.
- ✅ **Verificación visual de los 38 pm** por el usuario: 30 confirmed, 8 sospechosos iniciales.
- ✅ **Re-verificación de los 8 sospechosos con mini-mapa**: 6 confirmed por evidencia interna (cluster de props con GPS coherente) + 1 sospechoso mantenido (Vertical Isuto, aviso terminado) + 1 dividido (Essenzia).
- ✅ **Nuevas columnas** `gps_verificado_visual`, `gps_verificacion_notas`, `gps_verificado_visual_at` en `proyectos_master`.

### Mudanzas de GPS (4 pm donde el usuario detectó coords incorrectas visualmente)

- ✅ **pm 274 Vertical Isuto** — GPS movido a -17.76238, -63.18972. Aviso terminado: prop 407 marcada `inactivo_confirmed`.
- ✅ **pm 353 Vilareal Duo** — GPS movido a -17.71965, -63.17575 (~127m del cluster de listings — los agentes tenían GPS desplazado).
- ✅ **pm 355 Blue Garden** — GPS movido a -17.76768, -63.17851 (~1167m del cluster de listings — desplazamiento sistémico grave del agente).
- ✅ **pm 366 Edificio Essenzia** — GPS movido a -17.74696, -63.16970. 7 props desmatcheadas (cluster A "edificio-essenzia-zona-norte" + cluster C "condominio-essenzia" son otros 2 edificios distintos). Quedan 3 props reales (cluster B).

### Renombres por nota del usuario

- ✅ **pm 361** → `Edificio Macororo 15` (con `alias_conocidos = ['Edificio Macororo','Macororo']`).
- ✅ **pm 369** → `Condominio Berchatti Norte 1` (con `alias_conocidos = ['Condominio Berchatti Norte']`).
- ✅ **pm 370 Sky Epic** + **pm 371 Torre Vento** — GPS ajustado con coords del usuario.

### Auditoría 6 pares pm <100m (Opción B, 28-may-2026 tarde)

Revisión de 6 pares de pm con GPS muy cercanos entre sí, para detectar duplicados / multi-torres / matching cruzado.

- ✅ **5 pares confirmados como edificios distintos legítimos** (vecinos en la misma manzana/complejo): DOMUS LUXURY↔BRISAS by Omnia (46m), BRICKELL 5↔BRISAS by Omnia (66m), SAN NICOLAS III↔PORTOBELLO ISUTO (69m), Brickell 4↔BRISAS by Omnia (71m), LEBLON↔SMART STUDIO ISUTO (86m). URLs y nombres distintos.

- 🔴 **1 par con bug real (Brickell 4 ↔ DOMUS LUXURY, 36m)** — las 4 props matched a Brickell 4 (pm 122) eran en realidad DOMUS, no Brickell 4. Patrón identificado: Brickell 4 fue cargado como legacy cuando era el único pm cercano, y absorbió por GPS props de edificios vecinos que aún no existían como pm. Resultado:
  - **2 props (2060, 2066) reasignadas a DOMUS LUXURY (356)** — URLs/LLM dicen "domus luxury", distancia <25m del pm 356.
  - **2 props (2059, 2291) reasignadas a un pm nuevo DOMUS MADERO** — el LLM ya extraía "DOMUS MADERO"/"Condominio DOMUS MADERO" pero no había pm. Distancia <4m del nuevo pm.
  - **GPS de DOMUS LUXURY (356) refinado** (~12m) con coords verificadas en Maps por el usuario.
  - **GPS de Brickell 4 (122) afinado** (~1m) con coords del usuario.
  - **Brickell 4 (122) quedó con 0 props matched** — el edificio existe físicamente pero no hay listings activos. OK.

### Lección meta para futuras macrozonas

**Cargar pm nuevo en zona densa requiere re-auditar props matched a pm vecinos viejos.** El matching `gps_verificado` tiene radio de tolerancia (~250m) que en zonas con edificios a <50m entre sí puede mezclar. Posible mejora futura: cuando se inserta un pm nuevo, re-correr matching por nombre sobre props ya matched por GPS a pm vecinos — si LLM/regex de la prop coincide mejor con el pm nuevo, reasignar automáticamente. Por ahora se detecta manual (este audit).

### Resultado final 28-may-2026 (sesión 2 + capa 3 cerrada)

| Métrica | Inicio del día | Cierre del día |
|---|---|---|
| pm ZN activos | 18 | **70** (67 confirmed visual + 3 sospechoso) |
| Props ZN venta matched | 77 (19.7%) | **212 (54.2%)** |
| Props ZN venta sin match | 313 | 179 |
| Cross-zona aplicados | 5 | 0 |
| K1/STONE/CURUPAU/Brickell4 falsos positivos | 63 | 0 |
| Nombres basura | 32 | 0 |
| pm con `gps_verificado_visual` | 0 | **70/70 (100%)** |
| Edificios "nuevos" descubiertos | — | 3 (DOMUS MADERO + Sky Icon re-zonificado + Torre Baruc Norte distinguida de 4 Baruc EQ) |

**Sesiones del día y aportes:**
1. **Sesión 1**: cleanup K1+STONE+CURUPAU+Brickell + 20 pm cargados + 6 pares <100m auditados (+DOMUS MADERO) → 19.7%→28.6%
2. **Sesión 2 capa 1**: 12 pm nuevos compactos + Sky Icon re-zonificado + verificación visual 12/12 confirmed → 28.6%→38.1%
3. **Sesión 2 capa 2 (aliases)**: 5 aliases adicionales (Vilareal, Berchatti Torre, Orange, Disart, Lusitano) → 38.1%→40.7%
4. **Sesión 2 dispersos**: 4 pm nuevos para nombres con clusters separados pero GPS de agente errados (Bless One, Community Alto Norte, Cantabria, Torre Moderna) → 40.7%→**48.6%**

**Patrón aprendido en dispersos:** cuando hay N props con mismo `nombre_edificio` divididas en sub-clusters GPS distantes, **frecuentemente es UN solo edificio con GPS de agente desplazados**, no edificios distintos. La verificación visual confirma cuál es el GPS real. Las props matchean al pm via nombre (independiente del GPS individual).

**Sigue pendiente:**
- 7 props ZN Essenzia desmatcheadas — el próximo merge nocturno las re-popula desde LLM; eventualmente surgirán pm para "Condominio Essenzia" + el edificio del cluster A.
- 2 props desmatcheadas STONE 7 — ídem, posible nuevo pm "STONE 7" cuando emerja.
- Refrescar `gps_verificado_osm` corriendo `scripts/verify-pm-gps/` sobre los 55 pm (16 sin verificación OSM todavía).
- 201 props sin match son la cola larga real: principalmente edificios únicos N=1 sin pm cargado. **Mejor camino futuro: ticket #1.7 detector automático** (no más sesiones manuales).

### Hallazgos meta del 28-may

1. **El cluster GPS interno > Google Maps para verificar pm en Bolivia.** OSM/Google no rotulan todos los edificios. La convergencia de N listings independientes con el mismo nombre + GPS coherente es evidencia más fuerte que la inspección visual.
2. **Agentes ponen GPS sistemáticamente desplazado.** Vilareal Duo, Blue Garden, Essenzia tenían 6-10 listings con GPS-de-agente apilado, pero el edificio físico estaba en otro punto (verificado visualmente). El GPS del pm debe ser el del edificio real, no el promedio de los listings.
3. **Edificios con nombre parecido (Essenzia + Condominio Essenzia) son comunes.** El matching debe poder dividirlos vía cluster GPS, no sólo por nombre. Insight relevante para futuras macrozonas.
4. **Patrón K1 (cleanup pre-blindaje parcial) afectaba a 3 pm**: K1, STONE 4, CURUPAU ISUTO. El blindaje 251/252 protege contra nuevos casos pero la deuda residual hay que limpiarla case-by-case.

---

## Aprendizajes meta del proyecto

**Sobre diagnóstico:** la sesión del 27-may tuvo 3 iteraciones de hipótesis incorrectas antes de llegar a la causa raíz:

1. ❌ "Mejorar prompt LLM para no extraer genéricos" → el LLM ya devolvía null correctamente.
2. ❌ "Modificar merge para preferir LLM" → el merge YA tiene esa lógica (v2.6.0).
3. ❌ "Fixear blacklist del regex" → parche infinito, no escalable.
4. ✅ "Prompt nunca define criterios de confianza" → causa raíz real.

**Lección:** antes de proponer fix, **leer las decisiones históricas en git** (commits + docs canónicos). El sistema ya tuvo auditoría profunda sobre LLM en 22-24 may; ignorarla llevó a hipótesis incorrectas.

**Sobre estimaciones:** la estimación inicial del impacto fue de "9 props" (Torre Moderna). Medición real: **135 props ZN con LLM=null** (32% del inventario). Lección: **medir antes de estimar**.
