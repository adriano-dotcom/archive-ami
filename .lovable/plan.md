

## Limpeza de Dados para OrbePet

Vou executar DELETEs nas tabelas na ordem correta (respeitando foreign keys), mantendo configurações, templates, equipe e usuários.

### Ordem de execução (via insert tool)

1. **Filas de processamento** — `send_queue`, `nina_processing_queue`, `message_processing_queue`, `message_grouping_queue`
2. **Mensagens** — `messages`
3. **Estados de conversa** — `conversation_states`
4. **Chamadas WhatsApp** — `whatsapp_calls`
5. **Conversas** — `conversations`
6. **Parcelas e histórico** — `installment_history`, `installments`
7. **Emails agendados e logs** — `scheduled_emails`, `collection_email_logs`, `collection_batches`
8. **Contatos** — `contacts`
9. **Empresas** — `companies`

### O que será preservado

- `team_members`, `user_roles`, `auth.users`
- `nina_settings`, `whatsapp_templates`, `tag_definitions`
- `followup_automations`, `email_templates`
- `campaigns`, `teams`, `team_functions`
- `sellers`, `import_mappings`

### Seção técnica

```sql
-- Executado em sequência via insert tool:
DELETE FROM send_queue;
DELETE FROM nina_processing_queue;
DELETE FROM message_processing_queue;
DELETE FROM message_grouping_queue;
DELETE FROM messages;
DELETE FROM conversation_states;
DELETE FROM whatsapp_calls;
DELETE FROM conversations;
DELETE FROM installment_history;
DELETE FROM installments;
DELETE FROM scheduled_emails;
DELETE FROM collection_email_logs;
DELETE FROM collection_batches;
DELETE FROM appointments;
DELETE FROM contacts;
DELETE FROM companies;
```

Nenhuma alteração de schema — apenas limpeza de dados existentes.

