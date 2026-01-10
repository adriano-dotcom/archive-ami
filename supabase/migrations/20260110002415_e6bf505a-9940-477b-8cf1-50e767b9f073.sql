-- Table to log ALL webhook requests for debugging
CREATE TABLE public.webhook_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  method TEXT NOT NULL,
  path TEXT,
  query_params JSONB,
  headers JSONB,
  body JSONB,
  source_ip TEXT,
  user_agent TEXT,
  response_status INTEGER,
  processing_time_ms INTEGER,
  event_type TEXT, -- 'message', 'status', 'verification', 'unknown'
  is_meta_test BOOLEAN DEFAULT false,
  error_message TEXT
);

-- Index for fast lookup by date
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_request_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.webhook_request_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read logs
CREATE POLICY "Allow authenticated read" ON public.webhook_request_logs 
FOR SELECT TO authenticated USING (true);

-- Allow service role to insert (edge functions)
CREATE POLICY "Allow service role insert" ON public.webhook_request_logs 
FOR INSERT WITH CHECK (true);