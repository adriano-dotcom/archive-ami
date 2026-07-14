import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

// Verify Meta X-Hub-Signature-256 (HMAC-SHA256 of the raw body using the WhatsApp App Secret)
async function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 120/min per IP
  {
    const _rlIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const _rlClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: _rlAllowed } = await _rlClient.rpc('check_rate_limit', {
      _key: `wa-call-webhook:${_rlIp}`, _max: 120, _window_seconds: 60,
    });
    if (_rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }
  }


  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // GET: Meta webhook verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_verify_token')
      .maybeSingle();

    const verifyToken = settings?.whatsapp_verify_token || 'webhook-verify-token';

    console.log('[whatsapp-call-webhook] Verification attempt:', { mode, token, challenge });

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[whatsapp-call-webhook] Webhook verified');
      return new Response(challenge, { status: 200 });
    }

    console.error('[whatsapp-call-webhook] Verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // POST: process call events from Meta
  try {
    const rawBody = await req.text();

    // Verify Meta signature when the app secret is configured
    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
    if (appSecret) {
      const valid = await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret);
      if (!valid) {
        console.error('[whatsapp-call-webhook] Invalid signature - rejecting payload');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      console.warn('[whatsapp-call-webhook] WHATSAPP_APP_SECRET not set - skipping signature verification');
    }

    const body = JSON.parse(rawBody || '{}');
    console.log('[whatsapp-call-webhook] Received payload:', JSON.stringify(body, null, 2));

    const entries = body?.entry ?? [];

    for (const entry of entries) {
      const changes = entry?.changes ?? [];

      for (const change of changes) {
        if (change.field !== 'calls') continue;

        const value = change.value ?? {};
        const phoneNumberId: string = value?.metadata?.phone_number_id ?? '';
        const calls: any[] = value?.calls ?? [];

        for (const call of calls) {
          const callId: string = call.call_id ?? call.id ?? '';
          const fromNumber: string = call.from ?? '';
          const toNumber: string = call.to ?? value?.metadata?.display_phone_number ?? '';
          const rawStatus: string = (call.status ?? '').toLowerCase();
          const timestamp: string = call.timestamp
            ? new Date(parseInt(call.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          console.log('[whatsapp-call-webhook] Processing call event:', {
            callId,
            fromNumber,
            toNumber,
            rawStatus,
            phoneNumberId,
          });

          // Normalize status
          const statusMap: Record<string, string> = {
            ringing: 'ringing',
            answered: 'answered',
            ended: 'ended',
            rejected: 'rejected',
            missed: 'missed',
            failed: 'failed',
            initiated: 'ringing',
            completed: 'ended',
            canceled: 'rejected',
          };
          const status = statusMap[rawStatus] ?? 'ringing';

          // Try to resolve contact from fromNumber
          let contactId: string | null = null;
          let conversationId: string | null = null;

          if (fromNumber) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('id')
              .or(`phone_number.eq.${fromNumber},whatsapp_id.eq.${fromNumber}`)
              .maybeSingle();

            if (contact) {
              contactId = contact.id;

              // Find the most recent active conversation for this contact
              const { data: conversation } = await supabase
                .from('conversations')
                .select('id')
                .eq('contact_id', contactId)
                .eq('is_active', true)
                .order('last_message_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (conversation) {
                conversationId = conversation.id;
              }
            }
          }

          // Upsert whatsapp_call record keyed by whatsapp_call_id
          const { data: existing } = callId
            ? await supabase
                .from('whatsapp_calls')
                .select('id, status')
                .eq('whatsapp_call_id', callId)
                .maybeSingle()
            : { data: null };

          if (existing) {
            // Update existing record
            const updates: Record<string, any> = {
              status,
              metadata: { last_event: rawStatus, last_event_at: timestamp, webhook_body: call },
            };

            if (status === 'answered' && !existing.status.includes('answered')) {
              updates.answered_at = timestamp;
            }
            if (['ended', 'rejected', 'missed', 'failed'].includes(status)) {
              updates.ended_at = timestamp;
              if (call.duration) {
                updates.duration_seconds = parseInt(call.duration, 10);
              }
              if (call.hangup_cause || call.reason) {
                updates.hangup_cause = call.hangup_cause ?? call.reason;
              }
            }

            await supabase
              .from('whatsapp_calls')
              .update(updates)
              .eq('id', existing.id);

            console.log('[whatsapp-call-webhook] Updated call record:', existing.id, '->', status);
          } else {
            // Insert new record
            const { error: insertError } = await supabase
              .from('whatsapp_calls')
              .insert({
                whatsapp_call_id: callId || null,
                contact_id: contactId,
                conversation_id: conversationId,
                direction: 'inbound',
                status,
                phone_number_id: phoneNumberId || null,
                from_number: fromNumber,
                to_number: toNumber,
                started_at: timestamp,
                answered_at: status === 'answered' ? timestamp : null,
                ended_at: ['ended', 'rejected', 'missed', 'failed'].includes(status) ? timestamp : null,
                duration_seconds: call.duration ? parseInt(call.duration, 10) : null,
                hangup_cause: call.hangup_cause ?? call.reason ?? null,
                metadata: { initial_event: rawStatus, webhook_body: call },
              });

            if (insertError) {
              console.error('[whatsapp-call-webhook] Insert error:', insertError);
            } else {
              console.log('[whatsapp-call-webhook] Created new call record for callId:', callId);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[whatsapp-call-webhook] Error:', error);
    // Return 200 to prevent Meta from retrying
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
