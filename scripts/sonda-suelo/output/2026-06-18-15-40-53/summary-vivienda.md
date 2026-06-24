# Sonda VIVIENDA — Casas (compra de hogar)

Generado: 2026-06-18T15:40:53.234Z · Zonas: zona-norte, urubo

> Standalone, read-only. Casa como vivienda final (no suelo).

## 1. Volumen + completitud estructurada (listado)

| Zona | Fuente | Casas | Únicas | %dorms | %baños | %garage | %área constr. |
|---|---|---:|---:|---:|---:|---:|---:|
| zona-norte | c21 | 192 | 164 | 63% | 59% | 49% | 99% |
| zona-norte | remax | 113 | 100 | 100% | 98% | 0% | 97% |
| urubo | c21 | 22 | 20 | 73% | 82% | 55% | 100% |
| urubo | remax | 24 | 24 | 100% | 96% | 0% | 100% |

## 2. Precio y tipología (únicas con dato)

| Zona | n | $/m² constr. (mediana) | dorms (mediana) | distribución dorms |
|---|---:|---:|---:|---|
| zona-norte | 264 | $954 | 3 | 1d:1 2d:13 3d:101 4d:52 5d:14 6+:18 |
| urubo | 44 | $934 | 3 | 1d:0 2d:2 3d:19 4d:10 5d:2 6+:5 |

_Nota: $/m² construido hereda la suciedad de moneda C21 (~47%); tomar como referencia._

## 3. Atributos que valora un comprador (muestra del detalle)

| Zona | Fuente | Muestra | Desc.OK | 🔒Condominio | Piscina | Jardín | Quincho | Depend. | A estrenar | Fotos≥5 | Fotos(med) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| zona-norte | c21 | 20 | 20 | 25% | 25% | 75% | 30% | 10% | 15% | 95% | 10 |
| zona-norte | remax | 20 | 20 | 75% | 50% | 75% | 75% | 25% | 5% | 100% | 15 |
| urubo | c21 | 20 | 20 | 55% | 20% | 70% | 45% | 20% | 20% | 95% | 12 |
| urubo | remax | 20 | 20 | 60% | 45% | 75% | 55% | 30% | 5% | 100% | 13 |

## 4. Veredicto vivienda

- Volumen casas únicas: **308** (ZN 264, Urubó 44). Tipología familiar real: mediana 3 dorms,
  $/m² construido ~$934-954. Distribución ZN sana (3d:101, 4d:52, 5d:14, 6+:18).
- Completitud estructurada: área construida 97-100% ✅, dorms 63-100%, baños 59-98%. **Garage Remax
  0% = bug de captura** (`number_parking`, mismo patrón que `land_m2`), no es ausencia real.

**EL HALLAZGO (donde está el valor):** lo que una familia más valora al comprar casa en Santa Cruz
NO está estructurado en NINGÚN portal — vive en el texto — pero está presente en alta proporción:
- 🔒 **Condominio/barrio cerrado (seguridad): 25-75%** (Remax 60-75%). En SC es la 1ª pregunta de
  una familia y nadie la tiene como filtro.
- Jardín/patio **70-75%**, quincho/parrillero **30-75%**, piscina **20-50%**, dependencia 10-30%.
- **Fotos: 95-100% con ≥5, mediana 10-15.** A diferencia del terreno (pobre), la casa-vivienda
  tiene material visual abundante → un feed se vería de alta calidad.

**Conclusión de producto — dos negocios opuestos en perfil de dato:**
- **Vivienda (casa)**: datos ricos en texto + muchas fotos. MOAT = extraer con LLM lo que el portal
  no estructura (condominio cerrado, piscina, quincho…) y **permitir filtrar por eso**. Cliente: familia.
- **Suelo (terreno)**: datos pobres, sin fotos. Valor = $/m² normalizado + mapa de oferta. Cliente: desarrollador.

**Recomendación:** el feed de **vivienda en Zona Norte** (264 casas, fotos abundantes, atributos
diferenciables) es el de mayor valor inmediato y menor riesgo visual. El de suelo (Urubó) es valioso
pero como herramienta de datos B2B, no feed de consumo.

### Caveats
- Muestra detalle 20/fuente/zona → ±10-15%. Condominio por keyword: posible falso positivo leve.
- $/m² construido hereda suciedad de moneda C21 (~47%) — referencial.
- Bug captura Remax `number_parking` (garage 0%) — registrar junto a `land_m2`.
