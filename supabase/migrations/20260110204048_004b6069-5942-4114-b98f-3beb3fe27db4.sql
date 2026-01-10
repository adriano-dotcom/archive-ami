-- Índice composto para ordenação + filtro de status
CREATE INDEX IF NOT EXISTS idx_contacts_last_activity_status 
ON public.contacts (last_activity DESC, lead_status) 
WHERE is_blocked = false;

-- Índice para contagem rápida de contatos ativos
CREATE INDEX IF NOT EXISTS idx_contacts_active_count 
ON public.contacts (id) 
WHERE is_blocked = false;

-- Índice covering para listagem (evita table lookup)
CREATE INDEX IF NOT EXISTS idx_contacts_list_covering 
ON public.contacts (last_activity DESC) 
INCLUDE (id, name, call_name, phone_number, email, lead_status, company, campaign, vertical, created_at);