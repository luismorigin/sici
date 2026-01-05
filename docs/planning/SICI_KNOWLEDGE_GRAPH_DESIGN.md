# SICI Knowledge Graph - Design Doc
## Sistema Inteligente de Clasificación Inmobiliaria

**Fecha:** 5 Enero 2026  
**Status:** Propuesta  
**Autores:** Luis / Claude  

---

## 1. VISIÓN

Construir un **Knowledge Graph inmobiliario** para Santa Cruz de la Sierra que permita:

1. **Hoy:** Simón (chatbot) matchea clientes con propiedades por amenities, equipamiento, precio, ubicación
2. **Mañana:** API para brokers, webapp de búsqueda pública, alertas automáticas
3. **Futuro:** Valuaciones por comparables, analytics de mercado, predicción de precios

> **Principio:** La data enriquecida es el producto. Los consumidores (Simón, API, webapp) son interfaces sobre la misma plataforma.

---

## 2. CONTEXTO Y PROBLEMA

### 2.1 Estado Actual
```
Propiedades activas:        350
Proyectos activos:          190  
Match rate:                 96.6%
Propiedades multiproyecto:  68 (listings genéricos)
Proyectos SIN unidad real:  5
```

### 2.2 Problema de Datos
Las descripciones de Remax/Century21 contienen información rica que NO estamos extrayendo:

```
"Exclusivo edificio de 68 departamentos... 7 plantas... 
diseñado por SOMMET... Piscina de 11 m2, jacuzzi, 
2 Churrasqueras, pet shower... Aires acondicionados 
con wifi, chapa Smart..."
```

**Datos en texto sin estructurar:**
- Amenities: piscina, jacuzzi, churrasqueras, pet shower
- Equipamiento: AC wifi, chapa smart, domótica
- Estructura: 68 unidades, 7 pisos
- Desarrollador: SOMMET

### 2.3 Problema de Accionabilidad

| Tipo | Datos | Asesor | Acción Usuario |
|------|-------|--------|----------------|
| **Unidad Real** | Específicos (piso 8, 85m², $145k) | 1 asesor → WSP directo | 1 click |
| **Unidad Virtual** | Rangos (desde 45m², desde $55k) | N asesores → ambiguo | Requiere drill-down |

**Insight UX:** No mezclar reales y virtuales. Son entidades diferentes con acciones diferentes.

---

## 3. PRINCIPIOS DE DISEÑO

### 3.1 Data as a Platform
La data enriquecida es el activo. Simón, APIs, webapps son consumidores.

### 3.2 Query Flexibility  
JSONB + índices GIN permiten queries ad-hoc sin migrar schema.

### 3.3 Separation of Concerns
- **Enrichment Pipeline:** Cómo entra y se enriquece la data
- **Query Layer:** Cómo se consulta la data
- **Consumer Layer:** Quién consume (Simón, API, etc.)

### 3.4 Confidence Tracking
Cada dato tiene metadata: fuente, fecha, score de confianza.

### 3.5 Progressive Enhancement
Funciona con data parcial. Más data = mejores resultados, no requisito.

---

## 4. ARQUITECTURA

