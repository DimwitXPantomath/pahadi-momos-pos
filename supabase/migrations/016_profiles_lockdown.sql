-- ============================================================
-- Migration 016: Lock down profiles (fixes C-3, backs H-1)
--
-- Before this migration, `profiles` had one policy —
-- `auth_full_profiles FOR ALL USING (auth.uid() IS NOT NULL)` — which
-- let ANY logged-in user read and write EVERY profile row, including
-- their own `role` and `outlet_id`. That means a `staff` account could
-- run a client-side update to grant themselves `owner`, or move
-- themselves into a different restaurant's outlet_id, entirely from
-- the browser. This migration removes that policy and replaces it
-- with: read your own row (or your outlet's colleagues, if you're an
-- owner/manager — needed for a future staff-management screen), and
-- write only your own display name — never role or outlet_id, which
-- become server-controlled from here on.
-- ============================================================

DROP POLICY IF EXISTS auth_full_profiles ON profiles;

-- Read: your own row always; owners/managers can also see colleagues
-- in their own outlet (needed for any staff-list UI, current or future).
CREATE POLICY read_own_or_outlet_profiles ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (
      outlet_id = current_outlet_id()
      AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager')
    )
  );

-- Update: only your own row, and only via a trigger-enforced allowlist
-- of columns (below) — role/outlet_id cannot move through this path
-- no matter what the client sends.
CREATE POLICY update_own_profile ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- New profile rows are created by the sign-up flow itself (see
-- AuthContext.tsx). An authenticated user may insert exactly one row
-- for their own id — but the WITH CHECK below also pins role to the
-- lowest privilege and outlet to the app's current single-outlet
-- reality, so a crafted direct insert can't hand itself 'owner' or a
-- different restaurant's outlet_id the same way the old policy allowed
-- via UPDATE. This hardcodes today's single-outlet assumption (already
-- baked in everywhere else in this app via OUTLET_ID = "demo-outlet");
-- once real multi-restaurant onboarding exists, this needs to become
-- "outlet_id matches a valid, unclaimed invite" instead of a constant.
CREATE POLICY insert_own_profile ON profiles FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND role = 'staff'
    AND outlet_id = 'demo-outlet'
  );

-- ── Trigger: role and outlet_id are immutable through direct client
--    writes, full stop. The only way to change them is the
--    admin_update_staff_role() RPC below, which runs as the table
--    owner and re-validates the caller is an owner of the same outlet
--    before touching anything.
CREATE OR REPLACE FUNCTION prevent_profile_privilege_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.outlet_id IS DISTINCT FROM OLD.outlet_id THEN
    IF current_setting('app.allow_privilege_change', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'role and outlet_id cannot be changed directly — use admin_update_staff_role()';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS guard_profile_privilege_change ON profiles;
CREATE TRIGGER guard_profile_privilege_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_privilege_change();

-- ── The only sanctioned path to change someone's role or outlet:
-- an owner, changing a profile that's already in their own outlet.
-- Cannot be used to "steal" a user into a different outlet, and
-- cannot be called by anyone below owner.
CREATE OR REPLACE FUNCTION admin_update_staff_role(
  p_target_user_id UUID,
  p_new_role TEXT
) RETURNS profiles AS $$
DECLARE
  v_caller_role    TEXT;
  v_caller_outlet  TEXT;
  v_target_outlet  TEXT;
  v_result         profiles;
BEGIN
  SELECT role, outlet_id INTO v_caller_role, v_caller_outlet FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Only an owner can change staff roles';
  END IF;

  SELECT outlet_id INTO v_target_outlet FROM profiles WHERE id = p_target_user_id;
  IF v_target_outlet IS DISTINCT FROM v_caller_outlet THEN
    RAISE EXCEPTION 'Cannot modify a profile outside your own outlet';
  END IF;

  IF p_new_role NOT IN ('owner', 'manager', 'staff') THEN
    RAISE EXCEPTION 'Invalid role %', p_new_role;
  END IF;

  PERFORM set_config('app.allow_privilege_change', 'true', true);
  UPDATE profiles SET role = p_new_role WHERE id = p_target_user_id RETURNING * INTO v_result;
  PERFORM set_config('app.allow_privilege_change', 'false', true);

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only authenticated users can even attempt the RPC — the role/outlet
-- checks inside it do the real gatekeeping.
REVOKE ALL ON FUNCTION admin_update_staff_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_staff_role(UUID, TEXT) TO authenticated;
