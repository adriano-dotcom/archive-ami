
# Diagnóstico e Correção: Chamadas WhatsApp não aparecem no sistema

## Causa Raiz Identificada (3 problemas encadeados)

### Problema 1: O webhook principal ignora eventos de chamada
O `whatsapp-webhook` (endpoint real registrado na Meta) recebe os eventos de `field: "calls"`, mas o código atual só trata:
- `field: "message_template_status_update"`
- `value.statuses` (status de mensagens)
- `value.messages` (mensagens recebidas)

O campo `calls` cai no bloco final sem nenhum tratamento e é descartado.

### Problema 2: O `whatsapp-call-webhook` é uma função separada que a Meta não usa
A função `whatsapp-call-webhook` existe mas não está registrada como endpoint na Meta. A Meta envia tudo para o endpoint único configurado.

### Problema 3: Mapeamento de status incorreto
A Meta envia o campo `event` (ex: `"connect"`, `"terminate"`) dentro do objeto de chamada, não `status`. O mapeamento atual esperava `ringing`, `answered`, etc.

Mapeamento correto:
- `connect` → `ringing` (chamada chegando/conectando)
- `accept` → `answered` (atendida)
- `terminate` / `completed` → `ended`
- `reject` / `cancel` → `rejected`
- `missed` → `missed`

## Arquivos a Modificar

### 1. `supabase/functions/whatsapp-webhook/index.ts`
Adicionar bloco de processamento de `field: "calls"` **antes** do bloco que processa `value.messages`. O bloco irá:
- Detectar quando `changes?.field === 'calls'`
- Iterar sobre `value.calls`
- Mapear `call.event` para os status da tabela `whatsapp_calls`
- Tentar resolver `contact_id` e `conversation_id` pelo número chamador
- Fazer upsert na tabela `whatsapp_calls` (INSERT ou UPDATE com base no `id` da chamada)
- Retornar 200 imediatamente para a Meta

### 2. `src/hooks/useIncomingWhatsAppCall.ts`  
Pequena melhoria: o hook atual só dispara o modal em INSERT com `status === 'ringing'`. Isso está correto. Mas o AudioContext pode ser bloqueado pelo browser pois é criado assincronamente. Corrigir para pré-criar o AudioContext após interação do usuário e reutilizá-lo.

## Implementação Técnica

### Bloco a inserir no `whatsapp-webhook/index.ts` (após o bloco `message_template_status_update`, antes de `value.statuses`):

```typescript
// Handle WhatsApp Call events (field === 'calls')
if (changes?.field === 'calls') {
  const callsList = value.calls ?? [];
  const metadata_phone_number_id = value.metadata?.phone_number_id ?? phoneNumberId;

  for (const call of callsList) {
    const callId: string = call.id ?? '';
    const fromNumber: string = call.from ?? '';
    const toNumber: string = call.to ?? value.metadata?.display_phone_number ?? '';
    const rawEvent: string = (call.event ?? call.status ?? '').toLowerCase();
    const timestamp: string = call.timestamp
      ? new Date(parseInt(call.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    // Map Meta event to internal status
    const eventStatusMap: Record<string, string> = {
      connect: 'ringing',
      ringing: 'ringing',
      initiated: 'ringing',
      accept: 'answered',
      answered: 'answered',
      terminate: 'ended',
      completed: 'ended',
      ended: 'ended',
      reject: 'rejected',
      rejected: 'rejected',
      cancel: 'rejected',
      canceled: 'rejected',
      missed: 'missed',
      failed: 'failed',
    };
    const status = eventStatusMap[rawEvent] ?? 'ringing';

    // Try to resolve contact
    let contactId: string | null = null;
    let conversationId: string | null = null;

    if (fromNumber) {
      const contact = await findContactByPhone(supabase, fromNumber);
      if (contact) {
        contactId = contact.id;
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .eq('is_active', true)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (conv) conversationId = conv.id;
      }
    }

    // Check for existing record by whatsapp_call_id
    const { data: existing } = callId
      ? await supabase.from('whatsapp_calls').select('id, status').eq('whatsapp_call_id', callId).maybeSingle()
      : { data: null };

    if (existing) {
      const updates: Record<string, any> = {
        status,
        metadata: { last_event: rawEvent, last_event_at: timestamp, webhook_body: call },
      };
      if (status === 'answered') updates.answered_at = timestamp;
      if (['ended', 'rejected', 'missed', 'failed'].includes(status)) {
        updates.ended_at = timestamp;
        if (call.duration) updates.duration_seconds = parseInt(call.duration, 10);
      }
      await supabase.from('whatsapp_calls').update(updates).eq('id', existing.id);
    } else {
      await supabase.from('whatsapp_calls').insert({
        whatsapp_call_id: callId || null,
        contact_id: contactId,
        conversation_id: conversationId,
        direction: call.direction === 'USER_INITIATED' ? 'inbound' : 'inbound',
        status,
        phone_number_id: metadata_phone_number_id || null,
        from_number: fromNumber,
        to_number: toNumber,
        started_at: timestamp,
        answered_at: status === 'answered' ? timestamp : null,
        ended_at: ['ended', 'rejected', 'missed', 'failed'].includes(status) ? timestamp : null,
        duration_seconds: call.duration ? parseInt(call.duration, 10) : null,
        metadata: { initial_event: rawEvent, webhook_body: call },
      });
    }
  }

  logEntry.event_type = 'call';
  await saveLogEntry(200);
  return new Response(JSON.stringify({ status: 'call_processed' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

### Correção do AudioContext no hook (`useIncomingWhatsAppCall.ts`)
Criar o AudioContext fora da função `playRingtone` e persistir a referência, para evitar que o browser bloqueie o áudio por falta de interação prévia do usuário.

## Resultado Esperado
Após a correção:
1. Meta envia `event: "connect"` → `whatsapp-webhook` processa → insere registro com `status: "ringing"` → Realtime dispara → hook detecta → modal aparece com toque
2. Chamada encerra (`event: "terminate"`) → UPDATE no registro → modal fecha automaticamente
