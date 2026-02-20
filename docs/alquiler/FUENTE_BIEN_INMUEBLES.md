# Fuente: Bien Inmuebles — Investigación y Plan de Integración

**Fecha investigación:** 20 Feb 2026
**Estado:** Investigación completada, pendiente implementación
**URL:** https://www.bieninmuebles.com.bo/
**Tipo:** Portal inmobiliario multi-agente (no es una inmobiliaria única)
**Cobertura:** Santa Cruz + Beni
**Operaciones:** Venta, Alquiler, Anticrético

---

## 1. API Interna Descubierta

La búsqueda del sitio usa AJAX (no HTML estático). Se interceptó el endpoint via DevTools.

### Endpoint

```
POST https://www.bieninmuebles.com.bo/common/php/procesos.php
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

### Parámetros del POST

| Parámetro | Tipo | Descripción | Valores conocidos |
|-----------|------|-------------|-------------------|
| `proceso` | string | Acción a ejecutar | `getCatalogo` |
| `search` | string | Texto de búsqueda | `equipetrol`, vacío = todo |
| `modalidad` | int | Tipo de operación | `1` = Venta, `2` = Alquiler, `3` = Anticrético (probable) |
| `id_fami` | int | Tipo de propiedad | `1` = Departamento, `0` = Todos |
| `id_orig` | int | Origen/ciudad | `0` = Todos |
| `id_habi` | int | Filtro dormitorios | `0` = Todos |
| `id_bano` | int | Filtro baños | `0` = Todos |
| `id_gara` | int | Filtro garajes | `0` = Todos |
| `id_carac` | string | Filtro características | vacío = todas |
| `minprecio` | int | Precio mínimo | `100` |
| `maxprecio` | int | Precio máximo | `10000000` |
| `page` | int | Página (paginación) | `1`, `2`, ... |
| `filas` | int | Resultados por página | `60` (default) |

### Headers requeridos

```
x-requested-with: XMLHttpRequest
origin: https://www.bieninmuebles.com.bo
referer: https://www.bieninmuebles.com.bo/search.php?md=2&fm=1
```

**Nota:** Puede requerir cookie `PHPSESSID` válida. Verificar si funciona sin sesión.

---

## 2. Estructura del Response (JSON)

La API devuelve un **array JSON** directamente. Cada elemento es un listing:

```json
{
  "id_cata": "5076",
  "code_cata": "5076",
  "nomb_cata": "En alquiler departamento amoblado de 1 dormitorio en Equipetrol.",
  "habitacion_cata": "1",
  "banio_cata": "1",
  "modalidad_cata": "2",
  "destaca_cata": "0",
  "ubic_cata": "",
  "precio_cata": "3,200",
  "moneda_cata": "1",
  "nomb_img": "6363692dad8378c509042f185d3aec37.jpg",
  "cliente_img": "",
  "amigo_clie": "",
  "supterreno_cata": 40,
  "nomb_grup": "Santa Cruz",
  "nomb_barri": "Equipetrol",
  "latitud_cata": "-17.76646283587531",
  "longitud_cata": "-63.192947655916214",
  "direccion_cata": "EQUIPETROL CALLE 5 ESTE CONDOMINIO MALIBU FRIENDLY.",
  "view_cata": "629"
}
```

### Diccionario de campos

| Campo | Tipo | Descripción | Notas |
|-------|------|-------------|-------|
| `id_cata` | string | ID único del listing | Usar como `codigo_propiedad` |
| `code_cata` | string | Código público | Igual a `id_cata` |
| `nomb_cata` | string | Título del listing | Contiene info útil (amoblado, proyecto, etc.) |
| `habitacion_cata` | string | Dormitorios | Parsear a int |
| `banio_cata` | string | Baños | Parsear a int |
| `modalidad_cata` | string | Tipo operación | `"2"` = Alquiler |
| `destaca_cata` | string | Destacado | `"0"` o `"1"` |
| `precio_cata` | string | Precio | **Tiene comas** (ej: `"3,200"`) — limpiar antes de parsear |
| `moneda_cata` | string | Moneda | `"1"` = BOB (verificar si `"2"` = USD) |
| `supterreno_cata` | number | Área m² | Viene como número, no string |
| `nomb_grup` | string | Ciudad | `"Santa Cruz"` |
| `nomb_barri` | string | Barrio/Zona | `"Equipetrol"`, etc. |
| `latitud_cata` | string | Latitud GPS | Puede estar vacío `""` |
| `longitud_cata` | string | Longitud GPS | Puede estar vacío `""` |
| `direccion_cata` | string | Dirección textual | Contiene nombre edificio/proyecto frecuentemente |
| `nomb_img` | string | Foto principal (filename) | URL completa por determinar |
| `cliente_img` | string | Foto del agente | |
| `amigo_clie` | string | Nombre del agente | `"AlenkaLopez"`, puede estar vacío |
| `view_cata` | string | Visitas al listing | |

---

## 3. Mapeo a `registrar_discovery_alquiler()`

| Parámetro SICI | Campo Bien Inmuebles | Transformación |
|----------------|---------------------|----------------|
| `p_url` | `id_cata` | `'https://www.bieninmuebles.com.bo/property.php?id=' + id_cata` |
| `p_fuente` | — | `'bieninmuebles'` (constante) |
| `p_codigo_propiedad` | `code_cata` | Directo |
| `p_precio_mensual_bob` | `precio_cata` + `moneda_cata` | Si `moneda_cata = "1"`: quitar comas, parsear. Si `"2"`: convertir USD→BOB |
| `p_precio_mensual_usd` | `precio_cata` + `moneda_cata` | Inverso al anterior |
| `p_moneda_original` | `moneda_cata` | `"1"` → `'BOB'`, `"2"` → `'USD'` |
| `p_area_total_m2` | `supterreno_cata` | Directo (ya es número). **OJO:** dice "terreno" pero parece ser área construida |
| `p_dormitorios` | `habitacion_cata` | `parseInt()` |
| `p_banos` | `banio_cata` | `parseInt()` |
| `p_tipo_propiedad_original` | — | Inferir de `nomb_cata` o hardcode `'departamento'` si `id_fami=1` |
| `p_latitud` | `latitud_cata` | `parseFloat()`, ignorar si vacío |
| `p_longitud` | `longitud_cata` | `parseFloat()`, ignorar si vacío |
| `p_zona` | `nomb_barri` | Directo. Mapear a zonas SICI si es necesario |
| `p_datos_json_discovery` | todo el objeto | Guardar JSON completo del listing |

---

## 4. Ventajas vs Fuentes Actuales

| Aspecto | C21 | Remax | Bien Inmuebles |
|---------|-----|-------|----------------|
| Método extracción | HTML scraping | HTML scraping | **JSON API nativa** |
| GPS | Rara vez | Rara vez | **Mayoría de listings** |
| Baños | En descripción | En descripción | **Campo directo** |
| Agente | No disponible | No disponible | **Nombre agente** |
| Dirección | En descripción | No | **Campo directo** (incluye nombre edificio) |
| Fotos | Galería HTML | Galería HTML | Filename (URL base por determinar) |
| Estabilidad | Depende de HTML | Depende de HTML | **API estable** |

---

## 5. Pendientes de Investigación

### Prioritarios (antes de implementar)

- [ ] **Volumen total:** Buscar con `search=` vacío + `modalidad=2` para contar todos los alquileres en Santa Cruz
- [ ] **Volumen Equipetrol:** Verificar cuántos listings de alquiler hay en zona Equipetrol (la búsqueda del 20 Feb devolvió al menos 6+)
- [ ] **Paginación:** Probar `page=2` para confirmar que la paginación funciona. Verificar si devuelve array vacío `[]` cuando no hay más
- [ ] **URL de fotos:** Determinar la URL base para las imágenes (probablemente `https://www.bieninmuebles.com.bo/uploads/` o similar)
- [ ] **Moneda "2":** Verificar si `moneda_cata = "2"` corresponde a USD
- [ ] **Sin sesión:** Probar el POST sin cookie `PHPSESSID` para ver si funciona (importante para n8n)
- [ ] **Campo `supterreno_cata`:** Verificar si es área construida o terreno (ID 5355 tiene 300m² para un monoambiente — sospechoso)
- [ ] **Página de detalle:** Verificar si `property.php?id=X` tiene datos adicionales no presentes en el catálogo (descripción completa, más fotos, amenidades)

