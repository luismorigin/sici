# Beta Feedback System - Plan Completo

> **Estado:** ⏳ PENDIENTE (Prerequisito: Pulir Informe Premium)
> **Última actualización:** 20 Enero 2026

## Contexto

Antes de monetizar Simón, necesitamos validar el producto con usuarios reales. Este sistema ofrece el Informe Premium **GRATIS** a cambio de feedback estructurado.

### Principio Estratégico

> "En real estate, la gente no paga por información. Paga por **reducir el miedo a equivocarse**."

El Informe Premium resuelve:
- ¿Estoy pagando de más?
- ¿Cómo negocio?
- ¿Qué debo preguntar antes de comprar?

## Pricing Structure

| Fase | Precio | Condición |
|------|--------|-----------|
| **Beta** | GRATIS | Feedback obligatorio |
| **Lanzamiento** | $29.99 USD | Precio promocional |
| **Normal** | $49.99 USD | Precio regular |

---

## Flujo Estratégico Beta

```
┌─────────────────────────────────────────────────────────┐
│  1. BÚSQUEDA (GRATIS, sin registro)                     │
│     └── Usuario busca → Ve TOP 3 + 10 alternativas      │
│     └── Síntesis fiduciaria básica por propiedad        │
│     └── Mapa con pins MOAT                              │
│     └── VALOR: Sabe QUÉ opciones existen                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. SELECCIÓN DE FAVORITOS                              │
│     └── Usuario elige 3 propiedades con ❤️              │
│     └── "Elegiste 3 propiedades"                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. ORDENAR FAVORITAS (NUEVO)                           │
│     └── "Ordená tus favoritas"                          │
│     └── Usuario arrastra para ordenar #1, #2, #3        │
│     └── "¿Por qué es tu #1?" (precio/ubicación/etc)     │
│     └── La #1 será el FOCO del informe                  │
│     └── #2 y #3 se comparan CONTRA la #1                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  4. MOSTRAR EJEMPLO DE INFORME PREMIUM                  │
│     └── "Así se ve un Informe Fiduciario Premium"       │
│     └── Mostrar ejemplo real (estilo v3)                │
│     └── Usuario VE el valor antes de opinar             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  5. FEEDBACK (obligatorio para recibir informe)         │
│     └── 4 preguntas sobre el INFORME EJEMPLO            │
│     └── "¿Pagarías $49.99 por uno así?"                 │
│     └── Ingresa WhatsApp para recibir SU informe        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  6. ENTREGA POR WHATSAPP                                │
│     └── Slack notifica al equipo                        │
│     └── Se genera PDF personalizado                     │
│     └── Se envía por WhatsApp (SLA: <2 horas)           │
└─────────────────────────────────────────────────────────┘
```

**Claves:**
- El feedback es ANTES de recibir el informe (el informe es el premio)
- El paso de ORDENAR permite informe enfocado en #1 con comparaciones útiles

### Pantalla: Ordenar Favoritas

