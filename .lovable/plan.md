# Iris responde em áudio quando o lead manda áudio

Hoje a resposta em áudio está desligada: a Iris entende o áudio recebido (transcrição já funcionando), mas sempre responde em texto.

## Situação atual verificada

- `nina_settings.audio_response_enabled` = falso e o agente Iris também está com resposta em áudio desativada.
- A chave da ElevenLabs não está salva na tabela de configurações nem no cofre — está apenas como credencial do conector (`ELEVENLABS_API_KEY`), que o gerador de voz ainda não lê.
- A trava final de envio exige a chave gravada na tabela, então mesmo ativando o botão nada seria gerado.

## O que será feito

1. **Ler a chave do conector**: o gerador de voz e a verificação de "pode enviar áudio" passam a aceitar a chave do conector ElevenLabs, além da chave da tabela e do cofre.
2. **Ativar só para áudio recebido**: manter o modo global desligado (conversas de texto continuam em texto) e ligar a resposta em áudio no agente Iris, que só dispara quando a última mensagem do lead for áudio.
3. **Respeitar a regra de mídia privada**: o áudio gerado continua no bucket privado e o envio ao WhatsApp usa link assinado (já implementado), garantindo que o contato consiga ouvir.
4. **Registro no chat**: a mensagem enviada fica salva como áudio com o texto correspondente, para o time ler no CRM o que a Iris falou.
5. **Teste real**: enviar um áudio de teste pelo fluxo e conferir nos logs que o áudio foi gerado, salvo e entregue.

## Limites e cuidados

- Mensagens muito longas viram áudios longos e caros: o texto será limitado a um tamanho seguro; acima disso a Iris responde em texto.
- Links e valores continuam sendo simplificados na fala (já existe esse tratamento) e a regra de nunca enviar emoji permanece.
- Se a geração de voz falhar, a Iris envia a resposta em texto normalmente (sem deixar o lead sem resposta).

## Detalhes técnicos

- `supabase/functions/nina-orchestrator/index.ts`:
  - `generateAudioElevenLabs`: fallback de chave para `Deno.env.get('ELEVENLABS_API_KEY')` além de `getSecret(vault_elevenlabs_key, settings.elevenlabs_api_key)`.
  - Bloco de decisão (~linha 4351): `shouldSendAudio` passa a considerar `hasElevenLabsKey = env || vault || settings`, mantendo a condição `incomingWasAudio && agentAudioEnabled`.
  - Guarda de tamanho: se `sanitizedText.length` exceder o limite definido, pula o TTS e envia texto.
- Dados: `UPDATE agents SET audio_response_enabled = true WHERE name = 'Iris'` (via ferramenta de dados), mantendo `nina_settings.audio_response_enabled = false`.
- Deploy da função e teste ponta a ponta com verificação dos logs de decisão de áudio.
