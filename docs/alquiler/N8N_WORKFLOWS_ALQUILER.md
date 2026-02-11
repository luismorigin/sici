# n8n Workflows para Alquileres

## Arquitectura de Workflows

```
┌─────────────────────────────────────────────────────────────┐
│                   WORKFLOWS ALQUILER                        │
└─────────────────────────────────────────────────────────────┘

1. flujo_discovery_c21_alquiler.json       (Cron: 2:00 AM)
2. flujo_discovery_remax_alquiler.json     (Cron: 2:15 AM)
3. flujo_enrichment_llm_alquiler.json      (Cron: 3:00 AM)
4. flujo_merge_alquiler.json               (Cron: 4:00 AM)
5. flujo_validacion_manual_alquiler.json   (Manual)
```

---

## 1. Workflow: Discovery C21 Alquiler

**Archivo:** `n8n/workflows/alquiler/flujo_discovery_c21_alquiler.json`

### Descripción
Scrapea propiedades en alquiler de Century21 Bolivia usando Firecrawl.

### Nodos

```javascript
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "Cron",
      "parameters": {
        "triggerTimes": {
          "item": [
            {
              "mode": "everyDay",
              "hour": 2,
              "minute": 0
            }
          ]
        }
      }
    },
    {
      "name": "Registrar Inicio Workflow",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT registrar_inicio_workflow('discovery_c21_alquiler')"
      }
    },
    {
      "name": "Obtener URLs C21 Alquiler",
      "type": "HTTP Request",
      "parameters": {
        "method": "GET",
        "url": "https://c21.com.bo/propiedades",
        "queryParameters": {
          "parameters": {
            "parameter": [
              { "name": "operacion", "value": "alquiler" },
              { "name": "zona", "value": "Equipetrol" }
            ]
          }
        }
      }
    },
    {
      "name": "Parsear Listado Props",
      "type": "Code",
      "parameters": {
        "jsCode": "// Parsear HTML y extraer URLs de propiedades\nconst cheerio = require('cheerio');\nconst html = $input.item.json.data;\nconst $ = cheerio.load(html);\nconst urls = [];\n\n$('.property-card a').each((i, el) => {\n  const href = $(el).attr('href');\n  if (href && href.includes('/arriendo/')) {\n    urls.push({\n      url: 'https://c21.com.bo' + href,\n      url_id: href.split('/').pop()\n    });\n  }\n});\n\nreturn urls;"
      }
    },
    {
      "name": "Loop Props",
      "type": "Loop Over Items",
      "parameters": {
        "batchSize": 5,
        "waitBetweenBatches": 3
      }
    },
    {
      "name": "Firecrawl Scrape",
      "type": "HTTP Request",
      "parameters": {
        "method": "POST",
        "url": "https://api.firecrawl.dev/v1/scrape",
        "authentication": "headerAuth",
        "headerAuth": {
          "name": "Authorization",
          "value": "Bearer {{ $env.FIRECRAWL_API_KEY }}"
        },
        "body": {
          "url": "={{ $json.url }}",
          "formats": ["html", "markdown"]
        }
      }
    },
    {
      "name": "Parsear Datos Básicos",
      "type": "Code",
      "parameters": {
        "jsCode": "// Extraer datos básicos del HTML\nconst cheerio = require('cheerio');\nconst html = $input.item.json.data.html;\nconst $ = cheerio.load(html);\n\nreturn {\n  url: $input.item.json.url,\n  url_id: $input.item.json.url_id,\n  titulo: $('h1.property-title').text().trim(),\n  tipo_propiedad: $('span.property-type').text().trim().toLowerCase(),\n  precio_texto: $('.price-alquiler').text().trim(),\n  zona: $('.location-zona').text().trim(),\n  datos_json: {\n    caracteristicas: {\n      area_construida: $('.area-construida').text().replace(/[^0-9.]/g, ''),\n      dormitorios: $('.dormitorios').text().replace(/[^0-9]/g, ''),\n      banos: $('.banos').text().replace(/[^0-9]/g, '')\n    },\n    fotos: $('img.property-photo').map((i, el) => $(el).attr('src')).get()\n  },\n  html_raw: html\n};"
      }
    },
    {
      "name": "Registrar Discovery",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM registrar_discovery_alquiler(\n  p_fuente := 'c21_alquiler',\n  p_url := '{{ $json.url }}',\n  p_url_id := '{{ $json.url_id }}',\n  p_titulo := '{{ $json.titulo }}',\n  p_tipo_propiedad := '{{ $json.tipo_propiedad }}',\n  p_precio_texto := '{{ $json.precio_texto }}',\n  p_zona := '{{ $json.zona }}',\n  p_datos_json := '{{ JSON.stringify($json.datos_json) }}'::jsonb,\n  p_html_raw := '{{ $json.html_raw }}'\n)"
      }
    },
    {
      "name": "Registrar Fin Workflow",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT registrar_fin_workflow('discovery_c21_alquiler', 'completado', jsonb_build_object('propiedades_procesadas', {{ $items().length }}))"
      }
    }
  ]
}
```

