# Deixar sempre claro: contratação 100% online pelo site oficial

Hoje o link `https://rctr-c.rc-dc.rc-v.jacometo.com.br` só é enviado ao lead no final, quando CNPJ, e-mail e celular já foram confirmados. A instrução de "contratação exclusiva pelo site" existe no prompt, mas não aparece nas mensagens que o lead lê no começo da conversa.

## O que muda

1. Apresentação do pacote (subcontratado)
   - O modelo de mensagem passa a incluir uma linha fixa: contratação 100% online, sem fila, pelo site oficial, com o link.

2. Regra do agente
   - Nova regra explícita: sempre que falar de preço, prazo de emissão, como contratar ou "quero contratar", a Iris informa que a contratação é feita 100% online no site oficial e envia o link — sem precisar esperar a qualificação completa.
   - A coleta de CNPJ, e-mail e celular continua acontecendo (para registro do lead e acompanhamento), mas deixa de ser condição para o lead saber onde contratar.

3. Mensagem de qualificação completa
   - Mantida como está (já traz o link), apenas reforçando "100% online".

4. Respostas prontas
   - `/pacote`, `/preco`, `/prazo` e `/comofunciona` passam a terminar com a linha de contratação online + link (o `/comofunciona` e `/central` já têm).

## Detalhes técnicos

- Ajustes de texto em `supabase/functions/nina-orchestrator/index.ts`: modelo de apresentação do subcontratado (~linha 5217), bloco de regras de conduta/produto (~linhas 5048-5156) e fluxo de qualificação (~linha 3852), usando a constante `CONTRACT_SITE_URL`.
- Atualização de conteúdo das linhas correspondentes em `public.quick_replies` via ferramenta de dados.
- Sem emojis nos textos enviados ao contato; todo conteúdo continua restrito ao que consta na landing page.
- Redeploy do `nina-orchestrator` e conferência das respostas prontas no banco.
