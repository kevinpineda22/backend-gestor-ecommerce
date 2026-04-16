-- Agregar columna 'priority' a discount_rules
-- Controla el orden de precedencia entre reglas que aplican al mismo producto.
-- Menor número = mayor prioridad (1 > 10 > 50).
-- Valores usados en el Gestor:
--   1  → Separatas (máxima prioridad)
--   10 → Descuentos semanales
--   50 → Descuentos generales (default)
-- Ejecutar en Supabase SQL Editor

ALTER TABLE discount_rules
ADD COLUMN IF NOT EXISTS priority integer DEFAULT 50;

COMMENT ON COLUMN discount_rules.priority IS
'Prioridad de la regla. Menor número = mayor precedencia. 1=Separatas, 10=Semanal, 50=General.';
