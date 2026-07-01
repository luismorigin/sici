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

**⏳ PRÓXIMOS PASOS (retomar acá — todo en 1 sesión con Claude):**
1. **Crear cuenta Cloudflare con TU correo** (evita el bloqueo de Gmail nuevo). `dash.cloudflare.com`.
2. **Comprar `condadovi.com`** en Cloudflare Registrar (~$10/año, al costo, **rechazar todo add-on**). A cubrir por nosotros el año 1 (dominio incluido en los $500).
3. **Subir la carpeta `out/`** a **Cloudflare Pages** (Upload assets / drag-drop). Sin build en Cloudflare → nada que romper.
4. **Conectar el dominio** `condadovi.com` al proyecto de Pages.
5. **Agregar Open Graph** (`og:image` con URL absoluta del dominio) en `src/pages/index.tsx` → rebuild → re-subir (para el preview al compartir por WhatsApp).
6. **Avisar a Google** (Search Console, gratis) que el sitio existe → indexación rápida.
7. **Handoff:** cambiar el **correo de la cuenta Cloudflare al del cliente** (1 click de confirmación de él) → queda dueño, cortamos dependencia.
8. **Cobrar saldo Bs 1,750 (USD 250).**

**Decisiones tomadas (para no re-discutir):** landing FIJA (promo hasta vender, no editable por agencia no técnica) → estático es lo correcto (más seguro, cero mantenimiento). Dominio a nombre del cliente (renovación suya). Cuenta creada con tu correo y transferida al cliente al final (evita crear Gmail nuevo). Detalle técnico completo: memoria `project_landing_condado_vi` + `condado-landing/README.md`.

## Pausados

### Proyecto Beni/Los Cusis

**Estado:** Descartado por el momento (19 Abr 2026). Ya habían descartado parqueos mecanizados tras revisar el material enviado (PDF + infografía). El proyecto en general queda en pausa indefinida.
