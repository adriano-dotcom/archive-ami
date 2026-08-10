# Regra global: nunca enviar emoji para os contatos

Hoje a Iris ainda envia emojis (ex.: "A equipe já foi notificada, já vão te atender. 💙"), porque a proibição existe só em alguns prompts isolados e nada bloqueia o texto na hora do envio. A correção tem duas camadas: instruir a IA e, principalmente, filtrar no último ponto antes da entrega.

## 1. Filtro no envio (camada à prova de falha)

Criar um utilitário compartilhado de limpeza de texto que remove emojis e pictogramas (incluindo variantes, bandeiras e sequências com ZWJ), converte emojis "decorativos" em nada e normaliza espaços duplicados e espaços antes de pontuação, sem alterar acentos, quebras de linha, negrito do WhatsApp ou links.

Aplicar esse filtro em:
- Envio de WhatsApp (texto e legendas de mídia) — ponto único por onde passa toda mensagem enviada ao contato.
- Envio de e-mails para contatos (corpo e assunto).

Assim, mesmo que o modelo insista em um emoji, o contato nunca recebe.

## 2. Instruções da IA

Adicionar a regra "NUNCA use emojis" (sem exceções) nos prompts que geram texto enviado ao contato:
- Agente de conversa (Iris/Nina).
- Geração de follow-up (hoje permite "no máximo 1").
- Geração de e-mails de cobrança e de copy de e-mail (hoje permitem emoji em casos de urgência).

Também remover os emojis que estão escritos direto no código das mensagens fixas do agente.

## 3. Escopo do que NÃO muda

- Emojis da interface interna do CRM (ícones e rótulos vistos pela equipe) continuam como estão.
- Emojis que o contato envia para nós continuam sendo recebidos e exibidos normalmente.
- Mensagens digitadas manualmente por um atendente: também passam pelo filtro de envio, garantindo o padrão da empresa.

## Detalhes técnicos

- Novo arquivo `supabase/functions/_shared/text-sanitize.ts` com `stripEmojis(text)` usando propriedades Unicode (`\p{Extended_Pictographic}`, `\p{Regional_Indicator}`, variation selectors U+FE0F e ZWJ U+200D), seguido de colapso de espaços.
- Aplicar em `whatsapp-sender/index.ts` nos pontos que montam `payload.text.body` e `caption`, e em `send-email/index.ts` (assunto/corpo).
- Atualizar prompts em `nina-orchestrator/index.ts`, `generate-followup-message/index.ts`, `generate-collection-emails/index.ts`, `generate-email-copy/index.ts`; remover emojis literais das respostas fixas (ex.: linha ~5507 do orchestrator).
- Redeploy das funções alteradas e teste de envio confirmando texto sem emoji.
