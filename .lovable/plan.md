

## Landing Pages de Captura + Nutrição de Leads

### ✅ Fase 1 — Implementada
- Tabelas `landing_pages` e `lead_captures` com RLS
- Edge Function `capture-lead` (público, sem JWT)
- Página pública `/lp/:slug` com formulário de captura
- Painel admin `/landing-pages` com CRUD e visualização de leads
- Menu "Landing Pages" no sidebar

### Fase 2 — Nutrição Automatizada (próximo)
- Tabela `nurture_sequences` com steps JSONB
- Edge Function `process-nurture` (cron diário)
- Sequência: WhatsApp boas-vindas → emails educativos → oferta

### Fase 3 — Webhook de Compra do Site
- Edge Function `website-purchase-webhook`
- Integrar com orbepet.com.br

### Fase 4 — Dashboard de Performance
- Métricas por landing page
- Funil de nutrição
