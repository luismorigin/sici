# BSUID — Meta está sacando el teléfono del payload de WhatsApp

**En una línea:** quien adopta un *username* de WhatsApp (`@nombre`) obtiene privacidad de
número. `wa_id` y `from` **desaparecen del payload** — no llegan vacíos ni en `null`: no
están. En su lugar viaja el **BSUID**, `BO.2453994595121663`.

El CRM (`/admin/contactos`) usaba el teléfono como **identidad**, así que perdía esos
contactos **sin error, sin log y sin forma de recuperarlos**: Meta no reenvía los webhooks
que no procesás. Y el bot igual le armaba la shortlist a esa persona (para eso usa el
teléfono que **escribe en el chat**, no el del remitente) → shortlists huérfanas.

Briefing completo: `lab-kapso/BRIEFING_SICI_BSUID.md` · decisión **D31** de lab-kapso.

---

## Qué hay acá

| Script | Qué hace | Escribe |
|---|---|---|
| `backfill-retroactivo.mjs` | Reconstruye el mapeo teléfono ↔ BSUID de los contactos **que ya existen**, leyendo la API de Kapso | ❌ genera un `.sql` para aplicar a mano |
| `test-bsuid.mjs` | Reproduce el escenario que rompe: payload real **sin** `wa_id` ni `from` | ❌ (salvo `--e2e`) |

```bash
node scripts/kapso-bsuid/test-bsuid.mjs              # unitario, $0, sin red ni BD
node scripts/kapso-bsuid/test-bsuid.mjs --e2e        # + POST firmado al webhook local
node scripts/kapso-bsuid/backfill-retroactivo.mjs    # genera output/backfill-bsuid-<fecha>.sql
```

`output/` está gitignoreado: el SQL lleva teléfonos.

---

## El orden importa

1. **Aplicar la mig 318** (aditiva, no cambia comportamiento).
2. **Correr el backfill retroactivo** y aplicar su SQL. Cuanto antes: mientras Meta mande
   los dos identificadores el mapeo es gratis; cuando alguien adopte username, para esa
   persona ya no se puede construir.
3. Verificar el termómetro: `SELECT * FROM public.v_bsuid_cobertura;`
4. **Aplicar la mig 319** — recién cuando pasen sus 5 chequeos de entrada (están en el
   encabezado del archivo).

El código tolera que las migraciones no estén aplicadas todavía: guarda lo de siempre y
avisa por log. No devuelve 500 — un 500 haría que Kapso reintente 3 veces y abandone, o
sea perder mensajes por el mismo agujero que se está tapando.

---

## Tres cosas que se descubrieron mirando los datos, no la documentación

**1. El BSUID CAMBIA.** El número del founder tiene **tres**:

```
hasta 22-may    BO.1023162320171284   (phone_number_id 597907523413541)
23-may→24-jul   BO.2453994595121663   (phone_number_id 998245303375051)
desde 28-jul    BO.1490485676452856   (mismo número, otro BSUID)
```

El 28-jul es el día de la **reconexión de coexistencia** del incidente D30: al reconectar
la WABA cambiaron todos. Por eso los viejos se guardan como alias en
`simon_contacto_bsuids` — si mañana llega un evento con uno anterior, la persona se
reconoce en vez de duplicarse.

**2. No está confirmado que el BSUID llegue por el webhook.** Verificado el 11-ago-2026: la
**API** de Kapso sí lo expone (`conversation.business_scoped_user_id`), pero el ejemplo
oficial del payload v2 de **webhook** no lo lista — y SICI solo ve el webhook. Por eso el
ingest lo busca en todas las posiciones plausibles, deja un log cuando no viene, y existe
`v_bsuid_cobertura`: si entran mensajes y `con_bsuid` no sube, no está llegando por ahí y
hay que traerlo de la API. **Se confirma en 2 minutos** abriendo una entrega en el panel de
Kapso (Webhooks → deliveries → ver payload).

**3. El BSUID no es único global.** Está scopeado al **portfolio comercial** — hoy uno solo
(`2073772363472695`, portfolio "Simón"). No viene en el payload: lo pone el webhook desde
`META_PORTFOLIO_ID`. Si algún día se consolida la WABA en *Casapatiobolivia*, los BSUID de
los mismos clientes cambian; guardar el portfolio ahora evita mezclar historiales.

---

## Lo que sigue abierto

- **Las shortlists no cruzan sin teléfono.** `broker_shortlists.cliente_telefono` es la
  única llave que hay, y la persona sin número no matchea. La pantalla lo **declara** en vez
  de mostrar cero. Se cierra cuando la shortlist guarde el `contacto_id` (capa 3 de
  `docs/backlog/CRM_CLIENTES_B2C_PLAN.md`).
- **La forma del aviso `user_id_update` no está verificada** — todavía no llegó ninguno. Se
  detecta por la forma (hay un identificador "anterior" y uno "nuevo") y lo que no se
  reconoce queda crudo en `simon_eventos_sin_procesar`, con el payload adentro para
  ajustarlo cuando llegue el primero.
- **Pedir el teléfono cuando haga falta.** Meta tiene un botón `REQUEST_CONTACT_INFO`. Ojo
  con `origin`: `contact_request` = lo compartió por tu botón; `other` = mandó una tarjeta
  de contacto a mano, **que puede ser de otra persona** — no prueba identidad.
