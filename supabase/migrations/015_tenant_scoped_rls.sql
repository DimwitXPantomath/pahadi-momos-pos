-- ============================================================
-- Migration 015: Real Tenant Isolation (fixes C-1, C-4 from
-- docs/security-audit.md)
--
-- Every RLS policy in this schema up to this point only checked
-- `auth.uid() IS NOT NULL` — "are you logged in", never "is this
-- YOUR restaurant's row." profiles.outlet_id has existed since
-- 001_initial_schema.sql but no policy ever read it. This migration
-- is the fix: every table gets scoped to the caller's own outlet_id,
-- read from their own profiles row.
--
-- Scope decision: this migration enforces TENANT (outlet) isolation
-- only, not role-based restriction within an outlet (e.g. "can a
-- waiter edit ingredient costs" is unchanged — any authenticated
-- staff member of an outlet keeps the same access to that outlet's
-- data they already had). The audit's stated primary objective was
-- cross-restaurant isolation specifically; adding role-tiered write
-- restrictions per table is a separate follow-up that needs real
-- business rules decided first, not guessed at here, or it risks
-- silently breaking existing staff workflows.
--
-- This migration does NOT touch:
--   - orders / order_items anon (customer-facing) policies — those
--     are replaced in 017 alongside the price-tampering fix, because
--     they need to change shape together (direct insert -> RPC).
--   - anon_read_orders / anon_read_stamp_cards (USING true) — dropped
--     in 018 alongside their RPC replacements.
--   - profiles — handled in 016, it needs a different policy shape
--     (own-row, not own-outlet) plus a role/outlet_id-change lockdown.
--   - categories / menu_items / outlet_branding anon SELECT policies —
--     intentionally left public (menu + poster branding are meant to
--     be visible with no login; the STAFF write policies on these
--     tables are still tightened below).
--   - brands — genuinely global reference data (e.g. "Amul" is the
--     same brand for every outlet), no outlet_id column by design.
-- ============================================================

-- ── Helper: the calling user's own outlet, read once per statement ──────────
CREATE OR REPLACE FUNCTION current_outlet_id() RETURNS TEXT AS $$
  SELECT outlet_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── Part 1: tables with a direct outlet_id column ────────────────────────────
-- Re-enables RLS where it had been switched off (005/006/007/008) and
-- replaces every "logged in = full access" policy with "logged in AND
-- same outlet = full access."
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories', 'menu_items', 'order_items',
    'ingredients', 'sub_recipes', 'recipes', 'items', 'purchase_log',
    'vendors', 'procurement_requests',
    'loyalty_settings', 'loyalty_customers', 'loyalty_transactions',
    'production_batches', 'expenses', 'ingredient_price_history',
    'checklist_templates', 'checklist_logs', 'business_resource_progress',
    'stamp_card_programs', 'stamp_cards', 'outlet_branding'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop every previous "full access" policy name this table might have had
    -- across earlier migrations (auth_full_*, staff_all_*, expenses_auth) so
    -- we don't end up with two permissive ALL policies silently OR'd together.
    EXECUTE format('DROP POLICY IF EXISTS auth_full_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS staff_all_%I ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_auth ON %I', t, t);

    EXECUTE format(
      'CREATE POLICY tenant_scoped_%I ON %I FOR ALL
         USING (outlet_id = current_outlet_id())
         WITH CHECK (outlet_id = current_outlet_id())',
      t, t
    );
  END LOOP;
END $$;

-- orders: staff-facing policy only (own outlet, full access). Anon
-- insert/read policies are handled separately in 017/018.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_orders ON orders;
CREATE POLICY staff_tenant_scoped_orders ON orders FOR ALL
  USING (outlet_id = current_outlet_id())
  WITH CHECK (outlet_id = current_outlet_id());

-- ── Part 2: tables scoped via a join (no outlet_id column of their own) ─────

-- recipe_items -> recipes.outlet_id
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_recipe_items ON recipe_items;
CREATE POLICY tenant_scoped_recipe_items ON recipe_items FOR ALL
  USING (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_items.recipe_id AND r.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM recipes r WHERE r.id = recipe_items.recipe_id AND r.outlet_id = current_outlet_id()));

-- sub_recipe_items -> sub_recipes.outlet_id
ALTER TABLE sub_recipe_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_sub_recipe_items ON sub_recipe_items;
CREATE POLICY tenant_scoped_sub_recipe_items ON sub_recipe_items FOR ALL
  USING (EXISTS (SELECT 1 FROM sub_recipes sr WHERE sr.id = sub_recipe_items.sub_recipe_id AND sr.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM sub_recipes sr WHERE sr.id = sub_recipe_items.sub_recipe_id AND sr.outlet_id = current_outlet_id()));

-- stock -> items.outlet_id
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_stock ON stock;
CREATE POLICY tenant_scoped_stock ON stock FOR ALL
  USING (EXISTS (SELECT 1 FROM items i WHERE i.id = stock.item_id AND i.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM items i WHERE i.id = stock.item_id AND i.outlet_id = current_outlet_id()));

