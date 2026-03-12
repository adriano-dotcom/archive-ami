

## Auditoria Final: Referências Legadas de Seguro de Carga e Jacometo

Encontrei referências significativas em **8 arquivos** que precisam ser limpas. Aqui está o inventário completo:

---

### 1. `supabase/functions/generate-email-copy/index.ts` (CRÍTICO)
- Linhas 30-118: Blocos inteiros sobre RCTR-C, RC-DC, RC-V, seguro de transporte, frotas, "DIFERENCIAL JACOMETO"
- Contextos `carga`, `frotas`, `ambos` com conteúdo 100% de seguros de transporte
- **Ação:** Remover os contextos `carga`, `frotas`, `ambos` e substituir por contexto `pet` (saúde pet, planos OrbePet)

### 2. `supabase/functions/sales-coaching-analysis/index.ts`
- Linha 38: `jacometoseguros.com.br` como URL permitida
- Linha 109: `adriano@jacometo.com.br` como destinatário padrão de alertas
- **Ação:** Trocar URL para domínio OrbePet, atualizar email padrão

### 3. `supabase/functions/send-email/index.ts`
- Linha 102: `"Jacometo Seguros <noreply@jacometo.com.br>"` como remetente padrão
- **Ação:** Trocar para `"OrbePet <noreply@orbepet.com.br>"` (ou similar)

### 4. `supabase/functions/send-collection-emails/index.ts`
- Linha 56-57: `'Jacometo Seguros <jacometo@jacometo.com.br>'` e `'joao.pedro@jacometo.com.br'` como fallbacks
- **Ação:** Trocar fallbacks para OrbePet

### 5. `supabase/functions/process-scheduled-emails/index.ts`
- Linha 75: `'Jacometo Seguros'` como nome padrão do remetente
- **Ação:** Trocar para `'OrbePet'`

### 6. `supabase/functions/send-daily-callbacks/index.ts`
- Linha 230: URL `https://app.jacometo.com.br/scheduling`
- Linha 238: `"Jacometo CRM"` no rodapé do email
- Linha 246: `'Jacometo CRM <notificacoes@resend.dev>'` como remetente
- **Ação:** Trocar todas as referências para OrbePet CRM

### 7. `src/components/Team.tsx`
- Linha 169: `'Equipe Jacometo'` como nome do inviter fallback
- **Ação:** Trocar para `'Equipe OrbePet'`

### 8. `src/components/settings/ProductKnowledgeSettings.tsx`
- Linha 228: Placeholder `"Ex: RCTR-C Porto Seguro"`
- Linha 272: Header `"Seguradora"` na tabela
- **Ação:** Trocar placeholder para `"Ex: Órbita Plus"`, header para `"Categoria"` ou remover

### 9. `nina_settings` no banco de dados
- Colunas `collection_email_from` e `collection_email_bcc` têm defaults com `jacometo.com.br`
- **Ação:** Migração SQL para atualizar os defaults dessas colunas

---

### Resumo de alterações

| Arquivo | Tipo | Ação |
|---------|------|------|
| `generate-email-copy/index.ts` | Edge function | Substituir contextos de seguro por pet |
| `sales-coaching-analysis/index.ts` | Edge function | Atualizar URL e email |
| `send-email/index.ts` | Edge function | Trocar remetente padrão |
| `send-collection-emails/index.ts` | Edge function | Trocar fallbacks |
| `process-scheduled-emails/index.ts` | Edge function | Trocar nome padrão |
| `send-daily-callbacks/index.ts` | Edge function | Trocar URL, nome e remetente |
| `src/components/Team.tsx` | Frontend | Trocar nome fallback |
| `src/components/settings/ProductKnowledgeSettings.tsx` | Frontend | Trocar placeholder e header |
| Migração SQL | Banco | Atualizar defaults de email |

Total: 9 arquivos + 1 migração SQL. Deploy de 6 edge functions após alterações.

