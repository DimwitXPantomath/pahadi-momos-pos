-- ── Procurement Receive Stock + Price History ────────────────────────────────

-- Add receive tracking to procurement_items
alter table procurement_items
  add column if not exists received_qty decimal,
  add column if not exists actual_cost decimal,
  add column if not exists received_at timestamptz,
  add column if not exists carry_forward_qty decimal default 0,
  add column if not exists status text default 'pending';

-- Add cost tracking to ingredients
alter table ingredients
  add column if not exists cost_per_usage_unit decimal default 0,
  add column if not exists last_purchase_cost decimal default 0,
  add column if not exists units_per_purchase decimal default 1000,
  add column if not exists yield_percentage decimal default 100,
  add column if not exists purchase_unit text default 'Kg',
  add column if not exists usage_unit text default 'grams',
  add column if not exists min_stock_level decimal default 0;

-- Price history per ingredient per procurement
create table if not exists ingredient_price_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid references ingredients(id),
  vendor_id uuid references vendors(id),
  procurement_id uuid references procurement_requests(id),
  purchase_date date not null default current_date,
  quantity_received decimal not null,
  total_cost decimal not null,
  cost_per_usage_unit decimal not null,
  outlet_id text default 'demo-outlet',
  created_at timestamptz default now()
);

-- Update procurement_requests status options
alter table procurement_requests
  drop constraint if exists procurement_requests_status_check;

alter table procurement_requests
  add constraint procurement_requests_status_check
  check (status in ('draft','sent','responded','confirmed','partially_received','completed'));

-- Disable RLS for easier dev access
alter table ingredient_price_history disable row level security;
alter table procurement_items disable row level security;
alter table procurement_requests disable row level security;
alter table ingredients disable row level security;

-- ── DUMMY DATA FOR TESTING ─────────────────────────────────────────────────

-- Insert test vendors
insert into vendors (id, name, phone, address, pin) values
  ('11111111-1111-1111-1111-111111111111', 'Fresh Farms', '9876543210', 'MG Road, Indore', '452001'),
  ('22222222-2222-2222-2222-222222222222', 'City Market', '9876543211', 'Vijay Nagar, Indore', '452010'),
  ('33333333-3333-3333-3333-333333333333', 'Agro Traders', '9876543212', 'Palasia, Indore', '452003')
on conflict (id) do nothing;

-- Insert test ingredients with costing
insert into ingredients (id, name, unit, purchase_unit, units_per_purchase, yield_percentage, cost_per_usage_unit, min_stock_level, usage_unit) values
  ('aaaa0001-0000-0000-0000-000000000000', 'Jalapeños',    'grams',  'Bottle', 570,  95,  0.369, 500, 'grams'),
  ('aaaa0002-0000-0000-0000-000000000000', 'Mayonnaise',   'ml',     'Bottle', 1000, 100, 0.240, 300, 'ml'),
  ('aaaa0003-0000-0000-0000-000000000000', 'Paneer',       'grams',  'Kg',     1000, 92,  0.348, 1000,'grams'),
  ('aaaa0004-0000-0000-0000-000000000000', 'Momo Wrappers','pieces', 'Pack',   50,   100, 1.600, 100, 'pieces'),
  ('aaaa0005-0000-0000-0000-000000000000', 'Soy Sauce',    'ml',     'Bottle', 750,  98,  0.180, 200, 'ml')
on conflict (id) do nothing;

-- Insert inventory stock for ingredients
insert into inventory_stock (ingredient_id, current_quantity) values
  ('aaaa0001-0000-0000-0000-000000000000', 200),
  ('aaaa0002-0000-0000-0000-000000000000', 150),
  ('aaaa0003-0000-0000-0000-000000000000', 800),
  ('aaaa0004-0000-0000-0000-000000000000', 50),
  ('aaaa0005-0000-0000-0000-000000000000', 100)
on conflict (ingredient_id) do update set current_quantity = excluded.current_quantity;

-- Insert test procurement requests
insert into procurement_requests (id, outlet_id, vendor_id, status, note, created_at) values
  ('bbbb0001-0000-0000-0000-000000000000', 'demo-outlet', '11111111-1111-1111-1111-111111111111', 'sent', 'Weekly order - low stock alert',  now() - interval '2 days'),
  ('bbbb0002-0000-0000-0000-000000000000', 'demo-outlet', '22222222-2222-2222-2222-222222222222', 'sent', 'Urgent - wrappers finished',       now() - interval '1 day'),
  ('bbbb0003-0000-0000-0000-000000000000', 'demo-outlet', '11111111-1111-1111-1111-111111111111', 'completed', 'Last week order',             now() - interval '8 days'),
  ('bbbb0004-0000-0000-0000-000000000000', 'demo-outlet', '33333333-3333-3333-3333-333333333333', 'completed', 'Soy sauce restock',           now() - interval '15 days')
on conflict (id) do nothing;

-- Insert procurement items
insert into procurement_items (request_id, ingredient_id, requested_qty, status) values
  ('bbbb0001-0000-0000-0000-000000000000', 'aaaa0001-0000-0000-0000-000000000000', 12, 'pending'),
  ('bbbb0001-0000-0000-0000-000000000000', 'aaaa0002-0000-0000-0000-000000000000', 6,  'pending'),
  ('bbbb0001-0000-0000-0000-000000000000', 'aaaa0003-0000-0000-0000-000000000000', 5,  'pending'),
  ('bbbb0002-0000-0000-0000-000000000000', 'aaaa0004-0000-0000-0000-000000000000', 10, 'pending'),
  ('bbbb0002-0000-0000-0000-000000000000', 'aaaa0005-0000-0000-0000-000000000000', 4,  'pending'),
  ('bbbb0003-0000-0000-0000-000000000000', 'aaaa0001-0000-0000-0000-000000000000', 10, 'received'),
  ('bbbb0003-0000-0000-0000-000000000000', 'aaaa0002-0000-0000-0000-000000000000', 4,  'received'),
  ('bbbb0004-0000-0000-0000-000000000000', 'aaaa0005-0000-0000-0000-000000000000', 6,  'received');

-- Insert price history for completed orders
insert into ingredient_price_history (ingredient_id, vendor_id, procurement_id, purchase_date, quantity_received, total_cost, cost_per_usage_unit) values
  ('aaaa0001-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'bbbb0003-0000-0000-0000-000000000000', current_date - 8,  10, 2000, 0.351),
  ('aaaa0002-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'bbbb0003-0000-0000-0000-000000000000', current_date - 8,  4,  720,  0.180),
  ('aaaa0005-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'bbbb0004-0000-0000-0000-000000000000', current_date - 15, 6,  810,  0.180);
