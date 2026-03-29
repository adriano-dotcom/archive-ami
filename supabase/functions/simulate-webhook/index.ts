import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de DDDs brasileiros para estados e cidades
const dddMap: Record<string, { city: string; state: string }> = {
  '11': { city: 'São Paulo', state: 'SP' }, '12': { city: 'São José dos Campos', state: 'SP' },
  '13': { city: 'Santos', state: 'SP' }, '14': { city: 'Bauru', state: 'SP' },
  '15': { city: 'Sorocaba', state: 'SP' }, '16': { city: 'Ribeirão Preto', state: 'SP' },
  '17': { city: 'São José do Rio Preto', state: 'SP' }, '18': { city: 'Presidente Prudente', state: 'SP' },
  '19': { city: 'Campinas', state: 'SP' }, '21': { city: 'Rio de Janeiro', state: 'RJ' },
  '22': { city: 'Campos dos Goytacazes', state: 'RJ' }, '24': { city: 'Petrópolis', state: 'RJ' },
  '27': { city: 'Vitória', state: 'ES' }, '28': { city: 'Cachoeiro de Itapemirim', state: 'ES' },
  '31': { city: 'Belo Horizonte', state: 'MG' }, '32': { city: 'Juiz de Fora', state: 'MG' },
  '33': { city: 'Governador Valadares', state: 'MG' }, '34': { city: 'Uberlândia', state: 'MG' },
  '35': { city: 'Poços de Caldas', state: 'MG' }, '37': { city: 'Divinópolis', state: 'MG' },
  '38': { city: 'Montes Claros', state: 'MG' }, '41': { city: 'Curitiba', state: 'PR' },
  '42': { city: 'Ponta Grossa', state: 'PR' }, '43': { city: 'Londrina', state: 'PR' },
  '44': { city: 'Maringá', state: 'PR' }, '45': { city: 'Cascavel', state: 'PR' },
  '46': { city: 'Francisco Beltrão', state: 'PR' }, '47': { city: 'Joinville', state: 'SC' },
  '48': { city: 'Florianópolis', state: 'SC' }, '49': { city: 'Chapecó', state: 'SC' },
  '51': { city: 'Porto Alegre', state: 'RS' }, '53': { city: 'Pelotas', state: 'RS' },
  '54': { city: 'Caxias do Sul', state: 'RS' }, '55': { city: 'Santa Maria', state: 'RS' },
  '61': { city: 'Brasília', state: 'DF' }, '62': { city: 'Goiânia', state: 'GO' },
  '64': { city: 'Rio Verde', state: 'GO' }, '63': { city: 'Palmas', state: 'TO' },
  '65': { city: 'Cuiabá', state: 'MT' }, '66': { city: 'Rondonópolis', state: 'MT' },
  '67': { city: 'Campo Grande', state: 'MS' }, '68': { city: 'Rio Branco', state: 'AC' },
  '69': { city: 'Porto Velho', state: 'RO' }, '71': { city: 'Salvador', state: 'BA' },
  '73': { city: 'Ilhéus', state: 'BA' }, '74': { city: 'Juazeiro', state: 'BA' },
  '75': { city: 'Feira de Santana', state: 'BA' }, '77': { city: 'Vitória da Conquista', state: 'BA' },
  '79': { city: 'Aracaju', state: 'SE' }, '81': { city: 'Recife', state: 'PE' },
  '87': { city: 'Petrolina', state: 'PE' }, '82': { city: 'Maceió', state: 'AL' },
  '83': { city: 'João Pessoa', state: 'PB' }, '84': { city: 'Natal', state: 'RN' },
  '85': { city: 'Fortaleza', state: 'CE' }, '88': { city: 'Juazeiro do Norte', state: 'CE' },
  '86': { city: 'Teresina', state: 'PI' }, '89': { city: 'Picos', state: 'PI' },
  '98': { city: 'São Luís', state: 'MA' }, '99': { city: 'Imperatriz', state: 'MA' },
  '91': { city: 'Belém', state: 'PA' }, '93': { city: 'Santarém', state: 'PA' },
  '94': { city: 'Marabá', state: 'PA' }, '92': { city: 'Manaus', state: 'AM' },
  '97': { city: 'Parintins', state: 'AM' }, '95': { city: 'Boa Vista', state: 'RR' },
  '96': { city: 'Macapá', state: 'AP' },
};

