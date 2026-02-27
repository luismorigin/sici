# Notas — Informe Guisela Feb 2026

## Contexto
- **Cliente/broker:** Guisela
- **Fecha:** 26 febrero 2026
- **Zona:** Equipetrol (todas las microzonas)
- **Tipologia:** Monoambiente / 1 Dormitorio para alquilar
- **Versiones:** v1 (original), v2 (TC paralelo), v3b (data corregida + rediseno visual)

---

## Problemas detectados y corregidos (v2 → v3b)

### 1. Stone 3 — anticretico confundido con venta
- **ID 841** (venta, $100,000 USD oficial) vs **ID 840** (anticretico, BOB 315,000)
- El informe v1/v2 usaba precio $45,259 del ID 841 que en realidad correspondía al anticrético (840)
- El usuario corrigio ID 841 desde admin dashboard a $100,000 USD oficial
- **Accion:** Stone 3 eliminado del perfil sencillo (ahora es premium a $100K)

### 2. Edificio Kenya (ID 157) — fuera de zona
- Zona y microzona = NULL en BD
- El edificio esta en **Urbari**, no en Equipetrol
- **Accion:** Eliminado del informe

### 3. Alto Busch (ID 917) — sin zona asignada
- Zona = NULL en BD, sin microzona
- No se puede confirmar que este en Equipetrol
- **Accion:** Eliminado del informe

### 4. Santorini Ventura (ID 121) — zona incorrecta en BD
- BD dice zona = "Sirari" pero el edificio esta en **Villa Brigida**
- Probablemente GPS en el borde del poligono
- **Accion:** Informe usa "Villa Brigida". Pendiente corregir en BD

### 5. Normalizacion TC paralelo
- `precio_usd` en BD esta congelado con TC viejo para propiedades TC paralelo
- El enrichment se re-corrio pero el merge no re-procesa propiedades completadas
- **Solucion:** Usar `precio_normalizado(precio_usd, tipo_cambio_detectado)` (migracion 167)
- Los precios premium (Sky Magnolia $107,265, Sky Plaza Italia $105,017, Sky Equinox $78,780) estan correctos via esta funcion con TC 9.012

### 6. Sky Magnolia — precio paralelo vs oficial
- Publicado: BOB 630,000, `solo_tc_paralelo = true`
- Precio paralelo: ~$63K-65K (lo que paga el comprador en USD paralelo)
- Precio oficial normalizado: $107,265 (630K × 9.012 / 6.96)
- El informe muestra el normalizado con nota explicativa de TC

---

## Propiedades incluidas (v3b final)

### Perfil Sencillo ($51K-$69K) — 5 propiedades
| # | ID | Proyecto | Zona | Precio | Status |
|---|-----|----------|------|--------|--------|
| 1 | 121 | Santorini Ventura | Villa Brigida | $51,500 | Listo, 120d negociable |
| 2 | 557 | Domus Tower | Eq. Centro | $63,197 | Listo, 39d |
| 3 | 432 | Portobello 5 | V. Brigida | $67,385 | Preventa |
| 4 | 553 | Uptown Drei | Eq. Oeste | $68,247 | Preventa |
| 5 | 234 | Edificio Murure | Eq. Centro | $68,965 | A estrenar, 109d |

### Perfil Premium ($70K-$107K) — 5 propiedades
| # | ID | Proyecto | Zona | Precio | Status |
|---|-----|----------|------|--------|--------|
| 1 | 150 | La Foret | Eq. Centro | $70,402 | Listo |
| 2 | 455 | HH Once | Eq. Centro | $77,111 | Preventa |
| 3 | 152 | Sky Equinox | Sirari | $78,780 | Preventa |
| 4 | 497 | Sky Plaza Italia | Eq. Centro | $105,017 | Listo |
| 5 | 429 | Sky Magnolia | Sirari | $107,265 | Listo, amoblado |

### Excluidas y por que
| ID | Proyecto | Razon exclusion |
|----|----------|-----------------|
| 841 | Stone 3 | Precio corregido a $100K, ya no es sencillo |
| 157 | Kenya | Urbari, fuera de zona Equipetrol |
| 917 | Alto Busch | Zona NULL, no confirmable |
| 950 | Sky Luxia | Era anticretico, no venta |

---

## Data verificada vs estimada

| Dato | Fuente | Confianza |
|------|--------|-----------|
| Precios venta | BD SICI via `precio_normalizado()` | Alta |
| Rentas La Foret, Santorini, Sky Magnolia | Alquileres reales mismo edificio en BD | Alta |
| Rentas Domus, Portobello, Uptown, Murure | Mediana de zona/tipologia en BD | Media (estimada) |
| Retornos brutos | Calculados: (renta × 12) / (precio × 6.96) | Media (no incluye vacancia/expensas) |
| TC paralelo | 9.012 de config_global | Alta (se actualiza diario) |

---

## Pendientes de verificacion
- [ ] Confirmar links de publicacion activos (Guisela debe clickear cada uno)
- [ ] HH Once: entrega marzo 2026 confirmada?
- [ ] Confirmar precios finales con cada agente por WhatsApp
- [ ] Uptown Drei (ID 553): verificar contacto agente (no se encontro telefono)
- [ ] Santorini Ventura: corregir zona en BD de Sirari → Villa Brigida
- [ ] Expensas no incluidas en calculo de retorno (dato no disponible en BD)
- [ ] Comparables Km9 (mencionado en conversacion pero no incluido en informe)

---

## Lecciones aprendidas

1. **SIEMPRE verificar data de BD antes de cerrar un informe** — 7 de 9 propiedades tenian datos incorrectos en v2
2. **Usar `precio_normalizado()` para precios** — `precio_usd` crudo esta congelado con TC viejo para props paralelo
3. **Verificar zona NOT NULL** — propiedades sin zona no deben entrar en informes de zona especifica
4. **Anticretico vs venta** — revisar URL y tipo_operacion, pueden estar mal clasificados
5. **El admin dashboard SI maneja bien TC** — tiene paths para usd_oficial/usd_paralelo/bob con todos los campos correctos
6. **El merge no re-procesa completadas** — si el enrichment se actualiza despues, precio_usd queda stale
7. **Rango sencillo se movio** — ya no hay opciones sub-$50K con zona confirmada en Equipetrol
