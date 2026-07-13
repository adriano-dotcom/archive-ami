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


  const startTime = Date.now();
  console.log('[test-elevenlabs-tts] Starting TTS generation...');

  try {
    const { 
      text, 
      voiceId: paramVoiceId, 
      model: paramModel,
      stability: paramStability,
      similarity: paramSimilarity,
      style: paramStyle,
      speed: paramSpeed,
      speakerBoost: paramSpeakerBoost
    } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Texto é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (text.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Texto muito longo (máximo 1000 caracteres)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load ElevenLabs settings from nina_settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('elevenlabs_api_key, elevenlabs_voice_id, elevenlabs_model, elevenlabs_stability, elevenlabs_similarity_boost, elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost, elevenlabs_key_in_vault')
      .maybeSingle();

    if (settingsError) {
      console.error('[test-elevenlabs-tts] Error loading settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Erro ao carregar configurações' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from Vault or fallback to table
    let apiKey = settings?.elevenlabs_api_key;
    if (settings?.elevenlabs_key_in_vault) {
      try {
        const { data: vaultKey } = await supabase.rpc('get_vault_secret', { 
          secret_name: 'vault_elevenlabs_key' 
        });
        if (vaultKey) {
          apiKey = vaultKey;
          console.log('[test-elevenlabs-tts] Usando API key do Vault');
        }
      } catch (e) {
        console.log('[test-elevenlabs-tts] Falha ao buscar do Vault, usando tabela');
      }
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API Key da ElevenLabs não configurada. Configure em Settings → APIs.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use passed parameters or fall back to system settings
    const voiceId = paramVoiceId || settings?.elevenlabs_voice_id || '9BWtsMINqrJLrRacOk9x'; // Aria default
    const model = paramModel || settings?.elevenlabs_model || 'eleven_turbo_v2_5';
    const stability = paramStability ?? settings?.elevenlabs_stability ?? 0.75;
    const similarity = paramSimilarity ?? settings?.elevenlabs_similarity_boost ?? 0.80;
    const style = paramStyle ?? settings?.elevenlabs_style ?? 0.30;
    const speed = paramSpeed ?? settings?.elevenlabs_speed ?? 1.0;
    const speakerBoost = paramSpeakerBoost ?? settings?.elevenlabs_speaker_boost ?? true;

    console.log(`[test-elevenlabs-tts] Generating audio with voice: ${voiceId}, model: ${model}`);
    console.log(`[test-elevenlabs-tts] Settings: stability=${stability}, similarity=${similarity}, style=${style}, speed=${speed}, speakerBoost=${speakerBoost}`);
    console.log(`[test-elevenlabs-tts] Text length: ${text.length} chars`);

    // Call ElevenLabs API
    const elevenLabsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability,
            similarity_boost: similarity,
            style,
            use_speaker_boost: speakerBoost,
          },
        }),
      }
    );

    if (!elevenLabsResponse.ok) {
      const errorText = await elevenLabsResponse.text();
      console.error('[test-elevenlabs-tts] ElevenLabs API error:', elevenLabsResponse.status, errorText);
      
      if (elevenLabsResponse.status === 401) {
        // Parse the error to get more details
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson?.detail?.status === 'detected_unusual_activity') {
            return new Response(
              JSON.stringify({ error: 'ElevenLabs bloqueou o Free Tier para esta conta. É necessário um plano pago para continuar.' }),
              { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch {}
        
        return new Response(
          JSON.stringify({ error: 'API Key da ElevenLabs inválida' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (elevenLabsResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Erro na API ElevenLabs: ${elevenLabsResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert audio to base64
    const arrayBuffer = await elevenLabsResponse.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64 using built-in btoa
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const audioBase64 = btoa(binary);

    const duration = Date.now() - startTime;
    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(1);
    
    console.log(`[test-elevenlabs-tts] Audio generated successfully in ${duration}ms (${sizeKB}KB)`);

    return new Response(
      JSON.stringify({
        success: true,
        audioContent: audioBase64,
        format: 'mp3',
        duration_ms: duration,
        size_kb: parseFloat(sizeKB),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-elevenlabs-tts] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
