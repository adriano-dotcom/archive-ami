CREATE OR REPLACE FUNCTION public.notify_lead_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
DECLARE
    v_secret text;
BEGIN
    IF NEW.lead_status = 'proposal'
       AND (OLD.lead_status IS DISTINCT FROM 'proposal') THEN
        v_secret := public.get_vault_secret('internal_cron_secret');
        IF v_secret IS NULL THEN
            RAISE WARNING '[notify_lead_proposal] internal_cron_secret ausente no Vault';
            RETURN NEW;
        END IF;
        PERFORM net.http_post(
            url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/replicate-lead-to-crm',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-internal-secret', v_secret
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