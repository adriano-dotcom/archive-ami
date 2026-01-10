
-- ============================================================================
-- Trigger para auto-start do nina-orchestrator usando pg_net
-- ============================================================================

-- Função que chama o nina-orchestrator quando nova mensagem entra na fila
CREATE OR REPLACE FUNCTION public.trigger_nina_orchestrator()
RETURNS TRIGGER AS $$
DECLARE
    supabase_url TEXT;
    service_key TEXT;
BEGIN
    -- Só dispara em INSERT com status 'pending'
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- Obtém as configurações do ambiente
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);
    
    -- Fallback para variáveis de ambiente se não configurado
    IF supabase_url IS NULL OR supabase_url = '' THEN
        supabase_url := 'https://bbllbsbcogngjfrhhggq.supabase.co';
    END IF;

    -- Usa pg_net para fazer chamada HTTP assíncrona (non-blocking)
    PERFORM net.http_post(
        url := supabase_url || '/functions/v1/nina-orchestrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || COALESCE(service_key, current_setting('supabase.service_role_key', true))
        ),
        body := jsonb_build_object(
            'triggered_by', 'db_trigger',
            'queue_id', NEW.id,
            'message_id', NEW.message_id,
            'conversation_id', NEW.conversation_id
        )
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log do erro mas não falha a transação
    RAISE WARNING '[trigger_nina_orchestrator] Erro ao chamar orchestrator: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cria o trigger na tabela nina_processing_queue
DROP TRIGGER IF EXISTS trigger_auto_start_nina_orchestrator ON public.nina_processing_queue;

CREATE TRIGGER trigger_auto_start_nina_orchestrator
    AFTER INSERT ON public.nina_processing_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_nina_orchestrator();

-- Adiciona comentário explicativo
COMMENT ON FUNCTION public.trigger_nina_orchestrator() IS 
'Trigger function que chama a Edge Function nina-orchestrator via pg_net quando uma nova mensagem é inserida na fila de processamento.';
