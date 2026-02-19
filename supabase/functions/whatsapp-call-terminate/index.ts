import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { call_id, whatsapp_call_id } = await req.json();

    console.log('[whatsapp-call-terminate] === ENCERRANDO CHAMADA ===');
    console.log('[whatsapp-call-terminate] Params:', { call_id, whatsapp_call_id });

    if (!call_id && !whatsapp_call_id) {
      throw new Error('É necessário fornecer call_id ou whatsapp_call_id');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch call record
    let callRecord: any = null;

    if (call_id) {
      const { data, error } = await supabase
        .from('whatsapp_calls')
        .select('id, whatsapp_call_id, phone_number_id, status, answered_at')
        .eq('id', call_id)
        .maybeSingle();

      if (error) throw new Error('Erro ao buscar registro da chamada');
      callRecord = data;
    } else {
      const { data, error } = await supabase
        .from('whatsapp_calls')
        .select('id, whatsapp_call_id, phone_number_id, status, answered_at')
        .eq('whatsapp_call_id', whatsapp_call_id)
        .maybeSingle();

      if (error) throw new Error('Erro ao buscar registro da chamada');
      callRecord = data;
    }

    if (!callRecord) {
      throw new Error('Chamada não encontrada');
    }

    if (['ended', 'rejected', 'missed', 'failed'].includes(callRecord.status)) {
      throw new Error(`Chamada já encerrada — status atual: ${callRecord.status}`);
    }

    const resolvedCallId = callRecord.whatsapp_call_id ?? whatsapp_call_id;
    if (!resolvedCallId) {
      throw new Error('whatsapp_call_id ausente no registro da chamada');
    }

    // Fetch WhatsApp credentials
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id')
      .maybeSingle();

    if (settingsError || !settings?.whatsapp_access_token) {
      throw new Error('Credenciais WhatsApp não configuradas');
    }

    const phoneNumberId = callRecord.phone_number_id ?? settings.whatsapp_phone_number_id;
    if (!phoneNumberId) {
      throw new Error('phone_number_id não configurado');
    }

    console.log('[whatsapp-call-terminate] Enviando hangup para Meta:', { phoneNumberId, resolvedCallId });

    // Terminate the call via Meta Graph API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/calls/${resolvedCallId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'hangup' }),
      }
    );

    const metaData = await metaResponse.json().catch(() => ({}));

    console.log('[whatsapp-call-terminate] Resposta Meta:', {
      status: metaResponse.status,
      ok: metaResponse.ok,
      data: metaData,
    });

    // Always update local state — user intent is to hang up
    if (!metaResponse.ok) {
      console.warn('[whatsapp-call-terminate] Meta retornou erro, mas atualizamos status local:', metaResponse.status);
    }

    const endedAt = new Date().toISOString();
    let durationSeconds: number | null = null;

    if (callRecord.answered_at) {
      const answeredMs = new Date(callRecord.answered_at).getTime();
      const endedMs = new Date(endedAt).getTime();
      durationSeconds = Math.floor((endedMs - answeredMs) / 1000);
    }

    await supabase
      .from('whatsapp_calls')
      .update({
        status: 'ended',
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        hangup_cause: 'user_hangup',
        metadata: { hangup_response: metaData, terminated_at: endedAt },
      })
      .eq('id', callRecord.id);

    console.log('[whatsapp-call-terminate] === CHAMADA ENCERRADA ===', {
      call_id: callRecord.id,
      durationSeconds,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Chamada encerrada',
        call_id: callRecord.id,
        duration_seconds: durationSeconds,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[whatsapp-call-terminate] === ERRO ===', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
