## Diagnóstico

Logs do `nina-orchestrator` mostram que as respostas da Orbi estão sendo cortadas pela API do Lovable AI Gateway com `finishReason: "length"` e `contentLength: 117–154` caracteres — apesar do `max_tokens: 1000`.

Causa raiz: o sistema está configurado em `ai_model_mode = 'pro3'`, que usa **`google/gemini-3-pro-preview`** (modelo de reasoning). Esses modelos consomem 70–90% do orçamento de tokens em raciocínio interno invisível, sobrando muito pouco para o texto visível ao tutor. Resultado: mensagens cortadas no meio (ex: "Por…").

A função `breakMessageIntoChunks` apenas divide por `\n\n`, ela **não trunca** — o problema está 100% na geração da IA.

## Mudanças

### 1. `supabase/functions/nina-orchestrator/index.ts` — trocar modelo padrão

Em `getModelSettings` (linha 4823), trocar o caso `'pro3'` para usar **`google/gemini-3-flash-preview`** (recomendado pela Lovable AI):

```ts
case 'pro3':
  return { model: 'google/gemini-3-flash-preview', temperature: 0.7 };
```

Justificativa: rápido (<2s), sem reasoning oculto, mantém qualidade alta para conversação de vendas. O `default` também passa a apontar para `gemini-3-flash-preview` para consistência.

### 2. Aumentar `max_tokens` de 1000 → 2500

Nas duas chamadas principais à IA e seus fallbacks:
- Linha ~3721 (chamada handoff)
- Linha ~3759 (fallback handoff)
- Linha ~3841 (chamada principal)
- Linha ~3890 (fallback principal)

Margem extra para mensagens mais longas sobre planos sem risco de corte.

### 3. Auto-retry quando `finishReason === 'length'`

No bloco de log "AI Response Debug" (linha ~3862), após verificar a resposta, adicionar:

```ts
if (aiData.choices?.[0]?.finish_reason === 'length') {
  console.warn('[Nina] ⚠️ Resposta truncada (finish_reason=length), refazendo com max_tokens=4000');
  const retryResponse = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiSettings.model,
      messages: [{ role: 'system', content: processedPrompt }, ...conversationHistory],
      temperature: aiSettings.temperature,
      max_tokens: 4000
    })
  });
  if (retryResponse.ok) {
    const retryData = await retryResponse.json();
    const retryContent = retryData.choices?.[0]?.message?.content;
    if (retryContent && retryData.choices[0].finish_reason !== 'length') {
      aiContent = retryContent;
      console.log('[Nina] ✅ Retry bem-sucedido, conteúdo completo recuperado');
    }
  }
}
```

Mesma lógica aplicada após a chamada de handoff (linha ~3739).

### 4. Deploy

Redeploy automático da função `nina-orchestrator` após as edições.

### 5. Validação

Após deploy, testar enviando "quero saber sobre o galáxia" no chat e confirmar nos logs:
- `model: "google/gemini-3-flash-preview"`
- `finishReason: "stop"` (não mais `"length"`)
- `contentLength` > 300
- Vídeo do plano Galáxia + texto completo chegando ao tutor

## Arquivos editados
- `supabase/functions/nina-orchestrator/index.ts` (4 ajustes de `max_tokens`, 1 mudança em `getModelSettings`, 2 blocos de auto-retry)

## Não muda
- Prompt do agente Orbi no banco — continua o mesmo
- Lógica de chunking / fragmentação de mensagens
- Lógica de envio de vídeo automático dos planos
- Configuração de WhatsApp / send_queue