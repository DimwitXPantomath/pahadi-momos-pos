-- ── Business Setup Guide progress tracking ──────────────────────────────────
-- Backs the "mark as done" checklist in the Business Setup Guide screen.
-- resource_id is a plain text key matching BusinessResource.id in
-- src/data/businessResources.ts (a static in-code list, not a DB table) —
-- there's nothing to foreign-key against, the resource catalogue itself
-- isn't stored server-side.

CREATE TABLE IF NOT EXISTS business_resource_progress (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     TEXT NOT NULL DEFAULT 'demo-outlet',
  resource_id   TEXT NOT NULL,
  completed     BOOLEAN NOT NULL DEFAULT true,
  completed_at  TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT,
  UNIQUE(outlet_id, resource_id)
);

-- Staff-only (owner/manager tracking their own setup progress) — no anon
-- access needed, this never faces a customer.
ALTER TABLE business_resource_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_full_business_resource_progress ON business_resource_progress;
CREATE POLICY auth_full_business_resource_progress ON business_resource_progress
  FOR ALL USING (auth.uid() IS NOT NULL);
