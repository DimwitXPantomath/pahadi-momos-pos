-- ── Fix sub_recipes missing outlet_id column ─────────────────────────────────
-- If the sub_recipes table was created before migration 001 ran (e.g. via Supabase
-- dashboard), CREATE TABLE IF NOT EXISTS skipped it — so outlet_id never got added.
-- This migration adds the column safely and disables RLS for dev convenience.

ALTER TABLE sub_recipes
  ADD COLUMN IF NOT EXISTS outlet_id TEXT NOT NULL DEFAULT 'demo-outlet';

-- Also ensure sub_recipe_items has no blocking RLS
ALTER TABLE sub_recipes       DISABLE ROW LEVEL SECURITY;
ALTER TABLE sub_recipe_items  DISABLE ROW LEVEL SECURITY;

-- Back-fill any rows that got created without outlet_id (already covered by DEFAULT above)
UPDATE sub_recipes SET outlet_id = 'demo-outlet' WHERE outlet_id IS NULL OR outlet_id = '';
