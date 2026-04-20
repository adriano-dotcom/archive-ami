
## Adicionar valor da mensalidade nas vendas e enviar ao Jarvis

### O que muda

Quando a plataforma Orbe Plano Pet enviar uma compra (`tipo: "compra"`), o webhook passa a:

1. **Aceitar o valor da mensalidade** em campos novos (compatível com vários nomes que a plataforma pode usar).
2. **Persistir** esse valor no pedido (`ecommerce_orders`) e no contato (memória/metadata).
3. **Enviar para o Jarvis** o valor formatado, junto com o plano contratado (se a plataforma mandar).
4. **Disparar o template de boas-vindas** já incluindo o valor (se o template tiver variável `{{2}}`; senão mantém só nome — confirmar abaixo).

### Payload aceito (Orbe Plano Pet → webhook)

Aceita qualquer um destes campos, na ordem de prioridade:
- `valor_mensalidade` (recomendado) ou `monthly_amount` ou `valor` ou `amount`
- `plano` (nome do plano: "Órbita Plus", "Órbita Total", "Órbita Galáxia") — opcional
- `forma_pagamento` (cartão / pix mensal / pix anual) — opcional

Exemplo:
```json
{
  "tipo": "compra",
  "telefone": "5511999999999",
  "nome": "Gabriel Seguchi",
  "email": "gabriel@email.com",
  "pet_name": "Thor",
  "plano": "Órbita Plus",
  "valor_mensalidade": 89.82,
  "forma_pagamento": "cartao",
  "order_id": "ORD-12345"
}
```

### Mudanças técnicas

**`supabase/functions/receive-ecommerce-webhook/index.ts`**

- Mapear novos campos: `monthly_amount = raw.valor_mensalidade ?? raw.monthly_amount ?? raw.valor ?? raw.amount`, `plan_name = raw.plano ?? raw.plan ?? raw.plan_name`, `payment_method = raw.forma_pagamento ?? raw.payment_method`.
- Validar: se `event === "purchase_paid"` e `monthly_amount` ausente/inválido → 400 com mensagem clara.
- Gravar em `ecommerce_orders.metadata`: `{ ..., monthly_amount, plan_name, payment_method }` e em `amount` o próprio `monthly_amount`.
- Atualizar `contacts.client_memory` (jsonb) acrescentando `subscription: { plan_name, monthly_amount, payment_method, started_at }` sem sobrescrever o restante.
- Notificar Jarvis (`notifyJarvis("nova_venda", …)`) acrescentando: `plan_name`, `monthly_amount`, `monthly_amount_formatted` (ex: "R$ 89,82"), `payment_method`.

**Template de boas-vindas (`_bemvindo__famlia_orbe_pet`)**
- Hoje só passa 1 variável (nome). Antes de eu modificar isso, preciso confirmar: o template aceita uma 2ª variável com valor? (ver "Pendências" abaixo).

### Pendências antes de executar

1. **A plataforma Orbe Plano Pet vai mesmo enviar o valor?** (presumo que sim, já que você quer registrar)
2. **Template WhatsApp**: incluir o valor no corpo da mensagem de boas-vindas? Se sim, o template precisa ter `{{2}}` no body — você tem isso configurado na Meta? (se não, mantenho só o nome e gravo o valor só no banco/Jarvis)
3. **Compra existente**: se chegar uma 2ª compra do mesmo telefone (upgrade/downgrade), atualizo `client_memory.subscription` por cima ou registro histórico separado? (recomendo: sobrescrever subscription atual + manter histórico via `ecommerce_orders`)

Posso seguir com defaults (sim, sim se template aceita, sobrescrever subscription) caso prefira não detalhar.
