# DECISIONES MVP SIMON

**Fecha:** 2026-01-11
**Estado:** COMPLETADO

Este documento registra las decisiones de diseno tomadas para resolver las 10 contradicciones de la auditoria.

---

## PREGUNTA 1: Campos del formulario Nivel 1? - CERRADA

### Contexto del problema

Habia 3 documentos con diferentes cantidades de campos:
- BLOQUE_2_FORM_VIVIENDA.md: 33+ campos, 9 secciones
- FORM_VIVIENDA_MVP.md: 18 campos, 2 niveles
- SIMON_FUNNEL_ESPECIFICACION.md: 6 filtros basicos + formulario nivel 2

### Analisis realizado

Se valido cada campo contra la BD:

| Campo | Columna BD | Filtro SQL | Estado |
|-------|------------|------------|--------|
| Presupuesto | `precio_usd` | `buscar_unidades_reales()` | FUNCIONAL |
| Zona | `zona`, `microzona` | `buscar_unidades_reales()` | FUNCIONAL |
| Dormitorios | `dormitorios` | `buscar_unidades_reales()` | FUNCIONAL |
| Area minima | `area_total_m2` | `buscar_unidades_reales()` | FUNCIONAL pero NO incluido |
| Estado entrega | `estado_construccion` | NO implementado | 61% con data |
| Forma de pago | NO EXISTE | - | Solo ~40 props en texto libre |
| Innegociables | `datos_json->'amenities'` | NO hay filtro SQL | Solo post-evaluacion |

### Decision final

**Usar los 6 campos del FUNNEL_SPEC** porque:
1. Son las preguntas que un comprador real necesita responder
2. 4 de 6 tienen filtro SQL funcional
3. Campo 5 (Para que es?) funciona como router a formularios especificos
4. Campo 6 (Como vas a pagar?) no filtra pero es ORO para el perfil fiduciario del broker

### Wireframe definitivo

```
+-------------------------------------------------------------+
|  CONSTRUYENDO TU BUSQUEDA                                   |
|                                                             |
|  1. Cuanto queres invertir?                                 |
|     [Slider: $50k --------*------- $200k]                   |
|     -> 147 propiedades                                      |
|                                                             |
|  2. Donde en Equipetrol?                                    |
|     [x] Equipetrol (centro)   [ ] Sirari                    |
|     [ ] Equipetrol Norte/Norte (premium)                    |
|     [ ] Equipetrol Norte/Sur  [ ] Villa Brigida             |
|     [ ] Faremafu                                            |
|     -> 89 propiedades                                       |
|                                                             |
|  3. Cuantos dormitorios?                                    |
|     [ ] 1  [x] 2  [ ] 3+                                    |
|     -> 45 propiedades                                       |
|                                                             |
|  4. Para cuando lo necesitas?                               |
|     [ ] Ya (lista para entrega)                             |
|     [x] Puedo esperar (preventa ok)                         |
|     [ ] No me importa                                       |
|     -> 45 propiedades                                       |
|                                                             |
|  5. Para que es?                                            |
|     [x] Vivir yo                                            |
|     [ ] Inversion renta                                     |
|     [ ] Inversion plusvalia                                 |
|                                                             |
|  6. Como vas a pagar?                                       |
|     [ ] Contado                                             |
|     [ ] Credito bancario                                    |
|     [x] Financiamiento directo (cuotas)                     |
|     [ ] No se todavia                                       |
|                                                             |
|  [VER MIS 45 OPCIONES]                                      |
+-------------------------------------------------------------+
```

### Por que incluir "Como vas a pagar?" si no filtra?

**Informacion valiosa para el broker:**
- El broker recibe el perfil sabiendo como quiere pagar el cliente
- Simon es honesto: si no hay data, no finge filtrar
- En futuro se puede agregar data de financiamiento y activar el filtro

### Pendientes tecnicos (NO HACER AHORA)

1. Agregar filtro `estado_construccion` a `buscar_unidades_reales()`
2. Definir logica unidades reales vs virtuales en contador
3. Campo 4 debe mostrar nota "X sin info de entrega" para propiedades sin data

---

## PREGUNTA 2: Mostrar 3, 3-5, o 3+10+excluidas? - CERRADA

### Contexto del problema

Habia 3 documentos con diferentes estructuras de resultados:
- Arquitectura G5: "Maximo 3 SIN EXCEPCIONES"
- MVP_SPEC: "3-5 propiedades"
- FUNNEL_SPEC: "3 TOP + 10 alternativas + excluidas"

### Decision final

**Usar la estructura del FUNNEL_SPEC:** 3 TOP + 10 alternativas + excluidas

