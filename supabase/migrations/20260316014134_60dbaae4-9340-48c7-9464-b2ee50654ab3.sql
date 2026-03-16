
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS primary_color text DEFAULT '#6A0DAD',
  ADD COLUMN IF NOT EXISTS secondary_color text DEFAULT '#F3E8FF',
  ADD COLUMN IF NOT EXISTS button_style text DEFAULT 'rounded';

INSERT INTO storage.buckets (id, name, public) VALUES ('landing-pages', 'landing-pages', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view landing page images"
ON storage.objects FOR SELECT USING (bucket_id = 'landing-pages');

CREATE POLICY "Authenticated users can upload landing page images"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'landing-pages');

CREATE POLICY "Authenticated users can update landing page images"
ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'landing-pages');

CREATE POLICY "Authenticated users can delete landing page images"
ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'landing-pages');
