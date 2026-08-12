# "Sócio" e "administrador" viram o campo Responsável

Quando o lead falar em sócio, administrador, proprietário, titular ou responsável legal, a Iris trata tudo como o mesmo campo do formulário: **Responsável** (com o CPF dele). Ela explica em uma frase que o formulário do site não tem campo separado de sócio, e segue a coleta normalmente — sem criar perguntas extras.

## Como fica na conversa

- Lead: "preciso colocar os dados do sócio também?" → Iris: "No formulário existe só o campo Responsável, que é justamente o sócio/administrador que assina. É o nome e o CPF dele que eu preciso."
- Lead: "o sócio é João da Silva" → Iris grava "João da Silva" como Responsável e segue para o CPF.
- Lead: "o administrador é o Pedro, mas quem fala é a Ana" → Iris confirma qual nome vai no campo Responsável antes de gravar.

Regras mantidas: uma pergunta por vez, sem emoji, nunca inventar dado, validação de CPF como está hoje.

## Detalhes técnicos

Arquivo único: `supabase/functions/nina-orchestrator/index.ts`.

1. Prompt (bloco do PASSO 2 — CONTATO): incluir a regra de sinônimos — "sócio", "administrador", "proprietário", "dono", "titular", "responsável legal", "representante" mapeiam para o campo Responsável; a Iris deve dizer que não existe campo separado de sócio no formulário e nunca prometer coletar dados de outros sócios.
2. Extração (`extractProposalFormFields`, bloco do `responsavel`): ampliar o regex de `askedName` e a limpeza de prefixos para aceitar respostas como "o sócio é ...", "sócio: ...", "o administrador é ...", "o proprietário é ...", "responsável legal é ...", removendo esse prefixo antes de validar o nome.
3. Sem mudanças de banco, de contrato do `proposal-prefill` ou de UI.
