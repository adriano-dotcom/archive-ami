# Resposta pronta: lead pede contratação presencial

## Objetivo
Criar uma resposta pronta e reforçar o treinamento da Iris para o caso em que o lead pede atendimento presencial, deixando claro que não há atendimento presencial e direcionando para a contratação 100% online pelo site oficial.

## O que será feito

1. **Nova resposta pronta**
   - Categoria: `Objeções` (ou `Encerramento`, se fizer mais sentido com as demais).
   - Atalho: `/presencial`.
   - Título: curto e buscável, ex.: "Não atendemos presencialmente".
   - Texto: sem emoji, explicando que a Jacometo não faz atendimento presencial e que a contratação é 100% online pelo site oficial `https://rctr-c.rc-dc.rc-v.jacometo.com.br`, com link.
   - Variáveis: manter `{nome}` e os demais placeholders já suportados.

2. **Ajuste no treinamento do agente (`nina-orchestrator`)**
   - Adicionar instrução explícita no prompt de conduta/produto: quando o lead pedir "atendimento presencial", "quero falar pessoalmente", "tem loja/endereço", "posso ir aí", a Iris deve responder que não há atendimento presencial e reforçar a contratação online com o link oficial.
   - Garantir que a resposta siga o mesmo padrão das demais: sem emoji, sem promessa de horário, link sempre presente.

3. **Verificação**
   - Conferir no banco que a nova resposta pronta foi inserida corretamente e não contém emoji.
   - Validar que o texto do agente não contém emoji e traz o link oficial.
   - Redeploy do `nina-orchestrator` e teste rápido de resposta.

## Detalhes técnicos
- Inserção na tabela `public.quick_replies` via ferramenta de dados (insert), sem alteração de schema.
- Edição de texto apenas no bloco de regras de conduta/produto do `nina-orchestrator`.
- Redeploy da função `nina-orchestrator` ao final.
