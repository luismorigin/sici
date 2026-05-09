# Audit log — drift detection 2026-05-08

## Listings marcados `inactivo_pending` por audit (no por verificador HTTP)

Motivo: HTML 200 OK pero sin descripción ni meta tags tras waitFor 5000ms en Firecrawl.
Verificador del pipeline no los detecta porque chequea HTTP 404/302.

| ID | Edificio | Fuente | URL |
|---:|---|---|---|
| 629 | Lofty Island | C21 | https://c21.com.bo/propiedad/... |
| 888 | Torre Real | C21 | https://c21.com.bo/propiedad/... |
| 1141 | Edificio Rio Sirari | C21 | https://c21.com.bo/propiedad/... |
| 1142 | Edificio Rio Sirari | C21 | https://c21.com.bo/propiedad/... |
| 1143 | Edificio Rio Sirari | C21 | https://c21.com.bo/propiedad/... |

## Listings que ya tenían `inactivo_pending`/`inactivo_confirmed` desde antes

| ID | Edificio | Detectado por |
|---:|---|---|
| 172 | Onix Art By Elite | manual (audit batch 1) |
| 497 | Sky Plaza Italia | verificador del pipeline |

## Ediciones de descripción aplicadas

| ID | Edificio | Acción |
|---:|---|---|
| 100 | Atrium | descripción nueva via admin |
| 317 | La Riviera | descripción nueva via SQL + sync |
| 422 | INIZIO | descripción nueva via SQL + sync |
| 198 | Omnia Prime | precio + descripción via admin |
| 428 | Las Palmeras | precio + TC paralelo + descripción via admin |
| 519 | Garden Equipetrol | precio + TC paralelo via admin |
| 530 | Macororo 12 | precio + descripción via admin |
| 576 | Atrium 1d | precio + descripción via admin |

## Bugs detectados en sistema productivo

1. **Verificador pipeline gap**: HTTP 200 con HTML vacío no detectado.
2. **Admin `usePropertyEditor.ts`**: `tipo_cambio_detectado` solo se actualiza si tocás el dropdown "tipo_precio". No infiere desde descripción.
3. **Dos sources de descripción**: `datos_json.contenido.descripcion` (admin) vs `datos_json_enrichment.descripcion` (extractor/LLM). Updates parciales generan desync.
4. **Audit script anterior tenía waitFor=1500ms**: insuficiente para SPA de C21, 32 falsos positivos en batch 3. Fix: 5000ms.
