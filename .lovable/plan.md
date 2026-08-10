# Corrigir conversas duplicadas do mesmo contato

## O que aconteceu (confirmado nos dados)

O contato Adriano (554399145000) tem duas conversas ativas:

- `0440ad6b…` criada em 28/06, com 131 mensagens
- `e743cd91…` criada em 10/08 às 20:36:32.409, com 7 mensagens

Ele mandou três mensagens quase simultâneas ("Ou", "Ou", "Oi") entre 20:36:24 e 20:36:29. O WhatsApp entregou essas mensagens em chamadas paralelas ao webhook:

```text
20:36:31.947  webhook A  -> grava mensagem na conversa antiga (0440ad6b)
20:36:32.347  webhook A  -> atualiza a janela da conversa antiga
20:36:32.409  webhook B  -> não enxergou a conversa ainda, CRIA e743cd91
20:36:32.654  webhook B  -> grava mensagem na conversa nova
```

O webhook faz "buscar conversa ativa → senão reativar → senão criar" em passos separados, sem trava. Duas execuções simultâneas fazem a leitura antes de qualquer gravação e ambas concluem que precisam criar. O banco também não impede duas conversas ativas para o mesmo contato. Não é problema de número diferente: as duas apontam para o mesmo `contact_id`.

## O que será feito

### 1. Impedir na origem (banco)
- Índice único parcial: no máximo **uma conversa ativa por contato**. Com isso, mesmo em corrida, a segunda inserção falha em vez de duplicar.
- Função de banco `get_or_create_conversation(contact_id)` que faz busca, reativação e criação numa única operação atômica (com `ON CONFLICT` tratado), retornando sempre a mesma conversa.

### 2. Usar a operação atômica no webhook
- `whatsapp-webhook` passa a chamar essa função em vez do trio de consultas atuais.
- Mesma troca nos outros pontos que criam conversa (`send-collection-whatsapp`, `send-whatsapp-template`, envio manual pelo painel, modais de cobrança), para nenhum caminho abrir uma segunda conversa.

### 3. Limpar o histórico já duplicado
- Mesclar `e743cd91…` na conversa antiga: mover as 7 mensagens para `0440ad6b…`, manter a janela de 24h mais recente e desativar/remover a conversa órfã.
- Rodar a mesma checagem para qualquer outro contato com mais de uma conversa ativa e unificar do mesmo jeito.

### 4. Verificação
- Consultar o banco para confirmar zero contatos com duas conversas ativas.
- Simular duas entregas simultâneas do webhook para o mesmo número e confirmar que só uma conversa é usada.

## Detalhes técnicos

- Migração: `CREATE UNIQUE INDEX … ON public.conversations (contact_id) WHERE is_active`; função `SECURITY DEFINER` com `search_path` fixo, seguindo o padrão das demais funções do projeto.
- O merge é feito com `UPDATE messages SET conversation_id = …` — nenhuma mensagem é perdida, o histórico do chat fica contínuo.
- Efeito colateral esperado no CRM: a lista de conversas deixa de mostrar o contato duas vezes, e a Iris passa a responder sempre com o histórico completo (parte da resposta genérica de hoje vem de ela estar em uma conversa nova, sem contexto).
