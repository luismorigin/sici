# Módulo 1 - Flujo A: Implementación

> **Versión:** 1.2.0  
> **Estado:** CONTRATO DE IMPLEMENTACIÓN  
> **Fecha:** Diciembre 2025

---

## CHANGELOG

**v1.2.0 (Diciembre 2025)**
- Estructuras JSON reales de producción documentadas (Remax y Century21)
- Headers HTTP críticos agregados (Century21 CORS + cookies)
- Mapeo real de campos según research docs
- Parsing defensivo Century21 documentado (3 estructuras posibles)
- Tabla comparativa técnica completa
- Constantes de configuración con valores exactos de producción
- Aclaraciones sobre datos observados vs enrichment
- **Corrección crítica:** Deduplicación por `(url, fuente)` en todas las secciones
- **Corrección:** Query de urls activas incluye estado `actualizado`
- **Corrección:** Wording sobre responsabilidades de Discovery

**v1.1.0 (Diciembre 2025)**
- Integración con research docs validados (Remax y Century21)
- Referencias a documentación técnica
- Nota sobre datos observados según canonical v2.0.0

**v1.0.1 (Diciembre 2025)**
- Actualización de estados: `pendiente` → `nueva`
- Actualización de estados: `inactivo_por_confirmar` → `inactivo_pending`
- Alineación con Discovery Canonical v2.0.0

---

## Referencias técnicas

Este documento se basa en investigación técnica validada en producción:

- **Remax:** Ver `RESEARCH_REMAX_API.md` para especificaciones técnicas completas
  - API REST con paginación (`?page=N`)
  - Estructura JSON validada
  - ~8 páginas para Equipetrol (~153 propiedades)
  - Headers: No requiere headers custom
  
- **Century21:** Ver `RESEARCH_CENTURY21_GRID.md` para arquitectura de grid
  - Endpoint JSON de mapa con bounding boxes geográficos
  - Sin paginación tradicional
  - Cobertura por cuadrícula geográfica (~6 cuadrantes)
  - Headers críticos: CORS, cookies (ver sección de implementación)

**Los extractores implementan los hallazgos documentados en estos research papers.**

### Nota sobre datos observados (según canonical v2.0.0)

Aunque arquitectónicamente campos como precio, área y dormitorios pertenecen a Enrichment, Discovery los extrae como **datos observados** porque:
- ✅ Sirven para detectar cambios (precio varió → re-scrapear)
- ✅ Apoyan decisiones de existencia
- ❌ NO son "verdad final"
- ❌ NO rompen candados
- ❌ NO reemplazan enrichment

Ambas fuentes (Remax y Century21) proporcionan estos campos en sus respuestas JSON.

---

## Estructuras JSON reales de las fuentes

### Remax - Response API (del RESEARCH_REMAX_API.md)

```json
{
  "current_page": 1,
  "last_page": 8,
  "per_page": 20,
  "total": 153,
  "data": [
    {
      "id": 51591,
      "MLSID": "120047032-21",
      "date_of_listing": "2025-11-11",
      "location": {
        "first_address": "CALLE LOS CLAVELES",
        "latitude": "-17.76474890",
        "longitude": "-63.20207077",
        "zone": {
          "name": "Equipetrol/NorOeste"
        }
      },
      "price": {
        "amount": 3850,
        "currency_id": 1,
        "price_in_dollars": 553.16
      },
      "listing_information": {
        "number_bedrooms": 1,
        "number_bathrooms": 1,
        "construction_area_m": 41,
        "subtype_property": {
          "name": "Departamento"
        }
      }
    }
  ]
}
```

### Century21 - Response JSON de mapa (del RESEARCH_CENTURY21_GRID.md)

```javascript
// Respuesta puede variar - parsing defensivo requerido:
// response[] ó response.results[] ó response.datas.results[]

[
  {
    "id": "12345",
    "urlCorrectaPropiedad": "/propiedad/12345",
    "lat": -17.765,
    "lon": -63.192,
    "precio": 120000,
    "moneda": "USD",
    "superficie": 85,
    "dormitorios": 3,
    "banos": 2
    // ... otros campos disponibles en JSON de mapa
  }
]
```

**Nota:** Century21 requiere parsing defensivo porque la estructura de wrapper puede cambiar. Ver `RESEARCH_CENTURY21_GRID.md` sección 7.

---

## Resumen ejecutivo

**Flujo A ("El Cazador")** es el proceso de discovery que se ejecuta diariamente a la 1:00 AM para:

