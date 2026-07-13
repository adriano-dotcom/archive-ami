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
    console.log('[Register WhatsApp] Starting WABA subscription...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get settings from database
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_waba_id, whatsapp_phone_number_id')
      .single();

    if (settingsError || !settings) {
      console.error('[Register WhatsApp] Failed to get settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to get settings', details: settingsError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { whatsapp_access_token, whatsapp_waba_id, whatsapp_phone_number_id } = settings;

    if (!whatsapp_access_token) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp access token not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!whatsapp_waba_id) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp Business Account ID (WABA ID) not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Register WhatsApp] WABA ID: ${whatsapp_waba_id}`);
    console.log(`[Register WhatsApp] Phone Number ID: ${whatsapp_phone_number_id}`);

    // Step 1: Subscribe the WABA to the app (required for receiving webhooks)
    console.log(`[Register WhatsApp] Subscribing WABA ${whatsapp_waba_id} to app...`);
    
    const subscribeUrl = `https://graph.facebook.com/v21.0/${whatsapp_waba_id}/subscribed_apps`;
    
    const subscribeResponse = await fetch(subscribeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsapp_access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const subscribeResult = await subscribeResponse.json();
    console.log('[Register WhatsApp] Subscription result:', JSON.stringify(subscribeResult));

    if (!subscribeResponse.ok) {
      console.error('[Register WhatsApp] Subscription failed:', subscribeResult);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to subscribe WABA to app', 
          details: subscribeResult,
          waba_id: whatsapp_waba_id
        }),
        { status: subscribeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Verify current subscriptions
    console.log('[Register WhatsApp] Verifying subscriptions...');
    const verifyUrl = `https://graph.facebook.com/v21.0/${whatsapp_waba_id}/subscribed_apps`;
    const verifyResponse = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${whatsapp_access_token}`,
      },
    });

    const verifyResult = await verifyResponse.json();
    console.log('[Register WhatsApp] Current subscriptions:', JSON.stringify(verifyResult));

    // Step 3: Get phone number info to confirm it's properly registered
    if (whatsapp_phone_number_id) {
      console.log('[Register WhatsApp] Checking phone number status...');
      const phoneInfoUrl = `https://graph.facebook.com/v21.0/${whatsapp_phone_number_id}`;
      const phoneInfoResponse = await fetch(phoneInfoUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${whatsapp_access_token}`,
        },
      });
      
      const phoneInfoResult = await phoneInfoResponse.json();
      console.log('[Register WhatsApp] Phone info:', JSON.stringify(phoneInfoResult));
    }

    console.log('[Register WhatsApp] ✅ WABA subscription completed successfully!');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'WABA subscribed to app successfully! Real messages should now be received.',
        subscription_result: subscribeResult,
        current_subscriptions: verifyResult,
        waba_id: whatsapp_waba_id,
        phone_number_id: whatsapp_phone_number_id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Register WhatsApp] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
