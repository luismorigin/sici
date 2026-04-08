-- Migración 208: Filtro de bots Meta en leads_alquiler
-- Problema: bots de revisión de Meta Ads clickean WhatsApp y generan leads falsos
-- Solución: capturar user_agent, calcular es_bot, filtrar en queries

-- 1. Agregar columnas bot
ALTER TABLE leads_alquiler ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE leads_alquiler ADD COLUMN IF NOT EXISTS es_bot BOOLEAN NOT NULL DEFAULT false;

-- 2. Agregar utm_source para distinguir orgánico vs paid
ALTER TABLE leads_alquiler ADD COLUMN IF NOT EXISTS utm_source TEXT;

-- 3. Marcar lead 104 como bot (Haus Equipe, 8 abril 17:34, generado por bot Meta)
UPDATE leads_alquiler SET es_bot = true WHERE id = 104;