---

## 2. Workflow: Discovery Remax Alquiler

**Archivo:** `n8n/workflows/alquiler/flujo_discovery_remax_alquiler.json`

### Descripción
Scrapea alquileres de Remax Bolivia usando su API con `transaction_type=2`.

### Nodos Clave

```javascript
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "Cron",
      "parameters": {
        "triggerTimes": {
          "item": [
            {
              "mode": "everyDay",
              "hour": 2,
              "minute": 15
            }
          ]
        }
      }
    },
    {
      "name": "Remax API Alquileres",
      "type": "HTTP Request",
      "parameters": {
        "method": "GET",
        "url": "https://www.remax.com.bo/api/properties",
        "queryParameters": {
          "parameters": {
            "parameter": [
              { "name": "transaction_type", "value": "2" },  // 2 = alquiler
              { "name": "zone", "value": "Equipetrol" },
              { "name": "limit", "value": "100" }
            ]
          }
        }
      }
    },
    {
      "name": "Transformar Remax JSON",
      "type": "Code",
      "parameters": {
        "jsCode": "const props = $input.item.json.properties || [];\n\nreturn props.map(p => ({\n  url: `https://www.remax.com.bo/propiedad/${p.id}`,\n  url_id: String(p.id),\n  titulo: p.title,\n  tipo_propiedad: p.property_type?.toLowerCase() || 'departamento',\n  precio_texto: `Bs ${p.price_rental}`,\n  zona: p.zone,\n  datos_json: {\n    precio: {\n      valor_bs: p.price_rental,\n      moneda: 'BOB'\n    },\n    caracteristicas: {\n      area_construida: p.area_built,\n      dormitorios: p.bedrooms,\n      banos: p.bathrooms,\n      estacionamientos: p.parking_spaces\n    },\n    fotos: p.photos || []\n  }\n}));"
      }
    },
    {
      "name": "Firecrawl HTML Completo",
      "type": "HTTP Request",
      "parameters": {
        "method": "POST",
        "url": "https://api.firecrawl.dev/v1/scrape",
        "authentication": "headerAuth",
        "body": {
          "url": "={{ $json.url }}",
          "formats": ["html"]
        }
      }
    },
    {
      "name": "Registrar Discovery Remax",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM registrar_discovery_alquiler(\n  p_fuente := 'remax_alquiler',\n  p_url := '{{ $json.url }}',\n  p_url_id := '{{ $json.url_id }}',\n  p_titulo := '{{ $json.titulo }}',\n  p_tipo_propiedad := '{{ $json.tipo_propiedad }}',\n  p_precio_texto := '{{ $json.precio_texto }}',\n  p_zona := '{{ $json.zona }}',\n  p_datos_json := '{{ JSON.stringify($json.datos_json) }}'::jsonb,\n  p_html_raw := '{{ $json.html }}'\n)"
      }
    }
  ]
}
```

---

## 3. Workflow: Enrichment LLM Alquiler

**Archivo:** `n8n/workflows/alquiler/flujo_enrichment_llm_alquiler.json`

### Descripción
Enriquece propiedades con Claude LLM (Haiku 4.0 por defecto).

### Nodos Principales

```javascript
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "Cron",
      "parameters": {
        "triggerTimes": {
          "item": [
            {
              "mode": "everyDay",
              "hour": 3,
              "minute": 0
            }
          ]
        }
      }
    },
    {
      "name": "Query Props Sin Enrichment",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT id, url, titulo, tipo_operacion, datos_json, html_raw FROM propiedades_alquiler WHERE status = 'discovery_completo' AND html_raw IS NOT NULL ORDER BY fecha_discovery ASC LIMIT 50"
      }
    },
    {
      "name": "Construir Prompt LLM",
      "type": "Code",
      "parameters": {
        "jsCode": "// Leer template de prompt desde archivo o variable\nconst fs = require('fs');\nconst promptTemplate = `Eres un asistente especializado en extracción de datos de propiedades inmobiliarias en Bolivia.\n\nCONTEXTO:\n- País: Bolivia\n- Moneda: Bolivianos (Bs)\n- Mercado: Alquileres residenciales\n- Fuente: {{ $json.fuente }}\n\nDATOS PARCIALES:\n{{ JSON.stringify($json.datos_json, null, 2) }}\n\nHTML COMPLETO:\n{{ $json.html_raw }}\n\nTAREA: Extrae TODOS los datos posibles y devuelve JSON estructurado según este schema:\n{\n  \"precio_alquiler_bs\": number | null,\n  \"precio_alquiler_usd\": number | null,\n  \"expensas_bs\": number | null,\n  \"deposito_garantia_bs\": number | null,\n  \"duracion_minima_meses\": number | null,\n  \"area_construida\": number | null,\n  \"dormitorios\": number | null,\n  \"banos\": number | null,\n  \"estacionamientos\": number | null,\n  \"piso\": number | null,\n  \"amoblado\": boolean | null,\n  \"acepta_mascotas\": boolean | null,\n  \"servicios_incluidos\": string[] | null,\n  \"amenities_edificio\": {...},\n  \"equipamiento_unidad\": {...},\n  \"descripcion_limpia\": string | null,\n  \"fotos_urls\": string[]\n}\n\nREGLAS:\n1. Si un dato NO aparece, usa null\n2. Precios sin puntos/comas\n3. Busca amenities en descripciones\n\nDevuelve SOLO el JSON.`;\n\nreturn {\n  id: $json.id,\n  prompt: promptTemplate\n    .replace('{{ $json.fuente }}', $json.fuente || 'c21_alquiler')\n    .replace('{{ JSON.stringify($json.datos_json, null, 2) }}', JSON.stringify($json.datos_json, null, 2))\n    .replace('{{ $json.html_raw }}', $json.html_raw.slice(0, 50000))  // Max 50k chars HTML\n};"
      }
    },
    {
      "name": "Claude LLM API",
      "type": "HTTP Request",
      "parameters": {
        "method": "POST",
        "url": "https://api.anthropic.com/v1/messages",
        "authentication": "headerAuth",
        "headerAuth": {
          "name": "x-api-key",
          "value": "={{ $env.ANTHROPIC_API_KEY }}"
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameter": [
            { "name": "anthropic-version", "value": "2023-06-01" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "body": {
          "model": "claude-haiku-4-20250514",
          "max_tokens": 4096,
          "temperature": 0,
          "messages": [
            {
              "role": "user",
              "content": "={{ $json.prompt }}"
            }
          ]
        }
      }
    },
    {
      "name": "Parsear Response JSON",
      "type": "Code",
      "parameters": {
        "jsCode": "try {\n  const response = $input.item.json;\n  const content = response.content[0].text;\n  \n  // Extraer JSON del texto (por si viene con markdown)\n  const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);\n  if (!jsonMatch) {\n    throw new Error('No se encontró JSON en la respuesta');\n  }\n  \n  const data = JSON.parse(jsonMatch[0]);\n  \n  return {\n    id: $input.item.json.id,\n    datos_enrichment: data,\n    llm_model: response.model,\n    llm_tokens: response.usage?.total_tokens || null\n  };\n} catch (error) {\n  return {\n    id: $input.item.json.id,\n    error: error.message,\n    requiere_revision: true\n  };\n}"
      }
    },
    {
      "name": "Validar Datos LLM",
      "type": "Code",
      "parameters": {
        "jsCode": "const data = $json.datos_enrichment;\nconst errores = [];\n\nif (data.precio_alquiler_bs === null && data.precio_alquiler_usd === null) {\n  errores.push('Sin precio detectado');\n}\n\nif (data.dormitorios !== null && (data.dormitorios < 0 || data.dormitorios > 10)) {\n  errores.push(`Dormitorios fuera de rango: ${data.dormitorios}`);\n}\n\nif (data.area_construida !== null && (data.area_construida < 15 || data.area_construida > 1000)) {\n  errores.push(`Área sospechosa: ${data.area_construida}m²`);\n}\n\nif (data.expensas_bs !== null && data.precio_alquiler_bs !== null && data.expensas_bs > data.precio_alquiler_bs) {\n  errores.push('Expensas mayores que alquiler');\n}\n\nreturn {\n  id: $json.id,\n  datos_enrichment: data,\n  llm_model: $json.llm_model,\n  llm_tokens: $json.llm_tokens,\n  requiere_revision: errores.length > 0,\n  errores: errores\n};"
      }
    },
    {
      "name": "Registrar Enrichment",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM registrar_enrichment_alquiler(\n  p_propiedad_id := {{ $json.id }},\n  p_datos_enrichment := '{{ JSON.stringify($json.datos_enrichment) }}'::jsonb,\n  p_llm_model := '{{ $json.llm_model }}',\n  p_llm_tokens := {{ $json.llm_tokens }},\n  p_requiere_revision := {{ $json.requiere_revision }},\n  p_errores_validacion := ARRAY[{{ $json.errores.map(e => `'${e}'`).join(',') }}]\n)"
      }
    },
    {
      "name": "Notificar Errores Slack",
      "type": "HTTP Request",
      "parameters": {
        "method": "POST",
        "url": "={{ $env.SLACK_WEBHOOK_SICI }}",
        "body": {
          "text": "⚠️ Enrichment LLM Alquiler: {{ $items().filter(i => i.json.requiere_revision).length }} propiedades requieren revisión"
        }
      },
      "typeVersion": 1,
      "executeOnce": true
    }
  ]
}
```

---

## 4. Workflow: Merge Alquiler

**Archivo:** `n8n/workflows/alquiler/flujo_merge_alquiler.json`

### Descripción
Consolida discovery + enrichment en `datos_json_merged`.

### Nodos

```javascript
{
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "Cron",
      "parameters": {
        "triggerTimes": {
          "item": [
            {
              "mode": "everyDay",
              "hour": 4,
              "minute": 0
            }
          ]
        }
      }
    },
    {
      "name": "Ejecutar Merge",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM merge_discovery_enrichment_alquiler()"
      }
    },
    {
      "name": "Contar Resultados",
      "type": "Code",
      "parameters": {
        "jsCode": "const resultados = $input.all();\nconst merged = resultados.filter(r => r.json.accion === 'merged').length;\nconst errores = resultados.filter(r => r.json.accion === 'error').length;\n\nreturn [{\n  merged: merged,\n  errores: errores,\n  total: resultados.length\n}];"
      }
    },
    {
      "name": "Notificar Slack",
      "type": "HTTP Request",
      "parameters": {
        "method": "POST",
        "url": "={{ $env.SLACK_WEBHOOK_SICI }}",
        "body": {
          "text": `✅ Merge Alquiler completado: ${$json.merged} propiedades procesadas`
        }
      }
    },
    {
      "name": "Registrar Fin Workflow",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT registrar_fin_workflow('merge_alquiler', 'completado', jsonb_build_object('propiedades_merged', {{ $json.merged }}))"
      }
    }
  ]
}
```

---

## 5. Workflow: Validación Manual Alquiler

**Archivo:** `n8n/workflows/alquiler/flujo_validacion_manual_alquiler.json`

### Descripción
Workflow manual para revisar propiedades con `status='requiere_revision'`.

### Trigger
- Webhook manual desde admin dashboard
- Endpoint: `https://n8n.tudominio.com/webhook/validar-alquiler/:id`

