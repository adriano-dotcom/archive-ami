## Situação confirmada

- ✅ **Recebimento funciona**: 4 mensagens de clientes nas últimas 24h (última hoje 18:17).
- ✅ **Iris responde**: respostas geradas e enfileiradas normalmente.
- ⛔ **Envio parado**: **26 mensagens presas** na fila de envio (`send_queue` pending):
  - 15 respostas da **Iris**
  - 7 mensagens de **atendentes humanos**
- ✅ **Phone Number ID já restaurado** (`1003906669464570`).
- 🔑 **Falta o Access Token** — ainda ausente (`whatsapp_access_token` vazio, nada no cofre). Sem ele, nada é entregue no WhatsApp.

O Access Token é secreto e foi apagado na limpeza do banco; **não é recuperável** — precisa ser colado de novo.

## O que você precisa fazer (1 passo)

1. Abrir **Configurações → aba "APIs"**.
2. No bloco do **WhatsApp**, colar o **Access Token** (o campo "Phone Number ID" já aparece preenchido).
3. Clicar em **Salvar**.

**Onde pegar na Meta:** Meta for Developers → seu App → **WhatsApp → Configuração da API**. Para não parar de novo, gere um **token permanente** via *Business Settings → Users → System Users → Generate Token* (permissões `whatsapp_business_messaging` e `whatsapp_business_management`). O token temporário dura só 24h.

## O que eu faço depois que você salvar

1. **Reprocessar a fila** chamando a função `whatsapp-sender` para despachar as 26 mensagens presas.
2. **Validar**: confirmar que a `send_queue` passa de `pending` para `completed` e que as mensagens chegam no WhatsApp.

## Observação importante (janela de 24h)

Pela regra do WhatsApp, mensagens livres só saem dentro de **24h após a última mensagem do cliente**. As mensagens mais antigas da fila (algumas de 30/06) provavelmente estão **fora da janela** e vão falhar como "fora da janela" — isso é esperado, não é bug. As conversas recentes (dentro de 24h) serão entregues normalmente; mensagens novas reabrem a janela.

## Detalhes técnicos

- Sem alteração de schema. A única dependência é o Access Token, salvo via `ApiSettings.tsx` (grava em `nina_settings` / cofre).
- Reprocessamento: invocar edge function `whatsapp-sender` (já ajustada para retornar 200 com `fallback: true` quando faltam credenciais, evitando tela branca).
