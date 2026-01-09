-- Tabela para armazenar notificações de mudança de status de templates
CREATE TABLE public.template_status_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  meta_template_id TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_language TEXT,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reason TEXT,
  rejection_reason TEXT,
  rejection_recommendation TEXT,
  disable_date TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para buscar notificações não lidas rapidamente
CREATE INDEX idx_template_notifications_unread 
ON public.template_status_notifications(read_at) 
WHERE read_at IS NULL;

-- Índice para ordenação por data
CREATE INDEX idx_template_notifications_created_at 
ON public.template_status_notifications(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.template_status_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - permitir leitura e atualização para usuários autenticados
CREATE POLICY "Authenticated users can view template notifications" 
ON public.template_status_notifications 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Authenticated users can update template notifications" 
ON public.template_status_notifications 
FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Service role can insert template notifications" 
ON public.template_status_notifications 
FOR INSERT 
TO service_role 
WITH CHECK (true);

-- Habilitar realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.template_status_notifications;