```
┌─────────────────────────────────────────────────────────┐
│  Ordená tus favoritas                                   │
│                                                         │
│  ¿Cuál te interesa MÁS? Arrastrá para ordenar.         │
│                                                         │
│  ┌─────────────────────────────────────┐               │
│  │ 1  Vienna - $127,000      ≡ ⬆️⬇️   │               │
│  └─────────────────────────────────────┘               │
│  ┌─────────────────────────────────────┐               │
│  │ 2  Altera - $134,000      ≡ ⬆️⬇️   │               │
│  └─────────────────────────────────────┘               │
│  ┌─────────────────────────────────────┐               │
│  │ 3  Spazios - $119,000     ≡ ⬆️⬇️   │               │
│  └─────────────────────────────────────┘               │
│                                                         │
│  ¿Por qué Vienna es tu #1?                             │
│  [ ] Mejor precio                                       │
│  [ ] Mejor ubicación                                    │
│  [ ] Mejores amenidades                                 │
│  [ ] Me gustó más (intuición)                          │
│                                                         │
│  ℹ️ Tu #1 será el foco del informe.                    │
│     #2 y #3 se comparan contra ella.                   │
│                                                         │
│  [Continuar →]                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisitos

- [ ] **Informe Premium pulido** - Estilo Platinum 1 (comparables, estimación, negociación)
- [ ] **Ejemplo de informe** - PDF/HTML demo para mostrar antes del feedback
- [ ] **Flujo completo funcionando** - Desde búsqueda hasta selección de favoritos
- [ ] **Generador de PDF** - Para crear informe personalizado

---

## Fases de Implementación

### FASE 1: MVP Manual (Semana 1)
**Objetivo:** Validar el concepto con los primeros 10-20 usuarios

#### 1.1 UI Feedback Form
- [ ] Pantalla post-informe con formulario
- [ ] 4 preguntas máximo:
  1. Claridad del informe (1-5 estrellas)
  2. ¿Qué te confundió? (texto corto, opcional)
  3. ¿Pagarías $29.99 por esto? (Sí / No / Tal vez)
  4. ¿Sugerencias? (texto, opcional)
- [ ] Selección de 3 propiedades favoritas
- [ ] Captura WhatsApp + Email

#### 1.2 Notificación Slack
- [ ] **Webhook Slack** al recibir feedback
- [ ] Mensaje incluye:
  ```
  🎯 Nuevo Beta Feedback
  ━━━━━━━━━━━━━━━━━━━
  👤 WhatsApp: +591 XXXXXXXX
  📧 Email: usuario@email.com

  ⭐ Claridad: 4/5
  💰 ¿Pagaría?: Sí
  🏠 Props favoritas: #123, #456, #789

  💬 Confusión: "No entendí la razón fiduciaria"
  💡 Sugerencia: "Más fotos"

  ⏰ Recibido: 2026-01-20 14:30
  ```
- [ ] **SLA:** Responder en máximo 2 horas (horario laboral)

#### 1.3 Proceso Manual
- [ ] Recibir Slack → Generar PDF manualmente
- [ ] Enviar por WhatsApp con mensaje personalizado
- [ ] Registrar en spreadsheet de tracking

**Entregables Fase 1:**
- Formulario funcional en `/resultados`
- Webhook Slack configurado
- Template de mensaje WhatsApp
- Spreadsheet de tracking

---

### FASE 2: Semi-Automatizado (Semana 2-3)
**Objetivo:** Reducir tiempo de respuesta a <30 minutos

#### 2.1 Generación PDF Automática
- [ ] Endpoint `/api/generar-pdf`
- [ ] Usa datos del informe ya generado
- [ ] Guarda en Supabase Storage

#### 2.2 Cola de Procesamiento
- [ ] Tabla `beta_feedback_submissions`
  ```sql
  id, created_at, whatsapp, email,
  claridad_score, pagaria, confusion_text, sugerencia_text,
  propiedades_ids[], informe_id,
  pdf_url, status (pending/sent/failed),
  sent_at, sent_by
  ```
- [ ] Vista en Supabase para procesar pendientes

#### 2.3 Slack Mejorado
- [ ] Botón "Marcar como Enviado" en Slack
- [ ] Actualiza status en BD
- [ ] Métricas diarias automáticas

**Entregables Fase 2:**
- PDF auto-generado
- BD de submissions
- Dashboard básico de pendientes

---

### FASE 3: Automatización Completa (Semana 4+)
**Objetivo:** Zero-touch para 80% de los casos

#### 3.1 Envío Automático WhatsApp
- [ ] Integración WhatsApp Business API (o Twilio)
- [ ] Template aprobado por Meta
- [ ] Envío automático con PDF adjunto

#### 3.2 Fallback Email
- [ ] Si WhatsApp falla → Email automático
- [ ] Template HTML del informe
- [ ] PDF como attachment

#### 3.3 Dashboard Métricas
- [ ] Total submissions
- [ ] Promedio claridad
- [ ] % que pagaría (Sí/No/Tal vez)
- [ ] Tiempo promedio de respuesta
- [ ] Tasa de conversión feedback→informe

#### 3.4 Alertas Automáticas
- [ ] Slack diario: resumen métricas
- [ ] Alerta si SLA >2h sin responder
- [ ] Weekly digest con insights

**Entregables Fase 3:**
- Flujo 100% automático
- Dashboard en tiempo real
- Reportes semanales

---

## Preguntas del Formulario (Final)

> **Contexto:** El usuario YA vio un ejemplo de Informe Premium (ej: Platinum 1).
> Las preguntas evalúan ese ejemplo, no la búsqueda.

### Q1: Utilidad del Informe (Obligatorio)
```
Viendo este ejemplo de Informe Fiduciario, ¿qué tan útil te parece?
[1 ⭐] [2 ⭐⭐] [3 ⭐⭐⭐] [4 ⭐⭐⭐⭐] [5 ⭐⭐⭐⭐⭐]
```

### Q2: Sección más valiosa (Obligatorio)
```
¿Qué sección te pareció MÁS valiosa?
[ ] Comparables del mercado
[ ] Estimación de precio justo
[ ] Estrategia de negociación
[ ] Checklist de preguntas
[ ] Otra: ________
```

### Q3: Valor Percibido - PRECIO (Obligatorio)
```
¿Pagarías $49.99 por un informe así para TUS propiedades?
[ ] Sí, lo vale
[ ] Tal vez, depende del momento
[ ] No, es muy caro
[ ] No, prefiero buscar solo
```

### Q4: Mejoras (Opcional)
```
¿Qué le agregarías o quitarías al informe?
[________________] (max 300 chars)
```

### Datos de Contacto (Obligatorio)
```
¿Dónde te enviamos TU Informe Fiduciario personalizado?

