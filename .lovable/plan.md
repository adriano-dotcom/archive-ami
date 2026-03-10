

## Plano: Remover Referências a Jacometo e Seguros de Carga

Escopo amplo — 12 arquivos com referências ao antigo CRM de seguros. Dividido em frontend e edge functions.

### Frontend (5 arquivos)

**1. `src/pages/Auth.tsx`**
- Trocar import de `jacometo-logo.png` para um logo OrbePet (ou texto "OrbePet")

**2. `src/components/EditContactModal.tsx`**
- Segmentos: `🚛 Transporte (Seguro de Carga)` → `🐕 Pet (Tutor)` | `🚗 Automotores (Seguro de Frota)` → `🏥 Clínica/Petshop`

**3. `src/components/settings/EmailTemplateEditorModal.tsx`**
- `"Equipe Jacometo Seguros"` → `"Equipe OrbePet"`

**4. `src/components/settings/FollowupAutomationsSettings.tsx`**
- Mensagens de agente: trocar `"seguro de carga"` por `"plano de saúde pet"`, `"adri"` → `"orbi"`

**5. `src/components/settings/AgentsSettings.tsx`**
- Placeholder: `"seguro de carga", "rctr-c"` → `"plano de saúde pet", "consulta veterinária"`

### Edge Functions (7 arquivos)

**6. `supabase/functions/send-invite-email/index.ts`**
- `"Jacometo CRM"` → `"OrbePet CRM"` em todo o email de convite
- `"Jacometo Corretora de Seguros"` → `"OrbePet"`

**7. `supabase/functions/generate-prompt/index.ts`**
- Arquivo mais pesado — remover todo o bloco de `<regulatory_faq>` (MEI, ANTT, CT-e, RCTR-C) e `<objection_handling>` de seguros
- Remover `<departamentos_jacometo>`, links para `jacometoseguros.com.br`
- Manter a estrutura do gerador de prompt genérica (ele gera prompts baseados nos inputs do formulário, que já são genéricos)

**8. `supabase/functions/nina-orchestrator/index.ts`**
- `OUT_OF_SCOPE_INSURANCE_KEYWORDS` — remover ou substituir por keywords OrbePet
- Remover bloco de informações oficiais da Jacometo (endereço, telefone, site)
- Remover `getDefaultRenewalEmail` e referências a "seguro de cargas" nos emails de renovação
- Remover `jacometoseguros.com.br` sanitization
- `"Sofia, especialista em X da Jacometo"` → referência genérica ao agente

**9. `supabase/functions/generate-email-copy/index.ts`**
- Substituir contextos de produto (transporte/frotas) por contexto pet
- `"Jacometo Seguros"` → `"OrbePet"` nos templates de email

**10. `supabase/functions/process-followups/index.ts`**
- Remover link `jacometoseguros.com.br` do final das mensagens de followup

**11. `supabase/functions/test-qualification-email/index.ts`**
- `adriano@jacometo.com.br` → placeholder genérico
- `"Jacometo Seguros - SDR Adri"` → `"OrbePet"`

**12. `supabase/functions/analyze-conversation/index.ts`**
- Remover campos de qualificação de carga: `tipo_carga`, `valor_medio`, `maior_valor`, `contratacao`, referências a CT-e/CNPJ de transportadora
- Manter campos genéricos reutilizáveis (email, empresa, estados)

### Nota
- O logo `src/assets/jacometo-logo.png` permanece no repositório (pode ser substituído depois por um asset OrbePet)
- Alterações em edge functions serão deployed automaticamente

