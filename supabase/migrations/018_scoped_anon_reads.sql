-- ============================================================
-- Migration 018: Replace unconditional anon reads with scoped RPCs
-- (fixes C-6, and the lower-severity twin on stamp_card_programs)
--
-- `anon_read_orders` and `anon_read_stamp_cards` were both
-- `FOR SELECT USING (true)` — described in their original migration
-- comments as "the id/code is the bearer token," but RLS `USING (true)`
-- grants unconditional access to the whole table, not "only if you
-- already know the id." Anyone with the public anon key could dump
-- every order (phone numbers, totals, items) or every stamp card
-- (phone numbers) across every restaurant with one unfiltered query.
--
-- Fix: a SECURITY DEFINER RPC per id-lookup, each taking the id/code
-- as a required parameter and returning only that one row. This is
-- the same shape already used successfully for add_stamp/
-- redeem_stamp_card in 009 — extending an existing, working pattern.
-- ============================================================

CREATE OR REPLACE FUNCTION get_order_for_tracking(p_order_id UUID) RETURNS orders AS $$
  SELECT * FROM orders WHERE id = p_order_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_order_for_tracking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_order_for_tracking(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_stamp_card_by_code(p_card_code TEXT) RETURNS stamp_cards AS $$
  SELECT * FROM stamp_cards WHERE card_code = p_card_code;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_stamp_card_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stamp_card_by_code(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_stamp_program_by_id(p_program_id UUID) RETURNS stamp_card_programs AS $$
  SELECT * FROM stamp_card_programs WHERE id = p_program_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_stamp_program_by_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_stamp_program_by_id(UUID) TO anon, authenticated;

-- Remove the table-wide anon reads these RPCs replace.
DROP POLICY IF EXISTS anon_read_orders ON orders;
DROP POLICY IF EXISTS anon_read_stamp_cards ON stamp_cards;
DROP POLICY IF EXISTS anon_read_stamp_card_programs ON stamp_card_programs;

-- Note on Realtime: OrderTracking.tsx previously used a `postgres_changes`
-- subscription for live status updates, which depended on the anon SELECT
-- policy above to authorize delivery. With that policy gone, an anonymous
-- realtime subscription on `orders` can no longer be authorized at all —
-- there's no per-session concept of "you're allowed to see order X" for
-- Realtime to check the way there is for a single RPC call. OrderTracking.tsx
-- is updated alongside this migration to poll get_order_for_tracking() on an
-- interval instead — still auto-updates without a page refresh, just via
-- polling rather than a push subscription.
