import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint (GET request)
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        service: 'api4com-webhook',
        timestamp: new Date().toISOString() 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Validate webhook authentication - API key is REQUIRED
    const webhookKey = Deno.env.get('API4COM_WEBHOOK_KEY');
    if (!webhookKey) {
      console.error('[api4com-webhook] CRITICAL: API4COM_WEBHOOK_KEY not configured - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Webhook authentication not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const providedKey = req.headers.get('x-api4com-key') || req.headers.get('X-Api4com-Key');
    if (!providedKey || providedKey !== webhookKey) {
      console.error('[api4com-webhook] Unauthorized: Invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    
    console.log('[api4com-webhook] Received webhook:', JSON.stringify(body, null, 2));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Normalize event type - API4Com uses eventType field
    const eventType = (body.eventType || body.event || body.type || body.Event || body.status || 'unknown').toLowerCase();
    
    // Extract call ID - API4Com uses 'id' field
    const callId = body.id || body.call_id || body.uniqueid || body.channel_id || 
                   body.CallId || body.callId || body.linkedid;
    
    // Extract metadata for alternative lookup
    const metadata = body.metadata || {};
    const metaContactId = metadata.contactId;
    const metaConversationId = metadata.conversationId;
    
    // Extract additional fields
    const extension = body.caller || body.extension || body.Extension || body.channel || body.caller_id_num;
    const destination = body.called || body.destination || body.phone || body.called_number || body.Destination;
    
    console.log('[api4com-webhook] Processing event:', { 
      eventType, 
      callId, 
      extension, 
      destination,
      metaContactId,
      metaConversationId,
      rawBody: body 
    });

    // Map various event types to our status
    const eventMapping: Record<string, string> = {
      // Hangup events
      'channel-hangup': 'hangup',
      'hangup': 'hangup',
      'call-ended': 'hangup',
      'callended': 'hangup',
      'end': 'hangup',
      'disconnected': 'hangup',
      // Answer events
      'channel-answer': 'answered',
      'answer': 'answered',
      'answered': 'answered',
      'connected': 'answered',
      'bridge': 'answered',
      // Ringing events
      'channel-ringing': 'ringing',
      'ringing': 'ringing',
      'ring': 'ringing',
      'alerting': 'ringing',
      // Dialing events
      'dial': 'dialing',
      'dialing': 'dialing',
      'originate': 'dialing',
      'progress': 'dialing',
    };

    const normalizedEvent = eventMapping[eventType] || eventType;

    // Helper function to find call log by callId or by metadata
    async function findCallLog() {
      // First try by api4com_call_id
      if (callId) {
        const { data } = await supabase
          .from('call_logs')
          .select('id, api4com_call_id')
          .eq('api4com_call_id', callId)
          .maybeSingle();
        
        if (data) {
          console.log('[api4com-webhook] Found call log by api4com_call_id:', data.id);
          return data;
        }
      }

      // Fallback: find by metadata (contactId + conversationId)
      // Include 'cancelled' because user_hangup might have triggered before webhook arrives
      if (metaContactId && metaConversationId) {
        const { data } = await supabase
          .from('call_logs')
          .select('id, api4com_call_id')
          .eq('contact_id', metaContactId)
          .eq('conversation_id', metaConversationId)
          .in('status', ['dialing', 'ringing', 'answered', 'cancelled'])
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (data) {
          console.log('[api4com-webhook] Found call log by metadata fallback:', data.id);
          return data;
        }
      }

      console.log('[api4com-webhook] No matching call log found');
      return null;
    }

    if (normalizedEvent === 'hangup') {
      // Call ended - update call log
      const duration = parseInt(body.duration || body.billsec || body.call_duration || '0', 10);
      const hangupCause = body.hangupCause || body.hangup_cause || body.cause || body.disposition || 'normal';
      const recordUrl = body.recordUrl || body.record_url || body.recording_url || body.recordingurl || null;
      const answeredAt = body.answered_at || body.answer_time || null;

      // Determine final status based on hangup cause
      let status = 'completed';
      const hangupCauseLower = hangupCause.toLowerCase();
      
      if (hangupCauseLower.includes('no_answer') || hangupCauseLower.includes('no answer')) {
        status = 'no_answer';
      } else if (hangupCauseLower.includes('busy')) {
        status = 'busy';
      } else if (hangupCauseLower.includes('failed') || hangupCauseLower.includes('number_changed') || 
                 hangupCauseLower.includes('unallocated') || hangupCauseLower.includes('not_registered')) {
        status = 'failed';
      } else if (duration > 0) {
        status = 'completed';
      } else {
        status = 'no_answer';
      }

      const callLog = await findCallLog();
      
      if (callLog) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({
            status: status,
            ended_at: new Date().toISOString(),
            answered_at: answeredAt ? new Date(answeredAt).toISOString() : null,
            duration_seconds: duration,
            hangup_cause: hangupCause,
            record_url: recordUrl,
            transcription_status: recordUrl ? 'pending' : null,
            metadata: {
              webhook_data: body,
              updated_at: new Date().toISOString(),
            }
          })
          .eq('id', callLog.id);

        if (updateError) {
          console.error('[api4com-webhook] Update error:', updateError);
        } else {
          console.log('[api4com-webhook] Call log updated:', { id: callLog.id, status, duration, hangupCause, hasRecording: !!recordUrl });
          
          // Trigger auto-transcription in background if there's a recording
          if (recordUrl) {
            console.log('[api4com-webhook] Triggering auto-transcription for call:', callLog.id);
            
            // Background task for transcription
            const transcribeInBackground = async () => {
              try {
                const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-call-recording`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({ call_log_id: callLog.id }),
                });
                
                if (response.ok) {
                  console.log('[api4com-webhook] Auto-transcription completed for call:', callLog.id);
                } else {
                  const errorText = await response.text();
                  console.error('[api4com-webhook] Auto-transcription failed:', errorText);
                }
              } catch (error) {
                console.error('[api4com-webhook] Auto-transcription error:', error);
              }
            };
            
            // Use EdgeRuntime.waitUntil for background processing
            // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
            if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
              // @ts-ignore
              EdgeRuntime.waitUntil(transcribeInBackground());
            } else {
              // Fallback: fire and forget
              transcribeInBackground();
            }
          }
        }
      }
    } else if (normalizedEvent === 'answered') {
      const callLog = await findCallLog();
      
      if (callLog) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString(),
            metadata: {
              webhook_data: body,
              answered_at_source: new Date().toISOString(),
            }
          })
          .eq('id', callLog.id);

        if (updateError) {
          console.error('[api4com-webhook] Answer update error:', updateError);
        } else {
          console.log('[api4com-webhook] Call marked as answered:', callLog.id);
        }
      }
    } else if (normalizedEvent === 'ringing') {
      const callLog = await findCallLog();
      
      if (callLog) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            status: 'ringing',
            metadata: {
              webhook_data: body,
              ringing_at: new Date().toISOString(),
            }
          })
          .eq('id', callLog.id);
        
        if (updateError) {
          console.error('[api4com-webhook] Ringing update error:', updateError);
        } else {
          console.log('[api4com-webhook] Call marked as ringing:', callLog.id);
        }
      }
    } else if (normalizedEvent === 'dialing') {
      const callLog = await findCallLog();
      
      if (callLog) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            status: 'dialing',
            metadata: {
              webhook_data: body,
              dialing_at: new Date().toISOString(),
            }
          })
          .eq('id', callLog.id);
        
        if (!updateError) {
          console.log('[api4com-webhook] Call marked as dialing:', callLog.id);
        }
      }
    } else {
      // Log unhandled event types for future reference
      console.log('[api4com-webhook] Unhandled event type:', { 
        eventType, 
        normalizedEvent,
        callId,
        body 
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed',
        event: normalizedEvent,
        callId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[api4com-webhook] Error:', error);
    // Return 200 to avoid webhook retries
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