WhatsApp: [+591 ________] (obligatorio)
Email: [________________] (opcional, para PDF)
```

> **Nota:** La selección de 3 propiedades ya se hizo ANTES de llegar al feedback.

---

## Copy & Mensajes

### Pantalla: Mostrar Ejemplo de Informe
```
📊 Así se ve un Informe Fiduciario Premium

Este es un ejemplo real de análisis para el edificio "Platinum 1".

Tu informe incluirá lo mismo, pero para TUS 3 propiedades elegidas:

✓ Comparables del mercado (5-8 propiedades similares)
✓ Estimación de precio justo (con cálculo detallado)
✓ Estrategia de negociación (argumentos + ofertas)
✓ Checklist de preguntas antes de comprar

[Ver ejemplo completo ↓]

[INFORME EJEMPLO - PLATINUM 1]
```

### Pantalla: Solicitar Feedback
```
🎁 Tu Informe Fiduciario está listo
(Valor $49.99 → GRATIS para beta testers)

Antes de enviártelo, ayudanos con 2 minutos de feedback
sobre el ejemplo que acabás de ver.

Tu opinión nos ayuda a mejorar Simón.

[Dar feedback y recibir mi informe →]
```

### Mensaje WhatsApp (Template)
```
¡Hola! 👋

Gracias por probar Simón y darnos tu feedback.

Acá está tu Informe Fiduciario personalizado 📊

[PDF adjunto]

Incluye análisis de tus 3 propiedades:
• {propiedad_1}
• {propiedad_2}
• {propiedad_3}

Con comparables, precio justo estimado, y estrategia de negociación.

¿Dudas? Respondé a este mensaje.

— Equipo Simón
```

### Confirmación Post-Submit
```
✅ ¡Gracias por tu feedback!

Tu Informe Fiduciario está en camino.
Lo recibirás por WhatsApp en menos de 2 horas.

Propiedades incluidas:
• {propiedad_1}
• {propiedad_2}
• {propiedad_3}

