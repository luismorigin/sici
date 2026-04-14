# Informe Semanal — simonbo.com
## 19–25 marzo 2026

**Fuentes:** Google Analytics 4 (G-Q8CRRJD6SL), BD leads_alquiler (Supabase)
**Propiedad:** Landing Premium Simon

---

## 1. Resumen ejecutivo

La plataforma mostró crecimiento significativo en engagement (+219% eventos) con 20 usuarios activos (+54% vs semana anterior). El canal Organic Social apareció por primera vez trayendo 9 usuarios nuevos. Sin embargo, la conversión a contacto WhatsApp sigue siendo el punto débil: solo 2 leads reales en la semana.

---

## 2. Métricas clave (7 días)

| Métrica | Valor | vs semana anterior |
|---------|-------|--------------------|
| Usuarios activos | 20 | +53.8% |
| Eventos totales | 1,600 | +218.6% |
| Eventos por usuario | 79 | +107.1% |
| Propiedades vistas (view_property) | 425 | +329.3% |
| Sesiones alquiler | 211 | +131.9% |
| Page views | 191 | +154.7% |
| Bounces sin acción | 63 | +12.5% |
| Leads WhatsApp (BD) | 2 | — |

---

## 3. Audiencia

### Por país (28 días)

| País | Usuarios activos |
|------|------------------|
| Bolivia | 71 |
| Estados Unidos | 14 |
| Brasil | 3 |
| Singapur | 3 |
| Alemania | 2 |
| Chile | 1 |
| Reino Unido | 1 |

### Por ciudad (28 días)

| Ciudad | Usuarios activos |
|--------|------------------|
| **Santa Cruz de la Sierra** | **58** |
| La Paz | 15 |
| Cochabamba | 10 |
| Singapur | 3 |
| Altoona (US) | 2 |
| Boardman (US) | 2 |
| Guarulhos (BR) | 2 |

**Lectura:** 83 de 100 usuarios son de Bolivia. Santa Cruz concentra el 58% — el mercado objetivo. La Paz y Cochabamba pueden ser bolivianos evaluando mudarse a SCZ o inversión. Los usuarios internacionales (US, Singapore, etc.) probablemente son bolivianos en el exterior o bots/crawlers.

### Idioma

| Idioma | Usuarios |
|--------|----------|
| Spanish | ~75 |
| English | ~20 |

---

## 4. Páginas más visitadas (28 días)

| Página | Vistas | Usuarios | Eventos | Rebote |
|--------|--------|----------|---------|--------|
| **/alquileres** | **227** | **75** | **4,900** | 39.8% |
| Landing (/) | 116 | 26 | 291 | 44.1% |
| /ventas | 43 | 5 | 131 | 35.3% |
| Condado VI | 16 | 6 | 50 | 21.4% |
| Filtros premium | 15 | 7 | 47 | 0.0% |
| Mercado ventas | 13 | 3 | 20 | 0.0% |
| Mercado alquileres | 11 | 2 | 23 | 0.0% |

**Lectura:**
- **Alquileres es la página dominante** — 3x más usuarios que la landing, y genera 17x más eventos. Los usuarios que llegan a alquileres interactúan intensamente (4,900 eventos / 75 usuarios = 65 eventos por usuario).
- La landing tiene el rebote más alto (44.1%) — muchos llegan y se van.
- Condado VI tiene el mejor rebote (21.4%) — los que llegan están interesados.
- Mercado y Filtros tienen 0% rebote — son páginas de consulta activa.

---

## 5. Adquisición de tráfico

### Sesiones por canal (7 días)

| Canal | Tendencia vs anterior |
|-------|----------------------|
| Direct | +5.2% (mayoría) |
| Organic Social | Nuevo (no existía) |

### Usuarios nuevos por canal (7 días)

| Canal | Esta semana | Semana anterior |
|-------|-------------|-----------------|
| Direct | 6 | 8 |
| **Organic Social** | **9** | **0** |

**Lectura:**
- **Organic Social apareció esta semana por primera vez**, trayendo 9 usuarios nuevos (60% de los nuevos). Algo se compartió en redes que generó tracción.
- **Direct sigue siendo ~90% del tráfico.** Sin UTMs en los links compartidos, no podemos distinguir entre: tráfico directo real (escriben la URL), links de WhatsApp (no mandan referrer), links de Instagram/Facebook (el webview no manda referrer), y bookmarks.
- **No hay tráfico orgánico de Google (SEO)** — las páginas /mercado existen pero aún no posicionan.

---

## 6. Engagement detallado

### Eventos custom (7 días)

