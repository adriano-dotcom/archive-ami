# Corrigir erro ao cadastrar novo usuário na Equipe

## O que está acontecendo

O convite do Leonardo **foi criado com sucesso** às 19:04 (o membro aparece na lista). Os erros seguintes são de cliques repetidos no "Enviar Convite": o banco rejeita o segundo cadastro porque o e-mail já existe (`team_members_email_key`), e a mensagem exibida ("Erro ao convidar membro") faz parecer que nada funcionou.

Duas causas somadas:
1. O botão "Enviar Convite" não bloqueia durante o envio, então dá para clicar várias vezes.
2. Quando o e-mail já existe, o fluxo simplesmente falha, em vez de reaproveitar o membro existente e reenviar o convite.

## O que vai mudar

- **Botão com estado de envio**: enquanto o convite está sendo processado, o botão fica desabilitado com "Enviando...", impedindo cliques duplicados.
- **Convite idempotente**: se já existir um membro com aquele e-mail, o sistema atualiza os dados (nome, nível de acesso, time, função, peso), renova o convite pendente e reenvia o e-mail, em vez de dar erro.
- **Mensagens claras**: se o membro já estiver ativo, aviso "Este e-mail já faz parte da equipe"; se estava convidado, "Convite reenviado". Erros reais continuam mostrando mensagem de falha.

## Detalhes técnicos

- `src/components/Team.tsx`: estado `submitting` no `handleInvite`, botão desabilitado; antes do insert, buscar `team_members` por e-mail — se existir, `update` no lugar de `insert` e seguir para `pending_invites` + `send-invite-email`.
- `src/services/api.ts`: ajustar `createTeamMember` para tratar o conflito `23505` retornando o registro existente (ou adicionar `getTeamMemberByEmail`).
- Sem alteração de schema; a constraint única de e-mail é mantida.
