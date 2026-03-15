-- Landing pages table
CREATE TABLE public.landing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  cta_text text NOT NULL DEFAULT 'Baixar Material Gratuito',
  hero_image_url text,
  lead_magnet_type text NOT NULL DEFAULT 'ebook',
  lead_magnet_title text,
  lead_magnet_file_url text,
  thank_you_message text DEFAULT 'Obrigado! Você receberá o material em instantes.',
  is_active boolean NOT NULL DEFAULT true,
  utm_source text,
  utm_campaign text,
  form_fields jsonb NOT NULL DEFAULT '["name","email","phone","pet_name"]'::jsonb,
  benefits jsonb DEFAULT '[]'::jsonb,
  testimonials jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lead captures table
CREATE TABLE public.lead_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id uuid REFERENCES public.landing_pages(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  name text,
  email text,
  phone text,
  pet_name text,
  pet_species text,
  lead_magnet_downloaded boolean DEFAULT false,
  utm_source text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_captures ENABLE ROW LEVEL SECURITY;

-- Landing pages: authenticated users can manage, public can read active ones
CREATE POLICY "Authenticated users can manage landing_pages"
  ON public.landing_pages FOR ALL TO authenticated
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Public can view active landing_pages"
  ON public.landing_pages FOR SELECT TO anon
  USING (is_active = true);

-- Lead captures: authenticated can view, public can insert (for form submissions)
CREATE POLICY "Authenticated users can manage lead_captures"
  ON public.lead_captures FOR ALL TO authenticated
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

CREATE POLICY "Public can insert lead_captures"
  ON public.lead_captures FOR INSERT TO anon
  WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();