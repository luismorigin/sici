# BLOQUE 2 — FORMULARIO TRANSICIÓN

**Documento:** Captura estructurada para compradores en paso intermedio  
**Perfil:** Persona que necesita algo temporal, con opciones abiertas  
**Versión:** 1.0  
**Fecha:** 6 Enero 2026  
**Estado:** Cerrado

---

## IDENTIFICACIÓN DEL PERFIL

### ¿Quién es este usuario?

- Busca **flexibilidad**, no permanencia
- Le importa **no atarse** a largo plazo
- Piensa en **resolver ahora, decidir después**
- Decide con **pragmatismo + incertidumbre**
- Riesgo principal: **comprar algo difícil de salir, atarse sin querer**

### Pregunta de activación

> "¿Es una solución temporal mientras definís algo más permanente?"
> 
> ○ Sí, es un paso intermedio → Este formulario  
> ○ No, es mi hogar definitivo → FORM_VIVIENDA  
> ○ No, es inversión para renta → FORM_INVERSOR_RENTA  
> ○ No, es inversión para revender → FORM_INVERSOR_PLUSVALIA

### Subtipos de Transición

```
T1. ¿Por qué es transición?
    ○ Situación personal incierta (trabajo, pareja, familia)
    ○ Esperando vender otra propiedad
    ○ Probando zona/ciudad antes de comprometerme
    ○ Capital limitado ahora, más después
    ○ No sé exactamente qué quiero todavía
    ○ Otro: [texto]
```

---

## ÍNDICE

