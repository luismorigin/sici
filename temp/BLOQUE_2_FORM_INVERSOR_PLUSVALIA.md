# BLOQUE 2 — FORMULARIO INVERSOR PLUSVALÍA

**Documento:** Captura estructurada para inversores que buscan apreciación  
**Perfil:** Inversor que quiere que el inmueble suba de valor  
**Versión:** 1.0  
**Fecha:** 6 Enero 2026  
**Estado:** Cerrado

---

## IDENTIFICACIÓN DEL PERFIL

### ¿Quién es este usuario?

- Busca **apreciación del capital**, no renta mensual
- Le importa el **timing** y la **zona emergente**
- Piensa en **comprar barato, vender caro**
- Decide con **visión de mercado + especulación calculada**
- Riesgo principal: **sobreestimar valorización, iliquidez**

### Pregunta de activación

> "¿Tu plan principal es que la propiedad suba de valor para vender después?"
> 
> ○ Sí, busco apreciación → Este formulario  
> ○ No, quiero renta mensual → FORM_INVERSOR_RENTA  
> ○ Quiero ambas cosas → FORM_INVERSOR_RENTA (con ajustes)  
> ○ Es para vivir → FORM_VIVIENDA

---

## ÍNDICE

1. [Sección A — Perfil y Experiencia](#sección-a--perfil-y-experiencia)
2. [Sección B — Capital y Horizonte](#sección-b--capital-y-horizonte)
3. [Sección C — Tesis de Inversión](#sección-c--tesis-de-inversión)
4. [Sección D — Ubicación y Timing](#sección-d--ubicación-y-timing)
5. [Sección E — Tipo de Oportunidad](#sección-e--tipo-de-oportunidad)
6. [Sección F — Estrategia de Holding](#sección-f--estrategia-de-holding)
7. [Sección G — Riesgos y Escenarios](#sección-g--riesgos-y-escenarios)
8. [Sección H — Estrategia de Salida](#sección-h--estrategia-de-salida)
9. [Sección I — Validación Final](#sección-i--validación-final)
10. [Procesamiento y Output](#procesamiento-y-output)

---

# SECCIÓN A — PERFIL Y EXPERIENCIA

**Propósito:** Entender sofisticación y track record.

```
A1. ¿Es tu primera inversión inmobiliaria especulativa?
    ○ Sí, primera vez
    ○ No, ya hice 1-2 operaciones de compra/venta
    ○ No, tengo experiencia (3-5 operaciones)
    ○ No, soy inversor experimentado (5+)

A2. [Si tiene experiencia] ¿Cómo te fue?
    ○ Muy bien - gané en todas/mayoría
    ○ Bien - algunas ganaron, algunas empate
    ○ Regular - algunas pérdidas
    ○ Mal - perdí en la mayoría
    
    → ¿Qué aprendiste? [texto]

A3. ¿Tenés experiencia en otros mercados especulativos?
    □ Acciones / bolsa
    □ Criptomonedas
    □ Forex
    □ Commodities
    □ Startups / venture
    □ No, solo inmuebles
    □ Ninguno

A4. ¿Cómo te definirías?
    ○ Conservador - busco oportunidades seguras
    ○ Moderado - riesgo calculado
    ○ Agresivo - alto riesgo, alto retorno
    ○ Muy agresivo - apuestas fuertes

A5. ¿De dónde viene tu información sobre el mercado?
    □ Investigo zonas personalmente
    □ Contactos en el sector inmobiliario
    □ Datos de mercado / analytics
    □ Intuición / experiencia
    □ Recomendaciones de terceros
    □ No tengo fuentes específicas

A6. ¿Cuánto tiempo dedicás a investigar antes de invertir?
    ○ Mucho (semanas/meses)
    ○ Bastante (días/semanas)
    ○ Algo (reviso lo básico)
    ○ Poco (decido rápido)
```

**Output Sección A:**
```json
{
  "perfil_especulador": {
    "experiencia_inmobiliaria": "1-2_operaciones",
    "resultado_anterior": "bien",
    "aprendizajes": "No comprar en pico, investigar zona",
    "experiencia_otros_mercados": ["acciones", "crypto"],
    "perfil_riesgo": "moderado",
    "fuentes_informacion": ["investigacion_propia", "contactos"],
    "due_diligence": "bastante"
  }
}
```

---

# SECCIÓN B — CAPITAL Y HORIZONTE

**Propósito:** Entender capacidad y timeframe.

```
B1. ¿Cuánto capital tenés para esta inversión?
    $[________] USD

B2. ¿Este capital lo podés "inmovilizar" por cuánto tiempo?
    ○ 1-2 años máximo
    ○ 2-3 años
    ○ 3-5 años
    ○ 5-10 años
    ○ Sin límite de tiempo

B3. ¿De dónde viene?
    □ Liquidez / ahorro
    □ Ganancia de otra inversión
    □ Venta de activo
    □ Crédito
    □ Otro: [texto]

B4. ¿Vas a usar apalancamiento?
    ○ No, 100% cash (más flexibilidad de salida)
    ○ Sí, parcial [___]%
    ○ Sí, máximo posible (más riesgo, más retorno)

B5. ¿Tenés otros ingresos/activos mientras esperás?
    ○ Sí, no dependo de este capital
    ○ Algo, pero no mucho
    ○ No, este es mi capital principal

B6. ¿Qué porcentaje de tu patrimonio representa?
    ○ Menos del 20%
    ○ 20-40%
    ○ 40-60%
    ○ Más del 60%

B7. Si necesitaras el capital antes de lo planeado, ¿qué impacto tendría?
    ○ Ninguno - tengo liquidez alternativa
    ○ Menor - sería incómodo
    ○ Significativo - me complicaría
    ○ Crítico - necesito este capital
```

**Output Sección B:**
```json
{
  "capital": {
    "disponible_usd": 100000,
    "horizonte_max": "3-5_anos",
    "origen": ["ganancia_inversion", "liquidez"],
    "apalancamiento": "no",
    "dependencia_capital": "no_dependo",
    "porcentaje_patrimonio": "20-40",
    "impacto_salida_anticipada": "menor"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Horizonte < 2 años + apalancamiento → `ALERTA: horizonte_muy_corto`
- >60% patrimonio + alta agresividad → `ALERTA: concentracion_extrema`
- Impacto crítico + agresivo → `ALERTA: no_puede_perder`

---

# SECCIÓN C — TESIS DE INVERSIÓN

**Propósito:** Entender la lógica detrás de buscar plusvalía.

```
C1. ¿Por qué creés que los inmuebles van a subir?
    □ Desarrollo de infraestructura en la zona
    □ Escasez de oferta
    □ Crecimiento demográfico
    □ Inversión extranjera entrando
    □ Tipo de cambio favorable
    □ Ciclo de mercado (está bajo, va a subir)
    □ Zona emergente que se va a consolidar
    □ Otro: [texto]

C2. ¿Qué apreciación anual esperás?
    ○ 3-5% anual (conservador)
    ○ 5-10% anual (moderado)
    ○ 10-15% anual (optimista)
    ○ Más de 15% anual (muy optimista)
    ○ No tengo número específico

C3. ¿Conocés la apreciación histórica en Equipetrol?
    ○ Sí, aproximadamente [___]% anual
    ○ Tengo idea general
    ○ No realmente
    
    [Info: Históricamente 3-8% anual en USD, con ciclos]

C4. ¿Cuál es tu "edge" o ventaja competitiva?
    ○ Información privilegiada sobre desarrollo
    ○ Capacidad de encontrar propiedades subvaluadas
    ○ Timing de mercado
    ○ Capital para esperar más que otros
    ○ Red de contactos
    ○ No tengo ventaja específica

C5. ¿Qué pasó en los últimos ciclos del mercado?
    ○ Sé que hubo X e Y
    ○ Tengo idea general
    ○ No conozco la historia
    
C6. ¿Qué escenario macro asumís?
    ○ Bolivia estable / creciendo
    ○ Bolivia estancada pero Santa Cruz crece
    ○ Incertidumbre pero inmuebles seguros
    ○ No pienso en macro
```

**Output Sección C:**
```json
{
  "tesis_inversion": {
    "drivers_apreciacion": ["zona_emergente", "escasez_oferta"],
    "apreciacion_esperada": "5-10",
    "conoce_historico": "idea_general",
    "ventaja_competitiva": "capital_para_esperar",
    "conoce_ciclos": "idea_general",
    "escenario_macro": "scz_crece"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Esperá >15% anual → `ALERTA: expectativa_irrealista`
- No conoce histórico + agresivo → `ALERTA: especulacion_ciega`
- "No tengo ventaja" + primera vez → `ALERTA: sin_edge`

---

# SECCIÓN D — UBICACIÓN Y TIMING

**Propósito:** Dónde y cuándo entrar.

```
D1. ¿Qué tipo de zona preferís?
    ○ Consolidada (menor riesgo, menor upside)
    ○ En transición (riesgo medio, upside medio)
    ○ Emergente (mayor riesgo, mayor upside)
    ○ Flexible según oportunidad

D2. ¿Qué zonas te interesan específicamente?
    □ Equipetrol (consolidada, cara)
    □ Equipetrol Norte (transición → consolidada)
    □ Sirari (emergente)
    □ Urbari (transición)
    □ Norte (emergente)
    □ [otras zonas]
    
    → ¿Por qué esas? [texto]

D3. ¿Qué catalizador esperás que suba los precios?
    □ Nuevo centro comercial / desarrollo
    □ Mejora de infraestructura vial
    □ Llegada de empresas / corporativos
    □ Gentrificación natural
    □ Escasez de tierra / densificación
    □ Otro: [texto]
    □ No tengo catalizador específico

D4. ¿Cuándo creés que es buen momento para comprar?
    ○ Ahora mismo (mercado está bajo)
    ○ Pronto (próximos 3-6 meses)
    ○ Cuando encuentre la oportunidad correcta
    ○ No estoy seguro del timing

D5. ¿Cómo sabés si es buen momento?
    □ Comparando precios históricos
    □ Mirando volumen de transacciones
    □ Indicadores macro
    □ Intuición / experiencia
    □ No tengo método específico

D6. ¿Estás dispuesto a comprar en preventa / pozo?
    ○ Sí, es donde está el upside
    ○ Tal vez, con desarrollador confiable
    ○ No, muy riesgoso
    ○ No sé cómo funciona
```

**Output Sección D:**
```json
{
  "ubicacion_timing": {
    "tipo_zona": "transicion",
    "zonas_interes": ["Equipetrol Norte", "Sirari"],
    "motivo": "Zona que se está consolidando, buenos precios todavía",
    "catalizador_esperado": ["infraestructura", "densificacion"],
    "timing": "cuando_encuentre_oportunidad",
    "metodo_timing": ["precios_historicos", "intuicion"],
    "considera_preventa": "con_desarrollador_confiable"
  }
}
```

---

# SECCIÓN E — TIPO DE OPORTUNIDAD

**Propósito:** Qué tipo de deal busca.

```
E1. ¿Qué tipo de oportunidad preferís?
    ○ Comprar barato y esperar (buy & hold)
    ○ Comprar, mejorar y vender (flip)
    ○ Preventa con descuento
    ○ Propiedad subvaluada / distressed
    ○ Lo que aparezca

E2. Si es para flip, ¿tenés capacidad de refacción?
    ○ Sí, tengo equipo / contactos
    ○ Podría coordinarlo
    ○ No, prefiero listo
    ○ No aplica

E3. ¿Qué descuento sobre precio de mercado necesitás?
    ○ 0-10% (oportunidad normal)
    ○ 10-20% (buen deal)
    ○ 20-30% (muy buen deal)
    ○ +30% (solo distressed / problemas)

E4. ¿Qué tipo de propiedad tiene mejor potencial?
    ○ Departamentos chicos (más líquidos)
    ○ Departamentos medianos (balance)
    ○ Departamentos grandes (menos oferta)
    ○ Terrenos (más especulativo)
    ○ Lo que esté subvaluado

E5. === INNEGOCIABLES ===
    Sin esto, no invierto:
    
    □ Zona con desarrollo confirmado
    □ Desarrollador conocido (si es preventa)
    □ Documentación perfecta
    □ Precio bajo mercado comprobable
    □ Facilidad de reventa (liquidez)
    □ Ninguno es innegociable

E6. ¿Rango de precio?
    Mínimo: $[________] USD
    Máximo: $[________] USD

E7. ¿Cuántas propiedades pensás comprar?
    ○ Una sola (concentrada)
    ○ 2-3 (diversificación básica)
    ○ Varias (cartera)
```

**Output Sección E:**
```json
{
  "oportunidad": {
    "tipo": "buy_and_hold",
    "capacidad_flip": "no_prefiero_listo",
    "descuento_requerido": "10-20",
    "tipo_propiedad": "deptos_medianos",
    "innegociables": ["documentacion_perfecta", "liquidez"],
    "precio_min": 70000,
    "precio_max": 120000,
    "cantidad_propiedades": "una"
  }
}
```

---

# SECCIÓN F — ESTRATEGIA DE HOLDING

**Propósito:** Qué hacer mientras espera la apreciación.

```
F1. Mientras esperás que suba, ¿qué vas a hacer con la propiedad?
    ○ Alquilarla (generar algo mientras espero)
    ○ Dejarla vacía (más flexible para venta)
    ○ Usarla yo temporalmente
    ○ Depende del caso

F2. [Si alquila] ¿Qué tipo de alquiler?
    ○ Largo plazo (más estable, menos flexible)
    ○ Corto plazo / temporal (más flexible)
    ○ Airbnb (más trabajo, más flexibilidad)

F3. ¿Cuánto tiempo máximo esperarías para vender?
    ○ 1-2 años
    ○ 2-3 años
    ○ 3-5 años
    ○ 5-10 años
    ○ Lo que haga falta

F4. ¿Cada cuánto vas a revisar tu posición?
    ○ Mensualmente
    ○ Trimestralmente
    ○ Anualmente
    ○ Solo cuando quiera vender

F5. ¿Qué triggers de venta tenés definidos?
    □ Apreciación de X%
    □ Cambio en fundamentals de la zona
    □ Necesidad de liquidez
    □ Mejor oportunidad aparece
    □ No tengo triggers definidos

F6. ¿Vas a necesitar gestionar la propiedad activamente?
    ○ Sí, puedo/quiero
    ○ No, necesito administrador
    ○ Prefiero dejarla vacía
```

**Output Sección F:**
```json
{
  "holding": {
    "uso_mientras_espera": "alquilar",
    "tipo_alquiler": "corto_plazo",
    "tiempo_max_hold": "3-5_anos",
    "frecuencia_revision": "trimestral",
    "triggers_venta": ["apreciacion_x", "mejor_oportunidad"],
    "gestion": "administrador"
  }
}
```

---

# SECCIÓN G — RIESGOS Y ESCENARIOS

**Propósito:** Testear preparación para escenarios negativos.

```
G1. ¿Qué pasa si el precio NO sube en 3 años?
    ○ No pasa nada, sigo esperando
    ○ Evaluaría vender sin ganancia
    ○ Me preocuparía mucho
    ○ Sería un problema serio

G2. ¿Qué pasa si el precio BAJA 20%?
    ○ Compro más (promedio down)
    ○ Mantengo y espero
    ○ Evaluaría vender con pérdida
    ○ No puedo permitirme esa pérdida

G3. ¿Qué pasa si necesitás vender urgente y no hay compradores?
    ○ No me preocupa, tengo tiempo
    ○ Bajaría precio agresivamente
    ○ Sería muy problemático
    ○ No lo contemplé

G4. ¿Qué riesgos te preocupan MÁS?
    □ Que el mercado no suba
    □ Que la zona no se desarrolle como esperás
    □ Iliquidez (no poder vender)
    □ Problemas legales / documentación
    □ Devaluación / crisis económica
    □ Que haya sobreoferta
    □ Timing equivocado

G5. ¿Cuál es tu pérdida máxima aceptable?
    ○ 0% - no puedo perder nada
    ○ Hasta 10%
    ○ Hasta 20%
    ○ Hasta 30%
    ○ No tengo límite si la tesis sigue válida

G6. Escenario: Bolivia entra en crisis económica. ¿Qué hacés?
    ○ Mantengo - inmuebles son refugio
    ○ Evaluaría vender rápido
    ○ Depende de qué tan grave
    ○ No contemplo ese escenario
```

**Output Sección G:**
```json
{
  "escenarios": {
    "si_no_sube_3_anos": "sigo_esperando",
    "si_baja_20": "mantengo_espero",
    "si_iliquido": "no_preocupa",
    "riesgos_principales": ["mercado_no_sube", "iliquidez"],
    "perdida_max_aceptable": "hasta_20",
    "escenario_crisis": "depende_gravedad"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- Si baja 20% = "no puedo" → `ALERTA: no_puede_perder`
- Pérdida 0% aceptable + agresivo → `ALERTA: inconsistencia_perfil`
- No contempla crisis → `ALERTA: sesgo_optimista`

---

# SECCIÓN H — ESTRATEGIA DE SALIDA

**Propósito:** Plan concreto de venta.

```
H1. ¿A qué precio/retorno venderías?
    ○ Cuando suba [___]% sobre mi compra
    ○ Cuando llegue a $[___] USD
    ○ Cuando el mercado esté en pico
    ○ No tengo número específico

H2. ¿Cómo vas a saber cuándo es el pico?
    ○ Tengo indicadores definidos
    ○ Intuición / experiencia
    ○ Cuando todos estén comprando
    ○ No sé exactamente

H3. ¿A quién le venderías?
    ○ Usuario final (más precio, más tiempo)
    ○ Otro inversor (más rápido, menos precio)
    ○ Al que pague mejor
    ○ No lo pensé

H4. ¿Cómo vas a vender?
    ○ Inmobiliaria
    ○ Contactos directos
    ○ Portales
    ○ No lo pensé todavía

H5. ¿Qué costos de venta contemplás?
    □ Comisión inmobiliaria (2-3%)
    □ Impuestos
    □ Gastos legales
    □ No los contemplé

H6. ¿Cuál es tu "stop loss" mental?
    (Precio al que venderías para cortar pérdidas)
    ○ No tengo - nunca vendo con pérdida
    ○ Si baja más de [___]%, vendo
    ○ Depende de las circunstancias
```

**Output Sección H:**
```json
{
  "salida": {
    "trigger_venta": "cuando_suba_30",
    "como_detecta_pico": "intuicion",
    "comprador_target": "al_que_pague",
    "canal_venta": "inmobiliaria",
    "costos_contemplados": ["comision", "impuestos"],
    "stop_loss": "si_baja_mas_25"
  }
}
```

---

# SECCIÓN I — VALIDACIÓN FINAL

**Propósito:** Testear consistencia y realismo.

```
I1. VALIDACIÓN DE EXPECTATIVAS

    Inversión: $[X] USD
    Horizonte: [Y] años
    Retorno esperado: [Z]%
    
    Retorno anualizado implícito: [calculado]%
    Histórico de la zona: 3-8% anual
    
    Tu expectativa es:
    ○ Realista
    ○ Optimista (soy consciente)
    ○ No sabía el histórico

I2. VALIDACIÓN DE TESIS

    Tu tesis es: [resumen de C1]
    
    ¿Qué pasa si ese catalizador NO ocurre?
    [texto libre]

I3. VALIDACIÓN DE RIESGO

    Dijiste que sos [perfil] y podés perder hasta [X]%.
    
    Pero también dijiste [inconsistencia si existe].
    
    ¿Cómo lo reconciliás?
    [texto libre]

I4. ¿Qué información te falta para decidir?
    □ Precios comparables reales
    □ Historial de la zona
    □ Info sobre desarrollos futuros
    □ Opinión de expertos
    □ Nada, estoy listo
    □ Otro: [texto]

I5. ¿Qué haría que esta inversión sea ÉXITO?
    [texto libre]

I6. ¿Qué haría que sea FRACASO?
    [texto libre]

I7. ALGO MÁS
    ¿Hay algo que no pregunté?
    [texto libre]
```

**Output Sección I:**
```json
{
  "validacion": {
    "expectativa_vs_historico": "optimista_consciente",
    "plan_si_catalizador_falla": "Seguiría esperando, la zona tiene potencial de todas formas",
    "consistencia_riesgo": true,
    "info_faltante": ["precios_comparables", "desarrollos_futuros"],
    "definicion_exito": "Vender en 3-4 años con 30%+ de ganancia",
    "definicion_fracaso": "Tener que vender con pérdida o quedarme atrapado"
  }
}
```

---

# PROCESAMIENTO Y OUTPUT

## Derivación de Perfil Fiduciario Plusvalía

```javascript
function generarPerfilPlusvalia(respuestas) {
  return {
    tipo_perfil: "inversor_plusvalia",
    
    experiencia: respuestas.A.experiencia_inmobiliaria,
    sofisticacion: derivarSofisticacion(respuestas.A, respuestas.C),
    perfil_riesgo: respuestas.A.perfil_riesgo,
    
    solidez_financiera: derivarSolidez(respuestas.B),
    // solida | adecuada | fragil
    
    calidad_tesis: evaluarTesis(respuestas.C, respuestas.D),
    // solida | razonable | debil | especulativa
    
    riesgo_principal: derivarRiesgoPrincipal(respuestas),
    // expectativa_irrealista | iliquidez | concentracion | sin_edge
    
    preparacion_downside: evaluarDownside(respuestas.G),
    // preparado | parcial | no_preparado
  };
}
```

## Derivación de Guía Fiduciaria Plusvalía

```javascript
function generarGuiaPlusvalia(respuestas, perfil) {
  return {
    lectura_momento: generarLecturaPlusvalia(perfil, respuestas),
    
    objetivo_dominante: `Apreciación de ${respuestas.C.apreciacion_esperada}% en ${respuestas.B.horizonte_max}`,
    
    tesis_inversion: {
      drivers: respuestas.C.drivers_apreciacion,
      catalizador: respuestas.D.catalizador_esperado,
      ventaja: respuestas.C.ventaja_competitiva
    },
    
    innegociables: respuestas.E.innegociables,
    
    parametros: {
      precio_max: respuestas.E.precio_max,
      descuento_min: respuestas.E.descuento_requerido,
      horizonte_max: respuestas.B.horizonte_max,
      perdida_max: respuestas.G.perdida_max_aceptable
    },
    
    estrategia_holding: respuestas.F,
    estrategia_salida: respuestas.H,
    
    riesgos_a_monitorear: respuestas.G.riesgos_principales,
    
    que_no_hacer: generarProhibicionesPlusvalia(perfil),
    
    proximo_paso: generarPasoPlusvalia(perfil, respuestas.I)
  };
}
```

## Output Final Completo

```json
{
  "tipo_formulario": "inversor_plusvalia",
  "version": "1.0",
  "fecha": "2026-01-06",
  
  "perfil_fiduciario": {
    "tipo": "inversor_plusvalia",
    "experiencia": "1-2_operaciones",
    "sofisticacion": "media",
    "perfil_riesgo": "moderado",
    "solidez_financiera": "adecuada",
    "calidad_tesis": "razonable",
    "riesgo_principal": "ninguno_critico",
    "preparacion_downside": "parcial"
  },
  
  "guia_fiduciaria": {
    "lectura_momento": "Inversor con experiencia limitada pero tesis razonable...",
    "objetivo_dominante": "Apreciación 20-30% en 3-5 años",
    "tesis_inversion": {
      "drivers": ["zona_emergente", "escasez_oferta"],
      "catalizador": "consolidacion_equipetrol_norte",
      "ventaja": "capital_para_esperar"
    },
    "innegociables": ["documentacion_perfecta", "liquidez"],
    "parametros": {
      "precio_max_usd": 120000,
      "descuento_min": "10-20%",
      "horizonte_max": "3-5_anos",
      "perdida_max": "20%"
    },
    "riesgos_a_monitorear": ["mercado_no_sube", "iliquidez"],
    "que_no_hacer": [
      "No comprar sin comparables reales",
      "No asumir apreciación garantizada",
      "No concentrar >50% patrimonio"
    ],
    "proximo_paso": "Obtener precios comparables de zona target"
  },
  
  "alertas": [
    {"tipo": "info_faltante", "severidad": "media", "detalle": "precios_comparables"}
  ],
  
  "mbf_ready": {
    "filtros_duros": {
      "precio_max_usd": 120000,
      "precio_min_usd": 70000,
      "zonas": ["Equipetrol Norte", "Sirari"],
      "estado_comercial": ["en_venta", "preventa"]
    },
    "filtros_blandos": {
      "tipo_zona": "transicion",
      "potencial_apreciacion": "alto",
      "liquidez_reventa": "alta"
    },
    "ordenamiento": [
      "descuento_vs_mercado",
      "potencial_zona",
      "liquidez"
    ],
    "modo": "exploracion",
    "cantidad_max": 5
  }
}
```

---

# ALERTAS ESPECÍFICAS PLUSVALÍA

| Alerta | Trigger | Severidad | Acción |
|--------|---------|-----------|--------|
| Expectativa irrealista | >15% anual esperado | Alta | Educar sobre históricos |
| Especulación ciega | Primera vez + no conoce ciclos | Alta | Sugerir educación |
| Sin edge | "No tengo ventaja" + agresivo | Media | Cuestionar tesis |
| No puede perder | Pérdida 0% + cualquier perfil | Alta | Reconsiderar inversión |
| Concentración extrema | >60% patrimonio | Alta | Diversificar |
| Horizonte corto | <2 años + apalancamiento | Alta | Reconsiderar estructura |
| Sesgo optimista | No contempla crisis | Media | Stress test |
| Info faltante | Necesita datos para decidir | Media | Proporcionar antes de avanzar |

---

# MÉTRICAS ESPECÍFICAS PARA PLUSVALÍA

El MBF para plusvalía incluye métricas que no existen en otros perfiles:

```json
{
  "metricas_plusvalia": {
    "precio_m2_zona": true,
    "precio_m2_historico": true,
    "tendencia_zona": "alcista|estable|bajista",
    "volumen_transacciones": true,
    "desarrollos_planeados": true,
    "tiempo_promedio_venta": true,
    "descuento_vs_comparables": true
  }
}
```

---

# DIFERENCIAS CON INVERSOR RENTA

| Aspecto | Inversor Renta | Inversor Plusvalía |
|---------|----------------|-------------------|
| **Objetivo** | Cashflow mensual | Apreciación capital |
| **Métrica clave** | CAP rate, ROI | Descuento, potencial zona |
| **Horizonte** | Indefinido | Definido (3-5 años típico) |
| **Liquidez** | Menos importante | Muy importante |
| **Zona preferida** | Alta demanda alquiler | Emergente/transición |
| **Riesgo principal** | Vacancia | Iliquidez |
| **Salida** | No urgente | Planeada |

---

*Documento canónico v1.0 — 6 Enero 2026*
*Perfil: INVERSOR PLUSVALÍA*
