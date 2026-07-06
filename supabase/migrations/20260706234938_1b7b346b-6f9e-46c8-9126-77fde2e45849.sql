-- Safe hardening for whatsapp-media: allow admin/operator to delete objects.
-- Previously only service_role could delete, yet the app performs authenticated
-- deletes (e.g. Product Knowledge cleanup). This adds a scoped DELETE policy
-- without changing the bucket's public-read requirement (needed for Meta
-- outbound link-fetch and chat media rendering).
DROP POLICY IF EXISTS "Admins/operators can delete whatsapp-media" ON storage.objects;
CREATE POLICY "Admins/operators can delete whatsapp-media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
);