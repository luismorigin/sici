# Broker System - Roadmap Refinado

> **Basado en:** BROKER_HANDOFF_ORIGINAL.md + Criterios del usuario (30 Ene 2026)
> **Propósito:** Guía de implementación incremental sin romper lo existente

---

## Principios Rectores

1. **NO complicar** el sistema actual - Cambios incrementales
2. **Mantener equivalencia** entre estados de ambas tablas
3. **Preparar para merge futuro** sin forzarlo ahora
4. **Pulir antes de implementar** - Documentar specs completas primero

---

## FASE 1: Estados y Fundamentos

### Objetivo
Pulir estados de `propiedades_broker` sin dañar `propiedades_v2`

### Estado Actual
```sql
-- propiedades_broker.estado (ENUM actual)
'borrador'      -- Creada, no publicada
'en_revision'   -- Pendiente aprobación (no usado)
'publicada'     -- Visible en búsquedas
'pausada'       -- Oculta temporalmente
'vendida'       -- Transacción completada
'rechazada'     -- Admin rechazó
```

### Objetivo (Agregar)
```sql
-- Nuevos estados propuestos
'corregida_broker'   -- Broker editó datos (tracking)
'publicada_broker'   -- Distinguir de scrapeada (alias semántico)
'eliminada_broker'   -- Broker borró (soft delete)
```

### Decisiones Clave
- `corregida_broker` NO es estado, es flag en `historial_cambios`
- `publicada` ya existe y funciona - no cambiar
- `vendida` ≈ `inactivo_confirmed` de propiedades_v2
- Mantener tablas separadas por ahora

### Tabla de Equivalencias

| propiedades_v2 | propiedades_broker | Significado |
|----------------|-------------------|-------------|
| `completado` | `publicada` | Visible en búsquedas |
| `inactivo_pending` | `pausada` | Temporalmente oculta |
| `inactivo_confirmed` | `vendida` | Transacción cerrada |
| - | `borrador` | Solo broker, no publicada |
| - | `rechazada` | Admin rechazó |
| `excluido_operacion` | - | Solo scraping (alquiler) |

### Riesgos
- Agregar estados puede romper queries existentes
- Cambiar ENUM requiere migración cuidadosa

### Dependencias
- Ninguna

### Entregable
- `BROKER_ESTADOS_SPEC.md` con mapeo completo
- Migración SQL si se agregan estados

---

## FASE 1.5: Herencia de Datos de Proyecto

### Objetivo
Cuando broker escribe nombre de edificio/proyecto, mostrar autocomplete y permitir "jalar" datos verificados de `proyectos_master`.

### Valor
- Broker sube propiedades con mejor información
- Datos consistentes con el censo
- Menos errores de tipeo en nombres de proyectos
- GPS verificado desde el inicio
- Prepara terreno para sincronización futura

### Flujo Propuesto

```
1. Broker escribe "Santa" en campo proyecto_nombre
2. Sistema muestra dropdown con sugerencias:
   ├── SANTORINI VENTURA (Equipetrol Norte) ⭐ Verificado
   ├── SANTA CRUZ TOWERS (Equipetrol)
   └── SANTA MARIA RESIDENCE (Sirari)
3. Broker selecciona "SANTORINI VENTURA"
4. Sistema pre-llena automáticamente:
   ├── Estado construcción: "entrega_inmediata"
   ├── Fecha entrega: null (ya entregado)
   ├── GPS: -17.7634, -63.1856 ✓
   └── Amenidades edificio: [Piscina, Gimnasio, Seguridad 24/7, ...]
5. Broker puede modificar datos de SU unidad
```

### Datos a Heredar de proyectos_master

| Campo PM | Campo Broker | Editable |
|----------|--------------|----------|
| `nombre_oficial` | `proyecto_nombre` | NO (vinculado) |
| `estado_construccion` | `estado_construccion` | SÍ (puede diferir) |
| `fecha_entrega_estimada` | `fecha_entrega` | SÍ |
| `latitud` | `latitud` | SÍ (ajustar pin) |
| `longitud` | `longitud` | SÍ (ajustar pin) |
| `amenidades_edificio` | `amenidades.lista` (merge) | SÍ (agregar más) |
| `desarrollador` | `desarrollador` | NO |
| `id_proyecto_master` | `id_proyecto_master` | NO (FK) |

