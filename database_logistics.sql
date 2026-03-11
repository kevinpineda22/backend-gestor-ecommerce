-- EJECUTAR EN EL SQL EDITOR DE SUPABASE DASHBOARD
-- Tabla para almacenar la configuración logística por sede

create table if not exists logistics_config (
  sede_code text primary key,
  config jsonb not null default '{}',
  updated_at timestamp with time zone default now()
);

-- Índice para búsqueda rápida
create index if not exists idx_logistics_sede on logistics_config(sede_code);
