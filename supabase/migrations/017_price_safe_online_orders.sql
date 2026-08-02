-- ============================================================
-- Migration 017: Price-safe online ordering (fixes C-5)
--
-- Before this migration, CustomerSelfOrder.tsx computed subtotal/gst/
-- total in the browser and inserted them directly into `orders`, and
-- the anon INSERT policy on `orders`/`order_items` only checked status
-- flags (order_source/payment_status/status), never the money fields
-- or that `items` matched real menu prices. Anyone with the public
-- anon key could place an order at any price they chose.
--
-- Fix: the ONLY way an anonymous customer can create an order now is
-- this RPC. It looks up every item's real price from `menu_items`
-- itself — server-side, inside the same transaction — and rebuilds
-- both the stored `items` JSONB and `subtotal`/`gst`/`total` from that,
-- discarding whatever price/name the client sent. The old direct
-- INSERT policies are dropped so there is no other way in.
-- ============================================================

CREATE OR REPLACE FUNCTION place_online_order(
  p_outlet_id       TEXT,
  p_items           JSONB,           -- [{ "id": uuid, "quantity": int }, ...] — id/quantity only, nothing else is trusted
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

    -- The only trustworthy source of name/price is menu_items itself,
    -- looked up fresh, scoped to this outlet, and only if still on sale.
    SELECT name, price INTO v_name, v_price
    FROM menu_items
    WHERE id = v_item_id AND outlet_id = p_outlet_id AND available = true;

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

  -- order_items mirrors the same server-verified item_id/quantity pairs.
  INSERT INTO order_items (order_id, outlet_id, item_id, quantity)
  SELECT v_order.id, p_outlet_id, (elem->>'id')::uuid, (elem->>'quantity')::int
  FROM jsonb_array_elements(v_items_out) elem;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Anonymous customers AND logged-in staff (e.g. testing the flow) may
-- call this — but only this, never a direct table insert.
REVOKE ALL ON FUNCTION place_online_order(TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION place_online_order(TEXT, JSONB, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Remove the old direct-insert paths — the RPC is now the only door in.
DROP POLICY IF EXISTS anon_insert_online_orders ON orders;
DROP POLICY IF EXISTS anon_insert_online_order_items ON order_items;
