
-- Create product_knowledge table
CREATE TABLE public.product_knowledge (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  insurer TEXT,
  summary TEXT,
  full_content TEXT,
  source_file_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_knowledge ENABLE ROW LEVEL SECURITY;

-- Admins can manage
CREATE POLICY "Admins can manage product_knowledge"
ON public.product_knowledge
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view active products
CREATE POLICY "Authenticated users can view product_knowledge"
ON public.product_knowledge
FOR SELECT
TO authenticated
USING (is_authenticated_user());

-- Trigger for updated_at
CREATE TRIGGER update_product_knowledge_updated_at
BEFORE UPDATE ON public.product_knowledge
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
