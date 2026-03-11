
-- Fix collection_summary view: set SECURITY INVOKER so it respects RLS on installments table
ALTER VIEW public.collection_summary SET (security_invoker = on);
