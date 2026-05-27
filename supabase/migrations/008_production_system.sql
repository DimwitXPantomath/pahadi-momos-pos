-- ============================================================
-- Migration 008: Production System
-- Sub recipe stocking, batch options, expiry tracking,
-- main recipe production batches.
-- Safe to re-run (all ops use IF EXISTS / IF NOT EXISTS).
-- ============================================================

-- 1. Add shelf_life_hours to sub_recipes (default 24h)
ALTER TABLE sub_recipes
  ADD COLUMN IF NOT EXISTS shelf_life_hours NUMERIC NOT NULL DEFAULT 24 CHECK (shelf_life_hours > 0);

-- 2. Custom batch quantity options per sub recipe
--    e.g. "Small – 250g", "Standard – 500g", "Catering – 2000g"
CREATE TABLE IF NOT EXISTS sub_recipe_batch_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_recipe_id   UUID NOT NULL REFERENCES sub_recipes(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  quantity        NUMERIC NOT NULL CHECK (quantity > 0),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS srbopt_sr_idx ON sub_recipe_batch_options(sub_recipe_id);

ALTER TABLE sub_recipe_batch_options DISABLE ROW LEVEL SECURITY;

-- 3. Sub recipe stock — one row per production event
--    Quantity decreases as it gets consumed by main recipe production.
--    Rows are kept permanently for spoilage/history analysis.
CREATE TABLE IF NOT EXISTS sub_recipe_stock (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_recipe_id       UUID NOT NULL REFERENCES sub_recipes(id) ON DELETE CASCADE,
  batch_option_id     UUID REFERENCES sub_recipe_batch_options(id) ON DELETE SET NULL,
  quantity            NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  original_quantity   NUMERIC NOT NULL DEFAULT 0,
  unit                TEXT NOT NULL,
  produced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  is_spoiled          BOOLEAN NOT NULL DEFAULT FALSE,
  spoiled_qty         NUMERIC,
  spoiled_at          TIMESTAMPTZ,
  spoil_notes         TEXT,
  alarm_acknowledged  BOOLEAN NOT NULL DEFAULT FALSE,
  snoozed_until       TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS srstock_sr_idx      ON sub_recipe_stock(sub_recipe_id);
CREATE INDEX IF NOT EXISTS srstock_expires_idx ON sub_recipe_stock(expires_at);

ALTER TABLE sub_recipe_stock DISABLE ROW LEVEL SECURITY;

-- 4. Main recipe production batches
--    Records production of finished goods using recipes.
--    output_item_id: optional link to items table (finished_good category)
--    to auto-credit stock after production.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS output_item_id UUID REFERENCES items(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS production_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       TEXT NOT NULL DEFAULT 'demo-outlet',
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  servings        NUMERIC NOT NULL CHECK (servings > 0),
  produced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prodbatch_recipe_idx ON production_batches(recipe_id);
CREATE INDEX IF NOT EXISTS prodbatch_outlet_idx ON production_batches(outlet_id);

ALTER TABLE production_batches DISABLE ROW LEVEL SECURITY;