1. Descubrir propiedades nuevas en portales inmobiliarios (Remax, Century21)
2. Detectar propiedades que desaparecieron del mercado
3. Registrar hallazgos en la base de datos

**Filosofía - Discovery como detector de cambios:**
> Discovery NO es un extractor stateless. Es un proceso de detección de cambios: Snapshot + Comparación + Decisión.

**Responsabilidades exclusivas:**
- Insertar propiedades nuevas con status `nueva`
- Marcar propiedades ausentes como `inactivo_pending`
- Extraer **datos observados** básicos (NO son "verdad final", solo observaciones iniciales)

**NO es responsable de:**
- Confirmar eliminaciones (eso lo hace Flujo C)
- Validar o confirmar precios ni detalles (solo datos observados)
- Matching con proyectos

**Arquitectura modular:**
- Flujos separados por portal (Remax, Century21)
- Fácilmente extensible a nuevos portales
- Cada portal puede extraer diferentes datos observados

---

## Diagrama de flujo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLUJO A                                        │
│                           "El Cazador"                                      │
│                          Schedule: 1:00 AM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [INICIO]                                                                   │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 0: PREPARACIÓN                    │                                │
│  │ - Registrar timestamp_inicio           │                                │
│  │ - Snapshot: urls con status IN         │                                │
│  │   ('nueva', 'actualizado', 'completado')│                               │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 1: SCRAPEAR REMAX                 │                                │
│  │ - Páginas 1-8 secuenciales             │                                │
│  │ - Rate limit: 2 segundos               │                                │
│  │ - Extraer: id, latitude, longitude     │                                │
│  │ - Registrar: remax_exitoso = TRUE/FALSE│                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 2: SCRAPEAR CENTURY21             │                                │
│  │ - Grid de ~6 cuadrantes                │                                │
│  │ - Rate limit: 2 segundos               │                                │
│  │ - Extraer: id, lat, lon, url           │                                │
│  │ - Registrar: c21_exitoso = TRUE/FALSE  │                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 3: CONSOLIDACIÓN                  │                                │
│  │ - Unir propiedades_remax + propiedades_│                                │
│  │   c21                                  │                                │
│  │ - Deduplicar por (url, fuente)         │                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 4: REGISTRO EN BD                 │                                │
│  │ - Por cada propiedad única:            │                                │
│  │   └─► llamar registrar_discovery()     │                                │
│  │ - Nueva → INSERT status='nueva'        │                                │
│  │ - Existente → UPDATE (sin cambio       │                                │
│  │   status)                              │                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 5: DETECCIÓN DE AUSENCIAS         │                                │
│  │ ┌────────────────────────────────────┐ │                                │
│  │ │ PROTECCIÓN:                        │ │                                │
│  │ │ SI remax_exitoso AND c21_exitoso:  │ │                                │
│  │ │   → Ejecutar detección             │ │                                │
│  │ │ SINO:                              │ │                                │
│  │ │   → OMITIR fase, registrar warning │ │                                │
│  │ └────────────────────────────────────┘ │                                │
│  │ - ausentes = activas_antes -           │                                │
│  │   descubiertas_hoy                     │                                │
│  │ - Por cada ausente:                    │                                │
│  │   └─► UPDATE status=                   │                                │
│  │       'inactivo_pending'               │                                │
│  │   └─► SET fecha_deteccion_ausencia     │                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 6: LOGGING                        │                                │
│  │ - Generar reporte de ejecución         │                                │
│  │ - Registrar métricas                   │                                │
│  │ - Registrar errores/warnings           │                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│                [FIN]                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Estados que setea Flujo A

### ✅ Estados que SÍ setea

| Estado | Cuándo | Función responsable |
|--------|--------|---------------------|
| `nueva` | Propiedad nueva descubierta (INSERT) | `registrar_discovery()` |
| `inactivo_pending` | Propiedad activa no apareció en scrape | Script de ausencias (orquestación) |

### ❌ Estados que NO setea

| Estado | Quién lo setea |
|--------|----------------|
| `inactivo_confirmed` | Flujo C (confirma HTTP 404) |
| `completado` | Flujo C (confirma HTTP 200/3XX) o Merge |
| `actualizado` | `registrar_enrichment()` (Módulo 2) |

---

## Campos de fecha

| Campo | Significado | Cuándo se actualiza |
|-------|-------------|---------------------|
| `fecha_ultimo_avistamiento` | Última vez que la propiedad fue VISTA en un scrape | En `registrar_discovery()` cuando se procesa |
| `fecha_deteccion_ausencia` | Momento en que se detectó que NO apareció | Al marcar `inactivo_pending` |

