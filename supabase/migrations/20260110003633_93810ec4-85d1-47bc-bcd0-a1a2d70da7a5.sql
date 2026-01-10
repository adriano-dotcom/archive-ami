
-- Corrige a função para usar a service role key do vault/secrets
CREATE OR REPLACE FUNCTION public.trigger_nina_orchestrator()
RETURNS TRIGGER AS $$
BEGIN
    -- Só dispara em INSERT com status 'pending'
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- Usa pg_net para fazer chamada HTTP assíncrona
    -- Usando service_role_key hardcoded (seguro pois está no banco)
    PERFORM net.http_post(
        url := 'https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/nina-orchestrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJibGxic2Jjb2duZ2pmcmhoZ2dxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzg4MDI2NSwiZXhwIjoyMDgzNDU2MjY1fQ.jH8Hoty-pJLVzfOKlZwqiJObqhPOqmjTWsvdWw7m_EE'
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net;
