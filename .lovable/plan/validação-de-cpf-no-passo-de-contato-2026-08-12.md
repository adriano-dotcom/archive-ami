# Validação de CPF no passo de Contato

Hoje a Iris aceita qualquer sequência de 11 dígitos como CPF. Se o lead digitar um número errado, isso vai direto para o rascunho e só quebra depois, no formulário do site.

A mudança: assim que o lead responder o CPF, o sistema confere formato e dígitos verificadores. Se estiver inválido, a Iris responde na hora pedindo a correção e não grava nada.

## Como fica na conversa

Lead: "meu cpf é 111.111.111-11"

Iris: "Esse CPF não passou na verificação. Pode conferir e me mandar de novo, com os 11 dígitos? Pode ser só os números."

Regras:

- Só valida quando a última pergunta da Iris foi o CPF (passo 2 — Contato).
- Nada é gravado no rascunho enquanto o CPF for inválido; o passo continua pendente no painel.
- Sequências repetidas (111.111.111-11, 000...) são recusadas.
- Se o lead insistir com número inválido três vezes seguidas, a Iris para de repetir a mesma frase e avisa que um corretor vai conferir junto — sem dispensar o lead.
- Mensagem sem emoji, como todas as outras.

## Detalhes técnicos

- `supabase/functions/nina-orchestrator/index.ts`
  - Nova função `isValidCpf(digits)` com os dois dígitos verificadores (mesmo padrão do `isValidCnpj` já usado em `consulta-antt`).
  - `extractProposalFormFields`: só define `out.cpf` quando `isValidCpf` passar. Quando a pergunta foi CPF e o texto trouxe 11 dígitos inválidos, sinaliza `cpf_invalido: true` no retorno (campo transitório, não persistido no rascunho).
  - No bloco de extração do loop principal: se `cpf_invalido`, incrementa `proposta_form.cpf_tentativas` no `nina_context`, enfileira a mensagem determinística de correção via `queueTextResponse`, marca a mensagem como processada e retorna — sem chamar a IA.
  - A partir da 3ª tentativa, a mensagem passa a ser a de encaminhamento ao corretor.
- Prompt do fluxo subcontratado: acrescentar que o CPF é validado automaticamente e que a Iris nunca deve aceitar CPF inválido nem inventar dígitos.
- Nenhuma mudança de banco: `proposal_drafts.cpf` continua igual, apenas deixa de receber valores inválidos.
