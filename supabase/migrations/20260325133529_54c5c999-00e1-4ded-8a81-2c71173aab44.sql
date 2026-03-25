
CREATE OR REPLACE FUNCTION public.trigger_nina_orchestrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
BEGIN
    -- Só dispara em INSERT com status 'pending'
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- Usa pg_net para fazer chamada HTTP assíncrona
    PERFORM net.http_post(
        url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/nina-orchestrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
        ),
        body := jsonb_build_object(
            'triggered_by', 'db_trigger',
            'queue_id', NEW.id,
            'message_id', NEW.message_id
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[trigger_nina_orchestrator] Erro: %', SQLERRM;
    RETURN NEW;
END;
$function$;
