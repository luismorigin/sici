# Catálogo de Funciones SQL — SICI

> 141 funciones custom únicas en producción (144 con overloads; schema public, excluye extensiones PostGIS/pg_trgm/fuzzystrmatch)
> 43 archivos canónicos en `sql/functions/` (13 subdirectorios)
> Actualizado: 28 Feb 2026 (auditoría cruzada BD vs catálogo)

**Convención:** Las funciones con archivo canónico (`sql/functions/...`) tienen la definición actualizada exportada con `pg_get_functiondef()`. Las que solo indican migración fueron creadas/modificadas ahí y NO tienen archivo canónico.

---

## Discovery (3 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `registrar_discovery(url, fuente, ...)` | `discovery/registrar_discovery.sql` | — |
| `determinar_status_post_discovery(id, status, cambios)` | `discovery/funciones_auxiliares_discovery.sql` | — |
| `get_discovery_value(campo, discovery, fuente)` | `discovery/funciones_auxiliares_discovery.sql` | — |

*Nota: `get_discovery_value_integer()` y `get_discovery_value_numeric()` también en funciones_auxiliares.*

## Enrichment (3 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `registrar_enrichment(data)` | `enrichment/registrar_enrichment.sql` | — |
| `registrar_enrichment_venta_llm(id, datos_llm, ...)` | `enrichment/registrar_enrichment_venta_llm.sql` | — (deploy manual 2026-03-17) |
| `registrar_enrichment_alquiler(id, datos_llm, ...)` | `alquiler/registrar_enrichment_alquiler.sql` | 137 |

## Merge (4 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `merge_discovery_enrichment(id)` | `merge/merge_discovery_enrichment.sql` | 195 |
| `merge_discovery_enrichment(identificador text)` | `merge/merge_discovery_enrichment.sql` | 195 |
| `ejecutar_merge_batch(limite)` | — | 001 |
| `merge_alquiler(id)` | `alquiler/merge_alquiler.sql` | 159 |

| `estadisticas_merge()` | — | — |
| `calcular_discrepancia_exacta(p_valor_discovery, p_valor_enrichment, p_campo)` | — (helper interno merge) | — |
| `calcular_discrepancia_porcentual(p_valor_discovery, p_valor_enrichment, p_campo)` | — (helper interno merge) | — |
| `registrar_discrepancia_cambio(p_campo, p_valor_anterior, p_valor_nuevo)` | — (helper interno merge) | — |

*Helpers canónicos: `funciones_auxiliares_merge.sql`, `funciones_helper_merge.sql`*

## Matching Venta (11 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `matching_completo_automatizado()` | `matching/matching_completo_automatizado.sql` | 024 |
| `generar_matches_fuzzy()` | `matching/generar_matches_fuzzy.sql` | — |
| `generar_matches_gps()` | `matching/generar_matches_gps.sql` | — |
| `generar_matches_gps_limpio()` | — | — |
| `generar_matches_por_nombre()` | `matching/generar_matches_por_nombre.sql` | — |
| `generar_matches_por_url()` | `matching/generar_matches_por_url.sql` | — |
| `generar_matches_por_url_mejorado()` | — | — |
| `generar_matches_trigram()` | — | 024 |
| `aplicar_matches_aprobados()` | `matching/aplicar_matches_aprobados.sql` | — |
| `aplicar_matches_revisados(ids_aprobados, ids_rechazados)` | `matching/funciones_rpc_matching.sql` | 143 |
| `corregir_proyecto_matching(sugerencia_id, ...)` | `matching/funciones_rpc_matching.sql` | — |
| `match_propiedad_a_proyecto_master(p_latitud, p_longitud, p_nombre_edificio)` | — | — |
| `registrar_alias_desde_correccion()` | — | — |

## Matching Alquiler (2 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `matchear_alquiler(id)` | `matching/matchear_alquiler.sql` | 146 |
| `matching_alquileres_batch()` | `matching/matchear_alquiler.sql` | 142 |

## Discovery Alquiler (1 función)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `registrar_discovery_alquiler(url, fuente, ...)` | `alquiler/registrar_discovery_alquiler.sql` | 169 |

