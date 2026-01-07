# BLOQUE 2 — FORMULARIO VIVIENDA PROPIA

**Documento:** Captura estructurada para compradores de vivienda  
**Perfil:** Persona/familia que busca su hogar  
**Versión:** 1.0  
**Fecha:** 6 Enero 2026  
**Estado:** Cerrado

---

## IDENTIFICACIÓN DEL PERFIL

### ¿Quién es este usuario?

- Busca **donde vivir**, no donde invertir
- Le importa **cómo se siente** el lugar
- Piensa en **años de vida**, no en retorno
- Decide con **emoción + razón**
- Riesgo principal: **comprar por cansancio o presión**

### Pregunta de activación

> "¿Esta propiedad es para que vos/tu familia vivan ahí?"
> 
> ○ Sí → Este formulario  
> ○ No, es inversión para alquilar → FORM_INVERSOR_RENTA  
> ○ No, es inversión para revender → FORM_INVERSOR_PLUSVALIA  
> ○ Es temporal, después veo → FORM_TRANSICION

---

## ÍNDICE

1. [Sección A — Contexto de Vida](#sección-a--contexto-de-vida)
2. [Sección B — Historia de Búsqueda](#sección-b--historia-de-búsqueda)
3. [Sección C — Situación Financiera](#sección-c--situación-financiera)
4. [Sección D — Ubicación y Logística](#sección-d--ubicación-y-logística)
5. [Sección E — La Propiedad](#sección-e--la-propiedad)
6. [Sección F — Horizonte y Propósito](#sección-f--horizonte-y-propósito)
7. [Sección G — Trade-offs de Vida](#sección-g--trade-offs-de-vida)
8. [Sección H — Señales de Alerta](#sección-h--señales-de-alerta)
9. [Sección I — Validación Final](#sección-i--validación-final)
10. [Procesamiento y Output](#procesamiento-y-output)

---

# SECCIÓN A — CONTEXTO DE VIDA

**Propósito:** Entender quién va a vivir y cómo es su vida diaria.

```
A1. ¿Quiénes van a vivir en esta propiedad?
    ○ Solo yo
    ○ Pareja sin hijos
    ○ Pareja con hijos
      → ¿Cuántos? [1] [2] [3] [4+]
      → Edades: □ 0-5 □ 6-12 □ 13-18 □ 18+
    ○ Familia extendida (padres, abuelos)
    ○ Compartido con roommates
    ○ Otro: [texto]

A2. ¿Tenés mascotas?
    ○ No
    ○ Sí, perro
      → Tamaño: □ Chico □ Mediano □ Grande
      → ¿Más de uno? [número]
    ○ Sí, gato
    ○ Sí, otro: [texto]
    
A3. ¿Alguien tiene necesidades especiales de vivienda?
    □ Movilidad reducida (necesita ascensor, sin escalones)
    □ Trabajo desde casa full-time (necesita espacio dedicado)
    □ Horarios nocturnos (necesita aislación acústica)
    □ Adulto mayor que necesita cuidados
    □ Niño con necesidades especiales
    □ Ninguna aplica

A4. ¿Cómo es un día típico de tu familia?
    
    Mañana:
    → ¿A qué hora salen? [____]
    → ¿Todos al mismo lugar o direcciones distintas?
    
    Tarde/Noche:
    → ¿A qué hora vuelven? [____]
    → ¿Actividades extracurriculares de hijos? [texto]

A5. Puntos de la ciudad importantes para vos:
    → Tu trabajo: [zona/dirección]
    → Trabajo pareja: [zona/dirección]
    → Colegio hijos: [nombre/zona]
    → Otra actividad frecuente (gym, familia, etc.): [zona]
```

**Output Sección A:**
```json
{
  "composicion_hogar": {
    "tipo": "pareja_con_hijos",
    "cantidad_personas": 4,
    "hijos": [
      {"rango_edad": "6-12"},
      {"rango_edad": "13-18"}
    ],
    "mascotas": {
      "tiene": true,
      "tipo": "perro",
      "tamano": "grande",
      "cantidad": 1
    },
    "necesidades_especiales": ["trabajo_remoto"]
  },
  "rutina_diaria": {
    "hora_salida": "07:30",
    "hora_regreso": "19:00",
    "direcciones_multiples": true
  },
  "puntos_criticos": {
    "trabajo_1": "Equipetrol",
    "trabajo_2": "Centro",
    "colegio": "Colegio Franco",
    "otros": ["gym Las Palmas"]
  }
}
```

---

# SECCIÓN B — HISTORIA DE BÚSQUEDA

**Propósito:** Detectar cansancio, frustración y aprendizajes previos.

```
B1. ¿Hace cuánto estás buscando?
    ○ Recién empiezo (menos de 1 mes)
    ○ Algunos meses (1-6 meses)
    ○ Bastante tiempo (6-12 meses)
    ○ Más de un año
    ○ Más de 2 años

B2. ¿Cuántas propiedades viste aproximadamente?
    ○ Menos de 5
    ○ Entre 5 y 15
    ○ Entre 15 y 30
    ○ Más de 30

B3. ¿Hubo alguna que casi comprás?
    ○ No, ninguna llegó tan lejos
    ○ Sí, una
    ○ Sí, más de una
    
    [Si Sí] → ¿Qué pasó?
    □ No acordamos precio
    □ Apareció problema legal/técnico
    □ Me arrepentí / no me cerró
    □ Se vendió antes
    □ Mi pareja/familia no quiso
    □ Otro: [texto]

B4. Hoy, ¿cómo te sentís con la búsqueda?
    ○ Energizado, recién arranco
    ○ Activo, con esperanza
    ○ Cansado pero sigo
    ○ Frustrado, quiero terminar
    ○ Presionado por algo externo
    ○ Ansioso, siento que pierdo oportunidades

B5. ¿Hay fecha límite real?
    ○ No, sin urgencia
    ○ Sí → ¿Cuándo? [fecha]
         → ¿Por qué?
           □ Vence alquiler
           □ Nace bebé
           □ Casamiento / juntarse
           □ Venta de otra propiedad
           □ Cambio de trabajo
           □ Otro: [texto]

B6. ¿Qué aprendiste de las propiedades que viste?
    (Esto nos ayuda a no repetir errores)
    [texto libre]
```

**Output Sección B:**
```json
{
  "historial_busqueda": {
    "duracion_meses": 8,
    "propiedades_vistas": "15-30",
    "casi_compro": true,
    "motivos_no_compra": ["arrepentimiento", "pareja_no_quiso"]
  },
  "estado_actual": {
    "emocional": "cansado",
    "urgencia": {
      "tiene_fecha": true,
      "fecha": "2026-06-01",
      "motivo": "vence_alquiler"
    }
  },
  "aprendizajes": "Me di cuenta que necesito más silencio del que pensaba..."
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- B1 > 6 meses + B4 frustrado/cansado → `ALERTA: riesgo_fatiga = alto`
- B3 "más de una" casi compra → `ALERTA: patron_indecision = detectado`
- B5 fecha límite < 60 días → `ALERTA: presion_temporal = critica`

---

# SECCIÓN C — SITUACIÓN FINANCIERA

**Propósito:** Capacidad real, no sueños. Proteger de ahogo.

```
C1. ¿Cuál es tu presupuesto MÁXIMO absoluto?
    (El techo real, aunque te estires)
    $[________] USD

C2. ¿De dónde sale ese dinero?
    □ Ahorro propio → ¿Cuánto? $[____]
    □ Venta de otra propiedad
      → ¿Ya vendida? ○ Sí ○ No ○ En proceso
      → ¿Monto esperado? $[____]
    □ Crédito hipotecario
      → ¿Aprobado? ○ Sí ○ No ○ En proceso
      → ¿Monto aprobado/esperado? $[____]
    □ Préstamo familiar → ¿Cuánto? $[____]
    □ Otro: [texto]

C3. [Si hay crédito] ¿Cuánto sería la cuota mensual?
    $[________] USD/mes

C4. ¿Cuánto pagás HOY de vivienda?
    (Alquiler, cuota actual, expensas actuales)
    $[________] USD/mes

C5. Si compraras, ¿cuánto MÁXIMO podrías pagar por mes?
    (Cuota + expensas + servicios, sin estresarte)
    $[________] USD/mes

C6. ¿Cuál es el máximo de EXPENSAS que tolerás?
    $[________] USD/mes

C7. ¿Tenés reserva para imprevistos?
    (Ideal: 6+ meses de gastos)
    ○ Sí, holgada (más de 6 meses)
    ○ Sí, justa (3-6 meses)
    ○ Poca (1-3 meses)
    ○ No tengo
    ○ Prefiero no responder

C8. Escenario: En 3 años NECESITÁS vender urgente.
    ¿Qué impacto tendría?
    ○ Ninguno, tengo espalda
    ○ Incómodo pero manejable
    ○ Problema serio
    ○ Desastre financiero
```

**Output Sección C:**
```json
{
  "financiero": {
    "presupuesto_max_usd": 150000,
    "fuentes": {
      "ahorro": 50000,
      "credito": {
        "aprobado": true,
        "monto": 100000,
        "cuota_mensual": 800
      }
    },
    "gasto_vivienda_actual": 600,
    "capacidad_mensual_max": 1000,
    "expensas_max": 200,
    "reserva_imprevistos": "justa",
    "tolerancia_venta_urgente": "problema_serio"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- C5 < C3 (no puede pagar cuota) → `ALERTA: imposibilidad_financiera`
- C3 > C4 * 1.5 (sube mucho) → `ALERTA: riesgo_ahogo = alto`
- C7 "no tengo" + C8 "desastre" → `ALERTA: fragilidad_critica`
- Crédito no aprobado + fecha límite → `ALERTA: incertidumbre_financiera`

---

# SECCIÓN D — UBICACIÓN Y LOGÍSTICA

**Propósito:** Dónde buscar y qué implica para la vida diaria.

```
D1. ¿Qué zonas te interesan?
    □ Equipetrol
    □ Equipetrol Norte
    □ Urbari
    □ Sirari
    □ Las Palmas
    □ NIT
    □ Barrio Equipetrol
    □ [otras zonas]
    
    → ¿Por qué esas? [texto breve]

D2. ¿Hay zonas que RECHAZÁS completamente?
    □ [misma lista]
    
    → ¿Por qué? [texto breve]

D3. Cercanía a tu TRABAJO - ¿qué tan importante?
    ○ Crítico (máx 15 min)
    ○ Importante (máx 30 min)
    ○ Flexible (hasta 45 min)
    ○ No relevante (remoto/flexible)

D4. Cercanía al COLEGIO - ¿qué tan importante?
    ○ Crítico (máx 15 min)
    ○ Importante (máx 30 min)
    ○ Flexible
    ○ No aplica

D5. ¿Cómo te movés principalmente?
    ○ Auto propio siempre
    ○ Auto + taxi/uber
    ○ Principalmente taxi/uber
    ○ Transporte público
    ○ Bicicleta/caminando

D6. ¿Cuántos estacionamientos necesitás?
    ○ 0
    ○ 1
    ○ 2
    ○ Más de 2

D7. ¿Qué tanto te afecta el tráfico diario?
    ○ Mucho - lo evito a toda costa
    ○ Bastante - prefiero minimizarlo
    ○ Normal - es parte de la vida
    ○ Poco - no me molesta
```

**Output Sección D:**
```json
{
  "ubicacion": {
    "zonas_interes": ["Equipetrol", "Urbari", "Sirari"],
    "motivo_interes": "Cerca del trabajo y buenos colegios",
    "zonas_rechazadas": ["Plan 3000"],
    "motivo_rechazo": "Inseguridad",
    "criticidad_trabajo": "importante",
    "criticidad_colegio": "critico",
    "movilidad": "auto_propio",
    "estacionamientos_requeridos": 2,
    "sensibilidad_trafico": "bastante"
  }
}
```

---

# SECCIÓN E — LA PROPIEDAD

**Propósito:** Qué necesita el espacio físico para esta vida.

```
E1. Dormitorios MÍNIMOS:
    ○ 1  ○ 2  ○ 3  ○ 4+
    
    → ¿Para qué los usarías?
      □ Dormitorio principal
      □ Hijos (¿cuántos comparten? ___)
      □ Oficina/home office
      □ Huéspedes
      □ Otro: [texto]

E2. Baños MÍNIMOS:
    ○ 1  ○ 2  ○ 3+

E3. Metros cuadrados MÍNIMOS:
    [____] m² (o "no sé")

E4. === INNEGOCIABLES ===
    Si NO tiene esto, NO me interesa aunque sea perfecta en todo lo demás:
    
    □ Silencio (calle tranquila / piso alto / contrafrente)
    □ Pet friendly (edificio acepta mi mascota)
    □ Seguridad 24/7 (portería permanente)
    □ Estacionamiento propio incluido
    □ Balcón o terraza
    □ Ascensor
    □ Luminosidad natural
    □ Área de servicio separada
    □ Depósito / baulera
    □ Vista (no a pared/medianera)
    □ Ninguno es realmente innegociable

E5. === DESEABLES ===
    Me gustaría, pero puedo vivir sin:
    
    □ Piscina
    □ Gimnasio
    □ Área de parrilla/BBQ
    □ Salón de eventos
    □ Área de juegos niños
    □ Coworking
    □ Rooftop
    □ Orientación norte
    □ Edificio nuevo (< 5 años)
    □ Edificio boutique (pocas unidades)
    □ Lobby premium

E6. === RECHAZOS ===
    Aunque el depto sea bueno, NO me interesa si:
    
    □ Planta baja
    □ Último piso sin ascensor
    □ Edificio muy grande (> 50 unidades)
    □ Edificio muy chico (< 10 unidades)
    □ Frente a avenida ruidosa
    □ Sin portero/conserje
    □ Cochera en subsuelo profundo
    □ Ninguno me molesta
```

**Output Sección E:**
```json
{
  "propiedad": {
    "dormitorios_min": 3,
    "uso_dormitorios": ["principal", "hijo_1", "oficina"],
    "banos_min": 2,
    "area_min_m2": 90,
    "innegociables": ["silencio", "pet_friendly", "estacionamiento"],
    "deseables": ["piscina", "gym", "balcon"],
    "rechazos": ["planta_baja", "avenida_ruidosa"]
  }
}
```

---

# SECCIÓN F — HORIZONTE Y PROPÓSITO

**Propósito:** Para qué es esta compra y cuánto tiempo.

```
F1. Esta propiedad es para:
    ○ Mi hogar por muchos años (definitivo)
    ○ Vivir un tiempo, después veré (3-7 años)
    ○ Paso intermedio mientras construyo/busco algo mejor
    ○ Empezar, con idea de crecer después

F2. ¿Cuánto tiempo REALISTA pensás vivir ahí?
    ○ 1-3 años
    ○ 3-7 años
    ○ 7-15 años
    ○ Más de 15 años / indefinido

F3. ¿Qué tan importante es poder vender/alquilar fácil después?
    ○ Muy importante (quiero opciones)
    ○ Algo importante
    ○ Poco importante (pienso quedarme mucho)
    ○ No me importa

F4. ¿Hay posibilidad de que tu familia crezca?
    ○ No, estamos completos
    ○ Tal vez un hijo más
    ○ Sí, probablemente
    ○ No sé

F5. ¿Y de que alguien se vaya? (hijos grandes, etc.)
    ○ No en los próximos años
    ○ Posible en 5-10 años
    ○ Probable pronto
```

**Output Sección F:**
```json
{
  "horizonte": {
    "tipo": "hogar_definitivo",
    "tiempo_estimado": "7-15",
    "importancia_liquidez": "algo",
    "familia_puede_crecer": "tal_vez",
    "familia_puede_achicarse": "5-10_anos"
  }
}
```

---

# SECCIÓN G — TRADE-OFFS DE VIDA

**Propósito:** Forzar elecciones reales, no fantasías.

```
G1. Si tuvieras que elegir (no vale "ambas"):
    ○ Mejor ubicación, menos metros
    ○ Más metros, peor ubicación

G2. Si tuvieras que elegir:
    ○ Edificio nuevo sin amenities
    ○ Edificio antiguo con buenos amenities

G3. Si tuvieras que elegir:
    ○ Más cerca del colegio, más lejos del trabajo
    ○ Más cerca del trabajo, más lejos del colegio

G4. Si tuvieras que elegir:
    ○ Departamento listo, más caro
    ○ Departamento para refaccionar, más barato

G5. Si tuvieras que elegir:
    ○ Departamento perfecto, expensas altas ($300+)
    ○ Departamento bueno, expensas bajas ($150)

G6. Si tuvieras que elegir:
    ○ Silencio total, sin vista
    ○ Vista increíble, algo de ruido

G7. ¿Qué ESTÁS DISPUESTO a resignar?
    □ Algunos metros cuadrados
    □ Un dormitorio menos
    □ Amenities del edificio
    □ Piso alto / vista
    □ Cercanía al trabajo
    □ La zona "ideal"
    □ Edificio nuevo
    □ Nada - no resigno

G8. ¿Qué NO resignás BAJO NINGUNA CIRCUNSTANCIA?
    [Mostrar lo que marcó en E4]
    Confirmá:
    □ [innegociable 1]
    □ [innegociable 2]
    □ [innegociable 3]
```

**Output Sección G:**
```json
{
  "trade_offs": {
    "ubicacion_vs_metros": "ubicacion",
    "nuevo_vs_amenities": "amenities",
    "colegio_vs_trabajo": "colegio",
    "listo_vs_precio": "precio",
    "perfecto_vs_expensas": "expensas_bajas",
    "silencio_vs_vista": "silencio",
    "dispuesto_resignar": ["metros", "amenities", "edificio_nuevo"],
    "no_resigna_nunca": ["silencio", "pet_friendly"]
  }
}
```

---

# SECCIÓN H — SEÑALES DE ALERTA

**Propósito:** Detectar miedos, presiones, riesgos emocionales.

```
H1. ¿Qué te preocupa MÁS de esta decisión? (máx 3)
    □ Equivocarme y arrepentirme
    □ Pagar de más
    □ Que baje el precio después
    □ No poder vender si necesito
    □ Problemas con edificio/vecinos
    □ Ahogarme con las cuotas
    □ Presión de familia para decidir
    □ Perder oportunidades por esperar
    □ Que mi pareja y yo no acordemos
    □ Nunca encontrar lo que busco

H2. ¿Quién más decide?
    ○ Solo yo
    ○ Mi pareja → ¿Alineados? ○ Sí ○ Más o menos ○ No
    ○ Familia opina → ¿Cuánto pesa? ○ Mucho ○ Algo ○ Poco
    ○ Otro: [texto]

H3. ¿Sentís presión para cerrar?
    ○ No, a mi ritmo
    ○ Un poco
    ○ Bastante
    ○ Mucha presión

H4. Esta búsqueda es ÉXITO si:
    [texto libre]

H5. Esta búsqueda es FRACASO si:
    [texto libre]

H6. ¿Hay algo que te da miedo admitir sobre esta búsqueda?
    [texto libre - opcional]
```

**Output Sección H:**
```json
{
  "alertas_emocionales": {
    "preocupaciones": ["arrepentimiento", "ahogo_financiero"],
    "decision_compartida": {
      "con": "pareja",
      "alineacion": "mas_o_menos"
    },
    "presion_externa": "bastante",
    "definicion_exito": "Encontrar un lugar tranquilo para mi familia",
    "definicion_fracaso": "Comprar y arrepentirme en 2 años"
  }
}
```

**🚨 ALERTAS AUTOMÁTICAS:**
- H2 pareja "no alineados" → `ALERTA: conflicto_pareja`
- H3 "mucha presión" → `ALERTA: riesgo_cierre_forzado`
- H1 "arrepentirme" + "perder oportunidades" → `ALERTA: paralisis`

---

# SECCIÓN I — VALIDACIÓN FINAL

**Propósito:** Confirmar que innegociables son reales.

```
I1. VALIDACIÓN DE INNEGOCIABLES

    Dijiste que esto es innegociable:
    • [mostrar lista de E4/G8]

    Para cada uno:
    "Si aparece depto PERFECTO pero NO tiene [X], ¿lo descartás?"
    
    [innegociable 1]: ○ Sí, descarto ○ Tal vez miraría
    [innegociable 2]: ○ Sí, descarto ○ Tal vez miraría
    [innegociable 3]: ○ Sí, descarto ○ Tal vez miraría

I2. VALIDACIÓN DE PRESUPUESTO

    Tu máximo: $[X] USD
    
    "Si aparece el depto PERFECTO pero cuesta $[X+15%], ¿qué hacés?"
    ○ No puedo, mi límite es firme
    ○ Podría estirarme
    ○ Evaluaría el caso

I3. VALIDACIÓN DE ZONA

    Rechazaste: [zonas]
    
    "Si aparece depto PERFECTO en [zona rechazada], ¿lo verías?"
    ○ No, zona descartada
    ○ Tal vez haría excepción

I4. ALGO MÁS

    ¿Hay algo importante que no pregunté?
    [texto libre]
```

**Output Sección I:**
```json
{
  "validacion": {
    "innegociables_confirmados": ["silencio", "pet_friendly"],
    "innegociables_dudosos": ["estacionamiento"],
    "presupuesto_firme": false,
    "presupuesto_real_estimado": 172500,
    "zonas_firmes": true,
    "comentarios": "..."
  }
}
```

---

# PROCESAMIENTO Y OUTPUT

## Derivación de Perfil Fiduciario

```javascript
function generarPerfilVivienda(respuestas) {
  return {
    tipo_perfil: "vivienda_propia",
    
    composicion_hogar: respuestas.A,
    
    estado_emocional: derivarEstadoEmocional(respuestas.B),
    // cansado | activo | presionado | ansioso
    
    riesgo_principal: derivarRiesgoPrincipal(respuestas),
    // cerrar_por_cansancio | ahogo_financiero | presion_pareja | paralisis
    
    tolerancia_error: derivarTolerancia(respuestas),
    // baja | media | alta
    
    horizonte: respuestas.F.tipo,
    
    capacidad_financiera: {
      real: calcularCapacidadReal(respuestas.C),
      declarada: respuestas.C.presupuesto_max
    }
  };
}
```

## Derivación de Guía Fiduciaria

```javascript
function generarGuiaVivienda(respuestas, perfil) {
  return {
    lectura_momento: generarLectura(perfil, respuestas.B),
    
    objetivo_dominante: generarObjetivo(respuestas.F, respuestas.A),
    
    innegociables: respuestas.I.innegociables_confirmados,
    
    prioridades: ordenarPrioridades(respuestas.G, respuestas.D),
    
    trade_offs_aceptados: respuestas.G.dispuesto_resignar,
    
    riesgos_a_evitar: generarRiesgos(perfil, respuestas.C),
    
    que_no_hacer: generarProhibiciones(perfil),
    
    proximo_paso: generarPaso(perfil)
  };
}
```

## Output Final Completo

```json
{
  "tipo_formulario": "vivienda_propia",
  "version": "1.0",
  "fecha": "2026-01-06",
  
  "perfil_fiduciario": {
    "tipo": "vivienda_propia",
    "composicion_hogar": {...},
    "puntos_criticos": {...},
    "historial_busqueda": {...},
    "situacion_financiera": {...},
    "estado_emocional": "cansado",
    "riesgo_principal": "cerrar_por_cansancio",
    "tolerancia_error": "baja",
    "horizonte": "largo",
    "presion_externa": "bastante"
  },
  
  "guia_fiduciaria": {
    "lectura_momento": "Búsqueda de 8 meses con señales de fatiga...",
    "objetivo_dominante": "Hogar familiar estable para 10+ años",
    "innegociables": ["silencio", "pet_friendly"],
    "prioridades": ["cercania_colegio", "seguridad", "2_dorms"],
    "trade_offs_aceptados": ["menos_metros", "edificio_antiguo"],
    "riesgos_a_evitar": ["ahogo_financiero", "cierre_por_cansancio"],
    "que_no_hacer": ["No decidir esta semana", "No ver más de 3"],
    "proximo_paso": "Pausa 48h, luego máximo 3 opciones"
  },
  
  "alertas": [
    {"tipo": "fatiga", "severidad": "alta"},
    {"tipo": "desalineacion_pareja", "severidad": "media"}
  ],
  
  "mbf_ready": {
    "filtros_duros": {
      "precio_max_usd": 172500,
      "zonas": ["Equipetrol", "Urbari"],
      "amenities_requeridos": ["pet_friendly"],
      "nivel_ruido": "bajo"
    },
    "filtros_blandos": {...},
    "modo": "exploracion",
    "cantidad_max": 3
  }
}
```

---

# ALERTAS ESPECÍFICAS VIVIENDA

| Alerta | Trigger | Severidad | Acción |
|--------|---------|-----------|--------|
| Fatiga | >6 meses + >15 vistas + cansado | Alta | Limitar a 3, sugerir pausa |
| Ahogo | Cuota > 150% actual + reserva baja | Crítica | Warning explícito |
| Pareja | Decide juntos + no alineados | Media | Recomendar alinear primero |
| Presión | Mucha presión + fecha límite | Alta | Validar si fecha es real |
| Familia crece | Espera hijos + dorms justos | Media | Considerar en prioridades |
| Mascota grande | Perro grande + edificio chico | Baja | Verificar reglamento |

---

# CONEXIÓN CON PASO 8

Este formulario genera un `mbf_ready` que alimenta directamente el Paso 8:

```
FORMULARIO VIVIENDA
       │
       ▼
┌─────────────────────────────┐
│  perfil_fiduciario          │
│  guia_fiduciaria            │
│  mbf_ready                  │──────▶  PASO 8 (MBF)
│  alertas                    │
└─────────────────────────────┘
```

Los filtros se mapean así:

| Formulario | MBF |
|------------|-----|
| innegociables | filtros_duros.amenities_requeridos |
| presupuesto_real | filtros_duros.precio_max_usd |
| zonas_interes | filtros_duros.zonas |
| zonas_rechazadas | filtros_duros.zonas_excluidas |
| deseables | filtros_blandos.amenities_preferidos |
| estado_emocional | modo_busqueda + cantidad_max |

---

*Documento canónico v1.0 — 6 Enero 2026*
*Perfil: VIVIENDA PROPIA*
