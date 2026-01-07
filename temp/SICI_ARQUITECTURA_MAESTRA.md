# SICI / Simón - Arquitectura Maestra

**Documento:** Arquitectura completa del sistema  
**Versión:** 2.2  
**Fecha:** 6 Enero 2026  
**Estado:** Aprobado - Conectado con Knowledge Graph  
**Audiencias:** Fundador · Inversores · Equipo Técnico · Claude Code

---

## A. VISIÓN Y PROPÓSITO

### A.1 Qué es SICI/Simón

**SICI** (Sistema Inteligente de Clasificación Inmobiliaria) es la infraestructura de datos.  
**Simón** es el agente fiduciario que interactúa con usuarios.

> "Simón no vende casas. Simón protege decisiones patrimoniales."

### A.2 Qué NO es

- ❌ Un portal inmobiliario (InfoCasas, Zillow)
- ❌ Un buscador de propiedades
- ❌ Un CRM para brokers
- ❌ Un marketplace de comisionistas
- ❌ Un recomendador de "oportunidades"
- ❌ Un sistema de persuasión

### A.3 Qué SÍ es

- ✅ Una **consultora de compra con IA fiduciaria**
- ✅ Un **filtro de coherencia** entre persona y propiedad
- ✅ Un **sistema de pensamiento guiado**
- ✅ Un **amortiguador emocional** frente a decisiones grandes
- ✅ Una red de **Real Estate Strategists** (no corredores)

### A.4 Hipótesis Fundacional

> *Si ayudamos a una persona a pensar mejor antes de decidir, va a tomar una mejor decisión aunque compre menos propiedades, más despacio, o incluso no compre.*

### A.5 Principio Central

> "El sistema NO busca vender propiedades. Busca proteger decisiones patrimoniales. La IA actúa como filtro fiduciario, no como recomendador emocional. El eje no es la propiedad, es la coherencia entre persona, objetivo y activo."

---

## A-BIS. ACTORES DEL SISTEMA

### A-BIS.1 Mapa de Actores

```
┌─────────────────────────────────────────────────────────────────┐
│                        ECOSISTEMA SICI                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   USUARIO ←──────→ SIMÓN ←──────→ SICI (Data)                  │
│      │               │               │                          │
│      │               │               ├── proyectos_master       │
│      │               │               ├── propiedades_v2         │
│      │               │               └── Knowledge Graph        │
│      │               │                                          │
│      └───────────────┼──────────────→ RES                      │
│                      │                 │                        │
│                      │                 ↓                        │
│                      │            AGENTE/BROKER                 │
│                      │            (externo al sistema)          │
│                      │                                          │
└─────────────────────────────────────────────────────────────────┘
```

### A-BIS.2 RES (Real Estate Strategist)

**Definición:** El RES es un **verificador fiduciario**, NO un vendedor. Actúa como representante del usuario con la metodología Simón/SICI.

#### Qué ES un RES

| Función | Descripción |
|---------|-------------|
| **Verificador físico** | Visita el edificio, confirma que es lo que dice |
| **Negociador fiduciario** | Negocia con el broker como si fuera el cliente |
| **Certificador** | Valida que lo legal está mínimamente bien |
| **Extensión de Simón** | Lleva la capa fiduciaria al mundo físico |

#### Qué NO ES un RES

| NO es | Por qué |
|-------|---------|
| Vendedor | No cobra comisión por cerrar |
| Corredor tradicional | No tiene inventario propio |
| Asesor legal | No reemplaza abogado |
| Tasador | No hace avalúos formales |

#### Cuándo interviene el RES

```
Usuario completa flujo Simón
         ↓
Elige propiedad(es) para avanzar
         ↓
CTA: "Verificar con RES"
         ↓
RES recibe:
├── Guía Fiduciaria del usuario
├── Ficha de Coherencia de la propiedad
├── Datos del agente/broker (de SICI)
└── Alertas activas
         ↓
RES hace:
├── Contacta al agente/broker
├── Coordina visita física
├── Verifica condiciones reales
├── Reporta diferencias vs lo publicado
└── Negocia si el usuario lo autoriza
         ↓
Output: Certificación RES
├── ✅ Verificado - coincide
├── ⚠️ Diferencias detectadas (lista)
└── ❌ No recomendado (razón)
```

#### Modelo de Compensación RES

| Concepto | Valor | Pagado por |
|----------|-------|------------|
| Fee por verificación | Fijo (por definir) | Usuario |
| Fee por cierre exitoso | 0.75% del precio | Desarrollador |
| Comisión tradicional | ❌ NO | - |

**Principio:** El RES gana igual si el usuario compra o no compra. Su incentivo es la **calidad de la verificación**, no el cierre.

### A-BIS.3 Agente/Broker (Externo)

