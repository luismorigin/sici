# Zonas Equipetrol — Descripción canónica

Fuente de verdad: tabla `zonas_geograficas` (7 polígonos PostGIS, 6 nombres únicos).

## Descripción geográfica

| Zona | Ubicación | Perfil |
|------|-----------|--------|
| **Equipetrol Centro** | Entre el 2do y 3er anillo. Canal Isuto al este, calle Nicolás Ortiz al oeste (límite con Eq. Oeste). | La zona más consolidada, mayor oferta. |
| **Equipetrol Norte** | Pasando el 3er anillo hacia el norte, entre 3er y 4to anillo. | Zona financiera, condominios modernos. Rentas altas, inventario chico. |
| **Villa Brigida** | Entre Equipetrol Norte y Canal Isuto, entre 3er y 4to anillo. | Condominios nuevos, la zona más accesible en precio. Emergente, absorción rápida. |
| **Sirari** | Al oeste, entre 3er y 4to anillo. | Más tranquilo, residencial, desarrolladoras premium. |
| **Equipetrol Oeste** | Al oeste de Eq. Centro, entre 2do y 3er anillo, desde calle Nicolás Ortiz hasta Avenida Busch. Barrio Faremafu. | Mixto — premium y universitario. |
| **Eq. 3er Anillo** | Sobre el 3er anillo mismo. | Franja comercial, muy pocas opciones de alquiler. |

## Nombres en BD

| Display | Valor en BD | Display corto |
|---------|-------------|---------------|
| Equipetrol Centro | `Equipetrol Centro` | Eq. Centro |
| Equipetrol Norte | `Equipetrol Norte` | Eq. Norte |
| Sirari | `Sirari` | Sirari |
| Villa Brigida | `Villa Brigida` | V. Brigida |
| Equipetrol Oeste | `Equipetrol Oeste` | Eq. Oeste |
| Eq. 3er Anillo | `Eq. 3er Anillo` | Eq. 3er Anillo |

## Aliases legacy

`Equipetrol`, `Faremafu`, `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Franja`, `Villa Brígida` (con tilde).

## Referencias técnicas

- Trigger: `trg_asignar_zona_venta` (migración 173) auto-asigna `p.zona` y `p.microzona` desde GPS
- Función: `get_zona_by_gps(lat, lon)` (migración 185) para consultas ad-hoc
- Código: `lib/zonas.ts` mapea BD → display via `displayZona()` y `getZonaLabel()`
- Conteos: `SELECT zona, COUNT(*) FROM v_mercado_venta GROUP BY zona`