### Estructura de resultados

```
+---------------------------------------------------------------+
| TUS 3 MEJORES OPCIONES                                        |
| Match 90%+ | Simon las recomienda                             |
| - Tarjeta con foto, precio, razon fiduciaria personalizada    |
+---------------------------------------------------------------+

+---------------------------------------------------------------+
| 10 ALTERNATIVAS                                               |
| Match 70-89% | Buenas, con algun compromiso                   |
| - Tarjeta con foto, precio, indicador de que compromiso tiene |
+---------------------------------------------------------------+

+---------------------------------------------------------------+
| EXCLUIDAS MAS BARATAS                                         |
| "Hay X mas baratas que no incluimos"                          |
| - Resumen de razones (violan innegociables, sin fotos, etc)   |
| - Detalle completo en Premium                                 |
+---------------------------------------------------------------+
```

### Por que esta decision

1. **Los 3 TOP son la firma de Simon** (el moat fiduciario)
2. **Las 10 alternativas dan opciones** sin abrumar
3. **Las excluidas son transparencia fiduciaria** (diferenciador vs otros portales)
4. **El usuario ve TODO el analisis**, no solo lo "bonito"

### Implicacion para codigo

- La funcion de busqueda debe retornar resultados ordenados por score
- **TOP 3:** score >= 90%
- **Alternativas:** score 70-89%
- **Excluidas:** las que fueron filtradas por innegociables, sin fotos, o precio sospechoso

### Mapeo a funciones SQL existentes

| Seccion | Funcion SQL | Campo |
|---------|-------------|-------|
| 3 TOP | `analisis_mercado_fiduciario()` | `bloque_1_opciones_validas` (limit 3) |
| 10 Alternativas | `analisis_mercado_fiduciario()` | `bloque_1_opciones_validas` (offset 3, limit 10) |
| Excluidas | `analisis_mercado_fiduciario()` | `bloque_2_opciones_excluidas` |

### Pendientes tecnicos (NO HACER AHORA)

1. Agregar campo `match_score` a resultados para calcular 90%+ vs 70-89%
2. Definir algoritmo de match_score (precio + zona + dormitorios + innegociables)
3. UI de tarjetas con "razon fiduciaria" prominente

---

## PREGUNTA 3: El perfil Transicion existe o se elimino? - CERRADA

### Contexto del problema

Habia 3 documentos con diferentes perfiles:
- BLOQUE_2: 4 perfiles (Vivienda, Inversor Renta, Inversor Plusvalia, Transicion)
- FUNNEL_SPEC: 3 perfiles (Vivienda, Inversor Renta, Inversor Plusvalia) - sin Transicion
- MVP_SPEC: 1 perfil (solo Vivienda)

### Decision final

**Seguir FUNNEL_SPEC:** 3 perfiles, sin Transicion

### Perfiles en MVP

1. **Vivienda** - Formulario completo
2. **Inversor Renta** - Formulario BETA con disclaimer
3. **Inversor Plusvalia** - Formulario BETA con disclaimer

### Por que eliminar Transicion

1. Vivienda cubre el 80% de los casos
2. Transicion es un caso edge que complica el router
3. Los casos de transicion (vender para comprar, divorcio, herencia) se pueden detectar como senales de alerta dentro de Vivienda, no como perfil separado
4. Simplifica el MVP sin perder funcionalidad critica

### Como manejar casos de transicion

En Nivel 2 de Vivienda, las preguntas existentes detectan estas situaciones:
- "Hace cuanto buscas?" → Detecta fatiga
- "Presion para cerrar?" → Detecta urgencia
- Si se necesita mas contexto, agregar en futuro: "Necesitas vender algo para comprar?"

**Esto genera alerta fiduciaria, no perfil separado.**

### Implicacion para codigo

- Campo 5 del Nivel 1 ("Para que es?") tiene 3 opciones, no 4
- Formularios Inversor Renta/Plusvalia son BETA (menor prioridad de desarrollo)
- Vivienda es el unico formulario "production ready" para lanzamiento

---

## PREGUNTA 4: Implementar state machine o flujo lineal? - CERRADA

### Contexto del problema

- ARQUITECTURA: Menciona state machine con estados (inicial, filtrando, procesando, resultados, error)
- FUNNEL_SPEC: Flujo lineal implicito
- MVP_SPEC: No especifica

### Decision final

**Flujo lineal para MVP**

### Flujo definido

