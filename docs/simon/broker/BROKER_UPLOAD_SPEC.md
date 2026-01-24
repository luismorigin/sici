# SIMON BROKER: Plan Completo del Sistema B2B

## Vision General

Sistema que permite a brokers publicar propiedades en Simon de forma **gratuita** pero con **requisitos de calidad estrictos**. El objetivo es construir una base de datos limpia, transparente y util tanto para compradores como para el ecosistema.

---

## Principios Fundamentales

### 1. Calidad > Cantidad
- Preferimos 100 propiedades con datos completos que 1000 con datos basura
- Cada campo incompleto = busqueda menos precisa para el comprador
- **Simon NO es un portal masivo. Simon = Data Curada**

### 2. Transparencia Total
- El comprador merece saber TODO antes de contactar
- Amenidades, expensas, estado real, fecha entrega, etc.

### 3. Facil de Llenar
- UX que guie al broker paso a paso
- **Import por link** (pegar URL de C21/Remax → auto-scrape)
- Autocompletado inteligente (por proyecto conocido)
- Validacion en tiempo real (no al final)

### 4. Win-Win-Win
- **Broker**: Publicacion gratis + leads calificados + CMAs gratis + **PDFs profesionales auto-generados**
- **Comprador**: Data confiable + transparencia + decision informada
- **Simon**: Base de datos limpia + algoritmos precisos + revenue

---

## Politica de Fuentes Curadas

### Fuentes ACEPTADAS
| Fuente | Razon |
|--------|-------|
| ✅ Century21 Bolivia (c21.com.bo) | Exclusividad garantizada |
| ✅ Remax Bolivia (remax.bo) | Exclusividad garantizada |
| ✅ Bien Inmuebles (bieninmuebles.com.bo) | Data verificada |
| ✅ Desarrolladoras directas | Verificacion manual |

### Fuentes NO ACEPTADAS
| Fuente | Razon |
|--------|-------|
| ❌ InfoCasas, Properati | Agregadores con duplicados masivos |
| ❌ Brokers sin exclusividad | Sin garantia de datos reales |
| ❌ Propiedades scrapeadas sin verificar | Calidad no controlada |

### ¿Por que esta restriccion?
1. **Exclusividad garantizada**: C21/Remax solo permiten publicar si tienes exclusividad
2. **Sin duplicados**: La misma propiedad NO aparece 10 veces
3. **Brokers serios**: Filtro natural de calidad
4. **Base de datos limpia**: Algoritmos de Simon se entrenan con data real

---

## PLAN DE IMPLEMENTACION (4 Fases)

### FASE 1: Fundamentos (Semana 1-2)

**Objetivo**: Crear la base de datos y autenticacion para brokers.

| Tarea | Descripcion | Prioridad |
|-------|-------------|-----------|
| 1.1 | Tabla `brokers` - registro, auth, creditos CMA | Alta |
| 1.2 | Tabla `propiedades_broker` - listings con codigo unico | Alta |
| 1.3 | Sistema de codigos `SIM-XXXXX` | Alta |
| 1.4 | Autenticacion broker (email + password o magic link) | Alta |
| 1.5 | Sistema de calidad (score 0-100 pts) | Media |

**Entregables**:
- Schema de BD documentado y migrado
- API de registro/login broker
- Generador de codigos unicos

---

### FASE 2: Upload de Propiedades (Semana 2-3)

**Objetivo**: Sistema de carga con import automatico y validacion de calidad.

| Tarea | Descripcion | Prioridad |
|-------|-------------|-----------|
| 2.1 | **Import por Link** - Pegar URL C21/Remax → scraping automatico | Alta |
| 2.2 | Validacion de fuente (solo C21, Remax, Bien Inmuebles) | Alta |
| 2.3 | Formulario multi-paso para completar datos faltantes | Alta |
| 2.4 | Validacion de calidad en tiempo real | Alta |
| 2.5 | Upload de fotos con hash anti-duplicados | Alta |
| 2.6 | **Deteccion de watermarks** en fotos | Alta |
| 2.7 | **Bloqueo anti-duplicados** (hash + GPS + mensaje claro) | Alta |
| 2.8 | Geolocalizacion (mapa para seleccionar ubicacion) | Media |
| 2.9 | Autocompletado por proyecto conocido | Media |
| 2.10 | Preview de como se vera la propiedad | Baja |

**Flujo Principal (80% casos): Import por Link**
```
1. Broker pega link: https://c21.com.bo/propiedad/12345
2. Sistema verifica fuente (C21/Remax/Bien Inmuebles)
3. Scraping: precio, m², dorms, baños, fotos
4. Verifica duplicados (hash fotos + GPS)
5. Si OK → auto-completa formulario
6. Broker solo llena lo que falta (expensas, amenidades)
7. Publicar
```

**Flujo Secundario (20% casos): Manual**
- Para desarrolladoras directas
- Propiedades sin link publico

