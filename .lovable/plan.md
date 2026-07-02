## Causa raiz

As edge functions críticas do fluxo de WhatsApp estão **retornando 404 (não implantadas)**. A Meta entregou as mensagens do cliente +55 43 9125-5007, recebeu 404 e as descartou — por isso não há contato, conversa nem log, e a Iris não respondeu. Testes ao vivo confirmam que `whatsapp-webhook`, `nina-orchestrator`, `whatsapp-sender` e a maioria das outras funções estão em 404, enquanto apenas as implantadas por último (`whatsapp-connection-status`, `replicate-lead-to-crm`) estão no ar. O `config.toml` e o código estão corretos — o deploy é que ficou incompleto (provavelmente após os deploys/migrations recentes).

## Correção

### 1. Reimplantar todas as edge functions
Fazer um deploy completo de todas as funções em `supabase/functions/`, com prioridade para as do fluxo de WhatsApp/IA:
- `whatsapp-webhook` (recebe mensagens da Meta)
- `nina-orchestrator` (motor da IA / Iris)
- `whatsapp-sender` (envio das respostas)
- `whatsapp-webhook-health`, `whatsapp-call-webhook`, `whatsapp-call-*`
- Demais funções em 404: `jarvis-sync`, `capture-lead`, `send-email`, `process-followups`, e todas as outras do diretório.

### 2. Verificar que voltaram ao ar
Após o deploy, testar cada endpoint e confirmar que não retornam mais 404:
- `GET whatsapp-webhook?hub.mode=subscribe&...` deve responder o challenge (200)
- `POST whatsapp-webhook` com body vazio deve responder 200 (`{status:'ignored'}`)
- `nina-orchestrator` e `whatsapp-sender` devem responder (não-404)

### 3. Recuperar a conversa perdida do cliente
Como a mensagem foi descartada pela Meta (404), ela não será reprocessada automaticamente após a janela de retry. Opções, a confirmar com você:
- **(a)** Enviar uma mensagem proativa de retomada para o +55 43 9125-5007 assim que o webhook estiver no ar (via `send-whatsapp-template`/`whatsapp-sender`), já que o cliente ficou sem resposta.
- **(b)** Apenas aguardar — se a Meta ainda estiver dentro da janela de retry, a mensagem pode reentrar sozinha assim que o webhook responder 200.

### 4. (Opcional) Prevenção
Adicionar um alerta de saúde: como já existe `whatsapp-webhook-health`, podemos usá-lo num check periódico (cron) para detectar rapidamente se o webhook voltar a cair, evitando ficar mudo sem ninguém perceber.

## Detalhes técnicos
- Nenhuma alteração de código-fonte é necessária para restaurar o serviço — é uma reimplantação. O `config.toml` já tem `verify_jwt = false` para `whatsapp-webhook`.
- Evidência: último log em `webhook_request_logs` às 20:40 UTC; `POST 404 whatsapp-webhook` às 21:00:44 UTC nos logs da plataforma; teste ao vivo dos endpoints confirmando 404 nas funções críticas e 200/400 nas recém-implantadas.