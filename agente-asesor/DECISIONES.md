# Decisiones, pendientes y hallazgos del agente asesor

## Etapa 0 — Decisiones de Lucho (bloquean la función `evaluar_oferta`)

| # | Decisión | Propuesta de Claude | Respuesta de Lucho |
|---|---|---|---|
| 1 | Alcance inicial | Deptos en venta, Zona Norte + Equipetrol | ✅ Aceptado (2026-10-05) |
| 2 | Moneda | Preguntar **siempre** ("30 mil dólares" ¿billete / oficial / Bs?) | ✅ Aceptado (2026-10-05) |
| 3 | Rendimiento bruto: bajo / razonable / alarma | Bajo <4% · Razonable 5–7% · Alarma >9% (el 4–5% y 7–9% son zonas grises) | ✅ Aceptado tal cual (2026-10-05) |
| 4 | `buscar_acm()` | Reemplazar con `evaluar_oferta`; decidir el retiro en la Etapa 5 | ✅ Aceptado (2026-10-05) |

**Etapa 0 CERRADA el 2026-10-05.**

## Estado de las etapas 1–3 (2026-10-05)

✅ **Migración 355 APLICADA y VERIFICADA el 2026-10-05:** `sql/migrations/355_agente_asesor_evaluar_oferta.sql`
(tabla `criterio_agente` + función `evaluar_oferta`, incluye el rendimiento de la Etapa 3).
Chequeos pasados: permisos (anon y authenticated NO ejecutan; service_role y claude_readonly sí;
sin PUBLIC), 9 umbrales cargados, cero dependencia de vistas sin `_shadow`, determinismo
(10 corridas → 1 resultado), moneda obligatoria, coordenadas invertidas/ausentes/en otra
macrozona con mensaje claro, GPS → edificio, homónimos, edificio denso → pregunta por nombre,
`usd_oficial`, `bs`, menos de 5 comparables → no emite posición.
**Pendiente conocido:** los candidatos por nombre no se filtran por macrozona (ver abajo).

~~Estado anterior (obsoleto):~~ migración escrita, sin aplicar.

- Registrada en `docs/migrations/MIGRATION_INDEX.md` y `CLAUDE.md` de esta carpeta ya usa
  la función; `consulta-provisoria.sql` queda solo como respaldo.
- 🟡 **Pendiente (hallazgo del chequeo):** al resolver por NOMBRE, los candidatos no se
  filtran por macrozona. "Portofino V" con `p_macrozona => 'Zona Norte'` ofrece también
  edificios de Villa Brígida (Equipetrol) y uno "Sin zona". No es incorrecto (no adivina),
  pero la pregunta al usuario trae opciones que no vienen al caso. Arreglo propuesto:
  filtrar por `zona_general = v_macro` (los "Sin zona" quedan afuera). Es un
  `CREATE OR REPLACE` chico, sin cambio de firma.
  ✅ **CERRADO: `sql/migrations/356_evaluar_oferta_candidatos_por_macrozona.sql` aplicada y verificada el 2026-10-05.**
  Chequeos: permisos intactos, sin vistas sin `_shadow`, filtro y mensaje nuevos presentes,
  "Portofino V" en ZN → 3 candidatos, con GPS sigue resolviendo (`nombre+gps`, 11 m),
  determinismo (10 corridas → 1 resultado), edificio de otra macrozona → `no_encontrado`.
  🟡 Abierto aparte: **Condominio Curupau 3** (activo, con avisos de venta vivos) tiene zona
  'Sin zona': no aparece ni por nombre ni por GPS. Revisar su ubicación en `proyectos_master`.
  Historia de la 356:
  Verificado antes: el cuerpo en producción era idéntico al de la 355 (md5 y largo). Diff
  contra la 355: 2 líneas. Efecto medido sobre "Portofino V" en Zona Norte: candidatos 6 → 3.
  Costo declarado: 19 edificios activos tienen zona 'Sin zona' (fuera de cobertura) y dejan de
  aparecer por nombre; **1 de ellos tiene avisos de venta vivos** (ya era invisible por GPS).
