# Iris preenche a proposta e manda o link pronto para aceite

A Iris passa a conduzir, dentro do chat, exatamente as perguntas do formulário do site oficial. Conforme o lead responde, os dados vão sendo salvos. No fim, ela envia um link exclusivo que abre o formulário do site já preenchido — o lead só confere, marca os aceites e transmite.

## Como fica a conversa

Depois da triagem (subcontratado) e do interesse confirmado, a Iris coleta na ordem do formulário:

1. CNPJ — com consulta automática, ela já devolve razão social, endereço e situação do RNTRC para o lead confirmar
2. Nome do responsável
3. CPF do responsável
4. E-mail
5. Telefone/celular
6. Já possui seguro vigente? (sim/não)

Regras que ela mantém: uma pergunta por vez, sem emoji, sem inventar dado, confirmação do que veio da consulta de CNPJ/RNTRC, e o link oficial continua sendo enviado sempre que o lead falar de preço, prazo ou interesse.

No fechamento ela envia algo como:

```text
Prontinho, já deixei sua proposta preenchida com os dados que você me passou.
É só abrir o link, conferir, marcar os aceites e clicar em transmitir:
https://rctr-c.rc-dc.rc-v.jacometo.com.br/?proposta=XXXXXXXX
O link é pessoal e vale por 7 dias.
```

Os aceites (LGPD, declaração e autorização de emissão automatizada) continuam sendo dados pelo próprio lead no site — a Iris nunca marca por ele.

## O que muda no CRM

- Nova tabela de rascunhos de proposta ligada ao contato/conversa, guardando os campos coletados, um token público aleatório e a validade (7 dias). Acesso restrito à equipe; o token é lido só pela função pública.
- O painel do lead no chat mostra o que já foi coletado e o status ("aguardando aceite", "transmitida").
- Quando a coleta termina, o lead segue sendo marcado como proposta e o corretor é notificado como já acontece hoje.

## Detalhes técnicos

- Migração: `public.proposal_drafts` (contact_id, conversation_id, cnpj, razao_social, rntrc, rntrc_situacao, endereco jsonb, responsavel, cpf, email, telefone, seguro_vigente, token text unique, expires_at, status, timestamps) + GRANTs + RLS (SELECT/INSERT/UPDATE apenas para staff autenticado; sem acesso anon).
- `nina-orchestrator`: novo bloco de coleta "formulário da proposta" reaproveitando a extração de dados já existente (CNPJ/e-mail/telefone) e estendendo para responsável, CPF e seguro vigente; reuso da função `consulta-antt` e da consulta de CNPJ para preencher razão social e endereço. Ao completar, cria o rascunho e envia a mensagem de fechamento com o link.
- Nova edge function pública `proposal-prefill` (`verify_jwt = false`, rate limit por IP via `check_rate_limit`): `GET ?token=...` devolve os campos do rascunho não expirado, com CPF/CNPJ retornados apenas para preenchimento e sem dados de outros leads. Esse é o contrato que o site oficial vai consumir.
- Sanitização de saída (`stripEmojis`) mantida em todas as mensagens.

## O que precisa ser feito no outro projeto

O site "Projeto 3 Seguros Obrigatorio" não é alterado por aqui. Depois de aprovar este plano, é preciso pedir lá:

- ler `?proposta=<token>` na landing page, chamar o endpoint `proposal-prefill` deste CRM e abrir o modal de checkout já preenchido, indo direto para a etapa de revisão/aceite;
- manter Turnstile e os três aceites obrigatórios como estão.

Enquanto essa parte não existir, o link cai na home normalmente e o lead preenche à mão — nada quebra.
