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

  // --- Auth guard: internal service-role (cron/triggers/bridge) OR authenticated staff (admin/operator) ---
  {
    const _supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const _svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const _anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const _token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (_token !== _svcKey) {
      if (!_token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const _authClient = createClient(_supabaseUrl, _anonKey, { global: { headers: { Authorization: `Bearer ${_token}` } } });
      const { data: _authData, error: _authErr } = await _authClient.auth.getUser();
      if (_authErr || !_authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: _roleRows } = await _authClient.from('user_roles').select('role').eq('user_id', _authData.user.id);
      if (!(_roleRows || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
  }


  try {
    const { call_id, whatsapp_call_id, sdp_answer, sdp_type } = await req.json();

    console.log('[whatsapp-call-accept] === ACEITANDO CHAMADA ===');
    console.log('[whatsapp-call-accept] Params:', { call_id, whatsapp_call_id, has_sdp: !!sdp_answer, sdp_type });

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

    // Check if this is a test call
    const isTestCallId = resolvedCallId && /LIVE_TEST|SIMULATED|TEST/i.test(resolvedCallId);
    const isRealMetaCallId = resolvedCallId && !isTestCallId;

    let metaData: any = {};
    if (isRealMetaCallId && phoneNumberId) {
      // Build payload with session (SDP answer) if provided
      const payload: any = {
        messaging_product: 'whatsapp',
        call_id: resolvedCallId,
        action: 'ACCEPT',
      };

      if (sdp_answer) {
        payload.session = {
          sdp: sdp_answer,
          sdp_type: sdp_type || 'answer',
        };
        console.log('[whatsapp-call-accept] Incluindo SDP answer no payload, tamanho:', sdp_answer.length);
      } else {
        console.warn('[whatsapp-call-accept] SDP answer não fornecido — Meta pode rejeitar');
      }

      console.log('[whatsapp-call-accept] Enviando accept para Meta:', { 
        phoneNumberId, 
        resolvedCallId: resolvedCallId.substring(0, 30) + '...',
        hasSession: !!payload.session,
      });

      const metaResponse = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/calls`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.whatsapp_access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
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
      console.log('[whatsapp-call-accept] Chamada de teste — pulando Meta API');
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
