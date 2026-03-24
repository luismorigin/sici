# SICI / Simón - Arquitectura Maestra

**Documento:** Arquitectura completa del sistema
**Versión:** 3.0
**Fecha:** 28 Febrero 2026
**Estado:** Aprobado
**Audiencias:** Fundador · Inversores · Equipo Técnico · Claude Code

---

## A. VISIÓN Y PROPÓSITO

### A.1 Qué es SICI/Simón

**SICI** (Sistema Inteligente de Captura Inmobiliaria) es la infraestructura de datos.  
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

## I. INFRAESTRUCTURA DE DATOS

### I.1 Arquitectura de Datos

```
┌──────────────────────────────────────────────────────────────────┐
│                       KNOWLEDGE GRAPH                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  proyectos_master (227)  ←── FK ──→  propiedades_v2 (1,002)      │
│  ├── id_proyecto_master               ├── id                     │
│  ├── nombre_oficial                   ├── id_proyecto_master     │
│  ├── zona (5 canónicas)              ├── dormitorios            │
│  ├── latitud/longitud                 ├── precio_usd             │
│  ├── desarrollador                    ├── area_total_m2          │
│  ├── microzona (PostGIS)             ├── tipo_operacion          │
│  └── activo                           ├── es_multiproyecto       │
│                                       ├── nombre_edificio        │
│                                       ├── microzona              │
│                                       └── datos_json (3 JSONBs)  │
│                                           ├── discovery {}       │
│                                           ├── enrichment {}      │
│                                           └── merge {}           │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                         QUERY LAYER                               │
│  ├── buscar_unidades_reales(filtros)      → Venta                │
│  ├── buscar_unidades_alquiler(filtros)    → Alquiler             │
│  ├── buscar_unidades_broker(filtros)      → Portal broker        │
│  ├── buscar_unidades_con_amenities(...)   → Filtro amenities     │
│  ├── generar_razon_fiduciaria(...)        → Texto fiduciario     │
│  ├── calcular_posicion_mercado(...)       → Ranking mercado      │
│  └── knowledge_graph_health_check()       → Health check         │
├──────────────────────────────────────────────────────────────────┤
│                        FUNCIONES (~141)                            │
│  ├── discovery/       → registrar_discovery, _alquiler            │
│  ├── enrichment/      → registrar_enrichment, _alquiler           │
│  ├── merge/           → merge_discovery_enrichment, merge_alquiler│
│  ├── matching/        → matching_completo, _alquileres_batch      │
│  ├── query_layer/     → buscar_*, generar_razon, posicion         │
│  ├── tc_dinamico/     → actualizar_tc, recalcular_precios_batch   │
│  ├── hitl/            → procesar_decision_sin_match, excluidas    │
│  ├── broker/          → buscar_unidades_broker, score, verificar  │
│  ├── admin/           → inferir_datos_proyecto, propagar_proyecto │
│  ├── helpers/         → precio_normalizado, normalize_nombre      │
│  ├── triggers/        → proteger_amenities, asignar_zona_alquiler │
│  └── snapshots/       → snapshot_absorcion_mercado (global+zona)   │
└──────────────────────────────────────────────────────────────────┘
```

### I.2 Tablas Principales

| Tabla | Registros | Propósito |
|-------|-----------|-----------|
| `propiedades_v2` | 1,002 | Tabla única de propiedades (84 columnas) |
| `proyectos_master` | 229 (227 activos) | Catálogo de proyectos/edificios |
| `workflow_executions` | — | Health check de ejecuciones nocturnas |
| `market_absorption_snapshots` | — | Snapshots absorción, precios, ROI (global + por zona desde mig. 200). Filtrar `zona = 'global'` para agregados |
| `config_global` | — | Config dinámica (TC paralelo, etc.) |
| `brokers` | — | Directorio broker B2B |

### I.3 Fuentes de Datos

| Fuente | Venta | Alquiler | Método |
|--------|-------|----------|--------|
| Century21 | 515 | 229 | API REST + HTML scraping |
| Remax | 177 | 74 | API REST + HTML scraping |
| Bien Inmuebles | — | 7 | HTML scraping |

### I.4 Arquitectura Dual (3 JSONBs por propiedad)

| Campo | Contenido | Mutabilidad |
|-------|-----------|-------------|
| `datos_json_discovery` | Snapshot crudo de API | Inmutable por ejecución |
| `datos_json_enrichment` | Extracción HTML + LLM | Inmutable por ejecución |
| `datos_json` | Merge consolidado v3.0 | Reescrito en cada merge |

