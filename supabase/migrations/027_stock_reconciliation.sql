-- 027_stock_reconciliation.sql
--
-- Prerequisite fix for the low-stock-alert feature (see 028_*.sql):
-- discovered while building it that this app has THREE independent,
-- disconnected ingredient stock counters that silently drift apart
-- (ingredients.current_stock, inventory_stock.current_quantity, and a
-- third from the unrelated items/stock finished-goods system, left
-- alone here — different concern). Decision (confirmed with the
-- owner): inventory_stock.current_quantity becomes the ONE running
-- number going forward. Order placement already wrote here
-- (inventoryService.ts). Production deduction (ProductionPage.tsx) is
-- being switched to write here too in this same change.
-- ingredients.current_stock is left in place (not dropped — avoid a
-- destructive change to a live column something else might still
-- read) but the app stops writing/reading it as of this migration.
--
-- Manual stock edits (IngredientsPage.tsx's "Stock Update" tab, "set
-- exact amount" adjustments specifically — i.e. a physical count) take
-- priority: whatever the staff member enters overwrites
-- inventory_stock.current_quantity outright. This table is the audit
-- trail of that: what the system expected (the auto-updated number
-- from sales/production) vs what the physical count actually found.
-- "add"/"remove" adjustments (e.g. logging a delivery received outside
-- Procurement) are NOT logged here — those are intentional deltas, not
-- a discrepancy discovery, so there's no "expected vs actual" to show.

CREATE TABLE IF NOT EXISTS stock_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id text NOT NULL DEFAULT 'demo-outlet',
  ingredient_id uuid NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  expected_quantity numeric NOT NULL,      -- inventory_stock.current_quantity immediately before this edit
  actual_quantity numeric NOT NULL,        -- what the physical count found (the new value)
  difference numeric GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
  usage_unit text,                         -- snapshot of ingredients.usage_unit at the time, for display
  adjusted_by uuid REFERENCES auth.users(id),
  adjusted_by_role text,                   -- snapshot of profiles.role at the time — role can change later, this shouldn't
  adjusted_by_name text,                   -- snapshot of profiles.full_name — avoids a cross-user profiles join under RLS
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_reconciliation_ingredient ON stock_reconciliation_log(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_reconciliation_created_at ON stock_reconciliation_log(created_at DESC);

COMMENT ON TABLE stock_reconciliation_log IS
  'Audit trail of physical-count stock corrections — expected (system/auto) vs actual (what staff physically found), red/green in the UI. Append-only from the app; no UPDATE/DELETE policy granted, so a correction is a new row, not an edit to history.';

ALTER TABLE stock_reconciliation_log ENABLE ROW LEVEL SECURITY;

-- Outlet-scoped only, matching every other business table in this app
-- (015_tenant_scoped_rls.sql) — this app has no DB-level role
-- enforcement anywhere yet, role gating is UI-only (Layout.tsx nav
-- filtering). Not introducing a first-of-its-kind role-gated RLS
-- policy here without that being an explicit ask; "visible to
-- biller/owner/manager" is enforced by which nav items/tabs render,
-- same mechanism as Settings/Analytics/Expenses today. Practically,
-- since this app only has three roles total (owner/manager/staff) and
-- "biller" was mapped to "staff" (see chat) for this feature, that's
-- every signed-in role anyway.
CREATE POLICY "stock_reconciliation_log outlet read"
  ON stock_reconciliation_log FOR SELECT
  USING (outlet_id = current_outlet_id());

CREATE POLICY "stock_reconciliation_log outlet insert"
  ON stock_reconciliation_log FOR INSERT
  WITH CHECK (outlet_id = current_outlet_id());
