-- ============================================================
-- Schema foundation for PRAANG Ahead (pre-order) + Taste Palette
-- (taste-matching). Code that uses this comes in follow-up steps —
-- this migration only adds structure, no app logic yet.
--
-- Design calls made here, so they're visible instead of buried:
--
-- 1. Extending the EXISTING `outlets` table (bigint id, currently
--    disconnected scaffolding — see 2026-08-03 Known Gotchas entry)
--    rather than creating a new one. Adding `outlet_key TEXT UNIQUE`
--    and backfilling the one existing row to 'demo-outlet' finally
--    connects it to the text-key convention every other table
--    already uses (orders.outlet_id, expenses.outlet_id, etc).
--    New PRAANG Ahead / Taste Palette tables reference outlet_key,
--    not outlets.id, for consistency with the rest of the schema.
--    This does NOT fix the deeper profiles.outlet_id (uuid) mismatch
--    from migration 020 — that's still a separate, unresolved item,
--    out of scope for this feature build.
--
-- 2. taste_profiles is NOT reachable via any RLS policy directly.
--    Customers authenticate via Firebase (per spec §4), not Supabase
--    Auth, so auth.uid() has no way to know which row is "theirs" —
--    same structural problem orders/stamp_cards solved earlier this
--    project by going through SECURITY DEFINER RPCs keyed by an
--    opaque ID the caller must already know, instead of raw table
--    policies. Same pattern here: RLS enabled, zero policies, all
--    access via RPCs (get_taste_profile / upsert_taste_profile,
--    built in a follow-up step) that take customer_uid as a
--    parameter. This matters more than usual here since the table
--    holds allergen data.
--
-- 3. Pre-orders reuse the existing `orders` table (per spec §2.4 —
--    "same order kanban... do not build a parallel order pipeline"),
--    extended with a few nullable columns rather than a new table.
-- ============================================================


-- ============================================================
-- Outlets: connect the existing table to the outlet_key convention,
-- add PRAANG Ahead fields.
-- ============================================================

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS outlet_key TEXT;
UPDATE outlets SET outlet_key = 'demo-outlet' WHERE outlet_key IS NULL;
ALTER TABLE outlets ALTER COLUMN outlet_key SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'outlets_outlet_key_key'
  ) THEN
    ALTER TABLE outlets ADD CONSTRAINT outlets_outlet_key_key UNIQUE (outlet_key);
  END IF;
END $$;

ALTER TABLE outlets ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS preorder_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE outlets ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC NOT NULL DEFAULT 10;

ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_outlets ON outlets;
CREATE POLICY staff_manage_outlets ON outlets FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- Public needs to read outlet name/location/preorder_enabled to route
-- the /ahead landing page and render the nearby-outlets list.
DROP POLICY IF EXISTS anon_read_outlets ON outlets;
CREATE POLICY anon_read_outlets ON outlets FOR SELECT USING (true);


-- ============================================================
-- Prep-time estimates: static, outlet-set, per menu category.
-- categories has no outlet_id (shared/global list today), so this
-- is a join table rather than columns directly on categories.
-- ============================================================

CREATE TABLE IF NOT EXISTS outlet_category_prep_times (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_key        TEXT NOT NULL REFERENCES outlets(outlet_key) ON DELETE CASCADE,
  category_id       UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  prep_min_minutes  INT NOT NULL DEFAULT 15 CHECK (prep_min_minutes > 0),
  prep_max_minutes  INT NOT NULL DEFAULT 20 CHECK (prep_max_minutes >= prep_min_minutes),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (outlet_key, category_id)
);

ALTER TABLE outlet_category_prep_times ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_prep_times ON outlet_category_prep_times;
CREATE POLICY staff_manage_prep_times ON outlet_category_prep_times FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS anon_read_prep_times ON outlet_category_prep_times;
CREATE POLICY anon_read_prep_times ON outlet_category_prep_times FOR SELECT USING (true);


