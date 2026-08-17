-- 026_procurement_categories.sql
--
-- Adds a category to both ingredients and vendors (Dry Store / Vegetable
-- / Poultry & Meat / Dairy / Beverages / Packaging / Other — see
-- src/lib/procurementCategories.ts for the canonical list used by the
-- UI). Free TEXT, not an enum, so the preset list can change without a
-- migration. Drives two things in ProcurementView.tsx:
--   1. Selecting a vendor with a category filters the ingredient
--      picker to that category, so staff aren't hunting through the
--      full ingredient list to find what a produce vendor actually sells.
--   2. When NO vendor is selected and items are added freely, creating
--      the request auto-splits the items into one draft request per
--      category (vendor left unassigned, so staff pick a vendor per
--      category-grouped request afterward).
--
-- Best-effort backfill below classifies common ingredient names by
-- ILIKE pattern, same approach as migration 025's calorie backfill.
-- This is a starting suggestion, not authoritative — anything not
-- matched stays NULL, and staff should spot-check the rest in
-- Ingredients. Vendors are NOT backfilled (no reliable name signal —
-- a vendor named "Sharma Traders" gives no hint of what they supply).

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE vendors     ADD COLUMN IF NOT EXISTS category TEXT;

COMMENT ON COLUMN ingredients.category IS
  'Procurement category (Dry Store / Vegetable / Poultry & Meat / Dairy / Beverages / Packaging / Other) — see src/lib/procurementCategories.ts. NULL means unset, not "Other".';
COMMENT ON COLUMN vendors.category IS
  'What this vendor primarily supplies — same category list as ingredients.category. NULL means the vendor is not restricted to one category (ingredient picker shows everything for them).';

-- Only fill rows that don't already have a value.

UPDATE ingredients SET category = 'Poultry & Meat' WHERE category IS NULL AND (
  name ILIKE '%chicken%' OR name ILIKE '%mutton%' OR name ILIKE '%lamb%' OR name ILIKE '%fish%' OR name ILIKE '%prawn%' OR name ILIKE '%egg%'
);
UPDATE ingredients SET category = 'Vegetable' WHERE category IS NULL AND (
  name ILIKE '%onion%' OR name ILIKE '%tomato%' OR name ILIKE '%potato%' OR name ILIKE '%cabbage%'
  OR name ILIKE '%capsicum%' OR name ILIKE '%bell pepper%' OR name ILIKE '%carrot%' OR name ILIKE '%garlic%'
  OR name ILIKE '%ginger%' OR name ILIKE '%coriander%' OR name ILIKE '%cilantro%' OR name ILIKE '%chilli%'
  OR name ILIKE '%chili%' OR name ILIKE '%mushroom%' OR name ILIKE '%spinach%' OR name ILIKE '%peas%'
  OR name ILIKE '%cucumber%' OR name ILIKE '%spring onion%' OR name ILIKE '%scallion%'
);
UPDATE ingredients SET category = 'Dairy' WHERE category IS NULL AND (
  name ILIKE '%milk%' OR name ILIKE '%curd%' OR name ILIKE '%yog%' OR name ILIKE '%cheese%'
  OR name ILIKE '%paneer%' OR name ILIKE '%cream%' OR name ILIKE '%butter%' OR name ILIKE '%ghee%'
);
UPDATE ingredients SET category = 'Dry Store' WHERE category IS NULL AND (
  name ILIKE '%rice%' OR name ILIKE '%atta%' OR name ILIKE '%maida%' OR name ILIKE '%besan%'
  OR name ILIKE '%cornflour%' OR name ILIKE '%corn flour%' OR name ILIKE '%sugar%' OR name ILIKE '%salt%'
  OR name ILIKE '%oil%' OR name ILIKE '%masala%' OR name ILIKE '%powder%' OR name ILIKE '%sauce%'
  OR name ILIKE '%vinegar%' OR name ILIKE '%noodle%' OR name ILIKE '%honey%' OR name ILIKE '%ketchup%'
  OR name ILIKE '%mayo%'
);
