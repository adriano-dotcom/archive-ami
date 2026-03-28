

## Mission Control Orbe — Views de Métricas + Acesso Externo

### Mapeamento Real das Tabelas

O prompt pede views sobre "tickets" e "reembolsos". Aqui está o que **realmente existe** no banco:

| Conceito do Prompt | Tabela Real | Status |
|---|---|---|
| Tickets/atendimentos | `conversations` + `messages` + `contacts` | Existe |
| Status dos tickets | `conversation_status` enum: `nina`, `human`, `paused`, `closed` | Existe |
| Atribuição | `assigned_user_id`, `assigned_user_name`, `assigned_team` | Existe |
| Canal | Não existe coluna explícita — tudo é WhatsApp | Existe (fixo) |
| Reembolsos | **Não existe tabela** | Não existe |

**Conclusão**: As views de reembolso (4 e 5) **não podem ser criadas** porque não há tabela de reembolsos no banco. Se quiser esse módulo, precisamos criar a tabela `reimbursement_claims` primeiro.

### O que será implementado

#### Fase 1 — Views de Suporte (via migração SQL)

**1. `orbe_support_tickets_v`** (view sobre `conversations` + `contacts` + `messages`)
- Campos: id, created_at, updated_at, status (mapeado: nina→open, human→open, paused→pending, closed→closed), channel (fixo 'whatsapp'), customer_name, customer_phone, customer_email, assigned_to, last_message_at, last_message_from, unread_count, tags, priority (derivado de days sem resposta)

**2. `orbe_support_daily_metrics_v`** (view agregada)
- date_local, tickets_new_today, tickets_open_now, tickets_pending_now, tickets_closed_today, tickets_sla_over_24h, tickets_waiting_customer, by_status_json, by_assigned_to_json
- Usa `AT TIME ZONE 'America/Sao_Paulo'` para datas locais
- SLA: conversa sem resposta do time há >24h (último `from_type='user'` sem resposta `nina`/`human` posterior)

**3. `orbe_support_weekly_metrics_v`** (mesma lógica, janela de 7 dias)

#### Fase 2 — Segurança de Acesso

Views no Supabase são acessíveis via REST com a **anon key** ou **service_role key**. A abordagem segura:

- Criar RLS policies nas views que permitam SELECT apenas para usuários autenticados com role `admin`
- Para acesso externo (scripts no Mac), usar a **service_role key** que já existe como secret, pois views não suportam RLS diretamente — o acesso será controlado pelo tipo de key usada
- Alternativa: criar uma Edge Function `mission-control-data` que valida um `BRIDGE_SECRET` header e retorna os dados das views, evitando expor a service_role key

**Recomendação**: Edge Function com validação por `BRIDGE_SECRET` (já existe como secret) é mais seguro que expor a service_role key nos scripts do Mac.

#### Fase 3 — Edge Function `mission-control-data`

- Endpoint: `POST /functions/v1/mission-control-data`
- Header: `Authorization: Bearer <BRIDGE_SECRET>`
- Body: `{ "view": "support_daily" | "support_weekly" | "support_tickets" }`
- Retorna JSON com os dados da view solicitada
- `verify_jwt = false` (usa BRIDGE_SECRET para auth)

### Sobre Reembolsos

Para implementar as views 4 e 5, precisamos **primeiro criar a tabela `reimbursement_claims`** com campos como:
- id, contact_id, status (submitted/under_review/approved/paid/rejected), amount_requested, amount_paid, clinic_name, pet_name, paid_at, created_at, updated_at

**Quer que eu inclua a criação dessa tabela no plano?**

### Arquivos a criar/modificar

1. **Migração SQL**: 3 views (`orbe_support_tickets_v`, `orbe_support_daily_metrics_v`, `orbe_support_weekly_metrics_v`)
2. **Edge Function**: `supabase/functions/mission-control-data/index.ts`
3. **Config**: Adicionar `[functions.mission-control-data]` com `verify_jwt = false` ao `supabase/config.toml`

### Exemplos de Consumo (para scripts do Mac)

```text
# Daily metrics
curl -s "https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/mission-control-data" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"view":"support_daily"}' \
  > site-mission-control/data/orbe_support_daily.json

# Weekly metrics
curl -s "https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/mission-control-data" \
  -H "Authorization: Bearer $BRIDGE_SECRET" \
  -d '{"view":"support_weekly"}' \
  > site-mission-control/data/orbe_support_weekly.json
```

