ALTER TABLE public.landing_pages ADD COLUMN IF NOT EXISTS hero_bg_color text DEFAULT '#FFFFFF';
ALTER TABLE public.landing_pages ADD COLUMN IF NOT EXISTS section_bg_color text DEFAULT '#F9FAFB';