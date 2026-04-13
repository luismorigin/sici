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
- Buscá el nombre del edificio/condominio/proyecto en el texto Y en el dato del extractor
- Compará contra la lista de PROYECTOS CONOCIDOS de arriba
- PASO 1: Si el extractor ya tiene un nombre, limpiá prefijos genéricos ("Edificio", "Condominio", "Eco Sostenible") y buscá match en la lista
- PASO 2: Si encontrás match en la lista (incluso parcial: "Elite by Sky Properties" → "Sky Elite"), usá el nombre oficial de la lista
- PASO 3: Si NO hay match en la lista pero el extractor o el texto tiene un nombre claro de edificio, MANTENELO tal cual (confianza media)
- PASO 4: Solo devolvé null si no hay NINGÚN nombre de edificio ni en extractor ni en texto
- NUNCA devolver: "Alquiler", "Departamento", direcciones, "Venta", tipo de operación
- Confianza alta: nombre exacto en lista, o nombre claro en texto que coincide con extractor
- Confianza media: nombre del extractor o texto que NO está en la lista pero es un nombre real de edificio
- Confianza baja: muy dudoso, solo fragmento parcial

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

AMOBLADO:
- Amoblado = muebles sueltos que se pueden retirar: camas, sofás, mesas, sillas de comedor, escritorios
- NO cuenta como amoblado: roperos empotrados, cocina equipada, aire acondicionado (son fijos del departamento)
- Si la descripción dice "amoblado", "amueblado", "furnished" → "si"
- Si dice "semi-amoblado" o "semi amueblado" → "semi"
- Si la descripción NO menciona amoblado ni ningún sinónimo → "no"
- Solo devolver null si hay ambigüedad genuina (muy raro)

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

### v2.1 (2026-04-13) — Amoblado default "no"

- **Instrucción AMOBLADO explícita**: si la descripción no menciona amoblado → "no" (antes: null)
- Definición clara: amoblado = muebles sueltos (camas, sofás, mesas). Roperos empotrados, cocina equipada y AC NO cuentan
- Basado en auditoría de 35 props con amoblado=NULL: 33/35 (94%) resultaron ser no amoblados tras verificación manual
- Impacto: elimina ~28% de NULLs en campo amoblado para props nuevas

### v2.0 (2026-03-28) — Nombre edificio + Confianza + Proyectos conocidos

**Testeado con Haiku en 5 props problemáticas** (test_prompt_v2.mjs):
- Ronda 1: Haiku descartaba nombres válidos no en PM → regresión id 1089
- Ronda 2 (fix PASO 3): "mantenelo tal cual con confianza media" → 5/5 correctos
- Resultado: 3 matches nuevos (105→PM45, 1156→PM7, 1191→PM7), 4 dorms corregidos, 0 regresiones

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