**Regla:** Estos campos tienen semánticas distintas y NO deben mezclarse.

---

## Pseudocódigo final

### Función principal: ejecutar_flujo_a()

```
FUNCIÓN ejecutar_flujo_a()

ENTRADA: ninguna
SALIDA: reporte_ejecucion

INICIO:
    timestamp_inicio = ahora()
    errores = []
    remax_exitoso = FALSE
    c21_exitoso = FALSE

    // ══════════════════════════════════════════════════════════
    // FASE 0: PREPARACIÓN
    // ══════════════════════════════════════════════════════════
    urls_activas_antes = obtener_urls_activas_bd()

    // ══════════════════════════════════════════════════════════
    // FASE 1: SCRAPEAR REMAX
    // ══════════════════════════════════════════════════════════
    INTENTAR:
        propiedades_remax = scrapear_remax()
        remax_exitoso = TRUE
    CAPTURAR error:
        errores.agregar({fuente: "remax", error: error})
        propiedades_remax = []

    // ══════════════════════════════════════════════════════════
    // FASE 2: SCRAPEAR CENTURY21
    // ══════════════════════════════════════════════════════════
    INTENTAR:
        propiedades_c21 = scrapear_century21()
        c21_exitoso = TRUE
    CAPTURAR error:
        errores.agregar({fuente: "century21", error: error})
        propiedades_c21 = []

    // ══════════════════════════════════════════════════════════
    // FASE 3: CONSOLIDACIÓN
    // ══════════════════════════════════════════════════════════
    propiedades_todas = propiedades_remax + propiedades_c21
    propiedades_unicas = deduplicar(propiedades_todas)

    // ══════════════════════════════════════════════════════════
    // FASE 4: REGISTRO EN BD
    // ══════════════════════════════════════════════════════════
    resultados_registro = []
    POR CADA propiedad EN propiedades_unicas:
        resultado = llamar_registrar_discovery(propiedad)
        resultados_registro.agregar(resultado)

    // ══════════════════════════════════════════════════════════
    // FASE 5: DETECCIÓN DE AUSENCIAS (PROTEGIDA)
    // ══════════════════════════════════════════════════════════
    urls_ausentes = []
    fase_5_ejecutada = FALSE

    SI remax_exitoso Y c21_exitoso:
        urls_descubiertas_hoy = extraer_urls(propiedades_unicas)
        urls_ausentes = urls_activas_antes - urls_descubiertas_hoy
        POR CADA url EN urls_ausentes:
            marcar_inactivo_pending(url)
        fase_5_ejecutada = TRUE
    SINO:
        errores.agregar({
            tipo: "warning",
            mensaje: "Fase 5 omitida por fallo parcial de fuentes",
            remax_ok: remax_exitoso,
            c21_ok: c21_exitoso
        })

    // ══════════════════════════════════════════════════════════
    // FASE 6: LOGGING
    // ══════════════════════════════════════════════════════════
    reporte = generar_reporte(
        timestamp_inicio,
        propiedades_remax.cantidad,
        propiedades_c21.cantidad,
        propiedades_unicas.cantidad,
        resultados_registro,
        urls_ausentes.cantidad,
        fase_5_ejecutada,
        errores
    )

    RETORNAR reporte
FIN
```

### Función: obtener_urls_activas_bd()

```
FUNCIÓN obtener_urls_activas_bd()

ENTRADA: ninguna
SALIDA: conjunto de {url, fuente}

INICIO:
    consulta = "SELECT url, fuente
                FROM propiedades_v2
                WHERE status IN ('nueva', 'actualizado', 'completado')"

    RETORNAR ejecutar_consulta(consulta)
FIN
```

### Función: scrapear_remax()

