-- 1. Coluna assigned_user_id já foi criada na migration anterior — garantir idempotência
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_user 
ON public.contacts(assigned_user_id) 
WHERE assigned_user_id IS NOT NULL;

-- 2. Inserir tags 'cliente' e 'tutor' em tag_definitions
INSERT INTO public.tag_definitions (key, label, color, category)
VALUES 
  ('cliente', 'Cliente', '#10b981', 'custom'),
  ('tutor', 'Tutor', '#3b82f6', 'custom')
ON CONFLICT (key) DO NOTHING;

-- 3. Trigger para auto-tag de cliente/tutor (idempotência via CREATE OR REPLACE FUNCTION)
CREATE OR REPLACE FUNCTION public.auto_tag_customer_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.lead_status = 'customer' THEN
    IF NEW.tags IS NULL THEN
      NEW.tags := ARRAY[]::text[];
    END IF;
    IF NOT ('cliente' = ANY(NEW.tags)) THEN
      NEW.tags := array_append(NEW.tags, 'cliente');
    END IF;
    IF NOT ('tutor' = ANY(NEW.tags)) THEN
      NEW.tags := array_append(NEW.tags, 'tutor');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_tag_customer_contact ON public.contacts;
CREATE TRIGGER trg_auto_tag_customer_contact
BEFORE INSERT OR UPDATE OF lead_status ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.auto_tag_customer_contact();

-- 4. Backfill: aplicar tags em contatos clientes existentes
UPDATE public.contacts
SET tags = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(COALESCE(tags, ARRAY[]::text[]) || ARRAY['cliente','tutor'])
  )
)
WHERE lead_status = 'customer'
  AND (NOT ('cliente' = ANY(COALESCE(tags, ARRAY[]::text[]))) 
       OR NOT ('tutor' = ANY(COALESCE(tags, ARRAY[]::text[]))));