- 🟡 **Pendiente:** el sistema de umbrales "propuestos" (mínimo 5 comparables, banda p25–p75,
  alerta de $/m² < 70% de la mediana) espera confirmación de Lucho.
- 📍 **Ubicación por GPS (pedido de Lucho, 2026-10-05): "nunca pedir id, nadie lo sabe".**
  La función recibe `p_lat`/`p_lon` (el pin de Google Maps) y deduce sola zona y macrozona.
  El edificio se resuelve así: por GPS solo únicamente si es inequívoco (el más cercano a
  ≤40 m y el segundo ≥40 m más lejos); si no, devuelve candidatos **con nombre y distancia**
  y el agente pregunta por nombre. El id lo maneja el agente por dentro.
  Medido (simulando un pin impreciso sobre cada edificio conocido): **0 resoluciones
  erróneas** en 4 pruebas; pregunta más donde hay edificios juntos — Equipetrol 77% de los
  casos a 17 m de error (182/236), Zona Norte 24% (57/235). Es el costo deliberado de no
  adivinar (el GPS solo nunca decidió el matching, misma regla). Límite de la prueba: la
  verdad es el punto del propio catálogo, no un pin real de usuario.
- Limitaciones declaradas de v1: expensas (no hay dato) no se restan; alquiler amoblado y
  sin amoblar no se distinguen; el nombre del edificio se resuelve solo si es inequívoco
  (`normalize_nombre` quita números romanos: "Portofino V" coincide con 3 edificios y la
  función lo declara ambiguo en vez de adivinar → hay que pasar `p_id_proyecto_master`).

## Plan por etapas

| Etapa | Qué | Listo cuando |
|---|---|---|
| 0 | Decisiones de arriba | 4 números/decisiones escritos |
| 1 | Tabla `criterio_agente` (umbrales versionados) | La función lee umbrales de la tabla, no del código |
| 2 | `evaluar_oferta` — parte precio (moneda, cascada edificio→zona→macrozona, p25/50/75, posición, `recibo`) | Misma entrada ×10 = cifras idénticas · n<5 no emite posición · no depende de vistas sin `_shadow` |
| 3 | Rendimiento y rotación (alquiler comparable, días en mercado) | n<5 alquileres → `null` con motivo |
| 4 | Prompt del agente + set firmado (30–50 casos) | El set corre y Lucho revisa cada desvío |
| 5 | Decidir retiro de `buscar_acm` + `ACMInline` | — |

Reparto: Claude escribe migraciones, pruebas y prompt; **Lucho aplica el SQL**, define los
umbrales y firma los casos. Migraciones: numerar con `docs/migrations/MIGRATION_INDEX.md`,
usar `sql/migrations/_template.sql` (REVOKE primero, GRANT explícito) y verificar que el rol
de solo lectura pueda ejecutar la función.

## 🔴 Hallazgo: `buscar_acm()` está rota (investigado 2026-10-05)

- Lee `v_mercado_venta` y `v_mercado_alquiler` **sin `_shadow`** → foto congelada del 27-jul.
- Además su histórico lee `precios_historial` (congelada el 27-jul).
- Efecto medido sobre las 416 props vivas de Equipetrol: **294 (71%) no existen en la vista
  vieja** → el API `/api/acm` responde 404 y el bloque no muestra nada; de las 122 que sí,
  **89 tienen precio distinto** (ej. id 1162: vivo $53.000 vs vista vieja $91.181).
- Único consumidor vivo: `ACMInline` (modo broker del feed de ventas) vía `api/acm.ts`.
  `generate-cma.ts` solo la menciona en un comentario.
- **No se modificó nada.** No se midió cuánto se usa el modo broker.
- Además, evalúa propiedades ya cargadas; no sirve para ofertas externas (por eso la
  función nueva).

## Cómo se usa esta carpeta

1. Abrir Claude en `agente-asesor/` (el `CLAUDE.md` de acá define el rol).
2. Plantear una oferta. El agente pregunta objetivo y datos, mide con la consulta
   provisoria y responde con recibo.
3. Corregirlo. Cada corrección buena → un caso en `casos-firmados/` o una regla en
   `playbook.md`.

## Sin commitear

Esta carpeta se creó el 2026-10-05 y **no está commiteada**.
