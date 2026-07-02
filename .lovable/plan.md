# Resposta da Iris para leads do site — apólice do subcontratado (agregado)

## Objetivo
Quando um **lead vindo do site** iniciar a conversa (primeira mensagem), a Iris deve responder com uma mensagem de abertura baseada no texto que você forneceu sobre a **apólice do transportador subcontratado (agregado)**. A IA **adapta** a redação (mantendo os avisos obrigatórios) e **personaliza** com o nome/empresa do lead quando existirem.

## Regras de disparo (conforme suas respostas)
- **Quando:** apenas na 1ª mensagem de leads do site.
  - Detecção: `contact.lead_source === 'landing_page'` **ou** `contact.utm_source` presente, **E** a Iris ainda não respondeu nesta conversa (sem mensagens anteriores do agente).
- **Formato:** a IA usa o texto como **modelo/base** e pode ajustar a redação, mas **nunca omite** os avisos essenciais (sem averbação → sem cobertura RCTR-C/RC-DC/RC-V e sem indenização em sinistro).
- **Personalização:** inserir nome (`contact.call_name`/`contact.name`) e empresa (`contact.company`) quando disponíveis, de forma natural.

## Mensagem de referência (modelo)
```text
Olá! Aqui é da *Jacometo Corretora*, especialista em seguro de transporte 🚛

Sobre a apólice que você buscou: é a nossa *solução inédita de compliance* para o transportador *subcontratado (agregado)*.

*O que ela resolve:*
✅ Comprova que você tem o *seguro obrigatório* exigido para operar com o RNTRC (ANTT)
✅ Mantém você *regular perante a fiscalização*, evitando multas e impedimentos
✅ *Sem averbação por viagem* — a cobertura da carga fica com o *contratante principal*

⚠️ *Deixando claro:* por não ter averbação, *não há cobertura* de RCTR-C, RC-DC e RC-V e *não há indenização em sinistro*. É um produto *estritamente de regularização legal*.

Quando você atua como *contratado* e assume a carga, o certo é o produto *com averbação* — e a gente faz a migração.

Pra eu te orientar: seu foco agora é *ficar regular na ANTT* ou você precisa de *cobertura efetiva da carga*?
```

## Implementação técnica
Arquivo: `supabase/functions/nina-orchestrator/index.ts`, função `buildEnhancedPrompt`.

1. Adicionar um bloco condicional no `contextInfo` que só é injetado quando:
   - lead do site (`lead_source === 'landing_page'` ou `utm_source` presente), **e**
   - primeiro contato (`!recentAgentMessages?.length`).
2. O bloco será uma instrução do tipo **"🟢 MODELO DE PRIMEIRA RESPOSTA — LEAD DO SITE (SUBCONTRATADO)"** contendo:
   - O texto de referência acima como base.
   - Instrução para **adaptar** a redação mantendo tom curto/WhatsApp e os avisos obrigatórios intactos.
   - Instrução para **personalizar** com nome/empresa quando existirem (ex.: "Olá, {nome}!").
   - Reforço de que essa abertura substitui a saudação genérica **somente** neste primeiro contato de lead do site.
3. Reaproveitar/alinhar com o bloco `⛔ REGRA INEGOCIÁVEL — APÓLICE DO TRANSPORTADOR SUBCONTRATADO` já existente para não haver conflito.
4. Reimplantar a edge function `nina-orchestrator`.

## Validação
- Atualizar o teste automatizado existente (`supabase/functions/nina-orchestrator/subcontratado.test.ts`) com um caso de "primeira mensagem de lead do site" verificando que a resposta contém: comprovação/compliance ANTT, aviso de sem cobertura/sem indenização e a pergunta final de direcionamento (regular na ANTT vs. cobertura efetiva).
- Rodar o teste via runner Deno.

## Observações
- Não altera a lógica de negócio nem o schema; muda apenas a construção do prompt (camada de apresentação/IA).
- Leads que **não** vêm do site ou já em conversa continuam com o fluxo atual.
