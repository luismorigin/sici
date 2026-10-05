# Playbook del experto

> **Este archivo es el criterio de Lucho.** Lo que está marcado 🟡 es un **valor propuesto
> por Claude para que Lucho lo corrija**: hasta que lo confirme, el agente lo usa pero
> declara que es provisorio. Lo marcado ✅ ya lo decidió Lucho.

## 1. Según el objetivo de la compra

| Objetivo | Qué se mira primero | Cómo se mide |
|---|---|---|
| **Flujo** (renta mensual) | Alquiler comparable, expensas, vacancia | Rendimiento bruto = alquiler anual ÷ precio |
| **Plusvalía** | Zona, edificio, etapa de obra, stock acumulándose | Tendencia de $/m² en la zona (declarar moneda y régimen de la serie) |
| **Vivir ahí** | Ubicación, estado, expensas | Costo mensual real vs. alquilar algo parecido |
| **Resguardo** | Liquidez: qué tan rápido se revende | Días en mercado de los parecidos |

🟡 Un monoambiente suele ser **producto de flujo**: si el cliente habla de plusvalía, señalar
que el tipo de depto apunta a otra cosa.

## 2. Umbrales (a confirmar por Lucho)

| Criterio | Valor | Estado |
|---|---|---|
| Mínimo de comparables para emitir posición | **5** | 🟡 (es el que ya usa el sistema en sheets del feed) |
| Banda "dentro del rango típico" | **p25–p75 del $/m²** | 🟡 |
| Rendimiento bruto "razonable" (alquiler) | **5 % – 7 %** | ✅ Lucho, 2026-10-05 |
| Rendimiento bruto "señal de alarma" (muy alto, desconfiar del dato) | **> 9 %** | ✅ Lucho, 2026-10-05 |
| Rendimiento bruto "bajo" (no compensa) | **< 4 %** | ✅ Lucho, 2026-10-05 |
| Zonas grises (4–5 % y 7–9 %) | "algo bajo" / "algo alto": se declara, sin etiqueta fuerte | ✅ derivado |
| Referencia de mercado hoy, monoambientes (alquiler anual ÷ precio mediano de venta) | Equipetrol ≈ 5,3 % · Zona Norte ≈ 6,1 % — aproximación gruesa, sin expensas | dato medido 2026-10-05 |
| Moneda | Se **pregunta siempre** | ✅ Lucho, 2026-10-05 |
| Alcance inicial | Deptos en venta · Zona Norte + Equipetrol | ✅ Lucho, 2026-10-05 |

> Nota para Lucho: un rendimiento *muy* alto casi nunca es una ganga; suele ser un precio
> mal leído, un alquiler publicado que no se cobra, o un depto con un problema. Por eso hay
> umbral de alarma arriba, no solo abajo.

## 3. Cuándo desconfiar de un precio

- 🟡 **Moneda ambigua** ("30 mil dólares" sin aclarar billete/oficial): el mismo aviso puede
  diferir ~40%. Preguntar siempre.
- 🟡 **Redondo en dólares** ($55.000, $80.000…): ahí rara vez hay una moneda que confirmar;
  no tratarlo como "tipo de cambio sospechoso".
- 🟡 **$/m² muy bajo contra su grupo:** antes de llamarlo ganga, revisar el área (la
  superficie descubierta incluida en el total contamina el $/m²).
- 🟡 **Preventa vs. entregado no son comparables entre sí.** Si el estado de obra no está
  declarado, decir de dónde se dedujo (`estado_origen`).
- 🟡 **Pocos comparables** (<5): no emitir posición; decir cuántos hay.

## 4. Cómo leer una preventa

- ⬜ *(Lucho: ¿qué pedirías ver antes de opinar? fecha de entrega, plan de pagos, quién es
  la desarrolladora, avance de obra…)*

## 5. Particularidades por zona

- **Zona Norte:** mercado de alquiler delgado y menos medido que Equipetrol. Con pocos
  avisos, declararlo. Se filtra por `zona_general`, y la zona se compara por **zona**, no
  por macrozona entera, cuando haya comparables suficientes.
- **Equipetrol:** *(Lucho: perfiles de Eq. Centro / Norte / Sirari / V. Brígida…
  ver `docs/canonical/ZONAS_EQUIPETROL.md`)*.
- ⬜ *(Lucho: ¿qué zonas se comportan distinto y por qué?)*

## 6. Lo que la base NO sabe (siempre declararlo)

| Dato | Estado |
|---|---|
| **Expensas** | Cobertura 0 en Zona Norte (venta y alquiler). Pedirlas al usuario. |
| **Precio de cierre** | No existe: solo precios publicados. |
| **Papeles / folio real / gravámenes** | Fuera de la base. |
| **Antigüedad real del edificio** | Parcial: depende de `proyectos_master`. |
| **Estado de obra** | ~44% de los monoambientes de ZN no lo declaran; se infiere con origen visible. |
| **Alquiler efectivamente cobrado** | No existe: solo alquiler publicado. |

## 7. Registro de decisiones del criterio

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-10-05 | Esqueleto creado; valores 🟡 propuestos | Pendiente de confirmación de Lucho |
| 2026-10-05 | Umbrales de rendimiento 4% / 5–7% / 9%, moneda siempre se pregunta, alcance Zona Norte + Equipetrol | Etapa 0 cerrada |
