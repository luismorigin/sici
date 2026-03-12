# Deploy: detectarMultiproyecto v3.0 — Extractor Century21

**Fecha:** 12 de marzo de 2026
**Migraciones relacionadas:** 190, 191
**Archivo fuente:** `n8n/extractores/extractor_century21.json` (líneas 1112-1146)

## Problema

`detectarMultiproyecto()` v2.1 en el extractor C21 usaba lógica `OR` — un solo patrón bastaba para marcar `es_multiproyecto = true`. Frases comunes en listings individuales como "departamentos disponibles" o "desde $95,000" triggeaban falsos positivos.

**Impacto:** 45 propiedades activas estaban incorrectamente excluidas de estudios de mercado y queries de búsqueda.

## Qué cambió (v2.1 → v3.0)

| Aspecto | v2.1 (antes) | v3.0 (ahora) |
|---------|-------------|-------------|
| **Lógica** | `OR` — 1 patrón = true | `count >= 2` — igual que Remax |
| **`tiene_indicador_multiple`** | `"desde\|disponibles\|disponibilidad"` | `"diferentes\|varios\|múltiples\|variedad"` |
| **`plural_con_indicador`** | Patrón compuesto separado (es_plural AND indicador) | Eliminado — `es_plural` e `indicador` cuentan independiente |
| **Tasa falsos positivos estimada** | ~30% | ~5% (alineado con Remax) |

## Pasos para deploy en n8n

### 1. Abrir flujo_b_processing en n8n

- Ir a n8n → Workflows → **Flujo B Processing v3.0** (modulo_1)
- Abrir el nodo **"Extractor Century21 v16.5"** (tipo Code, ID `ddc378ab`)

### 2. Reemplazar la función completa

Buscar `detectarMultiproyecto` en el código del nodo (Ctrl+F). Encontrar este bloque (v2.1):

```javascript
function detectarMultiproyecto(descripcion = "") {
  // ... lógica con OR al final ...
  return tiene_multiples_dormitorios ||
         tiene_varias_tipologias ||
         // ...
}
```

Reemplazar **toda la función** (desde `function detectarMultiproyecto` hasta el `}` de cierre) con:

```javascript
function detectarMultiproyecto(descripcion = "") {
  if (typeof descripcion !== 'string') return false;
  const desc = descripcion.toLowerCase();

  const tiene_multiples_dormitorios = /\d+\s*(?:,|y|o)\s*\d+\s+dormitorios?/i.test(desc);
  const tiene_varias_tipologias = /varias\s+(tipolog[ií]as?|opciones)/i.test(desc);
  const tiene_diferentes_modelos = /diferentes\s+(tipolog[ií]as?|modelos|plantas)/i.test(desc);
  const tiene_rango_areas = /de\s+\d+\s*m[²2]\s+hasta\s+\d+\s*m[²2]/i.test(desc);
  const tiene_desde_area = /(?:desde|a\s+partir\s+de|superficie\s+desde)\s+\d+\s*m[²2]/i.test(desc);
  const tiene_precio_desde = /(?:precio\s+desde|desde\s+\$?\s?(?:us\.?|usd)|a\s+partir\s+de\s+\$?\s?(?:us\.?|usd))\s?[\d.,]+/i.test(desc);

  const es_plural = /(?:departamentos|casas|monoambientes|unidades)\b/i.test(desc);
  const tiene_indicador_multiple = /(?:diferentes|varios|m[uú]ltiples|variedad)\s+(?:tipos|modelos|opciones)/i.test(desc);

  const tiene_disponibilidad_tipos = /disponibilidad\s*:?\s*(?:monoambientes?|departamentos?|casas?)/i.test(desc);

  const patrones_positivos = [
    tiene_multiples_dormitorios,
    tiene_varias_tipologias,
    tiene_diferentes_modelos,
    tiene_rango_areas,
    tiene_desde_area,
    tiene_precio_desde,
    es_plural,
    tiene_indicador_multiple,
    tiene_disponibilidad_tipos
  ];
  const count = patrones_positivos.filter(Boolean).length;
  return count >= 2;
}
```

### 3. Guardar y activar

- Guardar el workflow
- No es necesario re-ejecutar — el cambio aplica desde la próxima ejecución nocturna

### 4. Verificar al día siguiente

Después de la ejecución nocturna, verificar que no haya nuevos falsos positivos:

```sql
SELECT id, nombre_edificio, zona, es_multiproyecto
FROM propiedades_v2
WHERE es_multiproyecto = true
  AND status IN ('completado', 'actualizado')
  AND tipo_operacion = 'venta'
  AND zona IS NOT NULL;
```

Debe dar 0 filas (todas las props corregidas tienen candado y no serán revertidas).

## Nota sobre Remax

El nodo **"Extractor Remax v1.9"** (ID `074dd653`) en el mismo flujo_b **ya usa `count >= 2`** — no necesita cambios.

## Protección contra regresión

Las 45 props corregidas tienen candado en `campos_bloqueados`:

```json
{
  "es_multiproyecto": {
    "bloqueado": true,
    "motivo": "correccion_falso_positivo_multiproyecto_batch",
    "por": "admin"
  }
}
```

`registrar_enrichment()` respeta candados — no sobreescribirá el valor aunque el extractor envíe `true`. Pero nuevas props descubiertas SIN candado sí usarán la lógica del extractor, por eso es necesario deployar v3.0.
