-- ── Recipe SOP fields ───────────────────────────────────────────────────────
-- Adds chef-facing SOP detail on top of the REAL recipe schema from
-- 001_initial_schema.sql (recipes.serves, recipe_items.quantity, etc).
--
-- Context: the currently-wired Recipes/Sub-Recipes screens (RecipesPage.tsx,
-- SubRecipesPage.tsx and their hooks) were built against columns that were
-- never created in any migration (item_type, calculated_cost, quantity_used,
-- base_unit, cost_per_base_unit, total_cost, yield_quantity, yield_unit,
-- cost_per_unit as a stored column). Those screens are being replaced by
-- RecipesView.tsx / SubRecipesView.tsx, which already query the real schema
-- correctly. This migration only ADDS new nullable columns — nothing here
-- renames or removes a column ProductionPage.tsx or anything else depends on.

-- Recipe-level SOP text (applies to the whole dish)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS dos TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS donts TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cooking_technique TEXT;

ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS dos TEXT;
ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS donts TEXT;
ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE sub_recipes ADD COLUMN IF NOT EXISTS cooking_technique TEXT;

-- Per-ingredient-line SOP detail (heat/timing/cut change ingredient by
-- ingredient, not once for the whole recipe — e.g. onions on medium heat at
-- 2 min, garlic on low heat at 4 min).
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS cut_style TEXT;
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS heat_level TEXT CHECK (heat_level IS NULL OR heat_level IN ('low', 'medium', 'high'));
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS timing_note TEXT;

ALTER TABLE sub_recipe_items ADD COLUMN IF NOT EXISTS cut_style TEXT;
ALTER TABLE sub_recipe_items ADD COLUMN IF NOT EXISTS heat_level TEXT CHECK (heat_level IS NULL OR heat_level IN ('low', 'medium', 'high'));
ALTER TABLE sub_recipe_items ADD COLUMN IF NOT EXISTS timing_note TEXT;
