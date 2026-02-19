# LLM Enrichment Prompt Schema

## Arquitectura de Llamada

```
n8n Workflow
    │
    ├─ Query propiedades sin enrichment
    │  (status='discovery_completo')
    │
    ├─ Para cada propiedad:
    │  │
    │  ├─ Construir prompt con HTML + datos parciales
    │  │
    │  ├─ HTTP Request → Anthropic API
    │  │  (Claude Sonnet 4.5 o Haiku 4.0)
    │  │
    │  ├─ Parsear JSON response
    │  │
    │  └─ registrar_enrichment_alquiler(id, json_data)
    │
    └─ Log errores a workflow_executions
```

## Prompt Template

```markdown
Eres un asistente especializado en extracción de datos de propiedades inmobiliarias en Bolivia.

CONTEXTO:
- País: Bolivia
- Moneda: Bolivianos (Bs)
- Mercado: Alquileres residenciales (departamentos/casas)
- Fuente: {fuente} (C21 o Remax)

DATOS PARCIALES EXTRAÍDOS:
```json
{
  "url": "{url}",
  "titulo": "{titulo}",
  "tipo_operacion": "alquiler",
  "tipo_propiedad": "{tipo_propiedad}",
  "zona": "{zona}",
  "precio_texto": "{precio_texto}",
  "datos_basicos": {
    "area": "{area_si_existe}",
    "dormitorios": "{dormitorios_si_existe}",
    "banos": "{banos_si_existe}"
  }
}
```

HTML COMPLETO DE LA PROPIEDAD:
```html
{html_contenido}
```

TAREA:
Extrae TODOS los datos posibles del HTML y devuelve un JSON estructurado.

REGLAS CRÍTICAS:
1. Si un dato NO aparece en el HTML, usa `null` (NO inventes datos)
2. Precios SIEMPRE en números sin puntos/comas (ej: 5000 no "5.000")
3. Área en metros cuadrados (número decimal)
4. Dormitorios/baños como enteros
5. Para amenities/equipamiento, busca en descripciones textuales
6. Si detectas "Bs" o "$us" en precio, extrae ambos montos
7. Expensas/gastos comunes van separadas del precio
8. Depósito de garantía (generalmente 1-2 meses de alquiler)
9. Amoblado: true/false/null
10. Acepta mascotas: true/false/null

SCHEMA DE SALIDA (JSON):
```json
{
  "precio_alquiler_bs": number | null,        // Precio mensual en Bs
  "precio_alquiler_usd": number | null,       // Si publicitan en USD
  "expensas_bs": number | null,               // Gastos comunes mensuales
  "deposito_garantia_bs": number | null,      // Depósito (meses * precio)
  "duracion_minima_meses": number | null,     // Contrato mínimo (6/12/24)

  "area_construida": number | null,           // m² totales
  "area_terreno": number | null,              // Solo para casas
  "dormitorios": number | null,
  "banos": number | null,
  "medio_banos": number | null,               // Baños sin ducha
  "estacionamientos": number | null,
  "baulera": boolean | null,

  "piso": number | null,                      // Número de piso
  "amoblado": boolean | null,                 // Viene con muebles
  "acepta_mascotas": boolean | null,
  "servicios_incluidos": string[] | null,     // ["agua", "luz", "gas", "internet"]

  "amenities_edificio": {                     // Amenidades del edificio
    "piscina": boolean | null,
    "gimnasio": boolean | null,
    "salon_eventos": boolean | null,
    "area_parrillera": boolean | null,
    "seguridad_24h": boolean | null,
    "ascensor": boolean | null,
    "estacionamiento_visitas": boolean | null,
    "area_juegos_ninos": boolean | null,
    "lavanderia": boolean | null
  },

  "equipamiento_unidad": {                    // Equipamiento de la unidad
    "cocina_equipada": boolean | null,
    "horno": boolean | null,
    "refrigeradora": boolean | null,
    "lavadora": boolean | null,
    "secadora": boolean | null,
    "calefon": boolean | null,
    "aire_acondicionado": boolean | null,
    "calefaccion": boolean | null,
    "closets_empotrados": boolean | null,
    "balcon": boolean | null,
    "terraza": boolean | null,
    "vista_exterior": boolean | null
  },

  "descripcion_limpia": string | null,        // Descripción sin promociones
  "estado_propiedad": "nuevo" | "excelente" | "bueno" | "regular" | null,

  "agente_nombre": string | null,          // Nombre del agente/asesor
  "agente_telefono": string | null,        // Teléfono (+591...)
  "agente_oficina": string | null,         // Inmobiliaria (Century 21 X, RE/MAX Y)

  "fotos_urls": string[],                     // URLs de imágenes

  "fecha_publicacion": string | null,         // ISO 8601 si aparece

  "notas_extraccion": string | null           // Observaciones del LLM
}
```

EJEMPLOS DE PATRONES COMUNES:

**Precio con expensas:**
"Alquiler: Bs 4.500 + Expensas Bs 350" → precio_alquiler_bs: 4500, expensas_bs: 350

**Amoblado:**
"Departamento amoblado" → amoblado: true
"Sin muebles" → amoblado: false

**Mascotas:**
"Se aceptan mascotas pequeñas" → acepta_mascotas: true
"No se permiten animales" → acepta_mascotas: false

**Duración:**
"Contrato mínimo 12 meses" → duracion_minima_meses: 12

**Servicios:**
"Incluye agua, luz e internet" → servicios_incluidos: ["agua", "luz", "internet"]

Devuelve SOLO el JSON, sin explicaciones adicionales.
```

## Ejemplo de Input/Output

