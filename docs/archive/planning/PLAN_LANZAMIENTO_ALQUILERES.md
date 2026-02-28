# Plan de Lanzamiento — Simon Alquileres

**Fecha:** 20 Feb 2026
**URL:** simonbo.com/alquileres
**Estado:** Pre-lanzamiento

---

## Contexto del Mercado

Santa Cruz es un mercado pequeno donde el boca a boca domina. No necesitamos un lanzamiento masivo — necesitamos **penetracion quirurgica** en los circulos correctos.

### Audiencia inmediata
- Jovenes profesionales (25-35) buscando depto en Equipetrol
- Expats/recien llegados a Santa Cruz
- Universitarios de gama alta (padres que buscan)
- Gente que ya esta scrolleando grupos de Facebook/WhatsApp buscando alquiler

### Ventaja competitiva
- Feed visual TikTok-style (nadie en Bolivia tiene esto para inmobiliario)
- Comparativo inteligente (3 favoritos lado a lado)
- Preguntas pre-armadas para WhatsApp (reduce friccion)
- 163+ propiedades reales, actualizadas, sin duplicados
- Filtros por microzona, presupuesto, dormitorios, amoblado, mascotas

---

## Framework ORB (Owned / Rented / Borrowed)

### OWNED (lo que controlamos)
- `simonbo.com/alquileres` — la plataforma
- WhatsApp Business de Simon
- Instagram @simonbo

### RENTED (plataformas de terceros)
- **Grupos de Facebook** de alquileres en Santa Cruz (canal principal en Bolivia)
- **Instagram** — reels cortos mostrando el feed
- **TikTok** — match natural con la UX de scroll vertical

### BORROWED (audiencias prestadas)
- Brokers que ya estan en la plataforma (sus propiedades generan leads)
- Grupos de WhatsApp de expatriados/recien llegados
- Inmobiliarias C21 y Remax (se benefician de mas leads)

---

## Fase 1: Soft Launch — Semana 1

**Objetivo:** Validar con usuarios reales, generar primeros leads.

### Acciones

1. **WhatsApp personal** — Mandar el link a 10-15 personas que buscan alquiler o conocen a alguien:
   > "Hice algo para buscar alquiler en Equipetrol sin tener que scrollear 500 posts en Facebook. Probalo y decime que te parece: simonbo.com/alquileres"

2. **3-5 grupos de WhatsApp** de confianza — no spam, valor:
   > "Para los que buscan alquiler en Equipetrol, arme un feed con 160+ deptos verificados con filtros y comparador. Gratis: simonbo.com/alquileres"

3. **Medir:** Verificar que `leads_alquiler` registra clicks. Meta: **10+ leads en la primera semana**.

---

## Fase 2: Social Proof — Semanas 2-3

**Objetivo:** Crear contenido que demuestre valor y genere compartidos organicos.

### Acciones

4. **Screen recording del feed** (15-30 seg) — Grabar scrolleando en celular: swipe fotos, filtros, comparativo. Subir como:
   - Reel de Instagram
   - TikTok
   - Story de WhatsApp
   - Post en grupos de Facebook

   **Copy:**
   > "Buscar alquiler en Equipetrol ya no es un trabajo de tiempo completo.
   > 160+ departamentos. Filtros inteligentes. Comparador.
   > simonbo.com/alquileres — gratis"

5. **"Dato de la semana" posts** — Insights reales de los datos:
   > "El alquiler promedio de 2 dormitorios amoblado en Equipetrol Centro es Bs 4,200/mes. Estas pagando de mas?"
   > — Simon, Inteligencia Inmobiliaria

6. **Grupos de Facebook de alquileres SCZ** — 1 vez por semana maximo:
   > "Si estas buscando alquiler en la zona Equipetrol, armamos una herramienta gratuita con 160+ opciones verificadas y filtros por zona, presupuesto, amoblado y mascotas. No es inmobiliaria, no vendemos nada. simonbo.com/alquileres"