```
┌─────────────────────────────────────────────────────────────┐
│                    CONSUMER LAYER                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │  Simón  │  │   API   │  │ Webapp  │  │ Alertas │        │
│  │(chatbot)│  │  (REST) │  │(búsqueda│  │ (async) │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│       │            │            │            │              │
└───────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                     QUERY LAYER                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              FUNCIONES SQL                          │   │
│  │  • buscar_unidades_reales(filtros)     → Nivel 1    │   │
│  │  • buscar_proyectos_compatibles(filtros)→ Nivel 2   │   │
│  │  • obtener_listings_proyecto(id)       → Drill-down │   │
│  │  • calcular_score_calidad(propiedad)   → Ranking    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              VIEWS MATERIALIZADAS                   │   │
│  │  • v_proyectos_con_tipologias                       │   │
│  │  • v_unidades_buscables                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    STORAGE LAYER                            │
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │   proyectos_master  │    │    propiedades_v2   │        │
│  │   (enriched)        │    │                     │        │
│  │                     │    │                     │        │
│  │ • amenities JSONB   │◄───│ • id_proyecto_master│        │
│  │ • equipamiento JSONB│    │ • datos_json        │        │
│  │ • tipologias JSONB  │    │ • es_multiproyecto  │        │
│  │ • estructura JSONB  │    │ • asesor (en JSON)  │        │
│  │ • metadata JSONB    │    │                     │        │
│  │                     │    │                     │        │
│  │ [GIN indexes]       │    │                     │        │
│  └─────────────────────┘    └─────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌─────────────────────────────────────────────────────────────┐
│                  ENRICHMENT PIPELINE                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Consolidación│  │  Extracción  │  │  Validación  │      │
│  │  Automática  │  │     IA       │  │   Humana     │      │
│  │              │  │              │  │              │      │
│  │ Agrega datos │  │ Claude API   │  │ Google Sheet │      │
│  │ de props a   │  │ extrae de    │  │ para revisar │      │
│  │ proyecto     │  │ descripciones│  │ confianza<0.8│      │
│  │              │  │              │  │              │      │
│  │ Costo: $0    │  │ Costo: ~$5   │  │ Costo: tiempo│      │
│  │ Frecuencia:  │  │ Frecuencia:  │  │ Frecuencia:  │      │
│  │ cada scrape  │  │ batch/manual │  │ on-demand    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. SCHEMA DE DATOS

### 5.1 Nuevos campos en proyectos_master

```sql
ALTER TABLE proyectos_master ADD COLUMN IF NOT EXISTS

  -- ESTRUCTURA DEL EDIFICIO
  estructura JSONB DEFAULT '{}',
  -- {
  --   "total_unidades": 68,
  --   "pisos_residenciales": 7,
  --   "unidades_por_piso": 10,
  --   "pisos_amenities": [8],
  --   "año_construccion": 2025
  -- }
  
  -- ESTADO COMERCIAL
  estado_comercial JSONB DEFAULT '{}',
  -- {
  --   "etapa": "preventa|construccion|entregado",
  --   "fecha_entrega": "2025-12",
  --   "porcentaje_vendido": 70
  -- }
  
  -- AMENITIES DEL EDIFICIO
  amenities JSONB DEFAULT '{}',
  -- {
  --   "piscina": {"existe": true, "tipo": "infinita", "tamaño_m2": 11},
  --   "gimnasio": {"existe": true, "equipado": true},
  --   "churrasquera": {"existe": true, "cantidad": 2},
  --   "cowork": true,
  --   "pet_friendly": true,
  --   "salon_eventos": true,
  --   "sauna": true,
  --   "jacuzzi": true
  -- }
  
  -- EQUIPAMIENTO ESTÁNDAR EN CADA DEPTO
  equipamiento_estandar JSONB DEFAULT '{}',
  -- {
  --   "aire_acondicionado": {"tipo": "inverter", "wifi": true},
  --   "chapa_smart": true,
  --   "domotica": {"nivel": "full", "incluye": ["luces", "cortinas", "alexa"]},
  --   "cocina": {"encimera": true, "horno": true, "campana": true},
  --   "muebles_cocina": true,
  --   "closets": true
  -- }
  
  -- ACABADOS Y MATERIALES
  acabados JSONB DEFAULT '{}',
  -- {
  --   "pisos": "porcelanato gran formato",
  --   "mesones": "cuarzo",
  --   "griferia": "cromada importada",
  --   "vidrios": "termoacusticos"
  -- }
  
  -- SEGURIDAD DEL EDIFICIO
  seguridad JSONB DEFAULT '{}',
  -- {
  --   "sismo_resistente": true,
  --   "contra_incendios": true,
  --   "camaras": true,
  --   "acceso_biometrico": true,
  --   "citofono_video": true
  -- }
  
  -- TIPOLOGÍAS DISPONIBLES
  tipologias JSONB DEFAULT '[]',
  -- [
  --   {"dormitorios": 0, "nombre": "Monoambiente", "area_desde": 35, "area_hasta": 42, "precio_desde": 45000},
  --   {"dormitorios": 1, "nombre": "1 Dormitorio", "area_desde": 45, "area_hasta": 60, "precio_desde": 65000},
  --   {"dormitorios": 2, "nombre": "2 Dormitorios", "area_desde": 75, "area_hasta": 95, "precio_desde": 95000}
  -- ]
  
  -- METADATA DE ENRIQUECIMIENTO
  enriquecimiento JSONB DEFAULT '{}',
  -- {
  --   "fecha": "2026-01-05T10:30:00Z",
  --   "fuentes": ["consolidacion_propiedades", "extraccion_ia"],
  --   "confianza_global": 0.85,
  --   "campos_extraidos": ["amenities", "equipamiento", "tipologias"],
  --   "requiere_validacion": false
  -- }
