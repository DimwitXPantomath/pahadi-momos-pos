-- ============================================================
-- Migration 019: Storage bucket hardening (fixes H-4)
--
-- staff_upload_branding_logos only checked auth.uid() IS NOT NULL —
-- any logged-in staff member, from any outlet, could overwrite any
-- other outlet's logo, and nothing enforced file type or size beyond
-- the client's `accept="image/*"` hint (which is trivially bypassable —
-- it's just a filter on the file picker dialog, not a real check).
--
-- Fix: uploads must be path-prefixed with the caller's own outlet_id
-- (enforced at the RLS layer, not just convention), and the bucket
-- itself now rejects non-image / oversized files server-side.
-- ============================================================

DROP POLICY IF EXISTS staff_upload_branding_logos ON storage.objects;
DROP POLICY IF EXISTS staff_update_branding_logos ON storage.objects;

CREATE POLICY staff_upload_branding_logos ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = current_outlet_id()
  );

CREATE POLICY staff_update_branding_logos ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = current_outlet_id()
  );

-- Server-side MIME/size enforcement — the client's `accept="image/*"`
-- was a UI hint only, not a real control.
UPDATE storage.buckets
SET file_size_limit = 2097152,  -- 2 MB
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'branding';
