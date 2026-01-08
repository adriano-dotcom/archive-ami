-- Adicionar campo CPF à tabela contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cpf text;

-- Criar índice para buscas por CPF
CREATE INDEX IF NOT EXISTS idx_contacts_cpf ON contacts(cpf) WHERE cpf IS NOT NULL;