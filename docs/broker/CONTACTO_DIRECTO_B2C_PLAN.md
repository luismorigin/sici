# Plan — Contacto directo al captador en shortlists B2C (canal bot Simón)

**Estado:** plan aprobado en diseño (revisado por reviewer adversarial), sin implementar.
**Fecha:** 2026-06-03.
**Alcance de riesgo:** toca código compartido entre el feed `/ventas`–`/alquileres` y el
shortlist público `/b/[hash]`. Garantía de no-regresión en §5. Revisión en §12.

---

## 1. Objetivo

En las shortlists generadas por el **bot de WhatsApp de Simón** (broker `simon-asistente`),
los botones de contacto por propiedad deben abrir el WhatsApp del **captador de esa
propiedad** (venta → `p.agente_telefono`; alquiler → `p.agente_whatsapp`), tal como ya
ocurre en el feed. Hoy abren el WhatsApp del dueño del shortlist (= el bot), por lo que
todos los leads vuelven a Simón en lugar de ir al captador.

Esto materializa el modelo **B2C de desintermediación**: Simón cura y conecta al usuario
con el captador directo; no se interpone en la transacción.

## 2. No-objetivos (lo que NO se toca)

- **No cambiar el comportamiento de ningún broker real.** El sistema Simón Broker (B2B)
  depende de que el lead vaya **a ese broker**. Aplica **solo** a `simon-asistente`.
- **No tocar la curaduría** (qué propiedades entran al shortlist lo decide el bot vía
  `POST /api/broker/shortlists`). Tampoco el comentario del broker por item ni la destacada.
- **No tocar los gates** (expiración / cap de vistas). Ver §8 (fase 2 aparte).
- **No refactorizar** `publicShareMode` ni el sistema de shortlists. Cambio aditivo mínimo.

## 3. Contexto técnico (verificado en código)

- El bot (`lab-kapso`, broker `simon-asistente`, tel +591 77066308) crea shortlists vía API.
  Se renderizan en `/b/[hash]` reusando el feed en `publicShareMode`, con
  `publicShare.broker = simon-asistente`. Por eso todos los CTA caen en el tel del bot.
- **El comportamiento deseado YA EXISTE**: es el del feed (`!publicShareMode`). Contacto al
  captador, preguntas precargadas, similares, ver-original — todo está construido.
- Campo de contacto por tipo: **venta = `p.agente_telefono`**, **alquiler = `p.agente_whatsapp`**
  (lo que ya usan las ramas feed). El plan reusa esas ramas, así el campo correcto sale solo.
- **Asimetría venta/alquiler del CTA (importante):**
  - **Venta**: el CTA llama `openWhatsApp` directo + `trackEvent('click_whatsapp_venta')`. **Sin modal.**
  - **Alquiler**: el CTA del feed pasa por el hook `useWhatsAppCapture` (`handleWhatsAppLead =
    triggerWhatsAppCapture`) → **modal de captura** (`WhatsAppCaptureModal`) que pide el teléfono
    del cliente si no lo tiene en localStorage, registra lead en `/api/lead-alquiler` y trackea
    (`wa_capture_*` + `click_whatsapp` + Meta Pixel `Lead`). Las ramas shortlist hoy van directas
    (`openWhatsApp`), sin modal. Ver §9.
- `agente_*` viaja hidratado en cuentas no-demo (solo se sanitiza si `isDemo`). `simon-asistente`
  no es demo → el dato está disponible. **No se expone ningún número nuevo**: ya está en el
  payload hoy; solo cambia a dónde apunta el botón.

### El núcleo del problema

`publicShareMode` hoy mezcla **dos ejes** en un solo booleano:

| Eje | Qué controla | Para B2C-Simón |
|-----|--------------|----------------|
| **Layout de shortlist** | sin filtros/sidebar/mapa/spotlight, lista curada, sin fetch, branding, comentario del broker | **conservar** |
| **Modo de contacto** | contacto al broker dueño; oculta preguntas/similares/ver-original | **invertir** (volver al modo feed) |

El cambio = **desacoplar el eje de contacto** del eje de layout, solo para `simon-asistente`.

## 4. Diseño

