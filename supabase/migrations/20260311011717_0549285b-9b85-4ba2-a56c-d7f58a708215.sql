
-- Add SELECT policy for whatsapp-media storage bucket
CREATE POLICY "Authenticated users can view whatsapp-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-media');
