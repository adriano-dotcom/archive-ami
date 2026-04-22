

# Análise de produção: UX do atendente + escala de banco

Análise feita em: ChatInterface (2810 linhas), `useConversations`, `api.ts`, índices do banco, RLS, realtime, linter Supabase. Foco: **operador atendendo dezenas de leads simultâneos** + **suporte a alto volume**.

---

## A. PROBLEMAS CRÍTICOS encontrados

### A1. Atendimento — Performance e UX

| # | Problema | Impacto |
|---|---------|---------|
| 1 | `fetchConversations` faz **1 query + N queries de mensagens** (loop `Promise.all` com N=100). Com 100 conversas = 101 round-trips | Carregamento inicial 3-8s |
| 2 | Carrega **100 mensagens de TODAS as 100 conversas** de uma vez (até 10k mensagens em memória) | RAM alto, scroll travando |
| 3 | `messages` e `conversations` **NÃO estão na publication realtime** (só `contacts`, `companies`, `installment_history`, `template_status_notifications`, `whatsapp_calls`). O frontend assina mas eventos nunca chegam → operador só vê mensagem nova ao recarregar | Quebra crítica de tempo real |
| 4 | `ChatInterface.tsx` tem **2810 linhas** num único arquivo — re-renderiza tudo a cada mensagem nova | Lag ao digitar, freezes |
| 5 | Busca de contatos sem debounce no filtro de chat; filtro roda em cada keystroke sobre array completo | Lag em listas longas |
| 6 | Sem indicador de "novas mensagens não lidas" agregado por filtro/aba; operador perde mensagens ao trocar de filtro | Leads esquecidos |
| 7 | Sem **atalho rápido** para "próximo chat com mensagem não respondida" | Operador navega manualmente |
| 8 | `unreadCount` não tem coluna denormalizada em `conversations` — recalculado no client a cada fetch | Inconsistência |
| 9 | Modal de "Encerrar atendimento" grava `close_reason` em `conversations.metadata` mas **não há relatório consumindo** | Dado morto |
| 10 | Sem **detecção de presença** (operador X está vendo conversa Y) — risco de dois operadores responderem o mesmo lead | Conflito |
| 11 | Tabela `webhook_request_logs` tem **4456 linhas e cresce sem TTL** | Vai estourar storage |

### A2. Banco de dados — Prontidão para volume

**Bom (já está pronto):**
- Índices de cobertura ricos em `contacts` (covering, GIN tags, by status)
- Índices em queues (`send_queue`, `nina_processing_queue`, `message_processing_queue`) com status+scheduled
- `claim_*_batch` usa `FOR UPDATE SKIP LOCKED` (correto para concorrência)
- RLS consistente via `is_authenticated_team_member()`

**Faltando para produção em escala:**

| # | Gap | Risco |
|---|-----|-------|
| B1 | `messages` sem **índice composto `(conversation_id, sent_at DESC)`** — query do chat usa esses 2 campos | Slow query em conversas longas |
| B2 | `conversations` sem **índice parcial `WHERE is_active=true ORDER BY last_message_at`** — query principal do inbox | Sequential scan ao crescer |
| B3 | `conversations` **não tem `unread_count` denormalizado** + trigger de incremento | Cálculo no client toda vez |
| B4 | `conversations` **não tem campo `closed_reason`/`closed_category`/`closed_at`** dedicado — está enterrado em `metadata` jsonb | Sem relatório de motivos |
| B5 | `webhook_request_logs` **sem cron de cleanup** (só queues têm) | Tabela infla |
| B6 | `messages` e `conversations` **fora do realtime publication** | Frontend "morto" |
| B7 | `contacts.phone_number` é UNIQUE mas **sem normalização** — duplicatas por variantes do 9º dígito (memória existente confirma) | Duplicidade já documentada |
| B8 | Sem `REPLICA IDENTITY FULL` em `messages`/`conversations` (necessário para realtime entregar payload completo no UPDATE) | Updates de status não chegam completos |
| B9 | Linter aponta 3 RLS com `USING(true)` em UPDATE/INSERT/DELETE | Possível elevação de permissão |