Flag por broker, default seguro, propagado al render; **un único mecanismo**: pasar un prop
`contactoDirecto: boolean` a cada componente con CTA e invertir sus condiciones de contacto.

1. **`simon_brokers.contacto_directo BOOLEAN NOT NULL DEFAULT false`**. Solo `true` en
   `simon-asistente`. (`ALTER` sobre tabla existente → **no requiere GRANT nuevo**.)
2. Propagación de datos: `Broker` (lib) → `publicShare.broker` → tipos `PublicShareData(Alquiler)`.
3. En la página: `const contactoDirecto = publicShare?.broker?.contacto_directo === true`.
   ⚠️ Leerlo de **`publicShare.broker`**, NO de `publicShareBrokerProp` (que está tipado
   recortado `{nombre, telefono, foto_url, slug}` y no llevará el campo).
4. Pasar `contactoDirecto` como prop a cada componente con CTA y cambiar sus condiciones (§6).

### Mecanismo ÚNICO (decisión de revisión)

Se descarta el atajo de "pasar `publicShareBroker = null`" para forzar modo feed, porque:
- en las **cards** dejaría ambas ramas en false → card **sin botón**;
- en los **sheets / MapFloatCard** el `publicShareMode` se deriva de `publicShareBroker`, así
  que null **rompería** también el header oscuro y el **comentario del broker** (que queremos
  conservar, §2);
- en `CompareSheet` reactivaría el insight interno `tc_sospechoso` hacia el cliente
  (`CompareSheet.tsx:166`) como efecto colateral no buscado.

Por eso: **un solo patrón** — prop `contactoDirecto` explícito + condiciones invertidas — en
todos los componentes, incluido `CompareSheet`. Más props, pero un único modelo mental y sin
efectos colaterales.

## 5. Garantía de no-regresión (clave)

Toda condición nueva tiene la forma:

```
// contacto/preguntas/similares/ver-original que hoy son  !publicShareMode
!publicShareMode || contactoDirecto

// "contactar al broker dueño" que hoy es  publicShareMode && publicShareBroker
publicShareMode && !contactoDirecto && publicShareBroker
```

Para **todo broker real** `contacto_directo = false`:
- `!publicShareMode || false` ≡ `!publicShareMode`
- `publicShareMode && !false && …` ≡ `publicShareMode && …`

⇒ Comportamiento de los brokers de pago **algebraicamente inalterado**. El riesgo queda
acotado a un único broker (`simon-asistente`).

> ⚠️ **La fórmula es ILUSTRATIVA — cada sitio tiene su guarda real distinta.** No aplicar la
> plantilla mecánicamente. Casos verificados que NO calzan con el template genérico:
> - **DetailSheet alquiler** (`alquileres.tsx:3526/3543/3555`): ternario de **3 ramas**; la rama
>   feed se guarda con **`!brokerMode`** (no `!publicShareMode`). Al invertir, verificar que la
>   rama `brokerMode` (broker logueado) quede intacta.
> - **MapFloatCard** (`alquileres.tsx:2458/2505/2551`): deriva `publicShareMode` **localmente**
>   de `publicShareBroker`; hoy NO recibe `contactoDirecto` → hay que pasárselo como prop nuevo.
>
> El implementador debe leer la condición concreta de cada punto de §7 y preservar las otras ramas.

## 6. Decisiones de producto (tomadas)

| # | Tema | Decisión | Razón |
|---|------|----------|-------|
| 1 | Propiedades similares | **Mostrar** (modo feed) | Claridad; no afecta la curaduría |
| 2 | Header del broker (CTA agregado) | "¿Te muestro otras?" → WhatsApp del bot, estilo secundario. **Fase opcional, no bloqueante** (ver nota) | Es navegación, no contacto transaccional |
| 3 | Ver original + días publicado | **Mostrar** (modo feed) | Claridad |
| 4 | Gates (expiración/cap) | **Fuera de alcance** — fase 2 | No bloquea este cambio; §8 |
| 5 | Insight `tc_sospechoso` en CompareSheet | **Decidir**: con el mecanismo único queda **oculto** (igual que hoy en publicShare). Si se quiere mostrar al cliente B2C por "claridad", es un toggle extra explícito | Evitar exponer señal interna sin querer |

