# Padronizar: áudio responde áudio, texto responde texto

## Situação atual (verificada)

- No `nina-orchestrator`, a decisão de responder em áudio é:
  `(configuração global de áudio ligada) OU (mensagem recebida foi áudio E o agente permite áudio)`.
- A configuração global `audio_response_enabled` está **ligada** no banco.
- Resultado: hoje a Iris pode responder em áudio mesmo quando o lead escreveu texto.

## O que muda

Regra única de espelho de formato:

- Lead mandou **áudio** -> Iris responde em **áudio**.
- Lead mandou **texto** (ou imagem, documento etc.) -> Iris responde em **texto**.

A configuração global deixa de forçar áudio; ela passa a funcionar apenas como chave liga/desliga do recurso de voz. Se o áudio estiver desligado (global ou no agente), a resposta a um áudio sai em texto.

Fallbacks mantidos como estão:
- Sem chave de voz configurada -> texto.
- Texto longo demais para conversão em voz -> texto.
- Falha ao gerar ou enviar o áudio -> texto.

## Detalhes técnicos

- `supabase/functions/nina-orchestrator/index.ts` (~linhas 4813-4848): trocar a condição por
  `incomingWasAudio && (settings?.audio_response_enabled ?? false) && (agent ? agentAudioEnabled : true)`,
  mantendo `!!elevenLabsKey && !tooLongForTTS`.
- Ajustar os logs da seção "AUDIO DECISION" para refletir a nova regra.
- Redeploy do `nina-orchestrator` e teste: enviar um áudio (deve voltar áudio) e um texto (deve voltar texto), conferindo o `message_type` gravado na fila de envio.
