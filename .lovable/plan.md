

## Plano: Reativar Conversa Parada + Corrigir Follow-up para Mensagens Não Respondidas

### Diagnóstico

A conversa do Junior Garcia parou porque:
1. O "Sim" foi processado pelo orchestrator (`processed_by_nina: true`, `status: completed`) mas **nenhuma resposta foi gerada** — provavelmente a versão antiga do código entrou no branch `awaiting_qualification_email` (cargo) e retornou sem enviar mensagem
2. O follow-up automático **não dispara** porque a lógica em `process-followups` (linha 461) pula conversas onde a última mensagem é do usuário — assumindo que o agente deveria ter respondido via orchestrator
3. Resultado: a conversa fica "presa" — orchestrator não reprocessa (já marcada), follow-up não toca (última msg é do user)

### Correções

**1. Ação imediata: Re-enfileirar mensagem para reprocessamento**

Inserir manualmente um item na `nina_processing_queue` para a conversa do Junior Garcia, forçando o orchestrator a reprocessar. Primeiro resetar o `processed_by_nina` da mensagem "Sim".

```sql
-- Resetar flag para permitir reprocessamento
UPDATE messages SET processed_by_nina = false 
WHERE id = '2000afd6-af74-43bc-882a-fe128abf0a12';

-- Inserir na fila de processamento
INSERT INTO nina_processing_queue (conversation_id, message_id, status, priority, context_data)
VALUES (
  'ece1e604-0bbd-4d9f-b773-1d56705e7b5e',
  '2000afd6-af74-43bc-882a-fe128abf0a12',
  'pending', 1,
  '{"triggered_by": "manual_retry", "contact_name": "Junior Garcia"}'
);
```

**2. Correção estrutural: process-followups não deve pular conversas sem resposta**

No `process-followups/index.ts`, alterar a lógica da linha 461. Em vez de pular quando a última mensagem é do usuário, verificar se essa mensagem foi respondida. Se `processed_by_nina = true` mas não existe resposta nina posterior, é um caso de "resposta perdida" e o follow-up DEVE disparar.

Nova lógica:
```
// Se última msg é do user E processed_by_nina=true MAS não tem resposta nina depois
// → É um caso de resposta perdida → tentar re-enfileirar no orchestrator
```

**3. Prevenir no futuro: "Safety net" no orchestrator**

Adicionar no final do orchestrator um catch-all que verifica se aiContent foi de fato enfileirado, e se não foi, logar um erro e tentar enfileirar uma mensagem genérica de continuidade.

### Arquivos alterados

1. **Migração SQL** — Resetar mensagem do Junior Garcia e re-enfileirar
2. **`supabase/functions/process-followups/index.ts`** — Alterar lógica para detectar "mensagens do user sem resposta" e re-enfileirá-las ou tratá-las como follow-up
3. **`supabase/functions/nina-orchestrator/index.ts`** — Adicionar safety net no final do processamento

