# ROADMAP PRODUCTOS SICI - Ideas Post-MVP

## CONTEXTO
El MVP actual es solo PERFIL VIVIENDA (comprador final).
Estas son ideas para productos futuros dirigidos a diferentes actores del ecosistema inmobiliario.

---

## PRODUCTO 1: MVP MULTI-PERFIL (Evolución inmediata)

**4 perfiles de formulario con 20 preguntas cada uno:**

| Perfil | Usuario | Valor diferencial |
|--------|---------|-------------------|
| Vivienda | Comprador final | Encontrar hogar ideal |
| Inversor Renta | Inversor yield | ROI, ocupación, gestión |
| Inversor Plusvalía | Inversor capital gains | Zonas emergentes, timing |
| Transición | Vendedor que compra | Coordinar venta + compra |

**Por qué es valioso:** Data de inversores es MÁS valiosa que compradores finales.

---

## PRODUCTO 2: VERIFICADOR DE OFERTA (B2C)

**Usuario:** Persona que recibió una oferta y quiere validarla
**Input:** Datos del inmueble ofrecido (precio, zona, m², dorms)
**Output:**
- Comparación vs mercado
- "Esta oferta está 12% sobre el promedio de la zona"
- Propiedades similares disponibles
- Recomendación: justo / caro / ganga

**Valor:** ACM rápido para consumidor final

---

## PRODUCTO 3: ACM RÁPIDO PARA ASESORES (B2B)

**Usuario:** Asesor inmobiliario
**Input:** Datos de propiedad a listar
**Output:**
- Precio sugerido con rango
- Comparables activos en mercado
- Tiempo estimado de venta por precio
- PDF exportable para cliente

**Monetización:** Suscripción mensual o por uso

---

## PRODUCTO 4: COMPLEMENTO AVALÚOS (B2B)

**Usuario:** Avaluadores certificados
**Problema:** Bancos piden complementar avalúos con links de ofertas comparables
**Situación actual:** Usan portales con data basura
**Output:**
- Links verificados de ofertas comparables
- Data limpia y estructurada
- Formato compatible con requerimientos bancarios

**Monetización:** Por avalúo o suscripción

---

## PRODUCTO 5: VISIÓN MERCADO DESARROLLADORES (B2B)

**Usuario:** Desarrolladores inmobiliarios
**Input:** Zona + tipología de interés
**Output:**
- Stock actual por tipología
- Precios promedio y rangos
- Competidores activos (otros desarrolladores)
- Velocidad de absorción estimada
- Gaps de mercado (tipologías sin oferta)

**Valor:** Decisiones de desarrollo informadas
**Monetización:** Reportes premium o suscripción

---

## PRODUCTO 6: ANÁLISIS CREDITICIO INTEGRADO (B2C + B2B)

**Usuario:** Comprador que no sabe si califica
**Problema:** La búsqueda de vivienda sin conocer capacidad crediticia es pérdida de tiempo
**Integración:** Credicheck (MVP existente)

**Flujo propuesto:**
1. Usuario completa perfil vivienda
2. Opción: "¿Querés saber si calificás para este rango?"
3. Análisis crediticio rápido (Credicheck)
4. Output combinado:
   - Propiedades que SÍ puede comprar
   - Capacidad de endeudamiento real
   - Simulación de cuota

**Valor diferencial:**
- Data enriquecida en TODO el ciclo (búsqueda + financiamiento)
- Leads pre-calificados (más valiosos para inmobiliarias/bancos)
- Reduce frustración del comprador

**Monetización:**
- Referral fee a bancos/financieras
- Lead calificado premium para desarrolladores

---

## PRODUCTO 7: ÍNDICE EQUIPETROL - DATA INSTITUCIONAL (B2B Enterprise)

**Usuario:** Bancos, fondos de inversión, aseguradoras
**Problema:** No existe índice confiable del mercado inmobiliario boliviano
**Oportunidad:** Ser el "S&P Case-Shiller" de Bolivia

**Output:**
- Índice de precios por zona (mensual/trimestral)
- Tendencias de absorción
- Indicadores de riesgo por zona
- Data histórica normalizada

**Valor institucional:**
- Evaluación de riesgo hipotecario
- Decisiones de cartera inmobiliaria
- Cumplimiento regulatorio (valoración de garantías)

**Por qué SICI puede hacerlo:**
- Censo semanal automatizado
- Data limpia y verificada (92%+ desarrolladores, 98% matching)
- Histórico creciendo cada semana

**Monetización:**
- Suscripción institucional ($$)
- API de datos
- Reportes custom

**Status:** Idea temprana - requiere 6-12 meses de data histórica

---

## PRIORIZACIÓN SUGERIDA (Post-MVP Vivienda)

| Orden | Producto | Razón |
|-------|----------|-------|
| 1 | Multi-perfil (Inversor) | Data valiosa + mismo stack |
| 2 | Credicheck integrado | Enriquece ciclo completo |
| 3 | Verificador Oferta | Viral, fácil de construir |
| 4 | ACM Asesores | Revenue recurrente B2B |
| 5 | Complemento Avalúos | Nicho específico, alto valor |
| 6 | Visión Desarrolladores | Requiere más data histórica |
| 7 | Índice Institucional | Juego largo, posicionamiento |

---

## VISIÓN ESTRATÉGICA

```
                    CONSUMIDOR FINAL
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    Vivienda         Inversor        Verificador
         │                │                │
         └────────────────┼────────────────┘
                          │
                    ┌─────┴─────┐
                    │   SICI    │
                    │DATA LAYER │
                    └─────┬─────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
    Asesores       Desarrolladores    Avaluadores
    (ACM)          (Visión Mercado)  (Complemento)
         │                │                │
         └────────────────┼────────────────┘
                          │
                    ┌─────┴─────┐
                    │  ÍNDICE   │ ← Valor institucional
                    │EQUIPETROL │
                    └───────────┘
                          │
                       BANCA
                   (Enterprise $$)
```

---

## EL JUEGO LARGO

1. **MVP Vivienda** → Validar approach
2. **Multi-perfil + Credicheck** → Data enriquecida
3. **B2B (Asesores, Avaluadores)** → Revenue recurrente
4. **Índice Institucional** → Posicionamiento como infraestructura del mercado

> **Simón no es una app de búsqueda.**
> **Es la capa de inteligencia del mercado inmobiliario boliviano.**

---

## NOTA PARA DESARROLLO

| | |
|---|---|
| ⚠️ | Este documento es **VISIÓN ESTRATÉGICA**, no backlog técnico |
| ❌ | NO construir nada de esto hasta validar MVP Vivienda |
| ✅ | El único foco ahora es: `MVP_SPRINT_PLAN.md` |
| 📋 | Este roadmap existe para dar **CONTEXTO**, no tareas |
