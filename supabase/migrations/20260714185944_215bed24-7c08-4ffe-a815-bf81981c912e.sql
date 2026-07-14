
-- 1) Revoke public execute on SECURITY DEFINER helpers exposed to anon/authenticated
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limit_hits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_hits() TO service_role;

-- 2) Realtime.messages: scope to active staff team members + require topic set
DROP POLICY IF EXISTS "Authenticated team members can read realtime" ON realtime.messages;
CREATE POLICY "Staff can read realtime scoped to topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_authenticated_team_member()
  AND realtime.topic() IS NOT NULL
  AND length(realtime.topic()) > 0
);

-- 3) whatsapp-media staff-only SELECT (bucket already set to private via storage tool)
DROP POLICY IF EXISTS "Staff can read whatsapp-media" ON storage.objects;
CREATE POLICY "Staff can read whatsapp-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
    OR public.is_authenticated_team_member()
  )
);
