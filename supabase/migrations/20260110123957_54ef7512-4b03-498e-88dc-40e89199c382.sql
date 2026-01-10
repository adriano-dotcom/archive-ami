-- Criar função que dispara o whatsapp-sender automaticamente
CREATE OR REPLACE FUNCTION public.trigger_whatsapp_sender()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Só dispara em INSERT com status 'pending'
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- Usa pg_net para fazer chamada HTTP assíncrona
    PERFORM net.http_post(
        url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/whatsapp-sender',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('supabase.service_role_key', true)
        ),
        body := jsonb_build_object(
            'triggered_by', 'db_trigger',
            'queue_id', NEW.id
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[trigger_whatsapp_sender] Erro: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_auto_start_whatsapp_sender ON public.send_queue;

-- Criar o trigger na tabela send_queue
CREATE TRIGGER trigger_auto_start_whatsapp_sender
    AFTER INSERT ON public.send_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_whatsapp_sender();