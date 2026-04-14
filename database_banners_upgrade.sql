-- Mejoras al sistema de banners:
-- 1. Vincular banners a reglas de descuento (para llevar al usuario a los productos del descuento)
-- 2. Soporte para sección de separatas promocionales (ya cubierto con section='promo_separatas')
-- Ejecutar en Supabase SQL Editor

-- Columna para vincular un banner a una regla de descuento específica
ALTER TABLE content_banners
ADD COLUMN IF NOT EXISTS discount_rule_id bigint REFERENCES discount_rules(id) ON DELETE SET NULL;

COMMENT ON COLUMN content_banners.discount_rule_id IS
'Opcional: ID de la regla de descuento asociada a este banner. Cuando se configura, el gestor
sugiere la URL de la página de promo (/promo/descuento/{id}/) que el plugin WordPress renderiza
mostrando solo los productos que aplican para ese descuento.';

-- Asegurarse de que la columna sedes exista en content_banners (ya debería existir)
ALTER TABLE content_banners
ADD COLUMN IF NOT EXISTS sedes jsonb DEFAULT NULL;

COMMENT ON COLUMN content_banners.sedes IS 'null = visible en todas las sedes, array = sedes específicas';
