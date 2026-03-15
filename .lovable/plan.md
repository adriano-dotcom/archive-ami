

## Sistema de Nutrição Automatizada para Leads

Criar um sistema completo de sequências de nutrição (drip campaigns) por email e WhatsApp, acionado automaticamente após captura de lead nas landing pages.

### Arquitetura

```text
Lead capturado (capture-lead)
  │
  ├─► Insere em lead_nurture_enrollments (dia 0)
  │
  └─► Cron diário (process-nurture)
        │
        ├─ Para cada enrollment ativo:
        │   ├─ Calcula dias desde captura
        │   ├─ Encontra próximo step da sequência
        │   ├─ Se canal = 'whatsapp' → envia template via send-whatsapp-template
        │   └─ Se canal = 'email' → envia via send-email
        │
        └─ Marca step como enviado
```

### Tabelas novas (migração SQL)

**`nurture_sequences`** — Define sequências de nutrição
- id, name, description, trigger_type (lead_capture | manual), landing_page_id (nullable), is_active, created_at, updated_at
- steps (jsonb[]): `[{ day: 0, channel: 'whatsapp', template_name: '...', subject: null, content: null }, { day: 2, channel: 'email', subject: 'Guia completo...', content: '<html>...' }]`

**`lead_nurture_enrollments`** — Controla em qual sequência cada lead está
- id, sequence_id (FK), contact_id (FK), lead_capture_id (FK nullable), enrolled_at, current_step (int default 0), status (active | completed | cancelled), last_step_sent_at, completed_at, created_at

**`nurture_step_logs`** — Log de cada step enviado
- id, enrollment_id (FK), step_index (int), channel (email | whatsapp), status (sent | failed), sent_at, error_message, created_at

RLS: authenticated users podem gerenciar tudo; service role para a edge function.

### Edge Function `process-nurture`

- Busca enrollments com status='active'
- Para cada um, calcula `dias_desde_enrollment = now() - enrolled_at`
- Encontra o próximo step (step_index > current_step e day <= dias_desde_enrollment)
- Respeita horário comercial (09h-18h) e dias úteis
- Envia via canal apropriado:
  - **WhatsApp**: cria conversa se não existir, envia template via API Meta
  - **Email**: envia via edge function `send-email` existente (Resend)
- Loga em `nurture_step_logs`
- Atualiza `current_step` e `last_step_sent_at`
- Se último step, marca `status = 'completed'`

### Integração com `capture-lead`

Após capturar o lead, verificar se há sequências ativas vinculadas àquela landing page. Se sim, criar enrollment automaticamente.

### UI Admin — Nova aba em Settings ou seção em Landing Pages

**Componente `NurtureSequencesSettings.tsx`**:
- Lista de sequências com status (ativa/inativa)
- Criar/editar sequência: nome, landing page vinculada, toggle ativo
- Editor de steps visual (timeline vertical):
  - Dia (0, 2, 5, 7, 10...)
  - Canal (WhatsApp template ou Email)
  - Para WhatsApp: seletor de template existente
  - Para Email: subject + editor HTML (reutilizar EmailTemplateEditorModal)
- Visualização de enrollments ativos por sequência
- Logs de envio com status

**Integração no menu**: Adicionar aba "Nutrição" dentro do admin de Landing Pages, ou nova entrada no sidebar.

### Arquivos a criar/modificar

1. **Migração SQL** — 3 tabelas + RLS
2. **`supabase/functions/process-nurture/index.ts`** — Edge function de processamento
3. **`supabase/functions/capture-lead/index.ts`** — Adicionar auto-enrollment
4. **`src/components/landing-pages/NurtureSequencesSettings.tsx`** — UI de gestão
5. **`src/components/landing-pages/LandingPagesAdmin.tsx`** — Adicionar aba de nutrição
6. **`supabase/config.toml`** — Registrar process-nurture com verify_jwt = false

### Steps de exemplo (pré-configurados)

| Dia | Canal | Conteúdo |
|-----|-------|----------|
| 0 | WhatsApp | Template de boas-vindas + link do material |
| 2 | Email | Conteúdo educativo sobre saúde pet |
| 5 | WhatsApp | Depoimento / caso de sucesso |
| 7 | Email | Comparativo de planos OrbePet |
| 10 | WhatsApp | Oferta especial com desconto |

