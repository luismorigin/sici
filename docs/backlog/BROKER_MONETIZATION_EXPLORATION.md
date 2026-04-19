# Monetización B2B: Brokers en Simón

**Estado:** Backlog exploratorio — NO implementar sin validar hipótesis.
**Fecha:** 18 Abr 2026
**Origen:** Conversación post-deploy Fase 1 modal captura WA.
**Prerequisito para iniciar:** Fase 2 del modal validada (≥3-4 días de data de /alquileres).

---

## 1. Problema observado

El tráfico de `/alquileres` (y próximamente `/ventas`) no es 100% de compradores/inquilinos finales. Una fracción relevante son **brokers** usando Simón para:

- Investigar competencia y precios del mercado
- Buscar al **captador** de una propiedad específica para proponer colaboración 50/50
- Armar estudios de mercado para sus propios clientes
- Descubrir inventario nuevo antes que otros

Hoy Simón los trata igual que a un comprador: el modal les pide WhatsApp a cambio de "alertas si baja el precio" — **valor nulo para un broker profesional**.

---

## 2. Por qué importa

- **Data sucia:** brokers dejando phone en modal actual inflan métricas de captura (~20-30% target) con gente que nunca va a comprar/alquilar
- **Slack ruidoso:** notifs de "leads con consent" incluyen a brokers que solo exploraban
- **Oportunidad perdida de revenue B2B:** ya existe `/broker` dashboard + login en Simón (gestión de propiedades propias). Hay infra parcial. Lo que falta es **capturar, segmentar y monetizar** el broker que hoy usa gratis.

---

## 3. El bloqueador principal

**Si hoy el broker obtiene gratis el WhatsApp del captador sin identificarse, ¿por qué se identificaría?**

No hay incentivo. Cualquier solución requiere crear **asimetría de valor**: el broker identificado obtiene cosas que el no-identificado NO tiene.

---

## 4. Features candidatas para broker identificado

Ordenadas por (valor percibido ↑ × costo de build ↓):

| Feature | Costo build | Valor para broker | Notas |
|---|---|---|---|
| **Contexto del captador/propiedad**: exclusividad, días en mercado, historial de precio, flexibilidad para colaborar | Bajo (data ya existe en BD) | Alto | Comprador no necesita esto; broker SÍ define estrategia |
| **Leads inversos**: si un comprador deja phone en una prop que el broker gestiona → notificación exclusiva | Bajo (dashboard broker existe) | Muy alto | Conversión directa Simon → venta del broker |
| **Template mensaje broker-a-broker** profesional pre-armado | Bajo | Medio | Mejora percepción profesional al contactar captador |
| **Split de comisión formalizado**: Simón documenta vía colaborativa → evidencia en disputa | Medio | Alto | Protección real contra "me robaste el cliente" |
| **Alertas de inventario nuevo** 24-48h antes del feed público | Medio | Alto | Ventaja competitiva real y medible |
| **Badge "Verificado"** en listings propios | Bajo | Medio | Confianza para el comprador final |
| **Comparativo PDF profesional** exportable con branding propio | Medio | Medio | Herramienta de venta del broker con su cliente |
| **Red "brokers verificados Equipetrol"**: directorio interno con zonas/especialidad | Alto | Alto | Networking, red de colaboración |

---

## 5. Opciones de diseño discutidas

### A) Pregunta dentro del modal actual
Agregar checkbox "Soy broker" en el modal de captura actual.
- **Pro:** data limpia, segmentación automática
- **Con:** suma fricción al funnel comprador (target principal de Fase 1)
- **Veredicto:** descartar — no ensuciar el flujo consumer

### B) Link sutil al final del modal actual
"¿Sos broker? Accedé a contexto profesional →"
- Abre modal alternativo o navega a `/para-brokers`
- **Pro:** cero fricción comprador, canaliza brokers auto-identificados
- **Con:** solo capta al broker que YA busca identificarse
- **Veredicto:** buena opción post-validación Fase 2

### C) Landing dedicada `/para-brokers` + link en navbar
Página propia con features, pricing, formulario.
- **Pro:** escalable, SEO, compartible
- **Con:** descubrimiento lento, no aprovecha momento del click WA
- **Veredicto:** etapa 2, después de validar demanda

