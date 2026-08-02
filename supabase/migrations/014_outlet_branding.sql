-- ============================================================
-- Migration 014: Outlet Branding (for posters + future print assets)
-- No branding storage existed anywhere in this schema before this —
-- logo, name, and brand colors are new. Public-readable by design:
-- print pages (posters, and later maybe bills/KOTs) need to load
-- this without requiring the person at the printer to be logged in.
-- ============================================================

CREATE TABLE IF NOT EXISTS outlet_branding (
  outlet_id       TEXT PRIMARY KEY DEFAULT 'demo-outlet',
  business_name   TEXT NOT NULL DEFAULT 'Praang',
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#2D6A4F',
  secondary_color TEXT NOT NULL DEFAULT '#F4A261',
  address         TEXT,
  phone           TEXT,
  fssai_number    TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outlet_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_all_outlet_branding  ON outlet_branding FOR ALL    USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY anon_read_outlet_branding  ON outlet_branding FOR SELECT USING (true);

INSERT INTO outlet_branding (outlet_id) VALUES ('demo-outlet') ON CONFLICT (outlet_id) DO NOTHING;

-- ── Storage bucket for logo uploads ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY staff_upload_branding_logos ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

CREATE POLICY staff_update_branding_logos ON storage.objects FOR UPDATE
  USING (bucket_id = 'branding' AND auth.uid() IS NOT NULL);

CREATE POLICY public_read_branding_logos ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');