| Evento | Count | Significado |
|--------|-------|-------------|
| view_property | 425 | Propiedades vistas en feed |
| session_alquiler | 211 | Sesiones en /alquileres |
| page_enter_alquiler | 182 | Entradas a /alquileres |
| scroll | 113 | Scrolls (engagement) |
| bounce_no_action | 63 | Entran y se van sin hacer nada |

### Métricas de engagement (28 días)

| Métrica | Valor |
|---------|-------|
| Tiempo de interacción medio | 3 min 45s |
| Sesiones con engagement | 1.5 por usuario |
| UAD/UAM (diarios/mensuales) | 5.4% |
| UAS/UAM (semanales/mensuales) | 30.0% |
| UAS/UAM (semanales/mensuales) | 18.0% |

**Lectura:**
- 3:45 de interacción media es alto para un sitio inmobiliario — la gente explora.
- El pico de engagement fue alrededor del 22 marzo (~33 min por usuario) — uno o más usuarios exploraron intensamente.
- 425 propiedades vistas entre ~20 usuarios = ~21 propiedades por usuario. Están browseando el inventario completo.
- La ratio entrada (182) vs bounce (63) = **34.6% de bounce** — 2 de cada 3 que entran a alquileres interactúan.

---

## 7. Conversión: Leads WhatsApp

### Leads reales en BD (semana 19–25 mar)

| Fecha | Propiedad | Zona | Precio | Fuente |
|-------|-----------|------|--------|--------|
| 25 mar, 14:49 | CRUZ | Villa Brigida | Bs 3,200/mes | bottom_sheet |
| 25 mar, 18:06 | Maré | Sirari | Bs 5,500/mes | map_card_mobile |

### Contexto histórico (todos los leads desde lanzamiento)

| Periodo | Leads |
|---------|-------|
| 20 feb – 28 feb | 10 |
| 1 mar – 18 mar | 2 |
| 19 mar – 25 mar | 2 |
| **Total** | **14** |

### Nota sobre el evento `click_whatsapp` en GA4

GA4 muestra 1,700 eventos `click_whatsapp` en 28 días. **Este número es incorrecto.** Se detectó y corrigió un bug el 27 de febrero (commit b069b5f): el evento se disparaba en cada render de React (al construir la URL del botón), no al hacer click. Esto generó ~900+ eventos fantasma en 1-2 días. Los 14 leads en BD son la fuente confiable, ya que el tracking server-side (API /lead-alquiler) nunca tuvo este bug.

### Funnel de conversión

```
Usuarios que entran a /alquileres:  75 (28d)
Usuarios que ven propiedades:        ~20 (estimado de view_property)
Usuarios que hacen click WhatsApp:   ~10 (leads únicos en BD)
Tasa de conversión:                  ~13% (de los que ven props → contactan)
```

---

## 8. Retención

| Métrica | Valor | Benchmark SaaS/Marketplace |
|---------|-------|---------------------------|
| Retención diaria (UAD/UAM) | 5.4% | 10-20% es bueno |
| Retención semanal (UAS/UAM) | 30.0% | 25-40% es bueno |

La retención semanal está en rango saludable. La diaria tiene espacio para crecer — se necesitan razones para volver todos los días (alertas de nuevos deptos, por ejemplo).

---

## 9. Conclusiones

### Lo que funciona
1. **/alquileres es el producto con tracción real** — 75 usuarios, 39.8% rebote, 3:45 de engagement.
2. **Organic Social es un canal nuevo con potencial** — 9 usuarios nuevos de la nada.
3. **Santa Cruz es el mercado correcto** — 58% de usuarios.
4. **Los usuarios exploran intensamente** — 21 propiedades vistas por usuario.

### Lo que no funciona
1. **Conversión a WhatsApp es muy baja** — 2 leads en 7 días con 20 usuarios activos.
2. **Sin visibilidad de canales** — 90% "Direct" porque no usamos UTMs.
3. **Tracking de WhatsApp tenía un bug histórico** — ya corregido, pero los datos de 28d están contaminados.
4. **/ventas tiene 5 usuarios** — mínima tracción comparado con alquileres.

### Acciones sugeridas

| Acción | Impacto | Esfuerzo |
|--------|---------|----------|
| Agregar UTMs a todos los links compartidos en redes/WhatsApp | Alto — visibilidad real de canales | Bajo |
| Investigar qué post generó el tráfico Organic Social | Alto — replicar lo que funcionó | Bajo |
| Optimizar CTA de WhatsApp en /alquileres | Alto — mejorar conversión | Medio |
| Implementar alertas de nuevos deptos (email/WA) | Alto — mejorar retención diaria | Alto |
| Agregar tracking WhatsApp a /ventas | Medio — cerrar punto ciego | Bajo |

---

*Generado el 26 marzo 2026. Datos de GA4 property 523288591 + BD leads_alquiler.*
