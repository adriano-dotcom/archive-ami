

## Criar Edge Function `jarvis-sync` + Notificações em Tempo Real no Webhook

### Visão Geral

Criar uma nova edge function `jarvis-sync` que o Jarvis chama para puxar dados operacionais, e atualizar o `receive-ecommerce-webhook` para notificar o Jarvis em tempo real quando vendas e reembolsos ocorrem.

### 1. Criar `supabase/functions/jarvis-sync/index.ts`

Nova edge function autenticada via `JARVIS_SYNC_SECRET` (header `x-jarvis-secret` ou `Authorization: Bearer`). Suporta 7 views:

| View | Dados |
|------|-------|
| `dashboard` | Resumo geral: vendas hoje/mês, reembolsos pendentes, leads ativos, conversas ativas, inadimplência, MRR estimado |
| `vendas_hoje` | Lista de vendas pagas hoje (ecommerce_orders + contato com UTM) |
| `vendas_mes` | Vendas agrupadas por dia + receita total do mês |
| `vendas_por_utm` | Cruzamento utm_source x utm_campaign com contagem de vendas |
| `reembolsos` | Funil completo (submitted → under_review → paid/rejected) + métricas |
| `leads_por_origem` | Leads agrupados por lead_source com taxa de conversão (lead → customer) |
| `cobranca` | Inadimplência por faixas (1-30d, 31-60d, 61-90d, 90d+) usando tabela installments |

Autenticação: mesma pattern do `mission-control-data` (secret compartilhado via header).

### 2. Atualizar `receive-ecommerce-webhook`

Após processar `purchase_paid` e `refund_request`, fazer POST fire-and-forget para `JARVIS_WEBHOOK_URL` com os dados do evento. Envolvido em try/catch para não bloquear o fluxo principal.

```text
purchase_paid → POST jarvis { event: "nova_venda", contact, amount, order_id }
refund_request → POST jarvis { event: "novo_reembolso", contact, amount, claim_id }
```

### 3. Secrets Necessários

Solicitar ao usuário via `add_secret`:
- `JARVIS_WEBHOOK_URL` = `https://jarvis.jacometo.com.br`
- `JARVIS_SYNC_SECRET` = token compartilhado para autenticação

### 4. Config

Adicionar ao `supabase/config.toml`:
```toml
[functions.jarvis-sync]
verify_jwt = false
```

### Detalhes Técnicos

- Queries usam tabelas existentes: `ecommerce_orders`, `contacts`, `reimbursement_claims`, `installments`, `conversations`
- UTM vem de `contacts.utm_source`, `contacts.utm_campaign`
- MRR estimado = contagem de customers ativos × valor médio (ou soma de installments pending do mês)
- Cobrança usa `installments.days_overdue` + `installments.status` para faixas
- Notificação ao Jarvis é assíncrona (fire-and-forget), não impacta latência do webhook

