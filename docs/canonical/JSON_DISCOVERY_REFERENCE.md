# 📋 JSON DISCOVERY REFERENCE

**Propósito:** Documentar la estructura completa de `datos_json_discovery` por cada portal  
**Fecha:** 18 Diciembre 2025  
**Versión:** 1.0.0

---

## 🎯 OVERVIEW

El campo `datos_json_discovery` almacena el **snapshot RAW completo** del JSON devuelto por cada portal en el momento del discovery. Este documento describe la estructura de datos de cada fuente.

---

## 🏢 REMAX

### **Endpoint API**
```
https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste?page={N}
```

### **Estructura JSON**

```json
{
  "id": 123456,
  "MLSID": "RMX-123456",
  
  "location": {
    "latitude": "-17.7568173",
    "longitude": "-63.1973488"
  },
  
  "price": {
    "amount": 3850,
    "price_in_dollars": 553.16,
    "currency_id": 1
  },
  
  "listing_information": {
    "construction_area_m": 85,
    "number_bedrooms": 2,
    "number_bathrooms": 2,
    "number_parking": 1,
    "subtype_property": {
      "name": "Departamento"
    }
  },
  
  "date_of_listing": "2024-10-15",
  
  "images": [
    {
      "url": "https://...",
      "order": 1
    }
  ],
  
  "description": "Texto descriptivo...",
  
  "amenities": [
    "Gimnasio",
    "Piscina"
  ]
}
```

### **Mapeo a BD (Discovery)**

| Campo BD | JSON Path | Notas |
|----------|-----------|-------|
| `codigo_propiedad` | `MLSID` | ID único Remax |
| `latitud` | `location.latitude` | String → NUMERIC |
| `longitud` | `location.longitude` | String → NUMERIC |
| `precio_usd` | `price.price_in_dollars` | ✅ Remax calcula |
| `precio_usd_original` | `price.amount` | En moneda original |
| `moneda_original` | `currency_id` | 1=BOB, 2=USD |
| `area_total_m2` | `listing_information.construction_area_m` | |
| `dormitorios` | `listing_information.number_bedrooms` | |
| `banos` | `listing_information.number_bathrooms` | |
| `estacionamientos` | `listing_information.number_parking` | Raro (null) |
| `tipo_propiedad_original` | `listing_information.subtype_property.name` | |
| `fecha_publicacion` | `date_of_listing` | Formato: YYYY-MM-DD |

### **Campos Adicionales Disponibles (NO extraídos)**

```json
{
  "description": "string",           // Descripción larga
  "images": [],                      // Array de fotos
  "amenities": [],                   // Amenidades
  "broker_info": {},                 // Info del agente
  "virtual_tour_url": "string",      // Tour virtual
  "property_status": "active",       // Estado
  "land_area_m": 100,                // Área terreno
  "year_built": 2020,                // Año construcción
  "maintenance_fee": 200             // Expensas
}
```

### **Notas Técnicas Remax**

1. **`price_in_dollars` siempre calculado:** Remax API siempre devuelve precio en USD, incluso si la moneda original es BOB.

2. **`currency_id` mapping:**
   ```javascript
   1 = "BOB"
   2 = "USD"
   ```

3. **Cobertura de datos:** ~99% de propiedades tienen todos los campos básicos poblados.

4. **Estacionamientos:** Campo `number_parking` existe pero rara vez tiene valor (~0%).

---

## 🏢 CENTURY21

### **Endpoint API**
```
https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/coordenadas_{N},{E},{S},{W},15?json=true
```

### **Estructura JSON**

```json
{
  "id": "87681",
  "lat": -17.7568173,
  "lon": -63.1973488,
  
  "precio": "1890000",
  "moneda": "BOB",
  "precios": {
    "vista": {
      "moneda": "USD",
      "precio": 271551.724137931,
      "precioFormat": "271.552 USD"
    },
    "contrato": {
      "moneda": "BOB",
      "precio": 1890000,
      "precioFormat": "1.890.000 BOB"
    }
  },
  
  "m2C": 84,
  "m2T": 84,
  "m2CFormat": "84",
  "m2TFormat": "84",
  "m2CTxt": "m² Construcción",
  "m2TTxt": "m² Terreno",
  
  "recamaras": 2,
  "banos": null,
  "estacionamientos": null,
  
  "tipoPropiedad": "departamento",
  "tipoOperacion": "venta",
  
  "fechaAlta": "2025-10-02",
  "fechaModificacion": "2025-10-31",
  
  "calle": "Condominio Sky Moon",
  "municipio": "Equipetrol",
  "estado": "Santa Cruz",
  "pais": "Bolivia",
  
  "encabezado": "DPTO DE 2D EN VENTA SKY MOON EQUIPETROL",
  
  "fotos": {
    "totalFotos": 12,
    "propiedadThumbnail": [
      "https://cdn.21online.lat/...",
      "..."
    ]
  },
  
  "asesorNombre": "Ariel Mauricio Hubsch Rozenman",
  "asesorThumbnail": "https://...",
  "telefono": "+591 77361434",
  "whatsapp": "+59177361434",
  "email": "ariel.hubsch@century21.bo",
  
  "nombreAfiliado": "CENTURY 21 Azzero",
  "logoOficina": "https://...",
  
  "urlCorrectaPropiedad": "/propiedad/87681_dpto-de-2d-en-venta-sky-moon-equipetrol",
  
  "exclusiva": true,
  "status": "enPromocion",
  "conMapa": true,
  "conVideo": false,
  "fotos360": false,
  "recorridoVirtual": false,
  
  "etiquetas": [
    {
      "icon": "fas fa-map-marker-alt",
      "label": "Con Mapa",
      "fechaVigencia": null
    }
  ]
}
```

