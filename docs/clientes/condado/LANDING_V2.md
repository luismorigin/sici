# Landing Condado VI — versión v2

> Última actualización: 24 May 2026

## Estado actual

**Deployada como staging.** URL para review del cliente:
**https://simonbo.com/condado-vi-v2**

- `noindex,nofollow` → no aparece en buscadores
- Original `/condado-vi` intacta en la URL canónica (sin cambios)
- Mensaje WhatsApp enviado a Adolfo el 19 May pidiendo revisión de textos y fotos en compu + celular
- **24 May:** sumadas fotos reales de los edificios entregados (Condado I–IV) como thumbnails clickeables dentro de la línea de tiempo "5 edificios... Todos entregados". Reenviado a Adolfo para revisión.
  - **Deploy:** commit `1afcbaa` pusheado a `main` el 24 May → desplegado en Vercel. Las fotos ya están visibles en la URL de staging.

## Commits clave

- `4dec2b2` — creación inicial v2 (44 archivos)
- `ee22494` — render IA con chip "RENDER REFERENCIAL"
- `eea1f37` — saco banner preview para envío a cliente
- `1afcbaa` — fotos de edificios entregados (Condado I–IV) en thumbnails dentro del timeline + lightbox 3 fotos c/u (24 May). Originales en alta en `fotos-edificios/` (gitignored)

## Cambios vs landing original

| Slot | v1 original | v2 |
|------|-------------|----|
| **Hero** | `balcon-plaza-v2.png` (IA inventada) | drone panorámico Equipetrol (foto real) |
| **Cocina** | 1 foto | carrusel 3 fotos autoplay 4.5s |
| **Salón** | 1 foto | carrusel 6 fotos — primera IA con chip "RENDER REFERENCIAL" |
| **Fachada** (Constructora) | 1 foto | carrusel 3 fotos autoplay |
| **Amenidades** | 7 (Seguridad + Ascensor) | 7 (sacó Seguridad/Ascensor, sumó Sala juegos + Cowork) |
| **Terraza vista** | bug: usaba `salon-comedor.png` | foto correcta azotea, full-width 2:1 destacada |
| **Equipamiento cocina** | 6 items | 7 items (+ Cava de vinos) |
| **Vida cotidiana** | 3 bloques | 4 bloques (+ pet-friendly "Bienvenidos los cuatro patas") |
| **FAQ** | 7 preguntas | 8 preguntas (+ "¿Se aceptan mascotas?") |
| **Galería detalles** | — | 8 fotos cuadradas bajo equipamiento |
| **Timeline edificios** (Constructora) | solo texto (lista I–VI) | + thumbnail real por edificio (I–IV) clickeable → lightbox 3 fotos c/u. Park V pendiente de foto |
| **Tipologías mobile** | scroll sin indicador | dots indicadores (sin autoplay — son cards de decisión) |
| **Lightbox** | ~10 fotos | ~38 fotos navegables |

## Decisión sobre fotos IA

El cliente entregó set con fotos generadas por IA. Manejo adoptado:

- **NO usar** el balcón→Plaza Italia del hero original (era IA pura, sin contraparte real)
- **SÍ usar** 1 IA en carrusel salón porque mostraba mejor el ambiente integrado (sofá + cocina + comedor + balcón en una toma)
- Esa única IA tiene chip overlay **"RENDER REFERENCIAL"** en esquina superior derecha (sutil, ebano translúcido + blur)
- El chip aparece/desaparece automáticamente solo cuando el carrusel rota a esa foto
- Resto del material son fotos reales del set "FOTOS EDITADAS"

**Cobertura:** si comprador llega al depto y "no es así", chip + mensaje WSP a Adolfo son prueba de criterio profesional aplicado.

## Lighthouse — corrida inicial 18 May 2026

> Medición hecha con Chrome con extensions activas. Lighthouse mismo avisa que las extensions inflan los problemas. Re-correr en incognito daría +5-10 puntos en Performance y Best Practices.

