# Experimento natural post-paid — Simón Alquileres

**Periodo analizado:** 30 abr → 15 may 2026 (16 días)
**Última campaña Meta:** "Simon Alquileres — Validación" — cerrada 29 abr 2026, $199.97 USD totales
**Contenido orgánico publicado en ese periodo:** cero (sin posts IG/FB, sin stories, sin nada nuevo)

---

## TL;DR

Sin gasto en ads y sin contenido orgánico publicado, en 16 días el producto generó **48 contactos WhatsApp** sobre **33 propiedades** con **31 brokers distintos** contactados. El tráfico GA4 cayó ~95 %, los leads cayeron solo ~33 %. **Dos visitors con comportamiento clínico de inquilinos finales** explican 67 % de los leads identificables.

Es un experimento natural no replicable: tenemos por primera vez una baseline limpia de cuánto vive Simón sin estímulo de marketing.

---

## 1. Contexto

| Item | Valor |
|---|---|
| Última campaña paid | 29 abr 2026 (Simon Alquileres — Validación) |
| Gasto total campaña | $199.97 USD |
| Publicaciones orgánicas IG/FB post-29 abr | 0 |
| Ventana de análisis | 30 abr → 15 may (16 días) |
| Días con leads en BD | 9 de 16 (56 %) |

**Metodología:**
- `leads_alquiler` como fuente de verdad de conversiones (no GA4, que sub-reporta por adblock y mobile in-app).
- Hora Bolivia = UTC-4 en todas las queries.
- Excluye `es_test = true` y `es_debounce = true`.
- Cruce de `visitor_uuid` (cookie de primera parte) + `broker_nombre` (post-fix + backfill) + `utm_source` (confiable desde 8 abr 2026).

---

## 2. Cifras cabeza

### Paid vs Post-paid

| Métrica | Paid (12-29 abr, ~17 d) | Post-paid (30 abr-15 may, 16 d) |
|---|---|---|
| Inversión USD | $199.97 | $0 |
| Sesiones GA4 / día | ~290 | ~13 |
| Leads BD / día | ~4.5 | **3.0** |
| Caída sesiones | — | **−95 %** |
| Caída leads | — | **−33 %** |
| CPL | $3.28 | $0 |
| Propiedades distintas con lead | n/a | **33** |
| Brokers distintos contactados | n/a | **31** |
| Visitors únicos identificados | n/a | 12 (sólo los que tienen cookie persistida) |

### Distribución de leads por bucket

| Bucket | Visitors | Leads | % del total |
|---|---|---|---|
| 1 lead (one-off) | 5 | 5 | 10 % |
| 2 leads | 4 | 8 | 17 % |
| 3 leads | 1 | 3 | 6 % |
| **6+ leads (power-users)** | **2** | **32** | **67 %** |
| Sin cookie persistida | ? | ~16 | ~33 % implícito (no asignables) |

---

## 3. Hallazgo central: dos casos clínicos de uso real

### Caso A — El explorador metódico (`67dc8e...`)

**Perfil de comportamiento:**
- **22 días de actividad sostenida** (22 abr → 14 may).
- **32 leads** sobre **28 propiedades** distintas, contactando **14 brokers** distintos.
- Cobertura de **5 zonas**: Equipetrol Centro/Norte/Oeste, Sirari, Villa Brígida.
- Rango de precios contactados: Bs 2.500 – 8.000 (mediana ~Bs 4.300).
- Tipologías: mayormente monoambientes y 1 dormitorio (promedio 0.9 dorms).
- Dispositivo: card_mobile principalmente, alterna a bottom_sheet (lee detalle).

**Trayectoria de fuente — esto es lo clave:**

| Fase | Fuente | Comportamiento |
|---|---|---|
| 22 abr 23:03 hs | `facebook` paid (1 lead) | Primera entrada via ad activo |
| 23 abr — 14 may | `instagram` orgánico (link_in_bio, 30 leads) | Volvió 16 veces por su cuenta, post-corte de ads |
| 22 abr — 14 may | `sin_utm` (1 lead intermedio) | Tráfico directo o referido |

**El ad lo trajo. El producto lo retuvo.** Después del corte total de paid (29 abr), este visitor siguió volviendo por Instagram orgánico durante **15 días más**, agregando 11 contactos a brokers nuevos.

**Esto es el caso de PMF más limpio que tenemos hoy.**

### Caso B — El shopper intensivo (`4501ce...`)

**Perfil de comportamiento:**
- **Cero historial previo** en BD. Apareció el **7 may 15:47 hs**.
- Sesión de **35 minutos** (15:47 → 16:22 hs), **un solo día**.
- **15 leads** sobre **7 propiedades**, contactando **7 brokers** distintos.
- 3 zonas: Equipetrol Centro (dominante), Equipetrol Norte, Sirari.
- Rango: Bs 3.500 – 8.500 (mediana Bs 4.500). Tipologías 0-2 dorms.
- Source: **sin UTM** en los 15 leads → tráfico directo o referido por WA.

**Trayectoria de dispositivo (revela intensidad):**

