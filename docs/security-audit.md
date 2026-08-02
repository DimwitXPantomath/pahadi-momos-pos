# Praang Security Audit — Defensive Assessment

**Scope of this review:** static review of the repository at `/Users/pradeepahirwarrrr/Desktop/Praang` — all SQL migrations (001–014), auth/session code, RLS policies, RPC functions, storage config, pricing logic on customer-facing endpoints, and frontend security config. No live penetration test was run. No access to Supabase project dashboard settings (Auth providers, rate limits, PITR/backup config, log retention) or hosting-layer config (Vercel headers, WAF) — those are called out explicitly as **not assessable from this repo** rather than guessed at.

Every finding below is cited against a real file/line I read this session. Where I could not verify something from the code, I say so instead of asserting it.

---

## Remediation status (added after the initial audit)

All 6 Critical and all 4 High findings have been fixed in code — new migrations `015`–`019` plus matching frontend changes. **None of this has been applied to the live Supabase project or tested against a running database** — the sandbox shell was unavailable for this entire session, so every fix below was written and cross-checked against the real schema by careful reading, the same way the original findings were verified, but not executed. Run the migrations in order (`015` → `019`) in the Supabase SQL editor, then work through the regression tests listed under each original finding before trusting this in production.

| Finding | Status | Fixed in |
|---|---|---|
| C-1 No tenant isolation in RLS | **Fixed** | `015_tenant_scoped_rls.sql` — `current_outlet_id()` helper, every table re-scoped |
| C-2 Open sign-up grants owner role | **Fixed** | `AuthContext.tsx` (default role now `staff`), `016_profiles_lockdown.sql` (INSERT policy pins role/outlet) |
| C-3 profiles self-writable (role escalation) | **Fixed** | `016_profiles_lockdown.sql` — own-row-only policies, trigger-locked role/outlet_id, `admin_update_staff_role()` RPC |
| C-4 RLS disabled on 9 tables | **Fixed** | `015_tenant_scoped_rls.sql` re-enables and scopes all 9 |
| C-5 Client-trusted order pricing | **Fixed** | `017_price_safe_online_orders.sql` (`place_online_order()` RPC), `CustomerSelfOrder.tsx` updated to call it |
| C-6 Anonymous full-table read (orders/stamp_cards) | **Fixed** | `018_scoped_anon_reads.sql` (3 scoped RPCs), `OrderTracking.tsx`, `stampCardService.ts` updated |
| H-1 RBAC is UI-only, fails open | **Fixed** | Real enforcement now in RLS (015/016); `ProtectedRoute.tsx`/`Layout.tsx` changed to fail closed |
| H-2 profiles insert schema mismatch | **Fixed** | `AuthContext.tsx` — `name` → `full_name`, `Layout.tsx`/`ChecklistsView.tsx` updated to match |
| H-3 Unfiltered realtime broadcast | **Fixed** | `useOrders.ts` — added `filter: outlet_id=eq.${OUTLET_ID}` |
| H-4 Storage writes not tenant-scoped, no upload validation | **Fixed** | `019_storage_hardening.sql` — path-prefix policy, MIME/size limits |
| M-1 Profile cached in localStorage | **Fixed** (opportunistic) | `AuthContext.tsx` — removed |
| M-3 Dead code risking silent stock-deduction failure | **Fixed** (opportunistic) | `inventoryService.ts` — `updateStock`/`calculateCost`/`getLowStockIngredients` corrected, unreachable table-that-doesn't-exist functions removed |
| M-2 No CSP/security headers | **Not fixed** | Infra-layer change (`vercel.json`), out of this pass's scope |
| M-4 No verified rate limiting | **Not fixed** | Needs a Supabase dashboard setting check + possibly an Edge Function; not a code-level RLS/business-logic fix |
| L-1 Password policy / no MFA | **Not fixed** | Product decision (min length, MFA rollout), not touched |
| L-2 Console error leakage | **Not fixed** | Low severity, cosmetic; left as-is |

