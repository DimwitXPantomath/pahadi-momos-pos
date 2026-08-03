-- ============================================================
-- order_ratings needs anon INSERT after all.
--
-- Migration 020 locked order_ratings to staff-only, reasoning that no
-- frontend code referenced the table. That was only true because
-- OrderTracking.tsx's review-submission code was pointing at a
-- nonexistent table (`order_reviews`) by mistake — every review
-- submission was silently failing while the UI told the customer it
-- worked. Now that the code is fixed to write to the real table
-- (order_ratings, with a `comment` column), customers submitting a
-- review from the unauthenticated order-tracking page need INSERT
-- access back.
--
-- Scoped to INSERT only — no anon SELECT/UPDATE/DELETE, so a customer
-- can add a rating for an order but can't read other customers'
-- ratings or tamper with existing ones. order_id is a uuid a visitor
-- would need to already know (same bearer-token-by-uuid pattern
-- already used for order tracking itself via get_order_for_tracking).
-- ============================================================

DROP POLICY IF EXISTS anon_insert_order_ratings ON order_ratings;
CREATE POLICY anon_insert_order_ratings ON order_ratings FOR INSERT
  WITH CHECK (true);
