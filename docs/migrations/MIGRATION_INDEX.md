# Índice de Migraciones SQL — SICI

> **Nota de Auditoría (27 Feb 2026):** Duplicados renombrados con sufijo "b" (115b, 116b, 140b, 147b, 148b). Saltos intencionales en 045, 055, 058. Todas desplegadas en Supabase.

| # | Archivo | Propósito |
|---|---------|-----------|
| 001 | migracion_merge_v2.0.0 | Merge Discovery + Enrichment |
| 002 | migracion_columnas_matching | Columnas matching en propiedades_v2 |
| 003 | matching_sugerencias_fk_v2 | FK hacia propiedades_v2 |
| 004 | microzonas_schema | Tabla zonas_geograficas |
| 005 | asignar_zona_por_gps | Funciones GPS |
| 006 | crear_proyecto_desde_sugerencia | RPC básica |
| 007 | crear_proyecto_con_gps_validacion | RPC v2 + validación |
| 008 | auditoria_snapshots | Tabla snapshots (vacía) |
| 009 | sin_match_exportados | Sistema Sin Match |
| 010 | accion_corregir | CORREGIR para Sin Match |
| 011 | corregir_proyecto_matching | CORREGIR para Pendientes |
| 012 | fix_null_strings | Fix "null" string de n8n |
| 013 | workflow_executions | Tabla + función tracking workflows |
| 014 | tc_binance_historial | TC Binance + historial precios |
| 015 | excluido_operacion | Status para alquiler/anticrético |
| 016 | limpieza_sky_properties | Auditoría Sky + corrección GPS/duplicados |
| 017 | mejoras_matching_system | FK formal, detección duplicados (blacklist no implementada) |
| 018 | asignar_proyecto_existente | RPC asignar proyecto existente |
| 019 | knowledge_graph_mvp | Query Layer: buscar_unidades_reales() |
| 020 | leads_mvp | Sistema leads inicial |
| 021 | leads_flow_refactor | Refactor flujo leads |
| 022 | fuzzy_matching_infraestructura | pg_trgm, normalize_nombre(), buscar_proyecto_fuzzy() |
| 023 | supervisor_excluidas | HITL excluidas: exportar, procesar_accion, detectar_razon |
| 024 | matching_trigram_integration | generar_matches_trigram(), matching_completo_automatizado |
| 025 | generar_razon_fiduciaria | EL MOAT: razones contextuales con DATA real |
| 026 | buscar_unidades_reales_v2 | v2.1: fotos, precio_m2, score, desarrollador, filtro área>=20m² |
| 027 | fix_tipo_propiedad_santorini | Reclasificar 22 parqueos/bauleras SANTORINI VENTURA |
| 028 | calcular_posicion_mercado | Comparar precio vs promedio zona (oportunidad/premium) |
| 029 | fix_dato_corrupto_380 | Fix dato corrupto ID 380 |
| 030 | analisis_mercado_fiduciario | Análisis de mercado fiduciario |
| 031 | ficha_coherencia_fiduciaria | Ficha coherencia fiduciaria |
| 032 | filtro_estado_construccion | Filtro estado construcción |
| 033 | fix_solo_con_fotos | Fix jsonb_array_length() en fotos NULL |
| 034 | fix_fotos_remax | Fix fotos Remax |
| 035 | fix_zona_proyecto_265 | Fix zona proyecto 265 |
| 036 | recalcular_zonas_por_gps | Recalcular zonas por GPS |
| 037 | filtro_precio_outlier | Filtro precio outlier |
| 038 | curar_datos_usuario | Curar datos usuario |
| 039 | dias_en_mercado | Días en mercado |
| 040 | comparacion_edificio | Comparación edificio |
| 041 | comparacion_tipologia | Comparación tipología |
| 042 | amenities_fiduciarias | Amenities fiduciarias |
| 043 | equipamiento_deteccion | Equipamiento detección |
| 044 | agregar_banos | Agregar baños |
| 045 | - | *(salto en numeración)* |
| 046 | agregar_descripcion | Agregar descripción |
| 047 | agregar_posicion_mercado | Agregar posición mercado |
| 048 | fix_jsonb_each_null | Fix jsonb_each crash en amenities NULL, excluir Sin zona |
| 049 | deduplicar_santorini | Columna duplicado_de, marcar 28 duplicados SANTORINI |
| 050 | fix_santorini_gps_fotos | Corregir GPS y fotos rotas SANTORINI VENTURA |
| 051 | deduplicar_exactos | Marcar duplicados exactos (Avanti, Spazios, etc.) |
| 052 | fix_estado_entrega_solo_preventa | Filtro MOAT 3 opciones |
| 053 | fix_posicion_mercado_usar_precio_m2 | Fix posición mercado usar precio/m² |
| 054 | buscar_unidades_pasar_precio_m2 | Buscar unidades pasar precio/m² |
| 055 | - | *(salto en numeración)* |
| 056 | fix_jsonb_each_null | Fix jsonb_each null adicional |
| 057 | fix_estado_entrega_moat | Fix estado entrega MOAT |
| 058 | - | *(salto en numeración)* |
| 059 | fix_tc_paralelo_retroactivo | Fix bug merge TC + 13 props + vista monitoreo |
| 060 | fix_multiproyecto_completo | Fix multiproyecto completo |
| 061 | agregar_dias_en_mercado | Agregar días en mercado |
| 062 | filtro_dias_en_mercado | Filtro días en mercado |
| 063 | buscar_unidades_reales_completa | buscar_unidades_reales completa |
| 064 | enriquecer_amenities_equipamiento | Extracción 69 campos de descripciones a JSONB |
| 065 | agregar_gps_estacionamientos | Añadir estacionamientos al retorno |
| 066 | enriquecer_estacionamientos | Extraer parqueos desde descripciones |
| 067 | enriquecer_baulera | Columna baulera + extracción |
| 068 | agregar_baulera_funcion | Añadir baulera a buscar_unidades v2.23 |
| 069 | expandir_equipamiento_detectado | Detección tiempo real ~60 amenities v2.24 |
| 070 | leads_contacto_broker | Sistema contacto lead-broker (SIM-XXXXX) |
| 071 | beta_feedback | Sistema beta feedback |
| 072 | broker_system_tables | 7 tablas sistema broker |
| 073 | buscar_unidades_broker | Función búsqueda propiedades broker |
| 074 | broker_datos_prueba | Datos test broker |
| 075 | brokers_verificacion_preregistro | Verificación brokers + pre-registro |
| 076 | propiedades_broker_campos_adicionales | Campos adicionales propiedades broker |
| 077 | propiedades_historial_auditoria | Tabla auditoría cambios (2,938 registros) |
| 078 | fix_cron_tc_dinamico | Fix cron TC dinámico |
| 079 | buscar_unidades_precio_actualizado | Precio actualizado |
| 080 | fix_auditoria_tc_batch | Fix auditoría TC batch |
| 081 | columnas_piso_forma_pago | Columnas piso + forma de pago |
| 082 | buscar_unidades_forma_pago | buscar_unidades v2.25 + forma pago |
| 083 | parqueo_baulera_precio | Columnas parqueo/baulera precio |
| 084 | buscar_unidades_parqueo_baulera | buscar_unidades v2.26 + parqueo/baulera |
| 085 | proyectos_master_campos_admin | Admin Proyectos campos |
| 086 | inferir_datos_proyecto | Función inferir amenidades/estado/pisos |
| 087 | fotos_proyecto_amenidades_opcionales | Fotos proyecto + amenidades opcionales |
| 088 | desarrolladores_master | Tabla desarrolladores + FK |
| 089 | permisos_anon_landing | Permisos SELECT anon Market Lens |
| 090 | contar_bajadas_precio | RPC bajadas de precio snapshots |
| 091 | fix_propagar_amenidades_estructura | Fix propagar amenidades |
| 092 | score_calidad_broker_100pts | Sistema calidad 100pts broker |
| 093 | storage_buckets_broker | Buckets Storage: pdfs-broker |
| 094 | fix_leads_mvp_permissions | Fix permisos leads MVP |
| 095 | limpieza_datos_vistas | Vistas métricas mercado |
| 096 | calcular_confianza_datos | Calcular confianza datos |
| 097 | metricas_dias_mercado | Métricas días en mercado |
| 098 | fix_metricas_zona_dias | Fix métricas zona días |
| 099 | excluir_duplicados_buscar_unidades | Excluir duplicados |
| 100 | broker_forma_pago_campos | Campos forma de pago broker |
| 101 | buscar_unidades_broker_tc_dinamico | broker con TC dinámico |
| 102 | permisos_anon_salud | Permisos anon dashboard salud |
| 103 | fix_propagar_verificacion_bloqueo | Fix propagar verificación bloqueo |
| 104 | equipamiento_base_proyecto | Equipamiento base proyecto |
| 105 | inferir_equipamiento_proyecto | Inferir equipamiento proyecto |
| 106 | fix_equipamiento_reemplazar | Fix equipamiento reemplazar |
| 107 | fix_amenidades_reemplazar | Fix amenidades reemplazar |
| 108 | sincronizar_propiedad_individual | Sincronizar propiedad individual |
| 109 | equipamiento_leer_guardados | Leer equipamiento guardado |
| 110 | fix_posicion_mercado_precio_m2 | Fix posición mercado precio/m² |
| 111 | plan_pagos_cuotas_v2 | Plan de pagos y cuotas v2 |
| 112 | trigger_creditos_cma | Trigger créditos CMA |
| 113 | validacion_humana_auto_aprobados | Validación humana auto-aprobados |
| 114 | unificar_dias_mercado_300 | Unificar días en mercado (300 máx) |
| 115 | candados_ediciones_manuales | Candados para ediciones manuales |
| 115b | fix_amenities_confirmados_usar_lista | Fix amenities usar lista |
| 116 | trigger_proteger_amenities | Trigger proteger amenities |
| 116b | fix_equipamiento_usar_lista | Fix equipamiento usar lista |
| 117 | fix_tc_paralelo_columna | Fix TC paralelo columna |
| 118 | candados_nombres_proyecto | Candados nombres proyecto |
| 119 | fix_ctes_filtro_antiguedad | Fix CTEs filtro antigüedad |
| 120 | fix_metricas_mercado_antiguedad | Fix métricas mercado antigüedad |
| 121 | fix_razon_fiduciaria_antiguedad | Fix razón fiduciaria antigüedad |
| 122 | fix_tipos_buscar_unidades | Fix tipos buscar unidades |
| 123 | fix_300_dias_todos | Fix 300 días todos |
| 124 | fix_where_300_dias | Fix WHERE 300 días |
| 125 | agregar_fecha_entrega | Agregar fecha_entrega a buscar_unidades |
| 126 | propagar_con_candados | Propagar datos respetando candados |
| 127 | fix_campos_bloqueados_corruptos | Fix campos_bloqueados corruptos |
| 128 | fix_propagacion_update_consolidado | Fix propagación UPDATE consolidado |
| 129 | propagar_con_apertura_temporal | Propagar con apertura temporal candados |
| 130 | admin_users | Tabla admin_users + auth |
| 131 | alinear_zona | Alinear zona/microzona |
| 132 | fix_zona_sky_eclipse | Fix zona Sky Eclipse |
| 133 | filtrar_300_dias_market | Filtrar >300 días market |
| 134 | asignar_microzona_98_props | Asignar microzona 98 props |
| 135 | rental_columns | 8 columnas alquiler + 5 CHECK + 3 índices |
| 136 | registrar_discovery_alquiler | Función discovery alquiler (UPSERT independiente) |
| 137 | registrar_enrichment_alquiler | Función enrichment LLM alquiler con candados |
| 138 | merge_alquiler | Merge enrichment-first, sin TC paralelo |
| 139 | reactivar_alquileres_existentes | Reactivar 61 alquileres existentes → completado |
| 140 | market_absorption_snapshots | Tabla + función snapshot inversión mercado (absorción, precios, renta, ROI) |
| 140b | rescatar_precios_alquiler | Rescatar precios alquiler de discovery a columnas |
| 141 | matching_alquileres_lookup | Lookup matching alquileres por nombre/GPS |
| 142 | matching_alquileres_ejecutar_batch | Batch matching alquileres |
| 143 | fix_aplicar_matches_campos_bloqueados | Fix aplicar matches respetando campos_bloqueados |
| 144 | fix_excluidas_con_proyecto | Fix excluidas con proyecto asignado |
| 145 | bajar_umbral_pendientes_55 | Bajar umbral pendientes a 55% |
| 146 | matching_alquileres_trigram_v2 | Matching alquileres con trigram v2 |
| 147 | buscar_unidades_alquiler | RPC feed alquileres con mapeo microzonas |
| 147b | trigger_asignar_zona_gps | Trigger auto-asignar zona desde GPS |
| 148 | fix_agente_alquiler | Fix datos agente en alquiler |
| 148b | fix_filtros_alquiler | Fix filtros búsqueda alquiler |
| 149 | orden_fecha_publicacion_alquiler | Orden por fecha publicación en alquiler |
| 150 | filtro_dormitorios_min_alquiler | Filtro dormitorios mínimo alquiler |
| 151 | amenidades_fallback_proyecto_alquiler | Fallback amenidades proyecto en alquiler |
| 152 | fix_status_alquiler_incluir_actualizado | Incluir status actualizado en búsqueda alquiler |
| 153 | dormitorios_multiselect_alquiler | Multiselect dormitorios en alquiler |
| 154 | leads_alquiler | Tabla leads_alquiler + RPC |
| 155 | permisos_anon_alquileres | Permisos anon para feed alquileres |
| 156 | filtro_parqueo_alquiler | Filtro parqueo en alquiler |
| 157 | fix_whatsapp_remax_alquiler | Fix WhatsApp Remax en alquiler |
| 158 | bien_inmuebles_fotos_alquiler | Branch fotos + agente Bien Inmuebles en buscar_unidades_alquiler() |
| 159 | fotos_remax_merge_alquiler | Fotos Remax en merge alquiler |
| 160 | alquiler_offset | OFFSET en buscar_unidades_alquiler() para paginación server-side |
| 161 | agente_nombre_c21_alquiler | Nombre agente C21 en alquiler |
| 162 | leads_alquiler_es_test | Campo es_test en leads_alquiler |
| 163 | alquiler_filtro_150_dias | Reducir filtro antigüedad alquiler de 180→150 días |
| 164 | status_expirado_stale | Status `expirado_stale` (no cuenta absorción) + limpiar 4 props >150d |
| 165 | fix_discovery_alquiler_fecha | Fix fecha_discovery BI (preservar si sin fecha_publicacion) + retroactivo |
| 166 | fix_trigger_matchear_alquiler_numeric | Fix casteo ::integer→::numeric en confidence/tier del trigger matching alquiler |
| 167 | precio_normalizado_helper | Helper `precio_normalizado(precio_usd, tipo_cambio_detectado)` para normalizar TC paralelo |
| 168 | normalizar_precios_tc_paralelo | Reescribir buscar_unidades_reales, vistas, snapshot, razón fiduciaria usando precio_normalizado() |
| 169 | drop_overload_discovery_alquiler | Dropear overload huérfano TEXT de registrar_discovery_alquiler() |
| 174 | fix_config_global_tc_duplicada | Desactivar claves MAYÚSCULAS duplicadas en config_global (TC stale) |
| 175 | fix_normalizarPrecioUSD_caso2 | Doc: fix CASO 2 en extractor n8n (no multiplica USD × TC) |
| 176 | correccion_precios_inflados | Corregir precio_usd inflado en 85 props + candados + 4 anticréticos |
| 177 | correccion_6_props_pendientes | Corregir precio_usd inflado en 6 props de revisión manual |
| 178 | correccion_26_props_infladas_villa_brigida | Corregir 26 props CASO 2 + candados + excluir ID 1105 + normalizar Villa Brígida |
| 179 | limpieza_9_props_sin_datos | Inactivar 2 + excluir 2 + re-enrichment 5 props sin descripción |
| 180 | duplicados_sky_equinox | Marcar 7 Sky Equinox (1000-1004, 1049, 1050) como duplicado_de = 999 |
| 181 | excluir_props_fuera_zona | Nuevo enum `excluida_zona` + excluir 9 props con GPS fuera de polígonos |
| 182 | normalizar_zonas_problematicas | Corregir zona/microzona 13 props (PostGIS) + excluir 45 props fuera de polígonos |
| 183 | corregir_equipetrol_centro_restantes | Corregir zona/microzona 11 props restantes con 'Equipetrol Centro' → 0 activas |
| 184 | renombrar_zonas_display | Renombrar polígonos a nombres display (Faremafu→Equipetrol Oeste, etc.) + retroactivo en props/proyectos |
| 185 | crear_get_zona_by_gps | Función `get_zona_by_gps(lat, lon)` — PostGIS point-in-polygon para editor de proyectos |
| 186 | normalizar_zonas_residuales | Normalizar microzona='Equipetrol'→'Equipetrol Centro' (28), zona='Villa Brígida'→sin tilde (1), excluir 6 alquiler sin zona, fix 2 microzona NULL + fix v_metricas_mercado (agregar status=completado) + fix buscar_unidades_reales (ILIKE→exact match zona/microzona) |
| 187 | fix_aplicar_matches_sobrescribir_nombre | Fix `aplicar_matches_aprobados()` v3.1: SIEMPRE copiar `pm.nombre_oficial` a `nombre_edificio` (excepto candado). Antes solo copiaba cuando NULL → basura regex se preservaba |
| 188 | limpiar_aire_acondicionado_fantasma | Limpiar A/C fantasma: regex `/ac/i` matcheaba "espacios", "ubicación", etc. 440 props afectadas (80%). Fix: remover de equipamiento donde desc no menciona A/C |
| 188b | create_llm_enrichment_test_results | Tabla temporal para resultados de test LLM enrichment (colisión de numeración con 188, renombrada a 188b) |
| 189 | fix_fecha_discovery_alquiler_bi | Preservar fecha_discovery alquiler para Bien Inmuebles |
| 190 | fix_multiproyecto_condado_vi | Corregir es_multiproyecto=false para Condado VI (IDs 53, 423, 821) + candado |
| 191 | fix_multiproyecto_falsos_positivos | Corregir 42 falsos positivos de es_multiproyecto + candados. **Requiere deploy de extractor C21 v3.0** (ver abajo) |
| 192 | duplicados_lofty_island | Marcar 7 duplicados same-source en Lofty Island (mismo agente + dorms + área ±2m²). Desempate: fecha > fotos > ID mayor |
| 193 | vistas_mercado | Crear `v_mercado_venta` y `v_mercado_alquiler` — vistas con filtros canónicos + campos calculados (precio_m2, precio_norm, dias_en_mercado) |
| 194 | snapshot_absorcion_v2 | Refactorizar `snapshot_absorcion_mercado()` para usar vistas canónicas. Agregar `filter_version` a `market_absorption_snapshots` (v1=legacy, v2=canónico). Históricos marcados v1. Nota: loop 0..3, props 4+ dorms no capturadas (~5) |
| 195 | merge_consume_llm_output | **Merge v2.4.0 — Fase C LLM.** Merge consume `llm_output` de enrichment. Dormitorios: candado→LLM(alta)→discovery→regex. Estado construcción: LLM con protección (nunca degrada entrega_inmediata→preventa). Nombre edificio: LLM como fallback. solo_tc_paralelo y es_multiproyecto: LLM directo. Trazabilidad: llm_version, llm_model |
| 196 | fix_buscar_unidades_alquiler_precio_usd | Fix filtro `buscar_unidades_alquiler()`: `precio_mensual_bob IS NOT NULL` → `precio_mensual_usd > 0`. Alinea con `v_mercado_alquiler`. 1 prop afectada (id 1156, BOB sin USD) |
| 197 | merge_consume_llm_tipo_cambio | **Merge v2.5.0 — LLM tipo_cambio_detectado.** Cadena: candado → regex específico → LLM (alta, upgrade-only) → existing protected → fallback. Protección degradación (nunca no_especificado sobre paralelo/oficial). Candado check nuevo para TC. ~84 props se benefician. Auto-candado en admin editor al cambiar TC |
| 198 | fix_buscar_unidades_reales_status_precio | Fix defensivo `buscar_unidades_reales()`: status `IN ('completado', 'actualizado')` + `precio_normalizado() > 0` en WHERE principal, 4 CTEs y 2 subqueries. 0 props afectadas al momento del deploy |
| 199 | backfill_snapshots_absorcion |
| 200 | snapshot_zona_pending | **Snapshot por zona + tracking pending.** Columnas nuevas: `zona TEXT DEFAULT 'global'`, `venta_pending_30d INTEGER`. Unique constraint cambia de `(fecha, dormitorios)` a `(fecha, dormitorios, zona)`. Función genera ~26 filas/día: 4 globales (dorms 0-3) + ~22 por zona. Alquiler solo en filas globales. **Hotfix 24 Mar:** agregar filtros canónicos faltantes (duplicado_de, es_multiproyecto, tipo_propiedad_original, zona NOT NULL, 300d cutoff) — sin ellos activas inflaba 347 vs 308 reales | **Backfill absorción histórica.** Verificador venta excluía C21 (`AND fuente = 'remax'`), dejando ~131 props stuck en `inactivo_pending`. Fix: verificador v5.1 eliminó filtro de fuente + confirmó las 131 C21 represadas. Backfill: función temporal `backfill_snapshot_absorcion(fecha)` recalculó absorción para las 40 fechas históricas (12 Feb — 23 Mar). Solo tocó: `venta_absorbidas_30d`, `venta_tasa_absorcion`, `venta_meses_inventario`, `absorbidas_ticket_promedio`, `absorbidas_usd_m2`. Resultado: absorción 2 dorms pasó de 0-12% → 20-31% (C21 representaba >50% de las absorciones). Función temporal droppeada post-ejecución |
| 201 | merge_nombre_edificio_llm_hibrido | **Merge v2.6.0 — nombre_edificio LLM híbrido.** Helpers: `_is_nombre_edificio_sospechoso()`, `_nombre_existe_en_proyectos()`. Prioridad: candado → LLM alta (si disc/regex es basura O no matchea PM) → discovery → enrichment → LLM fallback. Fix 10/12 props sin match. Tasa error LLM ~8.6%, mitigada por validación contra PM |
| 202 | fix_zona_legacy_alquiler | **Fix zona legacy alquileres.** CASO 3 del trigger `trigger_asignar_zona_alquiler` ahora detecta zonas no canónicas (consulta dinámica vs `zonas_geograficas`), no solo NULL. Backfill 17 props `zona='Equipetrol'` + nulls. Solo afecta alquileres |
| 203 | fix_vista_alquiler_precio_mensual | **Fix `v_mercado_alquiler` precio_mensual.** Antes: `precio_mensual_usd AS precio_mensual` (confiaba en valor pre-calculado, podía estar mal — ej: ID 1146 tenía USD 71.84 con TC implícito 48.72). Ahora: `ROUND(precio_mensual_bob / 6.96, 2)::numeric(10,2)` — derivado de BOB (fuente de verdad). Fix dato corrupto ID 1146. Snapshots futuros corregidos, históricos intactos. Frontend no afectado (usa `precio_mensual_bob` directo) |
| 204 | excluir_fuera_de_zona | **Exclusión sistémica fuera de polígonos.** Triggers venta + alquiler ahora marcan `status='excluida_zona'` cuando GPS cae fuera de todos los polígonos y no hay proyecto master con zona válida. Backfill ~16 props existentes. Excepción: props en borde con proyecto master con zona válida no se excluyen |
| 205 | fix_descripcion_alquiler | **Fix descripción en `buscar_unidades_alquiler()`.** COALESCE no incluía `llm_output.descripcion_limpia` — único path donde alquiler almacena descripciones. Venta las tiene en root de enrichment, alquiler solo en llm_output. 1 línea agregada al COALESCE |
| 206 | leads_alquiler_debounce | **Debounce leads alquiler.** Agrega `session_id` y `es_debounce` a `leads_alquiler`. Endpoint marca `es_debounce=true` si mismo session_id generó lead en <5s. Métricas filtran `es_debounce=false` |
| 207 | vista_alquiler_filtro_150d | **Filtro 150d en `v_mercado_alquiler`.** Vista pre-aplica `dias_en_mercado <= 150` para excluir inventario estancado |
| 208 | leads_alquiler_bot_filter | **Filtro bots Meta + utm_source.** Agrega `user_agent`, `es_bot`, `utm_source` a `leads_alquiler`. Endpoint detecta bots Meta por user-agent (6 patterns) y captura utm_source para distinguir orgánico vs paid. Lead 104 marcado como bot |
| 209 | fix_agente_c21_alquiler | **Fix agente C21 en `buscar_unidades_alquiler()`.** COALESCE chains no incluían formato C21 (`asesorNombre`, `telefono`, `whatsapp` en `datos_json_discovery`). 103 props C21 alquiler sin datos de broker. Remax/BI ya funcionaban. 3 fallbacks agregados, 0 re-enrichment necesario |
| 210 | leads_alquiler_utm_completo | **UTM completo en leads_alquiler.** Agrega `utm_content` (pieza) y `utm_campaign` a `leads_alquiler`. Complementa migración 208 (utm_source). Permite cruzar leads BD por pieza vs GA4. Corte: datos confiables desde fecha de deploy |
| 211 | fix_absorcion_alinear_filtros | **Fix absorción — filtros alineados + nuevas métricas.** (1) Inventario activo: quitar filtro 300d (mide mercado real, no UX). (2) Absorbidas/pending: alinear filtros calidad (duplicado_de, multiproyecto, parqueo, zona) + `primera_ausencia_at IS NOT NULL` (excluir curación admin). (3) `venta_usd_m2` = MEDIANA. (4) Columnas nuevas: `venta_absorbidas_entrega`, `venta_absorbidas_preventa`, `roi_amoblado`, `roi_no_amoblado`, `anos_retorno_amoblado`, `anos_retorno_no_amoblado`. (5) Backfill v2: recalcula absorbidas con filtros correctos. (6) `filter_version = 3`. NO toca vistas ni frontend |
| 212 | buscar_unidades_exponer_tipo_cambio | **Exponer `tipo_cambio_detectado` en `buscar_unidades_reales()`.** Agrega columna de salida para que Simon Advisor flagee TC no confirmado. DROP + CREATE (Postgres no permite cambiar return type con REPLACE). Función exportada de producción con `pg_get_functiondef()`. Zero cambios en lógica/filtros, callers existentes ignoran la columna nueva |
| 213 | buscar_unidades_alquiler_filtro_proyecto | **Filtro por proyecto en `buscar_unidades_alquiler()`.** |
| 214 | merge_alquiler_guardrail_monoambiente | **Guardrail monoambiente en merge alquiler.** LLM clasificaba monos como 1D |
| 215 | fix_registrar_discovery_limpiar_ausencia | **Fix verificador falsos positivos.** `registrar_discovery()` no limpiaba `primera_ausencia_at` al re-encontrar props → verificador auto-confirmaba con fecha stale (semanas). Fix: `primera_ausencia_at = NULL, razon_inactiva = NULL` en PASO 3. Cleanup: 59 props activas con datos stale. Cero impacto absorción (conjuntos disjuntos). Root cause del bug 48% falsos positivos Remax |
| 216 | backfill_tipo_cambio_detectado_null | **Backfill `tipo_cambio_detectado` NULL.** 83 props activas (77 de merge pre-v2.4 + 6 post). Aplica lógica merge v2.5+: LLM upgrade con confianza alta. 28→oficial, 1→paralelo (precio corregido), 54→no_especificado. Sin riesgo |
| 217 | fix_gps_false_positives_bulk | Fix GPS falsos positivos bulk |
| 218 | gps_matching_penalize_dense_zones | GPS matching penalizar zonas densas |
| 219 | buscar_unidades_simple_tc_sospechoso | **TC sospechoso en `buscar_unidades_simple()`.** Agrega `tc_sospechoso BOOLEAN` al RETURN TABLE. CTE `medianas_tc` calcula mediana $/m² por grupo (zona+dorms+estado) con ≥3 props TC conocido. Flag = true si `tipo_cambio_detectado='no_especificado'` Y precio/m² >30% debajo de mediana. LEFT JOIN para no afectar props sin grupo. ~8 props afectadas (2.5% del feed) |
| 220 | advisor_property_snapshot | **Snapshot diario para Simon Advisor.** Tabla `advisor_property_snapshot` (PK: snapshot_date+property_id), función `generate_advisor_snapshot()` idempotente, pg_cron a 9:15 AM. Pre-computa: rankings edificio/tipología por $/m2, posición mercado segment-aware (preventa vs entrega), yield alquiler (zona+dorms con fallback zona). ~320 filas/día. Doble uso: cache Advisor (0.5s vs 5s) + serie histórica (tracking precios, absorción, plusvalía) |
| 221 | casas_terrenos_schema | **Casas y Terrenos Fase 1.** 3 columnas nuevas (`area_terreno_m2`, `frente_m`, `fondo_m`). Filtro `tipo_propiedad_original NOT IN ('casa','terreno','lote')` en 5 funciones de matching (`generar_matches_por_nombre/url/fuzzy/trigram/gps`) para skipear casas/terrenos que no tienen `proyectos_master`. PRD: `docs/backlog/CASAS_TERRENOS_PRD.md` |
| 222 | auditoria_snapshots_columnas_faltantes | **Auditoría v3.1 — 22 columnas nuevas en `auditoria_snapshots`.** Alinea la tabla con lo que el workflow ya calculaba pero no persistía: alquiler (8), LLM enrichment venta (4), calidad extendida (2: `sin_precio`, `pct_huerfanas`), proyectos con/sin desarrollador (3) y casas/terrenos v3.1 (5: `ct_completadas`, `ct_creadas_24h`, `ct_excluida_zona`, `discovery_casas_terrenos_ok`, `enrichment_casas_terrenos_ok`). Todas con `IF NOT EXISTS` idempotentes |
| 223 | modal_whatsapp_alquiler | **Modal captura WhatsApp en `/alquileres`.** 6 puntos de entrada (cards, sheet, map, comparativo). Tabla `whatsapp_modal_events` con `numero_whatsapp`, `propiedad_id`, `accion`, `timestamp`. Tracking de envío/cancelación |
| 224 | leads_alquiler_rls | **RLS en `leads_alquiler` (PII).** ENABLE RLS + policy SELECT para `claude_readonly`. anon sin acceso. Pre-requisito: `api/lead-alquiler.ts` debe usar `SUPABASE_SERVICE_ROLE_KEY` (bypassea RLS). Cierra hallazgo crítico del Supabase linter (`sensitive_columns_exposed` + `rls_disabled_in_public`) |
| 225 | rename_backups_to_trash | **Renames `_trash_*` programado para drop.** 9 tablas backup renombradas a `_trash_*` antes del DROP definitivo (29 abr). Estrategia 2-etapas: rename reversible + monitorear logs Vercel/n8n 7 días → DROP irreversible si no hay errores |
| 226 | buscar_acm | **RPC `buscar_acm(propiedad_id)` para Simon Broker S1.** Retorna ACM completo: precio/m² vs cohort (mediana, p25, p75) + percentil, días en mercado vs mediana, ranking dentro de torre, rango de valor estimado, yield si cohort alquiler ≥5, histórico precios. Cohort = misma zona + dorms + estado_construccion. Alimenta ACM inline en sheet del modo broker |
| 227 | tc_sospechoso_umbral_28pct | **TC sospechoso umbral 28%.** Cambia threshold `precio_usd >30% debajo mediana grupo` → `>28%`. Más sensible para detectar casos donde TC paralelo no fue declarado. Solo afecta `buscar_unidades_simple()` |
| 228 | broker_shortlists | **Tablas Simon Broker S2 — shortlists compartibles.** `broker_shortlists` (broker_slug, hash UNIQUE, cliente_nombre, cliente_telefono, mensaje_whatsapp, is_published, view_count, last_viewed_at, archived_at) + `broker_shortlist_items` (shortlist_id FK, propiedad_id FK, tipo_operacion, comentario_broker, orden). RLS habilitado sin policy anon (PII). Hash generado server-side con `randomBytes(8).base64url`. Trigger updated_at. Soporta items mixtos venta+alquiler (preparado Fase 2) |
| 229 | broker_shortlist_items_precio_snapshot | **Snapshot RAW de precio en items.** Columna `precio_usd_snapshot NUMERIC NULL`. Guardada al INSERT desde `propiedades_v2.precio_usd` (raw). Detecta cuándo el agente del listing cambió el precio en el portal vs cuándo solo se movió el TC paralelo. Items pre-migración con NULL |
| 229* | buscar_unidades_alquiler_area_filtro | **Filtro área min/max en `buscar_unidades_alquiler()`.** DROP + CREATE: agrega params `p_area_total_min` y `p_area_total_max`. Habilita deep-link filters via query params en `/alquileres`. Archivos en `sql/migrations/229_buscar_unidades_alquiler_area_filtro{,_ROLLBACK}.sql` + `229_DRY_RUN_copiar_a_supabase.sql`. **Colisión de número con broker shortlist snapshot**: ambos archivos coexisten en el repo con prefix `229_*`, se aplican de forma independiente en Supabase Studio. Convención de sufijo "b" disponible si se necesita desambiguar a futuro (ver 115b/140b/147b) |
| 230 | broker_shortlist_items_norm_snapshot | **Snapshot NORMALIZADO de precio en items.** Columna `precio_norm_snapshot NUMERIC NULL`. Guardada al INSERT desde `v_mercado_venta.precio_usd` (normalizado). Se usa para mostrar "Antes era $X" en el badge del cliente con el valor que vio originalmente. Combinado con migración 229 distingue 2 tipos de cambio: agente cambió precio (badge verde/gris) vs TC paralelo se movió (badge azul) |
| 231 | simon_brokers | **Tabla `simon_brokers` — MVP Simon Broker S3 opción mini.** Reemplaza archivo hardcoded `lib/brokers-demo.ts`. Columnas: slug UNIQUE, nombre, telefono, foto_url, inmobiliaria, status ('activo'/'pausado'/'inactivo'), fecha_alta, fecha_proximo_cobro, notas. RLS deny-all (acceso via API server-side con service_role). Trigger updated_at. Seed: `demo` + `abel-flores` (Abel Antonio Flores Nava, RE/MAX Legacy, +59178519485). Habilita admin UI `/admin/simon-brokers` para activar brokers en 30s durante reunión. **OJO:** NO confundir con tabla `brokers` legacy (captación B2B, no usada). Ver CLAUDE.md regla 14 |
| 232 | fix_trigger_zona_alquiler | **Fix `trigger_asignar_zona_alquiler`.** El trigger seteaba `zona=zg.zona_general='Equipetrol'` (no canónico) rompiendo `zona_valida`. Fix: usar `zg.nombre` en ambas columnas (alineado con trigger venta). Resuelve discovery C21/Remax/BI alquiler. Smoke test OK con 3 GPS problemáticos. Commit `219ffc1` |
| 233 | broker_shortlist_items_bob_snapshot | **Snapshot BOB de alquiler — Fase 2 Simon Broker.** Columna `precio_mensual_bob_snapshot NUMERIC NULL` en `broker_shortlist_items`. En alquiler el BOB es fuente de verdad (regla 10 CLAUDE.md), no hay split raw/norm como en venta (migraciones 229/230) — alcanza 1 snapshot. Items pre-migración y items de venta quedan NULL. Alimenta badge "↓ Bajó de Bs X" / "↑ Antes Bs X" en `/b/[hash]` cuando el agente cambió precio (diff >1%) |
| 234 | broker_shortlist_hearts | **Tabla `broker_shortlist_hearts` — feedback cliente → broker (Fase 2).** `(id, shortlist_id FK→broker_shortlists ON DELETE CASCADE, propiedad_id FK→propiedades_v2 ON DELETE CASCADE, created_at)` con `UNIQUE(shortlist_id, propiedad_id)`. RLS activo sin policy anon/auth — todo acceso por API service_role. Sin `cliente_id`/fingerprint: "cliente del hash" es sujeto único para MVP. API público `/api/public/shortlist-hearts` (GET/POST/DELETE) valida que la propiedad pertenezca a los items antes de escribir. GET `/api/broker/shortlists/:id` devuelve `heartedPropertyIds[]` para que el editor del broker muestre "N de M marcadas" |
| 235 | shortlist_protection | **Protección shortlists v1 — caps + expiración + watermark.** Defensa core contra canibalización (broker convirtiendo /b/[hash] en mini-portal público). `broker_shortlists` +5 columnas: `max_views INT NOT NULL DEFAULT 20`, `current_views INT NOT NULL DEFAULT 0`, `expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+30d)` (backfill desde `created_at+30d`), `status TEXT CHECK (active|expired|view_limit_reached|suspended)`, `first_viewed_at`. Tabla nueva `broker_shortlist_views` (eventos de visita: fingerprint cookie/IP+UA, ip_hash sha256, ua, referrer, is_unique) con índice compuesto `(shortlist_id, fingerprint)` para uniqueness check en SSR. RLS habilitado + policy `claude_readonly_select`. `simon_brokers.terms_accepted_at TIMESTAMPTZ` (backfill NOW() para 2 brokers existentes — acuerdos verbales pre-feature). Lever de monetización Plan Pro futuro: cap 20/30d del Plan Inicial (Bs 350/mes) es el dolor que justifica upgrade. **Invariante editorial**: marca SIEMPRE Simón, NUNCA white-label. Ver `docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md` |
| 236 | demo_broker_shortlist | **Sistema demo público para prospección.** Crea row real en `simon_brokers` con `slug='demo'` (nombre `[Tu Nombre]`, telefono +59176308808 → founder, status='activo') y row en `broker_shortlists` con `hash='demo'` (max_views=999999, expires_at=2099, status='active') + 8 items curados de Equipetrol (Spazios, Calle H, Sky Moon, Sky Lumiere, Impera, Legendary, Stone 2, Luciana). Habilita `/broker/demo`, `/broker/demo/alquileres`, `/b/demo` con sanitización server-side de `agente_*` (lib/demo-mode.ts) e intercept de WA clicks → modal educativo. Idempotente. |
| 237 | broker_prospection | **Tabla `broker_prospection` + RPC `populate_broker_prospection()` para outreach.** Sistema interno del founder en `/admin/prospection` para gestionar contacto a captadores de Equipetrol. Tabla `(telefono PK, nombre, agencia, tier 1\|2\|3, props_activas, props_recientes_90d, status pending\|msg1_sent\|msg2_sent\|msg3_sent, fecha_msg1/2/3, notas)`. RLS deny-all. Tier por volumen de venta: T1=1-5 props, T2=6-10, T3=11+. RPC agrega desde `buscar_unidades_simple` agrupado por `agente_telefono` normalizado, hace UPSERT preservando status/fechas/notas. Distribución actual: T1=169 brokers, T2=6, T3=2 (177 total). |
| 238 | broker_prospection_antiguedad | **Antigüedad de publicaciones en prospección.** Agrega `dias_pub_min INTEGER` (publicación más reciente del broker) y `dias_pub_max` (más antigua) a `broker_prospection`. Reemplaza la RPC `populate_broker_prospection()` con MIN/MAX(dias_en_mercado) por broker. Habilita ordenar por antigüedad en `/admin/prospection` para priorizar brokers activos hoy (publicación reciente = lead caliente). Idempotente: re-run actualiza los 177 existentes. |

**⚠️ Post-migración 191 — Deploy requerido en n8n:**
La migración 191 corrige datos existentes pero el extractor C21 sigue generando falsos positivos.
Copiar `detectarMultiproyecto()` v3.0 al nodo **"Extractor Century21 v16.5"** dentro del
workflow **Flujo B Processing v3.0** (modulo_1). Ver `docs/extractores/DEPLOY_EXTRACTOR_C21_v3.md`.
