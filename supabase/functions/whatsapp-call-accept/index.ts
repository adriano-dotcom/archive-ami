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

    console.log('[whatsapp-call-accept] === ACEITANDO CHAMADA ===');
    console.log('[whatsapp-call-accept] Params:', { call_id, whatsapp_call_id });

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
        .select('id, whatsapp_call_id, phone_number_id, status')
        .eq('id', call_id)
        .maybeSingle();

      if (error) throw new Error('Erro ao buscar registro da chamada');
      callRecord = data;
    } else {
      const { data, error } = await supabase
        .from('whatsapp_calls')
        .select('id, whatsapp_call_id, phone_number_id, status')
        .eq('whatsapp_call_id', whatsapp_call_id)
        .maybeSingle();

      if (error) throw new Error('Erro ao buscar registro da chamada');
      callRecord = data;
    }

    if (!callRecord) {
      throw new Error('Chamada não encontrada');
    }

    if (callRecord.status !== 'ringing') {
      throw new Error(`Chamada não pode ser aceita — status atual: ${callRecord.status}`);
    }

    const resolvedCallId = callRecord.whatsapp_call_id ?? whatsapp_call_id;

    // Fetch WhatsApp credentials
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id')
      .maybeSingle();

    if (settingsError || !settings?.whatsapp_access_token) {
      throw new Error('Credenciais WhatsApp não configuradas');
    }

    const phoneNumberId = callRecord.phone_number_id ?? settings.whatsapp_phone_number_id;

    // Check if this is a real Meta call ID — real IDs start with "wacid." or are numeric
    // Test/simulated IDs typically contain "LIVE_TEST" or "SIMULATED"
    const isTestCallId = resolvedCallId && /LIVE_TEST|SIMULATED|TEST/i.test(resolvedCallId);
    const isRealMetaCallId = resolvedCallId && !isTestCallId;

    let metaData: any = {};
    if (isRealMetaCallId && phoneNumberId) {
      console.log('[whatsapp-call-accept] Enviando accept para Meta:', { phoneNumberId, resolvedCallId });

      // Accept the call via Meta Graph API
      // Meta endpoint: POST /{phone-number-id}/calls with call_id and action
      const metaResponse = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/calls`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.whatsapp_access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ call_id: resolvedCallId, action: 'answer' }),
        }
      );

      metaData = await metaResponse.json().catch(() => ({}));

      console.log('[whatsapp-call-accept] Resposta Meta:', {
        status: metaResponse.status,
        ok: metaResponse.ok,
        data: metaData,
      });

      if (!metaResponse.ok) {
        const errMsg = metaData?.error?.message ?? `Erro Meta (${metaResponse.status})`;
        throw new Error(errMsg);
      }
    } else {
      console.log('[whatsapp-call-accept] ID de chamada não-numérico (test/simulado) — pulando chamada à Meta API:', resolvedCallId);
    }

    // Update local record
    await supabase
      .from('whatsapp_calls')
      .update({
        status: 'answered',
        answered_at: new Date().toISOString(),
        metadata: { accept_response: metaData, accepted_at: new Date().toISOString() },
      })
      .eq('id', callRecord.id);

    console.log('[whatsapp-call-accept] === CHAMADA ACEITA ===');

    return new Response(
      JSON.stringify({ success: true, message: 'Chamada aceita com sucesso', call_id: callRecord.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[whatsapp-call-accept] === ERRO ===', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