---

## B. PLANO DE EXECUÇÃO

Organizado em 3 fases. Cada fase é independente — podemos executar uma de cada vez ou todas.

### **FASE 1 — Realtime + escala de banco (migration)** [crítico, 1 migration]

1. Adicionar `messages` e `conversations` à publication `supabase_realtime` + setar `REPLICA IDENTITY FULL` nas duas.
2. Criar índices que faltam:
   - `idx_messages_conv_sent` em `messages(conversation_id, sent_at DESC)`
   - `idx_conv_active_lastmsg` em `conversations(last_message_at DESC) WHERE is_active=true`
   - `idx_messages_unread` em `messages(conversation_id) WHERE from_type='user' AND read_at IS NULL`
3. Adicionar colunas em `conversations`:
   - `unread_count int default 0`
   - `closed_reason text`, `closed_category text`, `closed_at timestamptz`, `closed_by uuid`
4. Trigger `update_conversation_unread()`:
   - INSERT em `messages` from_type=user → `unread_count = unread_count + 1` + `last_message_at`
   - UPDATE `read_at` IS NOT NULL → recalcular
5. Cron diário: `DELETE FROM webhook_request_logs WHERE created_at < now() - interval '7 days'`.
6. Backfill: popular `unread_count` atual a partir das mensagens existentes.

### **FASE 2 — Performance do ChatInterface** [frontend]

1. **Reescrever `api.fetchConversations`**: remover loop N+1. Buscar conversas (sem mensagens) + apenas as **últimas 30 mensagens da conversa selecionada** sob demanda. Mensagens carregadas via hook `useMessages(conversationId)` com paginação (scroll up = carrega mais).
2. **Subscribe realtime correto** após Fase 1: `messages` (filtrar por conversation_id da conversa aberta para reduzir tráfego) + `conversations` (todas, para a lista lateral).
3. **Quebrar `ChatInterface.tsx`** em:
   - `ConversationList.tsx` (lateral esquerda + filtros)
   - `ChatPanel.tsx` (mensagens + input)
   - `ChatHeader.tsx` (cabeçalho com ações)
   - `CloseConversationModal.tsx` (já existe a lógica, separar)
   - Mantém `ChatInterface.tsx` como orquestrador (~400 linhas)
4. Memoizar `ConversationList` com `React.memo` + `useMemo` no filtro de busca.
5. Debounce 250ms no `searchQuery`.

### **FASE 3 — UX para alto volume de atendimento**

1. **Badge de unread por filtro/aba** (Cobrança, Orbi, Sem Resposta) usando o novo `unread_count`.
2. **Atalho `J/K`** para navegar próximo/anterior chat não-respondido (já temos `useKeyboardShortcuts`).
3. **Indicador "alguém está vendo este chat"** via Supabase Realtime Presence — mostra avatar do outro operador no topo da conversa.
4. **Auto-marcar como lido** ao abrir uma conversa por >2s (já existe `markAsRead`, ajustar trigger).
5. **Painel "Meus Atendimentos"** filtro persistente (localStorage) — mostrar só conversas atribuídas ao operador logado.
6. **Aba Reports → "Motivos de encerramento"**: gráfico de pizza dos `closed_category` dos últimos 30d (sucesso vs perda vs cobrança).
7. **Botão "Pular para próxima"** no header da conversa (após encerrar, vai pra próxima não-lida automaticamente).

---

## C. Pontos abertos para você decidir

1. **Executar tudo de uma vez ou por fases?** Recomendo começar pela **Fase 1** (banco/realtime) — destrava o resto e é a maior dor invisível.
2. **Fase 2 quebra `ChatInterface` em 4 arquivos.** Isso requer testes manuais — ok?
3. **Presença em tempo real** (Fase 3 item 3): adiciona complexidade. Manter ou pular?
4. **Cleanup de `webhook_request_logs`**: 7 dias suficiente ou prefere 30?

Posso seguir com defaults (todas as 3 fases, começando pela 1; quebrar ChatInterface; manter presença; 7 dias de log) se preferir não detalhar.