El **agente** es la persona que publica la propiedad. SICI extrae sus datos:

```json
// datos_json->'agente' en propiedades_v2
{
  "nombre": "Fernando Lamas",
  "telefono": "+59178000988",
  "oficina_nombre": "Century21"
}
```

| Actor | Relación con SICI |
|-------|-------------------|
| **Agente** | Fuente de data (scraping) |
| **Broker/Inmobiliaria** | oficina_nombre en datos |
| **Desarrollador** | Paga fee 0.75% si cierra |

**El usuario NUNCA contacta al agente directamente.** Siempre pasa por RES.

### A-BIS.4 Simón vs SICI

| Simón | SICI |
|-------|------|
| Agente IA fiduciario | Infraestructura de datos |
| Interactúa con usuario | No interactúa directamente |
| Conoce la Guía Fiduciaria | Conoce TODO el mercado |
| Filtra por coherencia | Provee data completa |
| "Miope" (solo ve lo relevante) | "Omnisciente" (ve todo) |

**Regla crítica:** Simón NO sabe todo lo que SICI sabe. SICI le pasa solo lo que es coherente con la Guía del usuario.

---

## B. DEFINICIÓN OPERATIVA: "FIDUCIARIO"

### B.1 Qué significa "fiduciario" en Simón

| Principio | Operativamente significa |
|-----------|-------------------------|
| **Interés del cliente primero** | Nunca mostrar propiedades que no encajan solo porque pagan más comisión |
| **Transparencia** | Decir los riesgos y trade-offs aunque el cliente no pregunte |
| **No vender, asesorar** | El objetivo es que el cliente tome buena decisión, no que compre rápido |
| **Filtrar, no listar** | Menos opciones pero relevantes, no más opciones para parecer útil |
| **Decir "no" cuando corresponde** | "Esta propiedad no te conviene porque X" aunque el cliente la quiera |

### B.2 La Prueba Fiduciaria

> Si Simón recomienda algo, ¿lo recomendaría igual si no cobrara nada?

### B.3 Qué protege Simón (en orden)

1. **Coherencia interna del usuario**
2. **Tiempo de vida** (logística, trayectos, desgaste)
3. **Salud financiera real** (no optimista)
4. **Capacidad de salida futura**

El precio y los amenities **no son prioridad**, son variables secundarias.

### B.4 Outputs válidos de Simón

Estos outputs son **core del producto**, no excepciones:

- "No estás listo para comprar"
- "Esta propiedad contradice lo que dijiste que querías"
- "Estás cansado, no convencido"
- "Alquilar ahora es mejor decisión"
- "Con tus criterios, hoy no hay propiedades coherentes"

### B.5 Regla de Oro

> **Si una respuesta ayuda a cerrar pero daña la coherencia, está prohibida.**

---

## B-BIS. MÉTRICA NORTH STAR

### La única métrica que importa

**Tasa de Arrepentimiento a 12 meses: < 5%**

| Definición | % de usuarios que a los 12 meses de comprar dicen "no debería haber comprado esto" |
|------------|-----------------------------------------------------------------------------------|
| **Meta** | < 5% |
| **Industria estimada** | 15-25% |

### Métricas proxy (medibles ahora)

| Métrica | Meta | Medición |
|---------|------|----------|
| Coherencia promedio de cierres | > 0.85 | Automática |
| % usuarios que completan Guía Fiduciaria | > 70% | Funnel |
| % "PAUSA" respetadas (no compran en 48h) | > 80% | Seguimiento |
| NPS post-cierre (30 días) | > 50 | Encuesta |

### Regla de decisión

> **Cualquier feature que mejore conversión pero empeore estas métricas está prohibido.**

---

## C. METODOLOGÍA: 7 PASOS VISIBLES

### C.1 Principio de Diseño

```
┌──────────────────────────────────────────────────────────┐
│  Usuario ve: 7 pasos simples                             │
│  Sistema ejecuta: 12 procesos internos                   │
│                                                          │
│  "El usuario ve simplicidad. El sistema ejecuta rigor." │
└──────────────────────────────────────────────────────────┘
```

### C.2 Los 7 Pasos (vista usuario)

| Paso | Nombre | Lo que ve el usuario | Tiempo |
|------|--------|---------------------|--------|
| 1 | **Detección** | "¿Qué te trae hoy?" | 30s |
| 2 | **Captura** | Formulario guiado | 8-12 min |
| 3 | **Validación** | "Confirmemos tus prioridades" | 2 min |
| 4 | **Búsqueda** | "Buscando opciones coherentes..." | 10s |
| 5 | **Presentación** | Resultados con razón fiduciaria | - |
| 6 | **Acompañamiento** | Verificación RES | Variable |
| 7 | **Cierre** | Decisión asistida | Variable |