-- ============================================================
-- Orders: extend for pre-orders instead of a parallel table.
-- ============================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_source_check
  CHECK (order_source IN ('pos', 'online', 'preorder'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT CHECK (fulfillment_type IS NULL OR fulfillment_type IN ('dine_in', 'pack'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_fee_charged NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS preorder_for TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_refund_pct SMALLINT CHECK (cancellation_refund_pct IS NULL OR cancellation_refund_pct IN (0, 50, 100));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT;


-- ============================================================
-- Settlement ledger: manual settlement at this scale (per spec
-- §2.7) — a record of what's owed per outlet, marked paid by staff
-- on a schedule. No automated payout splitting.
-- ============================================================

CREATE TABLE IF NOT EXISTS outlet_settlement_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_key    TEXT NOT NULL REFERENCES outlets(outlet_key) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount_owed   NUMERIC NOT NULL,
  paid_out      BOOLEAN NOT NULL DEFAULT false,
  paid_out_at   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outlet_settlement_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_settlement_ledger ON outlet_settlement_ledger;
CREATE POLICY staff_manage_settlement_ledger ON outlet_settlement_ledger FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- No anon policy at all — outlets don't get direct DB access to their
-- own ledger in v1; this is founder-run manually per spec.


-- ============================================================
-- Taste Palette: dish tagging fields on menu_items.
-- Nullable with NO defaults on the safety-relevant fields
-- (dietary_type, allergens) — per spec, an untagged dish must never
-- silently read as "safe." Completeness / not-yet-rated handling is
-- computed in the app layer, not stored.
-- ============================================================

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS dietary_type TEXT CHECK (dietary_type IS NULL OR dietary_type IN ('vegetarian','non_vegetarian','eggetarian','vegan','jain'));
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergens TEXT[];
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS spice_level SMALLINT CHECK (spice_level IS NULL OR spice_level BETWEEN 1 AND 5);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS estimated_calories NUMERIC;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS calories_manually_overridden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cooking_type TEXT[];
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cuisine_category TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS meal_course_type TEXT CHECK (meal_course_type IS NULL OR meal_course_type IN ('starter','main','dessert','beverage','snack'));
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS flavor_profile TEXT[];
-- price_tier is deliberately NOT a stored column — it's relative to
-- the outlet's own menu average, which drifts as prices change.
-- Computed in the app/query layer instead of cached here.

-- Ingredient calorie reference data (IFCT/INDB import target).
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS calories_per_usage_unit NUMERIC;

-- menu_items already has anon SELECT + staff manage policies from
-- migration 020 — these new columns inherit that, no new policy
-- needed here.


-- ============================================================
-- Taste Palette: customer profile. Platform-wide, not outlet-scoped
-- (a customer's taste doesn't change outlet to outlet). Keyed by
-- Firebase UID; phone stored as the anchor identity per spec §4.
-- RLS enabled with ZERO policies — see header comment. All access
-- goes through RPCs built in a follow-up step.
-- ============================================================

CREATE TABLE IF NOT EXISTS taste_profiles (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_uid              TEXT NOT NULL UNIQUE,
  phone                     TEXT,
  dietary_type              TEXT CHECK (dietary_type IS NULL OR dietary_type IN ('vegetarian','non_vegetarian','eggetarian','vegan','jain')),
  allergens                 TEXT[],
  spice_tolerance           SMALLINT CHECK (spice_tolerance IS NULL OR spice_tolerance BETWEEN 1 AND 5),
  calorie_awareness         TEXT CHECK (calorie_awareness IS NULL OR calorie_awareness IN ('low_focus','moderate','no_preference')),
  budget_sensitivity        TEXT CHECK (budget_sensitivity IS NULL OR budget_sensitivity IN ('budget','mid_range','no_preference')),
  cuisine_preferences       TEXT[],
  cooking_type_preferences  TEXT[],
  meal_course_preferences   TEXT[],
  flavor_preferences        TEXT[],
  texture_preference        TEXT,
  portion_preference        TEXT,
  health_goal                TEXT,
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS taste_profiles_phone_idx ON taste_profiles(phone);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'taste_profiles_updated_at' AND tgrelid = 'taste_profiles'::regclass
  ) THEN
    CREATE TRIGGER taste_profiles_updated_at BEFORE UPDATE ON taste_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE taste_profiles ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies. Table is reachable only through
-- SECURITY DEFINER RPCs (next migration).

-- ============================================================
-- DONE. This is schema only — no RPCs, no frontend yet. Both
-- follow in subsequent steps, verified against this schema once
-- it's live rather than assumed.
-- ============================================================
