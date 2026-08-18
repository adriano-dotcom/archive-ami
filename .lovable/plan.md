# Garantir a frase de escopo (produto só para subcontratado) em todas as rotas

## Diagnóstico (verificado agora)

| Rota | Situação |
|---|---|
| Prompt padrão da Iris no código (`getDefaultSystemPrompt`) | OK — tem a REGRA #0 e a frase padrão |
| Catálogo de planos injetado no contexto | OK — tem a REGRA #0 e a frase padrão |
| Template de apresentação ao subcontratado | OK — frase logo após a 1ª linha e reforço no fim |
| Conferência/resumo com link da proposta | OK — traz a frase antes do link |
| **Prompt do agente ativo "Iris" no banco (`agents.system_prompt`)** | **FALHA** — tem só 266 caracteres e **substitui integralmente** o prompt padrão do código. A REGRA #0 e a frase de escopo não existem nele |
| **Resposta pronta `/presencial`** (pedido de contratação presencial, envia o link) | **FALHA** — sem a frase |
| **Resposta pronta "Central Jacometo e site oficial"** (envia o link de contratação) | **FALHA** — sem a frase e sem atalho cadastrado |
| **Resposta pronta `/coberturas`** | **FALHA** — fala do produto sem a frase |
| Respostas prontas `/pacote`, `/preco`, `/prazo`, `/comofunciona`, `/elegibilidade` | OK — já terminam com a frase |
| Demais funções de envio (follow-up, nurture, e-mails, templates WhatsApp) | Não citam preço/prazo/contratação do pacote — nada a mudar |

O ponto mais grave é o prompt do banco: como existe um agente ativo, o código usa `agent.system_prompt` e descarta todo o prompt padrão. Hoje o escopo só chega ao modelo por vias indiretas (catálogo e blocos de contexto).

## O que fazer

1. Alinhar o prompt do agente ativo no banco
   - Atualizar `agents.system_prompt` do agente "Iris" para incluir, no topo, o mesmo bloco REGRA #0 (escopo exclusivo subcontratado + proibição de precificar/enviar link para contratado direto e pessoa física + frase padrão obrigatória em preço, prazo e contratação).
   - Manter o restante do texto atual da persona logo abaixo.

2. Tornar o fallback à prova de sobrescrita
   - No `nina-orchestrator`, quando houver agente cadastrado, concatenar o bloco de escopo (constante única no código) ao `agent.system_prompt` caso ele não contenha a frase padrão. Assim qualquer prompt editado pela equipe continua com a regra.

3. Completar as respostas prontas
   - Acrescentar a frase padrão ao fim de `/presencial`, `/coberturas` e "Central Jacometo e site oficial" (e cadastrar o atalho `/central` que está nulo).

4. Verificação antes de considerar pronto
   - Consulta no banco confirmando que toda `quick_replies` que cita preço, prazo, contratação ou o link do site contém a frase.
   - Rodar `subcontratado.test.ts` e testar no chat três perguntas: "quanto custa?", "em quanto tempo sai a apólice?" e "como faço para contratar?" — a frase deve aparecer nas três.
   - Redeploy do `nina-orchestrator`.

## Detalhes técnicos

- Extrair a frase e o bloco de escopo para constantes (`SCOPE_SENTENCE`, `SCOPE_RULE_BLOCK`) em `supabase/functions/nina-orchestrator/index.ts` e reutilizá-las em `getDefaultSystemPrompt()`, no catálogo de planos e no novo reforço aplicado ao prompt vindo do banco (~linha 4113).
- Atualizações de `agents.system_prompt` e `public.quick_replies` via migração SQL.
- Sem emojis nos textos enviados ao contato; preço mantido em R$ 911,66/ano e conteúdo restrito à landing page oficial.
