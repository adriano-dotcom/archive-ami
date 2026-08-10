import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
};

async function _checkPublicRateLimit(req: Request, keyPrefix: string, max = 120, windowSeconds = 60) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data } = await client.rpc('check_rate_limit', { _key: `${keyPrefix}:${ip}`, _max: max, _window_seconds: windowSeconds });
  return data !== false;
}


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

// Mapeamento de DDDs brasileiros para estados e cidades
const dddMap: Record<string, { city: string; state: string }> = {
  '11': { city: 'São Paulo', state: 'SP' }, '12': { city: 'São José dos Campos', state: 'SP' },
  '13': { city: 'Santos', state: 'SP' }, '14': { city: 'Bauru', state: 'SP' },
  '15': { city: 'Sorocaba', state: 'SP' }, '16': { city: 'Ribeirão Preto', state: 'SP' },
  '17': { city: 'São José do Rio Preto', state: 'SP' }, '18': { city: 'Presidente Prudente', state: 'SP' },
  '19': { city: 'Campinas', state: 'SP' }, '21': { city: 'Rio de Janeiro', state: 'RJ' },
  '22': { city: 'Campos dos Goytacazes', state: 'RJ' }, '24': { city: 'Petrópolis', state: 'RJ' },
  '27': { city: 'Vitória', state: 'ES' }, '28': { city: 'Cachoeiro de Itapemirim', state: 'ES' },
  '31': { city: 'Belo Horizonte', state: 'MG' }, '32': { city: 'Juiz de Fora', state: 'MG' },
  '33': { city: 'Governador Valadares', state: 'MG' }, '34': { city: 'Uberlândia', state: 'MG' },
  '35': { city: 'Poços de Caldas', state: 'MG' }, '37': { city: 'Divinópolis', state: 'MG' },
  '38': { city: 'Montes Claros', state: 'MG' }, '41': { city: 'Curitiba', state: 'PR' },
  '42': { city: 'Ponta Grossa', state: 'PR' }, '43': { city: 'Londrina', state: 'PR' },
  '44': { city: 'Maringá', state: 'PR' }, '45': { city: 'Cascavel', state: 'PR' },
  '46': { city: 'Francisco Beltrão', state: 'PR' }, '47': { city: 'Joinville', state: 'SC' },
  '48': { city: 'Florianópolis', state: 'SC' }, '49': { city: 'Chapecó', state: 'SC' },
  '51': { city: 'Porto Alegre', state: 'RS' }, '53': { city: 'Pelotas', state: 'RS' },
  '54': { city: 'Caxias do Sul', state: 'RS' }, '55': { city: 'Santa Maria', state: 'RS' },
  '61': { city: 'Brasília', state: 'DF' }, '62': { city: 'Goiânia', state: 'GO' },
  '64': { city: 'Rio Verde', state: 'GO' }, '63': { city: 'Palmas', state: 'TO' },
  '65': { city: 'Cuiabá', state: 'MT' }, '66': { city: 'Rondonópolis', state: 'MT' },
  '67': { city: 'Campo Grande', state: 'MS' }, '68': { city: 'Rio Branco', state: 'AC' },
  '69': { city: 'Porto Velho', state: 'RO' }, '71': { city: 'Salvador', state: 'BA' },
  '73': { city: 'Ilhéus', state: 'BA' }, '74': { city: 'Juazeiro', state: 'BA' },
  '75': { city: 'Feira de Santana', state: 'BA' }, '77': { city: 'Vitória da Conquista', state: 'BA' },
  '79': { city: 'Aracaju', state: 'SE' }, '81': { city: 'Recife', state: 'PE' },
  '87': { city: 'Petrolina', state: 'PE' }, '82': { city: 'Maceió', state: 'AL' },
  '83': { city: 'João Pessoa', state: 'PB' }, '84': { city: 'Natal', state: 'RN' },
  '85': { city: 'Fortaleza', state: 'CE' }, '88': { city: 'Juazeiro do Norte', state: 'CE' },
  '86': { city: 'Teresina', state: 'PI' }, '89': { city: 'Picos', state: 'PI' },
  '98': { city: 'São Luís', state: 'MA' }, '99': { city: 'Imperatriz', state: 'MA' },
  '91': { city: 'Belém', state: 'PA' }, '93': { city: 'Santarém', state: 'PA' },
  '94': { city: 'Marabá', state: 'PA' }, '92': { city: 'Manaus', state: 'AM' },
  '97': { city: 'Parintins', state: 'AM' }, '95': { city: 'Boa Vista', state: 'RR' },
  '96': { city: 'Macapá', state: 'AP' },
};

function getRegionFromDDD(phoneNumber: string): { city: string; state: string } | null {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const ddd = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2, 4) : digits.substring(0, 2);
  return dddMap[ddd] || null;
}

// Normalize Brazilian phone number to consistent format
function normalizePhone(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // If starts with 55 (Brazil country code)
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }
  
  // If doesn't have country code, add it
  if (digits.length >= 10 && digits.length <= 11) {
    return '55' + digits;
  }
  
  return digits;
}

