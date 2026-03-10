

## Plano: Remover Seguradoras — Transição para OrbePet

O `KNOWN_INSURERS` e toda a lógica de "seguradora" são resquícios do CRM de seguros (Jacometo). Para a OrbePet, isso não faz sentido. Vou remover referências em 6 arquivos.

### Alterações

**1. Esvaziar `src/constants/insurers.ts`**
- Substituir a lista por um array vazio ou remover o arquivo
- Manter o export para não quebrar imports pendentes: `export const KNOWN_INSURERS: string[] = [];`

**2. `src/components/collections/InstallmentsList.tsx`**
- Remover o filtro de seguradora (dropdown `insurerFilter`)
- Remover o import de `KNOWN_INSURERS`
- Remover a coluna "Seguradora" da tabela e o inline editing de seguradora
- Remover o `bulkUpdateInsurerMutation` do modal de ações em massa

**3. `src/components/collections/installments/EditInstallmentModal.tsx`**
- Remover o campo "Seguradora" do formulário de edição de parcela

**4. `src/components/collections/installments/useInstallments.ts`**
- Remover `insurerFilter` das options e da query
- Remover `updateInsurerMutation` e `bulkUpdateInsurerMutation`

**5. `src/components/settings/ProductKnowledgeSettings.tsx`**
- Remover dropdown de seguradora do formulário de conhecimento de produto

**6. `src/components/segurados/SeguradosTab.tsx`**
- Remover filtro `insurerFilterPF` e dropdown de seguradora

**7. `src/components/segurados/ImportDocumentAIModal.tsx`**
- Remover dropdown de seguradora do modal de importação AI

### Nota
Os dados existentes no banco (coluna `insurer` em `policies`) permanecem intactos — apenas a UI é limpa. Nenhuma migração SQL necessária.