### **Mapeo a BD (Discovery)**

| Campo BD | JSON Path | Notas |
|----------|-----------|-------|
| `codigo_propiedad` | `id` | String |
| `latitud` | `lat` | NUMERIC directo |
| `longitud` | `lon` | NUMERIC directo |
| `precio_usd` | calculado | Solo si `moneda = "USD"` |
| `precio_usd_original` | `precio` | String → NUMERIC |
| `moneda_original` | `moneda` | "BOB" o "USD" |
| `area_total_m2` | `m2C` | ⚠️ NO "superficie" |
| `dormitorios` | `recamaras` | ⚠️ NO "dormitorios" |
| `banos` | `banos` | A veces null |
| `estacionamientos` | `estacionamientos` | A veces null |
| `tipo_propiedad_original` | `tipoPropiedad` | |
| `fecha_publicacion` | `fechaAlta` | Formato: YYYY-MM-DD |

### **Campos Adicionales Disponibles (NO extraídos)**

```json
{
  "encabezado": "string",            // Título
  "calle": "string",                 // Dirección
  "municipio": "string",             // Zona
  "fotos": {},                       // Objeto con fotos
  "asesorNombre": "string",          // Agente
  "telefono": "string",              // Contacto
  "email": "string",                 // Email
  "nombreAfiliado": "string",        // Franquicia
  "m2T": number,                     // Área terreno
  "fechaModificacion": "string",     // Última actualización
  "status": "string",                // enPromocion, etc
  "exclusiva": boolean,              // Exclusividad
  "etiquetas": [],                   // Tags especiales
  "precios.vista": {}                // Conversión USD
}
```

### **Notas Técnicas Century21**

1. **NO calcula precio USD:** A diferencia de Remax, C21 NO convierte BOB→USD en API de mapa. El campo `precios.vista` existe pero no es confiable.

2. **Campos clave diferentes a intuición:**
   - ❌ `superficie` NO existe → Usar `m2C`
   - ❌ `dormitorios` NO existe → Usar `recamaras`
   - ✅ `fechaAlta` NO `fecha_publicacion`

3. **Cobertura de datos variable** (varios campos llegan null del portal; consultar % actual):
   ```sql
   SELECT ROUND(100.0*COUNT(datos_json_discovery->>'recamaras')/COUNT(*))        AS pct_recamaras,
          ROUND(100.0*COUNT(datos_json_discovery->>'banos')/COUNT(*))            AS pct_banos,
          ROUND(100.0*COUNT(datos_json_discovery->>'estacionamientos')/COUNT(*)) AS pct_estac
   FROM propiedades_v2 WHERE fuente='century21';
   ```
   `m2C` viene 100%; `recamaras` y `banos` parcial; `estacionamientos` raro.

4. **Parsing defensivo necesario:** El JSON puede venir en 3 estructuras diferentes:
   ```javascript
   // Estructura 1: Array directo
   [{ id: "123", ... }]
   
   // Estructura 2: Objeto con results
   { results: [{ id: "123", ... }] }
   
   // Estructura 3: Objeto con datas.results
   { datas: { results: [{ id: "123", ... }] } }
   ```

5. **Moneda default:** Si `moneda` es null → Asumir "USD"

---

## 📊 COMPARACIÓN DE CAMPOS

### **Campos Equivalentes**

