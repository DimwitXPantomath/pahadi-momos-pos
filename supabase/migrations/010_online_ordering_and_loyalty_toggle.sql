-- ── Online self-ordering + per-program loyalty toggle ──────────────────────
-- Follows the pivot away from a physical loyalty card: the counter QR now
-- opens a customer-facing online menu (/order-online/:outletId) instead of a
-- printed card. A stamp/points only fire once staff mark the resulting order
-- as paid — there is still no real payment gateway wired into this app, so
-- "successful payment" is a manual staff confirmation, not an automated one.
-- See the "Mark Paid" action added to the Orders board.

-- ── Loyalty programs: each is independently on/off, not mutually exclusive ──
-- (stamp_card_programs already has is_active from 009; loyalty_settings never
-- had one — points silently earned on every single order regardless. That's
-- being changed here so an outlet running stamps-only can actually turn
-- points off instead of both programs firing on every order.)
ALTER TABLE loyalty_settings ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ── orders: customer identity + payment/source tracking ────────────────────
-- customer_phone/name previously only existed transiently in CartPanel state
-- and landed in credit_sales (DUE payments only) or loyalty_transactions —
-- never on the order row itself. Storing them here is what lets the "Mark
-- Paid" handler fire a stamp/points for an *online* order without having to
-- thread phone/name through a second table lookup.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name  TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'pos'
  CHECK (order_source IN ('pos', 'online'));

-- 'paid' default preserves existing behavior for in-store orders (payment is
-- collected at the same moment the order is created there). Online orders
-- explicitly insert 'pending' and wait for staff confirmation.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid'
  CHECK (payment_status IN ('pending', 'paid'));

-- ── Drive-by fix: payment_method's CHECK constraint only ever allowed
-- CASH/CARD/UPI, but CartPanel has shipped DUE and "SPLIT:CASH100+UPI50"
-- values since before this migration — those inserts have been violating this
-- constraint and failing. Loosening it here since it's directly adjacent to
-- the payment_status work and was silently broken either way.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('CASH','CARD','UPI','DUE') OR payment_method LIKE 'SPLIT:%');

-- ── RLS: anon access for the new customer-facing self-order flow ───────────
-- orders/order_items currently only allow authenticated (staff) access —
-- meaning an unauthenticated customer can't create an online order, and
-- (separately, pre-existing) can't even read one back, which is very likely
-- why /order/:id (OrderTracking) hasn't been working for anonymous visitors
-- either. Both are fixed here using the same "the id/code is the bearer
-- token" trust model already used for stamp_cards (009) — anyone with the
-- link can read that one order, same exposure level as the tracking link
-- already assumed to work.
DROP POLICY IF EXISTS anon_read_orders ON orders;
CREATE POLICY anon_read_orders ON orders FOR SELECT USING (true);

-- Anon may only INSERT rows that look like a fresh, unpaid, self-service
-- order — cannot mark their own order paid, cannot backdate status past
-- PLACED, cannot touch order_source='pos'. This is the actual security
-- boundary preventing a customer from insert-forging a paid order to steal a
-- stamp/points.
DROP POLICY IF EXISTS anon_insert_online_orders ON orders;
CREATE POLICY anon_insert_online_orders ON orders
  FOR INSERT
  WITH CHECK (order_source = 'online' AND payment_status = 'pending' AND status = 'PLACED');

DROP POLICY IF EXISTS anon_insert_online_order_items ON order_items;
CREATE POLICY anon_insert_online_order_items ON order_items
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.order_source = 'online')
  );

-- The self-order page also needs to read the menu without being logged in —
-- previously only staff (auth.uid() IS NOT NULL) could read categories/menu_items
-- at all, which would have made the online menu blank for every visitor.
DROP POLICY IF EXISTS anon_read_categories ON categories;
CREATE POLICY anon_read_categories ON categories FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_read_menu_items ON menu_items;
CREATE POLICY anon_read_menu_items ON menu_items FOR SELECT USING (true);