```
FUNCIÓN scrapear_remax()

ENTRADA: ninguna
SALIDA: lista de propiedades descubiertas

INICIO:
    propiedades = []
    TOTAL_PAGES = 8  // Validado para Equipetrol (dic 2025)

    POR page = 1 HASTA TOTAL_PAGES:
        url = construir_url_remax(page)
        respuesta = hacer_get(url)

        SI respuesta.exitosa:
            datos = parsear_json(respuesta)
            POR CADA property EN datos.data:
                // Campos obligatorios
                propiedad = {
                    url: "https://remax.bo/propiedad/" + property.id,
                    fuente: "remax",
                    datos_json_discovery: property  // Snapshot RAW completo
                }
                
                // Datos observados opcionales (mapeo real según RESEARCH_REMAX_API.md)
                SI property.MLSID EXISTE:
                    propiedad.codigo_propiedad = property.MLSID
                
                SI property.price EXISTE:
                    propiedad.precio_usd = property.price.price_in_dollars
                    propiedad.precio_usd_original = property.price.amount
                    propiedad.moneda_original = (property.price.currency_id === 1) ? "BOB" : "USD"
                
                SI property.listing_information EXISTE:
                    propiedad.area_total_m2 = property.listing_information.construction_area_m
                    propiedad.dormitorios = property.listing_information.number_bedrooms
                    propiedad.banos = property.listing_information.number_bathrooms
                    propiedad.tipo_propiedad_original = property.listing_information.subtype_property.name
                
                SI property.location EXISTE:
                    propiedad.latitud = convertir_numero(property.location.latitude)
                    propiedad.longitud = convertir_numero(property.location.longitude)
                
                SI property.date_of_listing EXISTE:
                    propiedad.fecha_publicacion = property.date_of_listing
                
                propiedad.tipo_operacion = "venta"
                propiedad.metodo_discovery = "api_rest"
                
                propiedades.agregar(propiedad)
        SINO:
            LANZAR error("Remax página falló: " + respuesta.status)

        esperar(2 segundos)

    RETORNAR propiedades
FIN
```

### Función: scrapear_century21()

```
FUNCIÓN scrapear_century21()

ENTRADA: ninguna
SALIDA: lista de propiedades descubiertas

INICIO:
    propiedades = []
    cuadrantes = generar_cuadrantes_equipetrol()
    
    // Generar cookie auto-emitida (Century21 no valida sesión real)
    cookieId = "sici_" + generar_random_string()
    
    // Headers críticos según RESEARCH_CENTURY21_GRID.md
    headers = {
        "accept": "application/json, text/plain, */*",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "cookie": "PHPSESSID=" + cookieId
    }

    POR CADA cuadrante EN cuadrantes:
        url = construir_url_c21(cuadrante)
        respuesta = hacer_get(url, headers)

        SI respuesta.exitosa:
            // Parsing defensivo (3 estructuras posibles)
            datos = []
            SI es_array(respuesta):
                datos = respuesta
            SINO SI respuesta.results EXISTE:
                datos = respuesta.results
            SINO SI respuesta.datas.results EXISTE:
                datos = respuesta.datas.results
            
            POR CADA propiedad EN datos:
                // Campos obligatorios
                item = {
                    url: "https://c21.com.bo" + propiedad.urlCorrectaPropiedad,
                    fuente: "century21",
                    datos_json_discovery: propiedad  // Snapshot RAW completo
                }
                
                // Datos observados opcionales (mapeo real según JSON de mapa)
                SI propiedad.id EXISTE:
                    item.codigo_propiedad = convertir_string(propiedad.id)
                
                SI propiedad.precio EXISTE:
                    item.precio_usd_original = convertir_numero(propiedad.precio)
                    SI propiedad.moneda EXISTE:
                        item.moneda_original = propiedad.moneda
                    SINO:
                        item.moneda_original = "USD"  // Default Century21
                
                SI propiedad.superficie EXISTE:
                    item.area_total_m2 = convertir_numero(propiedad.superficie)
                
                SI propiedad.dormitorios EXISTE:
                    item.dormitorios = convertir_numero(propiedad.dormitorios)
                
                SI propiedad.banos EXISTE:
                    item.banos = convertir_numero(propiedad.banos)
                
                SI propiedad.lat Y propiedad.lon EXISTEN:
                    item.latitud = propiedad.lat
                    item.longitud = propiedad.lon
                
                item.tipo_operacion = "venta"
                item.metodo_discovery = "map_grid"
                
                propiedades.agregar(item)
        SINO:
            LANZAR error("Century21 cuadrante falló: " + respuesta.status)

        esperar(2 segundos)

    RETORNAR propiedades
FIN
```

**Nota crítica:** Century21 requiere headers CORS específicos y acepta cookies auto-emitidas. El parsing defensivo es obligatorio porque la estructura de wrapper JSON puede variar.

### Función: generar_cuadrantes_equipetrol()

