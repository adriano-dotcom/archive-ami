-- Vincular contatos de cobrança às empresas pelo CNPJ
UPDATE contacts c
SET company_id = comp.id
FROM companies comp
WHERE c.cnpj = comp.cnpj
  AND c.cnpj IS NOT NULL
  AND c.cnpj != ''
  AND c.company_id IS NULL
  AND c.lead_source = 'import_cobranca';