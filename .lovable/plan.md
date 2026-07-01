## Diagnóstico

O agente **Iris está ativo e funcionando**: ele recebe as mensagens e gera as respostas (fila de IA marcada como `completed`). O que quebrou foi o **envio pelo WhatsApp**.

- Há **16 respostas presas** na fila de envio (`send_queue` com status `pending`, sem erro).
- A função de envio não tem credenciais: na configuração (`nina_settings`), o **Access Token** e o **Phone Number ID** do WhatsApp estão **vazios**.
- No cofre (vault) também não existe token salvo (`vault_whatsapp_token` ausente).
- Conclusão: as credenciais foram apagadas (provável limpeza do banco na virada para Jacometo). Sem elas, nada é entregue no WhatsApp.

Dado recuperável dos logs de webhook da Meta:
- **Phone Number ID:** `1003906669464570`
- Número de exibição: `554391562099`

O **Access Token** NÃO é recuperável (é secreto). Precisa ser regenerado no painel da Meta.

## O que será feito

1. **Restaurar o Phone Number ID** (`1003906669464570`) no registro de configuração `nina_settings`.

2. **Receber e salvar o Access Token** da Meta (WhatsApp Cloud API). Você fornece o token; ele é armazenado com segurança (não fica exposto no código). Onde obter na Meta:
   - Meta for Developers → seu App → **WhatsApp → API Setup / Configuração da API**.
   - Para produção estável, gerar um **token permanente** via **System User** (Business Settings → Users → System Users → Generate Token, com permissões `whatsapp_business_messaging` e `whatsapp_business_management`). O token temporário de 24h serve só para teste.

3. **Reprocessar a fila de envio** para tentar despachar as respostas paradas, disparando a função de envio (`whatsapp-sender`).

4. **Validar** o envio: confirmar que a `send_queue` passa de `pending` para `completed` e que a mensagem chega no WhatsApp.

## Observações importantes

- **Janela de 24h:** o WhatsApp só permite mensagem livre dentro de 24h após a última mensagem do cliente. As respostas presas mais antigas podem estar fora da janela e falharão como "fora da janela" — isso é normal e não é bug. Mensagens novas que chegarem reabrem a janela e serão respondidas normalmente.
- Se o token que estava configurado antes era temporário (24h), ele expirou — por isso o ideal é gerar um **token permanente** agora para não parar de novo.

## Detalhes técnicos

- Atualização de dados em `nina_settings.whatsapp_phone_number_id` (ferramenta de dados, não schema).
- Access Token guardado via mecanismo de segredos e/ou campo de credencial usado pela função `whatsapp-sender` (que lê `whatsapp_access_token` / vault `vault_whatsapp_token`).
- Reprocessamento chamando a edge function `whatsapp-sender` após as credenciais estarem completas.
