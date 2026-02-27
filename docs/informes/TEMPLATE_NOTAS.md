# Notas — [Informe] [Cliente] [Fecha]

## Contexto
- **Cliente/broker:**
- **Fecha:**
- **Zona:**
- **Tipologia:**
- **Versiones:** v1 (descripcion)

---

## Propiedades incluidas

### Perfil [nombre] ($XK-$YK)
| # | ID | Proyecto | Zona | Precio | Status |
|---|-----|----------|------|--------|--------|
| 1 | | | | | |

### Excluidas y por que
| ID | Proyecto | Razon exclusion |
|----|----------|-----------------|
| | | |

---

## Data verificada vs estimada

| Dato | Fuente | Confianza |
|------|--------|-----------|
| Precios venta | BD SICI via `precio_normalizado()` | Alta |
| Rentas edificio X | Alquileres reales mismo edificio en BD | Alta |
| Rentas estimadas | Mediana de zona/tipologia en BD | Media |
| Retornos brutos | (renta x 12) / (precio x 6.96) | Media (sin vacancia/expensas) |
| TC paralelo | config_global | Alta |

---

## Pendientes de verificacion
- [ ] Links de publicacion activos
- [ ] Precios confirmados con agentes
- [ ] Datos de contacto completos
- [ ] Expensas (no incluidas en retorno)

---

## Lecciones aprendidas

1.
2.
3.
