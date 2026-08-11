# Corrigir áudios que não tocam no chat

## Diagnóstico (confirmado agora)

1. **Áudios da Iris (roxos) não tocam.** O bucket privado `nina-audio` não tem nenhuma política de leitura para usuários autenticados — só o service role escreve/apaga. Por isso o chat falha ao assinar a URL e o console mostra `Object not found (404)` para arquivos como `a97ee94f-.../1786408534109.mp3`, que existem no storage (267 KB).
2. **Áudios recebidos mostram `0:00 / 0:00`.** São arquivos `.ogg` (Opus) do WhatsApp; a leitura funciona (o bucket `whatsapp-media` tem política de leitura para staff), mas esses arquivos não trazem a duração no cabeçalho, então o player exibe zero até tocar até o fim.

## O que será feito

**1. Liberar leitura do áudio da Iris**
- Criar política de leitura no bucket `nina-audio` para a equipe (admin, operador e membro ativo de time), no mesmo padrão já usado em `whatsapp-media`. Sem isso nenhum áudio gerado pela Iris toca no CRM.

**2. Player de áudio mais robusto**
- Quando a duração vier vazia/infinita (caso dos `.ogg` do WhatsApp), o player passa a estimar a duração assim que o áudio começa a carregar e exibe o tempo corrido corretamente em vez de `0:00 / 0:00`.
- Mostrar estado de erro visível no player quando o arquivo realmente não puder ser carregado, em vez de um botão que não faz nada.

**3. Verificação**
- Abrir a conversa do Adriano e conferir: áudio recebido toca com tempo correndo, áudio da Iris toca sem erro no console.

## Detalhes técnicos

- Migração: `CREATE POLICY "Staff can read nina-audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'nina-audio' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'operator') OR is_authenticated_team_member()))`.
- `src/components/AudioPlayer.tsx`: tratar `duration` `Infinity`/`NaN` (seek para `1e101` no `loadedmetadata` para forçar o cálculo, depois voltar a 0), usar `durationchange` e `onError` para expor falha de carregamento.
- Nenhuma mudança em `src/lib/mediaUrl.ts` — a assinatura de URL já está correta; o bloqueio era só de permissão.
