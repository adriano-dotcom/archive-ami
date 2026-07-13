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
    const { call_id, whatsapp_call_id } = await req.json();

    console.log('[whatsapp-call-reject] === REJEITANDO CHAMADA ===');
    console.log('[whatsapp-call-reject] Params:', { call_id, whatsapp_call_id });

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

    if (!['ringing', 'answered'].includes(callRecord.status)) {
      throw new Error(`Chamada não pode ser rejeitada — status atual: ${callRecord.status}`);
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

    console.log('[whatsapp-call-reject] Enviando reject para Meta:', { phoneNumberId, resolvedCallId });

    // Reject the call via Meta Graph API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/calls/${resolvedCallId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reject' }),
      }
    );

    const metaData = await metaResponse.json().catch(() => ({}));

    console.log('[whatsapp-call-reject] Resposta Meta:', {
      status: metaResponse.status,
      ok: metaResponse.ok,
      data: metaData,
    });

    // Always update local state — user intent is to reject
    if (!metaResponse.ok) {
      console.warn('[whatsapp-call-reject] Meta retornou erro, mas atualizamos status local:', metaResponse.status);
    }

    await supabase
      .from('whatsapp_calls')
      .update({
        status: 'rejected',
        ended_at: new Date().toISOString(),
        hangup_cause: 'user_rejected',
        metadata: { reject_response: metaData, rejected_at: new Date().toISOString() },
      })
      .eq('id', callRecord.id);

    console.log('[whatsapp-call-reject] === CHAMADA REJEITADA ===');

    return new Response(
      JSON.stringify({ success: true, message: 'Chamada rejeitada', call_id: callRecord.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[whatsapp-call-reject] === ERRO ===', errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
