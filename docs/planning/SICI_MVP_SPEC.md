# SICI/Simón - MVP Spec

**Objetivo:** Validar metodología fiduciaria con 10 usuarios reales  
**Plazo:** 30 días  
**Fecha:** 6 Enero 2026  
**Regla:** Si no está en este documento, no se construye

---

## 1. QUÉ CONSTRUIMOS

### 1.1 Flujo Único

```
Landing → Formulario Vivienda → Resultados → Captura Lead
```

**Eso es todo.** Un camino. Sin branches. Sin login. Sin pagos.

### 1.2 Pantallas (4 total)

| # | Pantalla | Tiempo dev |
|---|----------|------------|
| 1 | Landing con CTA | 1 día |
| 2 | Formulario Vivienda (9 secciones) | 5 días |
| 3 | Resultados (3-5 propiedades) | 3 días |
| 4 | Confirmación lead capturado | 0.5 día |

### 1.3 Stack

| Componente | Tecnología | Razón |
|------------|------------|-------|
| Frontend | React/Next.js o Webflow | Rápido |
| Backend | n8n + Supabase | Ya existe |
| IA | Claude API | Generar Guía |
| DB | PostgreSQL (ya existe) | Knowledge Graph |

---

## 2. QUÉ NO CONSTRUIMOS

| Feature | Por qué NO |
|---------|-----------|
| Login/registro | Fricción innecesaria |
| Múltiples perfiles (inversor, etc.) | Solo Vivienda para MVP |
| Pagos/Premium | Primero validar valor |
| Dashboard usuario | No hay "cuenta" |
| Chat con Simón | Formulario es suficiente |
| App móvil | Web responsive |
| Verificación RES en plataforma | Manual por ahora |
| Notificaciones | Email básico |

---

## 3. PANTALLA POR PANTALLA

### 3.1 Landing

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│            🏠 Encontrá tu próximo hogar                     │
│               sin arrepentirte después                      │
│                                                             │
│     No somos inmobiliaria. Somos tu filtro inteligente.    │
│                                                             │
│              [ EMPEZAR → ]                                  │
│                                                             │
│     ✓ Gratis  ✓ 10 minutos  ✓ Sin compromiso              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Métricas:** % click en CTA

### 3.2 Formulario Vivienda

**Fuente:** `BLOQUE_2_FORM_VIVIENDA.md`

| Sección | Preguntas clave | Campos |
|---------|-----------------|--------|
| A. Contexto | ¿Con quién vivís? ¿Mascota? | 4 |
| B. Historia | ¿Cuánto llevas buscando? ¿Qué viste? | 3 |
| C. Financiero | Presupuesto, cuota actual, reserva | 5 |
| D. Ubicación | Zonas, trabajo, escuela | 4 |
| E. Propiedad | Dormitorios, amenities clave | 5 |
| F. Horizonte | ¿Cuántos años? ¿Podría cambiar? | 3 |
| G. Trade-offs | ¿Qué resignarías? | 3 |
| H. Alertas | Presión, urgencia, dudas | 4 |
| I. Validación | Confirmar top 3 innegociables | 2 |

**Total:** ~33 campos  
**Tiempo estimado:** 8-12 minutos  
**UX:** Progreso visible, guardar parcial NO (simplicidad)

**Métricas:** 
- % completa sección C (financiero = punto crítico)
- % llega al final
- Tiempo promedio

### 3.3 Procesamiento (no visible)

```
Formulario completo
       ↓
[n8n] Parsear respuestas → JSON
       ↓
[Claude API] Generar:
├── perfil_fiduciario
├── guia_fiduciaria  
├── alertas[]
└── mbf_ready (filtros)
       ↓
[PostgreSQL] buscar_unidades_reales(mbf_ready)
       ↓
[Claude API] Generar razón fiduciaria por opción
       ↓
Mostrar resultados
```

**Tiempo total procesamiento:** < 30 segundos  
**Fallback si Claude falla:** Resultados sin "razón fiduciaria" (solo datos)

### 3.4 Resultados

