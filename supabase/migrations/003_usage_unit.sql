-- ============================================================
-- Migration 003: Add units_per_purchase to ingredients
-- Run after 001 and 002 in Supabase SQL editor.
-- ============================================================

-- How many usage-unit quantities fit in 1 purchase unit.
-- e.g. 1 kg = 1000 g → units_per_purchase = 1000
-- e.g. 1 box of 12×250g pkt = 3000 g → units_per_purchase = 3000
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ingredients' AND column_name = 'units_per_purchase'
  ) THEN
    ALTER TABLE ingredients ADD COLUMN units_per_purchase NUMERIC NOT NULL DEFAULT 1;
  END IF;
END $$;

-- Back-fill units_per_purchase from existing purchase_unit values
-- (kg→1000, litre→1000, everything else stays 1)
UPDATE ingredients
SET units_per_purchase =
  CASE purchase_unit
    WHEN 'kg'    THEN 1000
    WHEN 'litre' THEN 1000
    ELSE 1
  END
WHERE units_per_purchase = 1;