-- procurement_items -> procurement_requests.outlet_id
-- (was RLS-disabled entirely by 005 — re-enabled here)
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_procurement_items ON procurement_items;
CREATE POLICY tenant_scoped_procurement_items ON procurement_items FOR ALL
  USING (EXISTS (SELECT 1 FROM procurement_requests pr WHERE pr.id = procurement_items.request_id AND pr.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM procurement_requests pr WHERE pr.id = procurement_items.request_id AND pr.outlet_id = current_outlet_id()));

-- vendor_shops -> vendors.outlet_id
ALTER TABLE vendor_shops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_vendor_shops ON vendor_shops;
CREATE POLICY tenant_scoped_vendor_shops ON vendor_shops FOR ALL
  USING (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_shops.vendor_id AND v.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM vendors v WHERE v.id = vendor_shops.vendor_id AND v.outlet_id = current_outlet_id()));

-- vendor_item_prices -> vendor_shops -> vendors.outlet_id (two hops)
ALTER TABLE vendor_item_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_vendor_item_prices ON vendor_item_prices;
CREATE POLICY tenant_scoped_vendor_item_prices ON vendor_item_prices FOR ALL
  USING (EXISTS (
    SELECT 1 FROM vendor_shops vs JOIN vendors v ON v.id = vs.vendor_id
    WHERE vs.id = vendor_item_prices.shop_id AND v.outlet_id = current_outlet_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM vendor_shops vs JOIN vendors v ON v.id = vs.vendor_id
    WHERE vs.id = vendor_item_prices.shop_id AND v.outlet_id = current_outlet_id()
  ));

-- sub_recipe_batch_options -> sub_recipes.outlet_id (was RLS-disabled by 008)
ALTER TABLE sub_recipe_batch_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scoped_sub_recipe_batch_options ON sub_recipe_batch_options FOR ALL
  USING (EXISTS (SELECT 1 FROM sub_recipes sr WHERE sr.id = sub_recipe_batch_options.sub_recipe_id AND sr.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM sub_recipes sr WHERE sr.id = sub_recipe_batch_options.sub_recipe_id AND sr.outlet_id = current_outlet_id()));

-- sub_recipe_stock -> sub_recipes.outlet_id (was RLS-disabled by 008)
ALTER TABLE sub_recipe_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scoped_sub_recipe_stock ON sub_recipe_stock FOR ALL
  USING (EXISTS (SELECT 1 FROM sub_recipes sr WHERE sr.id = sub_recipe_stock.sub_recipe_id AND sr.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM sub_recipes sr WHERE sr.id = sub_recipe_stock.sub_recipe_id AND sr.outlet_id = current_outlet_id()));

-- inventory_stock -> ingredients.outlet_id (was RLS-disabled by 007)
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scoped_inventory_stock ON inventory_stock FOR ALL
  USING (EXISTS (SELECT 1 FROM ingredients i WHERE i.id = inventory_stock.ingredient_id AND i.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM ingredients i WHERE i.id = inventory_stock.ingredient_id AND i.outlet_id = current_outlet_id()));

-- checklist_template_items -> checklist_templates.outlet_id
ALTER TABLE checklist_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_all_checklist_template_items ON checklist_template_items;
CREATE POLICY tenant_scoped_checklist_template_items ON checklist_template_items FOR ALL
  USING (EXISTS (SELECT 1 FROM checklist_templates ct WHERE ct.id = checklist_template_items.template_id AND ct.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM checklist_templates ct WHERE ct.id = checklist_template_items.template_id AND ct.outlet_id = current_outlet_id()));

-- checklist_log_entries -> checklist_logs.outlet_id
ALTER TABLE checklist_log_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_all_checklist_log_entries ON checklist_log_entries;
CREATE POLICY tenant_scoped_checklist_log_entries ON checklist_log_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM checklist_logs cl WHERE cl.id = checklist_log_entries.log_id AND cl.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM checklist_logs cl WHERE cl.id = checklist_log_entries.log_id AND cl.outlet_id = current_outlet_id()));

-- stamp_card_events -> stamp_cards.outlet_id
ALTER TABLE stamp_card_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_stamp_card_events ON stamp_card_events;
CREATE POLICY tenant_scoped_stamp_card_events ON stamp_card_events FOR ALL
  USING (EXISTS (SELECT 1 FROM stamp_cards sc WHERE sc.id = stamp_card_events.card_id AND sc.outlet_id = current_outlet_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM stamp_cards sc WHERE sc.id = stamp_card_events.card_id AND sc.outlet_id = current_outlet_id()));

-- ── Part 3: intentionally left alone (documented, not overlooked) ───────────
-- brands: no outlet_id column, genuinely shared reference data across outlets.
-- Still requires login to write (auth_full_brands from 002 stays as-is —
-- it was never outlet-scoped because the table has nothing to scope by).
