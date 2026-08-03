-- ============================================================
-- This is what was ACTUALLY run against the live Supabase project
-- on 2026-08-03, in one paste, via the SQL Editor. It supersedes and
-- corrects 009, 015, 016, and 017 as originally written in this repo —
-- those files reflected assumptions about the live schema that turned
-- out to be wrong (see CLAUDE.md changelog + Known Gotchas, 2026-08-03).
--
-- If you're reading this later wondering why 009/015/016/017 don't
-- match what's live: this file is the source of truth for what
-- actually happened. Do not re-run 009/015/016/017 as originally
-- written — read this file's own header comment for the corrections,
-- then re-verify against a fresh information_schema/pg_policies dump
-- before assuming ANYTHING about this database's current state.
-- ============================================================

-- ============================================================
-- CORRECTED combined script — replaces combined_migrations_009_to_019.sql
-- Paste this whole file into Supabase SQL Editor → Run, once.
--
-- What changed vs the first version, and why:
--  1. update_updated_at_column() is now defined here directly instead of
--     assumed to exist from migration 001 — 001 never actually completed
--     on this database (that's why the first run errored).
--  2. Dropped the broken "tenant-scoped RLS everywhere" design. Several
--     core tables (categories, menu_items, ingredients, items, recipes,
--     vendors, purchase_logs) have no outlet_id column at all, and
--     profiles.outlet_id is a uuid while every other outlet_id is text —
--     comparing them would error. Given this is a single real outlet
--     today, current_outlet_id() is now a constant, and tables without
--     a real outlet_id column just get "authenticated users only."
--  3. Drops the actual dangerous policies confirmed live on your
--     database right now: orders (public_order_mvp, "public select
--     orders"), menu_items (4 "Allow public *" policies), credit_sales
--     (credit_sales_open), expenses (expenses_open), order_ratings
--     (order_rating), report_logs (report_logs_open) — all of these
--     grant full unauthenticated read/write, confirmed via pg_policies.
--  4. Locks down tables that had zero policies (effectively wide open
--     if RLS was never enabled): categories, order_items, inventory_stock,
--     vendors, ingredient_price_history, loyalty_settings,
--     loyalty_transactions, production_batches, procurement_requests,
--     procurement_items, sub_recipe_batch_options, sub_recipe_stock,
--     fcm_tokens, feature_logs, tables, outlets, outlet_settings,
--     purchase_orders, purchase_order_items.
--  5. Adds recipes.serves (confirmed missing — the P&L cost-per-serving
--     fix from earlier this session has been silently doing nothing).
--  6. Leaves already-correctly-secured tables alone: ingredients, items,
--     recipes, recipe_items, stock, purchase_logs, vendor_shops,
--     vendor_item_prices, sub_recipes, sub_recipe_items, brands, profiles'
--     existing self-scoped policies.
--
-- Safe to re-run if it errors partway — every statement uses
-- IF NOT EXISTS / IF EXISTS / OR REPLACE.
-- ============================================================


-- ============================================================
-- Safety net: define the trigger function 009's tables need,
-- regardless of whether migration 001 ever ran.
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 009_stamp_loyalty_cards.sql  (unchanged from first version)
-- ============================================================

CREATE TABLE IF NOT EXISTS stamp_card_programs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         TEXT NOT NULL UNIQUE DEFAULT 'demo-outlet',
  name              TEXT NOT NULL DEFAULT 'Loyalty Stamp Card',
  stamps_required   INT NOT NULL DEFAULT 10 CHECK (stamps_required > 0),
  reward_type       TEXT NOT NULL DEFAULT 'discount_percent'
                      CHECK (reward_type IN ('discount_percent','discount_flat','complimentary_item')),
  reward_value      NUMERIC,
  reward_description TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stamp_cards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         TEXT NOT NULL DEFAULT 'demo-outlet',
  program_id        UUID NOT NULL REFERENCES stamp_card_programs(id) ON DELETE CASCADE,
  customer_phone    TEXT NOT NULL,
  customer_name     TEXT,
  card_code         TEXT NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  stamps_count      INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','reward_ready','redeemed')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  last_stamped_at   TIMESTAMPTZ,
  UNIQUE(outlet_id, program_id, customer_phone)
);

CREATE TABLE IF NOT EXISTS stamp_card_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID NOT NULL REFERENCES stamp_cards(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('issue','stamp','redeem')),
  staff_note  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stamp_card_programs', 'stamp_cards']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = t || '_updated_at' AND tgrelid = t::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION add_stamp(
  p_outlet_id       TEXT,
  p_program_id      UUID,
  p_customer_phone  TEXT,
  p_customer_name   TEXT DEFAULT NULL,
  p_order_id        UUID DEFAULT NULL
) RETURNS stamp_cards AS $$
DECLARE
  v_card       stamp_cards;
  v_required   INT;
