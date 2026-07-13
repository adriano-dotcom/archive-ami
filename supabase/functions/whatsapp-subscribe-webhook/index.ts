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


  console.log('[whatsapp-subscribe-webhook] Starting subscription fix...');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 1. Get settings from database
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_waba_id, whatsapp_phone_number_id')
      .maybeSingle();

    if (settingsError || !settings) {
      console.error('[whatsapp-subscribe-webhook] Settings error:', settingsError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Configurações não encontradas no banco de dados',
        details: settingsError?.message
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { whatsapp_access_token, whatsapp_waba_id, whatsapp_phone_number_id } = settings;

    if (!whatsapp_access_token || !whatsapp_waba_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Access Token ou WABA ID não configurados',
        missing: {
          access_token: !whatsapp_access_token,
          waba_id: !whatsapp_waba_id
        }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[whatsapp-subscribe-webhook] WABA ID:', whatsapp_waba_id);

    // 2. Check current subscription status
    console.log('[whatsapp-subscribe-webhook] Checking current subscription...');
    const checkResponse = await fetch(
      `https://graph.facebook.com/v18.0/${whatsapp_waba_id}/subscribed_apps`,
      {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${whatsapp_access_token}` 
        }
      }
    );

    const checkData = await checkResponse.json();
    console.log('[whatsapp-subscribe-webhook] Current subscription:', JSON.stringify(checkData));

    // Extract current subscribed fields
    let currentFields: string[] = [];
    if (checkData.data && checkData.data.length > 0) {
      for (const app of checkData.data) {
        if (app.whatsapp_business_api_data?.subscribed_fields) {
          currentFields.push(...app.whatsapp_business_api_data.subscribed_fields);
        }
      }
    }

    // 3. Subscribe with required fields (messages is critical)
    const requiredFields = ['messages'];
    const optionalFields = ['message_template_status_update'];
    const allFields = [...new Set([...requiredFields, ...optionalFields, ...currentFields])];

    console.log('[whatsapp-subscribe-webhook] Subscribing with fields:', allFields);

    // Use POST to subscribe the app to the WABA
    const subscribeResponse = await fetch(
      `https://graph.facebook.com/v18.0/${whatsapp_waba_id}/subscribed_apps`,
      {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${whatsapp_access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Subscribe to messages field (critical for receiving inbound messages)
          // Note: The Graph API v18.0 for WABA subscribed_apps doesn't use subscribed_fields
          // The subscription is at app level, fields are configured in webhook settings
        })
      }
    );

    const subscribeData = await subscribeResponse.json();
    console.log('[whatsapp-subscribe-webhook] Subscribe response:', JSON.stringify(subscribeData));

    if (!subscribeResponse.ok) {
      console.error('[whatsapp-subscribe-webhook] Subscribe error:', subscribeData);
      return new Response(JSON.stringify({
        success: false,
        error: 'Falha ao inscrever app no WABA',
        api_error: subscribeData.error?.message || 'Erro desconhecido',
        code: subscribeData.error?.code,
        type: subscribeData.error?.type,
        current_fields: currentFields,
        instructions: 'Por favor, configure manualmente no Meta Business Suite'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Verify the subscription was successful
    console.log('[whatsapp-subscribe-webhook] Verifying subscription...');
    const verifyResponse = await fetch(
      `https://graph.facebook.com/v18.0/${whatsapp_waba_id}/subscribed_apps`,
      {
        method: 'GET',
        headers: { 
          'Authorization': `Bearer ${whatsapp_access_token}` 
        }
      }
    );

    const verifyData = await verifyResponse.json();
    console.log('[whatsapp-subscribe-webhook] Verification:', JSON.stringify(verifyData));

    // Extract new subscribed fields
    let newFields: string[] = [];
    let appSubscribed = false;
    if (verifyData.data && verifyData.data.length > 0) {
      appSubscribed = true;
      for (const app of verifyData.data) {
        if (app.whatsapp_business_api_data?.subscribed_fields) {
          newFields.push(...app.whatsapp_business_api_data.subscribed_fields);
        }
      }
    }

    const response = {
      success: true,
      app_subscribed: appSubscribed,
      waba_id: whatsapp_waba_id,
      phone_number_id: whatsapp_phone_number_id,
      previous_fields: currentFields,
      current_fields: newFields,
      message: appSubscribed 
        ? 'App inscrito no WABA com sucesso! Agora o webhook receberá mensagens.'
        : 'Inscrição enviada. Verifique no Meta Business Suite se o campo "messages" está ativo.',
      next_steps: [
        'Acesse o Meta Business Suite',
        'Vá em Configurações → Webhooks',
        'Confirme que o campo "messages" está inscrito',
        'Envie uma mensagem de teste para verificar'
      ],
      meta_dashboard_url: 'https://developers.facebook.com/apps/',
      webhook_settings_url: 'https://business.facebook.com/settings/whatsapp-business-accounts'
    };

    console.log('[whatsapp-subscribe-webhook] Success:', response.message);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[whatsapp-subscribe-webhook] Error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro interno ao processar inscrição',
      details: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
