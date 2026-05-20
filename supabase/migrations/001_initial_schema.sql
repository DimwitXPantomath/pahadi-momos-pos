-- ============================================================
-- Pahadi Momos POS — Initial Schema
-- Run this once in your Supabase SQL editor.
-- All tables use IF NOT EXISTS so it's safe to re-run.
-- ============================================================

-- ── Profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  role        TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','manager','staff')),
  full_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Menu ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  name        TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  price       NUMERIC NOT NULL DEFAULT 0,
  is_veg      BOOLEAN NOT NULL DEFAULT true,
  available   BOOLEAN NOT NULL DEFAULT true,
  station     TEXT,
  sizes       JSONB DEFAULT '[]',
  addons      JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS menu_items_outlet_idx ON menu_items(outlet_id);
CREATE INDEX IF NOT EXISTS menu_items_category_idx ON menu_items(category_id);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id             TEXT NOT NULL DEFAULT 'demo-outlet',
  token_no              INT,
  items                 JSONB NOT NULL DEFAULT '[]',
  subtotal              NUMERIC NOT NULL DEFAULT 0,
  gst                   NUMERIC NOT NULL DEFAULT 0,
  total                 NUMERIC NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'PLACED'
                          CHECK (status IN ('PLACED','PREPARING','READY','COLLECTED')),
  payment_method        TEXT CHECK (payment_method IN ('CASH','CARD','UPI')),
  table_id              TEXT,
  order_type            TEXT CHECK (order_type IN ('DINE_IN','TAKEAWAY')),
  notes                 TEXT,
  loyalty_points_earned INT NOT NULL DEFAULT 0,
  loyalty_points_used   INT NOT NULL DEFAULT 0,
  ready_at              TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_outlet_idx    ON orders(outlet_id);
CREATE INDEX IF NOT EXISTS orders_status_idx    ON orders(status);
CREATE INDEX IF NOT EXISTS orders_created_idx   ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  item_id     UUID,
  quantity    INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

-- ── Ingredients ───────────────────────────────────────────────────────────────
-- cost_per_unit, usable_qty, wastage_qty are computed on the frontend
-- and stored here for fast reads.
CREATE TABLE IF NOT EXISTS ingredients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id            TEXT NOT NULL DEFAULT 'demo-outlet',
  name                 TEXT NOT NULL,
  unit                 TEXT NOT NULL DEFAULT 'g',   -- base usage unit: g / ml / pcs
  purchase_unit        TEXT NOT NULL DEFAULT 'kg',  -- kg / litre / box / pcs
  purchase_qty         NUMERIC NOT NULL DEFAULT 0,  -- stored in base units (g/ml)
  purchase_cost        NUMERIC NOT NULL DEFAULT 0,
  processing_yield_pct NUMERIC NOT NULL DEFAULT 100 CHECK (processing_yield_pct BETWEEN 0.01 AND 100),
  cost_per_unit        NUMERIC NOT NULL DEFAULT 0,  -- purchase_cost / usable_qty
  usable_qty           NUMERIC NOT NULL DEFAULT 0,  -- purchase_qty * yield_pct / 100
  wastage_qty          NUMERIC NOT NULL DEFAULT 0,  -- purchase_qty - usable_qty
  current_stock        NUMERIC NOT NULL DEFAULT 0,
  min_stock            NUMERIC NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ingredients_outlet_idx ON ingredients(outlet_id);
CREATE INDEX IF NOT EXISTS ingredients_name_idx   ON ingredients(name);

-- ── Sub-Recipes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  name        TEXT NOT NULL,
  yield_qty   NUMERIC NOT NULL DEFAULT 1 CHECK (yield_qty > 0),
  unit        TEXT NOT NULL DEFAULT 'g',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sub_recipes_outlet_idx ON sub_recipes(outlet_id);