| Concepto | Remax | Century21 |
|----------|-------|-----------|
| ID propiedad | `MLSID` | `id` |
| Latitud | `location.latitude` | `lat` |
| Longitud | `location.longitude` | `lon` |
| Precio | `price.amount` | `precio` |
| Precio USD | `price.price_in_dollars` | NO existe |
| Moneda | `price.currency_id` (1/2) | `moneda` (BOB/USD) |
| Área construida | `listing_information.construction_area_m` | `m2C` |
| Área terreno | `listing_information.land_area_m` | `m2T` |
| Dormitorios | `listing_information.number_bedrooms` | `recamaras` |
| Baños | `listing_information.number_bathrooms` | `banos` |
| Estacionamientos | `listing_information.number_parking` | `estacionamientos` |
| Tipo | `listing_information.subtype_property.name` | `tipoPropiedad` |
| Fecha publicación | `date_of_listing` | `fechaAlta` |

### **Campos Únicos por Portal**

**Solo Remax:**
- `description` - Descripción larga
- `amenities[]` - Lista de amenidades
- `virtual_tour_url` - Link tour virtual
- `year_built` - Año construcción
- `maintenance_fee` - Expensas

**Solo Century21:**
- `encabezado` - Título promocional
- `calle` - Dirección específica
- `municipio` - Zona/barrio
- `asesorNombre` - Nombre del agente
- `nombreAfiliado` - Franquicia Century21
- `etiquetas[]` - Tags promocionales
- `exclusiva` - Propiedad exclusiva
- `status` - Estado promocional

---

## 🔍 QUERIES DE ANÁLISIS

### **Ver campos poblados por portal:**

```sql
SELECT 
    fuente,
    COUNT(*) as total,
    
    -- Campos comunes
    COUNT(datos_json_discovery->>'precio') as con_precio_json,
    COUNT(datos_json_discovery->>'moneda') as con_moneda_json,
    
    -- Remax específico
    COUNT(datos_json_discovery->'price'->>'price_in_dollars') as remax_precio_usd,
    COUNT(datos_json_discovery->'listing_information'->>'construction_area_m') as remax_area,
    
    -- Century21 específico  
    COUNT(datos_json_discovery->>'m2C') as c21_m2c,
    COUNT(datos_json_discovery->>'recamaras') as c21_recamaras,
    COUNT(datos_json_discovery->>'fechaAlta') as c21_fecha_alta
    
FROM propiedades_v2
GROUP BY fuente;
```

### **Ver ejemplo completo de JSON por portal:**

```sql
-- Remax
SELECT 
    id,
    codigo_propiedad,
    datos_json_discovery
FROM propiedades_v2
WHERE fuente = 'remax'
ORDER BY fecha_discovery DESC
LIMIT 1;

-- Century21
SELECT 
    id,
    codigo_propiedad,
    datos_json_discovery
FROM propiedades_v2
WHERE fuente = 'century21'
ORDER BY fecha_discovery DESC
LIMIT 1;
```

---

## 📝 USO EN MÓDULOS POSTERIORES

### **Módulo 2 - Enrichment**

Campos útiles para enriquecimiento:
- **Remax:** `description`, `amenities`, `year_built`
- **Century21:** `encabezado`, `calle`, `asesorNombre`

### **Módulo 3 - Matching**

Campos útiles para matching:
- **Remax:** `location` (precisión GPS)
- **Century21:** `calle`, `municipio` (dirección textual)

---

## ⚠️ ADVERTENCIAS IMPORTANTES

### **1. NO asumir estructura fija**

Los portales **pueden cambiar** su estructura JSON sin aviso. Siempre usar parsing defensivo:

```javascript
// ✅ CORRECTO
const precio = prop.precio || prop.price?.amount || null;

// ❌ INCORRECTO
const precio = prop.precio;  // Crash si no existe
```

### **2. Validar tipos de datos**

```javascript
// ✅ CORRECTO
const lat = parseFloat(prop.lat) || null;

// ❌ INCORRECTO
const lat = prop.lat;  // Puede ser string
```

### **3. NO confiar en campos calculados**

Century21 tiene `precios.vista.precio` pero **NO es confiable** para conversión BOB→USD. Usar TC dinámico propio.

---

## 📚 REFERENCIAS

- **Función SQL:** `registrar_discovery()` v2.0.0
- **Workflow Remax:** v1.0.2 FINAL
- **Workflow Century21:** v1.0.3 FINAL
- **Documentación:** `MODULO_1_FLUJO_A_IMPLEMENTACION.md`

---

## 📞 MANTENIMIENTO

**Actualizar este documento cuando:**
1. Un portal cambia su estructura JSON
2. Se detectan campos nuevos disponibles
3. Se implementa extracción de campos adicionales
4. Se agregan nuevos portales

---

**Versión:** 1.0.0  
**Última actualización:** 18 Diciembre 2025  
**Mantenedor:** Equipo SICI