```

### 5.2 Índices para Query Performance

```sql
-- Búsqueda por amenities específicos
CREATE INDEX idx_proyectos_amenities ON proyectos_master 
  USING GIN (amenities jsonb_path_ops);

-- Búsqueda por equipamiento
CREATE INDEX idx_proyectos_equipamiento ON proyectos_master 
  USING GIN (equipamiento_estandar jsonb_path_ops);

-- Búsqueda por tipologías (para encontrar proyectos con N dormitorios)
CREATE INDEX idx_proyectos_tipologias ON proyectos_master 
  USING GIN (tipologias jsonb_path_ops);

-- Combo: proyectos activos con amenities
CREATE INDEX idx_proyectos_activos_amenities ON proyectos_master 
  USING GIN (amenities) WHERE activo = true;
```

---

## 6. QUERY LAYER - FUNCIONES

### 6.1 Nivel 1: Unidades Disponibles (Contacto Directo)

```sql
CREATE OR REPLACE FUNCTION buscar_unidades_reales(
  p_filtros JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id INTEGER,
  proyecto TEXT,
  dormitorios INTEGER,
  precio_usd NUMERIC,
  area_m2 NUMERIC,
  amenities JSONB,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  asesor_inmobiliaria TEXT,
  score_calidad INTEGER,
  url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    pm.nombre_oficial,
    p.dormitorios,
    p.precio_usd,
    p.area_total_m2,
    pm.amenities,
    p.datos_json->'asesor'->>'nombre',
    p.datos_json->'asesor'->>'telefono',
    p.datos_json->'asesor'->>'inmobiliaria',
    calcular_score_calidad(p),
    p.url
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.es_activa = true
    AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
    AND pm.activo = true
    -- Filtros dinámicos
    AND (p_filtros->>'dormitorios' IS NULL 
         OR p.dormitorios = (p_filtros->>'dormitorios')::int)
    AND (p_filtros->>'precio_max' IS NULL 
         OR p.precio_usd <= (p_filtros->>'precio_max')::numeric)
    AND (p_filtros->>'precio_min' IS NULL 
         OR p.precio_usd >= (p_filtros->>'precio_min')::numeric)
    AND (p_filtros->>'zona' IS NULL 
         OR pm.zona ILIKE '%' || (p_filtros->>'zona') || '%')
    -- Filtros por amenities (proyecto)
    AND (p_filtros->'amenities' IS NULL 
         OR pm.amenities @> (p_filtros->'amenities'))
  ORDER BY calcular_score_calidad(p) DESC, p.precio_usd ASC;
END;
$$ LANGUAGE plpgsql;
```

### 6.2 Nivel 2: Proyectos Compatibles (Para Explorar)

```sql
CREATE OR REPLACE FUNCTION buscar_proyectos_compatibles(
  p_filtros JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id_proyecto INTEGER,
  nombre TEXT,
  zona TEXT,
  tipologias JSONB,
  amenities JSONB,
  equipamiento JSONB,
  cantidad_listings INTEGER,
  cantidad_asesores INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pm.id_proyecto_master,
    pm.nombre_oficial,
    pm.zona,
    pm.tipologias,
    pm.amenities,
    pm.equipamiento_estandar,
    COUNT(p.id)::integer as cantidad_listings,
    COUNT(DISTINCT p.datos_json->'asesor'->>'telefono')::integer as cantidad_asesores
  FROM proyectos_master pm
  LEFT JOIN propiedades_v2 p ON p.id_proyecto_master = pm.id_proyecto_master 
    AND p.es_activa = true
  WHERE pm.activo = true
    AND jsonb_array_length(COALESCE(pm.tipologias, '[]')) > 0
    -- Filtro por dormitorios en tipologías
    AND (p_filtros->>'dormitorios' IS NULL 
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(pm.tipologias) t
           WHERE (t->>'dormitorios')::int = (p_filtros->>'dormitorios')::int
         ))
    -- Filtro por precio en tipologías
    AND (p_filtros->>'precio_max' IS NULL 
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(pm.tipologias) t
           WHERE (t->>'precio_desde')::numeric <= (p_filtros->>'precio_max')::numeric
         ))
    -- Filtros por amenities
    AND (p_filtros->'amenities' IS NULL 
         OR pm.amenities @> (p_filtros->'amenities'))
  GROUP BY pm.id_proyecto_master
  ORDER BY cantidad_listings DESC, pm.nombre_oficial;