**Nota header (decisión 2):** el objetivo central (contacto por propiedad → captador) NO
depende del header. El header siempre fue "navegación con el broker dueño" y dejarlo como
está (va al bot) es razonable. Tratarlo como **fase 2 opcional** reduce superficie de cambio
y QA. Si se hace: mismo `publicShare.broker.telefono` (= el bot), solo cambian copy, estilo
y mensaje; debe diferenciarse de los CTA verdes por-propiedad. Toca `ventas.tsx:~2510-2534`
y `alquileres.tsx:~1821-1846`.

## 7. Inventario de cambios (completo)

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `sql/migrations/NNN_contacto_directo.sql` | `ADD COLUMN contacto_directo` + `UPDATE … WHERE slug='simon-asistente'`. Aplicar manual (MCP readonly). |
| 2 | `lib/simon-brokers.ts` | `contacto_directo` en `interface Broker` (L18-24) + en el `select(...)` (L46) + en el return de `getBrokerBySlug` (L55-61). |
| 3 | `pages/b/[hash].tsx` | Rama venta (L641) arrastra `broker` solo (si Broker/getBrokerBySlug lo exponen). **Rama alquiler (L553-561)** arma el objeto a mano → agregar campo explícito. |
| 4 | tipos en `ventas.tsx` (L1631) y `alquileres.tsx` (L236) | `contacto_directo?: boolean` en el `broker` de `PublicShareData` / `PublicShareDataAlquiler`. |
| 5 | `ventas.tsx` | Derivar `contactoDirecto` (de `publicShare.broker`). Pasar prop e invertir condiciones en: **VentaCard** (L625/633), **MobileVentaCard** (L823), **BottomSheet** (contacto L1439/1450, preguntas L1357, similares L1333, ver-original L1323/1409). |
| 6 | `components/venta/CompareSheet.tsx` | Recibir prop `contactoDirecto`; invertir condiciones internas (preguntas L383, visita L408, CTA por captador L444, días publicado L352) y el CTA agregado al broker (L422 → `publicShareMode && !contactoDirecto`). |
| 7 | `alquileres.tsx` | Espejo: **card** (L2748/2765), **mobile card** (L2951/2966), **AlquilerDetailSheet** (L3163/3528/3543), **MapFloatCard** (L2452/2458/2507/2508/2553/2554). Campo de contacto = `agente_whatsapp`. Invertir condición para que en publicShare+contactoDirecto los CTA usen `handleWhatsAppLead` (rama feed) en vez de `openWhatsApp(publicShareBroker…)`. |
| 8 | `components/alquiler/CompareSheet.tsx` | Espejo de #6. Las CTA por captador del modo feed usan `agente_whatsapp`. |
| 9 | `hooks/useWhatsAppCapture.tsx` | Agregar flag module-level `_contactoDirecto` + setter `setContactoDirectoForCapture`, análogo a `_brokerMode` (L44-47). En `triggerWhatsAppCapture`: si `_contactoDirecto` → **saltar el modal**, **sobrescribir `fuente`** a `public_share_directo`, trackear y `openWhatsApp` directo al captador. **Setearlo SÍ o SÍ vía `useEffect` con cleanup** (`return () => setContactoDirectoForCapture(false)`, dep `[contactoDirecto]`), copiando el patrón de `_brokerMode` en `alquileres.tsx:384-387`. **NO derivarlo en render** (quedaría pegado entre páginas). Ver §9. |
| 10 | (Fase 2 opcional) header public share | `ventas.tsx:~2510-2534`, `alquileres.tsx:~1821-1846`. Ver §6 nota. |

> `VentaMap.tsx` (mapa de ventas) **no** tiene CTA de contacto (el tap solo abre el sheet) →
> no se toca. El equivalente con CTA en venta es el BottomSheet; en alquiler, MapFloatCard.

## 8. Fuera de alcance — gates (fase 2)

**Verificado por API (2026-06-03)**: todas las shortlists de `simon-asistente` tienen
`max_views: 20` y `expires_at` a **30 días** (heredan el Plan Inicial). Las más viejas
(creadas 24-25 may) vencen ~24-25 jun → en ~3 semanas habrá links que el bot ya mandó
devolviendo "expirado".

