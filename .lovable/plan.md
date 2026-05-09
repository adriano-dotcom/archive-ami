## Diagnóstico

Na captura você vê `CONTATO:` antes do texto. O prefixo é gerado em `src/services/api.ts` (linha 1072):

```ts
const whatsappContent = operatorName 
  ? `*${operatorName.toUpperCase()}:*\n${content}` 
  : content;
```

E em `src/components/ChatInterface.tsx` (linha 824) o `operatorName` é montado **a partir do prefixo do e-mail logado**:

```ts
const operatorName = user?.email
  ? user.email.split('@')[0].split(/[._-]/)...
  : undefined;
```

A Ludiane está logada como `contato@orbepet.com.br`, então o "nome" extraído vira `Contato` → `CONTATO`. O mesmo problema acontece em qualquer e-mail genérico (`jarvis@`, `vendas@`, etc.).

No banco já temos o nome real:
- `team_members.name = 'Ludiane'` para `contato@orbepet.com.br`
- `team_members.name = 'Gabriel'` para `goeesgabrieel@gmail.com`

Ou seja, o dado correto existe — só não está sendo usado.

Os mesmos pontos de envio de mídia também usam `operatorName` (linhas 1623, 1721 do `services/api.ts`), então a correção precisa valer para todos.

## Plano de correção

1. **Criar hook `useCurrentOperatorName`** (`src/hooks/useCurrentOperatorName.ts`)
   - Busca `team_members.name` pelo e-mail do usuário logado.
   - Fallback em cascata se não houver registro/nome:
     1. `team_members.name`
     2. `auth.user.user_metadata.full_name` ou `name`
     3. parte antes do `@` do e-mail formatada (comportamento atual), porém **ignorando** prefixos genéricos (`contato`, `vendas`, `suporte`, `atendimento`, `comercial`, `jarvis`, `noreply`, `no-reply`) — nesses casos cai para "Atendente".
   - Cacheia em memória/localStorage para não refazer query a cada envio.

2. **Trocar a lógica inline em `ChatInterface.tsx`**
   - Remover o bloco que monta `operatorName` a partir do e-mail no `handleSendMessage`.
   - Usar o hook: `const operatorName = useCurrentOperatorName();` e passar direto para `sendMessage`, envio de mídia e envio da biblioteca.

3. **Garantir consistência nos outros envios**
   - Repassar o mesmo `operatorName` para `api.sendMediaMessage` e `api.sendMediaLibraryMessage` (qualquer chamada que aceite `operatorName`).

4. **(Opcional, recomendado) Permitir editar o nome de exibição**
   - Em **Configurações → Equipe**, mostrar o `name` do `team_members` do usuário logado e permitir alterar. Hoje quem se cadastra com e-mail genérico não tem como corrigir.

## Fora de escopo

- Não mudar o formato do prefixo (`*NOME:*\n...`) — segue o padrão atual.
- Não alterar RLS/políticas (assunto da última correção).
- Não mexer em mensagens automáticas da Orbi (apenas mensagens enviadas manualmente pelo atendente).

## Resultado esperado

A mensagem da Ludiane passa a chegar como:

```
*LUDIANE:*
Boa tarde Amanda, aqui quem fala é a Ludiane...
```

E qualquer atendente com e-mail genérico terá o nome correto vindo do cadastro de equipe, não do e-mail.
