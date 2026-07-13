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
    const { call_log_id, api4com_call_id } = await req.json();

    console.log('[api4com-hangup] === ENCERRANDO CHAMADA ===');
    console.log('[api4com-hangup] Params:', { call_log_id, api4com_call_id });

    if (!api4com_call_id) {
      throw new Error('ID da chamada API4Com não fornecido');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get API4Com settings
    console.log('[api4com-hangup] Buscando configurações...');
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('api4com_api_token')
      .maybeSingle();

    if (settingsError || !settings?.api4com_api_token) {
      console.error('[api4com-hangup] Erro ao buscar configurações:', settingsError);
      throw new Error('Token API4Com não configurado');
    }

    // Call API4Com Hangup endpoint
    console.log('[api4com-hangup] Chamando API4Com hangup...');
    const api4comResponse = await fetch(`https://api.api4com.com/api/v1/dialer/${api4com_call_id}/hangup`, {
      method: 'POST',
      headers: {
        'Authorization': settings.api4com_api_token,
        'Content-Type': 'application/json',
      },
    });

    const api4comData = await api4comResponse.json().catch(() => ({}));
    
    console.log('[api4com-hangup] Resposta API4Com:', { 
      status: api4comResponse.status, 
      ok: api4comResponse.ok,
      data: api4comData 
    });

    // Update call log regardless of API response (user wants to close)
    if (call_log_id) {
      const { error: updateError } = await supabase
        .from('call_logs')
        .update({ 
          status: 'cancelled',
          ended_at: new Date().toISOString(),
          hangup_cause: 'user_hangup'
        })
        .eq('id', call_log_id);

      if (updateError) {
        console.error('[api4com-hangup] Erro ao atualizar log:', updateError);
      }
    }

    if (!api4comResponse.ok) {
      // Log the error but don't fail - we still want to update our local state
      console.warn('[api4com-hangup] API4Com retornou erro, mas atualizamos status local:', api4comResponse.status);
    }

    console.log('[api4com-hangup] === CHAMADA ENCERRADA ===');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Chamada encerrada',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[api4com-hangup] === ERRO ===', errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
