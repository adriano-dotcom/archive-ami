-- Allow authenticated users to upload files to whatsapp-media bucket
CREATE POLICY "Authenticated users can upload to whatsapp-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update whatsapp-media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'whatsapp-media')
WITH CHECK (bucket_id = 'whatsapp-media');