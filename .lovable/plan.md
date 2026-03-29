

## Integração E-commerce → CRM + Funil de Reembolso

### Resumo
O site de compras enviará dados via webhook para o sistema. Quando uma **compra for paga**, o sistema cria/atualiza o contato e dispara automaticamente o template de boas-vindas via WhatsApp. Quando um **pedido de reembolso** chegar, cria uma entrada na tabela `reimbursement_claims` existente. Um novo **Funil de Reembolso** (Kanban visual) permitirá acompanhar cada solicitação.

---

### 1. Edge Function: `receive-ecommerce-webhook`
Nova function que recebe POST do site de compras com dois tipos de evento:

**Evento `purchase_paid`:**
- Recebe: nome, telefone, email, pet_name, valor, order_id
- Cria ou atualiza contato na tabela `contacts` (upsert por telefone)
- Seta `lead_status = 'customer'`
- Cria conversa se não existir
- Chama `send-whatsapp-template` com o template de boas-vindas já criado na Meta
- Salva metadata da compra no contato

**Evento `refund_request`:**
- Recebe: telefone/email, order_id, valor, motivo
- Localiza o contato existente
- Cria registro em `reimbursement_claims` com status `submitted`
- (Futuro: dispara template de reembolso quando criado na Meta)

**Autenticação:** via header `x-ecommerce-secret` (novo secret a configurar)

### 2. Tabela de pedidos (nova)
```sql
CREATE TABLE public.ecommerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id),
  order_id text NOT NULL,
  event_type text NOT NULL, -- 'purchase_paid', 'refund_request'
  amount numeric NOT NULL,
  status text DEFAULT 'completed',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```
Registra todas as transações recebidas para auditoria.

### 3. Funil de Reembolso (UI)
Novo componente `ReimbursementFunnel.tsx` — Kanban com os estágios da tabela existente:
- **Submetido** → **Em Revisão** → **Aprovado** → **Pago** (+ coluna **Rejeitado**)
- Drag-and-drop para mover entre estágios (atualiza `reimbursement_claims.status`)
- Cards mostram: nome do contato, pet, valor, dias desde a solicitação
- KPIs no topo: total pendente, valor total, SLA (>7 dias)
- Rota no Sidebar para acessar o funil

### 4. Rota e Sidebar
- Nova rota `/reimbursements` no App.tsx
- Item no Sidebar com ícone de reembolso

### 5. Configuração
- Novo secret `ECOMMERCE_WEBHOOK_SECRET` para autenticar chamadas do site
- Documentação da URL do webhook para o time configurar no site:
  `POST https://bbllbsbcogngjfrhhggq.supabase.co/functions/v1/receive-ecommerce-webhook`

---

### Detalhes Técnicos

**Fluxo da compra paga:**
```text
Site → POST /receive-ecommerce-webhook
  { event: "purchase_paid", phone, name, email, amount, order_id }
    ↓
  Upsert contato (lead_status='customer')
    ↓
  Cria/busca conversa
    ↓
  Chama send-whatsapp-template (template boas-vindas)
    ↓
  Registra em ecommerce_orders
```

**Fluxo do reembolso:**
```text
Site → POST /receive-ecommerce-webhook
  { event: "refund_request", phone, amount, order_id, reason }
    ↓
  Localiza contato
    ↓
  Cria reimbursement_claims (status='submitted')
    ↓
  Registra em ecommerce_orders
```

**Kanban Reembolso:** Reutiliza padrão do `SalesFunnel.tsx` existente (drag-and-drop, métricas) adaptado para os estágios de reembolso.

