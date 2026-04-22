# Zonas Equipetrol — Descripción canónica

Fuente de verdad: tabla `zonas_geograficas` (7 polígonos PostGIS, 6 nombres únicos).

## Descripción geográfica

| Zona | Ubicación precisa | Perfil |
|------|-------------------|--------|
| **Equipetrol Centro** | De Av. La Salle (Canal Isuto) a Calle Nicolás Ortiz, entre 2do y 3er anillo interno. | La más consolidada, mayor oferta. |
| **Equipetrol Norte** | De Av. San Martín a Calle Doctor Jaime Román, del 3er anillo externo al 4to anillo. | Zona financiera, condominios modernos. Rentas altas, inventario chico. |
| **Villa Brigida** | De Calle Doctor Jaime Román a Av. La Salle (Canal Isuto), del 3er anillo externo al 4to anillo. | Accesible en precio, condominios nuevos. Emergente, absorción rápida. |
| **Sirari** | De Av. San Martín a Radial 26, del 3er anillo externo al 4to anillo. | Premium, residencial, desarrolladoras top. |
| **Equipetrol Oeste** | De Calle Nicolás Ortiz a Av. Busch, entre 2do y 3er anillo interno. Barrio Faremafu. | Mixto — premium y universitario. |
| **Eq. 3er Anillo** | Franja comercial sobre el 3er anillo, entre Av. Busch y Av. La Salle. | Comercial, muestra insuficiente para reporte por zona. |

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