```
Filtros (Nivel 1) - 6 campos
         |
         v
Router (Campo 5: Para que es?)
         |
    +----+----+--------------------+
    |         |                    |
    v         v                    v
Vivienda   Inv. Renta          Inv. Plusvalia
(completo) (BETA+disclaimer)   (BETA+disclaimer)
    |         |                    |
    +----+----+--------------------+
         |
         v
Resultados (3 TOP + 10 alternativas + excluidas)
         |
         v
Premium $29.99 (opcional)
```

### Por que flujo lineal

1. El flujo es predecible - no hay bifurcaciones complejas
2. El unico branch es el router (Vivienda vs Inversion) y es simple
3. State machine es over-engineering para MVP
4. Mas facil de implementar y debuggear
5. Se puede migrar a state machine despues si el flujo se complica

### Implicacion para codigo

- No implementar maquina de estados
- Usar navegacion simple entre componentes/paginas
- El router es un simple condicional basado en campo 5

---

## PREGUNTA 5: Prometer 5, 10, o 8-12 minutos? - CERRADA

### Contexto del problema

- FORM_MVP: 5 minutos
- MVP_SPEC: 8-12 minutos
- Landing: 10 minutos
- FUNNEL_SPEC: No especifica tiempo

### Decision final

**Prometer 5 minutos**

### Desglose estimado

- Nivel 1 (6 filtros): ~1-2 minutos
- Nivel 2 (formulario segun perfil): ~3 minutos
- **Total: ~4-5 minutos**

### Por que 5 minutos

1. Es realista con el flujo definido
2. Bajo-promete, sobre-entrega (si termina en 4 min, mejor)
3. 10-12 minutos asusta y genera abandono
4. 5 minutos es el sweet spot de atencion

### Donde mostrar

- Landing page: "5 minutos para encontrar tu lugar ideal"
- Inicio del formulario: "Solo 5 minutos"

---

## PREGUNTA 6: MVP sin pagos o incluir Premium? - CERRADA

### Contexto del problema

- MVP_SPEC: Sin pagos en MVP
- FUNNEL_SPEC: Premium $29.99 incluido en el flujo

### Decision final

**Seguir FUNNEL_SPEC:** Incluir Premium $29.99

### Estructura gratis vs pago

**GRATIS:**
- Filtros tiempo real con contador
- Consejos automaticos de busqueda
- Teasers de inteligencia (parciales)
- 3 TOP matches con razon fiduciaria basica
- 10 alternativas con score y compromiso
- Lista de excluidas (sin detalle profundo)

**PAGO ($29.99):**
- Ficha de coherencia profunda por propiedad
- Analisis detallado de las 10 alternativas
- Explicacion completa de por que se excluyeron las baratas
- Alertas de riesgo especificas
- Perfil fiduciario exportable para broker
- Acceso a CrediCheck

### Por que incluir Premium

1. Valida si la gente paga desde dia 1
2. El flujo ya esta disenado con Premium como upsell natural
3. Es el modelo de negocio - sin Premium no hay revenue
4. Los teasers de inteligencia crean el hook para convertir

### Implicacion para codigo

- Implementar pasarela de pago (Stripe o similar)
- Generar contenido Premium (puede ser PDF inicial)
- Mostrar teasers que incentiven la compra

---

## PREGUNTA 7: Mostrar alternativas o solo TOP? - CERRADA

### Decision final

**Ya decidido en Pregunta 2:** SI mostrar alternativas

### Estructura (referencia Pregunta 2)

- 3 TOP matches (90%+)
- 10 alternativas (70-89%) con indicador de compromiso
- Excluidas mas baratas (resumen de razones)

### Nota

Esta pregunta era redundante con la Pregunta 2.

---

## PREGUNTA 8: Mostrar propiedades excluidas? - CERRADA

### Decision final

**Ya decidido en Pregunta 2:** SI mostrar excluidas

### Como se muestran (referencia FUNNEL_SPEC)

**Vista gratis (colapsada):**
```
5 PROPIEDADES EXCLUIDAS (mas baratas)
|- 2 violan innegociables
|- 2 sin fotos verificadas
|- 1 precio sospechosamente bajo

[VER DETALLE EN INFORME PREMIUM]
```

**Vista Premium (expandida):**
Detalle completo de cada excluida con razon especifica

### Por que mostrar excluidas

Es el moat fiduciario de Simon - transparencia total. Otros portales esconden las baratas. Simon explica por que no las recomienda.

### Nota

Esta pregunta era redundante con la Pregunta 2.

---

## PREGUNTA 9: Implementar deteccion de fatiga? - CERRADA

### Decision final

**SI** - Ya esta incluido en el diseno

### Como funciona

**Captura (Nivel 2):**
- "Hace cuanto buscas?" → 1-6 meses / 6-12 meses / >1 ano
- "Como te sentis?" → Activo / Cansado / Frustrado / Presionado

