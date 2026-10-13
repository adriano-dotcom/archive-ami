# Botão "Enviar para Pipedrive" no painel do contato

## Como funciona hoje
O envio ao Pipedrive já está pronto no backend: a função `push-lead-pipedrive` cria a **Pessoa** (nome, telefone, e-mail), o **Lead** com a origem da campanha no título e uma **nota** com empresa e CNPJ. Hoje ela só dispara automaticamente (contato novo ou mudança de status/CNPJ) e aceita apenas chamada interna — não há como o operador enviar manualmente pela tela.

## O que vamos fazer

### 1. Liberar a função para a equipe logada
Em `supabase/functions/push-lead-pipedrive/index.ts`, além da chamada interna (gatilho automático), aceitar chamada de **usuário autenticado da equipe** (valida o login e o papel em `user_roles`). O envio real passa a ser permitido para admin/operator; o `dry_run` continua restrito a admin. Nada muda no gatilho automático.

### 2. Botão no painel lateral do contato
Em `src/components/ContactDetailsDrawer.tsx` (painel de dados do contato no chat):
- Novo bloco "Pipedrive" com o botão **Enviar para Pipedrive**.
- Estados do botão:
  - **Não enviado**: botão ativo; ao clicar, chama a função com `contact_id` (envio real, sem `dry_run`).
  - **Enviando**: spinner, botão desabilitado.
  - **Enviado**: mostra "Enviado em \<data\>" (lê `sent_to_pipedrive_at`) e o botão fica desabilitado.
  - **Erro**: mostra a mensagem de `pipedrive_sync_error` em vermelho e permite tentar de novo (a função limpa o erro ao ter sucesso).
- Feedback com toast de sucesso/erro.

### 3. Sem mudanças em
Nina, webhook do WhatsApp, gatilho automático, `replicate-lead-to-crm` e demais telas.

## Detalhes técnicos
- Chamada via `supabase.functions.invoke('push-lead-pipedrive', { body: { contact_id } })` — o token do usuário logado vai no header automaticamente e é validado na função.
- O que é enviado ao Pipedrive (já implementado): Pessoa (nome, telefone, e-mail), Lead (título `Nome — origem`, vinculado à pessoa) e nota com empresa/CNPJ. Nenhum dado extra é inventado; campos vazios simplesmente não vão.
- Após o envio, o painel relê o contato para exibir a data de envio.

## Verificação
1. Abrir um contato ainda não enviado, clicar no botão e conferir o Lead criado no Pipedrive.
2. Confirmar que o painel passa a mostrar "Enviado em ..." e o botão fica desabilitado.
3. Simular erro (contato sem dados mínimos) e conferir a mensagem de erro e a possibilidade de reenvio.
