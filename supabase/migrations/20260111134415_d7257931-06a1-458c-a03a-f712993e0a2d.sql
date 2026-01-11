-- Adicionar campo para marcação manual de seguro de carga
ALTER TABLE policies ADD COLUMN IF NOT EXISTS is_cargo_insurance BOOLEAN DEFAULT false;

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_policies_cargo ON policies(is_cargo_insurance) WHERE is_cargo_insurance = true;

-- Atualizar apólices existentes baseado em branch/product conhecidos (ramos de transporte SUSEP)
UPDATE policies SET is_cargo_insurance = true 
WHERE is_cargo_insurance = false AND (
  branch IN ('309', '31', '32', '33', '0309', '031', '032', '033')
  OR LOWER(product) LIKE '%transportador%'
  OR LOWER(product) LIKE '%rctr%'
  OR LOWER(product) LIKE '%rctr-c%'
  OR LOWER(product) LIKE '%rc-dc%'
  OR LOWER(product) LIKE '%carga%'
  OR LOWER(product) LIKE '%transporte%'
  OR LOWER(product) LIKE '%embarcador%'
);

-- Comentário para documentação
COMMENT ON COLUMN policies.is_cargo_insurance IS 'Indica se a apólice é de seguro de carga/transporte. Pode ser definido automaticamente por branch/product ou manualmente.';