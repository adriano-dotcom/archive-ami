CREATE TABLE public.antt_cache (
  cnpj TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.antt_cache TO service_role;

ALTER TABLE public.antt_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages antt_cache"
  ON public.antt_cache FOR ALL
  USING (false)
  WITH CHECK (false);