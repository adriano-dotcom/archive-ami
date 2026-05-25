# Corrigir envio de áudio do operador no WhatsApp

## Diagnóstico

As mensagens de áudio gravadas pelo operador no chat estão falhando com erro Meta **131053 – Unsupported Audio mime type**. Hoje gravamos com `RecordRTC` em `audio/webm;codecs=opus` e armazenamos como `.webm` (alguns registros vêm como `audio/wav`). A WhatsApp Cloud API aceita apenas:

```
audio/ogg; codecs=opus  (recomendado p/ PTT)
audio/mpeg, audio/amr, audio/mp4, audio/aac
```

Por isso o áudio aparece na timeline com o ícone vermelho de erro e nunca chega ao tutor.

## Solução

Trocar a gravação no browser para gerar **diretamente OGG/Opus**, usando a biblioteca `extendable-media-recorder` + `extendable-media-recorder-wav-encoder` substituta — na verdade vamos usar **`opus-recorder`**, que encoda Opus em WebWorker e empacota em container OGG nativamente (funciona em Chrome, Edge, Safari 14+).

### Mudanças

1. **Dependência**
   - Adicionar `opus-recorder` (`bun add opus-recorder`).
   - Copiar o worker `encoderWorker.min.js` da lib para `public/opus/` (carregado por URL pelo recorder).

2. **`src/components/ChatInterface.tsx` – fluxo de gravação**
   - Substituir o uso de `RecordRTC` apenas no caminho de áudio por `Recorder` do `opus-recorder` configurado com:
     ```ts
     new Recorder({
       encoderPath: '/opus/encoderWorker.min.js',
       encoderApplication: 2048,     // VOIP
       encoderSampleRate: 16000,     // padrão PTT WhatsApp
       streamPages: false,
       numberOfChannels: 1,
       bufferLength: 4096,
     });
     ```
   - Ao parar, gerar `Blob` com `type: 'audio/ogg; codecs=opus'` e `File` com nome `audio_<ts>.ogg`.
   - Manter validações atuais (duração mínima 1s, toast de erro, cleanup do stream).
   - Vídeo/imagem/documento continuam pelo fluxo atual.

3. **`src/services/api.ts` – `sendMediaMessage`**
   - Quando `messageType === 'audio'`, normalizar `mediaType` para `'audio/ogg; codecs=opus'` antes de:
     - `supabase.storage.upload(..., { contentType: 'audio/ogg' })`
     - gravar `media_type` na tabela `messages`
   - Garantir extensão `.ogg` quando o arquivo vier sem extensão correta.

4. **`supabase/functions/whatsapp-sender/index.ts`**
   - No `case 'audio'`, manter envio por `link`, mas garantir o payload final:
     ```ts
     payload.type = 'audio';
     payload.audio = { link: queueItem.media_url };
     ```
   - Não muda comportamento; só validar que o link aponta para `.ogg` com content-type correto (servido pelo Storage).

5. **Reprocessamento (opcional, fora do escopo)**
   - Mensagens antigas com `status='failed'` e erro 131053 continuam falhas; não vamos reenviar automaticamente.

### Fora de escopo

- Áudios recebidos do tutor (já funcionam, passam por ElevenLabs).
- Transcodificação server-side (não precisamos — gravamos OGG/Opus já no cliente).
- Mudanças no nina-orchestrator, Age Guard, Orbe 360, follow-ups, prompt.

### Validação

- Gravar áudio no `/chat`, conferir no devtools que o upload sai com `Content-Type: audio/ogg`.
- Conferir no banco: `messages.media_type = 'audio/ogg; codecs=opus'`, `status` evolui de `processing` → `sent`.
- Confirmar entrega real no WhatsApp do tutor de teste.
- Em caso de falha, conferir `metadata.whatsapp_error` — não deve mais aparecer 131053.