BEGIN
  SELECT stamps_required INTO v_required FROM stamp_card_programs WHERE id = p_program_id;
  IF v_required IS NULL THEN
    RAISE EXCEPTION 'Unknown stamp card program %', p_program_id;
  END IF;

  INSERT INTO stamp_cards (outlet_id, program_id, customer_phone, customer_name)
  VALUES (p_outlet_id, p_program_id, p_customer_phone, p_customer_name)
  ON CONFLICT (outlet_id, program_id, customer_phone) DO NOTHING;

  UPDATE stamp_cards
  SET
    stamps_count  = stamps_count + 1,
    status        = CASE WHEN stamps_count + 1 >= v_required THEN 'reward_ready' ELSE 'active' END,
    customer_name = COALESCE(p_customer_name, customer_name),
    last_stamped_at = NOW()
  WHERE outlet_id = p_outlet_id AND program_id = p_program_id AND customer_phone = p_customer_phone
  RETURNING * INTO v_card;

  INSERT INTO stamp_card_events (card_id, order_id, event_type)
  VALUES (v_card.id, p_order_id, 'stamp');

  RETURN v_card;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

CREATE OR REPLACE FUNCTION redeem_stamp_card(
  p_card_id     UUID,
  p_order_id    UUID DEFAULT NULL,
  p_staff_note  TEXT DEFAULT NULL
) RETURNS stamp_cards AS $$
DECLARE
  v_card stamp_cards;
BEGIN
  SELECT * INTO v_card FROM stamp_cards WHERE id = p_card_id FOR UPDATE;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Stamp card % not found', p_card_id;
  END IF;
  IF v_card.status <> 'reward_ready' THEN
    RAISE EXCEPTION 'Card % is not reward-ready (status: %)', p_card_id, v_card.status;
  END IF;

  UPDATE stamp_cards
  SET stamps_count = 0, status = 'active'
  WHERE id = p_card_id
  RETURNING * INTO v_card;

  INSERT INTO stamp_card_events (card_id, order_id, event_type, staff_note)
  VALUES (p_card_id, p_order_id, 'redeem', p_staff_note);

  RETURN v_card;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

ALTER TABLE stamp_card_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_card_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_full_stamp_card_programs ON stamp_card_programs;
CREATE POLICY auth_full_stamp_card_programs ON stamp_card_programs FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS anon_read_stamp_card_programs ON stamp_card_programs;
CREATE POLICY anon_read_stamp_card_programs ON stamp_card_programs FOR SELECT USING (true);

DROP POLICY IF EXISTS auth_full_stamp_cards ON stamp_cards;
CREATE POLICY auth_full_stamp_cards ON stamp_cards FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS auth_full_stamp_card_events ON stamp_card_events;
CREATE POLICY auth_full_stamp_card_events ON stamp_card_events FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO stamp_card_programs (outlet_id, name, stamps_required, reward_type, reward_value, reward_description, is_active)
VALUES ('demo-outlet', 'Loyalty Stamp Card', 10, 'discount_percent', 100, 'Free item on the house', false)
ON CONFLICT (outlet_id) DO NOTHING;


