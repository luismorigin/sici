# Módulo 1 - Flujo A: Implementación

> **Versión:** 1.0.0
> **Estado:** CONTRATO DE IMPLEMENTACIÓN
> **Fecha:** Diciembre 2025

---

## Resumen ejecutivo

**Flujo A ("El Cazador")** es el proceso de discovery que se ejecuta diariamente a la 1:00 AM para:

1. Descubrir propiedades nuevas en portales inmobiliarios (Remax, Century21)
2. Detectar propiedades que desaparecieron del mercado
3. Registrar hallazgos en la base de datos

**Responsabilidades exclusivas:**
- Insertar propiedades nuevas con status `pendiente`
- Marcar propiedades ausentes como `inactivo_por_confirmar`

**NO es responsable de:**
- Confirmar eliminaciones (eso lo hace Flujo C)
- Enriquecer datos (eso lo hace Módulo 2)
- Extraer precios, amenidades o descripciones

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
│  │   ('pendiente', 'completado')          │                                │
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
│  │ - Deduplicar por (id_externo, fuente)  │                                │
│  └────────────────┬───────────────────────┘                                │
│                   │                                                         │
│                   ▼                                                         │
│  ┌────────────────────────────────────────┐                                │
│  │ FASE 4: REGISTRO EN BD                 │                                │
│  │ - Por cada propiedad única:            │                                │
│  │   └─► llamar registrar_discovery()     │                                │
│  │ - Nueva → INSERT status='pendiente'    │                                │
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
│  │       'inactivo_por_confirmar'         │                                │
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
| `pendiente` | Propiedad nueva descubierta (INSERT) | `registrar_discovery()` |
| `inactivo_por_confirmar` | Propiedad activa no apareció en scrape | `marcar_inactivo_por_confirmar()` |

### ❌ Estados que NO setea

| Estado | Quién lo setea |
|--------|----------------|
| `inactivo` | Flujo C (confirma HTTP 404) |
| `completado` | Flujo C (confirma HTTP 200/3XX) o Merge |
| `actualizado` | `registrar_enrichment()` (Módulo 2) |

---

## Campos de fecha

| Campo | Significado | Cuándo se actualiza |
|-------|-------------|---------------------|
| `fecha_ultimo_avistamiento` | Última vez que la propiedad fue VISTA en un scrape | En `registrar_discovery()` cuando se procesa |
| `fecha_deteccion_ausencia` | Momento en que se detectó que NO apareció | En `marcar_inactivo_por_confirmar()` |

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
            marcar_inactivo_por_confirmar(url)
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
                WHERE status IN ('pendiente', 'completado')"

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

    POR pagina DESDE 1 HASTA 8:
        url = construir_url_remax(pagina)
        respuesta = hacer_get(url)

        SI respuesta.exitosa:
            datos = parsear_json(respuesta)
            POR CADA item EN datos.results:
                propiedad = {
                    id_externo: item.id,
                    fuente: "remax",
                    url_propiedad: "https://remax.bo/propiedad/" + item.id,
                    latitud: convertir_numero(item.latitude),
                    longitud: convertir_numero(item.longitude),
                    metodo_discovery: "api_remax"
                }
                propiedades.agregar(propiedad)
        SINO:
            LANZAR error("Remax página " + pagina + " falló: " + respuesta.status)

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

    POR CADA cuadrante EN cuadrantes:
        url = construir_url_c21(cuadrante)
        respuesta = hacer_get(url)

        SI respuesta.exitosa:
            datos = parsear_json(respuesta)
            POR CADA item EN datos:
                propiedad = {
                    id_externo: item.id,
                    fuente: "century21",
                    url_propiedad: "https://c21.com.bo" + item.urlCorrectaPropiedad,
                    latitud: item.lat,
                    longitud: item.lon,
                    metodo_discovery: "api_c21_grid"
                }
                propiedades.agregar(propiedad)
        SINO:
            LANZAR error("Century21 cuadrante falló: " + respuesta.status)

        esperar(2 segundos)

    RETORNAR propiedades
FIN
```

### Función: generar_cuadrantes_equipetrol()

```
FUNCIÓN generar_cuadrantes_equipetrol()

ENTRADA: ninguna
SALIDA: lista de cuadrantes {north, south, east, west}

INICIO:
    // Bounding box Equipetrol (validado diciembre 2025)
    NORTE = -17.750
    SUR = -17.790
    ESTE = -63.170
    OESTE = -63.210
    STEP = 0.010

    cuadrantes = []

    lat = NORTE
    MIENTRAS lat > SUR:
        lon = OESTE
        MIENTRAS lon < ESTE:
            cuadrante = {
                north: lat,
                south: lat - STEP,
                west: lon,
                east: lon + STEP
            }
            cuadrantes.agregar(cuadrante)
            lon = lon + STEP
        lat = lat - STEP

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

    RETORNAR base + filtros + coords + ",16?json=true"
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
        clave = (propiedad.id_externo, propiedad.fuente)

        SI clave NO EN vistos:
            vistos.agregar(clave)
            unicas.agregar(propiedad)

    RETORNAR unicas