// Generate phone variants for flexible search (Brazilian mobile numbers)
// This is critical to match contacts when WhatsApp returns a different format than stored
function getPhoneVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const variants = new Set<string>();
  variants.add(normalized);
  
  // Only process if it looks like a Brazilian number (55 + DDD + number)
  if (!normalized.startsWith('55') || normalized.length < 12) {
    return Array.from(variants);
  }
  
  const ddd = normalized.substring(2, 4);
  const rest = normalized.substring(4);
  
  // If 9 digits after DDD (new mobile format with 9), also try without the 9
  if (rest.length === 9 && rest.startsWith('9')) {
    const withoutNine = '55' + ddd + rest.substring(1);
    variants.add(withoutNine);
    // Also add without country code
    variants.add(ddd + rest);
    variants.add(ddd + rest.substring(1));
  }
  
  // If 8 digits after DDD (old format or landline), also try with 9 prefix
  if (rest.length === 8) {
    const withNine = '55' + ddd + '9' + rest;
    variants.add(withNine);
    // Also add without country code
    variants.add(ddd + rest);
    variants.add(ddd + '9' + rest);
  }
  
  console.log('[Webhook] Phone variants for', phone, ':', Array.from(variants));
  return Array.from(variants);
}

// Find contact by phone OR whatsapp_id with flexible matching
// IMPORTANT: This function handles the case where WhatsApp returns a different phone format
// than what's stored in the database (e.g., 554399145000 vs 5543999145000)
async function findContactByPhone(supabase: any, phoneNumber: string): Promise<any | null> {
  const variants = getPhoneVariants(phoneNumber);
  
  // First, try to find by whatsapp_id (most reliable - doesn't change with phone format)
  // Search across ALL variants to handle format differences
  const { data: contactsByWaId, error: waIdError } = await supabase
    .from('contacts')
    .select('*, conversations:conversations(id, is_active, updated_at, status)')
    .in('whatsapp_id', variants);
  
  if (waIdError) {
    console.error('[Webhook] Error searching contacts by whatsapp_id:', waIdError);
  }
  
  if (contactsByWaId && contactsByWaId.length > 0) {
    // If multiple contacts found, prioritize the one with most recent active conversation
    if (contactsByWaId.length > 1) {
      console.log(`[Webhook] Found ${contactsByWaId.length} contacts by whatsapp_id variants, selecting best match`);
      
      // Sort: active conversations first, then by most recent update
      contactsByWaId.sort((a: any, b: any) => {
        const aActiveConv = a.conversations?.find((c: any) => c.is_active);
        const bActiveConv = b.conversations?.find((c: any) => c.is_active);
        
        // Prioritize contacts with active conversations
        if (aActiveConv && !bActiveConv) return -1;
        if (!aActiveConv && bActiveConv) return 1;
        
        // Both have active or both don't - compare by most recent conversation
        const aLatest = a.conversations?.reduce((max: any, c: any) => 
          !max || new Date(c.updated_at) > new Date(max.updated_at) ? c : max, null);
        const bLatest = b.conversations?.reduce((max: any, c: any) => 
          !max || new Date(c.updated_at) > new Date(max.updated_at) ? c : max, null);
        
        if (aLatest && bLatest) {
          return new Date(bLatest.updated_at).getTime() - new Date(aLatest.updated_at).getTime();
        }
        return aLatest ? -1 : bLatest ? 1 : 0;
      });
    }
    
    const contact = contactsByWaId[0];
    console.log('[Webhook] Found existing contact by whatsapp_id:', contact.id, 'name:', contact.name);
    return contact;
  }
  
  // Then try by phone variants (for backwards compatibility)
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('*, conversations:conversations(id, is_active, updated_at, status)')
    .in('phone_number', variants);
  
  if (error) {
    console.error('[Webhook] Error searching contacts:', error);
    return null;
  }
  
  if (contacts && contacts.length > 0) {
    // If multiple contacts found, prioritize the one with most recent active conversation
    if (contacts.length > 1) {
      console.log(`[Webhook] Found ${contacts.length} contacts by phone variants, selecting best match`);
      
      contacts.sort((a: any, b: any) => {
        const aActiveConv = a.conversations?.find((c: any) => c.is_active);
        const bActiveConv = b.conversations?.find((c: any) => c.is_active);
        
        if (aActiveConv && !bActiveConv) return -1;
        if (!aActiveConv && bActiveConv) return 1;
        
        const aLatest = a.conversations?.reduce((max: any, c: any) => 
          !max || new Date(c.updated_at) > new Date(max.updated_at) ? c : max, null);
        const bLatest = b.conversations?.reduce((max: any, c: any) => 
          !max || new Date(c.updated_at) > new Date(max.updated_at) ? c : max, null);
        
        if (aLatest && bLatest) {
          return new Date(bLatest.updated_at).getTime() - new Date(aLatest.updated_at).getTime();
        }
        return aLatest ? -1 : bLatest ? 1 : 0;
      });
    }
    
    const contact = contacts[0];
    console.log('[Webhook] Found existing contact with phone variant:', contact.phone_number, 'name:', contact.name);
    
    // Update whatsapp_id if not set (for older contacts)
    if (!contact.whatsapp_id && phoneNumber) {
      await supabase
        .from('contacts')
        .update({ whatsapp_id: phoneNumber })
        .eq('id', contact.id);
      console.log('[Webhook] Updated whatsapp_id for contact:', contact.id);
    }
    
    return contact;
  }
  
  return null;
}