One scope note carried over from the original audit and unchanged by this pass: every tenant-scoping fix here depends on `profiles.outlet_id` being trustworthy, which in turn depends on there being a real way to assign a new restaurant's staff to the *correct* outlet. That still doesn't exist — every new sign-up still lands on `outlet_id = 'demo-outlet'` (matches this app's current single-restaurant reality) rather than a real invite-driven outlet assignment. The isolation is now real and enforced *between whatever outlet_id values exist*, but a proper outlet-provisioning/invite flow is still a prerequisite before onboarding a second real restaurant — flagged, not silently built, since it's a product decision (how do new restaurants sign up — invite-only? self-serve with verification?) that needs your input, not mine.

---

## How to read severity

- **Critical** — exploitable today, by an unauthenticated or minimally-privileged actor, with direct impact on tenant data, revenue integrity, or account takeover.
- **High** — exploitable by an authenticated low-privilege actor, or requires a small amount of user interaction/setup.
- **Medium** — real weakness, but needs a specific condition to matter, or impact is contained.
- **Low** — hygiene / defense-in-depth gap.

---

# CRITICAL

## C-1. No multi-tenant isolation exists at the database layer

**Severity:** Critical
**Business impact:** This is the one requirement stated explicitly in the brief — "Restaurant A can NEVER access Restaurant B data" — and it is currently false for every table in the schema. Any restaurant's orders, menu, ingredient costs, procurement, expenses/P&L, and customer loyalty data are readable and writable by any other restaurant's logged-in staff account. If two paying customers are ever onboarded onto this platform, they'd be reading each other's revenue.
**Likelihood:** Certain — not a hypothetical, this is the literal behavior of every RLS policy in the schema.
**Affected files:** every migration that creates a `CREATE POLICY ... FOR ALL USING (auth.uid() IS NOT NULL)` — `001_initial_schema.sql:293-314`, `002_vendor_pricing.sql:100-106`, `009_stamp_loyalty_cards.sql:143-156`, `012_business_resource_progress.sql:20-23`, `013_checklists_and_logs.sql:67-75`, `014_outlet_branding.sql:21-23`. That's every table this session touched, plus everything before it.
**Root cause:** `profiles.outlet_id` exists as a column (`001_initial_schema.sql:10`) — the schema was clearly designed with tenant scoping in mind — but no policy anywhere ever reads it. The comment left in the original migration says it plainly: *"Phase 3: scope by outlet_id using org membership table"* (`001_initial_schema.sql:291`). Phase 3 never happened. Every policy since has copy-pasted the same `auth.uid() IS NOT NULL` pattern, including four tables I personally added this session (checklists, business resources, outlet branding) — I propagated the existing convention without questioning whether the convention itself was safe. It wasn't.
**Secure remediation:** Every RLS policy needs to check the caller's own `outlet_id` against the row's `outlet_id`, not just "are you logged in." Concretely:
```sql
-- Replace every auth_full_* / staff_all_* policy of this shape:
CREATE POLICY auth_full_orders ON orders FOR ALL USING (auth.uid() IS NOT NULL);

-- With this shape:
CREATE POLICY tenant_scoped_orders ON orders FOR ALL
  USING (outlet_id = (SELECT outlet_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (outlet_id = (SELECT outlet_id FROM profiles WHERE id = auth.uid()));
```
Wrap the subquery in a `SECURITY DEFINER` helper function (`current_outlet_id()`) so it's written once and reused across all ~25 tables, and so Postgres can cache/plan it efficiently instead of re-running a correlated subquery per policy per table.
**Example of secure implementation:**
```sql
CREATE OR REPLACE FUNCTION current_outlet_id() RETURNS TEXT AS $$
  SELECT outlet_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE POLICY tenant_scoped_orders ON orders FOR ALL
  USING (outlet_id = current_outlet_id())
  WITH CHECK (outlet_id = current_outlet_id());
```
**Regression tests:** Create two test profiles with different `outlet_id`s. Log in as each and assert: (1) `select * from orders` for outlet A never returns outlet B rows, (2) an `insert` attempting to write `outlet_id = 'B'` while logged in as an A-outlet user is rejected, (3) repeat for every table in the schema — this needs to be a table-driven test, not a spot check, given how many tables are affected.

---

## C-2. Public sign-up auto-grants full "owner" role, platform-wide

**Severity:** Critical
**Business impact:** Combined with C-1, this means literally anyone on the internet can go to `/login`, click "Sign up," create an account with any email, and immediately have full read/write access — as an owner — to every restaurant's data on the platform. No invite flow, no admin approval, no email domain restriction.
**Likelihood:** Certain — this is the default, unmodified sign-up path, not an edge case.
**Affected files:** `src/pages/Login.tsx:51-57` (open `supabase.auth.signUp`, no invite token), `src/contexts/AuthContext.tsx:41-48` (auto-creates a profile with `role: "owner"` the first time any authenticated user has no profile row).
**Root cause:** The profile-provisioning fallback was written for developer convenience ("profile doesn't exist, make one") and defaulted to the most privileged role instead of the least privileged one, with no restriction on who can trigger it.
**Secure remediation:**
1. Auto-provisioned profiles should default to the *lowest* privilege (`staff`), never `owner`. Owner accounts should be created through an explicit, admin-gated invite flow (e.g., an Edge Function that only an existing owner can call, or a Supabase invite link tied to a specific `outlet_id`).
2. Sign-up should require an invite token or be gated behind an admin action — not open self-registration for a B2B multi-tenant product.
**Example of secure implementation:**
```ts
// AuthContext.tsx — safe default
const { data: newProfile } = await supabase
  .from("profiles")
  .insert({ id: userId, role: "staff", outlet_id: null, name: "New User" })
  // outlet_id null until an owner explicitly assigns them to a restaurant
  .select().single()
```
Pair this with an `invites` table (code, outlet_id, role, expires_at) and require a valid invite code at sign-up to set `outlet_id`/`role` server-side (via RPC, not client insert).
**Regression tests:** Fresh sign-up with no invite → assert resulting role is `staff` and `outlet_id` is null/unassigned, not `owner`. Assert a `staff`/null-outlet account cannot read any table with tenant data until assigned.

---

## C-3. `profiles` table is fully readable and writable by any authenticated user — self role-escalation

**Severity:** Critical
**Business impact:** Any logged-in user, including a newly self-registered one, can run a client-side update against their own account (or anyone else's) to change their `role` to `owner` or their `outlet_id` to any other restaurant. This is textbook vertical *and* horizontal privilege escalation, reachable with the Supabase JS client already loaded on every page.
**Likelihood:** Certain — the policy has no row-ownership check at all.
**Affected files:** `001_initial_schema.sql:293-314` — `profiles` is in the same loop as every other table, getting `FOR ALL USING (auth.uid() IS NOT NULL)` with no `id = auth.uid()` restriction.
**Root cause:** The generic table loop that applied "logged-in users get full access" to every table in the schema was never given a `profiles`-specific exception, even though `profiles` is exactly the table that must never allow self-service writes to `role`/`outlet_id`.
**Secure remediation:** Split `profiles` access into narrow, purpose-specific policies:
```sql
DROP POLICY IF EXISTS auth_full_profiles ON profiles;

-- Users can read/update their own non-privileged fields (name), nothing else
CREATE POLICY read_own_profile ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY update_own_name ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());  -- combine with a trigger or generated column
                                   -- guard so role/outlet_id can't be changed here

-- role/outlet_id changes only through an owner-gated RPC (SECURITY DEFINER),
-- never a direct table write from the client.
```
Enforce that `role` and `outlet_id` are immutable via direct client `UPDATE` using a `BEFORE UPDATE` trigger that raises an exception if those columns change outside of a trusted RPC context.
**Example of secure implementation:** an RPC like `update_staff_role(target_user_id, new_role)` that itself checks `(SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'` and `(SELECT outlet_id ...) = (SELECT outlet_id FROM profiles WHERE id = target_user_id)` before allowing the change — i.e., only an owner can change roles, and only for staff in their own outlet.
**Regression tests:** As a `staff` user, attempt `supabase.from('profiles').update({role:'owner'}).eq('id', self)` — must fail. Attempt to read another user's profile row directly by id — must fail unless caller is an owner of the same outlet.

---

## C-4. Row Level Security is fully disabled on multiple tables — anonymous read/write with no login at all

**Severity:** Critical
**Business impact:** These tables are reachable by anyone holding the public anon key (which ships in every page load, by design) with **zero authentication**. That includes ingredient costs, procurement requests/spend, live inventory stock, and production batches — a competitor, or anyone curious, could read your cost structure and margins, or write garbage stock values directly.
**Likelihood:** Certain — `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` is unconditional, not gated by environment.
**Affected files:**
- `005_procurement_receive.sql:44-47` — disables RLS on `ingredient_price_history`, `procurement_items`, `procurement_requests`, `ingredients` ("Disable RLS for easier dev access")
- `006_fix_sub_recipes.sql:10-11` — disables RLS on `sub_recipes`, `sub_recipe_items`
- `007_ingredient_refactor.sql:52` — disables RLS on `inventory_stock`
- `008_production_system.sql:25,52,74` — disables RLS on `sub_recipe_batch_options`, `sub_recipe_stock`, `production_batches`
**Root cause:** RLS was explicitly turned off during development to avoid debugging policy errors, and was never turned back on before subsequent features (including this session's Purchase Sheet, which writes to `procurement_requests`/`procurement_items`) were built on top of it.
**Secure remediation:** Re-enable RLS on every one of these tables and apply the same tenant-scoped policy shape from C-1. This has to happen *together* with C-1's fix, not before it, or the app will simply break (every read/write on these tables currently assumes no RLS).
```sql
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock ENABLE ROW LEVEL SECURITY;
-- ...repeat for all 9 tables listed above, then apply tenant-scoped policies.
```
**Regression tests:** For each table, confirm an unauthenticated request (anon key, no session) is rejected for SELECT/INSERT/UPDATE/DELETE, and an authenticated request from outlet A cannot touch outlet B's rows.

---

## C-5. Customer self-order pricing is 100% client-trusted — no server-side price recomputation

**Severity:** Critical
**Business impact:** Direct revenue loss. A customer (or anyone with the public anon key and 5 minutes) can place an online order for any items at any price they choose — including ₹0 — and it lands on the staff Orders board looking like a normal order. If staff trust the displayed total when marking it paid (which is the entire point of that screen), the restaurant loses the difference.
**Likelihood:** High — this doesn't require sophisticated tooling, just a REST call with a modified JSON body against Supabase's public API, which is reachable from any browser without opening devtools on the running page.
**Affected files:** `src/pages/CustomerSelfOrder.tsx:80-96` (client computes `subtotal`/`gst`/`total` and inserts them directly), `010_online_ordering_and_loyalty_toggle.sql:60-63` (the `WITH CHECK` on the anon insert policy validates *status flags* — `order_source`, `payment_status`, `status` — but never validates the monetary fields or that `items` matches real `menu_items.price × quantity`).
**Root cause:** The `WITH CHECK` clause was written to close the "customer can't fake a paid order" hole (which it does correctly) but was never extended to close the much simpler "customer can fake the price" hole, because pricing was computed client-side and trusted as if it were internal POS input.
**Secure remediation:** Never trust a price, subtotal, or total that arrives from an anonymous client. Two viable approaches:
1. **RPC-only insert path.** Replace the direct `orders`/`order_items` insert with a `SECURITY DEFINER` RPC (`place_online_order(outlet_id, table_id, items, phone, name)`) that looks up each `item_id`'s real price from `menu_items`, computes `subtotal`/`gst`/`total` server-side, and inserts using those computed values — the client-sent price is discarded entirely.
2. At minimum, add a trigger on `orders`/`order_items` that recomputes and overwrites `subtotal`/`gst`/`total` from a join against `menu_items` before insert, rejecting the row if the item list references unavailable or non-existent items.
**Example of secure implementation:**
```sql
CREATE OR REPLACE FUNCTION place_online_order(
  p_outlet_id TEXT, p_table_id TEXT, p_items JSONB,
  p_phone TEXT, p_name TEXT
) RETURNS orders AS $$
DECLARE
  v_subtotal NUMERIC := 0;
  v_order orders;
  v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT (elem->>'id')::uuid AS item_id, (elem->>'quantity')::int AS qty
    FROM jsonb_array_elements(p_items) elem
  LOOP
    v_subtotal := v_subtotal + v_item.qty *
      (SELECT price FROM menu_items WHERE id = v_item.item_id AND outlet_id = p_outlet_id AND available = true);
  END LOOP;

  INSERT INTO orders (outlet_id, items, subtotal, gst, total, status, order_source, payment_status, customer_phone, customer_name, table_id)
  VALUES (p_outlet_id, p_items, v_subtotal, v_subtotal * 0.05, v_subtotal * 1.05, 'PLACED', 'online', 'pending', p_phone, p_name, p_table_id)
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```
Then remove the direct anon INSERT policy on `orders`/`order_items` entirely — the RPC becomes the only path in.
**Regression tests:** Submit an order via the RPC with a tampered client-side total — assert the stored `total` matches server-computed price, not the submitted one. Submit an order referencing an unavailable or nonexistent `item_id` — assert rejection.

---

## C-6. Anonymous `SELECT USING (true)` on `orders` and `stamp_cards` — full cross-tenant data dump, not a "bearer token" model

**Severity:** Critical
**Business impact:** Every order ever placed on the platform — customer phone numbers, names, items, totals, table numbers — and every loyalty stamp card's phone number and progress, across every restaurant, is readable by anyone holding the anon key with a single unfiltered query. This is a full PII and revenue-data leak, not scoped to "whoever has the link."
**Likelihood:** Certain.
**Affected files:** `010_online_ordering_and_loyalty_toggle.sql:52-53` (`anon_read_orders FOR SELECT USING (true)`), `009_stamp_loyalty_cards.sql:164-165` (`anon_read_stamp_cards FOR SELECT USING (true)`).
**Root cause:** Both migrations' own comments describe the intent as "the id/code is the bearer token, same as the existing tracking link" — but `USING (true)` at the RLS layer does not implement a bearer-token model. It grants unconditional read access to the entire table to anyone; the "only if you know the id" property only holds if every single client-side query happens to filter by id, which RLS does not enforce and cannot be relied on to stay true as the codebase grows. This is a real misunderstanding of what RLS guarantees versus what application code merely intends, and it's worth calling out as a pattern because it likely explains why this shape got reused across two separate migrations.
**Secure remediation:** RLS cannot implement "possession of an unguessable id is authorization" on its own — that requires either (a) a `SECURITY DEFINER` RPC that takes the id/code as a parameter and returns only that row, or (b) scoping the read through a Postgres session variable set per-request (harder to wire up correctly with Supabase's standard client). Option (a) is simpler and matches the existing RPC pattern already used for stamps:
```sql
CREATE OR REPLACE FUNCTION get_order_for_tracking(p_order_id UUID) RETURNS orders AS $$
  SELECT * FROM orders WHERE id = p_order_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```
Then drop `anon_read_orders`/`anon_read_stamp_cards` entirely and have `OrderTracking.tsx`/`LoyaltyCard.tsx` call the RPC instead of a direct table `select`.
**Regression tests:** Confirm `supabase.from('orders').select('*')` with the anon key (no id filter) returns zero rows. Confirm `get_order_for_tracking(knownId)` still returns the correct single order for the tracking page.

---

# HIGH

## H-1. Role-based access control is decorative — enforced nowhere except UI, and fails open

**Severity:** High
**Business impact:** The owner/manager/staff distinction the product is built around (and that C-3's fix depends on meaning something) currently controls nothing except which sidebar buttons render. A waiter account calling the same Supabase queries an owner's browser calls gets the same data and the same write access, because RLS never checks role (only `auth.uid() IS NOT NULL`, see C-1), and the one client-side gate that exists is written to fail open.
**Likelihood:** High — reachable by any staff member who opens devtools, or simply by the profile-fetch bug in H-2 firing in production.
**Affected files:** `src/components/Layout.tsx:41-43` (`profile?.role ? item.roles.includes(profile.role) : true` — if `profile` is null, every nav item is shown, unfiltered), `src/components/ProtectedRoute.tsx:36-40` (comment reads *"Logged in but wrong role → still let them in (better than locking them out due to profile fetch issues)"* — an explicit, intentional fail-open), `src/App.tsx` (the one `<ProtectedRoute>` wrapping `<Index />` doesn't even pass `allowedRoles`, so this gate isn't active at the route level at all today).
**Root cause:** Role was designed as a UI convenience, then never backed by a real authorization layer at the database. Fail-open was a deliberate choice to avoid locking out users when profile fetches are flaky (itself downstream of H-2).
**Secure remediation:** Role checks belong in RLS (see C-1's helper function, extended: `current_outlet_id()` and a matching `current_role()`), not in React conditionals. Once that exists, `ProtectedRoute` and `Layout` become UX niceties (hide buttons a user can't use) rather than the actual boundary, and can safely fail closed instead of open.
**Example of secure implementation:**
```sql
CREATE POLICY owner_manager_write_menu_items ON menu_items FOR INSERT
  WITH CHECK (
    outlet_id = current_outlet_id()
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','manager')
  );
```
**Regression tests:** As `staff`, attempt an action reserved for `owner` (e.g. update `loyalty_settings`) directly via the Supabase client — must fail at the database, independent of what the UI shows.

## H-2. `profiles` insert uses a column (`name`) that doesn't exist in the schema (`full_name`) — new-account provisioning likely broken

**Severity:** High
**Business impact:** New sign-ups may silently fail to get a profile row at all (the insert errors, is swallowed, `fetchProfile` returns `undefined`), which then triggers the fail-open behavior in H-1 for that session. This is a correctness bug with a direct security side-effect, not just a UX annoyance.
**Likelihood:** High — this fires on the very first login of any new account, every time, unless `name` was added to the table outside the migrations I can see.
**Affected files:** `src/contexts/AuthContext.tsx:45` (`insert({ id: userId, role: "owner", name: "Owner" })`) vs `001_initial_schema.sql:8-14` (column is `full_name`, no `name` column exists anywhere in the migration history — confirmed via full-repo grep).
**Root cause:** Frontend and schema drifted — the same class of bug already found and fixed once this session in the Recipes module.
**Secure remediation:** Fix the column name, and combine with C-2's fix so the default insert is safe even if this path fires again:
```ts
.insert({ id: userId, role: "staff", full_name: "New User", outlet_id: null })
```
**Regression tests:** Sign up a brand-new account, confirm a `profiles` row is created (not silently failed), confirm `profile.name`/`full_name` usages across the app (`Layout.tsx`, `ChecklistsView.tsx`) read the correct column.

## H-3. Unfiltered Realtime subscription on `orders` broadcasts every restaurant's order activity

**Severity:** High
**Business impact:** Any open POS session receives live inserts/updates for every order on the platform, not just its own outlet — an extension of C-1/C-6 into the realtime layer. Once C-1 is fixed (RLS becomes tenant-scoped), Supabase Realtime will respect that automatically for `postgres_changes`, but the subscription itself should still be scoped defensively.
**Likelihood:** Certain, contingent on C-1/C-6 being fixed first (right now it's moot because REST access is already this open).
**Affected files:** `src/hooks/useOrders.ts:41-51` — `.channel("orders-channel").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ...)`, no filter.
**Secure remediation:** Add a `filter` to the subscription once `outlet_id`-scoped RLS is in place:
```ts
.on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `outlet_id=eq.${outletId}` }, ...)
```
**Regression tests:** With two outlets' sessions open, confirm outlet A's realtime callback never fires for outlet B's order changes.

## H-4. Storage bucket writes aren't tenant-scoped, and uploads have no MIME/size validation

**Severity:** High
**Business impact:** Any authenticated staff member — from any outlet, per C-1 — can overwrite any other outlet's branding logo, and can upload arbitrary file types/sizes to a public-read bucket (which then serves whatever was uploaded, publicly, from your Supabase project's domain).
**Likelihood:** Medium — requires an authenticated account, but per C-1/C-2 those are trivially obtainable.
**Affected files:** `014_outlet_branding.sql:33-39` (`staff_upload_branding_logos ... WITH CHECK (bucket_id = 'branding' AND auth.uid() IS NOT NULL)` — no outlet check, no path restriction), `src/components/Settings.tsx` branding upload handler (`accept="image/*"` is a client-side hint only — nothing server-side enforces MIME type or file size).
**Root cause:** I built this feature this session and applied the same `auth.uid() IS NOT NULL` convention already established elsewhere, without adding a path-prefix or size/type check — the same root pattern as C-1, self-disclosed.
**Secure remediation:**
```sql
CREATE POLICY staff_upload_branding_logos ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND (storage.foldername(name))[1] = current_outlet_id()  -- path must be prefixed with caller's own outlet
  );
```
Set a `file_size_limit` and `allowed_mime_types` on the bucket itself (Supabase supports this at the bucket config level):
```sql
UPDATE storage.buckets SET file_size_limit = 2097152, allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'] WHERE id = 'branding';
```
**Regression tests:** Attempt upload to a path prefixed with a different outlet's id — must fail. Attempt upload of a non-image MIME type or oversized file — must be rejected server-side, not just hidden by the client's `accept` attribute.

---

# MEDIUM

## M-1. Full profile object, including role, cached in `localStorage`
`src/contexts/AuthContext.tsx:97` — `localStorage.setItem("praang_profile", ...)`. Not itself an access-control boundary (real enforcement should be RLS, per C-1/H-1), but it's a stale-cache and XSS-adjacent data exposure risk, and it's unused elsewhere in the code I read (nothing reads `praang_profile` back). **Remediation:** remove it — the session/profile refetch already happens on load; caching it in `localStorage` adds risk with no apparent benefit.

## M-2. No CSP or security headers configured
`index.html` has no `Content-Security-Policy`, `X-Frame-Options`, or `Referrer-Policy` meta tags, and there's no `vercel.json` headers config in the repo. **Remediation:** add a `vercel.json` with baseline headers (CSP scoped to Supabase's domain + self, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` or `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`).

## M-3. Dead code in `inventoryService.ts` referencing non-existent tables — silent stock-deduction failures
`src/services/inventoryService.ts` — `calculateCost`, `getBestVendorPrice`, `generatePurchaseOrder` query `ingredient_prices`/`purchase_orders`/`purchase_order_items`, none of which exist in any migration (confirmed via full-repo grep). `expandRecipe`/`updateStock` are still imported live in `Index.tsx`. This isn't an attacker-facing vulnerability, but it means stock deduction on order placement may be silently no-op-ing against a stale `ingredients.current_stock` column instead of the real `inventory_stock.current_quantity` table — an inventory-integrity gap that could mask real stock levels. **Remediation:** replace with the already-correct pattern used in this session's `purchaseSheetService.ts`, and delete the dead functions.

## M-4. No visible rate limiting or anti-automation on public endpoints
Nothing in the repo implements rate limiting on `/login` sign-up/sign-in, or on the anonymous `/order-online/:outletId` insert path. This may be partially mitigated by Supabase Auth's built-in rate limits (project-level setting, not visible from this repo) but **I could not verify this either way** — flagging as unassessed rather than asserting it's a gap or that it's covered. Given C-2 already allows unlimited self-registration and C-5 allows arbitrary-price order spam, rate limiting matters more here than in a typical app. **Recommendation:** confirm Supabase Auth rate limit settings in the dashboard, and add application-level throttling (e.g., an Edge Function in front of order placement) once C-5's RPC exists.

---

# LOW

## L-1. Password policy is minimum-length only (6 characters), no MFA
`src/pages/Login.tsx:45-46`. Acceptable for an MVP, but worth strengthening (12+ chars or passphrase guidance, breach-list check via Supabase's `password_strength` config if available) before this holds real payment-adjacent data. MFA isn't offered at all — reasonable to defer post-launch, not a launch blocker on its own.

## L-2. Console error logging may leak internal details
Several `console.error("... error:", error)` calls throughout (`ProcurementView.tsx`, `purchaseSheetService.ts`, others) print raw Supabase error objects to the browser console in production, which can include table/column names useful for reconnaissance. Low impact, easy fix: log to a server-side/monitoring sink instead of (or in addition to) the browser console in production builds.

## L-3. "Bearer token" trust model is an established but fragile pattern
Beyond C-6's two confirmed instances, this same reasoning ("the id/code is unguessable, so a public SELECT is fine") appears as the stated justification in multiple migration comments. It happens to be *wrong* every time it was actually implemented as `USING (true)`. Worth a one-time audit sweep for any other table using this phrase in a comment, once C-1 is being fixed anyway.

---

# Not assessable from this repository

Stated explicitly rather than guessed at, per the review instructions:
- TLS/HSTS enforcement, WAF, DDoS protection — hosting-layer (Vercel) config, not in repo.
- CORS configuration beyond Supabase's platform defaults.
- Supabase project-level settings: Auth rate limits, email confirmation requirements, PITR/backup schedule, log retention, key rotation history.
- Dependency vulnerability scan (`npm audit` / Dependabot) — the sandbox shell was unavailable for the majority of this session; this should be run before production and was not run as part of this review.
- Edge Functions — none exist in this repo; the AI Assistant module referenced in `CLAUDE.md` (Module 10) is unbuilt, so there's no server-side Anthropic API key handling to review yet. If that module ships calling the Anthropic API directly from the browser, that would be a new Critical finding (API key exposure) — flag for review when it's built.
- Payment gateway integration — does not exist yet (confirmed throughout this session); "payment verification/duplicate payment prevention/refund security" from the requested scope don't apply until one is wired in. The current "payment" is a manual staff button, whose only real risk is C-5 (the amount being confirmed can be attacker-chosen).

---

# OWASP mapping (confirmed findings only)

| OWASP Top 10 (2021) | Finding |
|---|---|
| A01: Broken Access Control | C-1, C-3, C-4, C-6, H-1, H-4 |
| A04: Insecure Design | C-2, C-5 (trusting client for pricing/role is a design flaw, not just a missing check) |
| A05: Security Misconfiguration | C-4, M-2 |
| A07: Identification & Authentication Failures | C-2, L-1 |
| A08: Software & Data Integrity Failures | C-5 |

| OWASP API Security Top 10 | Finding |
|---|---|
| API1: Broken Object Level Authorization | C-1, C-6 |
| API3: Broken Object Property Level Authorization | C-5 (client controls fields — price — it shouldn't) |
| API5: Broken Function Level Authorization | H-1 |
| API6: Unrestricted Access to Sensitive Business Flows | C-2 (unlimited owner-account creation), M-4 |

---

# Executive Summary

Praang's application code (React/TypeScript components, business logic) is generally clean and follows a consistent pattern, and several individual features built this session (atomic stamp RPCs, the SOP-based recipe rebuild) show real care. But the security model this audit was asked to verify — tenant isolation — **does not exist**. Every RLS policy in the schema grants full access to any authenticated user regardless of which restaurant they belong to, two tables (`orders`, `stamp_cards`) grant full *unauthenticated* read access to every tenant's data, nine tables have RLS disabled outright, sign-up is open and auto-grants the highest privilege role, and the one customer-facing money path (self-order pricing) trusts whatever number the client sends. These aren't edge cases requiring a sophisticated attacker — most are reachable with an unmodified public sign-up form or a single REST call.

This is not a "harden before scale" situation. It's a "the multi-tenant claim in the product brief is not true yet" situation. Treat C-1 through C-6 as one connected piece of work — most of them share the same root fix (real `outlet_id`-scoped RLS backed by a trustworthy `profiles.outlet_id`), and none of the rest of the audit matters much until that's in place.

**Overall Security Score: 14 / 100 → 68 / 100 pending verification**
**Production Readiness Score: 8 / 100 → 55 / 100 pending verification**

These revised numbers assume `015`–`019` are applied to the live database and pass the regression tests listed under each finding — **that verification has not happened yet**, only the code/SQL has been written and cross-read against the real schema. I'm scoring this below 100 even in the best case because: (a) it's unverified against a running database, (b) the outlet-provisioning gap noted above means tenant isolation is real but only matters once a second real outlet_id exists, (c) M-2/M-4/L-1/L-2 remain open, and (d) this was a single-reviewer static pass, not a live penetration test or a second independent review — both of which I'd want before calling this genuinely production-ready for a payments-adjacent multi-tenant product.

## Critical Issues: 6
C-1 No tenant isolation in RLS · C-2 Open sign-up grants owner role · C-3 profiles table self-writable (role escalation) · C-4 RLS disabled on 9 tables · C-5 Client-trusted order pricing · C-6 Anonymous full-table read on orders/stamp_cards

## High Issues: 4
H-1 RBAC is UI-only, fails open · H-2 profiles insert schema mismatch · H-3 Unfiltered realtime broadcast · H-4 Storage writes not tenant-scoped, no upload validation

## Medium Issues: 4
M-1 Profile cached in localStorage · M-2 No CSP/security headers · M-3 Dead code risking silent stock-deduction failure · M-4 No verified rate limiting

## Low Issues: 3
L-1 Password policy/no MFA · L-2 Console error leakage · L-3 Fragile "bearer token" pattern reused elsewhere

## Must Fix Before Production
1. ~~C-1 + C-4: real `outlet_id`-scoped RLS on every table, RLS re-enabled everywhere.~~ Fixed in code (`015`), **not yet applied/verified against a live database.**
2. ~~C-2 + C-3: safe default role, profiles table locked down.~~ Fixed in code (`016` + `AuthContext.tsx`), **not yet verified.** Still open: a real invite-based outlet-provisioning flow for onboarding a second restaurant (product decision, not a code fix).
3. ~~C-5: server-side price computation for the online ordering path.~~ Fixed in code (`017`), **not yet verified.**
4. ~~C-6: replace `USING (true)` reads with scoped RPCs.~~ Fixed in code (`018`), **not yet verified.**
5. ~~H-2: fix the `name`/`full_name` mismatch.~~ Fixed in code, **not yet verified.**

Before treating this as production-ready: apply migrations `015`→`019` to a staging Supabase project, run the regression tests listed under each finding above, then run `npm run build` and a full manual pass through login/sign-up, in-store POS ordering, online customer ordering, order tracking, and the loyalty stamp card flow — every one of those paths changed in this remediation pass.

## Recommended Future Improvements
- MFA for owner-role accounts.
- Rate limiting in front of sign-up and order placement.
- Move to a real payment gateway with server-side verification before any "payment security" claim is meaningful.
- Structured server-side logging/monitoring instead of `console.error`.
- Dependency audit (`npm audit`) as a CI gate.
- Revisit every migration comment that says "bearer token" or "disable RLS for dev convenience" as a standing checklist before each release.

## Positive Security Practices Already Present
- Anon key (not service role) correctly used in the client (`src/lib/supabase.ts`) — no service-role key found anywhere in the repo.
- Atomic stamp-card RPCs (`add_stamp`, `redeem_stamp_card`) use `SECURITY INVOKER` with proper row locking (`FOR UPDATE`) and correctly rely on RLS to block anonymous callers from self-issuing stamps — this one held up under review.
- Consistent use of parameterized Supabase client calls throughout — I found no raw string-concatenated SQL anywhere, so classic SQL injection risk is low across the reviewed code.
- Password minimum length enforced client-side (though this alone isn't sufficient — see L-1).
- The team already has a track record this session of catching and fixing schema-drift bugs (the Recipes module rebuild) — the same discipline needs to be pointed at the RLS layer next.