### C.3 Mapeo Pasos ↔ Procesos Internos

| Paso visible | Procesos internos | Detalle técnico |
|--------------|-------------------|-----------------|
| 1. Detección | P1: Activación | Pregunta de apertura, detección perfil |
| 2. Captura | P2-P4: Bloque Formulario | 9 secciones, ~33 campos |
| 3. Validación | P5: Confirmación top 3 | Innegociables explícitos |
| 4. Búsqueda | P6-P7: Traducción + Query | MBF → SQL → Knowledge Graph |
| 5. Presentación | P8: Resultados | Cards con coherencia + razón |
| 6. Acompañamiento | P9-P10: RES | Verificación física |
| 7. Cierre | P11-P12: Decisión | Feedback + aprendizaje |

---

## C.4 PASO 5: PRESENTACIÓN FIDUCIARIA (Conexión con Knowledge Graph)

### Fuente de Datos

```sql
-- Query Layer principal
buscar_unidades_reales('{
  "dormitorios": 2,
  "precio_max": 150000,
  "amenities": ["piscina", "pet_friendly"]
}'::jsonb)
```

### Datos que retorna

| Campo | Fuente | Visible a usuario |
|-------|--------|-------------------|
| `nombre_proyecto` | proyectos_master.nombre_oficial | ✅ Sí |
| `dormitorios` | propiedades_v2.dormitorios | ✅ Sí |
| `precio_usd` | propiedades_v2.precio_usd | ✅ Sí |
| `area_m2` | propiedades_v2.area_total_m2 | ✅ Sí |
| `amenities_lista` | datos_json->'amenities'->'lista' | ✅ Sí |
| `fotos_urls` | datos_json->'contenido'->'fotos_urls' | ✅ Sí |
| `agente_nombre` | datos_json->'agente'->'nombre' | ❌ Solo RES |
| `agente_tel` | datos_json->'agente'->'telefono' | ❌ Solo RES |
| `url` | propiedades_v2.url | ❌ Solo RES |

### Tipos de Unidades

| Tipo | Definición | Cómo se muestra |
|------|------------|-----------------|
| **Unidad Real** | Propiedad específica con precio, área, URL | Card completa con CTA |
| **Unidad Virtual** | Tipología conocida sin listing activo | "El proyecto tiene 2D pero sin unidades disponibles" |
| **Multiproyecto** | Listing genérico de broker (68 en DB) | NO se muestra, solo extrae tipologías |

### Estructura Visual

```
┌─────────────────────────────────────────────────────────────┐
│  TUS OPCIONES COHERENTES (3)                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ 🏢 LAS DALIAS - Unidad 4B              Score: 0.92 │    │
│  │ 2 dorm · 85 m² · $142,000                          │    │
│  │                                                    │    │
│  │ ✅ Piscina · ✅ Pet Friendly · ✅ Seguridad 24h   │    │
│  │                                                    │    │
│  │ Por qué encaja:                                    │    │
│  │ "Cumple tus 3 innegociables. Está 5% bajo tu      │    │
│  │  tope de precio. Zona que indicaste."             │    │
│  │                                                    │    │
│  │ [Ver fotos]  [Ficha completa]  [VERIFICAR →]     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  [Más opciones...]                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### CTAs según Estado

| Estado usuario | CTA principal |
|----------------|---------------|
| Exploración | "Ver más opciones" |
| Interesado | "Verificar con RES" |
| Listo para decidir | "Agendar verificación RES" |
| Alerta activa | "Hablar con RES primero" |

### Datos NO visibles al usuario

| Campo | Razón |
|-------|-------|
| `agente_nombre` | Usuario no contacta directo |
| `agente_telefono` | Solo RES contacta |
| `oficina_nombre` | Solo RES necesita |
| `url_original` | Evitar bypass del sistema |

---

## D. PROTOCOLOS CRÍTICOS

### D.1 Protocolo de Coherencia

**Ninguna propiedad se muestra sin score de coherencia calculado.**

| Score | Clasificación | Acción |
|-------|---------------|--------|
| ≥ 0.85 | Alta coherencia | Mostrar con CTA prominente |
| 0.70-0.84 | Coherencia media | Mostrar con advertencias |
| 0.50-0.69 | Coherencia baja | Mostrar solo si usuario expande |
| < 0.50 | Incoherente | NO mostrar nunca |

### D.2 Protocolo de Innegociables

**Si una propiedad viola un innegociable, no se muestra.**

```
Usuario dice: "NECESITO 3 dormitorios mínimo"
         ↓
Sistema marca: dormitorios >= 3 como FILTRO DURO
         ↓
Propiedad con 2 dormitorios → EXCLUIDA
         ↓