// Transcribe audio using ElevenLabs Scribe v1
async function transcribeAudio(
  audioBuffer: ArrayBuffer, 
  mimeType: string,
  supabase: any
): Promise<string | null> {
  try {
    // Get ElevenLabs API key from settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('elevenlabs_api_key')
      .maybeSingle();

    if (!settings?.elevenlabs_api_key) {
      console.log('[Webhook] ElevenLabs API key not configured, skipping transcription');
      return null;
    }

    console.log('[Webhook] Transcribing audio with ElevenLabs, size:', audioBuffer.byteLength, 'bytes');

    const formData = new FormData();
    const extension = mimeType.split('/')[1]?.replace('ogg; codecs=opus', 'ogg') || 'ogg';
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model_id', 'scribe_v1');

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': settings.elevenlabs_api_key },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Webhook] ElevenLabs STT error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    const transcription = result.text?.trim() || null;
    
    if (transcription) {
      console.log('[Webhook] Transcription result:', transcription.substring(0, 100));
    }
    
    return transcription;
  } catch (error) {
    console.error('[Webhook] Error transcribing audio:', error);
    return null;
  }
}

serve(async (req) => {
  const startTime = Date.now();
  const url = new URL(req.url);

  // Rate limit: 300/min per IP (Meta legitimately sends bursts)
  if (!(await _checkPublicRateLimit(req, 'wa-webhook', 300, 60))) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  
  // Log ALL incoming requests for debugging
  console.log('[Webhook] ========== REQUEST RECEIVED ==========');
  console.log('[Webhook] Method:', req.method);
  console.log('[Webhook] URL:', req.url);
  console.log('[Webhook] Timestamp:', new Date().toISOString());
  console.log('[Webhook] Headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Prepare log entry for database - will be updated throughout processing
  const logEntry: Record<string, any> = {
    method: req.method,
    path: url.pathname,
    query_params: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(req.headers.entries()),
    body: null,
    source_ip: req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    user_agent: req.headers.get('user-agent'),
    response_status: 200,
    processing_time_ms: 0,
    event_type: 'unknown',
    is_meta_test: false,
    error_message: null
  };

  // Helper function to save log entry
  const saveLogEntry = async (responseStatus: number) => {
    logEntry.response_status = responseStatus;
    logEntry.processing_time_ms = Date.now() - startTime;
    try {
      await supabase.from('webhook_request_logs').insert(logEntry);
    } catch (e) {
      console.error('[Webhook] Failed to save log entry:', e);
    }
  };

  try {
    // GET request = Webhook verification from WhatsApp
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // Get verify token from settings
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_verify_token')
        .maybeSingle();

      const verifyToken = settings?.whatsapp_verify_token || 'webhook-verify-token';

      // Enhanced logging for verification attempts
      console.log('[Webhook] Verification attempt details:', {
        mode,
        receivedToken: token,
        expectedToken: verifyToken,
        tokensMatch: token === verifyToken,
        challenge: challenge ? challenge.substring(0, 20) + '...' : null,
        hasChallenge: !!challenge
      });

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] ✅ Verification SUCCESSFUL - returning challenge');
        logEntry.event_type = 'verification';
        await saveLogEntry(200);
        return new Response(challenge, { status: 200, headers: corsHeaders });
      } else {
        console.error('[Webhook] ❌ Verification FAILED - token mismatch or wrong mode');
        console.error('[Webhook] Expected token:', verifyToken);
        console.error('[Webhook] Received token:', token);
        console.error('[Webhook] Mode:', mode);
        logEntry.event_type = 'verification';
        logEntry.error_message = 'Token mismatch or wrong mode';
        await saveLogEntry(403);
        return new Response('Forbidden', { status: 403, headers: corsHeaders });
      }
    }

    // POST request = Incoming message from WhatsApp
    if (req.method === 'POST') {
      const rawBody = await req.text();

      // Verify Meta signature when the app secret is configured
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
      if (appSecret) {
        const valid = await verifyMetaSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret);
        if (!valid) {
          console.error('[Webhook] ❌ Invalid signature - rejecting payload');
          logEntry.event_type = 'invalid_signature';
          logEntry.error_message = 'Invalid X-Hub-Signature-256';
          await saveLogEntry(401);
          return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        console.warn('[Webhook] WHATSAPP_APP_SECRET not set - skipping signature verification');
      }

      const body = JSON.parse(rawBody || '{}');
      console.log('[Webhook] Received payload:', JSON.stringify(body, null, 2));
      
      // Store body in log entry
      logEntry.body = body;

      // Extract message data from WhatsApp Cloud API format
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      if (!value) {
        console.log('[Webhook] No value in payload, ignoring');
        logEntry.event_type = 'empty_payload';
        await saveLogEntry(200);
        return new Response(JSON.stringify({ status: 'ignored' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      const messages = value.messages;
      const contacts = value.contacts;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Handle template status updates (message_template_status_update webhook field)
      if (changes?.field === 'message_template_status_update') {
        console.log('[Webhook] Template status update received:', JSON.stringify(value));
        
        const event = value.event; // APPROVED, REJECTED, DISABLED, FLAGGED, PENDING_DELETION, etc.
        const templateId = value.message_template_id;
        const templateName = value.message_template_name;
        const templateLanguage = value.message_template_language;
        const reason = value.reason;
        
        // Get previous status from template
        const { data: existingTemplate } = await supabase
          .from('whatsapp_templates')
          .select('id, status')
          .eq('meta_template_id', String(templateId))
          .maybeSingle();
        
        // Map event to status
        const statusMap: Record<string, string> = {
          'APPROVED': 'APPROVED',
          'REJECTED': 'REJECTED',
          'DISABLED': 'DISABLED',
          'FLAGGED': 'PENDING',
          'PENDING_DELETION': 'DISABLED'
        };
        
        const newStatus = statusMap[event] || event;
        
        // Update template status in whatsapp_templates table
        if (existingTemplate) {
          await supabase
            .from('whatsapp_templates')
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingTemplate.id);
          
          console.log(`[Webhook] Updated template ${templateName} status to ${newStatus}`);
        } else {
          console.log(`[Webhook] Template ${templateName} (${templateId}) not found in database`);
        }
        
        // Create notification record
        const notificationData = {
          template_id: existingTemplate?.id || null,
          meta_template_id: String(templateId),
          template_name: templateName || 'Template Desconhecido',
          template_language: templateLanguage || null,
          previous_status: existingTemplate?.status || null,
          new_status: newStatus,
          event_type: event,
          reason: reason || null,
          rejection_reason: value.other_info?.rejection_reason || null,
          rejection_recommendation: value.other_info?.recommendation || null,
          disable_date: value.other_info?.disable_date ? new Date(value.other_info.disable_date).toISOString() : null
        };
        
        const { error: notifError } = await supabase
          .from('template_status_notifications')
          .insert(notificationData);
        
        if (notifError) {
          console.error('[Webhook] Error creating notification:', notifError);
        } else {
          console.log(`[Webhook] Created notification for template ${templateName} - ${event}`);
        }
        
        logEntry.event_type = 'template_status';
        await saveLogEntry(200);
        return new Response(JSON.stringify({ status: 'template_status_processed' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Handle WhatsApp Call events (field === 'calls')
      if (changes?.field === 'calls') {
        const callsList = value.calls ?? [];
        const metaPhoneNumberId = value.metadata?.phone_number_id ?? phoneNumberId;

        console.log('[Webhook] Processing call events, count:', callsList.length);

        for (const call of callsList) {
          const callId: string = call.id ?? call.call_id ?? '';
          const fromNumber: string = call.from ?? '';
          const toNumber: string = call.to ?? value.metadata?.display_phone_number ?? '';
          const rawEvent: string = (call.event ?? call.status ?? '').toLowerCase();
          const timestamp: string = call.timestamp
            ? new Date(parseInt(call.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          console.log('[Webhook] Call event:', { callId, fromNumber, toNumber, rawEvent });

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
              metadata: { last_event: rawEvent, last_event_at: timestamp, webhook_body: call, sdp_offer: call.session?.sdp || null, sdp_type: call.session?.sdp_type || null },
            };
            if (status === 'answered') updates.answered_at = timestamp;
            if (['ended', 'rejected', 'missed', 'failed'].includes(status)) {
              updates.ended_at = timestamp;
              if (call.duration) updates.duration_seconds = parseInt(call.duration, 10);
            }
            await supabase.from('whatsapp_calls').update(updates).eq('id', existing.id);
            console.log('[Webhook] Updated whatsapp_call:', existing.id, '->', status);
          } else {
            const { error: insertError } = await supabase.from('whatsapp_calls').insert({
              whatsapp_call_id: callId || null,
              contact_id: contactId,
              conversation_id: conversationId,
              direction: 'inbound',
              status,
              phone_number_id: metaPhoneNumberId || null,
              from_number: fromNumber,
              to_number: toNumber,
              started_at: timestamp,
              answered_at: status === 'answered' ? timestamp : null,
              ended_at: ['ended', 'rejected', 'missed', 'failed'].includes(status) ? timestamp : null,
              duration_seconds: call.duration ? parseInt(call.duration, 10) : null,
              metadata: { initial_event: rawEvent, webhook_body: call, sdp_offer: call.session?.sdp || null, sdp_type: call.session?.sdp_type || null },
            });
            if (insertError) {
              console.error('[Webhook] Error inserting whatsapp_call:', insertError);
            } else {
              console.log('[Webhook] Inserted new whatsapp_call with status:', status, 'from:', fromNumber);
            }
          }
        }

        logEntry.event_type = 'call';
        await saveLogEntry(200);
        return new Response(JSON.stringify({ status: 'call_processed' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Handle status updates (delivered, read, etc)
      if (value.statuses) {
        for (const status of value.statuses) {
          console.log('[Webhook] Status update:', status);
          
          // Update message status in database
          if (status.id) {
            const statusMap: Record<string, string> = {
              'sent': 'sent',
              'delivered': 'delivered',
              'read': 'read',
              'failed': 'failed'
            };
            
            const newStatus = statusMap[status.status];
            if (newStatus) {
              const updateData: Record<string, any> = { 
                status: newStatus,
                ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
                ...(newStatus === 'read' && { read_at: new Date().toISOString() })
              };
              
              // Prepare error message for failed status
              let errorMessage: string | null = null;
              
              // Save WhatsApp error details when status is 'failed'
              if (newStatus === 'failed' && status.errors && status.errors.length > 0) {
                console.log('[Webhook] Message failed with errors:', JSON.stringify(status.errors));
                
                errorMessage = status.errors[0]?.title || status.errors[0]?.message || 'Erro de entrega';
                
                // Get existing metadata to merge with error info
                const { data: existingMsg } = await supabase
                  .from('messages')
                  .select('metadata')
                  .eq('whatsapp_message_id', status.id)
                  .maybeSingle();
                
                updateData.metadata = {
                  ...(existingMsg?.metadata || {}),
                  whatsapp_error: {
                    code: status.errors[0]?.code,
                    title: status.errors[0]?.title,
                    message: status.errors[0]?.message,
                    details: status.errors[0]?.error_data?.details
                  }
                };
              }
              
              // Update messages table and get the message ID
              const { data: updatedMessage, error: msgError } = await supabase
                .from('messages')
                .update(updateData)
                .eq('whatsapp_message_id', status.id)
                .select('id')
                .maybeSingle();
              
              if (msgError) {
                console.error('[Webhook] Error updating message:', msgError);
              }
              
              // Sync status to collection_attempts table
              if (updatedMessage?.id) {
                const attemptUpdate: Record<string, any> = {
                  status: newStatus,
                  ...(newStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
                  ...(newStatus === 'read' && { read_at: new Date().toISOString() }),
                  ...(newStatus === 'failed' && errorMessage && { error_message: errorMessage })
                };
                
                const { error: attemptError } = await supabase
                  .from('collection_attempts')
                  .update(attemptUpdate)
                  .eq('message_id', updatedMessage.id);
                
                if (attemptError) {
                  console.log('[Webhook] No collection_attempt found for message (this is normal for non-collection messages):', updatedMessage.id);
                } else {
                  console.log(`[Webhook] Synced status '${newStatus}' to collection_attempts for message ${updatedMessage.id}`);
                }
              }
            }
          }
        }
        logEntry.event_type = 'status';
        await saveLogEntry(200);
        return new Response(JSON.stringify({ status: 'processed_statuses' }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }

      // Get settings for audio transcription
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_access_token')
        .maybeSingle();

      // Process incoming messages
      if (messages && messages.length > 0) {
        // Known Meta test/example phone numbers - detect and log clearly
        const metaTestNumbers = ['16315551181', '16505551234', '15551234567', '123456789'];
        
        for (const message of messages) {
          const contactInfo = contacts?.find((c: any) => c.wa_id === message.from);
          const fromNumber = message.from || '';
          const isTestMessage = metaTestNumbers.some(n => fromNumber.includes(n)) || 
                                phoneNumberId === '123456123' || 
                                phoneNumberId === '123456789012345';
          
          // Update log entry for message type
          logEntry.event_type = 'message';
          logEntry.is_meta_test = isTestMessage;
          
          // Enhanced logging to distinguish real vs test messages
          console.log('[Webhook] ==================== MESSAGE RECEIVED ====================');
          console.log('[Webhook] Type:', isTestMessage ? '⚠️ META TEST MESSAGE' : '✅ REAL CUSTOMER MESSAGE');
          console.log('[Webhook] From wa_id:', message.from);
          console.log('[Webhook] Phone Number ID:', phoneNumberId);
          console.log('[Webhook] Message ID:', message.id);
          console.log('[Webhook] Message Type:', message.type);
          console.log('[Webhook] Contact Name:', contactInfo?.profile?.name || 'Unknown');
          console.log('[Webhook] Timestamp:', new Date().toISOString());
          
          if (isTestMessage) {
            console.log('[Webhook] ⚠️ This appears to be a Meta test/example message, not a real customer.');
            console.log('[Webhook] ⚠️ Test numbers detected:', { fromNumber, phoneNumberId });
          }
          
          // Insert into message_grouping_queue for deduplication and grouping
          const { error: queueError } = await supabase
            .from('message_grouping_queue')
            .insert({
              whatsapp_message_id: message.id,
              phone_number_id: phoneNumberId,
              message_data: message,
              contacts_data: contactInfo || null
            });

          if (queueError) {
            // If duplicate key error, message was already received
            if (queueError.code === '23505') {
              console.log('[Webhook] Duplicate message ignored:', message.id);
            } else {
              console.error('[Webhook] Queue insert error:', queueError);
            }
          } else {
            console.log('[Webhook] Message queued successfully:', message.id);
            
            // Process the message immediately
            await processIncomingMessage(supabase, message, contactInfo, phoneNumberId, settings, lovableApiKey);
          }
        }
      }

      // Save log and return
      if (logEntry.event_type === 'unknown') {
        logEntry.event_type = messages?.length > 0 ? 'message' : 'other';
      }
      await saveLogEntry(200);
      return new Response(JSON.stringify({ status: 'processed' }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    logEntry.event_type = 'method_not_allowed';
    logEntry.error_message = 'Method not allowed';
    await saveLogEntry(405);
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logEntry.error_message = errorMessage;
    await saveLogEntry(500);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});

// Extract text from image using Gemini Vision OCR
async function extractTextFromImage(
  imageBuffer: ArrayBuffer,
  mimeType: string,
  lovableApiKey: string
): Promise<string | null> {
  try {
    console.log('[OCR] Starting image text extraction, size:', imageBuffer.byteLength, 'bytes');
    
    // Convert ArrayBuffer to base64
    const base64Image = base64Encode(imageBuffer);
    
    // Call Gemini Vision to extract text
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            },
            {
              type: 'text',
              text: 'Extraia TODO o texto visível nesta imagem. Se houver números de CNPJ, CPF, telefone ou endereços, extraia-os com precisão. Retorne APENAS o texto extraído, sem explicações ou comentários adicionais. Se não conseguir ler nenhum texto, responda apenas: [imagem sem texto legível]'
            }
          ]
        }],
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR] Gemini Vision error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content?.trim();

    if (extractedText && extractedText !== '[imagem sem texto legível]') {
      console.log('[OCR] Texto extraído com sucesso:', extractedText.substring(0, 100) + '...');
      return extractedText;
    }
    
    console.log('[OCR] Nenhum texto legível encontrado na imagem');
    return null;

  } catch (error) {
    console.error('[OCR] Error extracting text from image:', error);
    return null;
  }
}

// Download media from WhatsApp API and upload to Supabase Storage
async function downloadAndStoreMedia(
  supabase: any, 
  settings: any, 
  mediaId: string,
  contactPhone: string,
  messageType: string
): Promise<{ storageUrl: string | null; mediaBuffer: ArrayBuffer | null; mimeType: string | null }> {
  if (!settings?.whatsapp_access_token) {
    console.error('[Webhook] No WhatsApp access token configured');
    return { storageUrl: null, mediaBuffer: null, mimeType: null };
  }

  try {
    // Step 1: Get the media URL from WhatsApp
    console.log('[Webhook] Getting media info for:', mediaId);
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`
        }
      }
    );

    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();
      console.error('[Webhook] Failed to get media info:', errorText);
      return { storageUrl: null, mediaBuffer: null, mimeType: null };
    }

    const mediaInfo = await mediaInfoResponse.json();
    const mediaUrl = mediaInfo.url;
    const mimeType = mediaInfo.mime_type || 'application/octet-stream';

    if (!mediaUrl) {
      console.error('[Webhook] No media URL in response');
      return { storageUrl: null, mediaBuffer: null, mimeType: null };
    }

    // Step 2: Download the actual media from WhatsApp
    console.log('[Webhook] Downloading media from WhatsApp...');
    const mediaResponse = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${settings.whatsapp_access_token}`
      }
    });

    if (!mediaResponse.ok) {
      const errorText = await mediaResponse.text();
      console.error('[Webhook] Failed to download media:', errorText);
      return { storageUrl: null, mediaBuffer: null, mimeType: null };
    }

    const mediaBuffer = await mediaResponse.arrayBuffer();
    console.log('[Webhook] Downloaded media, size:', mediaBuffer.byteLength, 'bytes');

    // Step 3: Generate unique filename and upload to Supabase Storage
    const fileExtension = mimeType.includes('pdf') ? 'pdf' :
                          mimeType.includes('msword') ? 'doc' :
                          mimeType.includes('wordprocessingml') ? 'docx' :
                          mimeType.includes('spreadsheetml') ? 'xlsx' :
                          mimeType.includes('ms-excel') ? 'xls' :
                          mimeType.includes('ogg') ? 'ogg' : 
                          mimeType.includes('mp4') ? 'mp4' : 
                          mimeType.includes('mpeg') ? 'mp3' :
                          mimeType.includes('jpeg') ? 'jpg' :
                          mimeType.includes('png') ? 'png' :
                          mimeType.includes('webp') ? 'webp' : 'bin';
    const timestamp = Date.now();
    const sanitizedPhone = contactPhone.replace(/\D/g, '');
    const fileName = `${messageType}/${sanitizedPhone}/${timestamp}_${mediaId.substring(0, 8)}.${fileExtension}`;

    console.log('[Webhook] Uploading to Storage:', fileName);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(fileName, mediaBuffer, {
        contentType: mimeType,
        cacheControl: '31536000', // 1 year cache
        upsert: false
      });

    if (uploadError) {
      console.error('[Webhook] Storage upload error:', uploadError);
      return { storageUrl: null, mediaBuffer, mimeType };
    }

    // Step 4: Get public URL
    const { data: urlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    const storageUrl = urlData?.publicUrl || null;
    console.log('[Webhook] Media stored successfully:', storageUrl);

    return { storageUrl, mediaBuffer, mimeType };

  } catch (error) {
    console.error('[Webhook] Error downloading/storing media:', error);
    return { storageUrl: null, mediaBuffer: null, mimeType: null };
  }
}

async function processIncomingMessage(
  supabase: any, 
  message: any, 
  contactInfo: any, 
  phoneNumberId: string,
  settings: any,
  lovableApiKey: string
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const rawPhoneNumber = message.from;
  const normalizedPhone = normalizePhone(rawPhoneNumber);
  const whatsappId = contactInfo?.wa_id || rawPhoneNumber;
  const contactName = contactInfo?.profile?.name || null;

  // 1. Get or create contact using flexible phone search
  let contact = await findContactByPhone(supabase, rawPhoneNumber);

  if (!contact) {
    // Extrair cidade/estado do DDD
    const region = getRegionFromDDD(normalizedPhone);
    
    // Create new contact with normalized phone number
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        phone_number: normalizedPhone,
        whatsapp_id: whatsappId,
        name: contactName,
        call_name: contactName?.split(' ')[0] || null,
        lead_source: 'inbound', // Contatos via WhatsApp são inbound
        city: region?.city || null,
        state: region?.state || null
      })
      .select()
      .single();

    if (contactError) {
      console.error('[Webhook] Error creating contact:', contactError);
      throw contactError;
    }
    contact = newContact;
    console.log('[Webhook] Created new contact:', contact.id, 'with phone:', normalizedPhone, region ? `(${region.city} - ${region.state})` : '');
  } else {
    // Update contact info if needed
    const updates: any = { last_activity: new Date().toISOString() };
    
    // Update name if we have a new one
    if (contactName && !contact.name) {
      updates.name = contactName;
      updates.call_name = contactName.split(' ')[0];
    }
    
    // Update whatsapp_id if not set
    if (!contact.whatsapp_id) {
      updates.whatsapp_id = whatsappId;
    }
    
    await supabase
      .from('contacts')
      .update(updates)
      .eq('id', contact.id);
      
    console.log('[Webhook] Using existing contact:', contact.id, 'found by phone variant');
  }

  // 2. Get or create active conversation (operação ATÔMICA no banco — evita conversas duplicadas
  //    quando o WhatsApp entrega várias mensagens em paralelo)
  const { data: convData, error: convError } = await supabase
    .rpc('get_or_create_active_conversation', {
      p_contact_id: contact.id,
      p_status: 'nina',
      p_touch_window: true,
    });

  if (convError || !convData) {
    console.error('[Webhook] Error getting/creating conversation:', convError);
    throw convError || new Error('Failed to resolve conversation');
  }

  const conversation: any = Array.isArray(convData) ? convData[0] : convData;
  console.log('[Webhook] Using conversation:', conversation.id);


  // 3. Parse message content based on type
  let content: string | null = null;
  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  let messageType: string = 'text';

  switch (message.type) {
    case 'text':
      content = message.text?.body;
      break;
    case 'image':
      messageType = 'image';
      mediaType = 'image';
      const imageCaption = message.image?.caption || null;
      // Download, store, and OCR the image
      const imageMediaId = message.image?.id;
      if (imageMediaId && settings?.whatsapp_access_token) {
        console.log('[Webhook] Processing image message:', imageMediaId);
        const { storageUrl: imageStorageUrl, mediaBuffer: imageBuffer, mimeType: imageMimeType } = 
          await downloadAndStoreMedia(supabase, settings, imageMediaId, normalizedPhone, 'image');
        
        if (imageStorageUrl) {
          mediaUrl = imageStorageUrl;
          console.log('[Webhook] Image stored at:', imageStorageUrl);
        }
        
        // Try to extract text from image via OCR
        if (imageBuffer && imageMimeType && lovableApiKey) {
          const extractedText = await extractTextFromImage(imageBuffer, imageMimeType, lovableApiKey);
          if (extractedText) {
            // Combine caption (if any) with extracted text
            content = imageCaption 
              ? `${imageCaption}\n\n[Texto extraído da imagem: ${extractedText}]`
              : `[Texto extraído da imagem: ${extractedText}]`;
            console.log('[Webhook] Image OCR successful');
          } else {
            content = imageCaption || '[imagem]';
          }
        } else {
          content = imageCaption || '[imagem]';
        }
      } else {
        content = imageCaption || '[imagem]';
      }
      break;
    case 'audio':
      messageType = 'audio';
      mediaType = 'audio';
      // Download, store, and transcribe the audio
      const audioMediaId = message.audio?.id;
      if (audioMediaId && settings?.whatsapp_access_token) {
        console.log('[Webhook] Processing audio message:', audioMediaId);
        const { storageUrl, mediaBuffer: audioBuffer, mimeType: audioMimeType } = await downloadAndStoreMedia(
          supabase, settings, audioMediaId, normalizedPhone, 'audio'
        );
        
        if (storageUrl) {
          mediaUrl = storageUrl;
          console.log('[Webhook] Audio stored at:', storageUrl);
        }
        
        // Try to transcribe with ElevenLabs if we have the audio buffer
        if (audioBuffer && audioMimeType) {
          const transcription = await transcribeAudio(audioBuffer, audioMimeType, supabase);
          if (transcription) {
            content = transcription;
            console.log('[Webhook] Audio transcribed:', transcription.substring(0, 100));
          } else {
            content = '[áudio]';
          }
        } else {
          content = '[áudio]';
        }
      } else {
        content = '[áudio]';
      }
      break;
    case 'video':
      messageType = 'video';
      mediaType = 'video';
      const videoCaption = message.video?.caption || null;
      const videoMediaId = message.video?.id;
      if (videoMediaId && settings?.whatsapp_access_token) {
        console.log('[Webhook] Processing video message:', videoMediaId);
        const { storageUrl: videoStorageUrl } = await downloadAndStoreMedia(
          supabase, settings, videoMediaId, normalizedPhone, 'video'
        );
        if (videoStorageUrl) {
          mediaUrl = videoStorageUrl;
          console.log('[Webhook] Video stored at:', videoStorageUrl);
        }
      }
      content = videoCaption || '[vídeo]';
      break;
    case 'document':
      messageType = 'document';
      mediaType = 'document';
      const docFilename = message.document?.filename || '[documento]';
      const docMediaId = message.document?.id;
      if (docMediaId && settings?.whatsapp_access_token) {
        console.log('[Webhook] Processing document message:', docMediaId, 'filename:', docFilename);
        const { storageUrl: docStorageUrl } = await downloadAndStoreMedia(
          supabase, settings, docMediaId, normalizedPhone, 'document'
        );
        if (docStorageUrl) {
          mediaUrl = docStorageUrl;
          console.log('[Webhook] Document stored at:', docStorageUrl);
        }
      }
      content = docFilename;
      break;
    default:
      content = `[${message.type}]`;
  }

  // 4. Create message record
  const { data: dbMessage, error: msgError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      whatsapp_message_id: message.id,
      content: content,
      type: messageType,
      from_type: 'user',
      status: 'sent',
      media_url: mediaUrl,
      media_type: mediaType,
      sent_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
      metadata: { raw: message, original_type: message.type }
    })
    .select()
    .single();

  if (msgError) {
    console.error('[Webhook] Error creating message:', msgError);
    throw msgError;
  }
  console.log('[Webhook] Created message:', dbMessage.id);

  // 5. Update conversation last_message_at (trigger should handle this but let's be sure)
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // 6. Check if conversation should be reactivated for AI (template was sent recently)
  // This covers cases where a template was sent but conversation wasn't properly set to 'nina'
  if (conversation.status !== 'nina') {
    console.log('[Webhook] Conversation not in nina status, checking for recent template...');
    
    // Check if there was a template sent recently (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentTemplateMsg } = await supabase
      .from('messages')
      .select('id, metadata, created_at')
      .eq('conversation_id', conversation.id)
      .eq('from_type', 'nina')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10);
    
    // Check if any message has is_template = true in metadata
    const templateMessage = recentTemplateMsg?.find((m: any) => m.metadata?.is_template === true);
    
    if (templateMessage) {
      console.log('[Webhook] Found recent template message, reactivating AI with Omega agent...');
      
      // Get Omega agent for handling template responses
      const { data: omegaAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', 'omega')
        .maybeSingle();
      
      // Reactivate conversation with AI
      const { error: reactivateError } = await supabase
        .from('conversations')
        .update({
          status: 'nina',
          is_active: true,
          current_agent_id: omegaAgent?.id || null
        })
        .eq('id', conversation.id);
      
      if (!reactivateError) {
        // Update local conversation object so the queue logic below works
        conversation.status = 'nina';
        console.log('[Webhook] ✅ Conversation reactivated with Omega agent for template response');
      } else {
        console.error('[Webhook] Error reactivating conversation:', reactivateError);
      }
    } else {
      console.log('[Webhook] No recent template found, keeping conversation in', conversation.status, 'status');
    }
  }

  // 7. If conversation is handled by Nina, queue for AI processing with debounce delay
  if (conversation.status === 'nina') {
    // Debounce: schedule processing for 15 seconds in the future
    // This allows multiple rapid messages to be aggregated before AI responds
    const DEBOUNCE_DELAY_MS = 15000;
    const scheduledFor = new Date(Date.now() + DEBOUNCE_DELAY_MS).toISOString();
    
    const { error: ninaQueueError } = await supabase
      .from('nina_processing_queue')
      .insert({
        message_id: dbMessage.id,
        conversation_id: conversation.id,
        contact_id: contact.id,
        priority: 1,
        scheduled_for: scheduledFor,
        context_data: {
          phone_number_id: phoneNumberId,
          contact_name: contact.name || contact.call_name,
          message_type: messageType,
          original_type: message.type,
          debounce_scheduled_at: new Date().toISOString()
        }
      });

    if (ninaQueueError) {
      console.error('[Webhook] Error queuing for Nina:', ninaQueueError);
    } else {
      console.log('[Webhook] Message queued for Nina processing (scheduled for:', scheduledFor, ')');
      
      // Disparar o orquestrador após o delay de debounce em background
      const triggerOrchestrator = async () => {
        // Aguardar o tempo de debounce + 1s de margem
        await new Promise(resolve => setTimeout(resolve, DEBOUNCE_DELAY_MS + 1000));
        
        try {
          const orchestratorUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/nina-orchestrator`;
          console.log('[Webhook] Triggering nina-orchestrator after debounce...');
          
          const response = await fetch(orchestratorUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
          });
          
          if (response.ok) {
            console.log('[Webhook] ✅ Nina orchestrator triggered successfully');
          } else {
            console.error('[Webhook] ❌ Nina orchestrator returned:', response.status, await response.text());
          }
        } catch (e) {
          console.error('[Webhook] ❌ Error triggering nina-orchestrator:', e);
        }
      };
      
      // Executar em background sem bloquear a resposta do webhook
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      (globalThis as any).EdgeRuntime?.waitUntil?.(triggerOrchestrator()) || triggerOrchestrator();
    }
  }
}