El merge aplica reglas de prioridad (Discovery > Enrichment para campos físicos) y candados manuales (`campos_bloqueados`). Ver `docs/canonical/merge_canonical.md`.

### I.5 Amenities (69 campos)

El enrichment LLM extrae 69 campos de amenities del HTML de cada propiedad. Cada campo tiene `valor` (true/false/por_confirmar), `fuente` y `confianza`. Los candados protegen ediciones manuales via trigger `proteger_amenities_candados`.

### I.6 TC Dinámico (Tipo de Cambio Paralelo)

Bolivia tiene dualidad cambiaria: TC oficial (6.96 Bs/USD) vs TC paralelo (~7.30-7.80). El sistema:
1. Consulta Binance P2P cada noche → `config_global.tipo_cambio_paralelo`
2. Enrichment LLM detecta `tipo_cambio_detectado` = `oficial|paralelo|no_especificado`
3. `precio_normalizado()` convierte precios paralelo a USD reales para comparaciones

### I.7 Cobertura Actual (28 Feb 2026)

| Métrica | Valor |
|---------|-------|
| Propiedades totales | 1,002 |
| Venta | 692 (C21: 515, Remax: 177) |
| Alquiler | 310 (C21: 229, Remax: 74, BI: 7) |
| Proyectos activos | 227 (99.1% con GPS) |
| Completados con score | 588 |
| Con amenities | 587 (100% de completados) |
| Con nombre edificio | 462 (79%) |
| Con microzona PostGIS | 430 (73%) |
| Funciones custom SICI | ~141 |
| Duplicados detectados | 41 |

### I.8 Pipeline Nocturno

**Venta (modulo_1)**

| Hora | Proceso | Workflows |
|------|---------|-----------|
| 1:00 AM | Discovery C21 + Remax | 2 workflows |
| 2:00 AM | Enrichment LLM | 1 workflow |
| 3:00 AM | Merge → campos consolidados + TC | 1 workflow |
| 4:00 AM | Matching → id_proyecto_master | 1 workflow |
| 6:00 AM | Verificador ausencias (solo Remax) | 1 workflow |
| 9:00 AM | Auditoría + Snapshots absorción | 2 workflows |

**Alquiler**

| Hora | Proceso | Workflows |
|------|---------|-----------|
| 1:30 AM | Discovery C21 + Remax | 2 workflows |
| 2:30 AM | Discovery Bien Inmuebles + Enrichment LLM | 2 workflows |
| 3:30 AM | Merge alquiler (enrichment-first, sin TC) | 1 workflow |
| 7:00 AM | Verificador alquiler (pending + ghost) | 1 workflow |

### I.9 Microzonas Geográficas (PostGIS)

5 zonas canónicas asignadas por `poblar_zonas_batch()` usando `geodata/microzonas_equipetrol_v4.geojson`:

| Zona | Perfil |
|------|--------|
| Equipetrol Centro | Motor principal, mayor volumen |
| Equipetrol Norte | Financiero, rentas altas |
| Sirari | Premium, venta directa desarrolladoras |
| Villa Brígida | Emergente, entry-level, absorción rápida |
| Equipetrol Oeste | Mixto: premium + universitario |

---

## J. HISTORIAL DE IMPLEMENTACIÓN + PENDIENTES

### J.1 Completado (Dic 2025 — Feb 2026)

| Hito | Fecha | Detalle |
|------|-------|---------|
| Knowledge Graph MVP | Dic 2025 | `buscar_unidades_reales()`, vistas, índices GIN |
| Pipeline venta completo | Dic 2025 | Discovery → Enrichment → Merge → Matching nocturno |
| Matching v3.1 | Dic 2025 | GPS + fuzzy + trigram + URL. 86.2% matching rate venta (350/406 completadas) |
| HITL Admin Dashboard | Ene 2026 | Supervisor, Sin Match, Excluidas — reemplazó Google Sheets |
| Amenities 69 campos | Ene 2026 | Extracción LLM + candados manuales + trigger protección |
| TC Dinámico Binance | Ene 2026 | Consulta P2P + `precio_normalizado()` + recálculo batch |
| Pipeline alquiler | Feb 2026 | 3 fuentes (C21, Remax, Bien Inmuebles), 6 workflows |
| Sistema Broker B2B | Feb 2026 | Tablas, búsqueda, PDF, score calidad, portal broker |
| Admin Dashboards | Feb 2026 | Propiedades, Proyectos, Salud, Market Pulse, Alquileres |
| Market Snapshots | Feb 2026 | Absorción, precios, renta, ROI por tipología |
| Deduplicación | Feb 2026 | Sistema `duplicado_de` activo (41 detectados) |
| Landing Premium v2 | Feb 2026 | Flujo: filtros-v2 → formulario-v2 → resultados-v2 |
| Feed Alquileres | Feb 2026 | `/alquileres` público con cards + filtros |