**Procesamiento:**
- Funcion `detectar_senales_alerta()` ya existe
- Genera alerta "fatiga_busqueda" si meses >= 9
- Genera alerta si estado = cansado/frustrado/presionado

**Output (en resultados):**
```
Alertas:
- Fatiga de busqueda detectada - llevas 8 meses
- "No decidas por cansancio"
```

### Por que es importante

Es el moat fiduciario - Simon protege al comprador de decisiones emocionales malas. Ningun portal hace esto.

### Soporte en BD

- `detectar_senales_alerta()` ya implementada
- Campos `contexto.meses_buscando` y `contexto.estado_emocional` existen

---

## PREGUNTA 10: Cuantos perfiles para MVP? - CERRADA

### Decision final

**Ya decidido en Pregunta 3:** 3 perfiles (FUNNEL_SPEC)

### Perfiles en MVP

1. **Vivienda** - Formulario Nivel 2 completo
2. **Inversor Renta** - Formulario BETA + disclaimer
3. **Inversor Plusvalia** - Formulario BETA + disclaimer

### Nota

Esta pregunta era redundante con la Pregunta 3.

---

## 10 PREGUNTAS CERRADAS

Todas las contradicciones de diseno han sido resueltas.

### JERARQUIA DE DOCUMENTOS

**Para MVP:**
- `SIMON_FUNNEL_ESPECIFICACION.md` = FUENTE DE VERDAD
- `DECISIONES_MVP_2026-01-11.md` = Registro de validacion

**Para futuro (ideas, mejoras, v2):**
- `BLOQUE_2_FORM_VIVIENDA.md` = Campos adicionales a considerar
- `FORM_VIVIENDA_MVP.md` = Alternativas de estructura
- `MVP_SPEC.md` = Contexto original

Estos documentos NO se deprecan. Contienen ideas valiosas para iteraciones futuras. Solo no aplican para el MVP actual.

### RESUMEN EJECUTIVO

| # | Pregunta | Decision | Alineado con FUNNEL_SPEC |
|---|----------|----------|--------------------------|
| 1 | Campos Nivel 1 | 6 campos | SI |
| 2 | Estructura resultados | 3+10+excluidas | SI |
| 3 | Perfil Transicion | Eliminado - 3 perfiles | SI |
| 4 | State machine | Flujo lineal | SI |
| 5 | Tiempo prometido | 5 minutos | SI (agregado) |
| 6 | Premium | Si, $29.99 | SI |
| 7 | Alternativas | Si | SI |
| 8 | Excluidas | Si | SI |
| 9 | Deteccion fatiga | Si | SI |
| 10 | Perfiles MVP | 3 perfiles | SI |

### PROXIMOS PASOS

1. `SIMON_FUNNEL_ESPECIFICACION.md` = fuente de verdad para diseno MVP
2. Resolver pendientes tecnicos:
   - Agregar filtro `estado_construccion` a `buscar_unidades_reales()`
   - Definir logica unidades reales vs virtuales en contador
   - Implementar `match_score` para categorizar TOP vs alternativas
3. Implementar frontend con flujo lineal definido

---

## NIVEL 2 VIVIENDA - Validacion y Diseno Final

### Wireframe Nivel 2 Vivienda

```
+-------------------------------------------------------------+
|  CONTANOS SOBRE VOS                                         |
|                                                             |
|  1. Quienes van a vivir?                                    |
|     [Solo] [Pareja] [Familia] [Roommates]                   |
|                                                             |
|     -> Si Familia:                                          |
|     Hijos? [ ] 1  [ ] 2  [ ] 3+   Edades: [___]             |
|                                                             |
|  2. Mascotas?                                               |
|     [No] [Perro] [Gato] [Otro]                              |
|     -> Si Perro: [Chico] [Mediano] [Grande]                 |
|                                                             |
+-------------------------------------------------------------+
|  TU BUSQUEDA                                                |
|                                                             |
|  3. Hace cuanto buscas?                                     |
|     [Recien empiezo] [1-6 meses] [6-12 meses] [+1 ano]      |
|                                                             |
|  4. Como te sentis con la busqueda?                         |
|     [Motivado] [Cansado] [Frustrado] [Presionado]           |
|                                                             |
|  5. Quien mas decide?                                       |
|     [Solo yo] [Mi pareja] [Familia opina]                   |
|     -> Si pareja: Estan alineados? [Si] [Mas o menos] [No]  |
|                                                             |
+-------------------------------------------------------------+
|  QUE BUSCAS                                                 |
|                                                             |
|  6. Sin esto NO me interesa (max 3):                        |
|     [Seguridad 24h] [Estacionamiento] [Pet friendly]        |
|     [Ascensor] [Piscina] [Gimnasio]                         |
|                                                             |
|  7. Seria un PLUS tener:                                    |
|     [Balcon] [Vista] [Terraza] [Lavanderia]                 |
|     [Cowork] [SUM] [Parrillero] [Area ninos]                |
|                                                             |
+-------------------------------------------------------------+
|  TRADE-OFFS                                                 |
|                                                             |
|  8. Si tuvieras que elegir:                                 |
|     Mejor ubicacion  [----*----]  Mas metros cuadrados      |
|                                                             |
|  9. Y entre:                                                |
|     Mejor calidad    [----*----]  Mejor precio              |
|                                                             |
+-------------------------------------------------------------+
|                                                             |
|  [VER MIS OPCIONES]                                         |
|                                                             |
+-------------------------------------------------------------+
```

