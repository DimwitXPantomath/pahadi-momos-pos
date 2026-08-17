-- 028_invite_only_signup.sql
--
-- Closes the hole found 2026-08-14: the public "Sign up" tab on
-- /login let anyone create a working account with any email address,
-- and — because every business table's RLS only checks "are you
-- logged in" (auth.uid() IS NOT NULL) or "are you in the one outlet
-- that exists" (current_outlet_id(), a hardcoded constant, same for
-- everyone) — that account immediately had real read/write access to
-- ingredients, procurement, orders, customer phone numbers, etc.
-- Role staff/manager/owner is NOT checked by any table's RLS except
-- profiles itself (016_profiles_lockdown.sql), so a self-registered
-- 'staff' account was never locked out of anything by role — only
-- the sidebar hid nav items from it (cosmetic, not enforcement).
--
-- This migration doesn't change that role-vs-data-access gap (that's
-- a bigger job — role would need to be threaded into every table's
-- RLS policy). What it does: stop anyone from getting an account at
-- all unless an existing owner/manager explicitly invited that email.
--
-- Two invite purposes:
--   'general' — any new dashboard user, via the existing /login
--                Sign up tab. Just needs the email invited; identity
--                is then confirmed by Supabase's own "Confirm email"
--                setting (enable it in the dashboard — this migration
--                can't do that part, it's not something SQL controls).
--   'staff'   — the new /staff-activate flow. Needs BOTH the email
--                invited AND a one-time code the owner/manager hands
--                the staff member directly (WhatsApp, in person,
--                whatever channel they already trust). No SMS
--                involved anywhere — real phone-OTP isn't available
--                in this project yet (needs a paid Firebase plan +
--                DLT/TRAI sender registration, see useCustomerAuth.ts).
--
-- IMPORTANT — read before running:
-- This adds a BEFORE INSERT trigger on auth.users. That fires for
-- EVERY new-user code path, not just this app's signUp() calls —
-- including manually adding a user from the Supabase dashboard
-- ("Authentication → Users → Add user"). After this migration, even
-- that dashboard path needs a matching invites row first, or it will
-- be rejected with the same error. Existing accounts signing IN are
-- completely unaffected — this only fires on account creation.

CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL DEFAULT 'general' CHECK (purpose IN ('general', 'staff')),
  code text,                         -- required for purpose='staff', unused for 'general'
  name text,                         -- staff invites only — prefill for the activation form
  phone text,                        -- staff invites only — stored for records, not verified
  intended_role text NOT NULL DEFAULT 'staff' CHECK (intended_role IN ('owner', 'manager', 'staff')),
  outlet_id text NOT NULL DEFAULT 'demo-outlet',
  invited_by uuid REFERENCES auth.users(id),
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active (unused, unexpired doesn't matter for this index —
-- keep it simple: one active row per email+purpose at a time) invite
-- per email per purpose. Re-inviting after a prior invite is used is
-- fine (used_at IS NOT NULL rows don't count).
CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_active_email_purpose
  ON invites (lower(email), purpose) WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invites_email ON invites (lower(email));

COMMENT ON TABLE invites IS
  'Gates account creation — see auth.users trigger check_invite_before_signup(). intended_role is recorded for the admin UI''s benefit only; actual profile role is still always forced to staff by insert_own_profile (016_profiles_lockdown.sql) — promoting someone to owner/manager still requires admin_update_staff_role() after they have an account.';

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Same "no DB-level role enforcement yet" reality as every other table
-- in this app (see 027's comment) — owner/manager is checked here
-- only because invites are sensitive enough to be worth the one-off
-- exception, using the same role lookup pattern 016 already uses.
CREATE POLICY "invites outlet owner/manager read"
  ON invites FOR SELECT
  USING (
    outlet_id = current_outlet_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  );

CREATE POLICY "invites outlet owner/manager insert"
  ON invites FOR INSERT
  WITH CHECK (
    outlet_id = current_outlet_id()
    AND invited_by = auth.uid()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
  );

-- ============================================================
-- validate_staff_invite(): lets the (not-yet-authenticated)
-- activation page check a code before attempting signUp(), for a
-- friendlier error than whatever raw text the auth.users trigger
-- raises. SECURITY DEFINER so it can read invites despite the caller
-- being anon — it only ever returns true/false, never row data, so
-- this doesn't reopen the table to anonymous reads.
-- ============================================================
CREATE OR REPLACE FUNCTION validate_staff_invite(p_email text, p_code text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM invites
    WHERE lower(email) = lower(p_email)
      AND purpose = 'staff'
      AND code = p_code
      AND used_at IS NULL
      AND expires_at > now()
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION validate_staff_invite(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_staff_invite(text, text) TO anon, authenticated;

-- ============================================================
-- The actual gate: fires before any row lands in auth.users.
-- invite_code (for 'staff' purpose) is passed through signUp()'s
-- options.data, which Supabase stores as raw_user_meta_data on the
-- new auth.users row — that's the only way client-side code can get
-- a value into this trigger.
-- ============================================================
CREATE OR REPLACE FUNCTION check_invite_before_signup() RETURNS TRIGGER AS $$
DECLARE
  v_invite invites%ROWTYPE;
  v_supplied_code text;
BEGIN
  v_supplied_code := NEW.raw_user_meta_data ->> 'invite_code';

  SELECT * INTO v_invite
  FROM invites
  WHERE lower(email) = lower(NEW.email)
    AND used_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'This email has not been invited. Ask your admin for an invite.';
  END IF;

  IF v_invite.purpose = 'staff' THEN
    IF v_supplied_code IS NULL OR v_supplied_code <> v_invite.code THEN
      RAISE EXCEPTION 'Invalid or missing invite code.';
    END IF;
  END IF;

  UPDATE invites SET used_at = now() WHERE id = v_invite.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS trg_check_invite_before_signup ON auth.users;
CREATE TRIGGER trg_check_invite_before_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION check_invite_before_signup();
