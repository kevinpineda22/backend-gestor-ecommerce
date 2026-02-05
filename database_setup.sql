-- EJECUTAR EN EL SQL EDITOR DE SUPABASE DASHBOARD

create table if not exists audit_snapshot (
  item text primary key,
  woo_product_id numeric,
  
  siesa_price numeric,
  siesa_stock_total numeric,
  siesa_stock_pos numeric,
  siesa_stock_disp numeric,
  
  woo_price numeric,
  woo_stock numeric,
  
  price_diff numeric,
  
  -- Valores posibles: 'OK', 'DIFF', 'NO_STOCK', 'NO_SIESA', 'NO_WOO'
  status text, 
  
  last_checked timestamp with time zone default now()
);

-- Indices para velocidad
create index if not exists idx_audit_status on audit_snapshot(status);
create index if not exists idx_audit_diff on audit_snapshot(price_diff);
