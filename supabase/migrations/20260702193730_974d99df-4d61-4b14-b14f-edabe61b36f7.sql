-- ============================================================
-- 1. Lock down SECURITY DEFINER function execution
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated ONLY for helpers required inside RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authenticated_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authenticated_team_member() TO authenticated;

-- ============================================================
-- 2. Public buckets: remove broad public listing SELECT policies
--    (public URLs still serve files without these policies)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view landing page images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read media-library" ON storage.objects;
DROP POLICY IF EXISTS "Public can view whatsapp media" ON storage.objects;

-- ============================================================
-- 3. landing-pages: restrict write/update/delete to admin/operator
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload landing page images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update landing page images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete landing page images" ON storage.objects;

CREATE POLICY "Admins/operators can upload landing page images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'landing-pages'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
);

CREATE POLICY "Admins/operators can update landing page images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'landing-pages'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
);

CREATE POLICY "Admins/operators can delete landing page images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'landing-pages'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
);

-- ============================================================
-- 4. nina-audio (private): restrict write/delete to service_role
-- ============================================================
DROP POLICY IF EXISTS "Service role can upload nina audio" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload to nina-audio" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete nina audio" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete from nina-audio" ON storage.objects;

CREATE POLICY "Service role can upload nina audio"
ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'nina-audio');

CREATE POLICY "Service role can delete nina audio"
ON storage.objects FOR DELETE TO service_role
USING (bucket_id = 'nina-audio');

-- ============================================================
-- 5. whatsapp-media: restrict service_role write/delete policies to service_role
-- ============================================================
DROP POLICY IF EXISTS "Service role can upload whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete whatsapp media" ON storage.objects;

CREATE POLICY "Service role can upload whatsapp media"
ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role can delete whatsapp media"
ON storage.objects FOR DELETE TO service_role
USING (bucket_id = 'whatsapp-media');