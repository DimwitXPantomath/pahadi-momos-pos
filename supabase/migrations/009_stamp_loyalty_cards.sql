-- ── Stamp Loyalty Cards ─────────────────────────────────────────────────────
-- "Buy N, get 1 free"-style loyalty program, run alongside the existing
-- points program (loyalty_settings / loyalty_customers / loyalty_transactions
-- from 001_initial_schema.sql — untouched by this migration).
--
-- One active stamp-card program per outlet (v1). Each customer (keyed by
-- phone, same identity field CartPanel already collects at checkout) gets one
-- card per program. A physical card and a digital "wallet" page both resolve
-- to the same row via card_code — whichever one the customer has in hand,
-- the count stays in sync because there's only one record.

CREATE TABLE IF NOT EXISTS stamp_card_programs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id         TEXT NOT NULL UNIQUE DEFAULT 'demo-outlet',
  name              TEXT NOT NULL DEFAULT 'Loyalty Stamp Card',
  stamps_required   INT NOT NULL DEFAULT 10 CHECK (stamps_required > 0),
  reward_type       TEXT NOT NULL DEFAULT 'discount_percent'
                      CHECK (reward_type IN ('discount_percent','discount_flat','complimentary_item')),
  reward_value      NUMERIC,           -- percent (0-100) or flat rupee amount; NULL for complimentary_item
  reward_description TEXT,             -- e.g. "Free Chicken Momo Plate" or a custom label shown to staff/customer
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

-- ── updated_at triggers (reuses update_updated_at_column() from 001) ───────
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

-- ── Atomic stamp / redeem RPCs ──────────────────────────────────────────────
-- Both do their read-modify-write in a single statement so two concurrent
-- checkouts for the same phone number can't race and corrupt the count —
-- unlike the client-side stock deduction in placeOrder(), which does not
-- have this guarantee.

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

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Staff (authenticated POS) get full read/write on all three tables, same
-- pattern as every other table in this app.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['stamp_card_programs', 'stamp_cards', 'stamp_card_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_full_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY auth_full_%I ON %I FOR ALL USING (auth.uid() IS NOT NULL)',
      t, t
    );
  END LOOP;
END $$;

-- The customer-facing digital card page (/loyalty-card/:code) has no login,
-- so it needs its own read-only anon policy — same "the code is the bearer
-- token" trust model this app already uses for /order/:id. This does mean
-- anyone with a card_code can read that one row (phone number included), same
-- exposure level as the existing order-tracking link. Do not widen this to
-- stamp_card_events (internal log, no anon policy on it at all).
DROP POLICY IF EXISTS anon_read_stamp_cards ON stamp_cards;
CREATE POLICY anon_read_stamp_cards ON stamp_cards FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_read_stamp_card_programs ON stamp_card_programs;
CREATE POLICY anon_read_stamp_card_programs ON stamp_card_programs FOR SELECT USING (true);

-- Seed one default (inactive) program per known outlet so the app has
-- something to load on first render instead of a null state.
INSERT INTO stamp_card_programs (outlet_id, name, stamps_required, reward_type, reward_value, reward_description, is_active)
VALUES ('demo-outlet', 'Loyalty Stamp Card', 10, 'discount_percent', 100, 'Free item on the house', false)
ON CONFLICT (outlet_id) DO NOTHING;
