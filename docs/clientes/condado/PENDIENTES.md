# Pendientes — Condado / Proinco

> Última actualización: 1 Jul 2026

## Estado del acuerdo original

**Monitoreo trimestral: CERRADO Y PAGADO.** Los 3 informes del acuerdo original ($250/mes × 3 = USD 750) están entregados y cobrados. El último pago (abril, USD 250) se acreditó el 21 Abr 2026. **No hay estudio de mayo comprometido.**

## Abiertos

### 1. Enviar propuesta comercial a Adolfo

**Estado:** Draft listo en `EMAIL_PROPUESTA_ABRIL_2026_DRAFT.md`. Pendiente retoques:
- Confirmar nombre + email de Adolfo en saludo
- Fechas concretas (kick-off propuesto, deadline de respuesta)
- Hostear los 3 HTMLs anexos en URLs públicas
- Revisar tono final

**Contenido:** Propuesta formal post-cierre del estudio de mercado. Tres componentes:
- Setup estratégico USD 3,500 one-time
- Dirección comercial USD 1,000/mes × 3 meses (con salida planeada mes 3)
- Canal Simón USD 200/mes budget Meta (incluido durante asesoría; post-asesoría USD 150/mes fee + budget)

**Audiencia secundaria:** el fundador antiguo ("duro de roer"). Ver mensajes preparados en el draft: capital inmovilizado USD 2.1M, comisión de broker equivalente, cláusula salida mes 3.

**Envío:** Martes/miércoles AM. Follow-up 48h si no responde.

### 2. Landing web Condado VI — v2 CONTENIDO APROBADO por el cliente

**Estado (1 Jul 2026):** ✅ **Cliente aprobó todo el contenido.** Todas las observaciones y fotos solicitadas están aplicadas en la landing (última revisión de contenido: commit `cf55821`, 19 Jun). La landing está en producción en `simonbo.com/condado-vi-v2` (`noindex`). Ya no hay pendientes de contenido — pasa a fase de **cierre** (dominio propio + optimización + cobro).

URL actual: **https://simonbo.com/condado-vi-v2** (noindex)

**Detalles completos:** ver `LANDING_V2.md`

**✅ Pendiente del cliente — RESUELTO:**
- Observaciones de textos/fotos: aplicadas
- Foto de **balcón**: cubierta por los renders IA de la sección "Así se vería tu espacio amoblado"
- Foto de **Condado Park V**: sumada al timeline (2 Jun)
- Material de mesones (piedra sinterizada): validado con la arquitecta

### 👉 DÓNDE RETOMAR (estado al 1 Jul 2026)

**✅ YA HECHO:**
- **Optimización** de la landing (imágenes −47% + touch targets a11y) → mergeada a `main`, en prod. PSI real: **96 mobile / 92 desktop**.
- **Versión estática standalone CONSTRUIDA** para la entrega (independiente de simon-mvp/Vercel). Ubicación: `C:\Users\LUCHO\Desktop\Censo inmobiliario\condado-landing\` (repo git propio, commit `4094a11`). Genera la carpeta **`out/`** con `npm run build`. Imágenes WebP, `noindex` removido, SEO afinado (título/desc capturan "Condado VI" y "Condado 6").
- Dominio elegido: **`condadovi.com`** (verificado LIBRE, 1 Jul).
- **Open Graph LISTO** (paso 5 adelantado, commit `a7775a9`): `og-image.jpg` 1200×630 (196KB, JPG para que WhatsApp lo renderice — WebP no sirve en OG) + meta tags OG/Twitter apuntando a `https://condadovi.com/`. Ya está en `out/`. Al subir queda funcionando el preview de WhatsApp de una.

**✅ HECHO (1 Jul 2026 — sesión de publicación):**
1. ✅ **Cuenta creada** — pero con correo DEDICADO **`condadovi@proton.me`** (NO el Gmail del founder). Mejor: la cuenta entera es transferible al cliente. Credenciales + manual PDF en `condado-landing/entrega/` (gitignored, fuera de git): `CREDENCIALES_CONDADO_VI.md` (referencia interna) + `Manual_Entrega_Condado_VI.pdf` (con contraseñas, es el que se entrega al cliente).
2. ✅ **`condadovi.com` COMPRADO** en Cloudflare Registrar ($10.46/año). ⚠️ Pendiente **apagar auto-renovación** para que la tarjeta del founder no se cobre en 2027 (el cliente la reactiva con la suya post-handoff).
3. ✅ **Sitio subido a Cloudflare Workers/Pages** (proyecto `condadovi`, Direct Upload del ZIP). **BUG resuelto:** el ZIP de `Compress-Archive` (PowerShell 5.1) usa backslashes → Cloudflare no anida las carpetas → solo servía `index.html`. FIX: regenerar ZIP con `System.IO.Compression.ZipArchive` forzando `/` (script en la sesión). El sitio quedó live tras re-deploy.
4. ✅ **Dominio conectado** — `condadovi.com` Active, SSL emitido. **Verificado 200 en index/imágenes/CSS/og-image.**
5. ✅ **Open Graph** (commit `a7775a9`).

**✅ HECHO (1 Jul, cierre):**
6. ✅ **Google Search Console** — dominio verificado (verificación automática por DNS de Cloudflare).
7. ✅ **Entrega formal ENVIADA** (1 Jul) — correo al equipo Proinco (`laam.altamirano@gmail.com` + `nadinealtamiranomedina@gmail.com`, asunto "Entrega final — Landing web Condado VI") con el `Manual_Entrega_Condado_VI.pdf` adjunto (accesos Proton+Cloudflare a nombre del cliente) + mensaje de WhatsApp avisando del correo, el link `condadovi.com` y el saldo. La cuenta `condadovi@proton.me` se entrega al cliente (cambia contraseñas al recibir).

**⏳ ÚNICO PENDIENTE:**
8. **Cobrar saldo Bs 1,750 (USD 250)** — ya solicitado por WhatsApp, esperando el pago del cliente.

**✅ HECHO 1 Jul (extra de la sesión):**
- **Auto-renovación del dominio APAGADA** (la tarjeta del founder no se cobra en 2027).
- **`www.condadovi.com` RESUELTO** → CNAME `www`→`condadovi.com` (proxied) + Redirect Rule "Redirect from WWW to root" (301, preserve query string). Verificado: `www` → 301 → `https://condadovi.com/` (200). Zone ID `4bd88656ebbec5a330e6033e4e3ad10a`.

**Decisiones tomadas (para no re-discutir):** landing FIJA (promo hasta vender, no editable por agencia no técnica) → estático es lo correcto (más seguro, cero mantenimiento). Dominio a nombre del cliente (renovación suya). Cuenta creada con tu correo y transferida al cliente al final (evita crear Gmail nuevo). Detalle técnico completo: memoria `project_landing_condado_vi` + `condado-landing/README.md`.

## Pausados

### Proyecto Beni/Los Cusis

**Estado:** Descartado por el momento (19 Abr 2026). Ya habían descartado parqueos mecanizados tras revisar el material enviado (PDF + infografía). El proyecto en general queda en pausa indefinida.
