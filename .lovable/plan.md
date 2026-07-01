## Objetivo

Deixar explícito, na fala da Iris, que ela **tira dúvidas** do lead/transportador (inclusive quem atua como **subcontratado**) e que a **contratação é feita exclusivamente pelo site**. Ao final da conversa, ela orienta o lead a preencher o formulário em `https://transporte.jacometoseguros.com.br`.

Tudo é ajuste de prompt/comportamento no orquestrador — sem mudança de schema ou de UI.

## Mudanças em `supabase/functions/nina-orchestrator/index.ts`

### 1. Papel da Iris (bloco `getDefaultSystemPrompt` e definição de papel, ~linha 4797)
- Reforçar que a Iris **esclarece dúvidas** sobre as coberturas obrigatórias (RCTR-C, RC-DC, RC-V), regularização ANTT e sobre atuar como **subcontratado** de transportadoras maiores.
- Deixar claro que a **contratação NÃO é feita pelo chat** — ela acontece somente pelo site oficial.

### 2. Nova regra inegociável de contratação (junto ao bloco "QUEM PODE CONTRATAR", ~linha 3644)
Adicionar bloco fixo:
```text
⛔ REGRA DE CONTRATAÇÃO — CANAL ÚNICO
- A contratação é feita EXCLUSIVAMENTE pelo site oficial: https://transporte.jacometoseguros.com.br
- A Iris NÃO fecha contrato, NÃO gera boleto e NÃO coleta pagamento pelo chat.
- Fluxo: (1) tirar as dúvidas do transportador → (2) confirmar que ele é MEI/ME/EPP com RNTRC/ETC (inclui quem atua como subcontratado) → (3) enviar o link do site para ele preencher a proposta.
- Sempre que o lead demonstrar interesse em contratar / pedir link / perguntar "como faço", envie o site para preenchimento.
```

### 3. Orientação de atendimento (~linha 4899)
- Trocar `Conduza o lead à proposta online / contratação, sem burocracia.` por: conduzir o lead a **preencher a proposta no site** `https://transporte.jacometoseguros.com.br`, após esclarecer as dúvidas.

### 4. Reforço no fechamento (sanitizer, opcional mas recomendado)
- Quando houver intenção de fechamento (`closingKeywords`: "quero contratar", "manda o link", "como pago" etc.) e a resposta final da LLM **não** contiver o domínio `transporte.jacometoseguros.com.br`, anexar automaticamente uma linha convidando a preencher a proposta no site.
- Isso garante que o lead sempre receba o link correto no momento certo.

## Resultado esperado
- Iris passa a se posicionar como canal de **dúvidas** (não de contratação).
- Menciona explicitamente o cenário de **subcontratado**.
- Em todo momento de interesse/fechamento, envia `https://transporte.jacometoseguros.com.br` para o lead preencher.

Após aplicar, farei o redeploy do `nina-orchestrator`.