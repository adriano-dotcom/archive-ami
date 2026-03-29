import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Transcribe audio using ElevenLabs Scribe v1
async function transcribeAudio(
  audioBuffer: ArrayBuffer, 
  mimeType: string,
  supabase: any
): Promise<string | null> {
  // Fetch ElevenLabs API key from nina_settings
  const { data: settings, error: settingsError } = await supabase
    .from('nina_settings')
    .select('elevenlabs_api_key')
    .maybeSingle();

  if (settingsError) {
    console.error('Error fetching nina_settings:', settingsError);
    return null;
  }

  if (!settings?.elevenlabs_api_key) {
    console.error('ElevenLabs API key not configured in nina_settings');
    return null;
  }

  try {
    const formData = new FormData();
    const extension = mimeType.split('/')[1] || 'ogg';
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, `audio.${extension}`);
    formData.append('model_id', 'scribe_v1');

    console.log('Transcribing audio with ElevenLabs Scribe v1...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': settings.elevenlabs_api_key,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs STT error:', response.status, errorText);
      return null;
    }

    const result = await response.json();
    console.log('Transcription result:', result);
    
    // ElevenLabs returns { text: "..." }
    return result.text || null;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Admin role enforcement ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseKey;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub;

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // --- End admin role enforcement ---

    const { phone, name, audio_base64, audio_mime_type } = await req.json();

    // Validate required fields
    if (!phone || !audio_base64) {
      return new Response(
        JSON.stringify({ error: 'phone and audio_base64 are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mimeType = audio_mime_type || 'audio/ogg';
    console.log(`[simulate-audio-webhook] Processing audio from ${phone}, mime: ${mimeType}`);

    // Initialize Supabase client early (needed for transcription)
    // supabase already created above for admin check

    // Decode base64 to ArrayBuffer
    const binaryString = atob(audio_base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBuffer = bytes.buffer;
    console.log(`[simulate-audio-webhook] Decoded audio: ${audioBuffer.byteLength} bytes`);

    // Transcribe audio using ElevenLabs Scribe
    const transcription = await transcribeAudio(audioBuffer, mimeType, supabase);
    
    if (!transcription) {
      return new Response(
        JSON.stringify({ error: 'Failed to transcribe audio. Check if ElevenLabs API key is configured in Settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[simulate-audio-webhook] Transcription: "${transcription}"`);

    // Get whatsapp_phone_number_id from settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_phone_number_id')
      .maybeSingle();

    const phoneNumberId = settings?.whatsapp_phone_number_id || 'simulated';

    // Find or create contact - first try by whatsapp_id, then by phone
    let contact = null;
    
    // Try to find by whatsapp_id first (most reliable)
    const { data: contactByWaId } = await supabase
      .from('contacts')
      .select('*')
      .eq('whatsapp_id', phone)
      .maybeSingle();
    
    if (contactByWaId) {
      contact = contactByWaId;
      console.log(`[simulate-audio-webhook] Found existing contact by whatsapp_id: ${contact.id}`);
    } else {
      // Fallback to phone_number search
      const { data: contactByPhone } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone_number', phone)
        .maybeSingle();
      
      if (contactByPhone) {
        contact = contactByPhone;
        // Update whatsapp_id if not set
        if (!contact.whatsapp_id) {
          await supabase.from('contacts').update({ whatsapp_id: phone }).eq('id', contact.id);
          console.log(`[simulate-audio-webhook] Updated whatsapp_id for contact: ${contact.id}`);
        }
      }
    }

    if (!contact) {
      const { data: newContact, error: createError } = await supabase
        .from('contacts')
        .insert({
          phone_number: phone,
          name: name || null,
          call_name: name || null,
          whatsapp_id: phone,
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating contact:', createError);
        throw createError;
      }
      contact = newContact;
      console.log(`[simulate-audio-webhook] Created new contact: ${contact.id}`);
    } else {
      console.log(`[simulate-audio-webhook] Found existing contact: ${contact.id}`);
    }

    // Find or create conversation (tentar reativar conversa existente)
    let { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_id', contact.id)
      .eq('is_active', true)
      .maybeSingle();

    if (!conversation) {
      // Buscar conversa INATIVA mais recente para reativar
      const { data: inactiveConversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contact.id)
        .eq('is_active', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inactiveConversation) {
        // Reativar conversa existente mantendo histórico
        const { data: reactivatedConv, error: reactivateError } = await supabase
          .from('conversations')
          .update({
            is_active: true,
            status: 'nina',
            whatsapp_window_start: new Date().toISOString()
          })
          .eq('id', inactiveConversation.id)
          .select()
          .single();

        if (!reactivateError && reactivatedConv) {
          conversation = reactivatedConv;
          console.log(`[simulate-audio-webhook] Reactivated existing conversation: ${conversation.id}`);
        } else {
          console.error('Error reactivating conversation:', reactivateError);
          throw reactivateError || new Error('Failed to reactivate conversation');
        }
      } else {
        // Criar nova conversa apenas se não existir nenhuma
        const { data: newConv, error: createConvError } = await supabase
          .from('conversations')
          .insert({
            contact_id: contact.id,
            status: 'nina',
            is_active: true,
          })
          .select()
          .single();

        if (createConvError) {
          console.error('Error creating conversation:', createConvError);
          throw createConvError;
        }
        conversation = newConv;
        console.log(`[simulate-audio-webhook] Created new conversation: ${conversation.id}`);
      }
    } else {
      console.log(`[simulate-audio-webhook] Found existing conversation: ${conversation.id}`);
    }

    // Create message with type='audio' and transcription as content
    const { data: message, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        content: transcription,
        type: 'audio',
        from_type: 'user',
        status: 'delivered',
        whatsapp_message_id: `sim_audio_${Date.now()}`,
        metadata: {
          simulated: true,
          original_audio_mime: mimeType,
          audio_size_bytes: audioBuffer.byteLength,
          transcription_source: 'elevenlabs_scribe',
        },
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error creating message:', msgError);
      throw msgError;
    }
    console.log(`[simulate-audio-webhook] Created message: ${message.id}`);

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id);

    // Queue for Nina processing if status is 'nina'
    let queuedForNina = false;
    if (conversation.status === 'nina') {
      const { error: queueError } = await supabase
        .from('nina_processing_queue')
        .insert({
          conversation_id: conversation.id,
          contact_id: contact.id,
          message_id: message.id,
          status: 'pending',
          priority: 5,
        });

      if (queueError) {
        console.error('Error queuing for Nina:', queueError);
      } else {
        queuedForNina = true;
        console.log(`[simulate-audio-webhook] Queued message for Nina processing`);

        // Trigger nina-orchestrator
        try {
          const orchestratorUrl = `${supabaseUrl}/functions/v1/nina-orchestrator`;
          console.log(`[simulate-audio-webhook] Triggering nina-orchestrator...`);
          
          const orchestratorResponse = await fetch(orchestratorUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ trigger: 'simulate-audio-webhook' }),
          });

          if (!orchestratorResponse.ok) {
            console.error('nina-orchestrator error:', await orchestratorResponse.text());
          } else {
            console.log('[simulate-audio-webhook] nina-orchestrator triggered successfully');
          }
        } catch (orchError) {
          console.error('Error triggering nina-orchestrator:', orchError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription,
        contact_id: contact.id,
        conversation_id: conversation.id,
        message_id: message.id,
        queued_for_nina: queuedForNina,
        conversation_status: conversation.status,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[simulate-audio-webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