| Categoría | Score | Estado |
|-----------|-------|--------|
| Performance | 82 | Naranja — mejorable |
| Accessibility | 91 | Verde |
| Best Practices | 58 | Rojo — parcialmente falso positivo |
| SEO | 66 | Rojo — falso positivo (noindex intencional) |

### Web Vitals

- FCP 1.0s ✅
- LCP 2.8s ⚠️ (umbral "good" <2.5s)
- TBT 530ms ⚠️ (umbral "good" <200ms)
- CLS 0 ✅
- SI 1.1s ✅

### Lo que NO arreglar (falsos positivos)

- **SEO 66:** página tiene `<meta name="robots" content="noindex,nofollow">` por staging. Al pasar a definitivo y sacar el noindex sube solo a ~90+. **No tocar hasta que Adolfo apruebe el contenido.**
- **BP 58 puntos perdidos por 14 third-party cookies** — son del browser del usuario que corrió Lighthouse, no de la página. En incognito desaparece.
- **HSTS/COOP/CSP/Trusted Types headers** — responsabilidad de Vercel, no del código. Para mejorarlos hay que configurar `next.config.js` o `vercel.json`. No prioritario ahora.

### Mejoras reales priorizadas

**Alta prioridad** (impacto usuario real):

1. **LCP 2.8s → bajar a <2.5s** — comprimir hero (`hero.jpg`), de ~500KB a ~150-200KB calidad 75-80%. Considerar AVIF/WebP optimizado.
2. **TBT 530ms → bajar a <200ms** — lazy-load del lightbox (cargar solo cuando se abre) y de carruseles offscreen. Lighthouse reporta 2,289 KiB de JavaScript sin usar.
3. **Touch targets de dots de carrusel** — actualmente 1.5px alto, chicos para mobile. Agrandar área clickeable a 24×24px mínimo sin cambiar visual.

**Media prioridad:**

- Legacy JavaScript: 25 KiB (Next.js maneja transpilation, poco margen)
- Unused CSS: 24 KiB (Tailwind purge debería estar funcionando)
- Cache lifetimes: 153 KiB (config de Vercel para assets estáticos)
- Image delivery: 158 KiB (comprimir/redimensionar fotos del carrusel además del hero)

### Cuando aplicar las mejoras

**Esperar feedback de Adolfo primero.** Si pide cambios de fotos/copy, las mejoras de performance se hacen al final — no tiene sentido optimizar fotos que después van a cambiar.

Cuando Adolfo apruebe contenido → 1 sesión de optimización (1-2 hs) y apuntar a 95+/95+/95+/95+ antes de hacerla la versión canónica.

## Pendiente del cliente

- [ ] Adolfo revisa la URL en compu + celular y manda observaciones de textos/fotos (reenviado 24 May con fotos de edificios sumadas)
- [ ] Confirmar si todo el material entregado es de un mismo depto modelo o de varios (impacta narrativa visual del carrusel salón)
- [ ] **Falta foto de Condado Park V** — pedírsela a Adolfo para completar el timeline

## Próximos pasos

1. Recibir feedback de Adolfo
2. Aplicar cambios solicitados (copy, fotos, orden)
3. Pasada de optimización Lighthouse (comprimir hero, lazy-load lightbox, touch targets)
4. Decidir: ¿reemplazar `/condado-vi` original con esta versión o mantener como rutas separadas con redirect?
5. Sacar `noindex,nofollow` cuando vaya a definitivo
6. Cobrar saldo Bs 1,750 (USD 250) al publicar — ver `PENDIENTES.md`

## Comercial

- **Cotización original:** USD 500 (50/50 — adelanto Bs 1,750 cobrado 18 Mar 2026)
- **Saldo:** USD 250 al publicar definitivo
- **Revisiones incluidas:** 2 rondas (queda 1 disponible después de esta primera devolución de Adolfo)
