-- Create collection_email_logs table for tracking email campaigns
CREATE TABLE public.collection_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.collection_batches(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  installments_included JSONB,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.collection_email_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view collection email logs"
ON public.collection_email_logs
FOR SELECT
USING (public.is_authenticated_user());

CREATE POLICY "Authenticated users can insert collection email logs"
ON public.collection_email_logs
FOR INSERT
WITH CHECK (public.is_authenticated_user());

CREATE POLICY "Authenticated users can update collection email logs"
ON public.collection_email_logs
FOR UPDATE
USING (public.is_authenticated_user());

-- Create trigger for updated_at
CREATE TRIGGER update_collection_email_logs_updated_at
BEFORE UPDATE ON public.collection_email_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_collection_email_logs_batch_id ON public.collection_email_logs(batch_id);
CREATE INDEX idx_collection_email_logs_contact_id ON public.collection_email_logs(contact_id);
CREATE INDEX idx_collection_email_logs_status ON public.collection_email_logs(status);