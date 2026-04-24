## 🐛 Diagnóstico confirmado

A função `queuePlanVideoIfMentioned` em `supabase/functions/nina-orchestrator/index.ts` está **quebrada em dois pontos** porque referencia uma coluna `media_id` que **não existe**:

| Local | Linha | Problema |
|---|---|---|
| Cooldown anti-spam | `4303` | `.eq('media_id', video.id)` em `messages` → coluna inexistente, query falha/retorna vazio |
| Insert na fila de envio | `4345` | `media_id: video.id` no insert do `send_queue` → coluna inexistente, **insert inteiro falha silenciosamente** |

**Resultado**: vídeo é detectado corretamente (logs mostram `Planos detectados: Órbita Galáxia(user_message)`), mas o `INSERT` no `send_queue` retorna erro PostgreSQL `column "media_id" of relation "send_queue" does not exist` — e como o erro não é propagado, o fluxo segue normal mas **nenhum vídeo é enfileirado**.

## ✅ Correção proposta

### 1. Insert no `send_queue` (linha ~4336-4360)
Mover `media_id` para dentro de `metadata` (JSONB), que é a coluna correta para telemetria:

```typescript
const { error: insertErr } = await supabase
  .from('send_queue')
  .insert({
    conversation_id: conversation.id,
    contact_id: conversation.contact_id,
    content: '',
    from_type: 'nina',
    message_type: 'video',
    media_url: video.file_url,
    // ❌ media_id: video.id,   ← REMOVER (coluna não existe)
    priority: 2,
    scheduled_at: new Date(Date.now() + videoDelay).toISOString(),
    metadata: {
      response_to_message_id: message.id,
      source: 'auto_plan_video',
      plan_label: plan.label,
      plan_category: plan.category,
      video_name: video.name,
      media_id: video.id,        // ✅ vai para JSONB
      agent_id: agent?.id,
      agent_name: agent?.name,
      video_trigger_source: triggerSource,
      video_category_matched: plan.category,
      video_resend_bypass: isResendRequest,
    },
  });

// 🆕 Logar erro para futura observabilidade
if (insertErr) {
  console.error(`[Nina] 🎬 ❌ Falha ao enfileirar vídeo "${video.name}":`, insertErr);
  continue;
}
```

### 2. Query de cooldown (linha ~4297-4310)
Trocar a busca por `messages.media_id` (que não existe) por uma busca **via `media_url`** (campo que ambas as tabelas têm) ou via `metadata->>'media_id'`:

```typescript
if (!isResendRequest) {
  const cooldownAgo = new Date(Date.now() - VIDEO_COOLDOWN_MS).toISOString();
  const { data: recentSends } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('media_url', video.file_url)   // ✅ usa media_url
    .gte('sent_at', cooldownAgo)
    .limit(1);

  if (recentSends && recentSends.length > 0) {
    console.log(`[Nina] 🎬 Vídeo "${video.name}" já enviado nos últimos 30min, pulando`);
    continue;
  }
}
```

### 3. Verificar telemetria de erro adicional
Envolver o loop principal em `try/catch` para garantir que falhas em vídeos **nunca** bloqueiem o envio do texto principal (boa prática defensiva).

### 4. Redeploy
Após edição, fazer deploy da edge function `nina-orchestrator` e validar com nova conversa.

## 🧪 Validação pós-deploy
1. Enviar mensagem de teste mencionando "Órbita Galáxia" em conversa nova
2. Conferir nos logs: `[Nina] 🎬 Planos detectados: Órbita Galáxia` **e** ausência de erro de insert
3. Conferir tabela `send_queue` — deve haver registro `message_type='video'` com `media_url` preenchida
4. Confirmar que o vídeo chega ao WhatsApp **antes** do texto

## 📋 Arquivos a editar
- `supabase/functions/nina-orchestrator/index.ts` (apenas a função `queuePlanVideoIfMentioned`)

## ⚠️ Nada além disso
Não há mudanças de schema, migrations, RLS ou prompt. É uma correção pontual de bug de schema mismatch.