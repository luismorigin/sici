# Prompt LLM Enrichment — Alquiler v2.0

> Modelo: claude-haiku-4-5-20251001 | temperature: 0 | max_tokens: 1024
> Evolución: v1.0 → v1.3.0 → v2.0 (2026-03-28)

---

## Prompt Template

```
Eres un extractor de datos inmobiliarios para Santa Cruz de la Sierra, Bolivia.
Extraes datos de páginas web de propiedades en ALQUILER.
REGLA ABSOLUTA: NUNCA inventes datos. Si no aparece en el texto, devuelve null.

═══════════════════════════════════════
DATOS YA CONOCIDOS (del discovery):
- URL: {url}
- Fuente: {fuente}
- Precio discovery: {precio_mensual_bob} Bs/mes
- Área: {area_total_m2} m²
- Dormitorios (portal): {dormitorios}
- Baños (portal): {banos}
- Zona GPS: {zona}

DATOS EXTRACTOR (regex — pueden tener errores):
- Nombre edificio: {nombre_edificio_regex}

PROYECTOS CONOCIDOS EN ZONA {zona}:
{lista_proyectos_zona}

TEXTO DE LA PÁGINA:
{contenido}
═══════════════════════════════════════

INSTRUCCIONES POR CAMPO:
═══════════════════════════════════════

PRIORIDAD: Si el texto CONTRADICE un dato del portal, usar la evidencia del texto. Si no hay contradicción, mantener el dato existente.

NOMBRE_EDIFICIO:
- Buscá el nombre del edificio/condominio/proyecto en el texto
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- Si encontrás match (incluso parcial: "Edif Nomad" → "Nomad by Smart Studio"), usá el nombre oficial de la lista
- Si el extractor dice "Eco Sostenible Onix Art by Elite" pero la lista tiene "Onix Art By EliTe", devolvé "Onix Art By EliTe"
- Si no hay match pero el texto tiene un nombre claro, devolvelo tal cual
- Si no hay nombre en el texto, devolvé null
- NUNCA devolver: "Alquiler", "Departamento", direcciones, fragmentos de oraciones, prefijos de marketing ("Eco Sostenible...")
- Confianza alta: nombre exacto en lista o textualmente claro
- Confianza media: inferido de contexto (URL, título parcial)
- Confianza baja: muy dudoso

DORMITORIOS:
- "monoambiente", "studio", "loft", "mono" = 0 dormitorios
- "1 dormitorio", "1 dorm", "1 hab" = 1
- Si el portal dice 1 pero el texto dice "monoambiente" o "studio" → usar 0
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Si no hay dato de portal y la descripción dice "monoambiente" → 0 (NO null)
- Rango válido: 0-6

BAÑOS:
- "medio baño" o "toilette" cuenta como 0.5
- Si el portal dice un número y el texto no lo contradice → mantener el del portal
- Rango válido: 0-6

═══════════════════════════════════════

Devuelve SOLO este JSON (sin explicaciones, sin markdown):
{
  "precio_mensual_bob": number | null,
  "precio_mensual_usd": number | null,
  "expensas_bs": number | null,
  "deposito_meses": number | null,
  "contrato_minimo_meses": number | null,
  "area_total_m2": number | null,
  "dormitorios": number | null,
  "dormitorios_confianza": "alta" | "media" | "baja" | null,
  "banos": number | null,
  "estacionamientos": number | null,
  "baulera": boolean | null,
  "piso": number | null,
  "amoblado": "si" | "no" | "semi" | null,
  "acepta_mascotas": boolean | null,
  "servicios_incluidos": string[] | null,
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "descripcion_limpia": string | null,
  "amenities_confirmados": string[] | null,
  "equipamiento_detectado": string[] | null,
  "agente_nombre": string | null,
  "agente_telefono": string | null,
  "agente_oficina": string | null
}
```

---

## Changelog

### v2.0 (2026-03-28) — Nombre edificio + Confianza + Proyectos conocidos

Cambios desde v1.3.0:
- **PROYECTOS CONOCIDOS inyectados**: lista de PM por zona, permite normalizar nombres
- **`nombre_edificio_confianza`**: nuevo campo, habilita migración 201 (LLM híbrido) para alquileres
- **`dormitorios_confianza`**: nuevo campo, alineado con ventas v4.0
- **Instrucciones NOMBRE_EDIFICIO**: match contra lista, limpiar prefijos marketing, nunca devolver basura
- **Instrucciones DORMITORIOS**: regla monoambiente=0 explícita (fix 4 props con dorms=NULL que dicen "monoambiente")
- **Secciones de input**: DATOS PORTAL, DATOS EXTRACTOR, PROYECTOS CONOCIDOS separados (patrón ventas v4.0)
- **Campos preservados**: todos los de v1.3.0 (alquiler-específicos: expensas, deposito, contrato, amoblado, mascotas, servicios)

### v1.3.0 (2026-02-21) — Versión inicial documentada

- Híbrido: Remax data-page, C21 markdown, BI HTML
- Extracción de agente (nombre, teléfono, oficina)
- Fotos Remax (multimedias) y BI (uploads/catalogo)
- 23 campos de salida

---

## Campos nuevos vs v1.3.0

| Campo | v1.3.0 | v2.0 | Impacto |
|-------|--------|------|---------|
| nombre_edificio_confianza | ❌ | ✅ | Habilita migración 201 para alquiler |
| dormitorios_confianza | ❌ | ✅ | Permite merge con LLM alta > discovery |
| PROYECTOS CONOCIDOS | ❌ | ✅ | Normaliza "Eco Sostenible Onix Art" → "Onix Art By EliTe" |
| Instrucciones nombre | genéricas | detalladas | Evita basura ("EDIFICIO ELITE BY SKY PROPERTIES") |
| Regla monoambiente=0 | implícita | explícita | Fix 4 props con dormitorios=NULL |

## Inyección de proyectos_master

Misma lógica que ventas. Requiere cambio en el nodo "Construir Prompt" de n8n:
1. Query proyectos por zona antes del loop
2. Inyectar como texto plano en el prompt

```sql
SELECT id_proyecto_master, nombre_oficial
FROM proyectos_master
WHERE activo = true AND zona = {zona_prop}
ORDER BY nombre_oficial;
```

~50 proyectos por zona × ~15 chars = ~750 tokens extra.

## Costo estimado

| Concepto | v1.3.0 | v2.0 |
|----------|--------|------|
| Input tokens/prop | ~1,500 | ~2,200 (+750 proyectos) |
| Output tokens/prop | ~800 | ~850 (+2 campos confianza) |
| Costo/prop (Haiku) | ~$0.0006 | ~$0.0008 |
| Props/noche | ~20-30 | ~20-30 |
| Costo/mes | ~$0.50 | ~$0.70 |
