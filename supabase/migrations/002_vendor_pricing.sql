-- ============================================================
-- Module 7 & 8: Vendor Pricing + Procurement Schema
-- Run after 001_initial_schema.sql in Supabase SQL editor.
-- ============================================================

-- ── Vendor Shops (branches per vendor) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_shops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  shop_name   TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT 'Bhopal',
  phone       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_shops_vendor_idx ON vendor_shops(vendor_id);

-- Add type column to vendors if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'type'
  ) THEN
    ALTER TABLE vendors ADD COLUMN type TEXT NOT NULL DEFAULT 'offline'
      CHECK (type IN ('online','offline'));
  END IF;
END $$;

-- ── Brands ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL UNIQUE
);

-- ── Vendor Item Prices ───────────────────────────────────────────────────────
-- Price catalog: which shop sells which ingredient at what price/brand/qty
CREATE TABLE IF NOT EXISTS vendor_item_prices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id             UUID NOT NULL REFERENCES vendor_shops(id) ON DELETE CASCADE,
  ingredient_id       UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  brand_id            UUID REFERENCES brands(id) ON DELETE SET NULL,
  price               NUMERIC NOT NULL CHECK (price >= 0),
  unit                TEXT NOT NULL,           -- same as ingredient base unit
  min_qty             NUMERIC NOT NULL DEFAULT 1,
  is_available        BOOLEAN NOT NULL DEFAULT true,
  delivery_available  BOOLEAN NOT NULL DEFAULT false,
  delivery_time_hrs   INT,
  product_url         TEXT,
  last_updated        TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vip_shop_idx        ON vendor_item_prices(shop_id);
CREATE INDEX IF NOT EXISTS vip_ingredient_idx  ON vendor_item_prices(ingredient_id);

-- ── Procurement Items: ensure all columns exist ───────────────────────────────
-- The existing table may already have requested_qty; add price/confirmed columns if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_items' AND column_name = 'price_per_unit'
  ) THEN
    ALTER TABLE procurement_items ADD COLUMN price_per_unit NUMERIC;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_items' AND column_name = 'confirmed_qty'
  ) THEN
    ALTER TABLE procurement_items ADD COLUMN confirmed_qty NUMERIC;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_items' AND column_name = 'is_available'
  ) THEN
    ALTER TABLE procurement_items ADD COLUMN is_available BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_items' AND column_name = 'unit'
  ) THEN
    ALTER TABLE procurement_items ADD COLUMN unit TEXT NOT NULL DEFAULT 'g';
  END IF;
END $$;

-- ── Procurement Requests: ensure status options are correct ──────────────────
-- Drop and re-add constraint to allow all status values
ALTER TABLE procurement_requests DROP CONSTRAINT IF EXISTS procurement_requests_status_check;
ALTER TABLE procurement_requests ADD CONSTRAINT procurement_requests_status_check
  CHECK (status IN ('draft','sent','responded','confirmed','completed','cancelled'));

-- ── RLS ───────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['vendor_shops','brands','vendor_item_prices']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_full_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_full_%I ON %I FOR ALL USING (auth.uid() IS NOT NULL)', t, t
    );
  END LOOP;
END $$;