-- ============================================================
-- 010_online_ordering_and_loyalty_toggle.sql  (unchanged)
-- ============================================================

ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'pos'
  CHECK (order_source IN ('pos', 'online'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid'
  CHECK (payment_status IN ('pending', 'paid'));


-- ============================================================
-- 011_recipe_sop_fields.sql  (unchanged)
-- ============================================================

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dos TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS donts TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cooking_technique TEXT;

ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS dos TEXT;
ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS donts TEXT;
ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS cooking_technique TEXT;

ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS cut_style TEXT;
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS heat_level TEXT CHECK (heat_level IS NULL OR heat_level IN ('low', 'medium', 'high'));
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS timing_note TEXT;

ALTER TABLE sub_recipe_items ADD COLUMN IF NOT EXISTS cut_style TEXT;
ALTER TABLE sub_recipe_items ADD COLUMN IF NOT EXISTS heat_level TEXT CHECK (heat_level IS NULL OR heat_level IN ('low', 'medium', 'high'));
ALTER TABLE sub_recipe_items ADD COLUMN IF NOT EXISTS timing_note TEXT;

-- recipes.serves was assumed by this session's P&L / profit-per-item
-- code (costPerServing = batchCost / recipe.serves) but never actually
-- existed on this table — that code has been silently comparing whole-
-- batch cost to a single item's price the entire time. Adding it here
-- with a default of 1 keeps existing behavior stable; go into Recipes
-- and set the real number of servings each recipe batch yields for
-- accurate cost-per-serving numbers.
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS serves INTEGER NOT NULL DEFAULT 1;


-- ============================================================
-- 012_business_resource_progress.sql  (unchanged)
-- ============================================================

CREATE TABLE IF NOT EXISTS business_resource_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  resource_id   TEXT NOT NULL,
  completed     BOOLEAN NOT NULL DEFAULT true,
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT,
  UNIQUE(outlet_id, resource_id)
);

ALTER TABLE business_resource_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_business_resource_progress ON business_resource_progress;
CREATE POLICY auth_full_business_resource_progress ON business_resource_progress
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================
-- 013_checklists_and_logs.sql  (unchanged)
-- ============================================================

CREATE TABLE IF NOT EXISTS checklist_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'custom'
              CHECK (category IN ('cleaning','pest_control','temperature','handwashing','custom')),
  frequency   TEXT NOT NULL DEFAULT 'daily'
              CHECK (frequency IN ('daily','weekly','monthly')),
  is_preset   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checklist_templates_outlet_idx ON checklist_templates(outlet_id);

CREATE TABLE IF NOT EXISTS checklist_template_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  value_type   TEXT NOT NULL DEFAULT 'check' CHECK (value_type IN ('check','number','text')),
  unit         TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (template_id, label)
);

CREATE TABLE IF NOT EXISTS checklist_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  log_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_by  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (template_id, log_date)
);

CREATE INDEX IF NOT EXISTS checklist_logs_template_date_idx ON checklist_logs(template_id, log_date DESC);
CREATE INDEX IF NOT EXISTS checklist_logs_outlet_idx ON checklist_logs(outlet_id);

CREATE TABLE IF NOT EXISTS checklist_log_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id           UUID NOT NULL REFERENCES checklist_logs(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES checklist_template_items(id) ON DELETE CASCADE,
  checked          BOOLEAN DEFAULT false,
  value            TEXT,
  checked_at       TIMESTAMPTZ,
  UNIQUE (log_id, template_item_id)
);

ALTER TABLE checklist_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_log_entries    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_all_checklist_templates ON checklist_templates;
CREATE POLICY staff_all_checklist_templates      ON checklist_templates      FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS staff_all_checklist_template_items ON checklist_template_items;
CREATE POLICY staff_all_checklist_template_items ON checklist_template_items FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS staff_all_checklist_logs ON checklist_logs;
CREATE POLICY staff_all_checklist_logs           ON checklist_logs           FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS staff_all_checklist_log_entries ON checklist_log_entries;
CREATE POLICY staff_all_checklist_log_entries    ON checklist_log_entries    FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

