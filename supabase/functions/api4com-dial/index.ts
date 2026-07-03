import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate token format
function validateToken(token: string): { valid: boolean; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token não configurado' };
  }
  
  const trimmedToken = token.trim();
  
  if (trimmedToken.length < 20) {
    return { valid: false, error: 'Token muito curto - verifique se copiou o token completo' };
  }
  
  if (trimmedToken.includes(' ') && !trimmedToken.toLowerCase().startsWith('bearer ')) {
    return { valid: false, error: 'Token contém espaços inválidos' };
  }
  
  return { valid: true };
}

// Validate phone number
function validatePhoneNumber(phone: string): { valid: boolean; error?: string; formatted?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Número de telefone é obrigatório' };
  }
  
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length < 10) {
    return { valid: false, error: 'Número de telefone muito curto (mínimo 10 dígitos)' };
  }
  
  if (cleanPhone.length > 15) {
    return { valid: false, error: 'Número de telefone muito longo (máximo 15 dígitos)' };
  }
  
  // Format for API4Com - Brazilian numbers need country code with + prefix
  let formattedPhone = cleanPhone;
  if (!cleanPhone.startsWith('55') && cleanPhone.length >= 10 && cleanPhone.length <= 11) {
    formattedPhone = '+55' + cleanPhone;
  } else if (cleanPhone.startsWith('55')) {
    formattedPhone = '+' + cleanPhone;
  } else {
    formattedPhone = '+' + cleanPhone;
  }
  
  return { valid: true, formatted: formattedPhone };
}