### J.2 Pendiente

| Área | Tarea | Prioridad |
|------|-------|-----------|
| **Broker** | Portal broker avanzado (fases 5-7) | Alta |
| **Broker** | Sistema leads completo + CMA automatizado | Alta |
| **Datos** | Enriquecimiento IA proyectos (15 sin desarrollador) | Media |
| **Datos** | Validación GPS (workflow Google Places) | Media |
| **Producto** | Claude API integrado para Guía Fiduciaria | Alta |
| **Producto** | Formulario Vivienda MVP funcional | Alta |
| **Geografía** | Expansión a La Paz / Cochabamba | Baja |

Ver backlogs detallados en `docs/backlog/`

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

## N. GLOSARIO

| Término | Definición |
|---------|------------|
| **Fiduciario** | Que actúa en el mejor interés del cliente, no del vendedor |
| **SICI** | Sistema Inteligente de Captura Inmobiliaria (infraestructura de datos) |
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

### O.1 Documentación Activa

| Documento | Ruta | Contenido |
|-----------|------|-----------|
| **Arquitectura Maestra** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` | Este documento |
| **Simón Arquitectura Cognitiva** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` | Guardrails, prompts, state machine |
| **Simón Brand Guidelines** | `docs/simon/SIMON_BRAND_GUIDELINES.md` | Paleta, fonts, tono de marca |
| **Metodología Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` | Bloques 1-7 + Pasos 8-12 |
| **Merge Canonical** | `docs/canonical/merge_canonical.md` | Merge venta v3.0.0 |
| **Pipeline Alquiler** | `docs/canonical/pipeline_alquiler_canonical.md` | Pipeline alquiler completo v2.0 |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` | Filtros obligatorios para estudios |
| **Schema BD** | `sql/schema/propiedades_v2_schema.md` | 84 columnas, enums, constraints, índices |
| **Catálogo Funciones SQL** | `sql/functions/FUNCTION_CATALOG.md` | Inventario ~141 funciones por dominio |
| **Índice Migraciones** | `docs/migrations/MIGRATION_INDEX.md` | 171 migraciones (001-169) |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` | Bugs, filtros, absorción |

### O.2 Formularios (diseño)

| Formulario | Ruta |
|------------|------|
| Vivienda | `docs/simon/formularios/BLOQUE_2_FORM_VIVIENDA.md` |
| Inversor Renta | `docs/simon/formularios/BLOQUE_2_FORM_INVERSOR_RENTA.md` |
| Inversor Plusvalía | `docs/simon/formularios/BLOQUE_2_FORM_INVERSOR_PLUSVALIA.md` |
| Transición | `docs/simon/formularios/BLOQUE_2_FORM_TRANSICION.md` |

### O.3 Backlogs y Planning

| Documento | Ruta |
|-----------|------|
| Calidad Datos | `docs/backlog/CALIDAD_DATOS_BACKLOG.md` |
| Deuda Técnica | `docs/backlog/DEUDA_TECNICA.md` |
| Broker Roadmap | `docs/simon/broker/BROKER_ROADMAP_REFINADO.md` |

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
| 1.0 | 6 Ene 2026 | Documento inicial - 7 Bloques |
| 1.1 | 6 Ene 2026 | Arquitectura Cognitiva, Formularios, Pasos 8-12 |
| 1.2 | 6 Ene 2026 | Bloques 4-7 expandidos, Paso 8 con fórmulas |
| 2.0 | 6 Ene 2026 | Metodología 12 Pasos, 4 formularios, Sistema de Alertas |
| 2.1 | 6 Ene 2026 | North Star, Unit Economics, Anti-Patterns, MVP Criteria |
| 2.2 | 6 Ene 2026 | Sección A-BIS (Actores/RES), Paso 5 con Knowledge Graph, Sección I (Infraestructura) |
| **3.0** | **28 Feb 2026** | **Actualización mayor:** Sección I reescrita con datos producción (1,002 props, 227 proyectos, 3 fuentes, ~130 funciones, 69 amenities, TC dinámico, pipeline dual venta+alquiler). Secciones J/K/M/Q (roadmaps obsoletos) consolidadas en J (Historial + Pendientes). Sección O actualizada con rutas reales del repo. Eliminado banner DESACTUALIZADO. |

---

*Este documento debe versionarse, no sobrescribirse.*