FIN
```

### Función: llamar_registrar_discovery()

```
FUNCIÓN llamar_registrar_discovery(propiedad)

ENTRADA: propiedad
SALIDA: resultado {id, status, es_nueva, cambios}

INICIO:
    resultado = ejecutar_funcion_sql(
        "registrar_discovery",
        parametros: {
            p_url: propiedad.url_propiedad,
            p_fuente: propiedad.fuente,
            p_codigo_propiedad: propiedad.id_externo,
            p_latitud: propiedad.latitud,
            p_longitud: propiedad.longitud,
            p_metodo_discovery: propiedad.metodo_discovery,
            p_datos_json_discovery: propiedad
        }
    )

    RETORNAR resultado
FIN
```

### Función: marcar_inactivo_por_confirmar()

```
FUNCIÓN marcar_inactivo_por_confirmar(url)

ENTRADA: url
SALIDA: ninguna

INICIO:
    ejecutar_sql(
        "UPDATE propiedades_v2
         SET status = 'inactivo_por_confirmar',
             fecha_deteccion_ausencia = NOW()
         WHERE url = $1
         AND status IN ('pendiente', 'completado')",
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
        urls.agregar(propiedad.url_propiedad)

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
                cuadrantes_procesados: 16
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

## Parámetros de configuración

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `REMAX_PAGINAS` | 1-8 | Rango de páginas a consultar |
| `REMAX_BASE_URL` | `https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste` | Endpoint API |
| `C21_BASE_URL` | `https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/` | Endpoint API |
| `EQUIPETROL_NORTE` | -17.750 | Límite norte bounding box |
| `EQUIPETROL_SUR` | -17.790 | Límite sur bounding box |
| `EQUIPETROL_ESTE` | -63.170 | Límite este bounding box |
| `EQUIPETROL_OESTE` | -63.210 | Límite oeste bounding box |
| `GRID_STEP` | 0.010 | Tamaño de cuadrante en grados |
| `RATE_LIMIT_MS` | 2000 | Espera entre requests |

---

## Output canónico por propiedad

Cada propiedad descubierta tiene exactamente estos campos:

```json
{
    "id_externo": "string",
    "fuente": "remax | century21",
    "url_propiedad": "string",
    "latitud": "number",
    "longitud": "number",
    "metodo_discovery": "api_remax | api_c21_grid"
}
```

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
            "cuadrantes_procesados": 16
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
- [ ] Query usa `status IN ('pendiente', 'completado')`

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
- [ ] Rate limit de 2 segundos entre requests
- [ ] Manejo de errores con flag `c21_exitoso`

### Fase 3: Consolidación

- [ ] Implementar `deduplicar()`
- [ ] Deduplicación por `(id_externo, fuente)`

### Fase 4: Registro

- [ ] Implementar `llamar_registrar_discovery()`
- [ ] Pasar todos los campos requeridos a función SQL

### Fase 5: Ausencias

- [ ] Implementar `extraer_urls()`
- [ ] Implementar `marcar_inactivo_por_confirmar()`
- [ ] Protección: solo ejecutar si `remax_exitoso AND c21_exitoso`
- [ ] Usar `fecha_deteccion_ausencia`, NO `fecha_ultimo_avistamiento`
- [ ] WHERE usa `status IN ('pendiente', 'completado')`

### Fase 6: Logging

- [ ] Implementar `generar_reporte()`
- [ ] Incluir warnings si Fase 5 fue omitida

### Orquestador

- [ ] Implementar `ejecutar_flujo_a()`
- [ ] Ejecutar fases en orden correcto
- [ ] Capturar errores por fuente individualmente
- [ ] Retornar reporte completo

### Testing

- [ ] Test unitario: `generar_cuadrantes_equipetrol()` genera ~16 cuadrantes
- [ ] Test unitario: `construir_url_c21()` orden correcto de coordenadas
- [ ] Test unitario: `deduplicar()` elimina duplicados correctamente
- [ ] Test integración: Flujo completo con mocks de API
- [ ] Test integración: Fase 5 omitida cuando falla una fuente

---

## Reglas de implementación

1. **NO** agregar optimizaciones no especificadas
2. **NO** cambiar el orden de las fases
3. **NO** ejecutar Fase 5 si alguna fuente falló
4. **NO** usar `fecha_ultimo_avistamiento` para ausencias
5. **NO** agregar campos extra al output canónico
6. **SÍ** respetar rate limit de 2 segundos
7. **SÍ** deduplicar antes de llamar a BD
8. **SÍ** registrar todos los errores en el reporte