```
FUNCIÓN generar_cuadrantes_equipetrol()

ENTRADA: ninguna
SALIDA: lista de cuadrantes {north, south, east, west}

INICIO:
    // Bounding box Equipetrol (validado diciembre 2025)
    LAT_NORTE = -17.750
    LAT_SUR = -17.775
    LON_OESTE = -63.205
    LON_ESTE = -63.185
    STEP = 0.010

    cuadrantes = []

    lat = LAT_SUR
    MIENTRAS lat < LAT_NORTE:
        lon = LON_OESTE
        MIENTRAS lon < LON_ESTE:
            cuadrante = {
                north: lat + STEP,
                south: lat,
                west: lon,
                east: lon + STEP
            }
            cuadrantes.agregar(cuadrante)
            lon = lon + STEP
        lat = lat + STEP

    RETORNAR cuadrantes
FIN
```

### Función: construir_url_remax()

```
FUNCIÓN construir_url_remax(pagina)

ENTRADA: pagina (número 1-8)
SALIDA: url completa

INICIO:
    base = "https://remax.bo/api/search/departamento/"
    zona = "santa-cruz-de-la-sierra/equipetrolnoroeste"

    RETORNAR base + zona + "?page=" + pagina
FIN
```

### Función: construir_url_c21()

```
FUNCIÓN construir_url_c21(cuadrante)

ENTRADA: cuadrante {north, south, east, west}
SALIDA: url completa

INICIO:
    base = "https://c21.com.bo/v/resultados/"
    filtros = "tipo_departamento-o-penthouse/operacion_venta/layout_mapa/"

    // CRÍTICO: orden es north, east, south, west
    coords = "coordenadas_" + cuadrante.north + "," +
             cuadrante.east + "," +
             cuadrante.south + "," +
             cuadrante.west

    RETORNAR base + filtros + coords + ",15?json=true"
FIN
```

### Función: deduplicar()

```
FUNCIÓN deduplicar(propiedades)

ENTRADA: lista de propiedades
SALIDA: lista sin duplicados

INICIO:
    vistos = conjunto vacío
    unicas = []

    POR CADA propiedad EN propiedades:
        // La clave única es (url, fuente) — ver canonical v2.0
        clave = (propiedad.url, propiedad.fuente)

        SI clave NO EN vistos:
            vistos.agregar(clave)
            unicas.agregar(propiedad)

    RETORNAR unicas
FIN
```

**Nota:** La unicidad se determina por `(url, fuente)` — ver canonical v2.0.

### Función: llamar_registrar_discovery()

```
FUNCIÓN llamar_registrar_discovery(propiedad)

ENTRADA: propiedad
SALIDA: resultado {id, status, es_nueva, cambios}

INICIO:
    // Parámetros obligatorios
    parametros = {
        p_url: propiedad.url,
        p_fuente: propiedad.fuente,
        p_datos_json_discovery: JSON.stringify(propiedad.datos_json_discovery)
    }
    
    // Agregar datos observados si están disponibles (todos opcionales)
    SI propiedad.codigo_propiedad EXISTE:
        parametros.p_codigo_propiedad = propiedad.codigo_propiedad
    
    SI propiedad.precio_usd EXISTE:
        parametros.p_precio_usd = propiedad.precio_usd
        parametros.p_precio_usd_original = propiedad.precio_usd_original
        parametros.p_moneda_original = propiedad.moneda_original
    
    SI propiedad.area_total_m2 EXISTE:
        parametros.p_area_total_m2 = propiedad.area_total_m2
        parametros.p_dormitorios = propiedad.dormitorios
        parametros.p_banos = propiedad.banos
        parametros.p_estacionamientos = propiedad.estacionamientos
    
    SI propiedad.tipo_operacion EXISTE:
        parametros.p_tipo_operacion = propiedad.tipo_operacion
        parametros.p_tipo_propiedad_original = propiedad.tipo_propiedad_original
        parametros.p_estado_construccion = propiedad.estado_construccion
    
    SI propiedad.latitud EXISTE:
        parametros.p_latitud = propiedad.latitud
        parametros.p_longitud = propiedad.longitud
    
    SI propiedad.fecha_publicacion EXISTE:
        parametros.p_fecha_publicacion = propiedad.fecha_publicacion
    
    SI propiedad.metodo_discovery EXISTE:
        parametros.p_metodo_discovery = propiedad.metodo_discovery
    
    // Llamar función SQL con parámetros construidos
    resultado = ejecutar_funcion_sql("registrar_discovery", parametros)

    RETORNAR resultado
FIN
```

**Nota importante:**
- Solo `url`, `fuente` y `datos_json_discovery` son obligatorios
- Todos los demás parámetros son opcionales
- Cada portal puede proporcionar diferentes campos
- La función SQL tiene DEFAULT NULL para todos los opcionales

### Función: marcar_inactivo_pending()

