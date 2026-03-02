
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  tagline text,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  annual_limit numeric NOT NULL DEFAULT 0,
  coverage_details jsonb DEFAULT '{}',
  benefits jsonb DEFAULT '{}',
  ideal_for text[] DEFAULT '{}',
  orbi_pitch text,
  whatsapp_template_name text,
  color text DEFAULT '#6A0DAD',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  reembolso_prazo_dias_uteis integer DEFAULT 10,
  reembolso_via text DEFAULT 'conta_bancaria',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view plans"
  ON public.plans FOR SELECT
  TO authenticated
  USING (is_authenticated_user());

CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
