

## Cliente badge + Responsável + auto-tags Cliente/Tutor

### O que muda

**1. Badge "Cliente" mais destacado na tabela de Contatos**
- Quando `lead_status = 'customer'`, mostrar um badge verde com ícone de coroa/check ao lado do nome (além do dropdown de status atual), tornando visualmente óbvio quais são clientes ativos.

**2. Coluna "Responsável" na tabela de Contatos**
- Adicionar nova coluna `Responsável` mostrando o atendente atribuído (avatar + primeiro nome) ou "—".
- Permitir trocar o responsável diretamente pela tabela via dropdown com a lista de membros ativos da Equipe.
- Filtro no header: "Meus contatos / Sem responsável / Todos".

**3. Atribuição de responsável também no Drawer de detalhes e no modal de Edição**
- Campo "Responsável pelo contato" com select dos membros da Equipe.

**4. Auto-tag "Cliente" + "Tutor" ao virar cliente**
- Quando o status do contato muda para `customer` (via dropdown da tabela, drawer, edição ou criação com status=customer), o sistema adiciona automaticamente as tags `cliente` e `tutor` ao array `contacts.tags`.
- Se o status sair de `customer`, as tags **permanecem** (cliente continua sendo tutor mesmo se mudar fase).
- As duas tags são criadas em `tag_definitions` se ainda não existirem (cor verde para `cliente`, cor azul para `tutor`).

### Mudanças técnicas

**Banco (1 migration):**
- `ALTER TABLE contacts ADD COLUMN assigned_user_id uuid REFERENCES team_members(id) ON DELETE SET NULL;`
- `CREATE INDEX idx_contacts_assigned_user ON contacts(assigned_user_id) WHERE assigned_user_id IS NOT NULL;`
- INSERT em `tag_definitions` para `cliente` (verde #10b981) e `tutor` (azul #3b82f6) se não existirem.
- Trigger `auto_tag_customer_contact()` em `contacts`: após UPDATE/INSERT, se `lead_status='customer'` e tags não contém `cliente`/`tutor`, adiciona via `array_append` (idempotente).
- Backfill: rodar UPDATE em todos contatos atuais com `lead_status='customer'` para popular as tags.

**Frontend:**
- `src/hooks/useContacts.ts` — `ContactLight` ganha `assigned_user_id?: string`, `assigned_user_name?: string`, `tags?: string[]`; query passa a selecionar esses campos + JOIN leve em `team_members(name)`.
- `src/components/contacts/VirtualizedContactsTable.tsx`:
   - Nova coluna **Responsável** (140px) entre "Chat" e "Canais".
   - Badge verde "✓ Cliente" no nome quando `status==='customer'`.
   - Dropdown na coluna Responsável com lista de team members (carregada uma vez via React Query).
- `src/components/ContactDetailsDrawer.tsx` e `src/components/EditContactModal.tsx` — adicionar select "Responsável".
- `src/components/CreateContactModal.tsx` — adicionar select "Responsável" no bloco "Dados Pessoais".
- Filtro de responsável no header da tabela (popover semelhante aos existentes).

### Layout esperado da nova tabela

```text
[ ☐ ] Nome (+badge ✓Cliente)  Status  Criação  Chat  Responsável  Canais  CNPJ  Última  Ações
```

### Fora do escopo (próxima iteração)
- Notificação ao atendente quando recebe novo contato atribuído.
- Histórico de mudanças de responsável.
- Auto-atribuir contato ao operador que iniciou a primeira conversa.