NO importa si tiene piscina, precio bajo, o está en zona ideal
```

### D.3 Protocolo de Pausa

**Si se detecta señal de decisión apresurada:**

1. Simón dice: "Detecto urgencia. ¿Podemos hablar?"
2. Si usuario insiste: "Te sugiero 48h antes de avanzar"
3. Si sigue: Escalar a RES humano
4. Registrar en estado fiduciario

---

## E. SISTEMA DE ALERTAS

### E.1 Tipos de Alertas

| Tipo | Trigger | Severidad |
|------|---------|-----------|
| **Contradicción** | Usuario dice X pero elige Y | Media |
| **Presión temporal** | "Tengo que decidir ya" | Alta |
| **Presión externa** | "Mi suegra dice que..." | Media |
| **Fatiga de búsqueda** | >6 meses buscando | Alta |
| **Sobre-extensión** | Cuota >35% ingreso | Crítica |
| **Cambio abrupto** | Modifica innegociable sin razón | Alta |

### E.2 Acciones por Severidad

| Severidad | Acción Simón | Acción Sistema |
|-----------|--------------|----------------|
| **Media** | Mencionar, no bloquear | Log + flag |
| **Alta** | Sugerir pausa, ofrecer RES | Log + notificar RES |
| **Crítica** | Pausar flujo, escalar a humano | Bloquear avance 48h |

### E.3 Formato de Alerta

```json
{
  "tipo": "presion_temporal",
  "severidad": "alta",
  "trigger": "Usuario menciona 'último día de oferta'",
  "timestamp": "2026-01-06T15:30:00Z",
  "accion_tomada": "sugerencia_pausa",
  "respuesta_usuario": "pendiente"
}
```

### E.4 Guardrails (Inmutables)

| Guardrail | Comportamiento |
|-----------|----------------|
| **Nunca recomendar sobre-extensión** | Si cuota > 40% ingreso, NO mostrar propiedad |
| **Nunca minimizar alertas críticas** | Si hay alerta crítica, mencionarla siempre |
| **Nunca presionar cierre** | Prohibido usar urgencia como argumento |
| **Nunca ocultar trade-offs** | Si hay riesgo, decirlo aunque no pregunten |

### E.5 Protocolo de Escalamiento

| Severidad | Acción UI | Escalamiento |
|-----------|-----------|--------------|
| Media | Señalamiento visual | No escalar |
| Alta | Pausa sugerida + notificar RES | RES recibe alerta |
| Crítica | Bloqueo 48h + llamada RES | RES debe llamar en <24h |

---

## F. ARQUITECTURA COGNITIVA DE SIMÓN

### F.1 Capas del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     CAPA DE INTERFAZ                         │
│  (Lo que el usuario ve: chat, formularios, resultados)      │
├─────────────────────────────────────────────────────────────┤
│                     CAPA FIDUCIARIA                          │
│  (Lógica de coherencia, alertas, guardrails)                │
├─────────────────────────────────────────────────────────────┤
│                     CAPA DE DATOS                            │
│  (Knowledge Graph, Query Layer, propiedades_v2)             │
├─────────────────────────────────────────────────────────────┤
│                     CAPA DE ESTADO                           │
│  (Sesión, historial, estado fiduciario)                     │
└─────────────────────────────────────────────────────────────┘
```

### F.2 Estado Fiduciario

Simón mantiene un estado interno por sesión:

```json
{
  "perfil_activo": "vivienda",
  "etapa_actual": "presentacion",
  "guia_fiduciaria": {...},
  "alertas_activas": [...],
  "propiedades_vistas": [...],
  "decisiones_registradas": [...],
  "tiempo_en_busqueda": "4_meses",
  "coherencia_promedio": 0.78
}
```

### F.3 Modo de Búsqueda

| Modo | Descripción | Comportamiento Simón |
|------|-------------|---------------------|
| **Exploración** | Usuario recién empieza | Más opciones, menos filtros |
| **Refinamiento** | Usuario tiene preferencias | Filtros más estrictos |
| **Validación** | Usuario tiene candidatas | Comparación directa |
| **Cierre** | Usuario listo para decidir | Solo opciones coherentes |

---

## G. INTERFAZ OPERATIVA

### G.1 Componentes Visibles

| Componente | Función | Interacción |
|------------|---------|-------------|
| **Chat Simón** | Conversación guiada | Input texto + quick replies |
| **Formulario** | Captura estructurada | Multi-step, guardado parcial |
| **Cards propiedad** | Presentación resultados | Expandible, con razón |
| **Panel alertas** | Mostrar banderas | No dismissable si crítica |
| **Barra progreso** | Estado del flujo | 7 pasos visibles |

### G.2 Interacciones Clave

