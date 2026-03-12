

## De Contato para Tutor: CPF, Nome do Pet, sem CNPJ/Empresa

### Alterações necessárias

**1. Migração SQL** — Adicionar coluna `pet_name` na tabela `contacts` (CPF já existe na tabela)

```sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pet_name text;
```

**2. `src/components/ChatInterface.tsx`** — Painel lateral do chat:
- Substituir bloco CNPJ (linhas 2690-2723) por bloco **CPF** com campo `cpf` (já existe na tabela)
- Substituir bloco Empresa (linhas 2725-2746) por bloco **Nome do Pet** com campo `pet_name`
- Atualizar estados: `editCnpj` → `editCpf`, `editCompany` → `editPetName`
- Remover `handleCnpjLookup` (busca BrasilAPI)
- Atualizar `handleSaveContactData` para salvar `cpf` e `pet_name` ao invés de `cnpj` e `company`
- Placeholder email: `email@empresa.com` → `email@exemplo.com`
- Seção header: "Dados de Contato" → "Dados do Tutor"

**3. `src/components/ContactDetailsDrawer.tsx`** — Drawer de detalhes:
- Substituir `CNPJ` por `CPF` (com formatação `000.000.000-00`)
- Substituir `Empresa` por `Nome do Pet` (ícone de pata ou similar)
- Remover `formatCNPJ`, adicionar `formatCPF`
- Seção header: "Dados de Contato" → "Dados do Tutor"

**4. `src/types.ts`** — Tipo Conversation:
- `contactCnpj` → `contactCpf`
- `contactCompany` → `contactPetName`
- Atualizar `mapConversation` para mapear os novos campos

**5. Componentes dependentes** (ajustes de referência):
- `EmailComposeModal.tsx`: trocar referências cnpj/company
- `SendWhatsAppTemplateModal.tsx`: trocar `contactCompany`
- `Contacts.tsx`: ajustar busca por CPF ao invés de CNPJ

