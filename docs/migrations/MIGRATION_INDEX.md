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
| 189 | fix_fecha_discovery_alquiler_bi | Preservar fecha_discovery alquiler para Bien Inmuebles |
| 190 | fix_multiproyecto_condado_vi | Corregir es_multiproyecto=false para Condado VI (IDs 53, 423, 821) + candado |
| 191 | fix_multiproyecto_falsos_positivos | Corregir 42 falsos positivos de es_multiproyecto + candados. **Requiere deploy de extractor C21 v3.0** (ver abajo) |
| 192 | duplicados_lofty_island | Marcar 7 duplicados same-source en Lofty Island (mismo agente + dorms + área ±2m²). Desempate: fecha > fotos > ID mayor |

**⚠️ Post-migración 191 — Deploy requerido en n8n:**
La migración 191 corrige datos existentes pero el extractor C21 sigue generando falsos positivos.
Copiar `detectarMultiproyecto()` v3.0 al nodo **"Extractor Century21 v16.5"** dentro del
workflow **Flujo B Processing v3.0** (modulo_1). Ver `docs/extractores/DEPLOY_EXTRACTOR_C21_v3.md`.