**Sistema Anti-Duplicados**:
```
Si hash de fotos + GPS coinciden con propiedad existente:

❌ BLOQUEADO

"Esta propiedad ya existe en Simón

Publicada por: Juan Pérez (Century21)
Código: SIM-7K2M9

Si crees que es error: brokers@simon.bo"
```

**Entregables**:
- Pagina `/broker/nueva-propiedad`
- API de scraping para C21/Remax/Bien Inmuebles
- API de upload de fotos con hash
- Detector de watermarks
- Validador de calidad con feedback visual

---

### FASE 3: Dashboard Broker (Semana 3-4)

**Objetivo**: Panel de control para gestionar propiedades, leads y contenido profesional.

| Tarea | Descripcion | Prioridad |
|-------|-------------|-----------|
| 3.1 | Vista "Mis Propiedades" - lista con estado y score | Alta |
| 3.2 | Editar/Pausar/Eliminar propiedades | Alta |
| 3.3 | **PDF Auto-Generado** por propiedad (al publicar) | Alta |
| 3.4 | **Tracker visual de CMAs** - barra de progreso 3/5 | Alta |
| 3.5 | Vista "Mis Creditos CMA" - contador + historial | Media |
| 3.6 | Vista "Mis Leads" - contactos recibidos | Media |
| 3.7 | Estadisticas basicas (contactos) | Baja |
| 3.8 | Notificaciones (nuevo lead, propiedad aprobada, CMA ganado) | Baja |

**PDF Auto-Generado por Propiedad**:
```
Al publicar, se genera automaticamente:
┌─────────────────────────────────────┐
│  [Foto Principal]                   │
│                                     │
│  $127,000 USD                       │
│  Vienna - Equipetrol Norte          │
├─────────────────────────────────────┤
│  • 85 m²  • 2 dormitorios  • 2 baños│
│  • Piscina  • Gym  • Seguridad 24h  │
│  • Parqueo incluido                 │
├─────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐   │
│  │ 📷  │ │ 📷  │ │ 📷  │ │ 📷  │   │
│  └─────┘ └─────┘ └─────┘ └─────┘   │
├─────────────────────────────────────┤
│  [QR CODE]  Ver mas: simon.bo/p/7K2M9│
├─────────────────────────────────────┤
│  Juan Perez | Century21 | 76543210  │
│  Ref: #SIM-7K2M9 | Powered by Simón │
└─────────────────────────────────────┘
```

**Valor para el broker**:
- Ahorra 15-30 min por propiedad
- Luce profesional ante clientes
- Facil de compartir por WhatsApp

**Tracker Visual de CMAs**:
```
┌─────────────────────────────────────┐
│ 🎯 TUS CMAs GRATIS                  │
│                                     │
│ Propiedades 100pts: 3/5             │
│ [██████░░░░] 60%                    │
│                                     │
│ CMAs disponibles: 1 💎              │
│                                     │
│ "Sube 2 propiedades mas → +1 CMA"   │
└─────────────────────────────────────┘
```

**Entregables**:
- Pagina `/broker/dashboard`
- Pagina `/broker/propiedades`
- Pagina `/broker/leads`
- Pagina `/broker/cma`
- API de generacion de PDF
- Componente tracker de CMAs

---

### FASE 4: Incentivos y Gamificacion (Semana 4-5)

**Objetivo**: Sistema de recompensas para motivar calidad.

| Tarea | Descripcion | Prioridad |
|-------|-------------|-----------|
| 4.1 | Logica "5 props perfectas = 1 CMA gratis" | Alta |
| 4.2 | Notificaciones email (ganaste CMA, etc) | Alta |
| 4.3 | Badge "Founding Broker" para primeros 100 | Media |
| 4.4 | Leaderboard de brokers (opcional) | Baja |
| 4.5 | Programa de referidos broker-broker | Baja |

**Entregables**:
- Sistema automatico de creditos CMA
- Templates de email
- Badges visuales en perfil

---

## Sistema de Codigos Unicos

### Formato: `SIM-XXXXX`

Cada propiedad recibe un codigo unico al publicarse:
- `SIM-7K2M9` (5 caracteres alfanumericos)
- Facil de comunicar por telefono/WhatsApp
- Permite buscar propiedad especifica
- Tracking de origen de leads

### Generacion
```
SIM- + [A-Z0-9]{5}
Excluir caracteres confusos: 0/O, 1/I/L
Verificar unicidad antes de asignar
```

### Uso
- Comprador puede buscar: "SIM-7K2M9" en Simon
- Broker puede compartir: "Mira esta propiedad: SIM-7K2M9"
- Leads trackean origen: "Vi SIM-7K2M9 en tu informe"

---

## Sistema de Calidad (100 puntos)

### Distribucion de Puntos

| Categoria | Puntos | Detalle |
|-----------|--------|---------|
| **Datos Basicos** | 20 pts | Precio, area, dorms, banos, zona |
| **Ubicacion** | 15 pts | GPS preciso + direccion verificable |
| **Fotos** | 20 pts | Minimo 8 fotos de calidad |
| **Amenidades/Equipamiento** | 15 pts | Edificio + unidad completos |
| **Financiero** | 15 pts | Expensas, parqueo, costos extras |
| **Documentacion** | 15 pts | Planos, fecha entrega, estado legal |
| **TOTAL** | **100 pts** | |

