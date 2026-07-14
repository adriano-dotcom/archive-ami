
CREATE TABLE public.rate_limit_hits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

GRANT ALL ON public.rate_limit_hits TO service_role;

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated — table is service-role only, accessed via SECURITY DEFINER function.

CREATE INDEX idx_rate_limit_hits_window ON public.rate_limit_hits (window_start);

CREATE OR REPLACE FUNCTION public.check_rate_limit(_key text, _max integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket timestamptz;
  new_count integer;
BEGIN
  -- Snap current time to a fixed bucket boundary
  bucket := to_timestamp(
    (extract(epoch from now())::bigint / _window_seconds) * _window_seconds
  );

  INSERT INTO public.rate_limit_hits (key, window_start, count)
  VALUES (_key, bucket, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limit_hits.count + 1
  RETURNING count INTO new_count;

  RETURN new_count <= _max;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role, authenticated, anon;

CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_hits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '1 hour';
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_hits() TO service_role;