```
FUNCIÓN marcar_inactivo_pending(url)

ENTRADA: url
SALIDA: ninguna

INICIO:
    ejecutar_sql(
        "UPDATE propiedades_v2
         SET status = 'inactivo_pending',
             fecha_deteccion_ausencia = NOW()
         WHERE url = $1
         AND status IN ('nueva', 'actualizado', 'completado')",
        [url]
    )
FIN
```

### Función: extraer_urls()

```
FUNCIÓN extraer_urls(propiedades)

ENTRADA: lista de propiedades
SALIDA: conjunto de urls

INICIO:
    urls = conjunto vacío

    POR CADA propiedad EN propiedades:
        urls.agregar(propiedad.url)

    RETORNAR urls
FIN
```

### Función: generar_reporte()

```
FUNCIÓN generar_reporte(
    timestamp_inicio,
    cantidad_remax,
    cantidad_c21,
    cantidad_unicas,
    resultados_registro,
    cantidad_ausentes,
    fase_5_ejecutada,
    errores
)

ENTRADA: métricas de ejecución
SALIDA: objeto reporte

INICIO:
    timestamp_fin = ahora()

    nuevas = contar(resultados_registro DONDE es_nueva = TRUE)
    actualizadas = contar(resultados_registro DONDE es_nueva = FALSE)

    reporte = {
        timestamp_inicio: timestamp_inicio,
        timestamp_fin: timestamp_fin,
        duracion_segundos: timestamp_fin - timestamp_inicio,

        fuentes: {
            remax: {
                propiedades_encontradas: cantidad_remax,
                paginas_procesadas: 8
            },
            century21: {
                propiedades_encontradas: cantidad_c21,
                cuadrantes_procesados: 6
            }
        },

        consolidado: {
            total_raw: cantidad_remax + cantidad_c21,
            total_unicas: cantidad_unicas,
            duplicados_eliminados: (cantidad_remax + cantidad_c21) - cantidad_unicas
        },

        base_datos: {
            nuevas_insertadas: nuevas,
            existentes_actualizadas: actualizadas
        },

        ausencias: {
            fase_ejecutada: fase_5_ejecutada,
            detectadas: cantidad_ausentes
        },

        errores: errores
    }

    RETORNAR reporte
FIN
```

---

## Constantes de configuración

### Remax

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `REMAX_BASE_URL` | `https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste` | Endpoint API |
| `REMAX_TOTAL_PAGES` | 8 | Páginas para Equipetrol (dic 2025) |
| `REMAX_PER_PAGE` | 20 | Propiedades por página (fijo) |
| `RATE_LIMIT_MS` | 2000 | Espera entre requests |

### Century21

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `C21_BASE_URL` | `https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/` | Endpoint JSON de mapa |
| `EQUIPETROL_LAT_NORTE` | -17.750 | Límite norte bounding box |
| `EQUIPETROL_LAT_SUR` | -17.775 | Límite sur bounding box |
| `EQUIPETROL_LON_ESTE` | -63.185 | Límite este bounding box |
| `EQUIPETROL_LON_OESTE` | -63.205 | Límite oeste bounding box |
| `GRID_STEP` | 0.010 | Tamaño de cuadrante (~1.1km) |
| `RATE_LIMIT_MS` | 2000 | Espera entre requests |

**Nota:** Coordenadas Century21 usan orden invertido: `north,east,south,west` (ver `RESEARCH_CENTURY21_GRID.md` sección 2).

---

## Comparación técnica: Remax vs Century21

Basado en `RESEARCH_REMAX_API.md` y `RESEARCH_CENTURY21_GRID.md`:

| Aspecto | Remax | Century21 |
|---------|-------|-----------|
| **Tipo de endpoint** | API REST paginada | Endpoint JSON de mapa |
| **Método de cobertura** | Paginación secuencial (`?page=N`) | Grid geográfico (bounding boxes) |
| **Headers custom** | No requeridos | ✅ Críticos (CORS, cookies auto-emitidas) |
| **Autenticación** | Ninguna | Cookie PHPSESSID (acepta auto-emitidas) |
| **Paginación** | 8 páginas × 20 items | 6 cuadrantes geográficos |
| **Requests totales** | ~8 requests | ~6 requests |
| **Tiempo estimado** | ~16s (8 pages × 2s) | ~12s (6 cuadrantes × 2s) |
| **Propiedades Equipetrol** | ~153 propiedades | ~42 propiedades |
| **Duplicados** | 0% (paginación única) | 5-10% (grid overlap, requiere dedup) |
| **Parsing** | Directo (`data[]`) | Defensivo (3 estructuras posibles) |
| **Estabilidad** | Alta | Media (estructura JSON variable) |
| **Campos disponibles** | 27+ campos | 60+ campos |
| **GPS** | Siempre presente | Siempre presente |
| **Precio** | ✅ price_in_dollars | ✅ precio + moneda |
| **Área** | ✅ construction_area_m | ✅ superficie |
| **Dormitorios** | ✅ number_bedrooms | ✅ dormitorios |
| **Baños** | ✅ number_bathrooms | ✅ banos |
| **Código propiedad** | MLSID | id |
| **URL construcción** | `/propiedad/{id}` | `{urlCorrectaPropiedad}` |