### Secundarios

- [ ] **Rate limiting:** Probar requests consecutivos rápidos para detectar throttling
- [ ] **Anticrético:** Si `modalidad=3` funciona, podríamos capturar anticréticos también (futuro)
- [ ] **Mapeo de zonas:** `nomb_barri` puede tener nombres diferentes a los de SICI — crear tabla de equivalencias

---

## 6. Listings Verificados (20 Feb 2026)

Edificios detectados que **ya existen en SICI** (overlap útil para deduplicación):

| ID | Edificio | Zona | Precio Bs | Dorms |
|----|----------|------|-----------|-------|
| 5076 | Condominio Malibu Friendly | Equipetrol | 3,200 | 1 |
| 5302 | Edificio You | Equipetrol | 3,900 | 1 |
| 5332 | Torre Omnia Suites | Equipetrol | 6,000 | 3 |
| 5355 | Condominio Tuareg | Equipetrol | 2,700 | 1 |
| 5401 | Madero Residence | Equipetrol | 9,744 | 2 |
| 5495 | Baruc IV | Canal Isuto | — | 1 |

---

## 7. Plan de Implementación

### Workflow n8n: Discovery Bien Inmuebles

```
Horario: 2:30 AM (entre C21 2:00 y Enrichment 3:00)
Frecuencia: Diario

Pasos:
1. HTTP POST → getCatalogo (modalidad=2, page=1, filas=60)
2. Loop: si response.length == 60, pedir page+1
3. Por cada listing:
   a. Construir URL: property.php?id={id_cata}
   b. Parsear precio (quitar comas, detectar moneda)
   c. Parsear GPS (ignorar si vacío)
   d. Llamar registrar_discovery_alquiler()
4. Log resultados
```

### Qué NO necesita cambios

- `registrar_discovery_alquiler()` — ya acepta cualquier fuente
- `registrar_enrichment_alquiler()` — funciona igual
- `merge_alquiler()` — funciona igual
- Dashboard Market Alquileres — ya soporta múltiples fuentes
- Flujo C Verificador — universal

### Esfuerzo estimado

| Tarea | Tiempo |
|-------|--------|
| Resolver pendientes de investigación | 1-2 horas |
| Crear workflow n8n | 4-6 horas |
| Testing en staging | 2 horas |
| Activar producción | 30 min |
| **Total** | **~8-10 horas** |

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| API requiere sesión/cookie | No funciona desde n8n | Hacer login previo o usar cookie renovable |
| Bajo volumen Equipetrol | Poco valor añadido | Evaluar antes de invertir tiempo |
| `supterreno_cata` es terreno, no construido | Áreas incorrectas | Obtener área de página de detalle |
| Cambio de API sin aviso | Discovery se rompe | Alertas en workflow + monitoreo |
| Duplicados con C21/Remax | Mismo depto en 3 fuentes | Deduplicación por proyecto+dorms+área (ya existe) |