| Acción usuario | Respuesta sistema |
|----------------|-------------------|
| Completa formulario | Genera Guía Fiduciaria |
| Pide opciones | Query → Cards ordenadas por coherencia |
| Expande card | Muestra razón fiduciaria detallada |
| "Quiero esta" | Verifica alertas → CTA a RES |
| "Ya no me gusta X" | Actualiza Guía, re-query |

### G.3 User Journey Día 1

```
┌──────────────────────────────────────────────────────────────┐
│ MOMENTO 1: Landing (10 segundos)                             │
├──────────────────────────────────────────────────────────────┤
│ Usuario ve: "¿Buscando tu próximo hogar?"                   │
│ CTA: "Empezar" (sin registro)                               │
│ Métrica: % click                                             │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ MOMENTO 2: Pregunta de activación (5 segundos)               │
├──────────────────────────────────────────────────────────────┤
│ Simón: "¿Qué te trae hoy?"                                  │
│ Quick replies: [Busco vivienda] [Quiero invertir] [No sé]   │
│ Métrica: Distribución de respuestas                          │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ MOMENTO 3: Formulario guiado (8-12 minutos)                  │
├──────────────────────────────────────────────────────────────┤
│ 9 secciones progresivas                                      │
│ Guardado automático                                          │
│ Métrica: % completa, tiempo por sección, abandonos           │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ MOMENTO 4: "Procesando tu perfil" (10 segundos)              │
├──────────────────────────────────────────────────────────────┤
│ Animación de coherencia                                      │
│ Backend: Claude API → Guía Fiduciaria                       │
│ Métrica: Tiempo de respuesta                                 │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ MOMENTO 5: Resultados (inmediato)                            │
├──────────────────────────────────────────────────────────────┤
│ Tu Guía Fiduciaria (resumen)                                │
│ 3-5 propiedades coherentes                                   │
│ CTA: "Ver detalles" / "Verificar con RES"                   │
│ Métrica: % interacción con cards, % solicita RES            │
└──────────────────────────────────────────────────────────────┘
```

**Tiempo total a valor: < 15 minutos**

---

## H. MODELO DE NEGOCIO

### H.1 Flujos de Ingreso

| Fuente | Modelo | Quién paga |
|--------|--------|------------|
| **Fee por cierre** | % del precio de venta | Desarrollador |
| **Suscripción RES** | Mensual por herramientas | RES |
| **Estudios de mercado** | Por reporte | Desarrolladores/Fondos |
| **API Data** | Por consulta | Proptech/Fintech |

### H.2 Unit Economics

| Concepto | Valor |
|----------|-------|
| **Fee por cierre** | 0.75% del precio |
| **Ticket promedio** | $120,000 USD |
| **Fee promedio** | $900 USD |
| **Costo variable (Claude API + infra)** | ~$2 USD |
| **Margen bruto por cierre** | ~$898 USD |

### H.3 Qué NO hacemos

- ❌ Cobrar al usuario por buscar
- ❌ Vender leads a inmobiliarias
- ❌ Publicidad de propiedades
- ❌ Comisiones ocultas
- ❌ Acuerdos de exclusividad con desarrolladores

---

## I. INFRAESTRUCTURA DE DATOS (Knowledge Graph)

### I.1 Arquitectura de Datos

```
┌─────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE GRAPH                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  proyectos_master (188)  ←─── FK ───→  propiedades_v2 (439) │
│  ├── id_proyecto_master               ├── id               │
│  ├── nombre_oficial                   ├── id_proyecto_master│
│  ├── zona                             ├── dormitorios      │
│  ├── latitud/longitud                 ├── precio_usd       │
│  ├── desarrollador                    ├── area_total_m2    │
│  └── activo                           ├── es_multiproyecto │
│                                       └── datos_json       │
│                                           ├── agente {}    │
│                                           ├── amenities {} │
│                                           └── contenido {} │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                   VISTAS MATERIALIZADAS                      │
│  ├── v_amenities_proyecto                                   │
│  ├── v_proyectos_con_tipologias                            │
│  └── v_unidades_buscables                                  │
├─────────────────────────────────────────────────────────────┤
│                      QUERY LAYER                             │
│  ├── buscar_unidades_reales(filtros)                       │
│  ├── buscar_unidades_con_amenities(amenities, filtros)     │
│  └── knowledge_graph_health_check()                        │
└─────────────────────────────────────────────────────────────┘
```

### I.2 Estructura datos_json

```json
{
  "agente": {
    "nombre": "Fernando Lamas",
    "telefono": "+59178000988",
    "oficina_nombre": "Century21"
  },
  "amenities": {
    "lista": ["Piscina", "Pet Friendly", "Gimnasio"],
    "estado_amenities": {
      "Piscina": {
        "valor": true,
        "fuente": "jsonld",
        "confianza": "alta"
      },
      "Pet Friendly": {
        "valor": "por_confirmar",
        "fuente": "no_detectado",
        "confianza": "baja"
      }
    }
  },
  "contenido": {
    "fotos_urls": ["url1", "url2", "..."]
  }
}
```

