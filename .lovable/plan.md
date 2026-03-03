

## Diagnóstico: Mensagens Repetidas pelo Agente

### Problema Identificado
O agente está enviando respostas duplicadas (semanticamente iguais mas com texto ligeiramente diferente) ao lead. A imagem mostra a Orbi respondendo sobre o "Plano Órbita Plus" duas vezes com informações idênticas reformuladas.

### Causa Raiz
Existem **duas falhas** no sistema anti-duplicação:

1. **Race condition no guard de processamento duplicado** (linha 1925-1938): O check `subsequentNinaMessages` procura respostas Nina na tabela `messages` após a mensagem do usuário. Porém, a resposta da IA vai primeiro para `send_queue` e só é inserida em `messages` quando o `whatsapp-sender` a envia. Se o orchestrator é invocado novamente antes do sender processar a fila, o guard não encontra a resposta anterior e processa de novo.

2. **Duplicate check textual insuficiente** (linha 4431-4436): A verificação em `queueTextResponse` só detecta duplicatas **textuais exatas** ou substrings dos primeiros 50 caracteres. Como o LLM gera texto diferente a cada chamada, respostas semanticamente iguais passam por esse filtro.

### Plano de Correção

**1. Expandir o guard de duplicação para incluir `send_queue`** (nina-orchestrator, ~linha 1925):
- Além de verificar `messages`, verificar também se já existe uma resposta na tabela `send_queue` para essa conversa que foi criada após a mensagem do usuário
- Se existir item em `send_queue` com `response_to_message_id` igual ao `message.id` atual, pular processamento

**2. Adicionar lock por conversa via flag `processed_by_nina`** (nina-orchestrator, ~linha 1925):
- Verificar se a mensagem já tem `processed_by_nina = true` antes de processar
- Se já foi processada, pular imediatamente

**3. Melhorar duplicate check no `queueTextResponse`** (nina-orchestrator, ~linha 4430):
- Adicionar verificação por `response_to_message_id` no metadata do `send_queue` — se já existe uma resposta pendente para o mesmo `message.id`, não enviar outra

### Detalhes Técnicos

```text
Fluxo ATUAL (com bug):
  Trigger 1 → processQueueItem → check messages (vazio) → gera resposta A → send_queue
  Trigger 2 → processQueueItem → check messages (ainda vazio!) → gera resposta B → send_queue
  whatsapp-sender → envia A e B → lead recebe duplicado

Fluxo CORRIGIDO:
  Trigger 1 → processQueueItem → check messages + send_queue (vazio) → gera resposta A → send_queue
  Trigger 2 → processQueueItem → check send_queue (resposta A encontrada!) → SKIP
```

Alterações em **1 arquivo**: `supabase/functions/nina-orchestrator/index.ts`

