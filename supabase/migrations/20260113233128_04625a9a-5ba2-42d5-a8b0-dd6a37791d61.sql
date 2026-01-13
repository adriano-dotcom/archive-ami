-- Add seller_id column to contacts table for Pessoa Física
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_contacts_seller_id ON public.contacts(seller_id);