# Frase de escopo: verificação + correção do recebimento de WhatsApp

## 1. Frase de aviso (verificado agora)

| Rota | Situação |
|---|---|
| Prompt padrão da Iris no código | OK — REGRA #0 + frase padrão |
| Prompt do agente ativo no banco | OK — contém a frase |
| Reforço automático quando o prompt não tem a frase | OK (`nina-orchestrator`, linha ~4133) |
| Catálogo de planos injetado no contexto | OK |
| Conferência/resumo com link da proposta (Passo 4) | OK |
| Respostas prontas `/pacote`, `/preco`, `/prazo`, `/comofunciona`, `/elegibilidade`, `/coberturas`, `/presencial`, `/central` | OK — todas com a frase |
| Respostas prontas `/lei`, `/rntrc`, `/fiscalizacao`, `/seguradora`, `/jatenho`, `/triagem`, `/encaminhar`, "cpf", "Contratado direto" | Não citam preço, prazo, link nem contratação — nada a mudar |

Conclusão: nas telas de preço, prazo e contratação a frase já aparece em todas as rotas. Nenhuma correção necessária aqui.

## 2. Recebimento de WhatsApp — FALHA ATIVA (causa confirmada)

Desde 31/08 às 02:24 UTC, todas as mensagens recebidas retornam **HTTP 500** e não entram no chat (13 webhooks nas últimas 24h; os `event_type: message` mais recentes estão todos com erro).

Erro nos logs do `whatsapp-webhook`:

```text
Error getting/creating conversation:
42804 — COALESCE types text and conversation_status cannot be matched
```

Causa: na função `get_or_create_active_conversation`, o trecho de reativação usa
`COALESCE(p_status, status)::conversation_status`, misturando `text` (parâmetro) com o enum `conversation_status` (coluna). O Postgres rejeita antes de aplicar o cast, e a função aborta — ou seja, só quebra quando o contato já tem conversa inativa a ser reaproveitada (caso do número testado).

### Correção

1. Migração ajustando a função: trocar por `COALESCE(p_status::conversation_status, status)`, mantendo todo o resto (locks, tratamento de `unique_violation`, `SECURITY DEFINER`, `search_path`) idêntico.
2. Reprocessar as mensagens perdidas: os payloads estão em `webhook_request_logs` com `response_status = 500`; reenviar esses eventos ao `whatsapp-webhook` para que entrem no chat e sejam respondidas pela Iris.
3. Verificar depois da correção: novo webhook com `response_status = 200`, mensagem visível na conversa e resposta da Iris gerada.

### Observação secundária (fora do escopo, apenas registrando)

- `WHATSAPP_APP_SECRET` não está definido: o webhook está pulando a verificação de assinatura da Meta.
- Existe 1 item em `send_queue` parado desde 28/08 com "Janela de 24h expirada" — precisa de template para reabrir. Posso tratar se você quiser.

## Detalhes técnicos

- Alteração via migração SQL em `public.get_or_create_active_conversation` (sem mudança de assinatura, sem impacto em quem chama).
- Reprocessamento pontual dos payloads salvos, sem alteração de schema.
