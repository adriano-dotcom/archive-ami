-- Remover trigger e funções órfãs do sistema de deals/pipelines
-- Isso corrige a importação de parcelas que falha ao criar novos contatos

-- 1. Remover o trigger que causa o erro
DROP TRIGGER IF EXISTS auto_create_deal_on_contact ON contacts;

-- 2. Remover funções órfãs do sistema de deals
DROP FUNCTION IF EXISTS create_deal_for_new_contact();
DROP FUNCTION IF EXISTS get_next_deal_owner(uuid);