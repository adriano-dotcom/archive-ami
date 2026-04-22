
-- ============================================================
-- 1. REALTIME PUBLICATION + REPLICA IDENTITY
-- ============================================================
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- ============================================================
-- 2. ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_conv_sent
  ON public.messages (conversation_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_active_lastmsg
  ON public.conversations (last_message_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON public.messages (conversation_id)
  WHERE from_type = 'user' AND read_at IS NULL;

-- ============================================================
-- 3. NOVAS COLUNAS EM CONVERSATIONS
-- ============================================================
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS closed_category text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid;

-- ============================================================
-- 4. TRIGGERS — UNREAD COUNT
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_conversation_unread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.from_type = 'user' AND NEW.read_at IS NULL THEN
    UPDATE public.conversations
       SET unread_count = unread_count + 1
     WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_conversation_unread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quando mensagem do usuário é marcada como lida (read_at passa de NULL para valor)
  IF NEW.from_type = 'user' 
     AND OLD.read_at IS NULL 
     AND NEW.read_at IS NOT NULL THEN
    UPDATE public.conversations
       SET unread_count = GREATEST(0, unread_count - 1)
     WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_unread ON public.messages;
CREATE TRIGGER trg_increment_unread
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.increment_conversation_unread();

DROP TRIGGER IF EXISTS trg_recalc_unread ON public.messages;
CREATE TRIGGER trg_recalc_unread
AFTER UPDATE OF read_at ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.recalc_conversation_unread();

-- ============================================================
-- 5. BACKFILL — popular unread_count atual
-- ============================================================
UPDATE public.conversations c
   SET unread_count = sub.cnt
  FROM (
    SELECT conversation_id, COUNT(*)::int AS cnt
      FROM public.messages
     WHERE from_type = 'user' AND read_at IS NULL
     GROUP BY conversation_id
  ) sub
 WHERE c.id = sub.conversation_id;

-- ============================================================
-- 6. CRON DE CLEANUP — webhook_request_logs (7 dias)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_webhook_request_logs') THEN
    PERFORM cron.unschedule('cleanup_webhook_request_logs');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup_webhook_request_logs',
  '0 3 * * *',
  $$DELETE FROM public.webhook_request_logs WHERE created_at < now() - interval '7 days'$$
);