---

## Output canónico por propiedad

Cada propiedad descubierta debe proporcionar **al menos** estos campos obligatorios:

```json
{
    "url": "string",                    // OBLIGATORIO
    "fuente": "remax | century21",      // OBLIGATORIO
    "datos_json_discovery": {...}       // OBLIGATORIO - Snapshot RAW completo
}
```

**Datos observados opcionales** (extraídos según disponibilidad del portal):

```json
{
    // Identificación
    "codigo_propiedad": "12345",
    
    // Financiero
    "precio_usd": 120000,
    "precio_usd_original": 840000,
    "moneda_original": "BOB | USD",
    
    // Físico
    "area_total_m2": 85,
    "dormitorios": 3,
    "banos": 2,
    "estacionamientos": 1,
    
    // Clasificación
    "tipo_operacion": "venta",
    "tipo_propiedad_original": "Departamento",
    "estado_construccion": "nuevo",
    
    // GPS (opcional pero recomendado)
    "latitud": -17.765,
    "longitud": -63.192,
    
    // Metadata
    "fecha_publicacion": "2025-12-01",
    "metodo_discovery": "api_rest | map_grid"
}
```

**Importante sobre datos observados:**
- Son **auxiliares**, no "verdad final"
- Cada portal puede proporcionar diferentes campos
- Remax típicamente tiene más campos estructurados
- Century21 puede tener campos variables según versión del endpoint
- `datos_json_discovery` siempre contiene el payload RAW completo
- Sirven para detectar cambios pero NO rompen candados
- NO reemplazan Enrichment (Flujo B)

---

## Estructura del reporte de ejecución

```json
{
    "timestamp_inicio": "2025-12-15T01:00:00Z",
    "timestamp_fin": "2025-12-15T01:02:45Z",
    "duracion_segundos": 165,

    "fuentes": {
        "remax": {
            "propiedades_encontradas": 153,
            "paginas_procesadas": 8
        },
        "century21": {
            "propiedades_encontradas": 42,
            "cuadrantes_procesados": 6
        }
    },

    "consolidado": {
        "total_raw": 195,
        "total_unicas": 189,
        "duplicados_eliminados": 6
    },

    "base_datos": {
        "nuevas_insertadas": 5,
        "existentes_actualizadas": 184
    },

    "ausencias": {
        "fase_ejecutada": true,
        "detectadas": 2
    },

    "errores": []
}
```

---

## Checklist de implementación

### Pre-requisitos

- [ ] Tabla `propiedades_v2` existe con columna `status`
- [ ] Columna `fecha_deteccion_ausencia` existe en tabla
- [ ] Función SQL `registrar_discovery()` desplegada
- [ ] Acceso HTTP a APIs de Remax y Century21

### Fase 0: Preparación

- [ ] Implementar `obtener_urls_activas_bd()`
- [ ] Query usa `status IN ('nueva', 'actualizado', 'completado')`

### Fase 1: Remax

- [ ] Implementar `construir_url_remax()`
- [ ] Implementar `scrapear_remax()`
- [ ] Rate limit de 2 segundos entre requests
- [ ] Manejo de errores con flag `remax_exitoso`

### Fase 2: Century21

- [ ] Implementar `generar_cuadrantes_equipetrol()`
- [ ] Implementar `construir_url_c21()`
- [ ] Verificar orden de coordenadas: north, east, south, west
- [ ] Implementar `scrapear_century21()`
- [ ] Implementar headers críticos (CORS + cookies)
- [ ] Implementar parsing defensivo (3 estructuras)
- [ ] Rate limit de 2 segundos entre requests
- [ ] Manejo de errores con flag `c21_exitoso`

### Fase 3: Consolidación

- [ ] Implementar `deduplicar()`
- [ ] Deduplicación por `(url, fuente)` según canonical v2.0

