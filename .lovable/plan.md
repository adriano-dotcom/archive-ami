

## Status do Agente Orbi — Pronto para Atender

### Sim, está ativo ✅

Verifiquei a configuração do banco e do orquestrador. Tudo em ordem para responder automaticamente quem chamar no WhatsApp:

| Item | Status |
|---|---|
| Agente **Orbi** (slug: `orbi`) | ✅ Ativo + padrão (`is_default = true`) |
| Sistema Nina (`is_active`) | ✅ Ligado |
| Resposta automática (`auto_response_enabled`) | ✅ Ligada |
| Modelo de IA | `gpt-4.1` (modo `pro3`) |
| WhatsApp Phone ID configurado | ✅ Sim |
| Webhook recebimento + orchestrator deployados | ✅ Sim |

### Como o fluxo dispara quando alguém chamar

```text
Cliente envia msg → whatsapp-webhook recebe
  → cria/atualiza contato + conversa (status='nina', is_active=true)
  → enfileira em nina_processing_queue
  → trigger pg_net chama nina-orchestrator
  → Orbi responde dentro da janela de 24h do WhatsApp
```

### Pontos de atenção (não bloqueantes)

1. **Janela de 24h do WhatsApp**: a Orbi só responde se a conversa estiver dentro da janela de 24h após a última mensagem do cliente. Para *primeiro contato saindo de você* é preciso usar template (já automatizado para vendas via `_bemvindo__famlia_orbe_pet`).

2. **Horário comercial (`09:00–18:00`, todos os dias)**: NÃO bloqueia respostas da IA — só afeta handoff para humano. A Orbi responde 24/7 desde que a janela WhatsApp esteja aberta.

3. **Cron de follow-ups** (`process-followups`): esse sim respeita horário comercial e está pulando agora (23:55 BRT, fora do range `09:00–20:00`). Reativará automaticamente às 09h. Sem impacto em respostas a mensagens recebidas.

### Conclusão

Pode mandar mensagem de teste no número do WhatsApp comercial — a Orbi vai responder. Se quiser, posso simular um envio agora para validar o fluxo end-to-end.

