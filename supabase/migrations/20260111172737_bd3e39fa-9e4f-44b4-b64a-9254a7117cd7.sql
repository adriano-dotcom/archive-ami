-- Create sellers table
CREATE TABLE public.sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view sellers"
  ON public.sellers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sellers"
  ON public.sellers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create index for performance
CREATE INDEX idx_sellers_is_active ON public.sellers(is_active);
CREATE INDEX idx_sellers_email ON public.sellers(email);

-- Update trigger for updated_at
CREATE TRIGGER update_sellers_updated_at
  BEFORE UPDATE ON public.sellers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update companies FK to reference sellers instead of team_members
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_seller_id_fkey;

ALTER TABLE public.companies 
  ADD CONSTRAINT companies_seller_id_fkey 
  FOREIGN KEY (seller_id) REFERENCES public.sellers(id) ON DELETE SET NULL;