-- Adicionar constraint UNIQUE para policy_id + installment_number
-- Isso permite o upsert funcionar corretamente na importação
ALTER TABLE public.installments 
ADD CONSTRAINT installments_policy_installment_unique 
UNIQUE (policy_id, installment_number);