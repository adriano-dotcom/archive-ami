-- 1. installment_history: restrict SELECT to team members / admin / operator
DROP POLICY IF EXISTS "Authenticated users can view installment history" ON public.installment_history;
CREATE POLICY "Team members can view installment history"
ON public.installment_history
FOR SELECT
TO authenticated
USING (
  public.is_authenticated_team_member()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'operator'::app_role)
);

-- 2. sellers: restrict SELECT to team members / admin / operator
DROP POLICY IF EXISTS "Authenticated users can view sellers" ON public.sellers;
CREATE POLICY "Team members can view sellers"
ON public.sellers
FOR SELECT
TO authenticated
USING (
  public.is_authenticated_team_member()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'operator'::app_role)
);

-- 3. template_status_notifications: restrict SELECT and UPDATE to admin / operator
DROP POLICY IF EXISTS "Authenticated users can view template notifications" ON public.template_status_notifications;
CREATE POLICY "Staff can view template notifications"
ON public.template_status_notifications
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'operator'::app_role)
);

DROP POLICY IF EXISTS "Authenticated users can update template notifications" ON public.template_status_notifications;
CREATE POLICY "Staff can update template notifications"
ON public.template_status_notifications
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'operator'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'operator'::app_role)
);

-- 4. media-library storage bucket: restrict INSERT/UPDATE to team members / admin / operator
DROP POLICY IF EXISTS "Authenticated can upload to media-library" ON storage.objects;
CREATE POLICY "Staff can upload to media-library"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media-library'
  AND (
    public.is_authenticated_team_member()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated can update media-library" ON storage.objects;
CREATE POLICY "Staff can update media-library"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media-library'
  AND (
    public.is_authenticated_team_member()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'operator'::app_role)
  )
);