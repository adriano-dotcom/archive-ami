# Botão "Reprocessar fila de envios" do WhatsApp

## Objetivo
Permitir disparar manualmente o envio das mensagens presas em `send_queue` logo após salvar o Access Token / Phone Number ID, sem esperar o cron.

## O que já existe (reaproveitar)
- Edge function `trigger-whatsapp-sender` já pronta: chama `whatsapp-sender` que processa a fila `send_queue`. Não precisa criar função nova.
- `ApiSettings.tsx` já tem o card **WhatsApp Cloud API** com os campos e o botão de salvar (`handleSave`), além da flag `whatsappConfigured`.

## Mudanças (somente frontend em `src/components/settings/ApiSettings.tsx`)

1. **Novo estado** `reprocessing` (boolean) para controlar o loading do botão.

2. **Nova função** `handleReprocessQueue`:
   - Valida se `whatsappConfigured` (Access Token + Phone Number ID preenchidos); se não, mostra toast pedindo para salvar antes.
   - Chama `supabase.functions.invoke('trigger-whatsapp-sender', { body: { source: 'api_settings' } })`.
   - Em caso de sucesso, mostra toast com o resultado (ex.: quantas mensagens foram processadas, lendo `result.processed` quando disponível).
   - Trata erro com toast e `console.error`.

3. **Novo botão** no card WhatsApp Cloud API (logo abaixo dos campos, junto do bloco de status), rotulado **"Reprocessar fila de envios"**, com ícone (ex.: `Send`/`RefreshCw`), spinner enquanto `reprocessing`, desabilitado quando não configurado.

4. **Reprocesso automático após salvar (opcional, incluído):** ao final de `handleSave` bem-sucedido, se `whatsappConfigured` for verdadeiro, disparar `handleReprocessQueue()` automaticamente e avisar no toast que a fila está sendo reprocessada — atendendo diretamente ao "imediatamente após salvar as credenciais".

## Detalhes técnicos
- Sem alterações de banco, RLS ou edge functions — apenas UI que invoca a função existente.
- Import de ícone adicional do `lucide-react` se necessário.

## Validação
- Salvar credenciais válidas e confirmar que o toast indica reprocessamento e as mensagens saem de `pending`.
- Clicar no botão manualmente com credenciais ausentes → toast de aviso, sem chamada.
