
-- 1. Bucket público para mídias da biblioteca
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-library', 'media-library', true, 52428800,
  ARRAY['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp','image/gif','application/pdf','audio/mpeg','audio/ogg','audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4','video/quicktime','video/webm','image/jpeg','image/png','image/webp','image/gif','application/pdf','audio/mpeg','audio/ogg','audio/mp4'];

DROP POLICY IF EXISTS "Public can read media-library" ON storage.objects;
CREATE POLICY "Public can read media-library"
ON storage.objects FOR SELECT
USING (bucket_id = 'media-library');

DROP POLICY IF EXISTS "Authenticated can upload to media-library" ON storage.objects;
CREATE POLICY "Authenticated can upload to media-library"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media-library' AND public.is_authenticated_user());

DROP POLICY IF EXISTS "Authenticated can update media-library" ON storage.objects;
CREATE POLICY "Authenticated can update media-library"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media-library' AND public.is_authenticated_user());

DROP POLICY IF EXISTS "Admins can delete media-library" ON storage.objects;
CREATE POLICY "Admins can delete media-library"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media-library' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Tabela media_library
CREATE TABLE IF NOT EXISTS public.media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  media_type text NOT NULL,
  file_url text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  thumbnail_url text,
  duration_seconds integer,
  plan_id uuid REFERENCES public.orbe_plans_catalog(id) ON DELETE SET NULL,
  trigger_keywords text[] DEFAULT '{}',
  auto_send_enabled boolean NOT NULL DEFAULT false,
  tags text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  send_count integer NOT NULL DEFAULT 0,
  last_sent_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_active ON public.media_library(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_media_library_plan ON public.media_library(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_library_auto_send ON public.media_library(auto_send_enabled) WHERE auto_send_enabled = true;

ALTER TABLE public.media_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view media_library" ON public.media_library;
CREATE POLICY "Authenticated can view media_library"
ON public.media_library FOR SELECT
TO authenticated
USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Team members can manage media_library" ON public.media_library;
CREATE POLICY "Team members can manage media_library"
ON public.media_library FOR ALL
TO authenticated
USING (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_media_library_updated_at ON public.media_library;
CREATE TRIGGER trg_media_library_updated_at
BEFORE UPDATE ON public.media_library
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Tabela de tracking
CREATE TABLE IF NOT EXISTS public.media_library_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.media_library(id) ON DELETE CASCADE,
  conversation_id uuid,
  contact_id uuid,
  message_id uuid,
  sent_by_type text NOT NULL DEFAULT 'human',
  sent_by_user uuid,
  trigger_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_library_usage_media ON public.media_library_usage(media_id);
CREATE INDEX IF NOT EXISTS idx_media_library_usage_conv ON public.media_library_usage(conversation_id);

ALTER TABLE public.media_library_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view media_library_usage" ON public.media_library_usage;
CREATE POLICY "Authenticated can view media_library_usage"
ON public.media_library_usage FOR SELECT
TO authenticated
USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Team members can insert media_library_usage" ON public.media_library_usage;
CREATE POLICY "Team members can insert media_library_usage"
ON public.media_library_usage FOR INSERT
TO authenticated
WITH CHECK (public.is_authenticated_team_member() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Trigger contador
CREATE OR REPLACE FUNCTION public.increment_media_send_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.media_library
  SET send_count = send_count + 1,
      last_sent_at = NEW.created_at
  WHERE id = NEW.media_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_media_send_count ON public.media_library_usage;
CREATE TRIGGER trg_increment_media_send_count
AFTER INSERT ON public.media_library_usage
FOR EACH ROW EXECUTE FUNCTION public.increment_media_send_count();