### I.3 Niveles de Confianza

| Nivel | Significado | Acción en UI |
|-------|-------------|--------------|
| `alta` | Confirmado por fuente estructurada | ✅ Sin disclaimer |
| `media` | Mencionado en descripción | ✅ Sin disclaimer |
| `baja` | Inferido o por confirmar | ⚠️ "Por verificar con RES" |

### I.4 16 Amenities Normalizados

```
piscina, pet_friendly, gimnasio, churrasquera, sauna_jacuzzi,
ascensor, seguridad_24h, coworking, area_social, salon_eventos,
terraza, jardin, parque_infantil, recepcion, lavadero,
estacionamiento_visitas
```

### I.5 Cobertura Actual

| Métrica | Valor |
|---------|-------|
| Propiedades activas | 439 |
| Unidades buscables (reales) | 371 |
| Proyectos activos | 188 |
| Con amenities | 373 (85%) |
| Con agente completo | 358 (81%) |

### I.6 Refresh Schedule

| Hora | Proceso |
|------|---------|
| 2:00 AM | Discovery (nuevas propiedades) |
| 3:00 AM | Enrichment (extracción datos) |
| 4:00 AM | Matching (asignar a proyectos) |
| 4:30 AM | Refresh vistas materializadas |
| 8:00 PM | Supervisión HITL |

---

## J. PRIORIDAD 30 DÍAS

### J.1 Semana 1-2: Infraestructura

- [x] Knowledge Graph MVP (`buscar_unidades_reales()`)
- [x] Vista `v_amenities_proyecto`
- [x] Índices GIN
- [ ] Formulario Vivienda funcional

### J.2 Semana 3: Integración

- [ ] Claude API conectado
- [ ] Generación de Guía Fiduciaria
- [ ] UI resultados

### J.3 Semana 4: Validación

- [ ] 10 usuarios beta
- [ ] Feedback cualitativo
- [ ] Ajustes críticos

---

## K. ROADMAP EXPANSIÓN

### K.1 Perfiles (Q1 2026)

| Perfil | Estado | ETA |
|--------|--------|-----|
| Vivienda | MVP | Enero |
| Inversor Renta | Diseñado | Febrero |
| Inversor Plusvalía | Diseñado | Febrero |
| Transición | Diseñado | Marzo |

### K.2 Geografía (Q2 2026)

| Ciudad | Prioridad |
|--------|-----------|
| Santa Cruz | Activo |
| La Paz | Q2 |
| Cochabamba | Q3 |

### K.3 Productos Derivados (Q2-Q3 2026)

| Producto | Para quién |
|----------|------------|
| CMA Automatizado | RES |
| Estudios de Mercado | Desarrolladores |
| API de Coherencia | Fintechs |

---

## L. RIESGOS

### L.1 Riesgos de Producto

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Usuarios no completan formulario | Media | Alto | UX iterativa, guardado parcial |
| Muy pocos resultados coherentes | Media | Alto | Expandir data, ajustar umbrales |
| RES no escalan | Media | Medio | Modelo de certificación |

### L.2 Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Claude API lenta/cara | Baja | Medio | Caching, fallback determinístico |
| Data desactualizada | Media | Medio | Refresh nocturno, alertas |
| Scraping bloqueado | Media | Alto | Múltiples fuentes, manual backup |

### L.3 Riesgos de Mercado

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Brokers hostiles | Alta | Medio | Valor a desarrolladores |
| Copycats | Media | Bajo | Metodología + data propietaria |
| Regulación | Baja | Alto | Compliance desde inicio |

---

## M. ROADMAP TÉCNICO

### M.1 Corto Plazo (30 días)

- [x] Knowledge Graph funcional
- [ ] 1 formulario
- [ ] Query → Resultados
- [ ] Claude API integrado

### M.2 Mediano Plazo (90 días)

- [ ] 4 formularios completos
- [ ] Sistema de alertas automático
- [ ] Dashboard RES
- [ ] Feedback loop

### M.3 Largo Plazo (180 días)

- [ ] App móvil
- [ ] Multi-ciudad
- [ ] API pública (partners)
- [ ] ML para proxies

---

## N. GLOSARIO

