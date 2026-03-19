# Auditoría UX/UI — /alquileres

> **Fecha:** 19 Mar 2026
> **Puntaje general:** 6.2/10 (UX 7.5, CRO 6, Psicología 5)
> **Estado:** Pendiente de implementación

---

## Mejoras por impacto (Top 5)

### 1. Días publicado + velocidad de zona
**Impacto:** ALTO | **Costo:** BAJO (dato existe en `dias_en_mercado`)
Debajo del precio: "Publicado hace 3 días · Los deptos en Eq. Centro se alquilan en ~34 días".
Activa aversión a la pérdida + urgencia con datos reales.
**Estado:** Pendiente

### 2. Social proof: consultas/vistas
**Impacto:** ALTO | **Costo:** MEDIO (necesita tracking de vistas)
Badge "Visto por 12 personas" o proxy "Publicado recientemente" con ícono de fuego para primeros 7 días.
**Estado:** Pendiente

### 3. Precio anclado al promedio de zona
**Impacto:** ALTO | **Costo:** BAJO (promedios en `v_metricas_mercado`)
"Bs 5.480/mes — 12% bajo el promedio de Eq. Norte (Bs 6.200)".
**Estado:** Pendiente

### 4. Empty state inteligente
**Impacto:** MEDIO | **Costo:** BAJO
En vez de "No se encontraron", sugerir: "Hay 8 deptos si subís el presupuesto a Bs 6.000" o "Probá sin filtro de mascotas".
**Estado:** Pendiente

### 5. WhatsApp contextualizado
**Impacto:** MEDIO | **Costo:** BAJO
Cambiar "Consultar por WhatsApp" → "Preguntar si está disponible". Mensaje pre-armado con pregunta de disponibilidad como primera línea.
**Estado:** Pendiente

---

## Insights ocultos

### I1. "Ver ↗" es un leak de conversión
Cada click saca al usuario de Simón y lo manda al portal donde puede contactar al broker sin tracking. En ventas ya hay gate — en alquileres no.
**Acción:** Implementar gate similar al de ventas.
**Estado:** Pendiente

### I2. Pips del counter mienten (12 pips, 148 props)
El usuario piensa que vio todo cuando vio 3%. Cambiar a counter numérico como en ventas (`3 / 148`).
**Estado:** Pendiente

### I3. No hay diferenciación nuevo vs viejo
Propiedad de 2 días y de 140 días se ven igual. Badge "Nuevo" para primeros 7 días.
**Estado:** Pendiente

### I4. Filtros invisibles en mobile
El usuario no sabe que los filtros existen hasta card 3. Hint en top bar o primera card.
**Estado:** Pendiente

### I5. No hay retención
No hay notificaciones, email de favoritos, ni PWA. Cada visita es sin memoria (localStorage no cruza dispositivos).
**Estado:** Pendiente (largo plazo)

---

## Debilidades UX identificadas

### D1. Sin onboarding
El usuario aterriza en 148 propiedades sin contexto. No sabe qué es Simón ni por qué confiar.
**Estado:** Pendiente

### D2. Sin señales de confianza
Cero "verificado", "actualizado hace X horas", reviews del broker.
**Estado:** Pendiente

### D3. Desktop sidebar desperdicia espacio
320px para 5 filtros. Espacio muerto debajo de "Ordenar por" es oportunidad perdida.
**Estado:** Pendiente

### D4. Badges informativos pero no emocionales
"Mascotas" y "1 parqueo" son datos fríos. Falta conexión emocional.
**Estado:** Pendiente (bajo prioridad)

### D5. WhatsApp requiere scroll en mobile
CTA principal puede quedar parcialmente oculto si hay muchos badges.
**Estado:** Pendiente

### D6. "Ver detalles" compite con WhatsApp
Dos CTAs al mismo nivel visual. El usuario no sabe cuál priorizar.
**Estado:** Pendiente

---

## Aplicabilidad a /ventas

Muchas de estas mejoras aplican también a `/ventas`:
- Días publicado + velocidad zona → aplica
- Precio anclado al promedio → aplica (ya tenemos $/m² por zona)
- Empty state inteligente → aplica
- Badge "Nuevo" → aplica
- Gate en "Ver original" → YA IMPLEMENTADO en ventas
- Counter numérico → YA IMPLEMENTADO en ventas

---

## Changelog

| Fecha | Cambio |
|---|---|
| 19 Mar 2026 | Auditoría inicial — 5 mejoras top + 5 insights + 6 debilidades |