Para B2C esto degrada UX (link que "se vence", no se puede compartir con la pareja).

**Decisión (founder, 2026-06-03): expiración larga** (6–12 meses) **+ sin cap de vistas** para
`simon-asistente`, en vez de exención total — evita acumulación eterna y no mata la UX del
cliente que reabre/comparte su link. Sigue siendo **fase 2 separada** (no bloquea el cambio de
contacto). Además: segmentar los paneles de "shortlists activas" para que las del bot no
ensucien las métricas del producto B2B.

**Cómo (verificado):** el `POST /api/broker/shortlists` **NO setea** `max_views`/`expires_at` —
vienen de **DEFAULT de columna** (migración 235: `max_views DEFAULT 20`, `expires_at DEFAULT
NOW()+30d`). La expiración es **lazy en el SSR** (`b/[hash].tsx:398-401`); **no hay cron**. El
demo ya hace override con insert explícito (mig 236). Por eso fase 2 es localizada y simple:
(a) en el POST, pasar `max_views`/`expires_at` explícitos cuando el broker sea `simon-asistente`;
(b) `UPDATE` de backfill de las shortlists del bot ya creadas (el chequeo lazy usa el
`expires_at` persistido, así que no se re-expiran solas); (c) **no tocar** el DEFAULT de los
brokers de pago. Sin trampa de cron.

## 9. Tracking + modal de captura (decisión tomada)

Al reusar las ramas feed, el shortlist del bot emitiría los eventos del feed
(`click_whatsapp_venta` en `ventas.tsx:638/1476`; y en alquiler el modal de captura que
**inserta en `leads_*`**). Dos problemas: (a) **contamina métricas** del feed orgánico y la
tabla de leads; (b) en **alquiler**, reusar la rama feed dispararía el **modal de captura**
pidiéndole el teléfono al cliente que **ya se lo dio al bot** (lab-kapso D28) → fricción
redundante que contradice "directo al captador".

**Decisión:**
1. **Sin modal en el shortlist B2C.** En alquiler, el contacto va **directo** al captador (como
   hoy el publicShare), no se reabre el modal de captura. Mecanismo: flag `_contactoDirecto` en
   `useWhatsAppCapture` (§7 fila 9) — mismo patrón que el escape `_brokerMode` que ya salta el
   modal. Venta no tiene modal, así que no aplica.
2. **Tracking segmentado — mecanismo por sitio (verificado, no uniforme):**
   - **Venta BottomSheet** (`ventas.tsx:1476`) hoy hardcodea `source:'detail_sheet'` → pasar
     condicional `contactoDirecto ? 'public_share_directo' : 'detail_sheet'`.
   - **Alquiler** (BottomSheet/MapFloatCard): los call-sites pasan `fuente` fija
     (`'bottom_sheet'`, `'map_card'`); el branch `_contactoDirecto` del hook **sobrescribe** ese
     `fuente` a `public_share_directo`. **NO inserta lead en `leads_alquiler`** (el bot ya tiene
     los datos del cliente); solo trackea el click.
   - **CompareSheet** (venta `CompareSheet.tsx:464`, alquiler equivalente): los CTA por captador
     llaman `openWhatsApp` **sin `trackEvent` hoy** → gap conocido. v1: aceptar el gap o agregar
     un `trackEvent` mínimo con el source segmentado. Decidir al implementar.

   Copys: al caer en la rama feed se reusan **sin tocar** — cards usan `buildAgentWaMessage`
   (`ventas.tsx:1594`), BottomSheet el closure `buildSheetMsg` (L1451), CompareSheet
   `buildWaMessage` (L452), alquiler `buildAlquilerWaMessage`. El copy "vi … en Simon" es
   apropiado para el cliente del bot.

**Similares:** las "propiedades similares" del sheet no tienen CTA propio — al tap hacen *swap*
de la propiedad activa, y el contacto sale por el CTA del sheet ya swappeado (hereda el `source`
segmentado). Nota: una similar puede ser una propiedad **fuera de la curaduría** (viene del
mercado) → el cliente podría contactar captadores de props no curadas. Aceptable (claridad),
pero a tener presente. Verificar en implementación que en alquiler la similar hace swap y no
contacto directo.

