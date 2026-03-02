

## Plano: Remover integração Pipedrive

Arquivos e componentes a remover/editar:

### 1. Deletar edge function
- Deletar `supabase/functions/sync-pipedrive/index.ts`

### 2. Remover aba Pipedrive das Configurações (`src/components/Settings.tsx`)
- Remover import do `PipedriveSettings`
- Remover ref, save/cancel/isSaving do pipedrive
- Remover `<TabsTrigger value="pipedrive">` e `<TabsContent value="pipedrive">`

### 3. Deletar componente `src/components/settings/PipedriveSettings.tsx`

### 4. Limpar referências no Dashboard (`src/components/Dashboard.tsx`)
- Remover `pipedrive` do objeto `integrations` e da lista de integrações exibidas

### 5. Limpar referência no VaultMigrationPanel (`src/components/settings/VaultMigrationPanel.tsx`)
- Remover linha `pipedrive_api_token`

### Nota
As colunas `pipedrive_*` na tabela `nina_settings` e `pipedrive_person_id` em `contacts` serão mantidas no banco por segurança (não quebram nada). Se quiser removê-las depois, podemos fazer uma migração separada.