```
┌─────────────────────────────────────────────────────────────┐
│  TU GUÍA FIDUCIARIA                                         │
│  ─────────────────                                          │
│  "Buscás estabilidad para tu familia en zona tranquila.     │
│   Tu presupuesto es realista. Cuidado: llevas 8 meses       │
│   buscando, no decidas por cansancio."                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  OPCIONES COHERENTES (3)                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │ [FOTO]  LAS DALIAS - 2 dorm                        │    │
│  │         85 m² · $142,000                           │    │
│  │         ✅ Piscina ✅ Pet Friendly ✅ Seguridad    │    │
│  │                                                    │    │
│  │  Por qué encaja:                                   │    │
│  │  "Cumple tus 3 innegociables. 5% bajo tu tope."   │    │
│  │                                                    │    │
│  │  [VER FOTOS]                                       │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  [Propiedad 2...]                                           │
│  [Propiedad 3...]                                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ¿TE INTERESA ALGUNA?                                       │
│                                                             │
│  Nombre: [____________]                                     │
│  WhatsApp: [____________]                                   │
│  ¿Cuál te interesa más? [Dropdown]                         │
│                                                             │
│  [ QUIERO QUE ME CONTACTEN → ]                             │
│                                                             │
│  Un asesor verificará la propiedad y te contactará         │
│  en menos de 24 horas.                                      │
└─────────────────────────────────────────────────────────────┘
```

**Métricas:**
- % deja datos de contacto
- Cuál propiedad seleccionan más
- Tiempo en página

### 3.5 Confirmación

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ✓ ¡Recibido!                            │
│                                                             │
│     Te contactaremos por WhatsApp en menos de 24h.         │
│                                                             │
│     Mientras tanto, guardamos tu Guía Fiduciaria.          │
│     Si cambias de opinión sobre algo, nos avisas.          │
│                                                             │
│     [ VOLVER AL INICIO ]                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Acción backend:** 
- Guardar lead en tabla `leads_mvp`
- Notificación Slack a Luis
- Email confirmación al usuario (opcional MVP)

---

## 4. BASE DE DATOS

### 4.1 Usar lo que existe

| Tabla | Uso en MVP |
|-------|------------|
| `proyectos_master` | Fuente de proyectos |
| `propiedades_v2` | Fuente de unidades |
| `v_amenities_proyecto` | Amenities consolidados |

### 4.2 Crear para MVP

```sql
-- Leads capturados
CREATE TABLE leads_mvp (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Contacto
  nombre TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  
  -- Formulario completo
  formulario_raw JSONB NOT NULL,
  
  -- Outputs Simón
  perfil_fiduciario JSONB,
  guia_fiduciaria JSONB,
  alertas JSONB,
  
  -- Resultados mostrados
  propiedades_mostradas INTEGER[], -- IDs
  propiedad_interes INTEGER, -- La que eligió
  
  -- Seguimiento
  estado TEXT DEFAULT 'nuevo', -- nuevo/contactado/calificado/descartado
  notas TEXT,
  contactado_at TIMESTAMP
);

-- Índice para buscar rápido
CREATE INDEX idx_leads_estado ON leads_mvp(estado);
```

### 4.3 Knowledge Graph (pre-requisito)

Antes de MVP necesitamos que esté funcionando:

- [x] `buscar_unidades_reales(filtros)` 
- [x] `v_amenities_proyecto` actualizada
- [x] Índices GIN en amenities

---

## 5. INTEGRACIONES

### 5.1 Claude API

**Endpoint:** Messages API  
**Modelo:** claude-sonnet-4-20250514 (balance costo/calidad)  
**Llamadas por usuario:** 2
1. Generar Guía Fiduciaria + MBF
2. Generar razón fiduciaria por propiedad

**Prompt 1 - Guía Fiduciaria:**
```
Eres Simón, asesor fiduciario inmobiliario.

Dado este formulario completado:
{formulario_json}

Genera:
1. perfil_fiduciario (JSON con 6 ejes)
2. guia_fiduciaria (JSON con 8 componentes)
3. alertas (array con severidad)
4. mbf_ready (filtros para búsqueda SQL)

Responde SOLO en JSON válido.
```

**Prompt 2 - Razón Fiduciaria:**
```
Dado este perfil:
{guia_fiduciaria}

Y esta propiedad:
{propiedad_data}

Genera una frase de 1-2 oraciones explicando 
por qué esta propiedad encaja (o no) con lo 
que busca el usuario. Sé específico.
```

**Costo estimado:** ~$0.02 por usuario

### 5.2 Notificaciones

| Evento | Canal | Contenido |
|--------|-------|-----------|
| Nuevo lead | Slack #leads | Nombre, WhatsApp, propiedad interés |
| Lead no contactado 24h | Slack #leads | Reminder |

### 5.3 Nada más

- NO email marketing
- NO SMS
- NO CRM externo
- NO analytics avanzado (solo métricas básicas en Supabase)

---

## 6. CRITERIOS DE ÉXITO

### 6.1 Cuantitativos

| Métrica | Target | Cómo medir |
|---------|--------|------------|
| Usuarios completan formulario | 10 | COUNT en DB |
| % abandono antes de financiero | < 40% | Logs |
| % deja datos contacto | > 50% | leads_mvp |
| Tiempo promedio formulario | < 15 min | Timestamps |
| Leads contactados < 24h | 100% | Estado en DB |