END;
$$ LANGUAGE plpgsql;
```

### 6.3 Nivel 3: Drill-down en Proyecto

```sql
CREATE OR REPLACE FUNCTION obtener_listings_proyecto(
  p_id_proyecto INTEGER
)
RETURNS TABLE (
  id INTEGER,
  dormitorios INTEGER,
  precio_usd NUMERIC,
  area_m2 NUMERIC,
  piso TEXT,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  asesor_inmobiliaria TEXT,
  url TEXT,
  es_multiproyecto BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.dormitorios,
    p.precio_usd,
    p.area_total_m2,
    p.datos_json->'ubicacion'->>'piso',
    p.datos_json->'asesor'->>'nombre',
    p.datos_json->'asesor'->>'telefono',
    p.datos_json->'asesor'->>'inmobiliaria',
    p.url,
    p.es_multiproyecto
  FROM propiedades_v2 p
  WHERE p.id_proyecto_master = p_id_proyecto
    AND p.es_activa = true
  ORDER BY p.precio_usd ASC, p.dormitorios ASC;
END;
$$ LANGUAGE plpgsql;
```

### 6.4 Score de Calidad

```sql
CREATE OR REPLACE FUNCTION calcular_score_calidad(p propiedades_v2) 
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Base: es unidad real (no multiproyecto)
  IF NOT COALESCE(p.es_multiproyecto, false) THEN
    score := score + 50;
  END IF;
  
  -- Datos de precio
  IF p.precio_usd IS NOT NULL THEN score := score + 15; END IF;
  
  -- Datos de área
  IF p.area_total_m2 IS NOT NULL THEN score := score + 10; END IF;
  
  -- Dormitorios especificados
  IF p.dormitorios IS NOT NULL THEN score := score + 5; END IF;
  
  -- Tiene asesor con teléfono (accionable)
  IF p.datos_json->'asesor'->>'telefono' IS NOT NULL THEN 
    score := score + 20; 
  END IF;
  
  -- Tiene fotos
  IF jsonb_array_length(COALESCE(p.datos_json->'contenido'->'fotos', '[]')) > 0 THEN 
    score := score + 5; 
  END IF;
  
  -- Tiene ubicación GPS
  IF p.latitud IS NOT NULL AND p.longitud IS NOT NULL THEN 
    score := score + 5; 
  END IF;
  
  -- Penalización por antigüedad (más de 30 días sin actualizar)
  IF p.fecha_actualizacion < NOW() - INTERVAL '30 days' THEN
    score := score - 10;
  END IF;
  
  RETURN GREATEST(score, 0);
END;
$$ LANGUAGE plpgsql;
```

---

## 7. ENRICHMENT PIPELINE

### 7.1 Consolidación Automática (desde propiedades)

```sql
CREATE OR REPLACE FUNCTION consolidar_proyecto(p_id_proyecto INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_tipologias JSONB;
  v_resultado JSONB;
BEGIN
  -- Extraer tipologías de propiedades multiproyecto
  SELECT jsonb_agg(DISTINCT jsonb_build_object(
    'dormitorios', d.dorm,
    'precio_desde', MIN(p.precio_usd),
    'area_desde', MIN(p.area_total_m2)
  ))
  INTO v_tipologias
  FROM propiedades_v2 p,
       jsonb_array_elements_text(p.dormitorios_opciones::jsonb) d(dorm)
  WHERE p.id_proyecto_master = p_id_proyecto
    AND p.es_activa = true
    AND p.es_multiproyecto = true
  GROUP BY d.dorm;
  
  -- Actualizar proyecto
  UPDATE proyectos_master
  SET 
    tipologias = COALESCE(v_tipologias, tipologias),
    enriquecimiento = jsonb_set(
      COALESCE(enriquecimiento, '{}'),
      '{consolidacion}',
      jsonb_build_object(
        'fecha', NOW(),
        'fuente', 'propiedades_multiproyecto'
      )
    )
  WHERE id_proyecto_master = p_id_proyecto;
  
  RETURN jsonb_build_object('tipologias_extraidas', v_tipologias);
END;
$$ LANGUAGE plpgsql;
```

### 7.2 Extracción IA (batch con Claude API)

**Proceso:**
1. Query proyectos sin enriquecer o con confianza < 0.8
2. Juntar descripciones de todas las propiedades del proyecto
3. Llamar Claude API con prompt estructurado
4. Parsear respuesta JSON
5. UPDATE proyectos_master con datos extraídos
6. Marcar confianza y fuente

**Costo estimado:** ~$5 para 190 proyectos (usando Haiku)

**Frecuencia:** Batch inicial + refresh mensual para proyectos en construcción

---

## 8. FLUJO DE SIMÓN

```
┌─────────────────────────────────────────────────────────────┐
│ Cliente: "Busco 2D, pet friendly, máximo $150k"             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Simón parsea → filtros = {                                  │
│   "dormitorios": 2,                                         │
│   "precio_max": 150000,                                     │
│   "amenities": {"pet_friendly": true}                       │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│ buscar_unidades_reales  │     │ buscar_proyectos_compatibles│
│ (filtros)               │     │ (filtros)                   │
│                         │     │                             │
│ → 3 resultados          │     │ → 2 resultados              │
└─────────────────────────┘     └─────────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Simón responde:                                             │
│                                                             │
│ 📍 3 Departamentos Disponibles:                             │
│                                                             │
│ 1. Sky Moon piso 8 - 2D - $145k                            │
│    Pet friendly ✓ | Piscina ✓ | Score: 95                  │
│    📱 Contactar a María (Remax)                            │
│                                                             │
│ 2. Las Dalias 302 - 2D - $140k                             │
│    Pet friendly ✓ | Cowork ✓ | Score: 92                   │
│    📱 Contactar a Juan (Century21)                         │
│                                                             │
│ 3. Spazios 501 - 2D - $148k                                │
│    Pet friendly ✓ | Piscina infinita ✓ | Score: 88        │
│    📱 Contactar a Ana (Remax)                              │
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│ 🔎 También hay 2 proyectos que podrían interesarte:        │
│                                                             │
│ • TERRAZO (Plaza Italia) - 2D desde $XXk                   │
│   Pet friendly ✓ | 3 asesores disponibles                  │
│                                                             │
│ • Domus Insignia - 2D desde $82k                           │
│   Pet friendly ✓ | Domótica full ✓                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ (si usuario pide drill-down)
┌─────────────────────────────────────────────────────────────┐
│ Cliente: "Contame más de TERRAZO"                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ obtener_listings_proyecto(id_terrazo)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Simón responde:                                             │
│                                                             │
│ 🏢 TERRAZO - Equipetrol (frente a Plaza Italia)            │
│                                                             │
│ Amenities: Pet friendly ✓ | Piscina ✓ | Gym ✓ | Sauna ✓   │
│ Equipamiento: AC Inverter | Porcelanato gran formato       │
│ Tipologías: Mono, 1D, 2D, 3D, Duplex                       │
│ Estado: En construcción - Entrega Dic 2026                 │
│                                                             │
│ Opciones publicadas:                                        │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 2D Piso 4 - $125k         📱 María (Remax)             ││
│ │ 2D Piso 7 - $132k         📱 Pedro (Century21)         ││
│ │ 2D (varios disp) - desde $120k    📱 Ana (Remax)       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ¿Te conecto con alguno de estos asesores?                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. PLAN DE IMPLEMENTACIÓN

### Fase 1: Storage Layer (2-3 horas)
- [ ] Migración `013_enriquecimiento_proyectos.sql`
- [ ] Agregar columnas JSONB a proyectos_master
- [ ] Crear índices GIN

### Fase 2: Score de Calidad (1 hora)
- [ ] Función `calcular_score_calidad()`
- [ ] Tests con propiedades existentes

### Fase 3: Query Layer (3-4 horas)
- [ ] Función `buscar_unidades_reales()`
- [ ] Función `buscar_proyectos_compatibles()`
- [ ] Función `obtener_listings_proyecto()`
- [ ] Tests con filtros variados

### Fase 4: Enrichment - Consolidación (2 horas)
- [ ] Función `consolidar_proyecto()`
- [ ] Script batch para consolidar todos los proyectos
- [ ] Extraer tipologías de propiedades multiproyecto

### Fase 5: Enrichment - IA (4-6 horas)
- [ ] Diseñar prompt de extracción
- [ ] Script/workflow para llamar Claude API
- [ ] Parsear y guardar resultados
- [ ] Validación de confianza

### Fase 6: Integración con Simón (2-3 horas)
- [ ] Conectar funciones con el chatbot
- [ ] Formatear respuestas
- [ ] Manejar drill-down

**Total estimado:** 14-19 horas

---

## 10. MÉTRICAS DE ÉXITO

| Métrica | Actual | Target |
|---------|--------|--------|
| Proyectos con amenities | 0% | 80%+ |
| Proyectos con tipologías | ~10% | 90%+ |
| Tiempo de búsqueda Simón | N/A | <500ms |
| Unidades reales accionables | ~60% | 85%+ |

---

## 11. RIESGOS Y MITIGACIONES

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Extracción IA inexacta | Datos erróneos | Threshold de confianza + validación humana |
| Performance queries JSONB | Lentitud | Índices GIN + views materializadas |
| Datos desactualizados | Info incorrecta | Refresh periódico + fecha en metadata |
| Asesores sin WSP | No accionable | Filtrar en score de calidad |

---

## 12. DECISIONES PENDIENTES

1. **¿View materializada o recalcular?** Para v_proyectos_con_tipologias
2. **¿Threshold de confianza?** Para auto-aplicar extracción IA
3. **¿Refresh frequency?** Para proyectos en construcción
4. **¿Validación humana?** ¿Google Sheet o interfaz custom?

---

*Design Doc generado: 5 Enero 2026*
*Próximo paso: Revisión y aprobación antes de implementar*