### Input al LLM:
```json
{
  "url": "https://c21.com.bo/arriendo/12345",
  "titulo": "Departamento 2 Dormitorios Equipetrol",
  "tipo_operacion": "alquiler",
  "tipo_propiedad": "departamento",
  "zona": "Equipetrol",
  "precio_texto": "Bs 5.500",
  "datos_basicos": {
    "area": "85",
    "dormitorios": "2",
    "banos": null
  },
  "html_contenido": "<div class='descripcion'>Hermoso departamento amoblado, 2 dormitorios, 2 baños, piso 8, con piscina y gimnasio. Expensas: Bs 400. Contrato mínimo 12 meses. No se aceptan mascotas...</div>"
}
```

### Output del LLM:
```json
{
  "precio_alquiler_bs": 5500,
  "precio_alquiler_usd": null,
  "expensas_bs": 400,
  "deposito_garantia_bs": null,
  "duracion_minima_meses": 12,

  "area_construida": 85,
  "area_terreno": null,
  "dormitorios": 2,
  "banos": 2,
  "medio_banos": null,
  "estacionamientos": null,
  "baulera": null,

  "piso": 8,
  "amoblado": true,
  "acepta_mascotas": false,
  "servicios_incluidos": null,

  "amenities_edificio": {
    "piscina": true,
    "gimnasio": true,
    "salon_eventos": null,
    "area_parrillera": null,
    "seguridad_24h": null,
    "ascensor": true,
    "estacionamiento_visitas": null,
    "area_juegos_ninos": null,
    "lavanderia": null
  },

  "equipamiento_unidad": {
    "cocina_equipada": null,
    "horno": null,
    "refrigeradora": null,
    "lavadora": null,
    "secadora": null,
    "calefon": null,
    "aire_acondicionado": null,
    "calefaccion": null,
    "closets_empotrados": null,
    "balcon": null,
    "terraza": null,
    "vista_exterior": null
  },

  "descripcion_limpia": "Hermoso departamento amoblado, 2 dormitorios, 2 baños, piso 8, con piscina y gimnasio.",
  "estado_propiedad": "excelente",

  "agente_nombre": "María López",
  "agente_telefono": "+591 70123456",
  "agente_oficina": "Century 21 Select",

  "fotos_urls": [],

  "fecha_publicacion": null,

  "notas_extraccion": "Detectado piso 8 en descripción, amoblado confirmado, no acepta mascotas explícito"
}
```

## Manejo Unificado Venta/Alquiler

**Opción A: Prompt único con condicional**
```markdown
Si tipo_operacion == "venta":
  - Extrae: precio_venta_bs, precio_venta_usd, precio_m2, forma_pago, etc.
  - Ignora: expensas, duracion_minima, amoblado

Si tipo_operacion == "alquiler":
  - Extrae: precio_alquiler_bs, expensas, deposito, duracion_minima, amoblado
  - Ignora: precio_m2, forma_pago, TC paralelo
```

**Opción B (RECOMENDADA): Prompts separados**
- `enrichment_prompt_venta.txt`
- `enrichment_prompt_alquiler.txt`
- Más claridad, menos tokens desperdiciados
- n8n elige prompt según `tipo_operacion`

## Validación Post-LLM (n8n)

```javascript
// Nodo "Validar Response LLM"
const data = JSON.parse($input.item.json.llm_response);

// Validaciones críticas
const errores = [];

if (data.precio_alquiler_bs === null && data.precio_alquiler_usd === null) {
  errores.push("Sin precio detectado");
}

if (data.dormitorios !== null && (data.dormitorios < 0 || data.dormitorios > 10)) {
  errores.push(`Dormitorios fuera de rango: ${data.dormitorios}`);
}

if (data.area_construida !== null && (data.area_construida < 15 || data.area_construida > 1000)) {
  errores.push(`Área sospechosa: ${data.area_construida}m²`);
}

if (data.expensas_bs !== null && data.expensas_bs > data.precio_alquiler_bs) {
  errores.push("Expensas mayores que alquiler (revisar)");
}

// Si hay errores, enviar a cola de revisión manual
if (errores.length > 0) {
  return {
    requiere_revision: true,
    errores: errores,
    data: data
  };
}

return {
  requiere_revision: false,
  data: data
};
```

## Rate Limiting y Costos

### Estrategia de Rate Limiting
```javascript
// n8n Workflow: Enrichment Alquiler
{
  "nodes": [
    {
      "name": "Batching",
      "type": "Loop",
      "parameters": {
        "batchSize": 10,        // Procesar 10 props a la vez
        "waitBetweenBatches": 5  // 5 segundos entre batches
      }
    }
  ]
}
```

### Estimación de Costos (Claude Sonnet 4.5)
```
Input por propiedad:
- Prompt template: ~800 tokens
- HTML contenido: ~2,000 tokens (promedio)
- Datos parciales JSON: ~200 tokens
Total input: ~3,000 tokens

Output por propiedad:
- JSON estructurado: ~500 tokens

Costo por propiedad:
- Input: 3,000 tokens × $0.003/1K = $0.009
- Output: 500 tokens × $0.015/1K = $0.0075
TOTAL: ~$0.017/propiedad

Volumen estimado:
- 50 alquileres nuevos/mes
- Costo mensual: ~$0.85
- Anual: ~$10
```

### Alternativa Haiku 4.0 (más barato):
```
Costo por propiedad:
- Input: 3,000 × $0.0008/1K = $0.0024
- Output: 500 × $0.004/1K = $0.002
TOTAL: ~$0.0044/propiedad

Volumen 50/mes: ~$0.22/mes (~$2.64/año)
```

**RECOMENDACIÓN:** Empezar con Haiku 4.0, upgradear a Sonnet solo si calidad insuficiente.