### 6.2 Cualitativos

| Pregunta | Cómo validar |
|----------|--------------|
| "¿Entendiste mejor qué buscás?" | Preguntar en llamada |
| "¿Te sentiste presionado?" | Preguntar en llamada |
| "¿Las opciones tenían sentido?" | Preguntar en llamada |
| "¿Volverías a usar esto?" | Preguntar en llamada |

### 6.3 Go/No-Go para siguiente fase

| Resultado | Decisión |
|-----------|----------|
| < 5 completan | Pivotar formulario |
| > 50% dice "no entendí qué busco" | Pivotar metodología |
| 0 leads contactados | Problema operativo |
| > 80% positivo en cuali | Seguir a Premium |

---

## 7. CRONOGRAMA

### Semana 1: Infraestructura
- [x] Aprobar Knowledge Graph plan
- [x] Implementar `buscar_unidades_reales()`
- [ ] Crear tabla `leads_mvp`
- [ ] Setup proyecto frontend

### Semana 2: Formulario
- [ ] UI formulario (9 secciones)
- [ ] Validaciones
- [ ] Guardar en DB
- [ ] Integrar Claude API (Prompt 1)

### Semana 3: Resultados
- [ ] Query a Knowledge Graph
- [ ] Integrar Claude API (Prompt 2)
- [ ] UI resultados
- [ ] Captura lead
- [ ] Notificación Slack

### Semana 4: Testing + Lanzamiento
- [ ] Testing interno (3-5 personas)
- [ ] Fixes
- [ ] Lanzamiento soft (10 usuarios)
- [ ] Feedback calls

---

## 8. FUERA DE ALCANCE (EXPLÍCITO)

| Feature | Por qué no | Cuándo sí |
|---------|-----------|-----------|
| Perfil Inversor Renta | Solo Vivienda primero | Post-validación |
| Perfil Inversor Plusvalía | Solo Vivienda primero | Post-validación |
| Perfil Transición | Solo Vivienda primero | Post-validación |
| Login/cuentas | Sin fricción | Cuando haya retención |
| Pagos/Premium | Validar valor primero | Post-10 usuarios |
| Verificación RES digital | Manual por ahora | Post-MVP |
| Múltiples búsquedas | Una búsqueda = un lead | Post-MVP |
| Comparador propiedades | Complejidad UI | Post-MVP |
| Mapa interactivo | Nice to have | Post-MVP |
| Estudios de mercado | Otro producto | Q2 |
| CMA asesores | Otro producto | Q2 |
| API Banca | Otro producto | Q3 |

---

## 9. RIESGOS Y MITIGACIÓN

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Knowledge Graph no listo | Media | Fallback: query SQL directo |
| Claude API lenta | Baja | Timeout 30s + mensaje "procesando" |
| 0 usuarios | Media | Tener lista de 20 contactos warm |
| Formulario muy largo | Alta | Monitorear abandono, cortar si necesario |
| Leads no contactados a tiempo | Media | Alarma Slack si > 12h |

---

## 10. CÓMO CONSEGUIR 10 USUARIOS

| Canal | Cantidad target | Cómo |
|-------|-----------------|------|
| Conocidos buscando casa | 3-4 | WhatsApp directo |
| Referidos de conocidos | 2-3 | "¿Conocés a alguien buscando?" |
| Grupos Facebook SCZ | 2-3 | Post en grupos inmobiliarios |
| LinkedIn | 1-2 | Post personal |

**NO hacer:**
- Ads pagados (no es el momento)
- Cold outreach masivo
- Promesas de propiedades específicas

---

## 11. DÍA 1 POST-LANZAMIENTO

```
08:00 - Revisar leads de la noche
09:00 - Contactar leads nuevos (WhatsApp)
10:00 - Llamadas de calificación
12:00 - Revisar métricas (abandonos, tiempos)
14:00 - Más contactos si hay
16:00 - Revisar feedback, anotar patrones
18:00 - Ajustes si hay bugs críticos
```

---

## CHECKLIST FINAL

### Antes de lanzar

- [ ] `buscar_unidades_reales()` retorna datos correctos
- [ ] Formulario funciona en móvil
- [ ] Claude API responde < 30s
- [ ] Notificación Slack llega
- [ ] 3 personas internas probaron flujo completo
- [ ] Lista de 10+ contactos warm lista

### Para considerar éxito

- [ ] 10 usuarios completaron flujo
- [ ] 5+ dejaron datos de contacto
- [ ] 100% contactados en < 24h
- [ ] Feedback cualitativo documentado
- [ ] Decisión Go/No-Go tomada

---

*Este documento es el contrato. Si no está aquí, no se hace.*
