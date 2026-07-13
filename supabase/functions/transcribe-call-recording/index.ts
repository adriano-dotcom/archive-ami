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
    const { call_log_id } = await req.json();
    
    if (!call_log_id) {
      return new Response(
        JSON.stringify({ error: 'call_log_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[transcribe-call-recording] Iniciando transcrição para call_log: ${call_log_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar o call_log
    const { data: callLog, error: fetchError } = await supabase
      .from('call_logs')
      .select('*')
      .eq('id', call_log_id)
      .single();

    if (fetchError || !callLog) {
      console.error('[transcribe-call-recording] Call log não encontrado:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Call log não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!callLog.record_url) {
      return new Response(
        JSON.stringify({ error: 'Call log não possui gravação' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualizar status para processing
    await supabase
      .from('call_logs')
      .update({ transcription_status: 'processing' })
      .eq('id', call_log_id);

    console.log(`[transcribe-call-recording] Baixando áudio de: ${callLog.record_url}`);

    // Baixar o áudio da gravação com redirect manual para evitar loops
    const audioResponse = await fetch(callLog.record_url, {
      redirect: 'manual',
    });
    
    // Se for redirect, seguir manualmente uma vez
    let finalResponse = audioResponse;
    if (audioResponse.status >= 300 && audioResponse.status < 400) {
      const redirectUrl = audioResponse.headers.get('location');
      if (redirectUrl) {
        console.log(`[transcribe-call-recording] Seguindo redirect para: ${redirectUrl}`);
        finalResponse = await fetch(redirectUrl, { redirect: 'manual' });
        
        // Se ainda for redirect, tentar mais uma vez
        if (finalResponse.status >= 300 && finalResponse.status < 400) {
          const secondRedirect = finalResponse.headers.get('location');
          if (secondRedirect) {
            console.log(`[transcribe-call-recording] Seguindo segundo redirect para: ${secondRedirect}`);
            finalResponse = await fetch(secondRedirect);
          }
        }
      }
    }
    
    if (!finalResponse.ok && finalResponse.status < 300) {
      throw new Error(`Erro ao baixar áudio: ${finalResponse.status}`);
    }

    const audioBlob = await finalResponse.blob();
    console.log(`[transcribe-call-recording] Áudio baixado: ${audioBlob.size} bytes, tipo: ${audioBlob.type}`);

    // Buscar API key do ElevenLabs (mesmo usado para TTS)
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('elevenlabs_api_key, elevenlabs_key_in_vault')
      .single();

    let elevenlabsApiKey = settings?.elevenlabs_api_key;
    
    // Se a key está no vault, buscar de lá
    if (settings?.elevenlabs_key_in_vault) {
      const { data: vaultKey } = await supabase.rpc('get_vault_secret', { secret_name: 'vault_elevenlabs_key' });
      if (vaultKey) elevenlabsApiKey = vaultKey;
    }

    if (!elevenlabsApiKey) {
      throw new Error('ELEVENLABS_API_KEY não configurada');
    }

    // Criar FormData para ElevenLabs Scribe
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.mp3');
    formData.append('model_id', 'scribe_v1');
    formData.append('language_code', 'por');

    console.log('[transcribe-call-recording] Enviando para ElevenLabs Scribe...');

    const whisperResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenlabsApiKey,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error('[transcribe-call-recording] Erro Whisper:', whisperResponse.status, errorText);
      
      // Atualizar status para failed
      await supabase
        .from('call_logs')
        .update({ transcription_status: 'failed' })
        .eq('id', call_log_id);

      throw new Error(`Erro na transcrição: ${whisperResponse.status}`);
    }

    const result = await whisperResponse.json();
    const transcription = result.text || '';
    console.log(`[transcribe-call-recording] Transcrição concluída: ${transcription.substring(0, 100)}...`);

    // Salvar transcrição no banco
    const { error: updateError } = await supabase
      .from('call_logs')
      .update({
        transcription: transcription.trim(),
        transcription_status: 'completed',
      })
      .eq('id', call_log_id);

    if (updateError) {
      console.error('[transcribe-call-recording] Erro ao salvar transcrição:', updateError);
      throw updateError;
    }

    console.log(`[transcribe-call-recording] Transcrição salva com sucesso para call_log: ${call_log_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        transcription: transcription.trim(),
        call_log_id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[transcribe-call-recording] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
