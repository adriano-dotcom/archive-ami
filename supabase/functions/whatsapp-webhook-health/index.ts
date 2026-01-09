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

  console.log('[whatsapp-webhook-health] Starting health check...');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const checks: Record<string, any> = {};
  let passedChecks = 0;
  let failedChecks = 0;

  try {
    // 1. Verificar configuração no banco
    console.log('[whatsapp-webhook-health] Checking database configuration...');
    const { data: settings, error } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id, whatsapp_verify_token, company_name')
      .maybeSingle();

    if (error) {
      console.error('[whatsapp-webhook-health] Database error:', error);
      checks.configuration = { 
        status: 'error', 
        error: 'Falha ao carregar configurações do banco de dados',
        details: error.message
      };
      failedChecks++;
    } else if (!settings) {
      console.warn('[whatsapp-webhook-health] No settings found');
      checks.configuration = { 
        status: 'error', 
        error: 'Nenhuma configuração encontrada na tabela nina_settings'
      };
      failedChecks++;
    } else {
      const configDetails = {
        has_access_token: !!settings.whatsapp_access_token,
        has_phone_number_id: !!settings.whatsapp_phone_number_id,
        has_waba_id: !!settings.whatsapp_waba_id,
        has_verify_token: !!settings.whatsapp_verify_token,
        token_length: settings.whatsapp_access_token?.length || 0,
        company_name: settings.company_name || 'Não configurado'
      };
      
      const requiredFields = [
        configDetails.has_access_token,
        configDetails.has_phone_number_id,
        configDetails.has_verify_token
      ];
      
      const allConfigured = requiredFields.every(v => v === true);
      const partiallyConfigured = requiredFields.some(v => v === true);
      
      checks.configuration = {
        status: allConfigured ? 'ok' : partiallyConfigured ? 'warning' : 'error',
        details: configDetails,
        message: allConfigured 
          ? 'Todas as configurações obrigatórias estão presentes'
          : 'Algumas configurações estão faltando'
      };
      
      if (allConfigured) {
        passedChecks++;
      } else {
        failedChecks++;
      }
      
      console.log('[whatsapp-webhook-health] Configuration check:', checks.configuration.status);
    }

    // 2. Verificar API do WhatsApp
    if (settings?.whatsapp_access_token && settings?.whatsapp_phone_number_id) {
      console.log('[whatsapp-webhook-health] Checking WhatsApp API connection...');
      
      try {
        const phoneResponse = await fetch(
          `https://graph.facebook.com/v18.0/${settings.whatsapp_phone_number_id}`,
          {
            headers: { 
              'Authorization': `Bearer ${settings.whatsapp_access_token}` 
            }
          }
        );

        if (phoneResponse.ok) {
          const phoneData = await phoneResponse.json();
          checks.whatsapp_api = {
            status: 'ok',
            phone_number_id: settings.whatsapp_phone_number_id,
            waba_id: settings.whatsapp_waba_id || 'Não configurado',
            display_phone_number: phoneData.display_phone_number || 'N/A',
            verified_name: phoneData.verified_name || 'N/A',
            quality_rating: phoneData.quality_rating || 'N/A',
            platform_type: phoneData.platform_type || 'N/A',
            message: 'Conexão com a API do WhatsApp está funcionando'
          };
          passedChecks++;
          console.log('[whatsapp-webhook-health] WhatsApp API check: ok');
        } else {
          const errorData = await phoneResponse.json().catch(() => ({}));
          checks.whatsapp_api = {
            status: 'error',
            error: errorData.error?.message || 'Falha na conexão com a API do WhatsApp',
            code: errorData.error?.code || phoneResponse.status,
            type: errorData.error?.type || 'unknown',
            message: 'Verifique se o Access Token está correto e não expirou'
          };
          failedChecks++;
          console.error('[whatsapp-webhook-health] WhatsApp API error:', errorData);
        }
      } catch (apiError: unknown) {
        const errorMessage = apiError instanceof Error ? apiError.message : 'Erro desconhecido';
        checks.whatsapp_api = {
          status: 'error',
          error: 'Erro de rede ao conectar com a API do WhatsApp',
          details: errorMessage
        };
        failedChecks++;
        console.error('[whatsapp-webhook-health] WhatsApp API network error:', apiError);
      }
    } else {
      checks.whatsapp_api = { 
        status: 'skipped', 
        reason: 'Configuração incompleta - Access Token ou Phone Number ID ausente',
        message: 'Configure o Access Token e Phone Number ID para verificar a API'
      };
      failedChecks++;
      console.warn('[whatsapp-webhook-health] WhatsApp API check skipped - incomplete config');
    }

    // 3. Verificar configuração do webhook
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`;
    
    checks.webhook = {
      status: settings?.whatsapp_verify_token ? 'ok' : 'warning',
      callback_url: webhookUrl,
      verify_token_configured: !!settings?.whatsapp_verify_token,
      message: settings?.whatsapp_verify_token 
        ? 'Webhook está configurado corretamente'
        : 'Verify Token não está configurado'
    };
    
    if (settings?.whatsapp_verify_token) {
      passedChecks++;
    } else {
      failedChecks++;
    }
    
    console.log('[whatsapp-webhook-health] Webhook check:', checks.webhook.status);

    // 4. Verificar se o webhook está acessível
    console.log('[whatsapp-webhook-health] Checking webhook accessibility...');
    try {
      const webhookTestUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=health_check_test&hub.challenge=test123`;
      const webhookResponse = await fetch(webhookTestUrl, { method: 'GET' });
      
      checks.webhook_accessibility = {
        status: webhookResponse.status === 200 || webhookResponse.status === 403 ? 'ok' : 'warning',
        http_status: webhookResponse.status,
        message: webhookResponse.status === 200 || webhookResponse.status === 403
          ? 'Webhook está acessível externamente'
          : 'Webhook pode não estar acessível'
      };
      
      if (webhookResponse.status === 200 || webhookResponse.status === 403) {
        passedChecks++;
      } else {
        failedChecks++;
      }
    } catch (webhookError: unknown) {
      const errorMessage = webhookError instanceof Error ? webhookError.message : 'Erro desconhecido';
      checks.webhook_accessibility = {
        status: 'error',
        error: 'Não foi possível verificar acessibilidade do webhook',
        details: errorMessage
      };
      failedChecks++;
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[whatsapp-webhook-health] System error:', error);
    checks.system = { 
      status: 'error', 
      error: errorMessage,
      message: 'Erro interno do sistema'
    };
    failedChecks++;
  }

  const overallStatus = failedChecks === 0 ? 'healthy' : passedChecks > 0 ? 'degraded' : 'unhealthy';

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total_checks: passedChecks + failedChecks,
      passed: passedChecks,
      failed: failedChecks
    },
    instructions: {
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook`,
      required_webhook_fields: ['messages', 'message_status_updates'],
      meta_dashboard: 'https://developers.facebook.com/apps/'
    }
  };

  console.log('[whatsapp-webhook-health] Health check completed:', overallStatus);

  return new Response(JSON.stringify(response, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
});
