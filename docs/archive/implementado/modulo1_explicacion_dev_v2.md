# SICI Módulo 1 - Explicación para dev nuevo

## Qué es SICI

SICI = Sistema Inteligente de Captura Inmobiliaria

Es un sistema que mantiene una base de datos de propiedades inmobiliarias sincronizada con los portales de Bolivia (Remax, Century21). Zona actual: Equipetrol, Santa Cruz.

**Problema que resuelve:** Los portales cambian constantemente. Aparecen propiedades nuevas, desaparecen otras, cambian precios. Sin automatización, tu base de datos queda desactualizada en días.

---

## Módulo 1: La pregunta simple

El Módulo 1 responde UNA sola pregunta:

> **¿Esta propiedad existe en el mercado o no?**

Nada más. No le importa el precio, las fotos, los dormitorios. Solo: ¿existe o no existe?

---

## Los dos flujos

### Flujo A - "El Cazador" (1:00 AM)

**Qué hace:**

- Consulta las APIs de Remax y Century21
- Obtiene todas las propiedades que existen HOY
- Las que son nuevas → las inserta con status **nueva**
- Las que estaban ayer pero HOY no aparecieron → las marca **inactivo_pending**

**Qué NO hace:**

- NO confirma que una propiedad fue eliminada
- NO extrae precios ni detalles

**Por qué no confirma eliminaciones:**
Porque la API puede fallar, puede haber un error temporal, puede haber rate limiting. Que no aparezca HOY no significa que no exista.

---

### Flujo C - "El Verificador" (6:00 AM)

**Qué hace:**

- Toma las propiedades marcadas **inactivo_pending**
- Hace HTTP HEAD a cada URL
- Si recibe 404 → confirma: status **inactivo_confirmed**
- Si recibe 200 → rescata: status **completado** (era falso positivo)

**Por qué HTTP HEAD:**
Solo necesitamos saber si existe. No necesitamos descargar la página.

---

## Diagrama mental

```
                    FLUJO A (1 AM)                     FLUJO C (6 AM)
                         │                                  │
    ┌────────────────────┼──────────────────────┐          │
    │                    │                      │          │
    ▼                    ▼                      ▼          ▼
[NUEVA]             [EXISTE]              [NO APARECIÓ]   [VERIFICAR]
    │                    │                      │          │
    ▼                    │                      ▼          │
INSERT              (sin cambio)         inactivo_     ───►├─── 404? ──► inactivo_
nueva                                    pending           │             confirmed
                                                          └─── 200? ──► completado
                                                                        (rescatado)
```

---

## Estrategias por portal

### Remax
- Tiene API REST pública
- Paginación normal: páginas 1-8
- Fácil: haces GET a cada página y parseás JSON

### Century21
- NO tiene paginación
- Tiene API de mapa con bounding boxes
- Estrategia: dividir Equipetrol en cuadrícula de ~6 cuadrantes
- Hacer un request por cuadrante, deduplicar resultados

---

## Output de Discovery (15+ parámetros)

Discovery extrae datos observados desde las APIs:

```json
{
  "url": "https://remax.bo/propiedad/12345",
  "fuente": "remax",
  "codigo_propiedad": "12345",
  
  "precio_usd": 120000,
  "moneda_original": "USD",
  "area_total_m2": 85,
  "dormitorios": 3,
  "banos": 2,
  "estacionamientos": 1,
  
  "tipo_operacion": "venta",
  "tipo_propiedad_original": "Departamento",
  "estado_construccion": "nuevo",
  
  "latitud": -17.765,
  "longitud": -63.192,
  
  "datos_json_discovery": {...}  // Snapshot completo RAW
}
```

**Importante:** Estos son **datos observados**, no "verdad final". Enrichment los valida después.

---

## Estados del Módulo 1

| Status | Significado | Quién lo setea |
|--------|-------------|----------------|
| `nueva` | Propiedad detectada por primera vez | Flujo A (Discovery) |
| `inactivo_pending` | No apareció en scrape, pendiente verificar | Flujo A (Discovery) |
| `inactivo_confirmed` | Confirmado eliminado (HTTP 404) | Flujo C (Verificador) |
| `completado` | Verificado que existe (HTTP 200) | Flujo C o Merge |
| `actualizado` | Enriquecida por Enrichment | Función `registrar_enrichment()` |

---

## Protecciones importantes

1. **Si falla Remax o Century21** → Flujo A NO marca ausencias (evita falsos inactivos)

2. **Campos bloqueados** → Si alguien corrigió manualmente un dato, el sistema nunca lo sobrescribe

3. **Deduplicación en dos niveles:**
   - En memoria (antes de insertar)
   - En BD (constraint UNIQUE)

---

## Estructura del repo

```
docs/
  MODULO_1_DISCOVERY_EXISTENCIA.md    ← README principal del módulo
  MODULO_1_FLUJO_A_IMPLEMENTACION.md  ← Especificación técnica Flujo A
  canonical/
    discovery_canonical_output.md     ← Contrato de output
  research/
    RESEARCH_REMAX_API.md             ← Cómo funciona Remax
    RESEARCH_CENTURY21_GRID.md        ← Cómo funciona Century21

sql/
  functions/
    discovery/
      registrar_discovery.sql         ← Función que inserta/actualiza
    enrichment/
      registrar_enrichment.sql        ← (Módulo 2, no tocar aún)
    merge/
      merge_discovery_enrichment.sql  ← (Módulo 2, no tocar aún)
```

---

## Resumen en una oración

**Flujo A descubre y sospecha, Flujo C confirma o rescata.**

Eso es todo el Módulo 1.