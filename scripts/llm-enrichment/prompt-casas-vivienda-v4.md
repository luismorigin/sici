# Prompt LLM — Enriquecimiento Casas Vivienda v4 (Zona Norte)

Recibís el **título/slug** y la **descripción** de un anuncio de CASA en venta. Extraé los campos que
el portal no estructura. Salida: **solo un objeto JSON válido**, sin texto adicional. Dato ausente
= `null` (o `false` para presencia, `[]` para listas).

## Precio (CRÍTICO — el portal miente, la verdad está en el texto)
- `precio_billete_usd`: monto en **dólares** que pide el vendedor, tal como aparece en el texto
  ("143.105 $us", "Precio: 175.000 USD", "$us 210.000"). Devolvé el NÚMERO en USD, sin separadores.
- `precio_en_texto` (bool): true si el precio salió de la descripción; **false si NO hay precio en el
  texto** (entonces `precio_billete_usd=null` y el pipeline usará el del portal como fallback).
- `precio_en_bob` (bool): true si el texto solo da bolivianos ("Bs 1.200.000").
- `tipo_cambio_detectado`: `"paralelo"` ("tc paralelo", "dólar paralelo/blue", "pago en dólares físicos")
  | `"oficial"` ("tc oficial", "tc 7", "tc 6.96/6.97") | `"no_especificado"`.
- `tc_confianza`: `"alta"` (explícito) | `"media"` (inferible) | `"baja"` (dudoso).

## Condominio cerrado (SER ESTRICTO — evitar falsos positivos)
- `es_condominio_cerrado` (bool): true **solo** con señal real de CERRAMIENTO: "condominio cerrado",
  "barrio/urbanización cerrada", "acceso controlado", "portón eléctrico", "seguridad 24h", "club house"
  con áreas comunes. **NO** por "urbanización X" a secas, "guardia de cuadra", ni un nombre de barrio.
- `nombre_condominio_mencionado` (string|null): nombre propio. Buscalo PRIMERO en el **título/slug**
  (slug `...riviera-del-remanso-townhouses` → "Riviera del Remanso") y luego en la descripción.

## Otros atributos
- `estado`: `"nueva"` (a estrenar/preventa) | `"usada"` | `"remodelada"` | `"para_demolicion"`
  ("a precio de terreno", "para demoler", "ideal para proyecto/construir"). `null` si no se infiere.
- `niveles` (int|null): **"planta baja" + "planta alta" → 2**; "tres niveles" → 3, etc.
- `amoblado` (bool): amoblada/equipada/semiamoblada.

## Amenidades — TRES campos (NO descartes nada)
- `amenidades` (array): amenidades **CANÓNICAS de la CASA, para filtros** — SOLO de esta lista:
  `["piscina","jardin","churrasquera","dependencia_servicio","garage"]`
  Mapeos: `"patio"`→`jardin`; `"parrillero"/"asador"/"quincho"`→`churrasquera`.
  **No uses "quincho" como valor** (en Santa Cruz se dice churrasquera).
- `amenidades_condominio` (array, ABIERTO): si la casa está en un condominio y el anuncio menciona
  áreas COMUNES, listalas tal como aparecen. Ej: `"cancha de tenis"`, `"cancha de fútbol"`,
  `"cancha polifuncional"`, `"parque infantil"`, `"club house"`, `"piscina común"`, `"gimnasio"`,
  `"seguridad 24h"`, `"áreas verdes"`, `"plaza central"`, `"salón de eventos"`, `"coworking"`.
  (Estas idealmente viven en el `condominio_master` y se heredan; acá es captura best-effort que
  ayuda a curar el catálogo de condominios.)
- `caracteristicas_extra` (array, ABIERTO): **TODO lo demás de la CASA** que aporte valor,
  normalizado en minúscula y conciso. Ej: `"escritorio"`, `"sala de juegos"`, `"lavandería"`,
  `"galería"`, `"vestidor"`, `"home office"`, `"aire acondicionado"`, `"paneles solares"`,
  `"cisterna"`, `"gas natural"`, `"fibra óptica"`, `"depósito"`, `"doble altura"`.
  **NO descartes características reales.** Excluí solo servicios básicos genéricos (agua/luz/alcantarillado).

## `cerca_de` (array): referencias mencionadas (colegios, avenidas, supermercados) — strings cortos.

## Salida (ejemplo)
```json
{
  "precio_billete_usd": 240000,
  "precio_en_texto": true,
  "precio_en_bob": false,
  "tipo_cambio_detectado": "no_especificado",
  "tc_confianza": "media",
  "es_condominio_cerrado": false,
  "nombre_condominio_mencionado": null,
  "estado": "usada",
  "niveles": 1,
  "amoblado": false,
  "amenidades": ["jardin","garage"],
  "amenidades_condominio": [],
  "caracteristicas_extra": ["galería","aire acondicionado","gas natural","fibra óptica"],
  "cerca_de": ["Calle Tesalonicenses"]
}
```

## Reglas
- No inventes. Descripción pobre → JSON con la mayoría en `null`/`false`/`[]`.
- No confundas área (m²) con precio.
- `amenidades` SOLO valores de la lista canónica; cualquier otra característica real va en `caracteristicas_extra`.
