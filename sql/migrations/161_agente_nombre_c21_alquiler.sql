-- Migration 161: Add asesorNombre from C21 discovery to agente_nombre COALESCE
-- Problem: buscar_unidades_alquiler() doesn't read datos_json_discovery->>'asesorNombre'
-- which is where C21 stores the agent name. Result: ~130 C21 rental properties show no agent name.
-- Fix: Add it to the COALESCE chain for agente_nombre (after Remax, before Bien Inmuebles)

-- This migration modifies ONLY the agente_nombre COALESCE in buscar_unidades_alquiler()
-- Change:
--   BEFORE: COALESCE(llm_output->>'agente_nombre', agente->>'nombre', agent->user->>'name_to_show', amigo_clie)
--   AFTER:  COALESCE(llm_output->>'agente_nombre', agente->>'nombre', agent->user->>'name_to_show', discovery->>'asesorNombre', amigo_clie)

-- NOTE: Run pg_get_functiondef() first to get the EXACT current production function,
-- then apply the single-line change. See MEMORY.md lesson about never rewriting from migration files.