### Implementación Técnica

#### 1. Endpoint de Búsqueda
```typescript
// /api/broker/buscar-proyectos.ts
GET /api/broker/buscar-proyectos?q=santa&limit=5

Response: [
  {
    id_proyecto_master: 45,
    nombre_oficial: "SANTORINI VENTURA",
    desarrollador: "Grupo Santorini",
    zona: "Equipetrol Norte",
    estado_construccion: "entrega_inmediata",
    fecha_entrega_estimada: null,
    latitud: -17.7634,
    longitud: -63.1856,
    amenidades_edificio: ["Piscina", "Gimnasio", "Seguridad 24/7"],
    total_unidades: 18,
    verificado: true
  }
]
```

#### 2. Componente Autocomplete
```typescript
// components/broker/ProyectoAutocomplete.tsx
<ProyectoAutocomplete
  value={formData.proyecto_nombre}
  onSelect={(proyecto) => {
    setFormData({
      ...formData,
      proyecto_nombre: proyecto.nombre_oficial,
      id_proyecto_master: proyecto.id_proyecto_master,
      desarrollador: proyecto.desarrollador,
      estado_construccion: proyecto.estado_construccion,
      fecha_entrega: proyecto.fecha_entrega_estimada,
      latitud: proyecto.latitud,
      longitud: proyecto.longitud,
      // Merge amenidades (edificio + las que broker agregue)
      amenidades_heredadas: proyecto.amenidades_edificio
    })
  }}
  onManualEntry={(nombre) => {
    // Broker escribe proyecto que no existe en PM
    setFormData({
      ...formData,
      proyecto_nombre: nombre,
      id_proyecto_master: null  // Sin vincular
    })
  }}
/>
```

#### 3. Modificar nueva-propiedad.tsx

**Paso 1 - Cambiar input de proyecto:**
```diff
- <input
-   name="proyecto_nombre"
-   value={formData.proyecto_nombre}
-   onChange={handleChange}
- />
+ <ProyectoAutocomplete
+   value={formData.proyecto_nombre}
+   onSelect={handleProyectoSelect}
+   onManualEntry={handleManualProyecto}
+ />
```

**Mostrar badge si está vinculado:**
```tsx
{formData.id_proyecto_master && (
  <span className="text-green-600 text-sm">
    ✓ Vinculado a proyecto verificado
  </span>
)}
```

### UI/UX Consideraciones

1. **Autocomplete con debounce** (300ms)
2. **Mostrar info del proyecto** al seleccionar (zona, desarrollador, unidades)
3. **Permitir entrada manual** si proyecto no existe
4. **Badge "Datos heredados"** en campos pre-llenados
5. **Broker puede editar** datos heredados (su unidad puede diferir)
6. **Guardar `id_proyecto_master`** como FK para tracking

### Beneficios para Score de Calidad

| Dato Heredado | Puntos que Aporta |
|---------------|-------------------|
| GPS verificado | +10 pts (precisión) |
| Amenidades edificio | +4 pts (campo completo) |
| Estado construcción | +4 pts (campo completo) |
| Desarrollador | Consistencia de datos |

**Resultado:** Broker que vincula proyecto empieza con +18 pts de ventaja

### Casos Edge

1. **Proyecto no existe en PM:**
   - Broker escribe manualmente
   - `id_proyecto_master = NULL`
   - No hereda datos
   - Posible flag para admin: "Nuevo proyecto detectado"

2. **Broker modifica GPS heredado:**
   - Se guarda su versión
   - Campo `gps_fuente = 'broker'` vs `'proyecto_master'`
   - No afecta al proyecto_master original

3. **Proyecto tiene múltiples nombres:**
   - Búsqueda fuzzy con `pg_trgm` (ya implementado)
   - Mostrar aliases si existen

### Dependencias
- `proyectos_master` con datos completos (✅ 187 activos)
- `buscar_proyecto_fuzzy()` (✅ migración 022)
- Ninguna dependencia de otras fases

### Riesgos
- Broker podría vincular a proyecto incorrecto
- Mitigación: Mostrar info clara antes de confirmar

### Entregables
- `BROKER_HERENCIA_PROYECTO_SPEC.md`
- `/api/broker/buscar-proyectos.ts`
- `components/broker/ProyectoAutocomplete.tsx`
- Modificar `nueva-propiedad.tsx` y `editar/[id].tsx`

