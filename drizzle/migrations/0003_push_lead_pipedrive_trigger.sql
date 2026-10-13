ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS sent_to_pipedrive_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipedrive_sync_error text;

CREATE OR REPLACE FUNCTION public.push_lead_pipedrive_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
DECLARE
    v_secret text;
BEGIN
    IF (TG_OP = 'INSERT'
        OR OLD.lead_status IS DISTINCT FROM NEW.lead_status
        OR OLD.cnpj IS DISTINCT FROM NEW.cnpj)
       AND NEW.sent_to_pipedrive_at IS NULL THEN
        v_secret := public.get_vault_secret('internal_cron_secret');
        IF v_secret IS NULL THEN
            RAISE WARNING '[push_lead_pipedrive] internal_cron_secret ausente no Vault';
            RETURN NEW;
        END IF;
        PERFORM net.http_post(
            url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/push-lead-pipedrive',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-internal-secret', v_secret
            ),
            body := jsonb_build_object('contact_id', NEW.id)
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[push_lead_pipedrive] Erro: %', SQLERRM;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_push_lead_pipedrive ON public.contacts;
CREATE TRIGGER trg_push_lead_pipedrive
AFTER INSERT OR UPDATE OF lead_status, cnpj ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.push_lead_pipedrive_trigger();