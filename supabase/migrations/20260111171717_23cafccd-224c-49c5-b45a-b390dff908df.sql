-- Add seller_id column to companies table to link a responsible seller
ALTER TABLE public.companies 
ADD COLUMN seller_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_companies_seller_id ON public.companies(seller_id);

-- Add comment for documentation
COMMENT ON COLUMN public.companies.seller_id IS 'ID do vendedor responsável pela empresa';