# Boas-vindas automáticas após a compra dos 3 seguros

Quando o checkout confirmar o pagamento, o cliente passa a receber automaticamente, no WhatsApp, uma mensagem de boas-vindas com protocolo, empresa e valor pago. A mensagem entra na mesma conversa dele no CRM, para a equipe ver tudo no mesmo lugar.

## Quando a mensagem é enviada

- Só para pagamentos confirmados do pacote dos 3 seguros obrigatórios.
- Só se o cliente tiver falado com a gente nas últimas 24 horas (regra do WhatsApp para mensagem comum).
- Se a janela de 24h estiver fechada, nada é enviado ao cliente: fica registrado um aviso interno na conversa para a equipe decidir o contato.
- Envio único por protocolo: se o checkout reenviar o mesmo pagamento, a mensagem não se repete.

## Texto da mensagem (sem emoji, conforme o padrão da empresa)

> Olá, {nome}! Recebemos a confirmação do seu pagamento.
>
> Protocolo: {protocolo}
> Empresa: {razão social} - CNPJ {cnpj}
> Valor pago: {R$ 911,66}
>
> Seu pacote com as 3 apólices obrigatórias do transportador (RCTR-C, RC-DC e RC-V) já está em emissão. O prazo é de até 2 horas úteis e você recebe os documentos por aqui e por e-mail.
>
> As apólices atendem à exigência de quem contrata você como transportador subcontratado. Qualquer dúvida, é só responder nesta conversa.

Campos ausentes (empresa, CNPJ, nome) simplesmente não aparecem, sem deixar linha vazia.

## O que a equipe vê

Na conversa do cliente: a nota interna de compra que já existe hoje e, logo abaixo, a mensagem de boas-vindas enviada, com status de entrega normal.

## Detalhes técnicos

- Arquivo alterado: `supabase/functions/receive-ecommerce-webhook/index.ts` (único arquivo de lógica). Sem migração e sem mudança de schema.
- Após criar a nota interna no evento `purchase_paid`:
  1. Checagem de idempotência: consulta `messages` da conversa por `metadata->>welcome_protocolo = <protocolo>`; se existir, pula.
  2. Checagem de janela: RPC `is_whatsapp_window_open(conversation_id)`.
  3. Monta o texto com `formatBRL(premio)` e aplica `stripEmojis` de `_shared/text-sanitize.ts`.
  4. Insere em `send_queue` (`conversation_id`, `contact_id`, `message_type: 'text'`, `from_type: 'nina'`, `content`, `status: 'pending'`, `priority` alta, `metadata: { source: 'ecommerce_welcome', welcome_protocolo }`) — o trigger `trigger_auto_start_whatsapp_sender` dispara o `whatsapp-sender`, que grava a mensagem e envia.
  5. Janela fechada: insere apenas mensagem interna em `messages` (`from_type: 'human'`, `metadata.internal_note`) avisando que as boas-vindas não puderam ser enviadas.
- Falha no envio não derruba o webhook: erros são logados e a resposta continua 200 com `welcome_sent: true|false` e `welcome_skipped_reason`.
- Nenhum template do WhatsApp é usado (o único aprovado hoje é do produto de pet, em inglês). Se no futuro um template de boas-vindas for aprovado, o mesmo ponto do código pode passar a chamar `send-whatsapp-template`.
- Deploy da função `receive-ecommerce-webhook` e teste com um payload `purchase_paid` de um contato com janela aberta.