| Término | Definición |
|---------|------------|
| **Fiduciario** | Que actúa en el mejor interés del cliente, no del vendedor |
| **SICI** | Sistema Inteligente de Clasificación Inmobiliaria (infraestructura de datos) |
| **Simón** | Agente IA fiduciario que interactúa con usuarios |
| **Knowledge Graph** | Capa de datos estructurados y funciones de búsqueda |
| **Query Layer** | Funciones SQL que permiten búsquedas inteligentes |
| **Guía Fiduciaria** | Contrato cognitivo que traduce la intención del cliente en reglas |
| **Ficha de Coherencia** | Output que evalúa coherencia persona ↔ propiedad |
| **Real Estate Strategist** | Profesional entrenado en metodología fiduciaria (no comisionista) |
| **Censo Vivo** | Data propietaria de SICI sobre el mercado inmobiliario |
| **Innegociable** | Criterio que NO se negocia aunque la propiedad sea atractiva |
| **Trade-off** | Lo que se resigna conscientemente al elegir |
| **Estado Fiduciario** | Registro interno de decisiones del usuario |
| **MBF** | Mapa de Búsqueda Fiduciaria - JSON ejecutable con filtros duros/blandos |
| **Filtro Duro** | Criterio que excluye propiedades si no se cumple (nunca se relaja solo) |
| **Filtro Blando** | Criterio que ordena/puntúa pero no excluye |
| **Proxy** | Dato indirecto cuando no existe el dato real (ej: silencio → piso alto) |
| **Modo Búsqueda** | Estado del usuario: exploración, cierre, o validación |
| **Score Calidad Dato** | Puntuación de qué tan completa está la información de una propiedad |
| **Guardrails** | Reglas inmutables que Simón no puede violar bajo ninguna circunstancia |
| **Coherencia** | Métrica 0-1 que mide alineación entre usuario y propiedad |
| **Perfil Sintético** | Hipótesis de vida plausible para validar el sistema |
| **Firewall Ético** | Rol de Simón como barrera entre usuario y mercado |
| **mbf_ready** | Output del formulario listo para alimentar el Query Layer |

---

## O. DOCUMENTOS RELACIONADOS

### O.1 Documentos Esenciales (5)

