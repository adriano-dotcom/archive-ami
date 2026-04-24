import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Sender] Starting send process...');

    // Get WhatsApp credentials from settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_token_in_vault')
      .maybeSingle();

    if (!settings) {
      console.log('[Sender] Sistema não configurado');
      return new Response(JSON.stringify({ 
        error: 'Sistema não configurado',
        message: 'Acesse /settings para configurar o WhatsApp',
        processed: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get access token from Vault or fallback to table
    let accessToken = settings.whatsapp_access_token;
    if (settings.whatsapp_token_in_vault) {
      try {
        const { data: vaultToken } = await supabase.rpc('get_vault_secret', { 
          secret_name: 'vault_whatsapp_token' 
        });
        if (vaultToken) {
          accessToken = vaultToken;
          console.log('[Sender] Using WhatsApp token from Vault');
        }
      } catch (e) {
        console.log('[Sender] Vault lookup failed, using table fallback');
      }
    }

    if (!accessToken || !settings.whatsapp_phone_number_id) {
      console.log('[Sender] WhatsApp credentials not configured');
      return new Response(JSON.stringify({ 
        error: 'WhatsApp não configurado',
        message: 'Configure Access Token e Phone Number ID em /settings',
        processed: 0 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create settings object with resolved token
    const resolvedSettings = {
      ...settings,
      whatsapp_access_token: accessToken
    };

    const MAX_EXECUTION_TIME = 25000; // 25 seconds
    const startTime = Date.now();
    let totalSent = 0;
    let iterations = 0;

    console.log('[Sender] Starting polling loop');

    while (Date.now() - startTime < MAX_EXECUTION_TIME) {
      iterations++;
      console.log(`[Sender] Iteration ${iterations}, elapsed: ${Date.now() - startTime}ms`);

      // Claim batch of messages to send
      const { data: queueItems, error: claimError } = await supabase
        .rpc('claim_send_queue_batch', { p_limit: 10 });

      if (claimError) {
        console.error('[Sender] Error claiming batch:', claimError);
        throw claimError;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log('[Sender] No messages ready to send, checking for scheduled messages...');
        
        // Check for messages scheduled in the next 5 seconds
        const { data: upcoming, error: upcomingError } = await supabase
          .from('send_queue')
          .select('id, scheduled_at')
          .eq('status', 'pending')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', new Date(Date.now() + 5000).toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1);

        if (upcomingError) {
          console.error('[Sender] Error checking upcoming messages:', upcomingError);
        }

        if (upcoming && upcoming.length > 0) {
          const scheduledAt = new Date(upcoming[0].scheduled_at).getTime();
          const now = Date.now();
          const waitTime = Math.min(
            Math.max(scheduledAt - now + 100, 0),
            5000
          );
          
          if (waitTime > 0 && (Date.now() - startTime + waitTime) < MAX_EXECUTION_TIME) {
            console.log(`[Sender] Waiting ${waitTime}ms for scheduled message at ${upcoming[0].scheduled_at}`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        // No more messages to process
        console.log('[Sender] No more messages to process, exiting loop');
        break;
      }

      console.log(`[Sender] Processing batch of ${queueItems.length} messages`);

      for (const item of queueItems) {
        try {
          await sendMessage(supabase, resolvedSettings, item);
          
          // Mark as completed
          await supabase
            .from('send_queue')
            .update({ 
              status: 'completed', 
              sent_at: new Date().toISOString() 
            })
            .eq('id', item.id);
          
          totalSent++;
          console.log(`[Sender] Successfully sent message ${item.id} (${totalSent} total)`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Sender] Error sending item ${item.id}:`, error);
          
          // Mark as failed with retry
          const newRetryCount = (item.retry_count || 0) + 1;
          const shouldRetry = newRetryCount < 3;
          
          await supabase
            .from('send_queue')
            .update({ 
              status: shouldRetry ? 'pending' : 'failed',
              retry_count: newRetryCount,
              error_message: errorMessage,
              scheduled_at: shouldRetry 
                ? new Date(Date.now() + newRetryCount * 60000).toISOString() 
                : null
            })
            .eq('id', item.id);
        }
      }
    }

    const executionTime = Date.now() - startTime;
    console.log(`[Sender] Completed: sent ${totalSent} messages in ${iterations} iterations (${executionTime}ms)`);

    return new Response(JSON.stringify({ 
      sent: totalSent, 
      iterations,
      executionTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Sender] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function sendMessage(supabase: any, settings: any, queueItem: any) {
  console.log(`[Sender] Sending message: ${queueItem.id}`);

  // Get contact phone number
  const { data: contact } = await supabase
    .from('contacts')
    .select('phone_number, whatsapp_id')
    .eq('id', queueItem.contact_id)
    .maybeSingle();

  if (!contact) {
    throw new Error('Contact not found');
  }

  // ========================================
  // CHECK WHATSAPP 24H WINDOW (for non-template messages)
  // ========================================
  const isTemplateMessage = queueItem.metadata?.is_template === true;
  
  if (!isTemplateMessage) {
    // Get conversation to check window
    const { data: conversation } = await supabase
      .from('conversations')
      .select('whatsapp_window_start')
      .eq('id', queueItem.conversation_id)
      .maybeSingle();

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const windowStart = conversation.whatsapp_window_start ? new Date(conversation.whatsapp_window_start) : null;
    const now = new Date();
    const windowEndTime = windowStart ? new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) : null;
    const isWindowOpen = windowStart !== null && windowEndTime !== null && now < windowEndTime;

    if (!isWindowOpen) {
      console.log('[Sender] WhatsApp 24h window is closed, rejecting message');
      throw new Error('Janela de 24h expirada - use template para reabrir conversa');
    }
    
    console.log('[Sender] WhatsApp window is open, proceeding with message');
  } else {
    console.log('[Sender] Template message - bypassing window check');
  }

  const recipient = contact.whatsapp_id || contact.phone_number;

  // ========================================
  // STEP 1: CREATE MESSAGE RECORD FIRST (before sending)
  // This ensures messages appear in UI even if WhatsApp fails
  // ========================================
  let messageId = queueItem.message_id;

  if (!messageId) {
    // Create message with 'processing' status BEFORE sending
    console.log('[Sender] Creating message record BEFORE sending...');
    const { data: newMsg, error: createError } = await supabase
      .from('messages')
      .insert({
        conversation_id: queueItem.conversation_id,
        content: queueItem.content,
        type: queueItem.message_type,
        from_type: queueItem.from_type,
        status: 'processing', // Initial status - will update after send
        media_url: queueItem.media_url || null,
        metadata: queueItem.metadata || {}
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[Sender] Error creating message record:', createError);
      // Continue anyway - we still want to try sending
    } else if (newMsg) {
      messageId = newMsg.id;
      console.log('[Sender] Created message record:', messageId);
      
      // Update send_queue with the message_id for tracking
      await supabase
        .from('send_queue')
        .update({ message_id: messageId })
        .eq('id', queueItem.id);
    }
  }

  // Update conversation last_message_at immediately
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', queueItem.conversation_id);

  // ========================================
  // STEP 2: BUILD WHATSAPP PAYLOAD
  // ========================================
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient
  };

  switch (queueItem.message_type) {
    case 'text':
      payload.type = 'text';
      payload.text = { body: queueItem.content };
      break;
    
    case 'image':
      payload.type = 'image';
      payload.image = { 
        link: queueItem.media_url,
        caption: queueItem.content || undefined
      };
      break;
    
    case 'audio':
      payload.type = 'audio';
      payload.audio = { link: queueItem.media_url };
      break;
    
    case 'document':
      payload.type = 'document';
      payload.document = { 
        link: queueItem.media_url,
        filename: queueItem.content || 'document'
      };
      break;
    
    case 'video':
      payload.type = 'video';
      payload.video = {
        link: queueItem.media_url,
        caption: queueItem.content || undefined
      };
      break;
    
    default:
      payload.type = 'text';
      payload.text = { body: queueItem.content };
  }

  console.log('[Sender] WhatsApp API payload:', JSON.stringify(payload, null, 2));

  // ========================================
  // STEP 3: SEND VIA WHATSAPP API
  // ========================================
  try {
    const response = await fetch(
      `${WHATSAPP_API_URL}/${settings.whatsapp_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[Sender] WhatsApp API error:', responseData);
      
      // Update message status to 'failed' if we have a messageId
      if (messageId) {
        await supabase
          .from('messages')
          .update({
            status: 'failed',
            metadata: {
              ...(queueItem.metadata || {}),
              whatsapp_error: responseData.error?.message || 'WhatsApp API error'
            }
          })
          .eq('id', messageId);
        console.log('[Sender] Updated message status to failed:', messageId);
      }
      
      throw new Error(responseData.error?.message || 'WhatsApp API error');
    }

    const whatsappMessageId = responseData.messages?.[0]?.id;
    console.log('[Sender] Message sent successfully, WA ID:', whatsappMessageId);

    // ========================================
    // STEP 4: UPDATE MESSAGE TO 'SENT' STATUS
    // ========================================
    if (messageId) {
      const { error: updateError } = await supabase
        .from('messages')
        .update({
          whatsapp_message_id: whatsappMessageId,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (updateError) {
        console.error('[Sender] Error updating message to sent:', updateError);
      } else {
        console.log('[Sender] Updated message status to sent:', messageId);
      }
    }

  } catch (error) {
    // If WhatsApp send failed but we already created the message,
    // ensure it's marked as failed
    if (messageId) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await supabase
        .from('messages')
        .update({
          status: 'failed',
          metadata: {
            ...(queueItem.metadata || {}),
            whatsapp_error: errorMessage
          }
        })
        .eq('id', messageId);
      console.log('[Sender] Marked message as failed due to error:', messageId);
    }
    
    // Re-throw to trigger retry logic in main loop
    throw error;
  }
}