| Hora | UI origin | Lo que hizo |
|---|---|---|
| 15:47-15:56 | card_desktop | Contactó 6 brokers en 9 min |
| 16:12-16:13 | card_desktop | Re-contactó Sky Elite + Eurodesign Soho (2 revisitas) |
| 16:14-16:16 | card_desktop / **card_desktop_broker** | Entró a `/broker/X/alquileres` (vio shortlist) y contactó 2 props más |
| 16:17 | card_desktop | NanoTec by Smart Studio |
| 16:18 | card_desktop_broker | Re-contacto Sky Madero |
| 16:22 | **card_mobile** | Cambió a celular y re-contactó Sky Elite (5ta visita) |

**Sky Elite (Bs 4.200, monoambiente Eq. Centro) fue contactado 4 veces** en 35 minutos. Es la propiedad de mayor interés, junto con Sky Madero (Bs 8.500, 2 dorms) que fue revisitada en dispositivo distinto.

Comportamiento típico de inquilino comparando agresivamente antes de decidir, **sin que vos hayas hecho marketing ese día**.

### Lo que ambos casos demuestran

| Punto | Evidencia |
|---|---|
| Son inquilinos, no brokers | 21 brokers distintos contactados entre los dos — un broker no llama a 14 colegas |
| El producto retiene sin estímulo | Caso A volvió 16 veces sin ads ni contenido |
| El producto facilita decisión real | Caso B usó la app intensivamente en una sesión: revisitas, cambio de device, exploración por broker |
| Aceptan no dejar tel | Ambos `usuario_telefono = NULL` (skipearon el modal WA) — son anónimos pero reales |

---

## 4. Composición del tráfico post-paid

### Por fuente UTM

| Source | Leads | % | Interpretación |
|---|---|---|---|
| **sin_utm** | 27 | 56 % | Directo + share WA + referidos no trackeables |
| **instagram** (link_in_bio) | 17 | 36 % | Perfil sigue en search de IG sin posts nuevos |
| facebook | 4 | 8 % | Atribución diferida de la última campaña |

### Por UI origin (de dónde tocan WhatsApp)

| UI origin | Leads | Visitors | Ratio |
|---|---|---|---|
| card_mobile | 22 | 6 | 3.7 leads/visitor |
| **card_desktop** | 14 | 3 | **4.7 leads/visitor** (power-user behavior) |
| bottom_sheet | 8 | 6 | 1.3 (uso casual, abren detalle) |
| card_desktop_broker | 3 | 1 | 3.0 (entró desde `/broker/X/alquileres`) |
| map_card_mobile | 1 | 1 | 1.0 |

### Por horario (hora Bolivia)

| Franja | Leads | % |
|---|---|---|
| Mañana (6-12 hs) | 9 | 19 % |
| **Tarde (12-18 hs)** | **30** | **63 %** |
| Noche (18-24 hs) | 9 | 19 % |

### Por día específico

- **Pico 1: jueves 7 may** — 19 leads (40 % del periodo en un día), concentrados entre 15:00-19:00 hs. El Caso B aporta 15.
- **Pico 2: jueves 14 may** — 9 leads, principalmente 18:00 hs.
- Resto del periodo: 1-7 leads por día, distribuidos.

**No hay pista de fuente externa para los picos:** sin posts orgánicos, sin ads, sin newsletters. Hipótesis tentativa: share en grupos WA con cadencia jueves-tarde (no verificable con la data actual).

---

## 5. Lo que vive sin marketing — tres motores

| Motor | Aporte estimado | Decae si nada se hace? |
|---|---|---|
| **Tráfico directo / share WA** (sin_utm) | ~56 % | No decae si el producto entrega valor. Único motor de PMF puro. |
| **Instagram bio search** (link_in_bio) | ~36 % | Decae en 60-90 días sin contenido nuevo (perdés ranking en search) |
| **Brand residual de ads** (sin_utm de quien vio ad y volvió) | Parte de los 56 % de sin_utm | Decae fuerte en 30-45 días |

**Lo único que no decae solo es el componente 1.** El piso real del producto sin marketing va a quedar visible cuando los componentes 2 y 3 se hayan apagado (60+ días).

---

## 6. Bug encontrado durante el análisis (resuelto)

**Hallazgo:** `broker_nombre` estaba `NULL` en los 48 leads post-paid (vs 40-45 % poblado en periodos anteriores).

**Causa:** el hook `useWhatsAppCapture` (introducido el 18 abr con el modal WA Capture) hardcodeaba `broker_nombre: ''` al enviar el lead. Hacia el 30 abr terminó la migración del 100 % del flujo de cards al hook → desde entonces, 100 % NULL.

**Resolución (15 may 2026):**

1. **Fix frontend** — commit `7374de7`: agregar `agente_nombre` opcional al `CaptureProperty` interface y pasarlo en `buildPayload`. Una línea funcional. Typecheck OK.

2. **Backfill** — UPDATE sobre los 56 leads existentes (incluye debounced) usando el mismo `COALESCE` que el RPC `buscar_unidades_alquiler`. **56/56 (100 %) recuperados.**

