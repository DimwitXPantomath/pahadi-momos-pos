-- ============================================================
-- Migration 007: Ingredient Schema Refactor
-- Drops superseded legacy columns, adds preferred_vendor_id,
-- and recalculates cost_per_usage_unit from cost_per_unit.
-- Safe to re-run (all ops use IF EXISTS / IF NOT EXISTS).
-- ============================================================

-- 1. Add preferred_vendor_id if not yet present
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS preferred_vendor_id UUID REFERENCES vendors(id);

-- 2. Drop legacy ml-specific columns (may not exist on all instances)
ALTER TABLE ingredients
  DROP COLUMN IF EXISTS ml_per_box,
  DROP COLUMN IF EXISTS total_ml,
  DROP COLUMN IF EXISTS usable_ml,
  DROP COLUMN IF EXISTS wastage_ml,
  DROP COLUMN IF EXISTS cost_per_ml,
  DROP COLUMN IF EXISTS quantity_bought_in_boxes;

-- 3. Drop superseded columns (replaced by units_per_purchase,
--    cost_per_unit, yield_percentage, cost_per_usage_unit)
ALTER TABLE ingredients
  DROP COLUMN IF EXISTS purchase_qty,
  DROP COLUMN IF EXISTS purchase_cost,
  DROP COLUMN IF EXISTS processing_yield_pct,
  DROP COLUMN IF EXISTS usable_qty,
  DROP COLUMN IF EXISTS wastage_qty;

-- 4. Recalculate cost_per_usage_unit from the new cost_per_unit field
--    Formula: cost_per_unit / (units_per_purchase * yield_percentage / 100)
UPDATE ingredients
SET cost_per_usage_unit =
  CASE
    WHEN units_per_purchase > 0
     AND yield_percentage    > 0
     AND cost_per_unit       > 0
    THEN cost_per_unit / (units_per_purchase * (yield_percentage / 100.0))
    ELSE cost_per_usage_unit   -- leave unchanged if data is incomplete
  END;

-- 5. Create inventory_stock table if it doesn't exist
--    (used by the bulk stock-update tab in IngredientsView)
CREATE TABLE IF NOT EXISTS inventory_stock (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id    UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  current_quantity NUMERIC NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ingredient_id)
);

ALTER TABLE inventory_stock DISABLE ROW LEVEL SECURITY;
