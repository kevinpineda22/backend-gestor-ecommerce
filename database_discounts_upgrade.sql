-- Migración: columnas faltantes en discount_rules
-- Ejecutar en Supabase SQL Editor

alter table discount_rules
  add column if not exists priority        numeric      default 10,
  add column if not exists cart_condition_type  text    default null,
  add column if not exists cart_condition_value numeric  default 0;

-- Comentarios
comment on column discount_rules.priority             is '1=Separata, 5=Autoliquidable, 10=Semanal — controla qué regla FlyCart tiene precedencia';
comment on column discount_rules.cart_condition_type  is 'subtotal | null — tipo de condición de carrito para reglas autoliquidables';
comment on column discount_rules.cart_condition_value is 'Monto mínimo del carrito para activar la regla autoliquidable (ej: 150000)';