### D) Post-submit en pantalla de success
En los 1.5s de "Listo, te avisamos" mostrar "¿Sos broker? →"
- **Pro:** aprovecha engagement post-captura
- **Con:** ruido si el que capturó era broker real (1.5s es poco)
- **Veredicto:** secundaria, combinable con B

### E) Flujo bifurcado desde el click
`¿Sos comprador o broker?` como primera pregunta del modal.
- **Pro:** segmentación 100% limpia, modal broker totalmente diferente
- **Con:** fricción severa al comprador, sesgo (brokers pueden mentir)
- **Veredicto:** descartar

**Dirección recomendada:** **B + C** combinadas. B aprovecha el momento del click, C es la landing destino.

---

## 6. Validación lean propuesta (antes de construir features)

**No construir el programa broker antes de validar demanda.** El riesgo: build complejo (contexto captador, split formalizado, red) y nadie se inscribe.

**Fase 1 validación (1-2 semanas):**
1. Landing estática `/para-brokers` con promesa de valor (las 4-5 features del top de la tabla)
2. Formulario: nombre, licencia, zona de especialidad, WhatsApp, "¿qué propiedad gestiono?"
3. Submit → Slack a Lucho (canal `#leads-brokers`)
4. Lucho contacta manual 1-a-1 para validar interés real
5. **Métrica de decisión:** ≥10 brokers registrados en 2 semanas sin hacer promoción activa

**Fase 2 (si pasa):**
- Construir las 2 features top: **Contexto del captador** + **Leads inversos** (bajo costo, alto valor percibido)
- Precio inicial: USD 20-30/mes (validar willingness to pay con los registrados)

**Fase 3 (si pasa):**
- Agregar features medianas: alertas premium, templates, split formalizado
- Subir precio: USD 50-80/mes

**Fase 4 (maduro):**
- Red de colaboración, PDF profesional, API, etc.
- Precio premium: USD 100+/mes

---

## 7. Riesgos identificados

1. **Brokers resisten pagar por info que hoy ven gratis** → mitigar con features NUEVAS (leads inversos, split) no reempaquetado
2. **Canibalizamos el lado comprador** (si brokers empiezan a usar más, compradores reales se diluyen) → trackear tasa de conversión lead→contacto real por tipo de usuario
3. **Problema legal**: "formalizar split de comisión" puede requerir disclaimer legal, acuerdo escrito. Verificar con asesor antes de prometer.
4. **Conflicto con brokers existentes en Simón**: si ya hay brokers con dashboard, ofrecerles primero que a brokers nuevos (loyalty)
5. **Dependencia de Fase 2 del modal**: sin tráfico comprador saludable, no hay mercado donde los brokers quieran estar

---

## 8. Preguntas abiertas para discutir después

- ¿El programa broker es **subscription mensual** o **pay-per-lead** (comisión por deal cerrado)?
- ¿Verificación de licencia es requisito duro o opt-in?
- ¿Simon se queda con % de comisiones en deals cerrados vía plataforma, o solo cobra subscripción?
- ¿Ofrecer a brokers captadores (los que ponen listings) distinto que a brokers buscadores (los que contactan)?
- ¿Cruzar con la BD de brokers ya existente (`/broker`) o crear tier separado?
- ¿Qué hacer con brokers que HOY ya tienen cuenta en `/broker` pero solo gestionan sus propiedades — upgrade a plan pago?

---

## 9. No hacer antes de

- ❌ Construir features broker sin validar demanda con landing + formulario
- ❌ Cambiar el modal actual (Fase 1) antes de 3-4 días de data
- ❌ Prometer split formalizado de comisión sin revisión legal
- ❌ Cobrar antes de tener ≥5 features de valor real
- ❌ Pitchear a brokers existentes antes de definir pricing + features

---

## 10. Siguiente paso concreto (cuando se retome)

1. Leer este doc completo
2. Definir: ¿subscription o pay-per-lead? (decisión clave de modelo)
3. Diseñar landing `/para-brokers` con 4-5 features top y formulario captura
4. Deploy + promoción orgánica a 2-3 brokers ya conocidos para feedback
5. Si hay señal positiva → building plan con 2-3 features MVP