---

## FASE 2: Sistema de Calidad (100 pts)

### Objetivo
Implementar score_calidad completo basado en handoff

### Estado Actual
```typescript
// fotos/[id].tsx línea ~200
score = Math.min(100, fotos.length * 10 + 20)
```
Solo cuenta fotos, ignora otros campos.

### Objetivo (Handoff adaptado)

| Categoría | Puntos | Criterios |
|-----------|--------|-----------|
| **Fotos** | 30 pts | 8+ fotos = 30, 5-7 = 20, <5 = 10 |
| **Data Completa** | 40 pts | 10 campos obligatorios (4 pts c/u) |
| **Fotos Únicas** | 20 pts | Sin duplicados (hash) |
| **GPS Preciso** | 10 pts | lat/lng con precisión < 100m |

### Campos Obligatorios (10 × 4 pts = 40)
1. `precio_usd` - Precio
2. `area_m2` - Superficie
3. `dormitorios` - Habitaciones
4. `banos` - Baños
5. `zona` - Ubicación
6. `proyecto_nombre` - Edificio/Proyecto
7. `amenidades.lista` - Al menos 3 amenities
8. `cantidad_parqueos` OR `parqueo_incluido` - Parking definido
9. `expensas_usd` - Expensas mensuales
10. `estado_construccion` - Estado entrega

### Decisiones Clave
- Calcular score en backend (trigger o función)
- Mostrar desglose en UI (ScoreBreakdown.tsx)
- `es_calidad_perfecta = (score >= 100)`
- **Pulir antes de implementar** - Revisar si 10 campos son los correctos

### Riesgos
- Cambiar cálculo puede bajar scores existentes
- Brokers podrían quejarse si bajan de 100

### Dependencias
- Fase 1 (estados claros)

### Entregables
- `BROKER_CALIDAD_SPEC.md` con desglose final
- Función SQL `calcular_score_broker(propiedad_id)`
- Componente `ScoreBreakdown.tsx`

---

## FASE 3: Generadores (Core Value)

### 3A: PDF Auto-generado

#### Estado Actual
- Tabla `propiedad_pdfs` existe (migración 072)
- Campos: url, qr_url, short_link, descargas
- **No hay API de generación**

#### Código Existente Relacionado
```
/api/informe.ts - Genera HTML completo (36k tokens)
├── 9 secciones + mapa
├── Interface Propiedad, DatosUsuario, Analisis
└── Potencial: Agregar conversión HTML→PDF
```

#### Objetivo
```
POST /api/broker/generate-pdf
Body: { propiedad_id: number }
Response: { pdf_url: string, qr_url: string }
```

#### Opciones de Implementación
| Opción | Pros | Contras |
|--------|------|---------|
| Puppeteer | HTML→PDF server-side, alta calidad | Peso, cold start |
| react-pdf | Render directo React | Requiere reescribir template |
| jsPDF | Client-side, liviano | Menos control de layout |
| **Recomendado: Puppeteer** | Reutiliza informe.ts | - |

#### Contenido del PDF
- Foto principal
- Precio ($XXX,XXX USD)
- Ubicación (Proyecto - Zona)
- Specs (85 m², 2 dorms, 2 baños)
- Amenities (Piscina, Gym, etc.)
- Galería de fotos
- QR code (simon.bo/p/SIM-XXXXX)
- Contacto broker
- Código referencia

### 3B: Sistema CMA

#### Estado Actual
- Tabla `broker_cma_uso` existe
- Columna `cma_creditos` en brokers
- **No hay generador**

#### Objetivo
```
POST /api/broker/generate-cma
Body: { propiedad_id: number, usar_credito: boolean }
Response: { cma_url: string, creditos_restantes: number }
```

#### Contenido del CMA
1. Propiedad analizada (datos completos)
2. Comparables (5-10 propiedades similares)
   - Mismo dormitorios ± 1
   - Misma zona
   - Precio ± 30%
3. Análisis de mercado
   - Precio promedio zona
   - Precio/m² promedio
   - Días en mercado promedio
4. Precio sugerido
   - Rango: $XX,XXX - $YY,YYY
   - Basado en comparables
5. Recomendaciones
   - Si está caro/barato vs mercado
   - Sugerencias de mejora

#### Sistema de Créditos
```
5 propiedades con score=100 → 1 CMA gratis
CMA pagado → $49.99 (Stripe)
```