## 10. Edge cases / riesgos menores

- **`agente_*` null** en una propiedad curada: replicar el feed — gatear el CTA con el
  teléfono (ya lo hacen las ramas feed: `ventas.tsx:633/1450`, alquiler `agente_whatsapp ?`)
  y caer a "Ver anuncio" en CompareSheet (L470). No inventar fallback al bot.
- **Demo ortogonal (confirmado):** `isDemo` se deriva del hash; `contacto_directo` del broker.
  El broker demo (`DEMO_BROKER_SLUG`) ≠ `simon-asistente`, su flag queda false. Aun si se
  activara, la sanitización (`demo-mode.ts`) reemplaza `agente_*` por número fake **antes** de
  hidratar y el intercept global (`b/[hash].tsx:172`) captura todos los `wa.me`. No expone nada.
  **Invariante a mantener:** el intercept demo asume que en publicShare no hay `wa.me` de captador
  reales. `contacto_directo` SÍ renderiza esos `wa.me`, pero el invariante se preserva mientras
  **demo ⇒ flag false**. Nunca activar `contacto_directo` en un broker demo.
- **Hearts en B2C (sin cambios):** la persistencia de favoritos en BD (`toggleFavorite`
  `ventas.tsx:~1937`) es `publicShareMode && hash`, ortogonal a `contacto_directo`. El cambio de
  contacto no toca `toggleFavorite`. Sin efecto adverso.
- **Consumidores de `Broker`/`getBrokerBySlug` (sin cambios):** `broker/[slug]*`,
  `api/broker/property-reports` leen solo `nombre/telefono/slug/foto_url`. Un `contacto_directo?:
  boolean` opcional es aditivo → no los afecta. `sici-deep-links` es fork legacy fuera de scope.

## 11. Plan de verificación (QA)

1. **No-regresión brokers reales** (flag false): un `/b/[hash]` de broker de pago — TODO igual
   (CTA al broker, preguntas ocultas, header con CTA verde, comentario del broker visible).
2. **B2C `simon-asistente`** (venta y alquiler): CTA por propiedad → captador
   (`agente_telefono`/`agente_whatsapp`); preguntas, similares, ver-original, días publicado
   visibles; CompareSheet con CTA por captador; **comentario del broker conservado**; en
   alquiler verificar también **MapFloatCard** (mapa) y **AlquilerDetailSheet**.
3. **`/b/demo`**: sigue sanitizado (sin teléfonos de captadores). Broker demo con flag false.
4. **Prop sin `agente_*`**: fallback "Ver anuncio", sin botón muerto.
5. **Tracking**: confirmar que los clicks del canal bot llevan `source='public_share_directo'` (§9).
6. **Modal de captura (alquiler)**: confirmar que en el shortlist B2C el CTA va **directo** al
   captador SIN abrir `WhatsAppCaptureModal`, y que NO se inserta lead en `leads_alquiler`.

## 12. Resultado de la revisión adversarial (2026-06-03)

Veredicto del reviewer: **APROBADO CON CAMBIOS**, ya incorporados a este documento:
- (ALTA) Faltaban `MapFloatCard` y `AlquilerDetailSheet` en el inventario → agregados (§7 fila 7).
- (ALTA) Mecanismo inconsistente (invertir-condición vs null) → unificado a prop `contactoDirecto` (§4).
- (ALTA) El truco null rompía el comentario del broker en los sheets → descartado (§4, §2).
- (MEDIA) `contactoDirecto` debe leerse de `publicShare.broker`, no del prop recortado → §4.3.
- (MEDIA) Alquiler usa `agente_whatsapp`, no `agente_telefono` → §3, §7.
- (MEDIA) Tracking contaminaría feed/leads → §9 elevado a decisión necesaria.
- (BAJA) `tc_sospechoso` en CompareSheet → resuelto al usar mecanismo único (§6 decisión 5).
- (BAJA) Header es scope creep → degradado a fase 2 opcional (§6 nota).