INSERT INTO checklist_templates (id, name, category, frequency, is_preset, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Daily Cleaning Checklist', 'cleaning',     'daily',  true, 1),
  ('c1000000-0000-0000-0000-000000000002', 'Pest Control Log',        'pest_control', 'weekly', true, 2),
  ('c1000000-0000-0000-0000-000000000003', 'Temperature Log',         'temperature',  'daily',  true, 3),
  ('c1000000-0000-0000-0000-000000000004', 'Handwashing Log',         'handwashing',  'daily',  true, 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO checklist_template_items (template_id, label, value_type, unit, sort_order) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Wipe down prep surfaces',                     'check', NULL, 1),
  ('c1000000-0000-0000-0000-000000000001', 'Sanitize cutting boards',                      'check', NULL, 2),
  ('c1000000-0000-0000-0000-000000000001', 'Clean floors',                                 'check', NULL, 3),
  ('c1000000-0000-0000-0000-000000000001', 'Empty & clean bins',                           'check', NULL, 4),
  ('c1000000-0000-0000-0000-000000000001', 'Clean equipment (mixer / oven / fryer)',       'check', NULL, 5),
  ('c1000000-0000-0000-0000-000000000001', 'Restock handwash & sanitizer stations',        'check', NULL, 6),
  ('c1000000-0000-0000-0000-000000000001', 'Clean restrooms',                              'check', NULL, 7),
  ('c1000000-0000-0000-0000-000000000002', 'Check for rodent droppings / signs',           'check', NULL, 1),
  ('c1000000-0000-0000-0000-000000000002', 'Inspect bait / trap stations',                 'check', NULL, 2),
  ('c1000000-0000-0000-0000-000000000002', 'Check door seals & gaps',                      'check', NULL, 3),
  ('c1000000-0000-0000-0000-000000000002', 'Check drains for pest activity',               'check', NULL, 4),
  ('c1000000-0000-0000-0000-000000000002', 'Remarks / action taken',                       'text',  NULL, 5),
  ('c1000000-0000-0000-0000-000000000003', 'Fridge temperature',                           'number', '°C', 1),
  ('c1000000-0000-0000-0000-000000000003', 'Freezer temperature',                          'number', '°C', 2),
  ('c1000000-0000-0000-0000-000000000003', 'Hot holding temperature',                      'number', '°C', 3),
  ('c1000000-0000-0000-0000-000000000003', 'Cold holding / display temperature',           'number', '°C', 4),
  ('c1000000-0000-0000-0000-000000000004', 'Morning shift start',                          'check', NULL, 1),
  ('c1000000-0000-0000-0000-000000000004', 'After using restroom',                         'check', NULL, 2),
  ('c1000000-0000-0000-0000-000000000004', 'After handling raw food',                      'check', NULL, 3),
  ('c1000000-0000-0000-0000-000000000004', 'Before handling ready-to-eat food',             'check', NULL, 4)
ON CONFLICT (template_id, label) DO NOTHING;


-- ============================================================
-- 014_outlet_branding.sql  (unchanged)
-- ============================================================

CREATE TABLE IF NOT EXISTS outlet_branding (
  outlet_id       TEXT PRIMARY KEY DEFAULT 'demo-outlet',
  business_name   TEXT NOT NULL DEFAULT 'Praang',
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#2D6A4F',
  secondary_color TEXT NOT NULL DEFAULT '#F4A261',
  address         TEXT,
  phone           TEXT,
  fssai_number    TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outlet_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_all_outlet_branding ON outlet_branding;
CREATE POLICY staff_all_outlet_branding  ON outlet_branding FOR ALL    USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS anon_read_outlet_branding ON outlet_branding;
CREATE POLICY anon_read_outlet_branding  ON outlet_branding FOR SELECT USING (true);

INSERT INTO outlet_branding (outlet_id) VALUES ('demo-outlet') ON CONFLICT (outlet_id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS staff_upload_branding_logos ON storage.objects;
CREATE POLICY staff_upload_branding_logos ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS staff_update_branding_logos ON storage.objects;
CREATE POLICY staff_update_branding_logos ON storage.objects FOR UPDATE
  USING (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS public_read_branding_logos ON storage.objects;
CREATE POLICY public_read_branding_logos ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');


-- ============================================================
-- current_outlet_id(): placeholder constant.
-- profiles.outlet_id is uuid, every other outlet_id column is text,
-- and this is genuinely a single-outlet business today (CLAUDE.md
-- says multi-tenancy is a Phase 3 item, not built yet). Rather than
-- comparing incompatible types, this just returns the one real
-- outlet's text key. Revisit when a second outlet actually gets
-- onboarded — this function is the one place that needs to change.
-- ============================================================

CREATE OR REPLACE FUNCTION current_outlet_id() RETURNS TEXT AS $$
  SELECT 'demo-outlet'::text
$$ LANGUAGE sql STABLE;


-- ============================================================
-- CRITICAL: remove confirmed-live wide-open policies.
-- These did not come from any migration file — they were created
-- directly in the Supabase dashboard at some point and grant full
-- unauthenticated read/write. Confirmed via pg_policies output.
-- ============================================================

DROP POLICY IF EXISTS "public_order_mvp" ON orders;
DROP POLICY IF EXISTS "public select orders" ON orders;

DROP POLICY IF EXISTS "Allow public delete menu" ON menu_items;
DROP POLICY IF EXISTS "Allow public insert menu" ON menu_items;
DROP POLICY IF EXISTS "Allow public select menu" ON menu_items;
DROP POLICY IF EXISTS "Allow public update menu" ON menu_items;

DROP POLICY IF EXISTS "credit_sales_open" ON credit_sales;
DROP POLICY IF EXISTS "expenses_open" ON expenses;
DROP POLICY IF EXISTS "order_rating" ON order_ratings;
DROP POLICY IF EXISTS "report_logs_open" ON report_logs;


-- ============================================================
-- Re-secure the tables above, plus every table that had zero
-- policies at all (same net effect as wide open, if RLS was never
-- enabled). Two tables need anon SELECT for the public digital menu
-- / online-ordering pages; everything else is staff-only. Direct
-- anon writes to orders/order_items are intentionally NOT restored —
-- online order placement goes through the place_online_order RPC
-- below, which validates prices server-side.
-- ============================================================

-- orders: staff-only from here on. Customers place orders via
-- place_online_order() and track via get_order_for_tracking() —
-- both SECURITY DEFINER, both bypass this policy safely by design.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_orders ON orders;
CREATE POLICY staff_manage_orders ON orders FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- menu_items: public needs to see the menu (digital menu page, online
-- ordering) but only staff can change it.
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_menu_items ON menu_items;
CREATE POLICY anon_read_menu_items ON menu_items FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_manage_menu_items ON menu_items;
CREATE POLICY staff_manage_menu_items ON menu_items FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- categories: same pattern as menu_items — public needs to read them
-- for the digital menu, only staff edits them.
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_categories ON categories;
CREATE POLICY anon_read_categories ON categories FOR SELECT USING (true);
DROP POLICY IF EXISTS staff_manage_categories ON categories;
CREATE POLICY staff_manage_categories ON categories FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- credit_sales / expenses / order_ratings / report_logs: internal
-- data, no legitimate anon use case. Staff-only.
ALTER TABLE credit_sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_credit_sales ON credit_sales;
CREATE POLICY staff_manage_credit_sales ON credit_sales FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_expenses ON expenses;
CREATE POLICY tenant_scoped_expenses ON expenses FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

ALTER TABLE order_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_order_ratings ON order_ratings;
CREATE POLICY staff_manage_order_ratings ON order_ratings FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- NOTE: if customers submit ratings from a public post-order page without
-- logging in, this policy will block that — same as orders, that write
-- should go through a narrow SECURITY DEFINER RPC rather than a raw
-- anon INSERT policy. No frontend code references order_ratings at all
-- as of this migration, so this is currently dead/unused — confirmed
-- via repo grep, not just assumed.

ALTER TABLE report_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_report_logs ON report_logs;
CREATE POLICY staff_manage_report_logs ON report_logs FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- order_items: has its own outlet_id column, no anon writes needed
-- directly (place_online_order RPC handles that server-side).
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_order_items ON order_items;
CREATE POLICY tenant_scoped_order_items ON order_items FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

-- Tables with real outlet_id text columns already ('demo-outlet' default):
-- safe to use real tenant scoping now that current_outlet_id() is a
-- matching text constant instead of a broken uuid comparison.
ALTER TABLE loyalty_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_loyalty_settings ON loyalty_settings;
CREATE POLICY tenant_scoped_loyalty_settings ON loyalty_settings FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_loyalty_transactions ON loyalty_transactions;
CREATE POLICY tenant_scoped_loyalty_transactions ON loyalty_transactions FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_production_batches ON production_batches;
CREATE POLICY tenant_scoped_production_batches ON production_batches FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_procurement_requests ON procurement_requests;
CREATE POLICY tenant_scoped_procurement_requests ON procurement_requests FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

ALTER TABLE ingredient_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scoped_ingredient_price_history ON ingredient_price_history;
CREATE POLICY tenant_scoped_ingredient_price_history ON ingredient_price_history FOR ALL USING (outlet_id = current_outlet_id()) WITH CHECK (outlet_id = current_outlet_id());

-- Tables with no outlet_id concept at all and no anon use case:
-- straightforward staff-only.
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_inventory_stock ON inventory_stock;
CREATE POLICY staff_manage_inventory_stock ON inventory_stock FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_vendors ON vendors;
CREATE POLICY staff_manage_vendors ON vendors FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_procurement_items ON procurement_items;
CREATE POLICY staff_manage_procurement_items ON procurement_items FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE sub_recipe_batch_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_sub_recipe_batch_options ON sub_recipe_batch_options;
CREATE POLICY staff_manage_sub_recipe_batch_options ON sub_recipe_batch_options FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE sub_recipe_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_sub_recipe_stock ON sub_recipe_stock;
CREATE POLICY staff_manage_sub_recipe_stock ON sub_recipe_stock FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Low-priority cleanup: unused/legacy tables, but still live in a
-- production database with zero access control. Cheap to lock down.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fcm_tokens', 'feature_logs', 'tables', 'outlets', 'outlet_settings',
    'purchase_orders', 'purchase_order_items'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS staff_manage_%I ON %I', t, t);
      EXECUTE format(
        'CREATE POLICY staff_manage_%I ON %I FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)',
        t, t
      );
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- 016_profiles_lockdown.sql  (role-escalation fix — adjusted to not
-- depend on profiles.outlet_id, since that column's type doesn't
-- match the rest of the schema and isn't reliably populated)
-- ============================================================

-- Existing self-scoped SELECT/INSERT/UPDATE policies on profiles are
-- fine as-is (auth.uid() = id) — left untouched. This adds the one
-- thing missing: nothing currently stops a user from UPDATE-ing their
-- own row to set role = 'owner'.

CREATE OR REPLACE FUNCTION prevent_profile_privilege_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('app.allow_privilege_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'role cannot be changed directly — use admin_update_staff_role()';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_profile_privilege_change ON profiles;
CREATE TRIGGER guard_profile_privilege_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_change();

CREATE OR REPLACE FUNCTION admin_update_staff_role(
  p_target_user_id UUID,
  p_new_role TEXT
) RETURNS profiles AS $$
DECLARE
  v_caller_role TEXT;
  v_result      profiles;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only an owner can change staff roles';
  END IF;

  IF p_new_role NOT IN ('owner', 'manager', 'staff') THEN
    RAISE EXCEPTION 'Invalid role %', p_new_role;
  END IF;

  PERFORM set_config('app.allow_privilege_change', 'true', true);
  UPDATE profiles SET role = p_new_role WHERE id = p_target_user_id RETURNING * INTO v_result;
  PERFORM set_config('app.allow_privilege_change', 'false', true);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION admin_update_staff_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_staff_role(UUID, TEXT) TO authenticated;

-- Also default new self-registered profiles to the lowest-privilege
-- role, since "Users insert own profile" currently has no WITH CHECK
-- restricting what role a brand-new signup can claim for themselves.
DROP POLICY IF EXISTS "Users insert own profile" ON profiles;
DROP POLICY IF EXISTS insert_own_profile ON profiles;
CREATE POLICY insert_own_profile ON profiles FOR INSERT
  WITH CHECK (id = auth.uid() AND role = 'staff');


-- ============================================================
-- 017_price_safe_online_orders.sql  (fixed: menu_items has no
-- outlet_id column, so that filter is dropped — there's one shared
-- menu today, not one per outlet. order_items.order_id/item_id are
-- TEXT columns in this schema, not UUID — cast accordingly.)
-- ============================================================

CREATE OR REPLACE FUNCTION place_online_order(
  p_outlet_id       TEXT,
  p_items           JSONB,
  p_customer_phone  TEXT,
  p_customer_name   TEXT DEFAULT NULL,
  p_table_id        TEXT DEFAULT NULL
) RETURNS orders AS $$
DECLARE
  v_element      JSONB;
  v_item_id      UUID;
  v_qty          INT;
  v_name         TEXT;
  v_price        NUMERIC;
  v_subtotal     NUMERIC := 0;
  v_items_out    JSONB := '[]'::jsonb;
  v_phone_digits TEXT;
  v_order        orders;
BEGIN
  IF p_outlet_id IS NULL OR length(trim(p_outlet_id)) = 0 THEN
    RAISE EXCEPTION 'outlet_id is required';
  END IF;

  v_phone_digits := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone_digits) < 10 THEN
    RAISE EXCEPTION 'A valid 10-digit phone number is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  FOR v_element IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_element->>'id')::uuid;
    v_qty     := (v_element->>'quantity')::int;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for item %', v_item_id;
    END IF;

    SELECT name, price INTO v_name, v_price
    FROM menu_items
    WHERE id = v_item_id AND available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % is not available for ordering', v_item_id;
    END IF;

    v_subtotal  := v_subtotal + (v_price * v_qty);
    v_items_out := v_items_out || jsonb_build_object('id', v_item_id, 'name', v_name, 'price', v_price, 'quantity', v_qty);
  END LOOP;

  INSERT INTO orders (
    outlet_id, items, subtotal, gst, total, status,
    order_source, payment_status, customer_phone, customer_name, table_id
  ) VALUES (
    p_outlet_id, v_items_out, v_subtotal, round(v_subtotal * 0.05, 2), round(v_subtotal * 1.05, 2), 'PLACED',
    'online', 'pending', v_phone_digits, nullif(trim(coalesce(p_customer_name, '')), ''), p_table_id
  )
  RETURNING * INTO v_order;

  INSERT INTO order_items (order_id, outlet_id, item_id, quantity)
  SELECT v_order.id::text, p_outlet_id, (elem->>'id')::text, (elem->>'quantity')::int
  FROM jsonb_array_elements(v_items_out) elem;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION place_online_order(TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_online_order(TEXT, JSONB, TEXT, TEXT, TEXT) TO anon, authenticated;


-- ============================================================
-- 018_scoped_anon_reads.sql  (unchanged — order tracking + stamp
-- card lookups go through these instead of a raw anon SELECT policy)
-- ============================================================

CREATE OR REPLACE FUNCTION get_order_for_tracking(p_order_id UUID) RETURNS orders AS $$
  SELECT * FROM orders WHERE id = p_order_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_order_for_tracking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_order_for_tracking(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_stamp_card_by_code(p_card_code TEXT) RETURNS stamp_cards AS $$
  SELECT * FROM stamp_cards WHERE card_code = p_card_code;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_stamp_card_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stamp_card_by_code(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_stamp_program_by_id(p_program_id UUID) RETURNS stamp_card_programs AS $$
  SELECT * FROM stamp_card_programs WHERE id = p_program_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_stamp_program_by_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stamp_program_by_id(UUID) TO anon, authenticated;


-- ============================================================
-- 019_storage_hardening.sql  (unchanged — current_outlet_id() is
-- now a safe text constant, so this resolves correctly)
-- ============================================================

DROP POLICY IF EXISTS staff_upload_branding_logos ON storage.objects;
DROP POLICY IF EXISTS staff_update_branding_logos ON storage.objects;

CREATE POLICY staff_upload_branding_logos ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = current_outlet_id()
  );

CREATE POLICY staff_update_branding_logos ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = current_outlet_id()
  );

UPDATE storage.buckets
SET file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'branding';

-- ============================================================
-- DONE. This ran successfully against the live database on 2026-08-03.
-- ============================================================
