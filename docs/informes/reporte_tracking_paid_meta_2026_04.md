# Reporte tecnico: Tracking WhatsApp — Campana Paid Meta Alquileres

**Periodo:** 1 abril 20:15 BOT — 2 abril 8:44 BOT (~12.5 horas)

## Resumen ejecutivo

La campana genero **4 leads reales de WhatsApp** en sus primeras 12.5 horas. GA4 y nuestra BD mostraban ~31-35 eventos, pero detectamos que la mayoria eran falsos, generados por los bots de revision de Meta antes de aprobar el anuncio. Ya se corrigio el tracking y se limpiaron los datos.

## Leads reales de la campana

- **Lead 1** — 1 abr 20:28 BOT — Stanza (Eq. Centro) — Bs 2,900/mes
- **Lead 2** — 1 abr 23:16 BOT — Barcelona (Sin zona) — Bs 4,000/mes
- **Lead 3** — 2 abr 00:50 BOT — Golden Tower (Eq. Norte) — Bs 6,000/mes
- **Lead 4** — 2 abr 06:22 BOT — Garden Equipetrol (V. Brigida) — Bs 603/mes*

*Precio posiblemente mal cargado en la propiedad.

## Que paso con los ~31 eventos de GA4

Antes de que el ad saliera al aire (20:15 BOT), Meta envio sus bots de revision a la landing (~17:15 BOT) para verificar que cumple politicas. Nuestro boton de WhatsApp usaba un link directo (GET) que esos bots "clickearon" automaticamente al escanear la pagina, registrando 35 leads falsos de 9 instancias distintas del crawler.

La evidencia fue clara: 5 "clicks" en 0.4 segundos desde una misma sesion. Imposible para un humano, consistente con un bot automatizado.

## Que se hizo

- Se identificaron y eliminaron los 35 registros falsos de la BD
- Se cambio el tracking de WhatsApp de GET (vulnerable a bots/crawlers) a POST (solo se dispara con click real del usuario)
- Pendiente deploy a produccion

## Para el seguimiento

- **GA4 del 1 de abril**: los ~31 click_whatsapp estan inflados. Los reales son ~4 (los posteriores a 20:15 BOT)
- **Del 2 de abril en adelante** (post-deploy): los numeros son confiables 1:1, cada evento = un usuario real que toco WhatsApp
- Cualquier discrepancia entre GA4 y BD ya no deberia ocurrir
