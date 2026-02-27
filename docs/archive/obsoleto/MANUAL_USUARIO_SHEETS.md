# Manual de Usuario - Hojas de Aprobación SICI

> **Versión:** 1.0
> **Fecha:** 30 Diciembre 2025
> **Para:** Usuarios que revisan y aprueban datos en Google Sheets

---

## Índice

1. [SICI - Matching Bandeja de Aprobación](#1-sici---matching-bandeja-de-aprobación)
2. [SICI - Radar Bandeja de Aprobación](#2-sici---radar-bandeja-de-aprobación)
3. [Preguntas Frecuentes](#3-preguntas-frecuentes)

---

## 1. SICI - Matching Bandeja de Aprobación

### ¿Qué es?

Esta hoja contiene **sugerencias de matching** entre propiedades y proyectos (edificios). El sistema detectó que una propiedad podría pertenecer a un proyecto específico, pero necesita tu confirmación.

### ¿Cuándo llegan datos?

- **Todos los días a las 4:00 AM** el sistema analiza propiedades nuevas
- Las sugerencias con 70-84% de confianza aparecen aquí para revisión
- Las de 85%+ se aprueban automáticamente

### Columnas de la Hoja

| Columna | Descripción | ¿Editable? |
|---------|-------------|------------|
| A - ID_SUGERENCIA | ID único de la sugerencia | NO |
| B - FECHA | Fecha de la sugerencia | NO |
| C - PROPIEDAD_ID | ID de la propiedad | NO |
| D - URL_PROPIEDAD | Link a la propiedad en el portal | NO (pero clickeable) |
| E - NOMBRE_EDIFICIO | Nombre extraído de la propiedad | NO |
| F - PROYECTO_SUGERIDO | Proyecto que el sistema sugiere | NO |
| G - PROYECTO_ID | ID del proyecto sugerido | NO |
| H - METODO | Cómo se encontró el match | NO |
| I - CONFIANZA | Porcentaje de certeza (70-84) | NO |
| J - DISTANCIA_M | Distancia GPS en metros | NO |
| K - LINK_MAPS | Link a Google Maps | NO (pero clickeable) |
| **L - ACCION (Humano)** | **Tu decisión** | **SÍ** |
| **M - PROYECTO_ALTERNATIVO** | **Nombre correcto del edificio** | **SÍ** |
| **N - GPS_ALTERNATIVO** | **Coordenadas correctas** | **SÍ** |

### Cómo Tomar Decisiones

#### Opción 1: APROBAR (✅)

Usa esto cuando el proyecto sugerido **ES CORRECTO**.

1. Verifica clickeando en URL_PROPIEDAD y LINK_MAPS
2. Confirma que el edificio coincide
3. Cambia la columna L a: `✅ APROBAR`

#### Opción 2: RECHAZAR Simple (❌)

Usa esto cuando el proyecto sugerido **ES INCORRECTO** pero no tienes tiempo de buscar el correcto.

1. Cambia la columna L a: `❌ RECHAZAR`
2. La fila quedará en el Sheet para resolver después

#### Opción 3: RECHAZAR con Alternativo (❌ + Proyecto)

Usa esto cuando el proyecto sugerido **ES INCORRECTO** y sabes cuál es el correcto.

1. Cambia la columna L a: `❌ RECHAZAR`
2. En columna M (PROYECTO_ALTERNATIVO): escribe el nombre correcto del edificio
3. En columna N (GPS_ALTERNATIVO): pega las coordenadas de Google Maps

**Cómo obtener las coordenadas GPS:**
1. Abre Google Maps
2. Busca el edificio correcto
3. Click derecho sobre el edificio
4. Click en las coordenadas que aparecen (las copia automáticamente)
5. Pega en columna N (formato: `-17.75669, -63.19757`)

### ¿Qué Pasa Después?

- **Todos los días a las 8:00 PM** el Supervisor procesa tus decisiones
- Las aprobadas se aplican a la base de datos
- Las rechazadas con alternativo crean el proyecto nuevo y aplican el match
- Las rechazadas simples se quedan para que las resuelvas después
- Recibirás un mensaje en Slack con el resumen

### Ejemplo Práctico

```
Situación: Ves una fila donde:
- NOMBRE_EDIFICIO = "Depto en Torre Sol"
- PROYECTO_SUGERIDO = "Torre Luna" (70% confianza)

Pasos:
1. Click en LINK_MAPS → Ves la ubicación en el mapa
2. Click en URL_PROPIEDAD → Ves la publicación
3. Notas que el edificio real se llama "Torre Solar"

Acción:
- Columna L: ❌ RECHAZAR
- Columna M: Torre Solar
- Columna N: -17.76543, -63.19876 (copiado de Google Maps)
```

---

## 2. SICI - Radar Bandeja de Aprobación

### ¿Qué es?

Esta hoja contiene **proyectos que necesitan verificación GPS**. Son edificios en la base de datos cuyas coordenadas pueden estar incorrectas o desactualizadas.

### ¿Cuándo llegan datos?

- **El primer día de cada mes** el Radar escanea proyectos
- Detecta proyectos con GPS sospechoso o sin verificar
- Los envía aquí para que verifiques manualmente

### Columnas de la Hoja

| Columna | Descripción | ¿Editable? |
|---------|-------------|------------|
| A - ID_PROYECTO | ID del proyecto en la BD | NO |
| B - NOMBRE_PROYECTO | Nombre oficial del edificio | NO |
| C - ZONA | Zona donde está ubicado | NO |
| D - LAT_ACTUAL | Latitud actual en BD | NO |
| E - LNG_ACTUAL | Longitud actual en BD | NO |
| F - LINK_MAPS | Link a ubicación actual | NO (pero clickeable) |
| G - RAZON_REVISION | Por qué necesita revisión | NO |
| **H - ACCION (Humano)** | **Tu decisión** | **SÍ** |
| **I - LAT_CORREGIDA** | **Latitud correcta** | **SÍ** |
| **J - LNG_CORREGIDA** | **Longitud correcta** | **SÍ** |
| **K - NOTAS** | **Observaciones opcionales** | **SÍ** |

### Cómo Tomar Decisiones

#### Opción 1: GPS CORRECTO (✅)

Usa esto cuando la ubicación actual **ES CORRECTA**.

1. Click en LINK_MAPS para ver la ubicación
2. Confirma que el pin está sobre el edificio correcto
3. Cambia columna H a: `✅ GPS CORRECTO`

#### Opción 2: GPS INCORRECTO - Corregir (🔧)

Usa esto cuando la ubicación **ES INCORRECTA** y puedes corregirla.

1. Busca el edificio correcto en Google Maps
2. Click derecho sobre el edificio → Copia coordenadas
3. Cambia columna H a: `🔧 CORREGIR GPS`
4. Pega la latitud en columna I (ej: `-17.76543`)
5. Pega la longitud en columna J (ej: `-63.19876`)

**Tip:** Google Maps copia ambas coordenadas juntas. Sepáralas:
- Antes de la coma → Latitud (columna I)
- Después de la coma → Longitud (columna J)

#### Opción 3: NO ENCONTRADO (❓)

Usa esto cuando **NO PUEDES UBICAR** el edificio.

1. Cambia columna H a: `❓ NO ENCONTRADO`
2. Opcionalmente escribe en columna K por qué no lo encontraste

### ¿Qué Pasa Después?

- El Supervisor procesa tus decisiones periódicamente
- Los GPS corregidos se actualizan en la base de datos
- Los marcados como correctos se marcan como verificados
- Los no encontrados quedan para investigación posterior

### Ejemplo Práctico

```
Situación: Ves una fila donde:
- NOMBRE_PROYECTO = "Edificio Amazonas"
- RAZON_REVISION = "GPS heredado de propiedad, no verificado"
- LINK_MAPS muestra un punto en medio de la calle

Pasos:
1. Click en LINK_MAPS → Ves que el pin NO está sobre un edificio
2. Buscas "Edificio Amazonas Santa Cruz" en Google Maps
3. Encuentras el edificio real 2 cuadras al norte

Acción:
- Columna H: 🔧 CORREGIR GPS
- Columna I: -17.76234
- Columna J: -63.19567
- Columna K: "Estaba 2 cuadras al sur del edificio real"
```

---

## 3. Preguntas Frecuentes

### General

**¿Puedo dejar filas sin procesar?**
> Sí. Las filas pendientes se quedan hasta que tomes una decisión. El sistema no las borra.

**¿Qué pasa si me equivoco?**
> Contacta al administrador. Los cambios se pueden revertir en la base de datos.

**¿Cuánto tiempo tengo para revisar?**
> No hay límite. Pero el Supervisor corre a las 8 PM, así que si quieres que se procesen hoy, decide antes de esa hora.

### Matching

**¿Por qué algunas sugerencias tienen 70% y otras 84%?**
> El porcentaje indica qué tan seguro está el sistema. 70% = menos seguro, necesita más revisión. 84% = bastante seguro pero no al 100%.

**¿Qué es "gps_verificado" vs "fuzzy" en METODO?**
> - `gps_verificado`: Match por cercanía GPS (metros)
> - `fuzzy`: Match por similitud de nombre
> - `nombre`: Match exacto por nombre
> - `url`: Match por URL del proyecto

**¿Puedo aprobar sin verificar en Google Maps?**
> No recomendado. Siempre verifica visualmente que el edificio coincida.

### Radar

**¿Por qué un proyecto necesita verificación GPS?**
> Razones comunes:
> - GPS heredado de una propiedad (puede ser aproximado)
> - Proyecto creado manualmente sin verificar
> - Zona con muchos edificios cercanos

**¿Qué hago si hay 2 edificios con el mismo nombre?**
> Verifica cuál es el correcto usando la dirección, fotos, o información adicional. Escribe en NOTAS cuál elegiste y por qué.

---

## Contacto

Si tienes dudas o encuentras errores, contacta al administrador del sistema SICI.

---

*Manual generado el 30 de Diciembre 2025*
