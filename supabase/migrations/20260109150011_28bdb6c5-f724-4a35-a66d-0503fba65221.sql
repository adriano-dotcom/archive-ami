-- Remover constraint antiga que está bloqueando a inserção de múltiplas parcelas
-- O nome real é installments_policy_installment_unique (não installments_policy_id_installment_number_key)
ALTER TABLE installments DROP CONSTRAINT IF EXISTS installments_policy_installment_unique;

-- Garantir que a nova constraint com due_date existe
ALTER TABLE installments DROP CONSTRAINT IF EXISTS installments_policy_inst_date_unique;
ALTER TABLE installments ADD CONSTRAINT installments_policy_inst_date_unique 
  UNIQUE (policy_id, installment_number, due_date);