## Query Layer / Búsqueda (6 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `buscar_unidades_reales(filtros)` | `query_layer/buscar_unidades_reales.sql` | 168 |
| `buscar_unidades_simple(filtros)` | `query_layer/buscar_unidades_simple.sql` | — (deploy manual 2026-03-18, feed /ventas) |
| `buscar_unidades_alquiler(filtros)` | `query_layer/buscar_unidades_alquiler.sql` | 163 |
| `buscar_unidades_broker(filtros)` | `broker/buscar_unidades_broker.sql` | 101 |
| `buscar_unidades_con_amenities(amenities, filtros)` | — | 069 |
| `buscar_proyecto_fuzzy(nombre, umbral, limite)` | — | 022 |
| `buscar_broker_por_telefono(tel)` | — | 075 |

## Análisis de Mercado / Valuación (8 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `calcular_posicion_mercado(precio_m2, zona, dorms)` | `query_layer/calcular_posicion_mercado.sql` | 168 |
| `generar_razon_fiduciaria(propiedad_id)` | `query_layer/generar_razon_fiduciaria.sql` | 168 |
| `generar_resumen_fiduciario(proyecto, ...)` | — | 025 |
| `analisis_mercado_fiduciario(filtros)` | — | 030 |
| `calcular_precio_m2_unidad()` | — | — |
| `calcular_precio_m2_virtual()` | — | — |
| `explicar_precio(id)` | — | — |
| `contar_bajadas_precio(fecha_hoy, fecha_ayer)` | — | 090 |

## Snapshots (2 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `snapshot_absorcion_mercado()` | `snapshots/snapshot_absorcion_mercado.sql` | 168 |
| `guardar_snapshot_precios()` | — | — |

## HITL / Supervisión (13 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `procesar_decision_sin_match(prop_id, accion, proyecto_id TEXT, ...)` | `hitl/procesar_decision_sin_match.sql` | 010 |
| `procesar_decision_sin_match(prop_id, accion, proyecto_id INT, ...)` | `hitl/procesar_decision_sin_match.sql` | 010 |
| `procesar_accion_excluida(prop_id, accion, ...)` | `hitl/procesar_accion_excluida.sql` | 023 |
| `procesar_validacion_auto_aprobado(sug_id, accion, ...)` | `hitl/procesar_validacion_auto_aprobado.sql` | 113 |
| `exportar_propiedades_excluidas()` | `hitl/exportar_propiedades_excluidas.sql` | 023 |
| `detectar_razon_exclusion(id)` | `hitl/detectar_razon_exclusion.sql` | 023 |
| `detectar_razon_exclusion_v2(id, filtros)` | `hitl/detectar_razon_exclusion.sql` | 023 |
| `obtener_pendientes_para_sheets()` | — (stale, era Google Sheets) | — |
| `obtener_sin_match_para_exportar(limit)` | — | 009 |
| `contar_auto_aprobados_sin_validar()` | — | — |
| `obtener_auto_aprobados_para_revision(p_metodo, p_confianza_min, ...)` | — | — |
| `registrar_exportacion_sin_match(p_propiedad_ids)` | — | — |
| `sync_sin_match_on_proyecto_assigned()` | — (trigger) | — |

## Proyectos / Admin (9 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `inferir_datos_proyecto(id_proyecto)` | `admin/inferir_datos_proyecto.sql` | 087 |
| `propagar_proyecto_a_propiedades(id_proyecto, ...)` | `admin/propagar_proyecto_a_propiedades.sql` | 128 |
| `propagar_proyecto_con_apertura_temporal(id_proyecto, ...)` | — | 129 |
| `sincronizar_propiedad_desde_proyecto(id_prop, id_proy, ...)` | `admin/sincronizar_propiedad_desde_proyecto.sql` | 108 |
| `crear_proyecto_desde_sugerencia(nombre, prop_id, sug_id, ...)` | — | 007 |
| `asignar_proyecto_existente(sug_id, prop_id, proy_id)` | — | 018 |
| `crear_desarrollador(nombre, ...)` | — | 088 |
| `buscar_desarrolladores(busqueda, limite)` | — | 088 |
| `detectar_proyectos_sin_desarrollador()` | — | — |

