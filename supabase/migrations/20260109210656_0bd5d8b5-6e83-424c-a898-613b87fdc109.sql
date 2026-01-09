-- Create import audit logs table for tracking import attempts
CREATE TABLE IF NOT EXISTS public.import_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  session_id TEXT NOT NULL,
  file_names TEXT[] NOT NULL DEFAULT '{}',
  extracted_companies INTEGER DEFAULT 0,
  extracted_contacts INTEGER DEFAULT 0,
  extracted_installments INTEGER DEFAULT 0,
  imported_companies INTEGER DEFAULT 0,
  imported_contacts INTEGER DEFAULT 0,
  imported_installments INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'extracting',
  error_message TEXT,
  extraction_errors JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to create and view their own audit logs
CREATE POLICY "Users can view own import audit logs" ON public.import_audit_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own import audit logs" ON public.import_audit_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own import audit logs" ON public.import_audit_logs
  FOR UPDATE USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_import_audit_logs_user_id ON public.import_audit_logs(user_id);
CREATE INDEX idx_import_audit_logs_created_at ON public.import_audit_logs(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_import_audit_logs_updated_at
  BEFORE UPDATE ON public.import_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();