### Umbrales

| Score | Estado | Accion |
|-------|--------|--------|
| 100 pts | Perfecta | Cuenta para incentivo CMA |
| 80-99 pts | Publicada | Visible pero sin incentivo |
| 60-79 pts | Borrador | No visible, necesita completar |
| < 60 pts | Rechazada | Muy incompleta |

---

## Sistema de Incentivos

### Regla Base
- **5 propiedades con calidad perfecta (100 pts) = 1 CMA gratis**
- Valor del CMA: $49.99 USD
- Aplica a TODOS los brokers

### Founding Brokers (primeros 100)
- 2-5 CMAs de bienvenida (segun tier)
- Badge "Founding Broker" permanente
- Prioridad en busquedas (3 meses)

---

## Integracion con Sistema Actual

### Lo que se REUTILIZA de `/pro`:
- `PropertyForm.tsx` - Base del formulario de carga
- `BrokerResults.tsx` - Generador de CMA
- `buscarUnidadesReales()` - Busqueda de propiedades
- API `contactar-broker` - Lead routing

### Lo que se CREA nuevo:
- Autenticacion de brokers
- Dashboard broker
- Sistema de creditos CMA
- Validador de calidad
- Hash de fotos anti-duplicados

### Tablas nuevas en Supabase:
- `brokers` - Perfil y creditos
- `propiedades_broker` - Sus listings
- `broker_leads` - Contactos recibidos
- `broker_cma_historial` - CMAs generados

---

## Documentos Relacionados

| Documento | Proposito | Estado |
|-----------|-----------|--------|
| [CAMPOS_PROPIEDAD.md](./CAMPOS_PROPIEDAD.md) | Todos los campos detallados por categoria | Pendiente |
| [UX_FORMULARIO.md](./UX_FORMULARIO.md) | Flujo de carga paso a paso | Pendiente |
| [SCHEMA_BD.md](./SCHEMA_BD.md) | Tablas y relaciones en Supabase | Pendiente |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigacion |
|--------|--------------|---------|------------|
| Brokers no quieren llenar campos | Alta | Alto | UX excelente + autocompletado + incentivos |
| Fotos duplicadas/robadas | Media | Alto | Hash de imagenes + verificacion |
| Datos falsos | Media | Alto | Verificacion OTP propietario (Fase 5) |
| Pocos brokers early adopters | Media | Medio | Programa Founding Broker agresivo |

---

## Metricas de Exito

### Fase 1-2 (MVP)
- [ ] 20 brokers registrados
- [ ] 50 propiedades cargadas
- [ ] 80% con score >= 80 pts

### Fase 3-4 (Crecimiento)
- [ ] 100 brokers activos
- [ ] 300 propiedades con calidad perfecta
- [ ] 50 CMAs generados/mes
- [ ] 10 cierres trackados

### Metricas de Adopcion
| Metrica | Target | Como medir |
|---------|--------|------------|
| Brokers activos/semana | 40% | Login + accion en ultimos 7 dias |
| Props por broker | 5+ | Promedio propiedades publicadas |
| Retencion mensual | 70% | Brokers que vuelven cada mes |

### Metricas de Engagement
| Metrica | Target | Como medir |
|---------|--------|------------|
| Props con 100pts | 60% | score_calidad = 100 |
| CMAs generados/mes | 50+ | broker_cma_uso |
| PDFs descargados/mes | 200+ | propiedad_pdfs.descargas |
| Import por link vs manual | 80/20 | fuente_origen |

### Metricas de Impacto
| Metrica | Target | Como medir |
|---------|--------|------------|
| Conversion lead→contacto | 30% | broker_leads.estado |
| Props 100pts venden mas rapido | Si | fecha_venta - fecha_publicacion |
| NPS brokers | 50+ | Encuesta trimestral |

---

## Timeline Visual

```
Semana 1-2: [====== FASE 1: Fundamentos ======]
Semana 2-3:        [====== FASE 2: Upload ======]
Semana 3-4:               [====== FASE 3: Dashboard ======]
Semana 4-5:                      [====== FASE 4: Incentivos ======]
```

---

## Estado del Documento

| Version | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 0.1 | 2026-01-23 | Claude + Luis | Borrador inicial con 4 fases |
| 0.2 | 2026-01-23 | Claude + Luis | Politica fuentes curadas, import por link, PDF auto-generado, metricas detalladas |

---

## PENDIENTE APROBACION

Antes de implementar, revisar y aprobar:
1. [ ] Plan general de 4 fases
2. [ ] Campos de propiedad (documento separado)
3. [ ] UX del formulario (documento separado)
4. [ ] Schema de BD (documento separado)

**NO SE TOCARA CODIGO EXISTENTE HASTA APROBAR ESTE PLAN**
