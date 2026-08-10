# Áudio no chat: ouvir e enviar

Diagnóstico feito agora no banco/código — dois problemas confirmados bloqueiam o teste.

## O que está quebrado

1. **Não dá para ouvir o áudio recebido.** O bucket `whatsapp-media` está privado, mas as mensagens salvam a URL no formato público (`/object/public/whatsapp-media/...`). Todos os 5 áudios recebidos têm esse formato, então o player devolve erro de acesso e não toca.
2. **Nenhum áudio é transcrito.** Todas as mensagens de áudio ficam com o conteúdo `[áudio]`. A chave da ElevenLabs (usada pelo webhook para transcrever) não está configurada nem no banco nem no cofre, então o webhook pula a transcrição silenciosamente.
3. **Risco no envio de áudio.** O envio para o WhatsApp manda um `link` público da mídia. Com o bucket privado, a Meta não consegue baixar o arquivo — o áudio gravado no chat provavelmente falha na entrega pelo mesmo motivo do item 1.

## O que vamos fazer

**Ouvir áudio (entrada)**
- Gerar URL assinada sob demanda no player de áudio/mídia do chat, em vez de usar a URL pública salva.
- Manter as URLs já gravadas no banco, convertendo-as para caminho + URL assinada na hora de tocar.

**Enviar áudio (saída)**
- No envio ao WhatsApp, trocar o link público por uma URL assinada de curta duração (ou upload direto da mídia para a Meta), para a Meta conseguir baixar o arquivo com o bucket privado.

**Transcrição**
- Reativar a transcrição de áudios recebidos usando ElevenLabs Scribe (aceita OGG/Opus, formato que o WhatsApp envia), conectando a ElevenLabs pelo conector padrão.
- Se você preferir não usar ElevenLabs, a alternativa é converter o áudio antes de transcrever — mais lento e frágil; recomendo a ElevenLabs.

**Teste ponta a ponta**
- Você envia um áudio pelo WhatsApp: conferir que aparece no chat, toca, e a transcrição aparece abaixo do player.
- Você grava um áudio no chat: conferir entrega no WhatsApp e status na fila de envio.

## Detalhes técnicos

- `src/components/AudioPlayer.tsx` e o carregamento de mídia no `ChatInterface`: resolver `media_url` via `supabase.storage.from('whatsapp-media').createSignedUrl(path, 3600)`, com cache por mensagem.
- `supabase/functions/whatsapp-sender/index.ts`: para `audio`/`image`/`video`/`document`, gerar signed URL a partir do caminho no bucket antes de montar o `payload`.
- `supabase/functions/whatsapp-webhook/index.ts`: `transcribeAudio` já existe; passará a ler a chave do conector ElevenLabs (`ELEVENLABS_API_KEY`) além do `nina_settings`.
- Sem mudanças de schema; nada de tornar o bucket público de novo (decisão de segurança anterior).
