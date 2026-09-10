CREATE OR REPLACE FUNCTION public.trigger_whatsapp_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
BEGIN
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/whatsapp-sender',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', '2abf25a6b3508d8633db5be7c53953d588554be873e6e1aa0001577a69bc20a7'
        ),
        body := jsonb_build_object('triggered_by', 'db_trigger', 'queue_id', NEW.id)
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[trigger_whatsapp_sender] Erro: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_nina_orchestrator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
BEGIN
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/nina-orchestrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', '2abf25a6b3508d8633db5be7c53953d588554be873e6e1aa0001577a69bc20a7'
        ),
        body := jsonb_build_object('triggered_by', 'db_trigger', 'queue_id', NEW.id, 'message_id', NEW.message_id)
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[trigger_nina_orchestrator] Erro: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_lead_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $function$
BEGIN
    IF NEW.lead_status = 'proposal'
       AND (OLD.lead_status IS DISTINCT FROM 'proposal') THEN
        PERFORM net.http_post(
            url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/replicate-lead-to-crm',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'x-internal-secret', '2abf25a6b3508d8633db5be7c53953d588554be873e6e1aa0001577a69bc20a7'
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