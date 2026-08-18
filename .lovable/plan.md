# Review do prompt da Iris: reforçar que o produto é só para subcontratado

O prompt já traz o aviso do escopo em vários pontos (catálogo de planos, bloco da apólice do subcontratado, triagem contratado × subcontratado). O que falta é esse aviso aparecer de forma consistente e obrigatória em todo lugar onde o produto é citado — hoje ele pode se perder no meio de blocos longos e não é repetido no fechamento da conversa.

## O que muda

1. Regra de escopo no topo do prompt
   - Novo bloco curto e destacado, logo no início da persona (antes do catálogo): "Este produto é EXCLUSIVO para transportador PJ que atua como SUBCONTRATADO/agregado. Nunca ofereça, precifique ou envie o link do site para quem atua como contratado direto."
   - Inclui a checagem obrigatória: sem saber o tipo de transportador, não fale de preço, coberturas nem envie link.

2. Frase obrigatória de escopo
   - Definir uma frase padrão curta que a Iris deve incluir sempre que apresentar o pacote, falar de preço, prazo de emissão ou enviar o link:
     "Essa apólice vale para a sua atuação como subcontratado (agregado). Frete fechado direto com o dono da carga não é coberto por ela."
   - Regra explícita: essa frase é obrigatória na primeira menção do produto na conversa e sempre que o lead perguntar preço/contratação.

3. Modelos de mensagem
   - Template de apresentação do pacote ao subcontratado: manter o aviso, mas movê-lo para logo depois da primeira linha (não só no fim).
   - Mensagem de resumo/fechamento com o link da proposta: acrescentar a linha de escopo antes do link.
   - Mensagem de handoff do contratado: manter o texto atual (já explica que o pacote não serve).

4. Reforço na conferência (Passo 4)
   - Antes de enviar o resumo com o link, a Iris confirma em uma linha que o cadastro está sendo feito na modalidade subcontratado.

5. Respostas prontas
   - `/pacote`, `/preco`, `/prazo`, `/comofunciona` e `/elegibilidade` passam a terminar com a mesma frase padrão de escopo (as demais permanecem).

## Detalhes técnicos

- Edições de texto em `supabase/functions/nina-orchestrator/index.ts`: bloco de persona/regras (~5460-5580), catálogo `plansCatalogContent` (~4200-4290), templates de abertura/apresentação (~5599-5660) e mensagem de conferência do fluxo de proposta (~4009).
- Atualização do conteúdo das linhas correspondentes em `public.quick_replies` via ferramenta de dados.
- Sem emojis nos textos enviados ao contato; conteúdo restrito ao que consta na landing page oficial e preço mantido em R$ 911,66/ano.
- Redeploy do `nina-orchestrator` e conferência das respostas prontas no banco.
