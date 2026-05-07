## Diagnóstico: por que alguns usuários não veem os leads

Verifiquei as políticas RLS das tabelas `conversations`, `messages`, `contacts` e cruzei com os usuários reais da plataforma.

### Usuários atuais e o que cada um enxerga hoje

| Email | Role | team_members.status | Vê contatos? | Vê conversas? |
|---|---|---|---|---|
| adriano@jacometo.com.br | admin | — | Sim | Sim |
| goeesgabrieel@gmail.com | operator | active | Sim | Sim |
| contato@orbepet.com.br (Ludiane) | operator | **invited** | Sim | **Não** |
| jarvis@jacometo.com.br | operator | **sem registro** | Sim | **Não** |
| joao.pedro@jacometo.com.br | **sem role** | sem registro | **Não** | **Não** |

### Causa raiz

As políticas estão inconsistentes entre as tabelas:

- `contacts` libera para: `team_member ativo OR admin OR operator` → operator vê.
- `conversations` libera para: `team_member ativo OR admin` → **operator NÃO vê** se o team_members não estiver com status='active'.
- `messages` libera para: `team_member ativo OR admin` → mesmo problema.

Resultado: usuários com role `operator` mas sem `team_members.status='active'` (Ludiane está como "invited", Jarvis nem existe na tabela) conseguem ver a lista de contatos, mas as conversas/mensagens do WhatsApp aparecem vazias. E o João Pedro não tem role nenhuma, então não vê nada.

## Plano de correção

### 1. Uniformizar RLS de `conversations` e `messages`
Atualizar as policies para também aceitar role `operator`, igual ao que já está em `contacts`:
- SELECT/INSERT/UPDATE liberados para: `admin OR operator OR team_member ativo`.
- DELETE em `conversations` continua só para admin.

### 2. Ativar team_members pendentes
- Marcar `contato@orbepet.com.br` (Ludiane) como `status='active'` em `team_members` (atualmente "invited").
- Criar registro em `team_members` para `jarvis@jacometo.com.br` (ou confirmar se é uma conta de sistema que não deveria logar na UI).

### 3. Resolver o usuário sem role
`joao.pedro@jacometo.com.br` não tem entrada em `user_roles`. Opções:
- Atribuir `operator` (acesso normal de atendimento), ou
- Atribuir `admin` (acesso total), ou
- Remover/desativar se não deve mais usar a plataforma.

Preciso da sua decisão antes de aplicar.

### 4. (Opcional) Garantir role na criação de novos usuários
A função `handle_new_user()` já cria `operator` automaticamente para novos signups, mas o João Pedro foi criado antes ou via fluxo que não disparou o trigger. Verificar se o trigger `on_auth_user_created` está ativo em `auth.users`; se não estiver, recriar para evitar futuros usuários "órfãos".

## Perguntas para você

1. Qual role o **João Pedro** deve ter? (operator, admin, ou remover acesso)
2. O **jarvis@jacometo.com.br** é uma conta humana que precisa ver os leads na UI, ou é só uma conta de integração/automação? (se for automação, não precisa ver nada — usa service role)
3. Confirmo a ativação da **Ludiane** (contato@orbepet.com.br) como membro ativo da equipe?

Assim que você responder, aplico a migração de RLS + os ajustes de equipe em uma única etapa.