## Broker B2B (5 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `calcular_score_broker(id)` | `broker/calcular_score_broker.sql` | 092 |
| `actualizar_score_broker(id)` | `broker/calcular_score_broker.sql` | 092 |
| `verificar_broker(broker_id, accion, ...)` | `broker/verificar_broker.sql` | 075 |
| `registrar_contacto_broker(lead_id, prop_id, ...)` | `broker/registrar_contacto_broker.sql` | 070 |
| `consumir_credito_cma(broker_id)` | — | 112 |
| `otorgar_credito_cma_por_calidad()` | — | — |

## Leads / CRM (6 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `crear_lead_inicial(nombre, whatsapp, ...)` | — | 020 |
| `crear_lead_con_feedback(nombre, whatsapp, ...)` | — | 071 |
| `registrar_lead_mvp(nombre, whatsapp, ...)` | — | 020 |
| `registrar_interes_propiedad(lead_id, prop_id)` | — | 020 |
| `finalizar_formulario(lead_id, formulario, tiempo)` | — | 021 |
| `confirmar_y_generar_guia(lead_id, ...)` | — | 025 |

## TC Dinámico (5 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `actualizar_tipo_cambio(tipo, valor, ...)` | `tc_dinamico/modulo_tipo_cambio_dinamico.sql` | 014 |
| `registrar_consulta_binance(tc_sell, tc_buy, ...)` | `tc_dinamico/modulo_tipo_cambio_dinamico.sql` | 014 |
| `validar_tc_binance(tc_nuevo, tipo)` | `tc_dinamico/modulo_tipo_cambio_dinamico.sql` | 014 |
| `obtener_tc_actuales()` | `tc_dinamico/modulo_tipo_cambio_dinamico.sql` | 014 |
| `ver_historial_tc(limite, tipo)` | `tc_dinamico/modulo_tipo_cambio_dinamico.sql` | 014 |

## Análisis / Valuación — adicionales

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `razon_fiduciaria_texto(p_propiedad_id)` | — | — |

## Workflow Tracking (1 función)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `registrar_ejecucion_workflow(p_workflow_name, p_status, ...)` | — | — |

## Auditoría / Historial (1 función)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `registrar_cambio_propiedad(p_propiedad_id, p_usuario_tipo, ...)` | — | — |

## GIS (1 función)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `poblar_zonas_batch()` | — | — |

## Vistas Materializadas (1 función)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `refresh_v_amenities_proyecto()` | — | — |

## Helpers / Normalización (13 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `precio_normalizado(precio_usd, tc_detectado)` | `helpers/precio_normalizado.sql` | 167 |
| `campo_esta_bloqueado(campos_bloqueados, campo)` | `helpers/campo_esta_bloqueado.sql` | 115 |
| `_is_campo_bloqueado(candados, campo)` | `helpers/campo_esta_bloqueado.sql` | 115 |
| `normalize_nombre(texto)` | `helpers/normalize_nombre.sql` | 022 |
| `normalizar_nombre_edificio(texto)` | `helpers/normalize_nombre.sql` | 022 |
| `normalizar_amenity(label)` | — | 064 |
| `normalizar_telefono(tel)` | — | 075 |
| `calcular_similitud(texto1, texto2)` | — | 022 |
| `calcular_confianza_datos(id)` | — | 096 |
| `es_propiedad_vigente(estado, fecha_pub, fecha_disc)` | `helpers/es_propiedad_vigente.sql` | 114 |
| `posicion_mercado_texto(precio_m2, zona, dorms)` | — | 053 |
| `calcular_distancia_gps(lat1, lon1, lat2, lon2)` | — | — |
| `calcular_distancia_metros(lat1, lng1, lat2, lng2)` | — | — |

## Triggers (9 funciones)

