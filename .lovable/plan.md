
## Atualizar "Encerrar Atendimento" para a operação OrbePet

### Diagnóstico
- Modal está em `src/components/ChatInterface.tsx` (linhas 2606–2698).
- Lista atual tem opções legadas de **seguro/corretor/Pipedrive** que não fazem sentido na OrbePet (memória `pipedrive-removal`, `orbepet-crm-strategy`).
- **Bug crítico**: o `closeReason` é coletado mas **nunca gravado no banco**. A função `handleCloseConversation` só atualiza `status='closed'` e `is_active=false` — o motivo é descartado.
- Campo "Outro" tem `value=""` hardcoded (não funciona — bug).
- Não existe coluna ou campo em `conversations.metadata` para motivo de encerramento.

### Nova lista de motivos (alinhada à operação Orbe Pet)

**Vendas (Tutores em prospecção)**
- Plano contratado ✅ (sucesso — saiu pelo checkout)
- Aguardando pagamento (PIX/cartão pendente)
- Sem interesse no momento
- Preço acima do orçamento
- Já tem plano em outra empresa
- Pet fora do perfil (idade > 10 anos / pré-existência grave)
- Apenas dúvida / pesquisa
- Sem resposta (3+ tentativas)
- Número inválido / não é o tutor

**Pós-venda / Suporte**
- Dúvida resolvida
- Reembolso encaminhado
- Atendimento veterinário direcionado (orbepet.com.br)
- Reclamação registrada
- Cancelamento solicitado

**Cobrança (mensalidade em atraso)**
- Pagamento confirmado
- Acordo de regularização firmado
- Renegociação de prazo
- Inadimplente — sem retorno
- Inadimplente — recusa de pagamento
- Cancelamento por inadimplência

**Outros**
- Spam / engano
- Outro (campo livre)

### Mudanças técnicas

**1. `src/components/ChatInterface.tsx`**
- Substituir o `<select>` (linhas 2626–2655) pelas novas categorias acima.
- Atualizar a mensagem condicional (linhas 2615–2618):
  - "Plano contratado" / "Pagamento confirmado" / "Dúvida resolvida" → mensagem positiva ("Atendimento concluído com sucesso").
  - Demais motivos → "Lead será marcado como encerrado e não receberá mais automações."
  - Remover o caso `Enviado ao Pipedrive`.
- Corrigir o bug do campo "Outro": adicionar state separado `customReason` em vez de sobrescrever `closeReason` com `""`.
- Em `handleCloseConversation` (linhas 544–574): gravar o motivo em `conversations.metadata.close_reason`, `metadata.closed_at`, `metadata.closed_by` (auth.uid).

**2. Persistência (sem mudança de schema)**
Aproveitar `conversations.metadata jsonb`:
```ts
metadata: {
  ...activeChat.metadata,
  close_reason: closeReason,
  close_category: 'vendas' | 'pos_venda' | 'cobranca' | 'outros',
  closed_at: new Date().toISOString(),
  closed_by: user.id
}
```
Sem migração de banco — JSONB já existe e é flexível.

**3. Reabertura**
A lógica `handleReopenConversation` (linha 577+) continua funcionando; opcionalmente registrar `metadata.reopened_at` para auditoria (pode ficar para depois).

### Pontos abertos para confirmar

1. Manter "Outro" com campo livre? (sim, recomendado para casos atípicos)
2. Quer que motivos de **sucesso** (Plano contratado / Pagamento confirmado / Dúvida resolvida) também movam o contato para uma `lead_status` específica? (ex: `customer`, `paid`, `resolved`). Hoje não faço esse cross-update — posso adicionar se quiser.
3. Quer um relatório futuro de motivos de encerramento (Reports)? Agora só persisto o dado; o painel pode vir depois.