CREATE TABLE IF NOT EXISTS sub_recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_recipe_id   UUID NOT NULL REFERENCES sub_recipes(id) ON DELETE CASCADE,
  ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity        NUMERIC NOT NULL CHECK (quantity > 0),
  yield_percent   NUMERIC NOT NULL DEFAULT 100 CHECK (yield_percent BETWEEN 0.01 AND 100),
  wastage         NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sub_recipe_items_sr_idx   ON sub_recipe_items(sub_recipe_id);
CREATE INDEX IF NOT EXISTS sub_recipe_items_ing_idx  ON sub_recipe_items(ingredient_id);

-- ── Recipes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  menu_item_id  UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  serves        NUMERIC NOT NULL DEFAULT 1 CHECK (serves > 0),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recipes_outlet_idx       ON recipes(outlet_id);
CREATE INDEX IF NOT EXISTS recipes_menu_item_idx    ON recipes(menu_item_id);

CREATE TABLE IF NOT EXISTS recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id   UUID REFERENCES ingredients(id) ON DELETE RESTRICT,
  sub_recipe_id   UUID REFERENCES sub_recipes(id) ON DELETE RESTRICT,
  quantity        NUMERIC NOT NULL CHECK (quantity > 0),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  -- exactly one of ingredient_id / sub_recipe_id must be set
  CONSTRAINT recipe_items_exactly_one CHECK (
    (ingredient_id IS NOT NULL AND sub_recipe_id IS NULL) OR
    (sub_recipe_id IS NOT NULL AND ingredient_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS recipe_items_recipe_idx ON recipe_items(recipe_id);

-- ── Inventory (Items + Stock) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'ingredient'
                  CHECK (category IN ('ingredient','finished_good','packaging')),
  unit          TEXT NOT NULL DEFAULT 'pcs',
  reorder_level NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_outlet_idx ON items(outlet_id);

CREATE TABLE IF NOT EXISTS stock (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity    NUMERIC NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id)
);

CREATE TABLE IF NOT EXISTS purchase_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  item_id     UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name   TEXT NOT NULL,
  qty         NUMERIC NOT NULL,
  unit        TEXT NOT NULL,
  total_cost  NUMERIC NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Procurement ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  name        TEXT NOT NULL,
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurement_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id   TEXT NOT NULL DEFAULT 'demo-outlet',
  vendor_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending','Ordered','Received','Cancelled')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS procurement_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  ingredient_id   UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity        NUMERIC NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL DEFAULT 'g',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Loyalty ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_settings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id                 TEXT NOT NULL UNIQUE DEFAULT 'demo-outlet',
  points_per_100            INT NOT NULL DEFAULT 10,
  value_per_point           NUMERIC NOT NULL DEFAULT 0.5,
  min_redeem_points         INT NOT NULL DEFAULT 50,
  customer_phone_for_order  TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       TEXT NOT NULL DEFAULT 'demo-outlet',
  customer_phone  TEXT NOT NULL,
  total_points    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(outlet_id, customer_phone)
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       TEXT NOT NULL DEFAULT 'demo-outlet',
  customer_phone  TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('earned','redeemed')),
  points          INT NOT NULL DEFAULT 0,
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'menu_items', 'orders', 'ingredients', 'sub_recipes',
    'recipes', 'procurement_requests', 'loyalty_settings', 'loyalty_customers'
  ]
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

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Enable RLS on all tables; authenticated users get full access.
-- Phase 3: scope by outlet_id using org membership table.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'categories', 'menu_items', 'orders', 'order_items',
    'ingredients', 'sub_recipes', 'sub_recipe_items', 'recipes', 'recipe_items',
    'items', 'stock', 'purchase_log',
    'vendors', 'procurement_requests', 'procurement_items',
    'loyalty_settings', 'loyalty_customers', 'loyalty_transactions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Drop then recreate so this script is idempotent
    EXECUTE format('DROP POLICY IF EXISTS auth_full_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_full_%I ON %I FOR ALL USING (auth.uid() IS NOT NULL)',
      t, t
    );
  END LOOP;
END $$;
