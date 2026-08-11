CREATE POLICY "Staff can read nina-audio"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nina-audio'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
    OR public.is_authenticated_team_member()
  )
);