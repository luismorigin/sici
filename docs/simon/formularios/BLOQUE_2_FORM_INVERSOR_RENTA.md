# BLOQUE 2 — FORMULARIO INVERSOR RENTA

**Documento:** Captura estructurada para inversores que buscan renta  
**Perfil:** Inversor que quiere ingresos mensuales por alquiler  
**Versión:** 1.0  
**Fecha:** 6 Enero 2026  
**Estado:** Cerrado

---

## IDENTIFICACIÓN DEL PERFIL

### ¿Quién es este usuario?

- Busca **retorno mensual**, no donde vivir
- Le importan los **números**, no cómo se siente el lugar
- Piensa en **ROI, CAP rate, vacancia**
- Decide con **cálculo + estrategia**
- Riesgo principal: **sobreestimar renta, subestimar costos**

### Pregunta de activación

> "¿Vas a alquilar esta propiedad para generar ingresos?"
> 
> ○ Sí, quiero renta mensual → Este formulario  
> ○ Sí, pero también podría vivir un tiempo → FORM_TRANSICION  
> ○ No, quiero comprar y revender → FORM_INVERSOR_PLUSVALIA  
> ○ No, es para vivir yo → FORM_VIVIENDA

---

## ÍNDICE

1. [Sección A — Perfil del Inversor](#sección-a--perfil-del-inversor)
2. [Sección B — Capital y Estructura](#sección-b--capital-y-estructura)
3. [Sección C — Expectativas de Retorno](#sección-c--expectativas-de-retorno)
4. [Sección D — Ubicación y Mercado](#sección-d--ubicación-y-mercado)
5. [Sección E — Tipo de Propiedad](#sección-e--tipo-de-propiedad)
6. [Sección F — Gestión y Operación](#sección-f--gestión-y-operación)
7. [Sección G — Riesgos y Tolerancias](#sección-g--riesgos-y-tolerancias)
8. [Sección H — Estrategia de Salida](#sección-h--estrategia-de-salida)
9. [Sección I — Validación Final](#sección-i--validación-final)
10. [Procesamiento y Output](#procesamiento-y-output)

---

# SECCIÓN A — PERFIL DEL INVERSOR

**Propósito:** Entender experiencia, motivación y perfil de riesgo.

```
A1. ¿Es tu primera inversión inmobiliaria?
    ○ Sí, primera vez
    ○ No, ya tengo 1-2 propiedades en alquiler
    ○ No, tengo 3-5 propiedades
    ○ No, tengo más de 5 (cartera establecida)

A2. [Si no es primera] ¿Cómo te fue con las anteriores?
    ○ Muy bien, quiero más
    ○ Bien, con algunos aprendizajes
    ○ Regular, tuve problemas
    ○ Mal, pero quiero reintentar mejor

A3. ¿Por qué querés invertir en inmuebles ahora?
    □ Diversificar inversiones
    □ Generar ingreso pasivo mensual
    □ Proteger capital de inflación
    □ Aprovechar oportunidad de mercado
    □ Herencia / dinero que necesita destino
    □ Otro: [texto]

A4. ¿Cómo te definirías como inversor?
    ○ Conservador (priorizo seguridad sobre retorno)
    ○ Moderado (balance entre riesgo y retorno)
    ○ Agresivo (acepto más riesgo por más retorno)

A5. ¿Cuánto tiempo podés dedicar a gestionar esta inversión?
    ○ Nada - necesito que sea 100% pasivo
    ○ Poco - máximo 2-3 horas/mes
    ○ Algo - puedo involucrarme si es necesario
    ○ Mucho - puedo gestionarlo activamente

A6. ¿Tenés estructura para gestionar alquileres?
    ○ No, necesito administrador
    ○ Tengo alguien de confianza
    ○ Yo mismo lo gestiono
    ○ Tengo empresa/equipo para esto
```

**Output Sección A:**
```json
{
  "perfil_inversor": {
    "experiencia": "1-2_propiedades",
    "resultado_anterior": "bien_con_aprendizajes",
    "motivacion": ["ingreso_pasivo", "diversificar"],
    "perfil_riesgo": "moderado",
    "disponibilidad_gestion": "poco",
    "estructura_gestion": "necesito_administrador"
  }
}
```

---

# SECCIÓN B — CAPITAL Y ESTRUCTURA

**Propósito:** Entender capacidad real y estructura de la inversión.

```
B1. ¿Cuánto capital tenés disponible para esta inversión?
    $[________] USD

B2. ¿De dónde viene ese capital?
    □ Ahorro / liquidez disponible
    □ Venta de otra inversión
    □ Venta de propiedad
    □ Crédito / apalancamiento
    □ Herencia
    □ Otro: [texto]

B3. ¿Vas a usar apalancamiento (crédito)?
    ○ No, compro 100% cash
    ○ Sí, parcialmente
      → ¿Qué % financiás? [___]%
      → ¿Tasa aproximada? [___]%
      → ¿Plazo? [___] años
    ○ Todavía no sé

B4. [Si hay crédito] ¿Cuál sería la cuota mensual?
    $[________] USD/mes

B5. ¿Tenés reserva para:
    
    Meses de vacancia (sin inquilino)?
    ○ Sí, [___] meses cubiertos
    ○ No específicamente
    
    Reparaciones/mantenimiento?
    ○ Sí, $[___] reservados
    ○ No específicamente
    
    Imprevistos legales?
    ○ Sí
    ○ No

B6. ¿Esta inversión es parte de una cartera más grande?
    ○ No, es mi única/principal inversión
    ○ Sí, es parte de mi cartera inmobiliaria
    ○ Sí, es parte de cartera diversificada (acciones, bonos, etc.)

B7. ¿Qué porcentaje de tu patrimonio representa esta compra?
    ○ Menos del 20%
    ○ 20-40%
    ○ 40-60%
    ○ Más del 60%
    ○ Prefiero no decir
```

**Output Sección B:**
```json
{
  "capital": {
    "disponible_usd": 120000,
    "origen": ["ahorro", "venta_inversion"],
    "apalancamiento": {
      "usa_credito": true,
      "porcentaje_financiado": 50,
      "tasa": 8.5,
      "plazo_anos": 15,
      "cuota_mensual": 600
    },
    "reservas": {
      "vacancia_meses": 3,
      "mantenimiento_usd": 5000,
      "imprevistos": true
    },
    "contexto_cartera": "parte_cartera_diversificada",
    "porcentaje_patrimonio": "20-40"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- B7 > 60% patrimonio + primera inversión → `ALERTA: concentracion_riesgo`
- Crédito + sin reserva vacancia → `ALERTA: riesgo_cashflow_negativo`
- 100% apalancado → `ALERTA: alto_apalancamiento`

---

# SECCIÓN C — EXPECTATIVAS DE RETORNO

**Propósito:** Alinear expectativas con realidad del mercado.

```
C1. ¿Qué retorno mensual MÍNIMO necesitás para que valga la pena?
    ○ Menos de $300/mes
    ○ $300-500/mes
    ○ $500-800/mes
    ○ $800-1200/mes
    ○ Más de $1200/mes

C2. ¿Qué retorno anual esperás sobre tu inversión (ROI)?
    ○ 3-5% anual (conservador)
    ○ 5-7% anual (moderado)
    ○ 7-10% anual (optimista)
    ○ Más de 10% anual (agresivo)
    ○ No sé qué es realista

C3. ¿Sabés cuál es el CAP rate típico en Equipetrol?
    ○ Sí, aproximadamente [___]%
    ○ No estoy seguro
    ○ No sé qué es CAP rate
    
    [Info: CAP rate en Equipetrol está entre 4-6% típicamente]

C4. ¿Qué preferís?
    ○ Mayor renta mensual, aunque sea zona menos premium
    ○ Menor renta mensual, pero zona premium (más segura)
    ○ Balance entre ambos

C5. ¿Qué tan importante es la apreciación del inmueble?
    ○ No me importa, solo quiero renta
    ○ Es un bonus, pero no lo principal
    ○ Es importante, busco renta + apreciación
    ○ Es muy importante

C6. ¿Aceptarías renta menor si el inquilino es muy confiable/estable?
    ○ Sí, prefiero estabilidad
    ○ Depende de cuánto menos
    ○ No, quiero maximizar renta
```

**Output Sección C:**
```json
{
  "expectativas": {
    "renta_minima_mensual": "500-800",
    "roi_esperado": "5-7",
    "conoce_cap_rate": true,
    "cap_rate_esperado": 5,
    "preferencia_zona_vs_renta": "balance",
    "importancia_apreciacion": "bonus",
    "prioriza_estabilidad": true
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- ROI esperado > 10% → `ALERTA: expectativa_irrealista`
- No conoce CAP rate + primera inversión → `ALERTA: necesita_educacion`

---

# SECCIÓN D — UBICACIÓN Y MERCADO

**Propósito:** Dónde invertir basado en demanda de alquiler.

```
D1. ¿Qué zonas te interesan?
    □ Equipetrol (alta demanda, precio alto)
    □ Equipetrol Norte (demanda corporativa)
    □ Urbari (demanda familiar)
    □ Sirari (emergente)
    □ Las Palmas (demanda mixta)
    □ Centro (comercial)
    □ [otras zonas]

D2. ¿Qué tipo de inquilino buscás?
    □ Ejecutivos/corporativos (contratos cortos, pagan bien)
    □ Familias (contratos largos, estables)
    □ Jóvenes profesionales (rotan más)
    □ Extranjeros/expats (pagan en USD)
    □ Estudiantes (cerca de universidades)
    □ El que pague, no tengo preferencia

D3. ¿Qué tan importante es la ubicación premium?
    ○ Muy importante - solo zonas top
    ○ Importante - prefiero buenas zonas
    ○ Flexible - donde haya demanda
    ○ No importante - busco mejor retorno

D4. ¿Conocés la demanda de alquiler en estas zonas?
    ○ Sí, tengo datos/experiencia
    ○ Algo, por referencias
    ○ No realmente
    
D5. ¿Qué tan importante es la seguridad del edificio para tu inquilino target?
    ○ Crítico (ejecutivos, familias)
    ○ Importante
    ○ Normal
    ○ No tan relevante
```

**Output Sección D:**
```json
{
  "ubicacion": {
    "zonas_interes": ["Equipetrol", "Equipetrol Norte"],
    "inquilino_target": ["ejecutivos", "extranjeros"],
    "importancia_zona_premium": "importante",
    "conoce_demanda": "algo",
    "importancia_seguridad": "critico"
  }
}
```

---

# SECCIÓN E — TIPO DE PROPIEDAD

**Propósito:** Qué tipo de inmueble optimiza para renta.

```
E1. ¿Qué tipo de propiedad buscás?
    ○ Monoambiente / Studio (más rentable por m²)
    ○ 1 dormitorio (demanda alta, rotación media)
    ○ 2 dormitorios (demanda estable, familias/parejas)
    ○ 3+ dormitorios (familias, menor rotación)
    ○ Flexible, lo que rinda mejor

E2. ¿Preferís propiedad:
    ○ Nueva (menos mantenimiento, más cara)
    ○ Usada en buen estado (mejor precio, algo de mantenimiento)
    ○ Para refaccionar (más barata, requiere inversión inicial)
    ○ Indiferente

E3. ¿Qué tan importante es que venga amoblado?
    ○ Necesario - quiero alquilar amoblado (más renta)
    ○ Preferible - pero puedo amoblar yo
    ○ Indiferente
    ○ Prefiero sin amoblar

E4. === INNEGOCIABLES PARA RENTA ===
    Sin esto, no me interesa:
    
    □ Edificio con seguridad 24/7
    □ Estacionamiento incluido
    □ Expensas bajas (< $150)
    □ Ascensor
    □ Amenities atractivos (piscina, gym)
    □ Pet friendly (amplía mercado)
    □ Buena iluminación natural
    □ Ninguno es innegociable

E5. ¿Qué NO querés?
    □ Planta baja (menos demanda)
    □ Último piso sin ascensor
    □ Edificios conflictivos (mala administración)
    □ Expensas muy altas (> $300)
    □ Zonas con poca demanda
    □ Propiedades que necesiten mucha refacción

E6. ¿Cuál es tu rango de precio?
    Mínimo: $[________] USD
    Máximo: $[________] USD
```

**Output Sección E:**
```json
{
  "propiedad": {
    "tipo_preferido": "2_dormitorios",
    "estado": "usada_buen_estado",
    "amoblado": "preferible",
    "innegociables": ["seguridad_24h", "estacionamiento", "expensas_bajas"],
    "rechazos": ["planta_baja", "expensas_altas"],
    "precio_min": 80000,
    "precio_max": 120000
  }
}
```

---

# SECCIÓN F — GESTIÓN Y OPERACIÓN

**Propósito:** Cómo va a operar esta inversión.

```
F1. ¿Quién va a gestionar el alquiler?
    ○ Yo mismo
    ○ Administrador/inmobiliaria
      → ¿Ya tenés uno? ○ Sí ○ No
      → ¿Sabés cuánto cobran? [___]% de la renta
    ○ Familiar/persona de confianza
    ○ Todavía no sé

F2. ¿Cómo vas a encontrar inquilinos?
    ○ Inmobiliaria
    ○ Portales (InfoCasas, etc.)
    ○ Referencias personales
    ○ Redes sociales
    ○ No sé todavía

F3. ¿Qué tipo de contrato preferís?
    ○ Corto plazo (6 meses - 1 año) - más renta, más rotación
    ○ Largo plazo (1-2 años) - menos renta, más estable
    ○ Temporal/corporativo - más renta, requiere amoblado
    ○ Lo que consiga

F4. ¿Vas a pedir garantías?
    ○ Sí, garantía inmobiliaria
    ○ Sí, garante personal
    ○ Sí, depósito alto (3+ meses)
    ○ Flexible según inquilino
    ○ No sé cómo funciona

F5. ¿Tenés contador/estructura para declarar estos ingresos?
    ○ Sí, todo en regla
    ○ Más o menos
    ○ No, pero lo voy a hacer
    ○ Prefiero no responder

F6. ¿Qué harías si el inquilino no paga?
    ○ Tengo reservas para aguantar
    ○ Iniciaría proceso legal
    ○ Negociaría
    ○ No sé qué haría
```

**Output Sección F:**
```json
{
  "gestion": {
    "quien_gestiona": "administrador",
    "tiene_administrador": false,
    "costo_administracion": 10,
    "canal_inquilinos": "inmobiliaria",
    "tipo_contrato": "largo_plazo",
    "garantias": "deposito_alto",
    "estructura_fiscal": "mas_o_menos",
    "plan_impago": "reservas"
  }
}
```

---

# SECCIÓN G — RIESGOS Y TOLERANCIAS

**Propósito:** Entender qué riesgos puede y quiere asumir.

```
G1. ¿Cuántos meses de vacancia tolerás al año?
    ○ 0 - no puedo tener vacancia
    ○ 1 mes
    ○ 2-3 meses
    ○ Más de 3 meses está bien

G2. ¿Qué pasa si hay que hacer una reparación de $3000?
    ○ Lo tengo cubierto, no es problema
    ○ Es un golpe pero manejable
    ○ Sería un problema serio
    ○ No podría cubrirlo

G3. ¿Qué tan preocupado estás por inquilinos problemáticos?
    ○ Mucho - es mi mayor miedo
    ○ Bastante - me preocupa
    ○ Normal - es parte del negocio
    ○ Poco - sé manejarlos

G4. ¿Qué riesgo te preocupa MÁS?
    □ Vacancia prolongada
    □ Inquilino que no paga
    □ Daños a la propiedad
    □ Expensas que suban mucho
    □ Que baje el precio del inmueble
    □ Problemas legales
    □ Que la zona se desvalorice

G5. Si tuvieras que elegir:
    ○ Menor renta pero inquilino seguro
    ○ Mayor renta aunque sea inquilino más riesgoso

G6. Si tuvieras que elegir:
    ○ Propiedad en zona premium, menor rentabilidad
    ○ Propiedad en zona emergente, mayor rentabilidad

G7. ¿Cuál es tu horizonte mínimo de inversión?
    ○ 1-3 años
    ○ 3-5 años
    ○ 5-10 años
    ○ Más de 10 años
```

**Output Sección G:**
```json
{
  "tolerancias": {
    "vacancia_max_meses": 2,
    "capacidad_reparacion_3k": "manejable",
    "preocupacion_inquilinos": "bastante",
    "riesgos_principales": ["vacancia", "no_pago"],
    "renta_vs_seguridad": "seguridad",
    "zona_vs_rentabilidad": "zona_premium",
    "horizonte_minimo": "5-10"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Vacancia 0 tolerada + sin reservas → `ALERTA: fragilidad_cashflow`
- Reparación $3k = problema serio → `ALERTA: subcapitalizado`
- Horizonte < 3 años + apalancamiento → `ALERTA: horizonte_corto_riesgoso`

---

# SECCIÓN H — ESTRATEGIA DE SALIDA

**Propósito:** Entender plan a largo plazo.

```
H1. ¿Cuál es tu plan a largo plazo con esta propiedad?
    ○ Mantener indefinidamente (ingreso perpetuo)
    ○ Vender cuando se aprecie suficiente
    ○ Parte de cartera que iré rotando
    ○ No tengo plan definido

H2. ¿En qué circunstancias venderías?
    □ Si necesito el capital
    □ Si la rentabilidad baja mucho
    □ Si aparece mejor oportunidad
    □ Si la zona se devalúa
    □ Cuando me jubile
    □ No pienso vender
    □ Otro: [texto]

H3. ¿Qué tan importante es que sea fácil de vender?
    ○ Muy importante - necesito liquidez
    ○ Importante - quiero opciones
    ○ Poco importante - es inversión largo plazo
    ○ No me importa

H4. Si tuvieras que vender en 2 años, ¿qué pasaría?
    ○ Ningún problema
    ○ Perdería algo de rentabilidad
    ○ Perdería dinero probablemente
    ○ Sería muy malo

H5. ¿Considerarías alquilar por Airbnb/temporal?
    ○ Sí, es mi plan principal
    ○ Sí, como alternativa
    ○ No me interesa
    ○ No sé cómo funciona
```

**Output Sección H:**
```json
{
  "estrategia_salida": {
    "plan_largo_plazo": "mantener_indefinido",
    "circunstancias_venta": ["necesito_capital", "mejor_oportunidad"],
    "importancia_liquidez": "importante",
    "impacto_venta_2_anos": "perderia_rentabilidad",
    "considera_airbnb": "como_alternativa"
  }
}
```

---

# SECCIÓN I — VALIDACIÓN FINAL

**Propósito:** Confirmar números y expectativas realistas.

```
I1. VALIDACIÓN DE NÚMEROS

    Tu inversión: $[X] USD
    Retorno mensual esperado: $[Y]/mes
    
    Eso implica un ROI de [Z]% anual.
    
    El CAP rate típico en Equipetrol es 4-6%.
    
    ¿Tu expectativa es:
    ○ Realista - estoy dentro del rango
    ○ Optimista - sé que estoy arriba
    ○ No estaba seguro - gracias por el dato

I2. VALIDACIÓN DE INNEGOCIABLES

    Dijiste que esto es innegociable:
    • [lista de E4]
    
    "Si aparece propiedad con EXCELENTE retorno 
    pero NO tiene [innegociable], ¿la descartás?"
    
    [item]: ○ Sí, descarto ○ Tal vez miraría

I3. VALIDACIÓN DE RIESGO

    Dijiste que tu perfil es [conservador/moderado/agresivo].
    
    Pero también dijiste:
    - [inconsistencia si existe]
    
    ¿Cómo lo reconciliás?
    [texto libre]

I4. ¿Qué haría que esta inversión sea un ÉXITO?
    [texto libre]

I5. ¿Qué haría que sea un FRACASO?
    [texto libre]

I6. ALGO MÁS
    ¿Hay algo importante que no pregunté?
    [texto libre]
```

**Output Sección I:**
```json
{
  "validacion": {
    "expectativa_roi": "realista",
    "innegociables_confirmados": ["seguridad_24h", "estacionamiento"],
    "innegociables_dudosos": ["expensas_bajas"],
    "consistencia_perfil": true,
    "definicion_exito": "Generar $600/mes netos sin dolor de cabeza",
    "definicion_fracaso": "Tener vacancia constante o inquilinos problemáticos"
  }
}
```

---

# PROCESAMIENTO Y OUTPUT

## Derivación de Perfil Fiduciario Inversor

```javascript
function generarPerfilInversor(respuestas) {
  return {
    tipo_perfil: "inversor_renta",
    
    experiencia: respuestas.A.experiencia,
    perfil_riesgo: respuestas.A.perfil_riesgo,
    
    capacidad_gestion: derivarCapacidadGestion(respuestas.A, respuestas.F),
    
    solidez_financiera: derivarSolidez(respuestas.B, respuestas.G),
    // solida | adecuada | fragil
    
    riesgo_principal: derivarRiesgoPrincipalInversor(respuestas),
    // expectativa_irrealista | subcapitalizacion | horizonte_corto
    
    sofisticacion: derivarSofisticacion(respuestas.C),
    // alta | media | baja (necesita educación)
  };
}
```

## Derivación de Guía Fiduciaria Inversor

```javascript
function generarGuiaInversor(respuestas, perfil) {
  return {
    lectura_momento: generarLecturaInversor(perfil, respuestas),
    
    objetivo_dominante: `Generar ${respuestas.C.renta_minima} USD/mes netos con riesgo ${perfil.perfil_riesgo}`,
    
    innegociables: respuestas.I.innegociables_confirmados,
    
    metricas_objetivo: {
      roi_minimo: respuestas.C.roi_esperado,
      vacancia_max: respuestas.G.vacancia_max_meses,
      renta_neta_min: calcularRentaNetaMin(respuestas)
    },
    
    riesgos_a_evitar: generarRiesgosInversor(perfil, respuestas),
    
    que_no_hacer: generarProhibicionesInversor(perfil),
    
    proximo_paso: generarPasoInversor(perfil)
  };
}
```

## Output Final Completo

```json
{
  "tipo_formulario": "inversor_renta",
  "version": "1.0",
  "fecha": "2026-01-06",
  
  "perfil_fiduciario": {
    "tipo": "inversor_renta",
    "experiencia": "1-2_propiedades",
    "perfil_riesgo": "moderado",
    "capacidad_gestion": "delegada",
    "solidez_financiera": "adecuada",
    "riesgo_principal": "ninguno_critico",
    "sofisticacion": "media"
  },
  
  "guia_fiduciaria": {
    "lectura_momento": "Inversor con experiencia limitada, perfil moderado, expectativas realistas...",
    "objetivo_dominante": "Generar $500-800 USD/mes netos con bajo mantenimiento",
    "innegociables": ["seguridad_24h", "estacionamiento"],
    "metricas_objetivo": {
      "roi_minimo": "5-7%",
      "vacancia_max_meses": 2,
      "renta_neta_minima": 500,
      "precio_max_usd": 120000
    },
    "riesgos_a_evitar": ["vacancia_prolongada", "inquilino_problematico"],
    "que_no_hacer": ["No comprar sin calcular CAP rate real", "No subestimar costos"],
    "proximo_paso": "Ver propiedades con CAP rate > 5% confirmado"
  },
  
  "alertas": [],
  
  "mbf_ready": {
    "filtros_duros": {
      "precio_max_usd": 120000,
      "precio_min_usd": 80000,
      "zonas": ["Equipetrol", "Equipetrol Norte"],
      "amenities_requeridos": ["seguridad_24h"],
      "expensas_max_usd": 150,
      "tipo": ["1D", "2D"]
    },
    "filtros_blandos": {
      "demanda_alquiler": "alta",
      "tipo_inquilino": ["ejecutivo", "extranjero"]
    },
    "ordenamiento": [
      "cap_rate_estimado",
      "demanda_zona",
      "calidad_dato"
    ],
    "modo": "exploracion",
    "cantidad_max": 5
  }
}
```

---

# ALERTAS ESPECÍFICAS INVERSOR RENTA

| Alerta | Trigger | Severidad | Acción |
|--------|---------|-----------|--------|
| Expectativa irrealista | ROI esperado > 10% | Alta | Educar sobre CAP rate real |
| Subcapitalizado | Reparación $3k = problema | Alta | Recomendar reservas |
| Fragilidad cashflow | Vacancia 0 + sin reservas | Crítica | Warning explícito |
| Alto apalancamiento | >70% financiado + horizonte corto | Alta | Evaluar riesgo |
| Primera vez sin educación | Primera inversión + no conoce CAP | Media | Sugerir educación |
| Concentración | >60% patrimonio en esta compra | Media | Diversificar |

---

# MÉTRICAS ESPECÍFICAS PARA INVERSOR

El MBF para inversor incluye métricas que no existen en vivienda:

```json
{
  "metricas_inversion": {
    "cap_rate_minimo": 4.5,
    "renta_estimada_zona": true,
    "demanda_alquiler_zona": "alta",
    "vacancia_promedio_zona": 5,
    "tipo_inquilino_predominante": "ejecutivo",
    "comparables_renta": true
  }
}
```

---

*Documento canónico v1.0 — 6 Enero 2026*
*Perfil: INVERSOR RENTA*