**Segunda ronda (pregunta del founder, 2026-06-03):**
- (ALTA) Asimetría del **modal de captura** venta vs alquiler no estaba contemplada. En alquiler
  el feed abre `WhatsAppCaptureModal` (pide teléfono al cliente). Decisión: **no reabrirlo** en
  B2C (el bot ya tiene los datos); ir directo vía flag `_contactoDirecto` en el hook. §3, §7 fila 9, §9.
- (MEDIA) Tracking del modal/leads de alquiler → resuelto con `source='public_share_directo'`
  sin insertar en `leads_*`. §9.
- (INFO) Gates verificados por API: 20 vistas / 30 días confirmados en todas las del bot. §8.

**Tercera ronda (revisión profunda staff, 2026-06-03) — veredicto APROBADO CON CAMBIOS:**
- (ALTA, correctitud) La fórmula §5 es **ilustrativa**; varias guardas reales difieren
  (DetailSheet alquiler = 3 ramas con `!brokerMode`; MapFloatCard deriva `publicShareMode` local).
  → advertencia agregada en §5.
- (MEDIA) Tracking no uniforme: BottomSheet venta hardcodea `source`, CompareSheet no trackea,
  MapFloatCard pasa `fuente` fija. → §9 detalla el mecanismo por sitio.
- (MEDIA→BAJA) Estado module-level del hook: riesgo de fuga entre páginas **descartado** — los
  setters ya tienen cleanup; solo se exige replicar el patrón `useEffect`+cleanup. → §7 fila 9.
- (BAJA) Gates: el POST no fija los valores, son DEFAULT de columna sin cron. → §8 corregido
  (fase 2 = insert explícito + backfill).
- (BAJA) Invariante demo del intercept `wa.me`. → §10.
- (INFO) Hearts y consumidores de `Broker` no requieren cambios. → §10.
- Corrección al reviewer: afirmó que `buildAgentWaMessage` no existe; **sí existe**
  (`ventas.tsx:1594`, lo usan las cards). El BottomSheet usa `buildSheetMsg` inline. Ambos se
  reusan al caer en rama feed; ningún copy se toca a mano.

**Conclusión:** plan validado en 3 rondas. Proporcional, sin overengineering (el mecanismo
prop+flag es el mínimo que preserva layout y modal; el descarte del atajo `null` está fundado).
Listo para implementar siguiendo §7, leyendo cada guarda real por la advertencia de §5.

## 13. Rollback

`UPDATE simon_brokers SET contacto_directo = false WHERE slug='simon-asistente';` revierte al
estado actual sin desplegar código. La columna queda inerte (default false).

## 14. Branching y rollout

**Branch dedicado, no main.** Se trabaja en `feat/shortlist-contacto-directo-b2c` creado **desde
`main`** (no desde `feat/zn-alquiler-auditoria-fixa`, que tiene 20 commits de zona norte sin
mergear y no debe mezclarse). PR a `main` al final. No push/merge sin OK del founder.

**Secuencia segura (BD compartida).** No hay BD por branch: el preview de Vercel apunta a la
**misma BD de prod**. El diseño del flag permite testear sin afectar prod:

1. **Aplicar `ADD COLUMN contacto_directo DEFAULT false`** en Supabase apenas exista el `.sql`.
   Es **inerte**: ningún código en prod la lee aún → cero efecto en prod.
2. **Implementar** §7 en el branch (commits chicos).
3. **Preview deploy** del branch (Vercel por PR). Activar `contacto_directo=true` en
   `simon-asistente` y QA del §11 en la URL de preview. **Prod no se afecta** (su código todavía
   no lee la columna → sigue mandando al bot). Idealmente usar una shortlist de prueba.
4. **Merge a `main`** → prod toma el comportamiento nuevo con el flag ya activo.
5. **Rollback** en cualquier momento: §13 (`UPDATE … false`), sin re-deploy.

**Migración:** la aplica el founder desde Supabase (MCP readonly). El `.sql` se deja listo en
`sql/migrations/` con `ADD COLUMN` + el `UPDATE` de activación separado (el UPDATE se corre
recién en el paso 4, no antes).