1. [Sección A — Situación Actual](#sección-a--situación-actual)
2. [Sección B — Horizonte de Transición](#sección-b--horizonte-de-transición)
3. [Sección C — Capacidad Financiera](#sección-c--capacidad-financiera)
4. [Sección D — Requisitos Mínimos](#sección-d--requisitos-mínimos)
5. [Sección E — Flexibilidad de Salida](#sección-e--flexibilidad-de-salida)
6. [Sección F — Escenarios Futuros](#sección-f--escenarios-futuros)
7. [Sección G — Trade-offs de Transición](#sección-g--trade-offs-de-transición)
8. [Sección H — Riesgos y Preocupaciones](#sección-h--riesgos-y-preocupaciones)
9. [Sección I — Validación Final](#sección-i--validación-final)
10. [Procesamiento y Output](#procesamiento-y-output)

---

# SECCIÓN A — SITUACIÓN ACTUAL

**Propósito:** Entender por qué es transición y qué está pasando.

```
A1. ¿Dónde vivís actualmente?
    ○ Alquilando
      → ¿Cuánto pagás? $[___]/mes
      → ¿Cuánto te queda de contrato? [___] meses
    ○ Con familia
    ○ Propiedad propia que voy a vender
    ○ Hotel / temporal
    ○ Otro: [texto]

A2. ¿Cuál es el trigger para buscar ahora?
    □ Vence mi alquiler
    □ Me mudo por trabajo
    □ Cambio en situación familiar (separación, hijos, etc.)
    □ Oportunidad de mercado
    □ Vendí/vendo otra propiedad
    □ Ahorro que necesita destino
    □ Otro: [texto]

A3. ¿Quiénes van a vivir ahí?
    ○ Solo yo
    ○ Con pareja
      → ¿La relación es estable? ○ Sí ○ Reciente ○ Incierta
    ○ Con hijos
      → ¿Cuántos? [___] → ¿Edades? [___]
    ○ Temporal solo, familia viene después
    ○ Otro: [texto]

A4. ¿Tu trabajo es estable en esta ciudad?
    ○ Sí, muy estable
    ○ Sí, pero podría cambiar
    ○ Incierto - podría mudarme
    ○ Remoto - puedo trabajar desde cualquier lado
    ○ Recién llegué / nuevo trabajo

A5. En una frase, ¿por qué es "transición" y no "definitivo"?
    [texto libre]
```

**Output Sección A:**
```json
{
  "situacion_actual": {
    "vivienda_actual": "alquilando",
    "costo_actual": 500,
    "contrato_restante_meses": 4,
    "trigger": ["vence_alquiler", "trabajo"],
    "composicion": "pareja",
    "estabilidad_pareja": "reciente",
    "estabilidad_trabajo": "podria_cambiar",
    "razon_transicion": "No sé si me quedo en SCZ, probando"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Pareja "incierta" + hijos → `ALERTA: situacion_familiar_compleja`
- Trabajo "incierto" + compra cara → `ALERTA: riesgo_movilidad`
- Contrato < 3 meses → `ALERTA: urgencia_temporal`

---

# SECCIÓN B — HORIZONTE DE TRANSICIÓN

**Propósito:** Entender cuánto tiempo es "transición".

```
B1. ¿Cuánto tiempo MÍNIMO pensás quedarte?
    ○ 6 meses - 1 año
    ○ 1-2 años
    ○ 2-3 años
    ○ 3-5 años
    ○ No sé

B2. ¿Cuánto tiempo MÁXIMO podrías quedarte si todo sale bien?
    ○ 1-2 años
    ○ 2-3 años
    ○ 3-5 años
    ○ 5-10 años
    ○ Podría volverse permanente

B3. ¿Qué tiene que pasar para que se vuelva permanente?
    □ Que me guste la zona
    □ Que mi trabajo se estabilice
    □ Que mi relación se consolide
    □ Que tenga hijos
    □ Nada - definitivamente es temporal
    □ Otro: [texto]

B4. ¿Qué tiene que pasar para que te vayas antes?
    □ Oferta de trabajo en otra ciudad
    □ Cambio en situación familiar
    □ Que no me guste la zona
    □ Oportunidad de comprar algo mejor
    □ Problemas financieros
    □ Otro: [texto]

B5. ¿Cuál es más probable: quedarte más o irte antes?
    ○ Más probable quedarme más tiempo
    ○ 50/50
    ○ Más probable irme antes
    ○ No tengo idea
```

**Output Sección B:**
```json
{
  "horizonte": {
    "minimo": "1-2_anos",
    "maximo": "3-5_anos",
    "condiciones_permanencia": ["trabajo_estable", "relacion_consolida"],
    "condiciones_salida": ["trabajo_otra_ciudad", "oportunidad_mejor"],
    "probabilidad": "50_50"
  }
}
```

---

# SECCIÓN C — CAPACIDAD FINANCIERA

**Propósito:** Entender recursos y flexibilidad financiera.

```
C1. ¿Cuánto capital tenés disponible?
    $[________] USD

C2. ¿De dónde viene?
    □ Ahorro propio
    □ Venta de propiedad (pendiente o completada)
    □ Crédito
    □ Familiar
    □ Otro: [texto]

C3. ¿Vas a usar crédito?
    ○ No, 100% cash
    ○ Sí, parcialmente [___]%
    ○ Sí, mayoritariamente
    ○ Todavía no sé

C4. ¿Cuánto podés pagar por mes? (cuota + expensas)
    $[________] USD/mes

C5. ¿Tenés margen para imprevistos?
    ○ Sí, holgado
    ○ Sí, justo
    ○ Poco
    ○ No

C6. Si tenés que vender rápido y perder algo, ¿cuánto tolerás perder?
    ○ 0% - no puedo perder nada
    ○ Hasta 5%
    ○ Hasta 10%
    ○ Hasta 15%
    ○ Lo que sea necesario

C7. ¿Qué pasa si tenés que irte y no podés vender?
    ○ Puedo alquilarla y cubrir gastos
    ○ Puedo mantenerla vacía un tiempo
    ○ Sería un problema serio
    ○ No lo había pensado
```

**Output Sección C:**
```json
{
  "financiero": {
    "capital_usd": 80000,
    "origen": ["ahorro", "venta_propiedad"],
    "usa_credito": false,
    "capacidad_mensual": 600,
    "margen_imprevistos": "justo",
    "tolerancia_perdida": "hasta_10",
    "plan_si_no_vende": "alquilar"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Tolerancia 0% pérdida + horizonte incierto → `ALERTA: rigidez_riesgosa`
- "No lo había pensado" plan B → `ALERTA: falta_plan_salida`
- Crédito alto + horizonte corto → `ALERTA: riesgo_cashflow`

---

# SECCIÓN D — REQUISITOS MÍNIMOS

**Propósito:** Qué necesita el espacio para funcionar (mínimos, no ideales).

```
D1. ¿Cuántos dormitorios NECESITÁS? (mínimo funcional)
    ○ 1  ○ 2  ○ 3  ○ 4+

D2. ¿Cuántos baños NECESITÁS?
    ○ 1  ○ 2  ○ 3+

D3. Metros cuadrados MÍNIMOS:
    [____] m² (o "no sé")

D4. ¿Qué es INDISPENSABLE para que funcione?
    □ Estacionamiento
    □ Ascensor
    □ Pet friendly
    □ Seguridad
    □ Cerca del trabajo
    □ Cerca de colegio
    □ Balcón/terraza
    □ Ninguno es indispensable

D5. ¿Qué zonas funcionan?
    □ [lista de zonas]
    
D6. ¿Qué NO tolerás bajo ninguna circunstancia?
    □ Planta baja
    □ Zona ruidosa
    □ Lejos del trabajo
    □ Sin estacionamiento
    □ Otro: [texto]
```

**Output Sección D:**
```json
{
  "requisitos_minimos": {
    "dormitorios_min": 2,
    "banos_min": 1,
    "area_min_m2": 60,
    "indispensables": ["estacionamiento", "seguridad"],
    "zonas_validas": ["Equipetrol", "Urbari"],
    "rechazos_absolutos": ["planta_baja", "zona_ruidosa"]
  }
}
```

---

# SECCIÓN E — FLEXIBILIDAD DE SALIDA

**Propósito:** ¿Qué tan fácil tiene que ser salir?

```
E1. ¿Qué tan importante es poder vender/salir rápido?
    ○ Crítico - es mi prioridad #1
    ○ Muy importante
    ○ Importante
    ○ Deseable pero no crítico
    ○ No me importa

E2. ¿Cuánto tiempo máximo esperarías para vender?
    ○ 1-3 meses
    ○ 3-6 meses
    ○ 6-12 meses
    ○ Más de un año
    ○ Lo que haga falta

E3. ¿Qué descuento aceptarías para vender rápido?
    ○ 0% - precio de mercado o nada
    ○ Hasta 5%
    ○ Hasta 10%
    ○ Hasta 15%
    ○ Lo que sea necesario

E4. Si no podés vender, ¿alquilarías?
    ○ Sí, es mi plan B
    ○ Tal vez, no ideal
    ○ No, prefiero esperar
    ○ No lo había pensado

E5. ¿Qué es más importante: liquidez o comodidad?
    ○ Liquidez claramente
    ○ Más liquidez, algo de comodidad
    ○ Balance 50/50
    ○ Más comodidad, algo de liquidez
    ○ Comodidad claramente
```

**Output Sección E:**
```json
{
  "flexibilidad_salida": {
    "importancia_liquidez": "muy_importante",
    "tiempo_max_venta": "3-6_meses",
    "descuento_aceptable": "hasta_10",
    "plan_b_alquiler": true,
    "prioridad": "mas_liquidez"
  }
}
```

---

# SECCIÓN F — ESCENARIOS FUTUROS

**Propósito:** Mapear posibles futuros.

```
F1. Imaginá 3 años adelante. ¿Cuál es el escenario MÁS probable?
    ○ Sigo viviendo ahí, me quedé
    ○ Me fui a otra ciudad/país
    ○ Compré algo mejor, vendí esta
    ○ Alquilé esta y vivo en otro lado
    ○ No tengo idea

F2. Si todo sale BIEN, ¿qué pasa con esta propiedad?
    [texto libre]

F3. Si todo sale MAL, ¿qué pasa con esta propiedad?
    [texto libre]

F4. ¿Hay algún evento que defina tu futuro?
    □ Resultado de trabajo (ascenso, traslado)
    □ Decisión sobre pareja
    □ Llegada de hijos
    □ Venta de otra propiedad
    □ Jubilación
    □ Ninguno específico
    □ Otro: [texto]

F5. ¿Cuándo se define ese evento?
    ○ Próximos 6 meses
    ○ Próximo año
    ○ Próximos 2-3 años
    ○ No sé cuándo
```

**Output Sección F:**
```json
{
  "escenarios": {
    "escenario_mas_probable": "me_voy_otra_ciudad",
    "si_todo_bien": "Vendo con ganancia y compro en destino definitivo",
    "si_todo_mal": "Me quedo atrapado sin poder vender",
    "evento_decisivo": "resultado_trabajo",
    "cuando_se_define": "proximo_ano"
  }
}
```

---

# SECCIÓN G — TRADE-OFFS DE TRANSICIÓN

**Propósito:** Forzar priorización.

```
G1. Si tuvieras que elegir:
    ○ Más fácil de vender, menos cómoda
    ○ Más cómoda, más difícil de vender

G2. Si tuvieras que elegir:
    ○ Mejor ubicación, propiedad más genérica
    ○ Peor ubicación, propiedad más especial

G3. Si tuvieras que elegir:
    ○ Precio bajo (más margen), peor zona
    ○ Precio justo, buena zona

G4. Si tuvieras que elegir:
    ○ Lista para habitar hoy
    ○ Más barata pero necesita trabajo

G5. Ordená de 1 (más importante) a 5 (menos):
    [ ] Poder vender rápido
    [ ] Precio bajo de compra
    [ ] Comodidad mientras vivo
    [ ] Buena ubicación
    [ ] Potencial de apreciación

G6. ¿Qué sacrificás por liquidez?
    □ Metros cuadrados
    □ Zona preferida
    □ Amenities
    □ Piso alto / vista
    □ Nada - la liquidez no es tan importante
```

**Output Sección G:**
```json
{
  "trade_offs": {
    "liquidez_vs_comodidad": "liquidez",
    "ubicacion_vs_especial": "ubicacion",
    "precio_vs_zona": "zona",
    "lista_vs_barata": "lista",
    "prioridades_ordenadas": ["vender_rapido", "ubicacion", "comodidad", "precio", "apreciacion"],
    "sacrifica_por_liquidez": ["metros", "amenities"]
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Prioriza liquidez pero elige propiedad especial → `ALERTA: inconsistencia_prioridades`
- Nada sacrifica + horizonte corto → `ALERTA: expectativa_irrealista`

---

# SECCIÓN H — RIESGOS Y PREOCUPACIONES

**Propósito:** Detectar miedos y preparación.

```
H1. ¿Qué te preocupa MÁS de esta compra?
    □ Quedarme atrapado sin poder vender
    □ Perder dinero si bajo precio
    □ Que la situación cambie y no sirva
    □ Pagar de más
    □ Problemas con la propiedad
    □ Otro: [texto]

H2. ¿Qué pasa si en 1 año NECESITÁS irte?
    ○ Vendo aunque pierda algo
    ○ Alquilo y me voy
    ○ No puedo irme hasta vender
    ○ Sería un desastre
    ○ No lo había pensado

H3. ¿Qué pasa si el mercado baja 15%?
    ○ Espero a que suba
    ○ Vendo igual
    ○ Me complica mucho
    ○ No lo había pensado

H4. ¿Tenés plan B si no encontrás lo que buscás?
    ○ Sigo alquilando
    ○ Me quedo donde estoy
    ○ Bajo expectativas
    ○ No tengo plan B

H5. ¿Quién más opina sobre esta decisión?
    ○ Solo yo
    ○ Mi pareja → ¿Alineados? ○ Sí ○ Más o menos ○ No
    ○ Familia → ¿Cuánto pesa su opinión? [texto]
```

**Output Sección H:**
```json
{
  "riesgos": {
    "preocupaciones": ["quedar_atrapado", "perder_dinero"],
    "si_necesita_irse_1_ano": "vendo_aunque_pierda",
    "si_mercado_baja_15": "espero",
    "plan_b": "sigo_alquilando",
    "decision_compartida": {
      "con": "pareja",
      "alineacion": "mas_o_menos"
    }
  }
}
```

---

# SECCIÓN I — VALIDACIÓN FINAL

**Propósito:** Confirmar coherencia y preparación.

```
I1. VALIDACIÓN DE HORIZONTE

    Dijiste que podrías quedarte [min]-[max] años.
    Tu prioridad es [liquidez/comodidad].
    
    ¿Tiene sentido comprar o deberías alquilar?
    ○ Comprar tiene sentido
    ○ Tal vez debería alquilar
    ○ No estoy seguro/a
    
    [Info: Para horizontes <3 años, alquilar suele ser mejor financieramente]

I2. VALIDACIÓN DE LIQUIDEZ

    Dijiste que poder vender rápido es [nivel].
    Pero también querés [propiedad especial / zona X].
    
    ¿Cómo reconciliás eso?
    [texto libre]

I3. VALIDACIÓN DE RIESGO

    Tu tolerancia a pérdida es [X]%.
    Pero si el mercado baja, dijiste [Y].
    
    ¿Es consistente?
    ○ Sí
    ○ Necesito pensar más

I4. ¿Qué haría que esta compra sea un ÉXITO?
    [texto libre]

I5. ¿Qué haría que sea un FRACASO?
    [texto libre]

I6. ¿COMPRAR o ALQUILAR?
    
    Dado todo lo anterior, ¿todavía querés comprar?
    ○ Sí, comprar es lo correcto
    ○ Tal vez debería alquilar
    ○ Quiero ver números de compra vs alquiler

I7. ALGO MÁS
    ¿Hay algo importante que no pregunté?
    [texto libre]
```

**Output Sección I:**
```json
{
  "validacion": {
    "compra_vs_alquiler": "comprar_correcto",
    "reconciliacion_liquidez": "Acepto que sea más genérica para poder salir",
    "consistencia_riesgo": true,
    "definicion_exito": "Resolver vivienda 2 años, vender sin pérdida",
    "definicion_fracaso": "Quedarme atrapado 5 años sin poder moverme"
  }
}
```

---

# PROCESAMIENTO Y OUTPUT

## Derivación de Perfil Fiduciario Transición

```javascript
function generarPerfilTransicion(respuestas) {
  return {
    tipo_perfil: "transicion",
    
    subtipo: respuestas.T1, // situacion_incierta, probando_zona, capital_limitado
    
    nivel_incertidumbre: derivarIncertidumbre(respuestas.A, respuestas.B),
    // alta | media | baja
    
    flexibilidad_real: derivarFlexibilidad(respuestas.C, respuestas.E),
    // alta | media | baja
    
    necesidad_liquidez: respuestas.E.importancia_liquidez,
    
    riesgo_principal: derivarRiesgoPrincipal(respuestas),
    // atrapamiento | perdida_financiera | sobrecompra
    
    alternativa_alquiler: evaluarAlternativa(respuestas)
    // viable | marginal | no_viable
  };
}
```

## Derivación de Guía Fiduciaria Transición

```javascript
function generarGuiaTransicion(respuestas, perfil) {
  return {
    lectura_momento: generarLecturaTransicion(perfil, respuestas),
    
    objetivo_dominante: "Resolver vivienda sin comprometer flexibilidad",
    
    horizonte: {
      minimo: respuestas.B.minimo,
      maximo: respuestas.B.maximo,
      escenario_probable: respuestas.F.escenario_mas_probable
    },
    
    innegociables: [
      "liquidez_alta",
      ...respuestas.D.indispensables
    ],
    
    prioridades: respuestas.G.prioridades_ordenadas,
    
    sacrificables: respuestas.G.sacrifica_por_liquidez,
    
    plan_salida: {
      preferencia: respuestas.E.preferencia_salida,
      tiempo_max: respuestas.E.tiempo_max_venta,
      descuento_aceptable: respuestas.E.descuento_aceptable
    },
    
    riesgos_a_evitar: ["atrapamiento", "sobrecompra"],
    
    que_no_hacer: generarProhibicionesTransicion(perfil),
    
    alternativa_alquiler: perfil.alternativa_alquiler,
    
    proximo_paso: generarPasoTransicion(perfil, respuestas)
  };
}
```

## Output Final Completo

```json
{
  "tipo_formulario": "transicion",
  "version": "1.0",
  "fecha": "2026-01-06",
  
  "perfil_fiduciario": {
    "tipo": "transicion",
    "subtipo": "situacion_incierta",
    "nivel_incertidumbre": "media",
    "flexibilidad_real": "media",
    "necesidad_liquidez": "muy_importante",
    "riesgo_principal": "atrapamiento",
    "alternativa_alquiler": "viable"
  },
  
  "guia_fiduciaria": {
    "lectura_momento": "Comprador en transición por situación laboral/personal incierta...",
    "objetivo_dominante": "Resolver vivienda sin comprometer flexibilidad",
    "horizonte": {
      "minimo": "1-2_anos",
      "maximo": "3-5_anos",
      "escenario_probable": "me_voy_otra_ciudad"
    },
    "innegociables": ["liquidez_alta", "estacionamiento", "seguridad"],
    "prioridades": ["vender_rapido", "ubicacion", "comodidad"],
    "sacrificables": ["metros", "amenities"],
    "plan_salida": {
      "preferencia": "vender",
      "tiempo_max": "3-6_meses",
      "descuento_aceptable": "10%"
    },
    "riesgos_a_evitar": ["atrapamiento", "sobrecompra"],
    "que_no_hacer": [
      "No comprar en zona de baja demanda",
      "No gastar 100% del presupuesto",
      "No ignorar plan de salida"
    ],
    "alternativa_alquiler": "viable",
    "proximo_paso": "Evaluar números compra vs alquiler"
  },
  
  "alertas": [
    {"tipo": "evaluar_alquiler", "severidad": "media"}
  ],
  
  "mbf_ready": {
    "filtros_duros": {
      "precio_max_usd": 80000,
      "zonas": ["Equipetrol", "Urbari"],
      "amenities_requeridos": ["estacionamiento", "seguridad"]
    },
    "filtros_blandos": {
      "liquidez_zona": "alta",
      "tiempo_venta_promedio": "<6_meses",
      "demanda_alquiler": "alta"
    },
    "ordenamiento": [
      "liquidez_zona",
      "tiempo_promedio_venta",
      "demanda_alquiler"
    ],
    "modo": "exploracion",
    "cantidad_max": 5
  }
}
```

---

# ALERTAS ESPECÍFICAS TRANSICIÓN

| Alerta | Trigger | Severidad | Acción |
|--------|---------|-----------|--------|
| Evaluar alquiler | Horizonte <3 años | Media | Mostrar números |
| Inconsistencia prioridades | Dice liquidez pero elige comodidad | Media | Forzar reconciliación |
| Rigidez financiera | No acepta pérdida + horizonte incierto | Alta | Warning explícito |
| Decisión apresurada | Urgencia + pareja no alineada | Alta | Sugerir pausa |
| Atrapamiento potencial | Zona baja demanda + horizonte corto | Alta | Recomendar otra zona |
| Sobrecompra | Gasta 100% presupuesto + necesita margen | Media | Dejar colchón |

---

# MÉTRICAS ESPECÍFICAS PARA TRANSICIÓN

El MBF para transición incluye métricas de liquidez que no existen en otros perfiles:

```json
{
  "metricas_liquidez": {
    "tiempo_promedio_venta_zona": true,
    "demanda_alquiler_zona": true,
    "volumen_transacciones": true,
    "tipo_comprador_predominante": true,
    "precio_alquiler_comparable": true,
    "ratio_precio_alquiler": true
  }
}
```

---

# ANÁLISIS COMPRA VS ALQUILER

Para perfiles de transición, el sistema genera automáticamente:

```javascript
function analizarCompraVsAlquiler(respuestas) {
  const horizonte = respuestas.B.minimo; // años
  const precioCompra = respuestas.C.capital_usd;
  const alquilerMensual = estimarAlquiler(precioCompra);
  const costoTransaccion = precioCompra * 0.05; // 5% compra + venta
  
  const costoCompra = costoTransaccion + (precioCompra * 0.02 * horizonte); // mantenimiento
  const costoAlquiler = alquilerMensual * 12 * horizonte;
  
  const breakeven = costoTransaccion / (alquilerMensual * 12 - precioCompra * 0.02);
  
  return {
    breakeven_anos: breakeven,
    recomendacion: horizonte < breakeven ? "alquilar" : "comprar",
    diferencia: Math.abs(costoCompra - costoAlquiler)
  };
}
```

---

# DIFERENCIAS CON OTROS PERFILES

| Aspecto | Vivienda | Transición | Inversor |
|---------|----------|------------|----------|
| **Prioridad #1** | Comodidad/vida | Liquidez | Retorno |
| **Horizonte** | 10+ años | 1-5 años | Variable |
| **Salida** | No urgente | Muy importante | Planeada |
| **Riesgo clave** | Cansancio | Atrapamiento | Pérdida |
| **Alternativa** | Ninguna | Alquilar | Otros activos |

---

*Documento canónico v1.0 — 6 Enero 2026*
*Perfil: TRANSICIÓN*
