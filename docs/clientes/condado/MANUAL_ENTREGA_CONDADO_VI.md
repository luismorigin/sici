# Manual de entrega — Landing web Condado VI

**Sitio:** https://condadovi.com
**Fecha de entrega:** _______________
**Entregado por:** Simón (SICI)

---

Este documento describe todo lo necesario para administrar la landing web de **Condado VI**. Está dividido en dos partes:

- **Parte A — Para el propietario:** lo esencial que debés saber (qué tenés, cómo mantenerlo vivo, costos).
- **Parte B — Para el programador o agencia:** los detalles técnicos para modificar, actualizar o migrar el sitio.

---

## PARTE A — Para el propietario

### ¿Qué es lo que se entrega?

- Una **página web promocional** de Condado VI, en línea en **https://condadovi.com**.
- Un **dominio propio** (`condadovi.com`) a tu nombre.
- La página también responde en **www.condadovi.com** (redirige automáticamente a la principal).
- El sitio es **estático**: es rápido, seguro y no tiene base de datos ni panel de administración. Está pensado como una landing **fija de promoción** (se mantiene igual hasta vender las unidades).

### Cuentas y accesos

Todo el proyecto (correo + dominio + hosting) está centralizado en **una sola cuenta de correo**, para que sea fácil de administrar y transferir:

| Servicio | Para qué sirve | Usuario |
|---|---|---|
| **Proton Mail** | Correo maestro de todo el proyecto | `condadovi@proton.me` |
| **Cloudflare** | Hosting del sitio + dominio + DNS | (inicia sesión con `condadovi@proton.me`) |
| **Google Search Console** | Posicionamiento en Google | (cuenta Google) |

> 🔑 **Las contraseñas se entregan por separado, de forma segura.** Se recomienda **cambiarlas** al recibir la cuenta y guardar la **frase de recuperación** de Proton Mail en un lugar seguro (es la única forma de recuperar la cuenta si se pierde la contraseña).

### ⚠️ Lo más importante: mantener vivo el dominio

El dominio `condadovi.com` **se paga una vez al año** (aprox. **USD 10**). Si no se renueva, **el sitio deja de funcionar** y otra persona podría quedarse con el nombre.

- **Vencimiento actual:** **1 de julio de 2027** (el primer año ya está pagado).
- La **renovación automática está desactivada** (para que no se cobre a una tarjeta anterior).
- **Antes del vencimiento** tenés dos opciones:
  1. **Renovar manualmente** cada año en Cloudflare, o
  2. Entrar a Cloudflare → *Domains → condadovi.com → Renewal* y **activar la renovación automática con tu tarjeta** (recomendado para no olvidarse).

> Cloudflare envía recordatorios por correo (`condadovi@proton.me`) antes del vencimiento.

### Costos

| Concepto | Costo |
|---|---|
| Dominio `condadovi.com` | ~USD 10 / año |
| Hosting (Cloudflare) | **Gratis** |
| Certificado de seguridad (https) | **Gratis** (automático) |
| **Total anual** | **~USD 10 / año** |

---

## PARTE B — Para el programador o agencia

### Arquitectura

| Componente | Detalle |
|---|---|
| **Tipo de sitio** | Estático (sin servidor ni base de datos) |
| **Generado con** | Next.js — *static export* (`output: 'export'`, `images: { unoptimized: true }`) |
| **Hosting** | Cloudflare Workers/Pages — proyecto **`condadovi`**, modo **Direct Upload** (sin repositorio Git conectado) |
| **DNS** | Cloudflare (Zone ID `4bd88656ebbec5a330e6033e4e3ad10a`) |
| **SSL** | Certificado universal de Cloudflare (automático) |
| **Registrador del dominio** | Cloudflare Registrar |

### Configuración de DNS y dominios

- **`condadovi.com`** → conectado al proyecto Worker `condadovi` como *Custom Domain* (DNS y SSL gestionados por Cloudflare automáticamente).
- **`www.condadovi.com`** → registro `CNAME` (proxied) hacia `condadovi.com` + una **Redirect Rule** que hace `301` de `www` al dominio raíz (preservando path y query string). El dominio canónico es **sin www**.

### Cómo actualizar el contenido del sitio

El sitio se sirve desde archivos estáticos ya compilados. Para publicar un cambio:

1. Editar el código fuente (proyecto Next.js).
2. Generar los archivos: `npm run build` → produce la carpeta **`out/`**.
3. Comprimir el **contenido** de `out/` en un ZIP (con `index.html` en la raíz del ZIP).
   - ⚠️ **Cuidado en Windows:** el `Compress-Archive` de PowerShell genera ZIPs con separadores `\` (backslash) que **Cloudflare no interpreta como carpetas** → solo se sirve `index.html` y el resto da 404. Usar una herramienta que genere rutas con `/` (7-Zip, `tar`, o `System.IO.Compression.ZipArchive` forzando `/`).
4. En Cloudflare → *Workers & Pages → `condadovi` → New deployment* → subir el ZIP.

> **Recomendación para una agencia:** conectar el proyecto a un repositorio **Git (GitHub/GitLab)** con build automático en Cloudflare Pages. Así cada cambio se publica solo con un `git push`, sin subir ZIPs a mano. El proyecto ya es un repositorio Git independiente.

### Detalles de contenido y SEO

- **Imágenes:** optimizadas y convertidas a **WebP** (livianas). La imagen de vista previa para redes/WhatsApp (`og-image.jpg`) es **JPG a propósito** (WhatsApp no renderiza WebP en Open Graph).
- **Meta tags:** `title`, `description`, `canonical` (apunta a `https://condadovi.com/`), Open Graph y Twitter Card ya configurados en el `<head>`.
- **Rendimiento:** PageSpeed Insights (móvil) ≈ **96/100**.
- **Google Search Console:** el dominio ya está verificado (verificación por DNS de Cloudflare).

### Migrar a otro hosting (si se desea)

Al ser un sitio estático (la carpeta `out/`), se puede subir a **cualquier** hosting estático (Netlify, Vercel, un bucket S3, un servidor con Nginx, etc.). Solo hay que apuntar el dominio al nuevo hosting desde el DNS de Cloudflare.

---

## Checklist de entrega

- [ ] Accesos entregados (Proton Mail, Cloudflare) y contraseñas cambiadas por el propietario
- [ ] Frase de recuperación de Proton Mail guardada en lugar seguro
- [ ] Confirmado que `https://condadovi.com` abre correctamente
- [ ] Decidido el método de renovación del dominio (manual o automática con tarjeta propia)
- [ ] (Opcional) Código fuente entregado al programador/agencia si se planean cambios

---

_Documento generado como parte de la entrega del proyecto. Ante dudas técnicas durante el traspaso, contactar a quien realizó la entrega._