### Nodos

```javascript
{
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "Webhook",
      "parameters": {
        "path": "validar-alquiler/:id",
        "httpMethod": "POST"
      }
    },
    {
      "name": "Query Propiedad",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM propiedades_alquiler WHERE id = {{ $json.params.id }}"
      }
    },
    {
      "name": "Aplicar Correcciones",
      "type": "Postgres",
      "parameters": {
        "operation": "executeQuery",
        "query": "UPDATE propiedades_alquiler SET datos_json_merged = datos_json_merged || '{{ JSON.stringify($json.body.correcciones) }}'::jsonb, status = 'merge_completo', campos_bloqueados = campos_bloqueados || '{{ JSON.stringify($json.body.campos_bloqueados) }}'::jsonb WHERE id = {{ $json.params.id }}"
      }
    },
    {
      "name": "Responder Webhook",
      "type": "Respond to Webhook",
      "parameters": {
        "responseBody": "{{ JSON.stringify({ success: true, message: 'Propiedad validada' }) }}"
      }
    }
  ]
}
```

---

## Variables de Entorno n8n

Agregar en **Settings → Environment Variables**:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
FIRECRAWL_API_KEY=fc-...
SLACK_WEBHOOK_SICI=https://hooks.slack.com/services/...
```

---

## Horarios Programados

| Workflow | Horario | Duración Estimada |
|----------|---------|-------------------|
| Discovery C21 | 2:00 AM | ~15 min |
| Discovery Remax | 2:15 AM | ~10 min |
| Enrichment LLM | 3:00 AM | ~30 min (50 props × 30s) |
| Merge | 4:00 AM | ~2 min |

---

## Monitoreo y Alertas

### Slack Notifications
- ✅ Cada workflow al terminar (success)
- ⚠️ Si hay props con `requiere_revision`
- ❌ Si falla algún workflow (error)

### Dashboard Admin
- `/admin/alquiler/salud` - Métricas en tiempo real
- Gráfico: Props por status
- Últimas ejecuciones de workflows
- Props que requieren revisión manual

---

## Testing Local

```bash
# Activar un workflow manualmente (sin esperar cron)
curl -X POST https://n8n.tudominio.com/webhook-test/discovery-c21-alquiler

# Ver logs en tiempo real
n8n start --tunnel
```
