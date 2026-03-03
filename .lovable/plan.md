

## Plano: Corrigir Qualificação Orbi + Configurar Follow-up Automático

### Diagnóstico do Problema

Analisei a conversa `ece1e604` (Junior Garcia, Pandora e Zeus). A Orbi processou o "Sim" (queue: completed, processed_by_nina: true) mas **nenhuma resposta foi gerada** no send_queue. Há dois problemas:

**1. Extração de qualificação de cargas ainda rodando para a Orbi**

A nina_context mostra `qualification_answers: {cte: "sim", estados: "AL, ES"}` — dados falsos extraídos porque:
- `cte: sim` foi extraído da regex `/\b(sim|não|nao|emito...)\b/i` que interpreta "Sim" como resposta sobre CTE (Conhecimento de Transporte)
- `estados: AL, ES` foi extraído de palavras como "ESSencial" e "AmbulATORIAL"

Apesar de o código-fonte ter o whitelist `CARGO_QUALIFICATION_AGENTS`, a **edge function pode não ter sido re-deployada corretamente**, pois a extração cargo CONTINUA contaminando o nina_context das conversas Orbi.

**2. Não existe automação de follow-up para a Orbi**

A tabela `followup_automations` está vazia. Quando o lead para de responder dentro da janela de 24h, nada acontece.

### Correções

**Correção 1: Re-deploy do nina-orchestrator com proteção reforçada**

No `nina-orchestrator/index.ts`:
- Manter o whitelist `CARGO_QUALIFICATION_AGENTS` (já existe)
- Adicionar proteção extra: limpar `qualification_answers` do nina_context quando o agente for Orbi (evitar dados contaminados de execuções anteriores)
- Re-deployar a edge function para garantir que o código atualizado está em produção

**Correção 2: Criar automação de follow-up para a Orbi**

Inserir na tabela `followup_automations` uma automação de tipo `free_text` com sequência de mensagens AI para o agente Orbi:

```text
Automação: "Follow-up OrbePet"
- Tipo: free_text (mensagem dentro da janela 24h)
- Conversas alvo: status = 'nina'
- Tempo sem resposta: 30 minutos
- Máximo de tentativas: 3
- Cooldown: 2 horas
- Horário ativo: 09:00-20:00, seg-sáb
- within_window_only: true
- only_if_no_client_response: true

Sequência:
1. Tentativa 1 (30 min): AI tipo "soft_reengagement"
2. Tentativa 2 (2h): AI tipo "schedule_call" 
3. Tentativa 3 (6h): AI tipo "last_chance"
```

**Correção 3: Limpar nina_context contaminado nas conversas Orbi ativas**

SQL para limpar os `qualification_answers` falsos das conversas existentes do Orbi:

```sql
UPDATE conversations 
SET nina_context = nina_context - 'qualification_answers' - 'last_extraction'
WHERE current_agent_id = 'f1dc66a9-6036-423a-91cb-58b8dee9c7f2'
  AND is_active = true
  AND nina_context ? 'qualification_answers';
```

### Arquivos alterados

1. `supabase/functions/nina-orchestrator/index.ts` — Adicionar limpeza de qualification_answers para agentes fora do whitelist
2. Migração SQL — Inserir automação follow-up + limpar nina_context contaminado