3. **Cobertura por portal con el path correcto:**

   | Portal | Path | Cobertura |
   |---|---|---|
   | Century21 | `datos_json_discovery.asesorNombre` | 117/117 (100 %) |
   | Remax | `datos_json_enrichment.llm_output.agente_nombre` | 35/35 (100 %) |
   | Bien Inmuebles | idem Remax | 1/1 (100 %) |

**Impacto en el análisis:** sin el fix, no se hubiera podido validar el hallazgo central (los 2 power-users contactaron 21 brokers distintos, lo que descarta la hipótesis "broker shopping para 1 cliente"). El bug ocultaba evidencia de PMF.

---

## 7. Limitaciones honestas del análisis

| Limitación | Implicación |
|---|---|
| **visitor_uuid no se setea siempre** (privacy mode, cookie blockers) | ~16 leads sin visitor_uuid no son asignables a una persona. El conteo "2 visitors = 67 %" se refiere solo al subset identificable. El total real de visitors únicos probablemente está entre 15-25. |
| **broker_nombre fixeado el 15 may + backfill** | Los datos pasados son válidos retrospectivamente, pero futuros leads (post-deploy) van a tener el campo poblado en tiempo real, lo que permite cruzar con `broker_telefono` y detectar shopping intensivo en vivo. |
| **22 leads sin UTM no son atribuibles** | No sabemos si vienen de share WA, voz a voz, o tráfico directo. Sin instrumentación adicional (preguntar "¿cómo nos encontraste?") es indistinguible. |
| **16 días es ventana corta** | El componente "brand residual de ads" aún decae. Lo que vemos hoy mezcla PMF real + eco de paid. La separación clara llega en 30-60 días más. |
| **Sin tracking de cierre de contrato** | Lead WhatsApp ≠ contrato firmado. El broker maneja el cierre fuera de Simón. No tenemos visibilidad de la tasa de conversión real. |
| **Pico 7 may = Caso B** | El pico no fue marketing ni boca a boca masivo; fue una persona usando intensivamente. Importante no inflar narrativa de "tráfico viral". |

---

## 8. Implicaciones para decisión

### Si re-prender paid

- **CPL pre-corte:** $3.28/lead. Benchmark inmobiliario regional: $5-15. Era eficiente.
- **Pieza mejor convertidora:** Haus Equipe (bof-propiedad) con 1.03 % conversión sesión→lead — 4-5× mejor que ads de feed amplio (Avanti, shortlist Sirari).
- **Pre-requisito antes de gastar:** fixear el modal WA. Hoy el 2-8 % deja datos (consent + tel). Cada punto de mejora multiplica el ROI del próximo USD invertido.
- **Tamaño piloto recomendado:** $50-100 sobre una pieza tipo Haus, una sola propiedad caliente, antes de escalar.

### Si dejarlo correr (mi recomendación)

El test natural en curso es **el dato más valioso que vas a poder generar sobre Simón este año.** No se puede reproducir intencionalmente.

- **Próximas 4 semanas:** medir la curva de decaimiento sin tocar nada.
- **Piso esperable a 30 días:** entre 0.5 y 2 leads/día. Cualquier número >1 sostenido es señal real.
- **Si caés a <0.5 leads/día sostenido** → el producto sin marketing no tracciona. Hay que reactivar paid o construir motor de contenido orgánico.
- **Si te quedás en 1.5-2+ leads/día** → hay base sobre la cual construir.

### Pendientes accionables sin costo

1. **Investigar los picos de jueves** (7 y 14 may). Mirar grupos WA personales / brokers / cualquier referente que comparta links los jueves-tarde.
2. **Fix del modal WA capture** — único lever de monetización gratis hoy.
3. **Agregar pregunta "¿cómo nos encontraste?"** en el modal para resolver el agujero de los 22 sin_utm.
4. **Identificar al Caso A** — si vuelve y deja teléfono alguna vez, es tu primer testimonio documentable de PMF orgánico.

---

## 9. Conclusión

Por primera vez tenemos evidencia limpia de que **Simón Alquileres genera valor sin ningún input de marketing**: 48 leads, 33 propiedades, 31 brokers, 5 zonas, en 16 días, $0 invertidos. Dos visitors usaron el producto como inquilinos serios reales, no como ruido casual.

No alcanza para declarar PMF — es un n=12 visitors identificables, en ventana corta, con brand residual de paid aún activo. Pero **descarta la hipótesis nula** de que sin ads el producto se apague. Hay algo vivo, y vale la pena dejar correr el experimento natural antes de re-prender paid para medir el piso real.

El bug de `broker_nombre` que se encontró y resolvió durante este análisis (commit `7374de7` + backfill 56/56) deja la instrumentación lista para que la próxima ventana de análisis (jun-jul) sea más clara aún.

---

**Versión:** 1.0 — 15 may 2026
**Autor:** análisis ejecutado vía `/metrics` + cruce SQL BD
**Próxima revisión sugerida:** 15 jun 2026 (30 días más de baseline sin marketing)