#### Decisiones Clave
- Usar `buscar_unidades_reales()` para comparables
- **Por ahora solo propiedades_v2** como comparables
- CMA gratis: Validar 5 props con score=100 del mismo broker

### Riesgos
- Puppeteer en Vercel tiene límites (10s timeout)
- Stripe requiere configuración

### Dependencias
- Fase 2 (score_calidad para incentivo CMA)

### Entregables
- `BROKER_PDF_SPEC.md`
- `BROKER_CMA_SPEC.md`
- `/api/broker/generate-pdf.ts`
- `/api/broker/generate-cma.ts`

---

## FASE 4: Anti-duplicados

### Estado Actual en propiedades_v2
```sql
-- Columna existente
duplicado_de INTEGER REFERENCES propiedades_v2(id)

-- 36 duplicados marcados manualmente
-- Excluidos en buscar_unidades_reales()
WHERE duplicado_de IS NULL
```

### Objetivo para propiedades_broker
1. Agregar columna `duplicado_de`
2. Copiar lógica de exclusión
3. Hash de fotos para detección

### Implementación
```sql
-- Migración
ALTER TABLE propiedades_broker
ADD COLUMN duplicado_de INTEGER REFERENCES propiedades_broker(id);

-- Función de detección (por hash fotos)
CREATE FUNCTION detectar_duplicado_broker(nueva_prop_id INTEGER)
RETURNS INTEGER AS $$
  -- Buscar props con fotos_hash similares
  -- Retorna ID del original si hay match
$$;
```

### Geo-matching: POSPUESTO

#### Problema Identificado
> "Geo-matching es complejo porque puede ser el mismo edificio con dos propiedades diferentes"

**Mismo edificio ≠ Duplicado**
- Depto 5A y Depto 8B son diferentes
- Mismo GPS, diferentes propiedades

#### Solución Futura
- Geo-matching solo como **flag de revisión**
- No auto-marcar como duplicado
- Mostrar alerta: "Posible duplicado - verificar"

### Decisiones Clave
- Copiar sistema de propiedades_v2
- Solo hash de fotos para detección automática
- Geo-matching requiere análisis profundo - **posponer**

### Riesgos
- Falsos positivos en detección

### Dependencias
- Ninguna (puede hacerse en paralelo)

### Entregables
- `BROKER_DUPLICADOS_SPEC.md`
- Migración SQL
- Función de detección

---

## FASE 5: Protocolo de Baja (48 horas)

### Estado Actual
```
propiedades_v2: 7 días → inactivo_confirmed (Flujo C)
propiedades_broker: No hay protocolo de baja
```

### Objetivo (Handoff)
| Hora | Acción |
|------|--------|
| 0 | Detectar ausencia → `pending_removal` → Email 1 |
| 36 | Email recordatorio |
| 48 | Si no responde → `delisted` |

### BLOQUEADO: Tablas Separadas

#### Problema
> "Si se da de baja de propiedades_v2 se debe avisar al broker. Al inicio como no están juntas las tablas esto no se podrá implementar."

**Sin merge, no hay conexión entre:**
- Propiedad scrapeada que desaparece
- Broker que la verificó

#### Solución Temporal
- Documentar protocolo completo
- Implementar para propiedades_broker standalone
- Preparar para cuando haya merge

### Lo que SÍ se puede implementar ahora
1. Estado `pending_removal` en propiedades_broker
2. Cron job para auto-delist después de 48h
3. **No implementar:** Notificación cuando prop_v2 desaparece

### Dependencias
- FASE 7 (Sincronización) para implementación completa

### Entregables
- Diseño documentado del protocolo
- Migración parcial (estados)
- **Full implementation: POST-MERGE**

---

## FASE 6: Verificación Mejorada

### Estado Actual
```
1. Pre-registro por teléfono → Verificación automática
2. Registro nuevo → Verificación manual por admin
3. estado_verificacion: 'pendiente' | 'verificado' | 'rechazado'
```

### Objetivo Futuro (Handoff)
```
1. Broker pega link de Century21/Remax/Bien Inmuebles
2. Sistema verifica que el link es válido
3. Sistema scrapea datos y pre-llena formulario
4. Verificación automática por link
```

### Decisión
> "Mantener actual pero con plan para hacer lo del handoff"

