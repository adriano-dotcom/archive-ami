

## Corrigir Disparo Automático do Template de Boas-Vindas

### Problema Identificado

O fluxo já está montado: quando uma venda chega pelo webhook, ele já tenta enviar o template `boas_vindas`. Porém, está falhando com o erro:

> **"Template boas_vindas não encontrado ou não aprovado"**

O template aprovado no WhatsApp tem um nome diferente:
- **Nome real:** `_bemvindo__famlia_orbe_pet`
- **Idioma real:** `en`
- **O webhook tenta:** `boas_vindas` com idioma `pt_BR`

### Solução

Atualizar o webhook `receive-ecommerce-webhook` para usar o nome e idioma corretos do template aprovado.

### Mudança

**Arquivo:** `supabase/functions/receive-ecommerce-webhook/index.ts`

- Trocar `template_name: "boas_vindas"` por `template_name: "_bemvindo__famlia_orbe_pet"`
- Adicionar `language: "en"` no payload

Também ajustar o `send-whatsapp-template` para aceitar o campo `language` vindo do webhook (já aceita via interface, só precisa garantir que está sendo passado).

### Detalhes Técnicos

```text
Webhook recebe venda → cria contato → cria conversa
  → chama send-whatsapp-template com:
     template_name: "_bemvindo__famlia_orbe_pet"
     language: "en"
     contact_id, conversation_id
  → template é encontrado na tabela → WhatsApp envia mensagem
  → agente Orbi é ativado para responder
```

Nenhuma mudança de banco de dados é necessária. Apenas o código da edge function será atualizado e re-deployado.

