

## Corrigir Incompatibilidade de Campos entre Orbe Plano Pet e Webhook

### Problema
O projeto **Orbe Plano Pet** envia dados neste formato:
```json
{ "nome": "...", "telefone": "...", "email": "...", "tipo": "compra" }
```

Mas o webhook `receive-ecommerce-webhook` espera:
```json
{ "event": "purchase_paid", "phone": "...", "name": "...", "email": "..." }
```

Os campos `tipo`/`event` e `telefone`/`phone` e `nome`/`name` não batem, resultando em erro 400 "Missing required fields: event, phone".

### Solução

**Arquivo: `supabase/functions/receive-ecommerce-webhook/index.ts`**

Adicionar mapeamento automático dos campos do Orbe Plano Pet logo após o `req.json()`:

1. Detectar se o payload usa o formato Orbe (`tipo`, `telefone`, `nome`) e mapear para o formato esperado:
   - `tipo: "compra"` → `event: "purchase_paid"`
   - `tipo: "reembolso"` → `event: "refund_request"`
   - `telefone` → `phone`
   - `nome` → `name`

2. Manter compatibilidade com o formato original (`event`, `phone`, `name`) para outros integradores.

### Detalhe Técnico

```text
Payload Orbe:  { tipo, telefone, nome, email }
                    ↓ mapeamento automático
Formato interno: { event, phone, name, email }
                    ↓ fluxo existente continua igual
```

Nenhuma mudança no projeto Orbe Plano Pet é necessária. Apenas o webhook deste projeto será atualizado.