### Plan de Transición
1. **Ahora:** Mantener teléfono + manual (funciona)
2. **Futuro:** Agregar opción "Verificar con link"
3. **Criterio:** Si broker tiene link válido de C21/Remax → auto-verificar

### Inmobiliarias Permitidas (Handoff)
| Nombre | Dominios |
|--------|----------|
| Century21 | century21.com.bo, c21.com.bo |
| Remax | remax.com.bo, remax.bo |
| Bien Inmuebles | bieninmuebles.com |

### Decisiones Clave
- No restringir todavía
- Agregar campo `inmobiliaria_verificada` para tracking
- Preparar scraper para links

### Dependencias
- Scraper de C21/Remax (ya existe en n8n)

### Entregables
- Campo `inmobiliaria_verificada` en brokers
- Documentación del plan futuro

---

## FASE 7: Sincronización (Final)

### Estado Actual
```
propiedades_v2 ← Flujo nocturno (Discovery → Enrichment → Merge)
propiedades_broker ← Broker uploads (independiente)

SIN CONEXIÓN ENTRE TABLAS
```

### Objetivo Futuro
```
Broker puede "reclamar" propiedad scrapeada
├── Crear link: propiedades_broker.scrapeada_vinculada → propiedades_v2.id
├── Broker edita → Cambios se guardan en propiedades_broker
├── Re-scraping respeta ediciones verificadas
└── Si scrapeada desaparece → Notificar broker
```

### Decisión
> "La sincronización se hará después cuando todo lo anterior esté listo"

### Prerequisitos
1. ✅ Estados equivalentes (FASE 1)
2. ✅ Herencia datos proyecto (FASE 1.5) - Ya vincula a proyectos_master
3. ✅ Score calidad (FASE 2)
4. ✅ PDF/CMA funcionando (FASE 3)
5. ✅ Anti-duplicados (FASE 4)
6. ⏳ Protocolo de baja listo (FASE 5)
7. ⏳ Verificación por link (FASE 6)

### Opciones de Merge

#### Opción A: Una Tabla
```sql
-- Migrar propiedades_broker → propiedades_v2
ALTER TABLE propiedades_v2 ADD COLUMN broker_id UUID;
ALTER TABLE propiedades_v2 ADD COLUMN verified_at TIMESTAMP;
```
**Riesgo:** Migración compleja, posible corrupción

#### Opción B: Dos Tablas con Link
```sql
-- Mantener separadas pero vinculadas
ALTER TABLE propiedades_broker
ADD COLUMN scrapeada_vinculada INTEGER REFERENCES propiedades_v2(id);
```
**Recomendado:** Menos riesgo, más flexible

### Entregables (Futuro)
- Diseño de arquitectura de merge
- Migración de vinculación
- Lógica de sincronización en merge nocturno

---

## Resumen de Prioridades

| Fase | Nombre | Prioridad | Bloqueado por |
|------|--------|-----------|---------------|
| 1 | Estados | ALTA | - |
| **1.5** | **Herencia Datos Proyecto** | **ALTA** | - |
| 2 | Calidad 100pts | ALTA | Fase 1 |
| 3 | PDF/CMA | ALTA | Fase 2 |
| 4 | Anti-duplicados | MEDIA | - |
| 5 | Protocolo Baja | BAJA | Fase 7 |
| 6 | Verificación Link | BAJA | - |
| 7 | Sincronización | FUTURA | Fases 1-6 |

**Nota:** FASE 1.5 puede implementarse en paralelo con FASE 1, no tiene dependencias.

---

## Archivos de Spec Pendientes

| Archivo | Estado | Prioridad |
|---------|--------|-----------|
| `BROKER_ESTADOS_SPEC.md` | Por crear | Alta |
| `BROKER_HERENCIA_PROYECTO_SPEC.md` | Por crear | Alta |
| `BROKER_CALIDAD_SPEC.md` | Por crear | Alta |
| `BROKER_PDF_SPEC.md` | Por crear | Alta |
| `BROKER_CMA_SPEC.md` | Por crear | Alta |
| `BROKER_DUPLICADOS_SPEC.md` | Por crear | Media |

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2026-01-31 | Agregada FASE 1.5: Herencia de Datos de Proyecto (autocomplete + jalar amenidades/GPS) |
| 2026-01-30 | Documento inicial basado en handoff + criterios usuario |