// Map API4Com error codes to user-friendly messages
function getErrorMessage(status: number, data: any): string {
  const errorCode = data?.error?.code || data?.code;
  const errorMessage = data?.error?.message || data?.message;
  
  const errorMap: Record<string, string> = {
    'AUTHORIZATION_REQUIRED': 'Token de API inválido ou expirado. Gere um novo token no portal API4Com.',
    'INVALID_TOKEN': 'Token de API inválido. Verifique se o token está correto.',
    'TOKEN_EXPIRED': 'Token expirado. Gere um novo token com TTL -1 (permanente) no portal API4Com.',
    'EXTENSION_NOT_FOUND': 'Ramal não encontrado. Verifique o número do ramal nas configurações.',
    'EXTENSION_OFFLINE': 'Ramal offline. Verifique se o softphone está conectado.',
    'INVALID_PHONE': 'Número de telefone inválido.',
    'RATE_LIMIT_EXCEEDED': 'Limite de requisições excedido. Aguarde alguns segundos.',
  };
  
  if (errorCode && errorMap[errorCode]) {
    return errorMap[errorCode];
  }
  
  switch (status) {
    case 401:
      return 'Autenticação falhou. Verifique se o token de API está correto e não expirou.';
    case 403:
      return 'Acesso negado. Verifique as permissões do token de API.';
    case 404:
      return 'Endpoint não encontrado. Verifique a configuração da API.';
    case 422:
      return `Dados inválidos: ${errorMessage || 'verifique o ramal e número de telefone'}`;
    case 429:
      return 'Muitas requisições. Aguarde alguns segundos e tente novamente.';
    case 500:
    case 502:
    case 503:
      return 'Servidor API4Com indisponível. Tente novamente em alguns minutos.';
    default:
      return errorMessage || `Erro desconhecido (código ${status})`;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard: require authenticated admin/operator caller
    const _token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!_token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    {
      const _authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${_token}` } } });
      const { data: _authData, error: _authErr } = await _authClient.auth.getUser();
      if (_authErr || !_authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: _roleRows } = await _authClient.from('user_roles').select('role').eq('user_id', _authData.user.id);
      if (!(_roleRows || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
    const { contactId, conversationId, phoneNumber, extension: requestExtension } = await req.json();

    console.log('[api4com-dial] === INICIANDO CHAMADA ===');
    console.log('[api4com-dial] Params:', { contactId, conversationId, phoneNumber, requestExtension });

    // Validate phone number
    const phoneValidation = validatePhoneNumber(phoneNumber);
    if (!phoneValidation.valid) {
      console.error('[api4com-dial] Telefone inválido:', phoneValidation.error);
      throw new Error(phoneValidation.error);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get API4Com settings
    console.log('[api4com-dial] Buscando configurações...');
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('api4com_api_token, api4com_default_extension, api4com_enabled, api4com_token_in_vault')
      .maybeSingle();

    if (settingsError) {
      console.error('[api4com-dial] Erro ao buscar configurações:', settingsError);
      throw new Error('Erro ao buscar configurações da API4Com');
    }

    if (!settings?.api4com_enabled) {
      throw new Error('Integração API4Com não está habilitada. Ative em Configurações → APIs.');
    }

    // Get API token from Vault or fallback to table
    let apiToken = settings?.api4com_api_token || '';
    if (settings?.api4com_token_in_vault) {
      try {
        const { data: vaultToken } = await supabase.rpc('get_vault_secret', { 
          secret_name: 'vault_api4com_token' 
        });
        if (vaultToken) {
          apiToken = vaultToken;
          console.log('[api4com-dial] Usando token do Vault');
        }
      } catch (e) {
        console.log('[api4com-dial] Falha ao buscar do Vault, usando tabela');
      }
    }

    // Validate token
    const tokenValidation = validateToken(apiToken);
    if (!tokenValidation.valid) {
      console.error('[api4com-dial] Token inválido:', tokenValidation.error);
      throw new Error(tokenValidation.error);
    }

    // Get extension from request or use default
    const extension = requestExtension || settings.api4com_default_extension || '1000';
    const formattedPhone = phoneValidation.formatted!;

    console.log('[api4com-dial] Configuração válida:', { 
      extension, 
      formattedPhone,
      tokenLength: apiToken.length,
      tokenPrefix: apiToken.substring(0, 10) + '...'
    });

    // Call API4Com Dialer API
    console.log('[api4com-dial] Chamando API4Com...');
    const api4comResponse = await fetch('https://api.api4com.com/api/v1/dialer', {
      method: 'POST',
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extension: extension,
        phone: formattedPhone,
        metadata: {
          gateway: 'nina-crm',
          contactId: contactId,
          conversationId: conversationId,
        }
      }),
    });

    const api4comData = await api4comResponse.json();
    
    console.log('[api4com-dial] Resposta API4Com:', { 
      status: api4comResponse.status, 
      ok: api4comResponse.ok,
      data: api4comData 
    });

    if (!api4comResponse.ok) {
      const errorMsg = getErrorMessage(api4comResponse.status, api4comData);
      console.error('[api4com-dial] Erro API4Com:', errorMsg);
      throw new Error(errorMsg);
    }

    // Create call log entry
    const { data: callLog, error: callLogError } = await supabase
      .from('call_logs')
      .insert({
        contact_id: contactId || null,
        conversation_id: conversationId || null,
        extension: extension,
        phone_number: formattedPhone,
        status: 'dialing',
        api4com_call_id: api4comData.call_id || api4comData.id || null,
        metadata: {
          api4com_response: api4comData,
          initiated_at: new Date().toISOString(),
        }
      })
      .select()
      .single();

    if (callLogError) {
      console.error('[api4com-dial] Erro ao salvar log:', callLogError);
      // Don't throw - call was initiated successfully
    }

    console.log('[api4com-dial] === CHAMADA INICIADA COM SUCESSO ===', { 
      callLogId: callLog?.id,
      api4comCallId: api4comData.call_id || api4comData.id
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Chamada iniciada com sucesso',
        call_id: callLog?.id,
        api4com_call_id: api4comData.call_id || api4comData.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[api4com-dial] === ERRO ===', errorMessage);
    
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
