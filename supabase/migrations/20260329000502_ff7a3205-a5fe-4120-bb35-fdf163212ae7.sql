
-- Table: orbe_plans_catalog
CREATE TABLE public.orbe_plans_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL,
  monthly_price numeric NOT NULL,
  coverages jsonb NOT NULL DEFAULT '[]'::jsonb,
  limits_per_event jsonb DEFAULT '{}'::jsonb,
  annual_limit numeric,
  waiting_period_days integer DEFAULT 0,
  preexisting_conditions_rule text,
  max_pet_age_years integer,
  species_allowed text[] DEFAULT '{dog,cat}'::text[],
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.orbe_plans_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view plans"
  ON public.orbe_plans_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage plans"
  ON public.orbe_plans_catalog FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_orbe_plans_catalog_updated_at
  BEFORE UPDATE ON public.orbe_plans_catalog
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Seed data
INSERT INTO public.orbe_plans_catalog (plan_name, monthly_price, coverages, limits_per_event, annual_limit, waiting_period_days, max_pet_age_years, display_order) VALUES
('Essencial', 37.40, '["Consultas veterinárias","Vacinas anuais","Exames básicos"]'::jsonb, '{"consulta": 150, "exame": 200}'::jsonb, 2000, 30, 10, 1),
('Órbita Plus', 89.82, '["Consultas veterinárias","Vacinas anuais","Exames completos","Internação","Cirurgias simples","Urgência e emergência"]'::jsonb, '{"consulta": 250, "exame": 400, "internacao": 800, "cirurgia": 1500}'::jsonb, 4000, 30, 12, 2),
('Total', 107.82, '["Consultas veterinárias","Vacinas anuais","Exames completos","Internação","Cirurgias","Urgência e emergência","Fisioterapia","Acupuntura"]'::jsonb, '{"consulta": 300, "exame": 500, "internacao": 1200, "cirurgia": 2500, "fisioterapia": 200}'::jsonb, 5000, 30, 12, 3),
('Órbita Galáxia', 138.32, '["Consultas veterinárias","Vacinas anuais","Exames completos","Internação","Cirurgias complexas","Urgência e emergência","Fisioterapia","Acupuntura","Castração","Check-up anual completo"]'::jsonb, '{"consulta": 400, "exame": 600, "internacao": 1500, "cirurgia": 3500, "fisioterapia": 300, "castracao": 1000}'::jsonb, 6000, 30, 14, 4);