### Validacion de campos contra BD

| # | Campo | UI | Funcion SQL | Condicional |
|---|-------|-----|-------------|-------------|
| 1 | Quienes van a vivir? | Chips | perfil | - |
| 1b | Hijos? | Chips + input | perfil | Solo si Familia |
| 2 | Mascotas? | Chips iconos | `evaluar_coherencia_innegociables()` | - |
| 2b | Tamano perro | Chips | pet_friendly | Solo si Perro |
| 3 | Hace cuanto buscas? | Chips | `detectar_senales_alerta()` fatiga | - |
| 4 | Como te sentis? | Chips iconos | `detectar_senales_alerta()` alertas | - |
| 5 | Quien mas decide? | Chips | perfil/alerta | - |
| 5b | Alineados? | Chips | alerta | Solo si Pareja |
| 6 | Innegociables | Tags max 3 | `evaluar_coherencia_innegociables()` | - |
| 7 | Deseables | Tags multiple | ranking futuro | - |
| 8 | Trade-off ubicacion/metros | Slider | ranking futuro | - |
| 9 | Trade-off calidad/precio | Slider | ranking futuro | - |

### Resumen Nivel 2

- **9 preguntas visibles** (+ 3 condicionales)
- **4 funcionales SQL** (#2, #3, #4, #6)
- **5 para perfil/ranking futuro** (#1, #5, #7, #8, #9)
- **Tiempo estimado:** 2-3 minutos
- **Total con Nivel 1:** ~5 minutos

### Campos eliminados vs FUNNEL_SPEC original

| Campo original | Razon de eliminacion |
|----------------|----------------------|
| Sensibilidad al ruido | No hay data en BD |
| Trabajas desde casa? | No prioritario para MVP |
| Cercania importante a | No hay GPS del usuario |
| Tiempo maximo traslado | No calculable sin GPS |

### Campos agregados vs FUNNEL_SPEC original

| Campo nuevo | Razon de inclusion |
|-------------|-------------------|
| Trade-off ubicacion vs metros | Permite ranking personalizado |
| Trade-off calidad vs precio | Permite ranking personalizado |

### Mapeo a parametros SQL

```json
{
  "innegociables": ["seguridad", "ascensor", "pet_friendly"],
  "contexto": {
    "composicion": "familia",
    "hijos": 2,
    "mascota": "perro_grande",
    "meses_buscando": 9,
    "estado_emocional": "cansado",
    "decision_compartida": "pareja",
    "alineados": "mas_o_menos"
  },
  "deseables": ["balcon", "vista", "piscina"],
  "tradeoffs": {
    "ubicacion_vs_metros": 0.7,
    "calidad_vs_precio": 0.5
  }
}
```

---

## CHANGELOG

| Fecha | Pregunta | Decision |
|-------|----------|----------|
| 2026-01-11 | #1 Campos Nivel 1 | 6 campos FUNNEL_SPEC |
| 2026-01-11 | #2 Estructura resultados | 3 TOP + 10 alternativas + excluidas |
| 2026-01-11 | #3 Perfil Transicion | Eliminado - 3 perfiles sin Transicion |
| 2026-01-11 | #4 State machine | Flujo lineal para MVP |
| 2026-01-11 | #5 Tiempo prometido | 5 minutos |
| 2026-01-11 | #6 Premium | Si, $29.99 desde MVP |
| 2026-01-11 | #7 Alternativas | Si (redundante con #2) |
| 2026-01-11 | #8 Excluidas | Si (redundante con #2) |
| 2026-01-11 | #9 Deteccion fatiga | Si, ya implementado en SQL |
| 2026-01-11 | #10 Perfiles MVP | 3 (redundante con #3) |

---

*Documento de trabajo - Actualizar con cada decision tomada*
