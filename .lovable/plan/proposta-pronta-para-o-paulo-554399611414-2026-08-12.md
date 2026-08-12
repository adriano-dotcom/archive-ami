# Proposta pronta para o Paulo (554399611414)

Sobre a dúvida do link: não é só neste caso — é em todos. O site oficial publicado hoje ainda não lê o parâmetro `?proposta=<token>` (verifiquei o código publicado da página). Nosso lado já está pronto: o rascunho é gravado e o endpoint que devolve os dados já responde. Falta apenas o outro projeto (site) consumir o token e abrir o checkout preenchido. Enquanto isso, o link abre a home normal e o lead preenche à mão.

## O que faço agora para o Paulo

Dados já confirmados no CRM: LSLOG, CNPJ 35.235.302/0001-23, RNTRC 52850644 (regular), e-mail [paulo.landucci3@gmail.com](mailto:paulo.landucci3@gmail.com), telefone 554399611414, Londrina/PR. Falta o CPF do responsável — você vai me informar. 


|        |        |
| ------ | ------ |
| &nbsp; | &nbsp; |


1. Crio o rascunho da proposta dele com todos esses dados + CPF, endereço completo buscado pelo CNPJ, seguro vigente marcado como "não" e prêmio de R$ 911,66/ano.
2. Marco o rascunho como "aguardando aceite", com validade de 7 dias e token pessoal.
3. Envio no WhatsApp dele, pela conversa ativa, um resumo dos dados coletados + o link da proposta (com o token, já pronto para quando o site passar a ler). Mensagem sem emoji, no padrão da Iris.

## Depois disso

Para o link realmente abrir tudo preenchido, é preciso pedir no projeto do site: ler `?proposta=<token>`, chamar o endpoint `proposal-prefill` deste CRM e abrir o checkout na etapa de conferência, mantendo Turnstile e os três aceites. Nada aqui muda quando isso for feito.

## Detalhes técnicos

- Inserção direta em `public.proposal_drafts` para o contato `abb4dac4-...` e a conversa ativa dele: cnpj, razao_social, rntrc, endereco (jsonb), responsavel, cpf, email, telefone, seguro_vigente=false, token aleatório de 32 hex, status `awaiting_acceptance`, expires_at = agora + 7 dias.
- Envio da mensagem via `send_queue` (mesmo caminho do `whatsapp-sender`, com `stripEmojis` aplicado) e registro em `messages` para aparecer no chat.
- Nenhuma alteração de código ou de schema; o `nina-orchestrator` segue como está.

Me passe o CPF do Paulo para eu executar. 


|                |                       |
| -------------- | --------------------- |
| 040.234.729-30 | PAULO RENATO LANDUCCI |