¿No lo recibiste? Escribinos a soporte@simon.bo
```

---

## Métricas a Trackear

| Métrica | Objetivo Beta | Por qué importa |
|---------|---------------|-----------------|
| Submissions totales | 50+ | Volumen para validar |
| Promedio utilidad | ≥4.0/5 | ¿El informe es útil? |
| % "Sí pagaría $49.99" | ≥40% | Validación de precio |
| % "Tal vez" | ≥30% | Potencial con ajustes |
| Sección más votada | - | Qué priorizar |
| Tiempo respuesta WhatsApp | <2h | SLA cumplido |
| Tasa completado feedback | ≥70% | Fricción del form |
| Drop-off en ejemplo | <30% | ¿El ejemplo engancha? |

---

## Dependencias Técnicas

### Fase 1
- Slack Webhook (ya configurado en n8n)
- Formulario React en simon-mvp

### Fase 2
- Supabase Storage (PDFs)
- Tabla `beta_feedback_submissions`
- Endpoint Next.js API

### Fase 3
- WhatsApp Business API o Twilio
- SendGrid/Resend para emails
- Dashboard (puede ser Metabase o custom)

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Bajo volumen de submissions | Promocionar en redes, pedir a conocidos |
| Feedback muy negativo | Iterar rápido, agradecer honestidad |
| WhatsApp spam filter | Usar templates aprobados, no automatizar masivo |
| SLA incumplido | Alertas Slack, backup de personas |

---

## Timeline Estimado

```
PREREQUISITO: Pulir Informe Premium
         ↓
    [FASE 1: 1 semana]
    MVP Manual + Slack
         ↓
    [FASE 2: 2 semanas]
    Semi-automatizado
         ↓
    [FASE 3: 2+ semanas]
    Automatización completa
```

**Total:** ~5-6 semanas desde que el informe esté listo

---

## Checklist Pre-Lanzamiento Beta

### Informe Premium
- [ ] Estructura tipo Platinum 1 definida
- [ ] Template HTML/PDF creado
- [ ] Ejemplo de informe listo para mostrar (Platinum 1 o similar)
- [ ] Generador de informe personalizado funcionando

### Flujo de Feedback
- [ ] Pantalla "Ver ejemplo de informe" implementada
- [ ] Formulario de feedback (4 preguntas) implementado
- [ ] Validación de WhatsApp funcionando
- [ ] Flujo completo: búsqueda → favoritos → ejemplo → feedback → confirmación

### Infraestructura
- [ ] Webhook Slack configurado y testeado
- [ ] Template mensaje WhatsApp listo
- [ ] Proceso de generación de PDF definido (manual o auto)
- [ ] Spreadsheet/BD para tracking de submissions

### Equipo
- [ ] Equipo notificado del SLA (<2h respuesta)
- [ ] Responsable de turno definido
- [ ] Proceso de escalación si SLA falla

### QA
- [ ] Test end-to-end completado
- [ ] Test en móvil (WhatsApp flow)
- [ ] Copy revisado por nativo

---

## Notas

- Este plan se activa DESPUÉS de pulir el Informe Premium
- Fase 1 es suficiente para validar el concepto
- No sobre-automatizar antes de tener volumen
- El feedback es más valioso que la automatización perfecta

### Decisiones Estratégicas Clave

1. **Feedback ANTES, informe DESPUÉS** - Si damos el informe primero, no hay incentivo para responder
2. **Mostrar ejemplo real** - El usuario debe VER el valor para opinar sobre el precio
3. **Precio correcto: $49.99** - Preguntar sobre el informe premium, no sobre la búsqueda
4. **WhatsApp como canal** - Penetración ~95% en Bolivia, más efectivo que email

### Referencia: Informe Ejemplo

El archivo `C:\Users\LUCHO\Desktop\simon-mvp\docs\ejemplos-informes\informe-fiduciario-platinum1.html`
contiene el ejemplo de Informe Fiduciario Premium que se usará como demo.

Estructura del Platinum 1:
1. Resumen Ejecutivo (specs + estimación)
2. El Edificio (amenidades vs mercado)
3. Análisis de Comparables (8 propiedades)
4. Gráfico Precio/m²
5. Estimación Detallada (cálculo con ajustes)
6. Checklist de Verificación
7. Estrategia de Negociación
8. Conclusión y Recomendación
