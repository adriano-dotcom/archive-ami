CREATE OR REPLACE FUNCTION public.enforce_single_active_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_active AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.conversations
    SET is_active = false, updated_at = now()
    WHERE contact_id = NEW.contact_id
      AND id <> NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_active_conversation ON public.conversations;
CREATE TRIGGER trg_enforce_single_active_conversation
BEFORE INSERT OR UPDATE OF is_active, contact_id ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_active_conversation();