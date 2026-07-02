CREATE OR REPLACE FUNCTION public.notify_lead_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
BEGIN
    -- Só dispara quando o lead ENTRA na etapa "Proposta"
    IF NEW.lead_status = 'proposal'
       AND (OLD.lead_status IS DISTINCT FROM 'proposal') THEN
        PERFORM net.http_post(
            url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/replicate-lead-to-crm',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
            ),
            body := jsonb_build_object('contact_id', NEW.id)
        );
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[notify_lead_proposal] Erro: %', SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_lead_proposal ON public.contacts;

CREATE TRIGGER trg_notify_lead_proposal
AFTER UPDATE OF lead_status ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.notify_lead_proposal();