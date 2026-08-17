-- 025_ingredient_calories.sql
--
-- Taste Palette calorie auto-calculation (task #70).
--
-- IMPORTANT — read before assuming this is the government IFCT dataset:
-- This does NOT import the actual Indian Food Composition Tables (IFCT
-- 2017) / Indian Nutrient Databank publication. That's a ~500+ item
-- government reference dataset (PDF/Excel) that would need a real
-- import + name-matching pipeline against your specific ingredient
-- names — a separate, larger task. What this migration does instead:
-- adds a per-ingredient calorie column and seeds it with standard,
-- widely-published per-gram/per-ml/per-piece calorie values (aligned
-- with IFCT/USDA reference ranges for raw/purchased ingredient form —
-- same "as purchased" convention already used by cost_per_usage_unit)
-- for common Indian F&B ingredients, matched by ILIKE name pattern.
-- This is enough to test the calculation pipeline end-to-end today.
-- Anything not matched stays NULL — never silently treated as 0.
--
-- Values are approximate (standard reference ranges), not lab-tested
-- for your specific ingredients/brands. Treat as a testable estimate,
-- not a nutrition-label-grade number.

ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS calories_per_usage_unit NUMERIC;

COMMENT ON COLUMN ingredients.calories_per_usage_unit IS
  'Calories per 1 unit of usage_unit (1 gram / 1 ml / 1 piece), for the ingredient in its raw/as-purchased form — mirrors cost_per_usage_unit''s unit convention. NULL means unknown, not zero. Seeded with standard reference values in migration 025, not the full govt IFCT dataset — see migration comment.';

-- Only fill rows that don't already have a value, so re-running this is
-- safe and never clobbers a real value someone already entered.

-- Proteins
UPDATE ingredients SET calories_per_usage_unit = 1.65 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%chicken%';
UPDATE ingredients SET calories_per_usage_unit = 2.65 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%paneer%';
UPDATE ingredients SET calories_per_usage_unit = 1.43 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%mutton%' OR name ILIKE '%lamb%');
UPDATE ingredients SET calories_per_usage_unit = 1.43 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%fish%';
UPDATE ingredients SET calories_per_usage_unit = 0.99 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%prawn%';
UPDATE ingredients SET calories_per_usage_unit = 1.55 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'pieces' AND name ILIKE '%egg%';
UPDATE ingredients SET calories_per_usage_unit = 0.78 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%tofu%' OR name ILIKE '%soya chunk%' OR name ILIKE '%soy chunk%');

-- Dairy & fats
UPDATE ingredients SET calories_per_usage_unit = 0.42 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'ml'    AND name ILIKE '%milk%';
UPDATE ingredients SET calories_per_usage_unit = 0.60 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%curd%' OR name ILIKE '%yog%');
UPDATE ingredients SET calories_per_usage_unit = 4.02 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%cheese%';
UPDATE ingredients SET calories_per_usage_unit = 3.40 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%cream%';
UPDATE ingredients SET calories_per_usage_unit = 7.17 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%butter%';
UPDATE ingredients SET calories_per_usage_unit = 9.00 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%ghee%';
UPDATE ingredients SET calories_per_usage_unit = 8.84 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'ml'    AND (name ILIKE '%oil%' AND name NOT ILIKE '%essential%');

-- Grains, flours, starches
UPDATE ingredients SET calories_per_usage_unit = 3.45 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%rice%';
UPDATE ingredients SET calories_per_usage_unit = 3.41 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%atta%' OR name ILIKE '%wheat flour%');
UPDATE ingredients SET calories_per_usage_unit = 3.64 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%maida%' OR name ILIKE '%all purpose flour%' OR name ILIKE '%all-purpose flour%');
UPDATE ingredients SET calories_per_usage_unit = 3.81 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%cornflour%' OR name ILIKE '%corn flour%' OR name ILIKE '%cornstarch%');
UPDATE ingredients SET calories_per_usage_unit = 3.71 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%noodle%';
UPDATE ingredients SET calories_per_usage_unit = 2.65 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%bread%';
UPDATE ingredients SET calories_per_usage_unit = 3.65 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%besan%' OR name ILIKE '%gram flour%');

-- Vegetables
UPDATE ingredients SET calories_per_usage_unit = 0.77 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%potato%';
UPDATE ingredients SET calories_per_usage_unit = 0.40 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%onion%';
UPDATE ingredients SET calories_per_usage_unit = 0.18 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%tomato%';
UPDATE ingredients SET calories_per_usage_unit = 0.25 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%cabbage%';
UPDATE ingredients SET calories_per_usage_unit = 0.20 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%capsicum%' OR name ILIKE '%bell pepper%');
UPDATE ingredients SET calories_per_usage_unit = 0.41 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%carrot%';
UPDATE ingredients SET calories_per_usage_unit = 1.49 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%garlic%';
UPDATE ingredients SET calories_per_usage_unit = 0.80 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%ginger%';
UPDATE ingredients SET calories_per_usage_unit = 0.23 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%coriander%' OR name ILIKE '%cilantro%');
UPDATE ingredients SET calories_per_usage_unit = 0.40 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%green chil%' OR name ILIKE '%chilli%' AND name NOT ILIKE '%sauce%' AND name NOT ILIKE '%powder%');
UPDATE ingredients SET calories_per_usage_unit = 0.22 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%mushroom%';
UPDATE ingredients SET calories_per_usage_unit = 0.23 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%spinach%';
UPDATE ingredients SET calories_per_usage_unit = 0.81 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%peas%';
UPDATE ingredients SET calories_per_usage_unit = 0.15 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%cucumber%';
UPDATE ingredients SET calories_per_usage_unit = 0.32 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%spring onion%' OR name ILIKE '%scallion%');
UPDATE ingredients SET calories_per_usage_unit = 3.54 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%coconut%';

-- Sauces, condiments, sweeteners
UPDATE ingredients SET calories_per_usage_unit = 3.87 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%sugar%';
UPDATE ingredients SET calories_per_usage_unit = 3.04 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%honey%';
UPDATE ingredients SET calories_per_usage_unit = 0.53 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'ml'    AND name ILIKE '%soy sauce%';
UPDATE ingredients SET calories_per_usage_unit = 0.19 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'ml'    AND name ILIKE '%vinegar%';
UPDATE ingredients SET calories_per_usage_unit = 1.01 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%ketchup%' OR name ILIKE '%tomato sauce%');
UPDATE ingredients SET calories_per_usage_unit = 6.80 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%mayo%';
UPDATE ingredients SET calories_per_usage_unit = 1.50 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%schezwan%';
UPDATE ingredients SET calories_per_usage_unit = 0.90 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (name ILIKE '%chilli sauce%' OR name ILIKE '%chili sauce%' OR name ILIKE '%red sauce%');
UPDATE ingredients SET calories_per_usage_unit = 0    WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND name ILIKE '%salt%' AND name NOT ILIKE '%mustard%';

-- Spices — small quantities, negligible-but-nonzero; grouped together
UPDATE ingredients SET calories_per_usage_unit = 2.5 WHERE calories_per_usage_unit IS NULL AND usage_unit = 'grams' AND (
  name ILIKE '%masala%' OR name ILIKE '%powder%' OR name ILIKE '%cumin%' OR name ILIKE '%turmeric%'
  OR name ILIKE '%coriander seed%' OR name ILIKE '%garam%' OR name ILIKE '%pepper%'
);