### Fase 4: Registro

- [ ] Implementar `llamar_registrar_discovery()`
- [ ] Pasar campos obligatorios: url, fuente, datos_json_discovery
- [ ] Pasar datos observados opcionales según disponibilidad
- [ ] Cada portal puede proporcionar diferentes campos opcionales

### Fase 5: Ausencias

- [ ] Implementar `extraer_urls()`
- [ ] Implementar `marcar_inactivo_pending()`
- [ ] Protección: solo ejecutar si `remax_exitoso AND c21_exitoso`
- [ ] Usar `fecha_deteccion_ausencia`, NO `fecha_ultimo_avistamiento`
- [ ] WHERE usa `status IN ('nueva', 'actualizado', 'completado')`

### Fase 6: Logging

- [ ] Implementar `generar_reporte()`
- [ ] Incluir warnings si Fase 5 fue omitida

### Orquestador

- [ ] Implementar `ejecutar_flujo_a()`
- [ ] Ejecutar fases en orden correcto
- [ ] Capturar errores por fuente individualmente
- [ ] Retornar reporte completo

### Testing

- [ ] Test unitario: `generar_cuadrantes_equipetrol()` genera ~6 cuadrantes
- [ ] Test unitario: `construir_url_c21()` orden correcto de coordenadas
- [ ] Test unitario: `deduplicar()` elimina duplicados correctamente
- [ ] Test integración: Flujo completo con mocks de API
- [ ] Test integración: Fase 5 omitida cuando falla una fuente

---

## Extensibilidad a nuevos portales

### Agregar un nuevo portal (ejemplo: InfoCasas)

**Paso 1:** Crear función de scraping específica

```
FUNCIÓN scrapear_infocasas()

INICIO:
    propiedades = []
    
    // Implementar lógica específica del portal
    POR CADA resultado EN api_infocasas:
        propiedad = {
            url: resultado.link,                    // OBLIGATORIO
            fuente: "infocasas",                    // OBLIGATORIO
            datos_json_discovery: resultado         // OBLIGATORIO - RAW completo
        }
        
        // Agregar datos observados según disponibilidad
        SI resultado.codigo EXISTE:
            propiedad.codigo_propiedad = resultado.codigo
        
        SI resultado.precio EXISTE:
            propiedad.precio_usd = resultado.precio
            propiedad.moneda_original = "USD"
        
        // ... más campos según lo que provea InfoCasas
        
        propiedad.metodo_discovery = "api_infocasas"
        propiedades.agregar(propiedad)
    
    RETORNAR propiedades
FIN
```

**Paso 2:** Integrar en flujo principal

```
// En ejecutar_flujo_a():

INTENTAR:
    propiedades_infocasas = scrapear_infocasas()
    infocasas_exitoso = TRUE
CAPTURAR error:
    errores.agregar({fuente: "infocasas", error: error})
    propiedades_infocasas = []

// Agregar a consolidación
propiedades_todas = propiedades_remax + propiedades_c21 + propiedades_infocasas
```

**Paso 3:** Actualizar detección de ausencias

```
// Solo ejecutar si TODOS los portales activos tuvieron éxito
SI remax_exitoso Y c21_exitoso Y infocasas_exitoso:
    ejecutar_deteccion_ausencias()
```

**Ventajas de esta arquitectura:**
- Cada portal tiene su propio extractor independiente
- No afecta portales existentes
- Cada portal puede proporcionar diferentes datos observados
- Fácil desactivar portales temporalmente

---

## Reglas de implementación

### Sobre datos observados

1. **Datos observados ≠ Enrichment**
   - Datos observados son extracciones iniciales, NO verdad final
   - NO rompen candados
   - NO reemplazan Enrichment
   - Sirven para detectar cambios y decidir re-scraping

2. **Flexibilidad por portal**
   - Cada portal puede proporcionar diferentes campos opcionales
   - Remax puede tener campos que Century21 no tiene (y viceversa)
   - NO forzar campos que el portal no provee

### Sobre arquitectura

3. **NO** agregar optimizaciones no especificadas
4. **NO** cambiar el orden de las fases
5. **NO** ejecutar Fase 5 si alguna fuente falló
6. **NO** usar `fecha_ultimo_avistamiento` para ausencias
7. **NO** agregar campos extra al output canónico
8. **SÍ** respetar rate limit de 2 segundos
9. **SÍ** deduplicar antes de llamar a BD
10. **SÍ** registrar todos los errores en el reporte
11. **SÍ** mantener independencia entre extractores de portales