-- ============================================================
-- Rebrand: Teal (#1B6E5C) & Terracotta (#E76F51), chosen 2026-08-04
-- to replace the old forest-green/orange palette CLAUDE.md documented
-- but which the live Tailwind theme had already drifted away from
-- (staff dashboard was on an unrelated orange, hsl(16,85%,55%)).
--
-- Updates the outlet_branding row's actual stored values (used by
-- PostersView/PrintPoster.tsx to render branded posters) and the
-- column defaults, so a fresh outlet_branding row also starts on the
-- new palette rather than the old one.
-- ============================================================

ALTER TABLE outlet_branding ALTER COLUMN primary_color SET DEFAULT '#1B6E5C';
ALTER TABLE outlet_branding ALTER COLUMN secondary_color SET DEFAULT '#E76F51';

UPDATE outlet_branding
SET primary_color = '#1B6E5C', secondary_color = '#E76F51'
WHERE outlet_id = 'demo-outlet'
  AND primary_color = '#2D6A4F' AND secondary_color = '#F4A261';
-- The WHERE clause only touches the row if it's still on the old
-- default — if you already customized branding colors in Settings,
-- this won't overwrite your choice.
