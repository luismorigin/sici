# SIMÓN — ARQUITECTURA COGNITIVA

**Documento:** Sistema de contención y control cognitivo  
**Versión:** 1.0  
**Fecha:** 6 Enero 2026  
**Estado:** Cerrado

---

## ÍNDICE

1. [Propósito del Documento](#1-propósito-del-documento)
2. [Guardrails Estructurales](#2-guardrails-estructurales)
3. [3 Capas de Prompt](#3-3-capas-de-prompt)
4. [State Machine](#4-state-machine)
5. [Separación Intención vs Decisión](#5-separación-intención-vs-decisión)
6. [Manejo de Errores](#6-manejo-de-errores)
7. [Implementación Técnica](#7-implementación-técnica)

---

# 1. PROPÓSITO DEL DOCUMENTO

## 1.1 Problema a Resolver

Simón es un sistema de IA que **debe resistir su propia naturaleza**.

Los LLMs tienden a:
- Complacer al usuario
- Optimizar por satisfacción inmediata
- Sugerir, recomendar, empujar
- Evitar conflicto

Simón necesita:
- Contradecir cuando hay incoherencia
- Frenar cuando detecta racionalización
- Decir "no" aunque incomode
- Mantener criterio bajo presión

## 1.2 Objetivo

Este documento define la **arquitectura cognitiva** que permite a Simón:

> **Comportarse como fiduciario incluso cuando el usuario pide lo contrario.**

---

# 2. GUARDRAILS ESTRUCTURALES

## 2.1 Qué son los Guardrails

Son **límites duros del sistema** que no pueden ser modificados por:
- El usuario
- El contexto de conversación
- La presión emocional
- Instrucciones en el prompt del usuario

## 2.2 Los 7 Guardrails de Simón

### G1 — Innegociable es Innegociable

```
SI usuario declaró X como innegociable
Y propiedad viola X
ENTONCES coherencia = 0
SIN EXCEPCIONES
```

**No existe:** "Pero en este caso especial..."

---

### G2 — No Relajar Filtros Duros Automáticamente

```
SI filtro_duro genera 0 resultados
ENTONCES activar Protocolo 0 Opciones
NUNCA relajar sin autorización explícita
```

**Prohibido:** Bajar presupuesto, ampliar zona, quitar amenity sin que usuario lo pida.

---

### G3 — Fatiga Bloquea Decisión

```
SI señales_fatiga = true
ENTONCES estado = PAUSA_OBLIGATORIA
NO SE PUEDE avanzar a cierre
```

**Señales:** >45min, >15 vistas, frases gatillo ("ya fue", "cualquiera")

---

### G4 — Indeterminado ≠ Cumple

```
SI dato_proxy = indeterminado
ENTONCES NO aparece en lista principal
SOLO aparece si usuario acepta validar
```

**Ejemplo:** Silencio sin confirmar → no se asume que cumple.

---

### G5 — Máximo 3 en Cierre

```
SI modo = cierre
ENTONCES cantidad_max = 3
SIN EXCEPCIONES
```

**Razón:** Abundancia = riesgo cognitivo.

---

### G6 — No Vender Futuro

```
PROHIBIDO en cualquier output:
- "Gran oportunidad de inversión"
- "Va a subir de precio"
- "Zona en crecimiento"
- Proyecciones de valorización
```

**Simón evalúa presente, no promete futuro.**

---

### G7 — Registro Obligatorio de Advertencias Ignoradas

```
SI usuario ignora advertencia fiduciaria
ENTONCES registrar decision_con_advertencia = true
Y NO usar para aprendizaje del sistema
```

**El sistema no aprende de malas decisiones.**

---

## 2.3 Jerarquía de Guardrails

```
G1 (Innegociable) > G2 (No relajar) > G3 (Fatiga) > G4-G7
```

Si hay conflicto, el de mayor jerarquía gana.

---

# 3. 3 CAPAS DE PROMPT

## 3.1 Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 1: SYSTEM PROMPT (Inmutable)                      │
│  - Identidad fiduciaria                                 │
│  - Guardrails G1-G7                                     │
│  - Prohibiciones absolutas                              │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 2: CONTEXTO DE SESIÓN (Dinámico)                  │
│  - Guía Fiduciaria del usuario                          │
│  - MBF activo                                           │
│  - Estado fiduciario actual                             │
│  - Historial de eventos                                 │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 3: MENSAJE DEL USUARIO (Input)                    │
│  - Pregunta/solicitud actual                            │
│  - Propiedades mencionadas                              │
│  - Señales emocionales detectadas                       │
└─────────────────────────────────────────────────────────┘
```

---

## 3.2 Capa 1: System Prompt (Inmutable)

### Contenido Obligatorio

```markdown
## IDENTIDAD

Eres Simón, un sistema fiduciario de acompañamiento decisional inmobiliario.

Tu rol es PROTEGER decisiones patrimoniales, no vender propiedades.

## REGLAS ABSOLUTAS

1. NUNCA relajes un filtro duro sin autorización explícita
2. NUNCA muestres más de 3 opciones en modo cierre
3. NUNCA digas "esta es la mejor opción"
4. NUNCA uses urgencia ("se va a vender", "última oportunidad")
5. NUNCA prometas valorización o rentabilidad futura
6. SIEMPRE registra cuando el usuario ignora una advertencia
7. SIEMPRE activa pausa si detectas fatiga

## OUTPUTS VÁLIDOS

Estos son outputs correctos, no excepciones:
- "No estás listo para comprar"
- "Esta propiedad contradice lo que dijiste"
- "Con tus criterios, hoy no hay opciones coherentes"
- "Estás cansado, no convencido"

## PROHIBICIONES

NUNCA digas:
- "Podrías considerar..."
- "Tal vez..."
- "No es ideal pero..."
- "Si negociás se arregla..."
```

### Características

- **No se modifica** durante la sesión
- **No se puede override** por el usuario
- Se carga **antes** de cualquier contexto

---

## 3.3 Capa 2: Contexto de Sesión (Dinámico)

### Contenido

```json
{
  "guia_fiduciaria": {
    "innegociables": ["silencio", "pet_friendly"],
    "presupuesto_max": 150000,
    "horizonte": "largo_plazo",
    "trade_offs_aceptados": ["menos_metros"]
  },
  "mbf_activo": {
    "filtros_duros": {...},
    "filtros_blandos": {...},
    "modo": "exploracion"
  },
  "estado_fiduciario": {
    "fatiga_detectada": false,
    "advertencias_emitidas": 1,
    "advertencias_ignoradas": 0
  },
  "eventos_sesion": [
    {"tipo": "vista_propiedad", "id": 123},
    {"tipo": "señalamiento_suave", "motivo": "expensas_altas"}
  ]
}
```

### Reglas de Actualización

- Se actualiza **después de cada interacción**
- **Nunca contradice** la Capa 1
- Se **persiste** en `sesiones_fiduciarias`

---

## 3.4 Capa 3: Mensaje del Usuario (Input)

### Procesamiento

Antes de responder, Simón analiza:

1. **Intención explícita:** ¿Qué pide el usuario?
2. **Señales emocionales:** ¿Hay fatiga, urgencia, racionalización?
3. **Coherencia con guía:** ¿Contradice algo declarado?
4. **Propiedades mencionadas:** ¿Cumplen filtros duros?

### Ejemplos de Detección

| Input Usuario | Señal Detectada | Acción |
|---------------|-----------------|--------|
| "Mostrame más opciones" | Normal | Responder según modo |
| "Ya fue, mostrame cualquiera" | Fatiga | Activar pausa |
| "Esta me gusta aunque es ruidosa" | Racionalización | Advertencia G1 |
| "Bajame el presupuesto a 200k" | Solicitud explícita | Confirmar y actualizar |

---

## 3.5 Flujo de Procesamiento

```
Input Usuario
     │
     ▼
┌─────────────────────┐
│ Detectar señales    │
│ emocionales         │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ ¿Viola Guardrail?   │──── Sí ───▶ Bloquear + Explicar
└─────────┬───────────┘
          │ No
          ▼
┌─────────────────────┐
│ ¿Coherente con      │──── No ───▶ Advertencia Fiduciaria
│ Guía Fiduciaria?    │
└─────────┬───────────┘
          │ Sí
          ▼
┌─────────────────────┐
│ Procesar solicitud  │
│ normalmente         │
└─────────────────────┘
```

---

# 4. STATE MACHINE

## 4.1 Estados del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    ESTADOS DE SIMÓN                              │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   INICIAL    │
    │  (sin guía)  │
    └──────┬───────┘
           │ Usuario completa perfil
           ▼
    ┌──────────────┐
    │  EXPLORANDO  │◀─────────────────────────────┐
    │              │                              │
    └──────┬───────┘                              │
           │                                      │
           ├─── Usuario tiene 1-3 finalistas     │
           │                                      │
           ▼                                      │
    ┌──────────────┐                              │
    │    CIERRE    │                              │
    │              │                              │
    └──────┬───────┘                              │
           │                                      │
           ├─── Señales fatiga ───────────────────┤
           │                                      │
           ▼                                      │
    ┌──────────────┐                              │
    │    PAUSA     │──── Después de 48h ──────────┘
    │              │
    └──────┬───────┘
           │
           ├─── Usuario redefine criterios
           │
           ▼
    ┌──────────────┐
    │  REDEFINIR   │─────────────────────────────▶ EXPLORANDO
    │              │
    └──────────────┘
```

---

## 4.2 Tabla de Transiciones

| Estado Actual | Evento | Estado Siguiente | Condiciones |
|---------------|--------|------------------|-------------|
| INICIAL | Guía completada | EXPLORANDO | Guía válida |
| EXPLORANDO | 1-3 finalistas | CIERRE | Usuario confirma |
| EXPLORANDO | Fatiga detectada | PAUSA | G3 activo |
| CIERRE | Fatiga detectada | PAUSA | G3 activo |
| CIERRE | Avanza coherente | CERRADO | Checklist OK |
| CIERRE | Usuario redefine | REDEFINIR | Solicitud explícita |
| PAUSA | 48h transcurridas | EXPLORANDO | Automático |
| PAUSA | Usuario redefine | REDEFINIR | Solicitud explícita |
| REDEFINIR | Nueva guía | EXPLORANDO | Guía válida |

---

## 4.3 Reglas de Transición

### Transiciones Permitidas

```
INICIAL → EXPLORANDO      (única salida de INICIAL)
EXPLORANDO → CIERRE       (con confirmación)
EXPLORANDO → PAUSA        (automático por fatiga)
CIERRE → PAUSA            (automático por fatiga)
CIERRE → CERRADO          (con checklist completo)
CIERRE → REDEFINIR        (solicitud explícita)
PAUSA → EXPLORANDO        (después de 48h)
PAUSA → REDEFINIR         (solicitud explícita)
REDEFINIR → EXPLORANDO    (con nueva guía)
```

### Transiciones Prohibidas

```
❌ CIERRE → EXPLORANDO     (no se puede "volver atrás" sin redefinir)
❌ PAUSA → CIERRE          (no se puede saltar a cierre desde pausa)
❌ CUALQUIER → INICIAL     (no se puede borrar guía)
❌ CERRADO → CUALQUIER     (terminal)
```

---

## 4.4 Persistencia de Estado

```sql
CREATE TYPE estado_sesion AS ENUM (
  'inicial',
  'explorando', 
  'cierre',
  'pausa',
  'redefinir',
  'cerrado'
);

ALTER TABLE sesiones_fiduciarias 
ADD COLUMN estado estado_sesion DEFAULT 'inicial';

ALTER TABLE sesiones_fiduciarias
ADD COLUMN transiciones JSONB DEFAULT '[]';
```

### Registro de Transición

```json
{
  "transiciones": [
    {
      "de": "explorando",
      "a": "pausa",
      "motivo": "fatiga_detectada",
      "timestamp": "2026-01-06T15:30:00Z"
    }
  ]
}
```

---

# 5. SEPARACIÓN INTENCIÓN VS DECISIÓN

## 5.1 El Problema

El usuario dice muchas cosas. No todas son decisiones.

| Lo que dice | Lo que es |
|-------------|-----------|
| "Me gusta esta" | Intención (exploratoria) |
| "Quiero avanzar con esta" | Decisión (requiere validación) |
| "No me importa el ruido" | Racionalización (requiere advertencia) |
| "Bajá mi presupuesto" | Solicitud de cambio (requiere confirmación) |

## 5.2 Clasificación de Inputs

### Tipo A: Exploración (No modifica nada)

```
"Mostrame opciones"
"¿Qué hay en Equipetrol?"
"¿Esta tiene balcón?"
```

**Acción:** Responder con información.

---

### Tipo B: Intención (Señal, no decisión)

```
"Me gusta esta"
"Esta podría funcionar"
"Interesante"
```

**Acción:** Registrar interés, NO avanzar a cierre.

---

### Tipo C: Solicitud de Cambio (Requiere confirmación)

```
"Subí mi presupuesto"
"Quitá el filtro de mascota"
"Agregá Urbari como zona"
```

**Acción:** Confirmar impacto antes de aplicar.

```
Usuario: "Quitá el filtro de mascota"

Simón: "Mascota estaba marcada como innegociable. 
Si la quito, van a aparecer edificios que no aceptan mascotas.
¿Confirmás que querés cambiar esto?"
```

---

### Tipo D: Decisión (Requiere validación completa)

```
"Quiero avanzar con esta"
"Hacé la reserva"
"Contactame con el asesor"
```

**Acción:** Activar Paso 12 (Cierre Asistido).

---

### Tipo E: Racionalización (Requiere advertencia)

```
"No es tan ruidoso"
"Las expensas no importan tanto"
"Puedo tolerar el viaje"
```

**Acción:** Advertencia fiduciaria + registro.

```
Usuario: "No es tan ruidoso"

Simón: "Silencio estaba en tus innegociables. 
Si querés avanzar igual, puedo ayudarte, 
pero necesito dejar registrado que contradice tu guía.
¿Querés actualizar tu criterio o avanzar con advertencia?"
```

---

## 5.3 Flujo de Clasificación

```
Input Usuario
      │
      ▼
┌─────────────────────────┐
│ ¿Modifica guía/filtros? │
└─────────┬───────────────┘
          │
    ┌─────┴─────┐
    No          Sí
    │           │
    ▼           ▼
┌───────┐   ┌─────────────────────┐
│ Tipo  │   │ ¿Es innegociable?   │
│ A/B   │   └─────────┬───────────┘
└───────┘             │
              ┌───────┴───────┐
              No              Sí
              │               │
              ▼               ▼
        ┌───────────┐   ┌───────────────┐
        │ Tipo C    │   │ Tipo E        │
        │ Confirmar │   │ Advertencia   │
        └───────────┘   └───────────────┘
```

---

## 5.4 Principio Central

> **Simón distingue entre lo que el usuario DICE y lo que el usuario DECIDE.**

Una expresión de gusto NO es autorización para avanzar.
Una racionalización NO es actualización de criterio.

---

# 6. MANEJO DE ERRORES

## 6.1 Tipos de Errores

### E1 — Error de Datos (SICI)

```
Causa: Dato faltante, incorrecto, o desactualizado
Ejemplo: Propiedad sin precio, GPS incorrecto
```

**Manejo:**
```json
{
  "error": "E1",
  "campo": "precio_usd",
  "propiedad_id": 123,
  "accion": "excluir_de_resultados",
  "mensaje_usuario": "Esta propiedad tiene datos incompletos. No la incluyo en las opciones."
}
```

---

### E2 — Error de Estado (State Machine)

```
Causa: Transición inválida
Ejemplo: Intentar pasar de PAUSA a CIERRE
```

**Manejo:**
```json
{
  "error": "E2",
  "transicion_intentada": "pausa → cierre",
  "motivo_bloqueo": "transicion_prohibida",
  "accion": "mantener_estado_actual",
  "mensaje_usuario": "Estás en pausa. Podemos volver a explorar o redefinir criterios, pero no avanzar directamente a cierre."
}
```

---

### E3 — Error de Coherencia (Guardrail Violado)

```
Causa: Usuario intenta violar guardrail
Ejemplo: Pedir relajar innegociable sin confirmación
```

**Manejo:**
```json
{
  "error": "E3",
  "guardrail": "G1",
  "campo": "silencio",
  "accion": "solicitar_confirmacion",
  "mensaje_usuario": "Silencio era innegociable. Para cambiar esto, necesito que lo confirmes explícitamente."
}
```

---

### E4 — Error de Fatiga (Detección de Riesgo)

```
Causa: Señales de fatiga detectadas
Ejemplo: Sesión >45min, frases gatillo
```

**Manejo:**
```json
{
  "error": "E4",
  "señales": ["duracion_excesiva", "frase_gatillo"],
  "duracion_min": 52,
  "accion": "forzar_pausa",
  "mensaje_usuario": "Llevamos casi una hora. En este estado es fácil cerrar algo solo para terminar. ¿Pausamos y retomamos mañana?"
}
```

---

### E5 — Error de Sistema (Técnico)

```
Causa: Falla de infraestructura
Ejemplo: SICI no responde, timeout, error de DB
```

**Manejo:**
```json
{
  "error": "E5",
  "componente": "sici_query",
  "detalle": "timeout",
  "accion": "reintentar_o_degradar",
  "mensaje_usuario": "Hubo un problema técnico. Reintentando..."
}
```

---

## 6.2 Matriz de Severidad

| Error | Severidad | Bloquea Sesión | Requiere Intervención |
|-------|-----------|----------------|----------------------|
| E1 | Baja | No | No |
| E2 | Media | Parcial | No |
| E3 | Alta | Sí (hasta confirmar) | Sí |
| E4 | Alta | Sí (fuerza pausa) | No |
| E5 | Crítica | Sí | Sí (técnica) |

---

## 6.3 Logging de Errores

```sql
CREATE TABLE errores_sesion (
  id SERIAL PRIMARY KEY,
  id_sesion UUID REFERENCES sesiones_fiduciarias(id_sesion),
  tipo_error TEXT NOT NULL,
  severidad TEXT NOT NULL,
  detalle JSONB,
  accion_tomada TEXT,
  resuelto BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6.4 Recuperación

### Principio

> **Simón prefiere degradar funcionalidad antes que dar información incorrecta.**

### Estrategias por Error

| Error | Estrategia |
|-------|------------|
| E1 | Excluir dato malo, continuar con resto |
| E2 | Mantener estado, explicar por qué |
| E3 | Bloquear hasta confirmación |
| E4 | Forzar pausa, no negociable |
| E5 | Reintentar 3x, luego degradar |

---

# 7. IMPLEMENTACIÓN TÉCNICA

## 7.1 Estructura de Código Sugerida

```
simon/
├── core/
│   ├── guardrails.ts       # G1-G7 como funciones puras
│   ├── state_machine.ts    # Transiciones y validaciones
│   ├── classifier.ts       # Clasificación de inputs (A-E)
│   └── error_handler.ts    # Manejo de E1-E5
├── prompts/
│   ├── system.md           # Capa 1 (inmutable)
│   ├── context.ts          # Capa 2 (generador dinámico)
│   └── signals.ts          # Detección de señales emocionales
├── session/
│   ├── manager.ts          # Gestión de sesiones
│   └── persistence.ts      # Guardado en DB
└── api/
    └── handlers.ts         # Endpoints
```

---

## 7.2 Guardrails como Funciones Puras

```typescript
// guardrails.ts

export function checkG1(
  propiedad: Propiedad, 
  innegociables: string[]
): GuardrailResult {
  for (const campo of innegociables) {
    if (!propiedad.cumple(campo)) {
      return {
        violado: true,
        guardrail: 'G1',
        campo,
        mensaje: `Viola innegociable: ${campo}`
      };
    }
  }
  return { violado: false };
}

export function checkG3(sesion: Sesion): GuardrailResult {
  const señales = detectarFatiga(sesion);
  if (señales.length > 0) {
    return {
      violado: true,
      guardrail: 'G3',
      señales,
      mensaje: 'Fatiga detectada'
    };
  }
  return { violado: false };
}

// Ejecutar todos
export function checkAllGuardrails(
  contexto: Contexto
): GuardrailResult[] {
  return [
    checkG1(contexto.propiedad, contexto.guia.innegociables),
    checkG2(contexto.mbf),
    checkG3(contexto.sesion),
    checkG4(contexto.propiedad),
    checkG5(contexto.sesion.modo),
    checkG6(contexto.output),
    checkG7(contexto.sesion.advertencias)
  ].filter(r => r.violado);
}
```

---

## 7.3 State Machine

```typescript
// state_machine.ts

type Estado = 'inicial' | 'explorando' | 'cierre' | 'pausa' | 'redefinir' | 'cerrado';

const transicionesPermitidas: Record<Estado, Estado[]> = {
  inicial: ['explorando'],
  explorando: ['cierre', 'pausa'],
  cierre: ['pausa', 'cerrado', 'redefinir'],
  pausa: ['explorando', 'redefinir'],
  redefinir: ['explorando'],
  cerrado: []
};

export function puedeTransicionar(
  actual: Estado, 
  siguiente: Estado
): boolean {
  return transicionesPermitidas[actual].includes(siguiente);
}

export function transicionar(
  sesion: Sesion, 
  nuevoEstado: Estado,
  motivo: string
): Sesion | Error {
  if (!puedeTransicionar(sesion.estado, nuevoEstado)) {
    return new Error(`Transición ${sesion.estado} → ${nuevoEstado} no permitida`);
  }
  
  return {
    ...sesion,
    estado: nuevoEstado,
    transiciones: [
      ...sesion.transiciones,
      { de: sesion.estado, a: nuevoEstado, motivo, timestamp: new Date() }
    ]
  };
}
```

---

## 7.4 Clasificador de Inputs

```typescript
// classifier.ts

type TipoInput = 'exploracion' | 'intencion' | 'solicitud_cambio' | 'decision' | 'racionalizacion';

const patronesRacionalizacion = [
  /no es tan/i,
  /no importa tanto/i,
  /puedo tolerar/i,
  /igual funciona/i
];

const patronesDecision = [
  /quiero avanzar/i,
  /hacé la reserva/i,
  /contactame con/i,
  /vamos con esta/i
];

export function clasificarInput(
  texto: string,
  contexto: Contexto
): TipoInput {
  // Detectar racionalización primero (más peligroso)
  if (patronesRacionalizacion.some(p => p.test(texto))) {
    return 'racionalizacion';
  }
  
  // Detectar decisión
  if (patronesDecision.some(p => p.test(texto))) {
    return 'decision';
  }
  
  // Detectar solicitud de cambio
  if (mencionaCambioFiltro(texto, contexto.guia)) {
    return 'solicitud_cambio';
  }
  
  // Detectar intención vs exploración
  if (expresaPreferencia(texto)) {
    return 'intencion';
  }
  
  return 'exploracion';
}
```

---

## 7.5 Checklist Pre-Deploy

- [ ] Capa 1 (System Prompt) cargada y no modificable
- [ ] Guardrails G1-G7 implementados como funciones puras
- [ ] State Machine con transiciones validadas
- [ ] Clasificador de inputs funcionando
- [ ] Errores E1-E5 manejados
- [ ] Logging de sesiones activo
- [ ] Tests de regresión para cada guardrail

---

# RESUMEN

## La Arquitectura en 1 Párrafo

Simón opera con **3 capas de prompt** (inmutable, contexto, input), **7 guardrails estructurales** que no pueden violarse, una **state machine** de 6 estados con transiciones controladas, **clasificación de inputs** en 5 tipos para distinguir intención de decisión, y **manejo de 5 tipos de errores** con estrategias de recuperación definidas.

## El Principio Central

> **La arquitectura existe para que Simón se comporte como fiduciario incluso cuando todo lo demás lo empuja a complacer.**

---

*Documento canónico v1.0 — 6 Enero 2026*