7. **Notificar a los brokers** — Son aliados, no competencia:
   > "Hola [nombre], tus propiedades ya aparecen en nuestra plataforma de alquileres Simon. Los interesados te contactan directo por WhatsApp. Mira como se ve: simonbo.com/alquileres — es gratis para vos y para el inquilino."

   Esto genera que **ellos mismos compartan la plataforma** con sus clientes.

---

## Fase 3: Amplificacion — Semanas 4-6

**Objetivo:** Escalar con contenido recurrente y partnerships.

### Acciones

8. **Serie de contenido Instagram/TikTok** — Posts semanales con datos reales:
   - "Top 5 zonas mas baratas para alquilar en Equipetrol"
   - "Amoblado vs sin amueblar: cuanto mas pagas?"
   - "Aceptan mascotas? Solo el X% de los deptos en Equipetrol"
   - "Cuanto cuesta realmente alquilar: renta + expensas + deposito"

9. **Alianza con grupos de expats** — Santa Cruz tiene comunidades de brasilenos, argentinos, europeos. Contactar admins de grupos de WhatsApp/Facebook de expatriados.

10. **Instagram Ads micro** (opcional, $5-10/dia):
    - Audiencia: 25-35 anos, Santa Cruz, intereses inmobiliarios
    - Creative: Screen recording del feed con texto overlay
    - CTA: "Encontra tu alquiler" -> simonbo.com/alquileres

---

## Ideas Creativas de Alto Impacto

### A) "La prueba de los 30 segundos"
Video corto: "Encontra tu proximo alquiler en Equipetrol en 30 segundos" — cronometro visible, alguien usando la app en tiempo real, filtra por 2 dorms + amoblado + mascotas, scrollea, compara 3, manda WhatsApp. Poderoso para TikTok/Reels.

### B) "Antes vs Despues"
Split screen: izquierda = scrolleando posts interminables en Facebook con precios borrosos y fotos repetidas. Derecha = el feed de Simon, limpio, filtrado, comparador. El contraste vende solo.

### C) "El comparativo que tu broker no te da"
Mostrar el CompareSheet con 3 propiedades reales. "Sabias que el departamento A cuesta Bs 12/m2 menos que el B, pero incluye expensas?" — Posiciona a Simon como asesor inteligente.

### D) "Preguntale lo que importa"
Mostrar las preguntas pre-armadas del comparativo. "Antes de visitar, pregunta: condiciones de ingreso, comision del broker, devolucion de garantia. Simon te arma el mensaje." — Empodera al inquilino.

---

## Metricas de Exito

| Semana | Metrica | Objetivo |
|--------|---------|----------|
| 1 | Leads en `leads_alquiler` | 10+ |
| 2 | Leads acumulados | 30+ |
| 3 | Leads/semana estables | 15+/semana |
| 4 | Leads acumulados | 80+ |
| 6 | Leads mensuales | 100+/mes |

### Query de monitoreo
```sql
SELECT DATE(created_at) as dia, COUNT(*) as leads,
       COUNT(DISTINCT broker_telefono) as brokers_contactados
FROM leads_alquiler
GROUP BY 1 ORDER BY 1;
```

---

## Lo que NO Hacer

- **No lanzar en Product Hunt** — el mercado es local, no global
- **No gastar en ads antes de validar organico** — primero probar que el boca a boca funciona
- **No spamear grupos** — 1 post por grupo por semana maximo, siempre con valor
- **No esperar a que sea perfecto** — ya esta listo, lanzar ahora

---

## Relacion con Monetizacion

Este plan de lanzamiento alimenta directamente la Fase 1 del plan de monetizacion (`docs/planning/PLAN_MONETIZACION_ALQUILERES.md`):
- Mas usuarios -> mas clicks WhatsApp -> mas leads registrados
- Mas leads -> mas valor demostrable al broker
- Mas valor -> justificacion para cobrar (Fase 2+)

---

**Documento creado:** 20 Feb 2026
**Version:** 1.0
