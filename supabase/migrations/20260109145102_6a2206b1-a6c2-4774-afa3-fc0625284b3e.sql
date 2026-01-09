-- Remover constraint antiga que causa sobrescrita de parcelas
ALTER TABLE installments DROP CONSTRAINT IF EXISTS installments_policy_id_installment_number_key;

-- Criar nova constraint com due_date para permitir múltiplas parcelas com mesmo número mas datas diferentes
-- APRENDIZADO: Tokio Marine usa endosso para diferenciar parcelas da mesma apólice com mesmo installment_number
ALTER TABLE installments ADD CONSTRAINT installments_policy_inst_date_unique 
  UNIQUE (policy_id, installment_number, due_date);