## Diagnóstico confirmado

O envio parou em **28/06** (limpeza do banco na virada para Jacometo apagou o `whatsapp_access_token`). Recebimento continua OK. O token é secreto e irrecuperável — precisa ser gerado de novo na Meta. Você disse que não sabe pegá-lo, então incluo o passo a passo, e vou adicionar um **aviso visível de desconexão** no app para isso nunca mais passar despercebido.

## Parte 1 — Como gerar o Access Token na Meta (guia)

Passo a passo que vou te entregar no app (e resumido aqui):

1. Acesse **developers.facebook.com** → seu App do WhatsApp.
2. Menu **WhatsApp → Configuração da API**: ali aparece o **Phone Number ID** (já restaurado no app) e um **token temporário** (dura 24h — foi esse que expirou/foi perdido).
3. Para um token que **não expira**, vá em **Configurações do Negócio (business.facebook.com) → Usuários → Usuários do sistema**:
   - Crie/selecione um **System User** do tipo Admin.
   - Clique em **Gerar token** → escolha o App → marque as permissões **`whatsapp_business_messaging`** e **`whatsapp_business_management`**.
   - Copie o token gerado (ele só aparece uma vez).
4. No app: **Configurações → aba APIs → bloco WhatsApp** → cole o token → **Salvar**. A fila é reprocessada automaticamente (botão "Reprocessar fila de envios" também disponível).

## Parte 2 — Aviso visível de desconexão (código)

Objetivo: um banner claro no topo do app sempre que o WhatsApp estiver sem token (ou o envio estiver travado), com atalho para reconectar.

**Backend — nova função `whatsapp-connection-status`**
- Edge function que usa service role e retorna JSON seguro (sem expor o token):
  `{ connected: boolean, phone_configured: boolean, token_present: boolean, pending_count: number, oldest_pending_at: string | null }`.
- `token_present` = existe token na tabela **ou** no Vault; `connected` = `phone_configured && token_present`.

**Frontend**
- `src/hooks/useWhatsAppConnection.ts`: chama a função a cada ~60s e expõe o status.
- `src/components/WhatsAppConnectionBanner.tsx`: banner fixo (tom de alerta via tokens do design system, ex.: `bg-destructive/10 border-destructive/30`) exibido só quando `!connected` ou `pending_count > 0` sem token. Mostra:
  - Título: "WhatsApp desconectado — mensagens não estão sendo enviadas".
  - Contador de mensagens presas na fila.
  - Botão **"Reconectar"** que leva a Configurações → APIs.
- Renderizar o banner no layout principal (acima da área de conteúdo, junto ao `OnboardingBanner`), visível em `/chat` e nas demais telas.

**Reforço opcional já suportado**: após salvar o token, o `handleReprocessQueue` existente dispara `trigger-whatsapp-sender` para esvaziar a fila.

## Detalhes técnicos

- A leitura de status roda via edge function com service role — o token nunca é enviado ao browser, só o booleano `token_present`.
- Sem migração de banco necessária (colunas `whatsapp_access_token`, `whatsapp_phone_number_id`, `whatsapp_token_in_vault` já existem em `nina_settings`).
- As 40 mensagens em `pending` mais antigas que 24h desde a última resposta do cliente vão falhar como "fora da janela 24h" ao reprocessar — comportamento esperado da API do WhatsApp; as recentes serão entregues.

## Resultado

- Você recebe o guia para gerar o token permanente e reconectar.
- O app passa a mostrar um alerta claro sempre que o WhatsApp cair, com atalho de reconexão — evitando ficar dias sem enviar sem ninguém perceber.