| Función | Archivo canónico | Última migración |
|---------|-----------------|------------------|
| `proteger_amenities_candados()` | `triggers/proteger_amenities_candados.sql` | 116 |
| `trg_matchear_alquiler_fn()` | `triggers/trg_matchear_alquiler_fn.sql` | 166 |
| `trg_refresh_lookup_fn()` | — | 141 |
| `trigger_asignar_zona_alquiler()` | `triggers/trigger_asignar_zona_alquiler.sql` | 147b |
| `trg_asignar_zona_venta()` | — | 173 |
| `trigger_calcular_score_broker()` | — | 092 |
| `trigger_normalizar_telefono()` | — | 075 |
| `fn_trigger_tc_actualizado()` | — | 014 |
| `update_modified_column()` | — | — |
| `update_updated_at_column()` | — | — |

*Timestamp triggers: `update_proyectos_master_timestamp()`, `update_proyectos_master_updated_at()`, `update_proyectos_timestamp()`, `update_zonas_updated_at()`*

## Funciones Misceláneas (15 funciones)

| Función | Última migración |
|---------|------------------|
| `actualizar_estados_pendientes(ids_aprobados, ids_rechazados)` | — |
| `actualizar_progreso_seccion(lead_id, seccion, respuestas)` | 021 |
| `agregar_item_amenity(datos_json, path, item)` | 064 |
| `detectar_senales_alerta(contexto, precio, precio_max, coherencia)` | 025 |
| `evaluar_coherencia_innegociables(amenities, innegociables, mascota)` | — |
| `extraer_nombre_de_descripcion(descripcion)` | — |
| `generar_codigo_ref()` | 070 |
| `generar_codigo_unico(prefijo)` | 072 |
| `insertar_proyectos_aprobados(ids)` | — |
| `intentar_match_con_fuzzy(id_propiedad)` | 022 |
| `interpretar_valor_amenity(valor)` | 064 |
| `knowledge_graph_health_check()` | 019 |
| `limpiar_nombre_para_email(nombre)` | 072 |
| `obtener_historial_propiedad(propiedad_id)` | 077 |
| `verificar_duplicado_fotos(hashes)` | 076 |

*Funciones internas de merge/batch/revisión no listadas individualmente: `obtener_propiedades_pendientes_merge()`, `obtener_propiedades_requieren_revision()`, `obtener_propiedades_tc_pendiente()`, `obtener_discrepancias()` (2 overloads), `propiedades_requieren_revision()`, `recalcular_precio_propiedad()`, `recalcular_precios_actualizados()`, `recalcular_precios_batch_nocturno()`, `resetear_merge()`, `marcar_propiedades_para_actualizacion()`, `marcar_slack_notificado()`, etc.*

---

## Resumen

| Categoría | En producción | Con archivo canónico |
|-----------|--------------|---------------------|
| Discovery | 5 | 2 archivos (main + helpers) |
| Enrichment | 2 | 2 archivos |
| Merge | 4 | 3 archivos (main + 2 helpers) |
| Matching venta | 11 | 7 archivos |
| Matching alquiler | 2 | 1 archivo (Fase 7) |
| Discovery alquiler | 1 | 1 archivo |
| Query Layer | 6 | 4 archivos + 1 broker (Fase 2A+7) |
| Análisis/Valuación | 8 | 2 (via query_layer) |
| Snapshots | 2 | 1 archivo (Fase 2A) |
| HITL | 9 | 5 archivos (Fase 7) |
| Proyectos/Admin | 9 | 3 archivos (Fase 7) |
| Broker | 5 | 4 archivos (Fase 7) |
| Leads/CRM | 6 | 0 |
| TC Dinámico | 5 | 1 archivo (multi-función) |
| Helpers | 13 | 4 archivos (Fase 7) |
| Triggers | 10+ | 3 archivos (Fase 7) |
| Misc | 15+ | 0 |
| Workflow Tracking | 1 | 0 |
| Auditoría/Historial | 1 | 0 |
| GIS | 1 | 0 |
| Vistas Materializadas | 1 | 0 |
| **Total** | **~141 unique (144 con overloads)** | **42 archivos** |