| # | Documento | Qué contiene | Para quién |
|---|-----------|--------------|------------|
| 1 | **SICI_ARQUITECTURA_MAESTRA.md** | Este documento - visión completa | Todos |
| 2 | **METODOLOGIA_FIDUCIARIA_COMPLETA.md** | Bloques 1-7 + Pasos 8-12 fusionados | Equipo producto |
| 3 | **FORMULARIOS/** | 4 formularios por perfil | Implementación |
| 4 | **SIMON_ARQUITECTURA_COGNITIVA.md** | Guardrails, prompts, state machine | Equipo técnico |
| 5 | **PLAYBOOK_RES.md** | Guía operativa para asesores | RES |

### O.2 Ubicación de Archivos

```
docs/
├── arquitectura/
│   ├── SICI_ARQUITECTURA_MAESTRA.md      ← Este documento
│   └── SIMON_ARQUITECTURA_COGNITIVA.md
├── metodologia/
│   ├── METODOLOGIA_FIDUCIARIA_PARTE_1.md
│   └── METODOLOGIA_FIDUCIARIA_PARTE_2.md
├── formularios/
│   ├── BLOQUE_2_FORM_VIVIENDA.md
│   ├── BLOQUE_2_FORM_INVERSOR_RENTA.md
│   ├── BLOQUE_2_FORM_INVERSOR_PLUSVALIA.md
│   └── BLOQUE_2_FORM_TRANSICION.md
├── pasos/
│   ├── PASO_8_TRADUCCION_FIDUCIARIA_BUSQUEDA.md
│   ├── PASO_9_PRESENTACION_FIDUCIARIA.md
│   ├── PASO_10_ACOMPANAMIENTO_FIDUCIARIO.md
│   ├── PASO_11_APRENDIZAJE_FIDUCIARIO.md
│   └── PASO_12_CIERRE_ASISTIDO.md
└── operaciones/
    └── handoffs/
```

> **Meta:** Consolidar a 5 documentos principales en Fase 2.

---

## P. ANTI-PATTERNS (Lo que NUNCA hacer)

### P.1 Anti-Patterns de Producto

| ❌ NUNCA | Por qué |
|---------|---------|
| Agregar filtro blando que se vuelva duro | Erosiona confianza del sistema |
| Mostrar propiedades sin coherencia calculada | Rompe promesa fiduciaria |
| Optimizar por conversión de leads | Contamina el rol fiduciario |
| Relajar filtro duro porque "casi cumple" | "Casi" no existe |
| Ocultar razón de exclusión al usuario | Opacidad = desconfianza |

### P.2 Anti-Patterns de Comunicación

| ❌ NUNCA decir | ✅ En su lugar |
|---------------|----------------|
| "Esta es una oportunidad increíble" | "Esto cumple tus criterios" |
| "Deberías decidir pronto" | "Cuando estés listo, avanzamos" |
| "Es casi perfecta" | "Viola X, no cumple" |
| "Podrías adaptarte a..." | "Esto contradice tu innegociable" |
| "No hay nada mejor" | "Estas son las opciones coherentes hoy" |

### P.3 Anti-Patterns Técnicos

| ❌ NUNCA | Consecuencia |
|---------|--------------|
| Cachear Guía Fiduciaria por >24h | Decisiones con datos viejos |
| Ejecutar query sin filtros duros | Resultados incoherentes |
| Mostrar >5 opciones en cualquier modo | Parálisis de decisión |
| Ignorar alerta crítica | Riesgo legal/reputacional |

---

## Q. MVP LAUNCH CRITERIA

### Q.1 Checklist Técnico

- [ ] 1 formulario funcional (Vivienda)
- [ ] Query Layer ejecutando contra DB producción
- [ ] Coherencia calculada correctamente (tests)
- [ ] 0 propiedades mostradas con filtro duro violado
- [ ] Alertas detectadas y mostradas
- [ ] Persistencia de sesión funcionando

### Q.2 Checklist Operativo

- [ ] 3 RES entrenados en metodología
- [ ] Script de onboarding RES documentado
- [ ] Proceso de escalamiento definido
- [ ] Canal de soporte activo

### Q.3 Checklist de Validación

- [ ] 10 usuarios beta completaron flujo
- [ ] NPS beta > 40
- [ ] 0 bugs críticos en 48h de testing
- [ ] Tiempo promedio formulario < 15 min
- [ ] 80%+ califican "entendí mejor qué busco"

### Q.4 Go/No-Go

| Criterio | Umbral | Bloquea launch |
|----------|--------|----------------|
| Bugs críticos | 0 | ✅ Sí |
| NPS beta | > 40 | ✅ Sí |
| RES entrenados | ≥ 3 | ✅ Sí |
| Usuarios beta | ≥ 10 | ✅ Sí |
| Coherencia correcta | 100% tests | ✅ Sí |

---

## R. PLAN DE CONTINGENCIA

### R.1 Si Claude API falla

| Escenario | Acción |
|-----------|--------|
| Timeout >10s | Reintentar 1x, luego fallback |
| Error 500 | Mostrar "Procesando, volvé en 5 min" |
| Caída total | Activar modo determinístico (solo filtros SQL) |

**Fallback determinístico:**
- Filtros duros → SQL directo
- Sin generación de "razón fiduciaria"
- Mensaje: "Resultados básicos. Guía completa disponible pronto."

### R.2 Si hay 0 resultados siempre

| Causa probable | Acción |
|----------------|--------|
| Filtros demasiado restrictivos | Revisar combinaciones más frecuentes |
| Data incompleta | Ampliar cobertura de propiedades |
| Bug en query | Logs + alerta automática |

**Protocolo:**
1. Si 3+ usuarios consecutivos tienen 0 resultados → alerta Slack
2. Revisar queries de últimas 24h
3. Ajustar umbrales o ampliar data

### R.3 Si usuarios abandonan en formulario

| Tasa abandono | Acción |
|---------------|--------|
| < 30% | Normal, monitorear |
| 30-50% | Revisar UX, simplificar preguntas |
| > 50% | Pausar, rediseñar formulario |

**Puntos de medición:**
- Inicio → Sección C (financiera): crítico
- Sección C → Sección F: normal
- Sección F → Final: problema de cierre

### R.4 Si RES no responde en tiempo

| SLA | Escalamiento |
|-----|--------------|
| <2h | Notificación email |
| 2-6h | Notificación SMS |
| >6h | Reasignar a RES backup |
| >24h | Contacto directo de founder |

---

## S. HISTORIAL DE CAMBIOS

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 6 Enero 2026 | Documento inicial - 7 Bloques |
| 1.1 | 6 Enero 2026 | Agregado: Arquitectura Cognitiva, Formularios, Pasos 8-12 |
| 1.2 | 6 Enero 2026 | Integración completa: Bloques 4-7 expandidos, Paso 8 con fórmulas |
| 2.0 | 6 Enero 2026 | Metodología 12 Pasos, 4 formularios, Sistema de Alertas |
| 2.1 | 6 Enero 2026 | Revisión ejecutiva: 7 pasos visibles, North Star, Unit Economics, Anti-Patterns, MVP Criteria |
| **2.2** | **6 Enero 2026** | **Conexión con implementación:** Nueva sección A-BIS (Actores: RES definido como verificador fiduciario, flujo completo), Paso 5 conectado con Knowledge Graph (`buscar_unidades_reales()`), Nueva sección I (Infraestructura de Datos: unidades reales vs virtuales, estructura datos_json, 16 amenities normalizados), Audiencia ahora incluye Claude Code |

---

*Este documento debe versionarse, no sobrescribirse.*  
*Próxima revisión: Post-aprobación Knowledge Graph*