function getRegionFromDDD(phoneNumber: string): { city: string; state: string } | null {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const ddd = digits.startsWith('55') && digits.length >= 12 ? digits.substring(2, 4) : digits.substring(0, 2);
  return dddMap[ddd] || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Admin role enforcement ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || supabaseKey;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = claimsData.claims.sub;

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // --- End admin role enforcement ---

    const { phone, name, message } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'phone and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[simulate-webhook] Simulating message from ${phone}: ${message}`);

    // Get phone_number_id from settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_phone_number_id')
      .maybeSingle();

    const phoneNumberId = settings?.whatsapp_phone_number_id || 'test_phone_id';

    // Get or create contact - first try by whatsapp_id, then by phone
    let existingContact = null;
    
    // Try to find by whatsapp_id first (most reliable)
    const { data: contactByWaId } = await supabase
      .from('contacts')
      .select('*')
      .eq('whatsapp_id', phone)
      .maybeSingle();
    
    if (contactByWaId) {
      existingContact = contactByWaId;
    } else {
      // Fallback to phone_number search
      const { data: contactByPhone } = await supabase
        .from('contacts')
        .select('*')
        .eq('phone_number', phone)
        .maybeSingle();
      existingContact = contactByPhone;
    }

    let contactId: string;

    if (existingContact) {
      contactId = existingContact.id;
      // Update name if provided, and ensure whatsapp_id is set
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (name && existingContact.name !== name) updates.name = name;
      if (!existingContact.whatsapp_id) updates.whatsapp_id = phone;
      
      if (Object.keys(updates).length > 1) {
        await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contactId);
      }
      console.log(`[simulate-webhook] Using existing contact: ${contactId}`);
    } else {
      // Extrair cidade/estado do DDD
      const region = getRegionFromDDD(phone);
      
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone_number: phone,
          name: name || null,
          whatsapp_id: phone,
          city: region?.city || null,
          state: region?.state || null,
        })
        .select()
        .single();

      if (contactError) throw contactError;
      contactId = newContact.id;
      console.log(`[simulate-webhook] Created new contact: ${contactId}`, region ? `(${region.city} - ${region.state})` : '');
    }

    // Get or create active conversation (tentar reativar conversa existente)
    const { data: existingConversation } = await supabase
      .from('conversations')
      .select('*')
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .maybeSingle();

    let conversationId: string;
    let conversationStatus: string = 'nina';

    if (existingConversation) {
      conversationId = existingConversation.id;
      conversationStatus = existingConversation.status;
      console.log(`[simulate-webhook] Using existing conversation: ${conversationId}`);
    } else {
      // Buscar conversa INATIVA mais recente para reativar
      const { data: inactiveConversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contactId)
        .eq('is_active', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (inactiveConversation) {
        // Reativar conversa existente mantendo histórico
        const { data: reactivatedConv, error: reactivateError } = await supabase
          .from('conversations')
          .update({
            is_active: true,
            status: 'nina',
            whatsapp_window_start: new Date().toISOString()
          })
          .eq('id', inactiveConversation.id)
          .select()
          .single();

        if (!reactivateError && reactivatedConv) {
          conversationId = reactivatedConv.id;
          conversationStatus = reactivatedConv.status;
          console.log(`[simulate-webhook] Reactivated existing conversation: ${conversationId}`);
        } else {
          throw reactivateError || new Error('Failed to reactivate conversation');
        }
      } else {
        // Criar nova conversa apenas se não existir nenhuma
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({
            contact_id: contactId,
            status: 'nina',
            is_active: true,
          })
          .select()
          .single();

        if (convError) throw convError;
        conversationId = newConversation.id;
        console.log(`[simulate-webhook] Created new conversation: ${conversationId}`);
      }
    }

    // Create message
    const { data: newMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        from_type: 'user',
        type: 'text',
        content: message,
        status: 'delivered',
        whatsapp_message_id: `sim_${Date.now()}`,
      })
      .select()
      .single();

    if (messageError) throw messageError;
    console.log(`[simulate-webhook] Created message: ${newMessage.id}`);

    // Update conversation last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Queue for Nina processing if conversation is in 'nina' status
    let queuedForNina = false;
    if (conversationStatus === 'nina') {
      const { error: queueError } = await supabase
        .from('nina_processing_queue')
        .insert({
          message_id: newMessage.id,
          conversation_id: conversationId,
          contact_id: contactId,
          status: 'pending',
        });

      if (queueError) {
        console.error('[simulate-webhook] Error queuing for Nina:', queueError);
      } else {
        queuedForNina = true;
        console.log(`[simulate-webhook] Queued message for Nina processing`);
        
        // Trigger nina-orchestrator directly (cron jobs não funcionam sem pg_net)
        try {
          const orchestratorUrl = `${supabaseUrl}/functions/v1/nina-orchestrator`;
          console.log('[simulate-webhook] Triggering nina-orchestrator at:', orchestratorUrl);
          
          fetch(orchestratorUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({ triggered_by: 'simulate-webhook' })
          }).catch(err => console.error('[simulate-webhook] Error triggering nina-orchestrator:', err));
        } catch (err) {
          console.error('[simulate-webhook] Failed to trigger nina-orchestrator:', err);
        }
      }
    }

    const result = {
      success: true,
      contact_id: contactId,
      conversation_id: conversationId,
      message_id: newMessage.id,
      queued_for_nina: queuedForNina,
      conversation_status: conversationStatus,
    };

    console.log('[simulate-webhook] Result:', result);

    return new Response(
      JSON.stringify(result),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[simulate-webhook] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
