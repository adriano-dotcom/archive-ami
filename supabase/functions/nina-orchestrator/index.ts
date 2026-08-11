import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripEmojis } from '../_shared/text-sanitize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  system_prompt: string;
  is_default: boolean;
  is_active: boolean;
  detection_keywords: string[];
  greeting_message: string | null;
  handoff_message: string | null;
  qualification_questions: Array<{ order: number; question: string }>;
  audio_response_enabled?: boolean;
  elevenlabs_voice_id?: string | null;
  elevenlabs_model?: string | null;
  elevenlabs_stability?: number | null;
  elevenlabs_similarity_boost?: number | null;
  elevenlabs_style?: number | null;
  elevenlabs_speed?: number | null;
  elevenlabs_speaker_boost?: boolean | null;
}

interface InstallmentsData {
  count: number;
  totalValue: number;
  oldestDueDate: string | null;
  installments: any[];
  insurers: string[];
}

// Interface para contexto do template de cobrança enviado
interface CollectionTemplateContext {
  templateName: string;
  sentAt: string;
  policyNumber?: string;
  value?: string;
  dueDate?: string;
  contactName?: string;
  companyName?: string;
  messageContent?: string;
}

// Keywords que indicam consulta de parcelas/débitos pendentes (para cobrança)
const COLLECTION_QUERY_KEYWORDS = [
  'parcelas em aberto', 'parcela em aberto',
  'quantas parcelas', 'quanto devo', 'quanto eu devo',
  'valores pendentes', 'valor pendente',
  'divida', 'dívida', 'pendencias', 'pendências',
  'quanto está devendo', 'quanto estou devendo',
  'débito', 'debito', 'em atraso', 'atrasado',
  'boleto pendente', 'boletos pendentes',
  'situação financeira', 'situacao financeira',
  'tenho em aberto', 'a pagar', 'minha dívida',
  'quanto falta pagar', 'parcelas atrasadas',
  'parcelas vencidas', 'saldo devedor'
];

// Keywords que indicam pergunta sobre seguradora
const INSURER_QUERY_KEYWORDS = [
  'qual seguradora', 'seguradora é essa', 'de qual seguradora',
  'qual a seguradora', 'nome da seguradora', 'seguradora das parcelas',
  'seguro é de qual', 'é de qual seguro', 'de qual companhia',
  'qual companhia de seguro', 'qual empresa de seguro'
];

// Function to detect if message asks about insurer
function isInsurerQuery(messageContent: string): boolean {
  const content = messageContent.toLowerCase();
  return INSURER_QUERY_KEYWORDS.some(keyword => content.includes(keyword));
}

// Function to detect if message is a collection/debt query
function isCollectionQuery(messageContent: string): boolean {
  const content = messageContent.toLowerCase();
  return COLLECTION_QUERY_KEYWORDS.some(keyword => content.includes(keyword)) || isInsurerQuery(content);
}

// Function to fetch collection template context (template de cobrança enviado recentemente)
async function fetchCollectionTemplateContext(
  supabase: any,
  conversationId: string
): Promise<CollectionTemplateContext | null> {
  try {
    // Buscar mensagens de template nas últimas 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: templateMessages } = await supabase
      .from('messages')
      .select('content, metadata, sent_at')
      .eq('conversation_id', conversationId)
      .eq('from_type', 'nina')
      .gte('sent_at', oneDayAgo)
      .not('metadata', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(10);
    
    if (!templateMessages || templateMessages.length === 0) {
      console.log('[Nina] No recent template messages found');
      return null;
    }
    
    // Encontrar o template de cobrança mais recente
    const collectionTemplate = templateMessages.find((m: any) => {
      const metadata = m.metadata;
      if (!metadata?.is_template) return false;
      
      const templateName = (metadata.template_name || '').toLowerCase();
      return templateName.includes('cobranca') || 
             templateName.includes('pessoa_fisica') ||
             templateName.includes('collection') ||
             templateName.includes('pagamento') ||
             templateName.includes('parcela') ||
             templateName.includes('boleto') ||
             templateName.includes('vencimento');
    });
    
    if (!collectionTemplate) {
      console.log('[Nina] No collection template found in recent messages');
      return null;
    }
    
    const metadata = collectionTemplate.metadata;
    const variables = metadata.variables || [];
    const headerVars = metadata.header_variables || [];
    
    console.log('[Nina] 📋 Collection template found:', {
      templateName: metadata.template_name,
      variables: variables,
      headerVars: headerVars,
      sentAt: collectionTemplate.sent_at
    });
    
    // Parsear as variáveis baseado na estrutura típica:
    // Header: nome do contato
    // Body: [0]=nome_ou_empresa, [1]=apolice, [2]=valor, [3]=vencimento OU
    //       [0]=apolice, [1]=valor, [2]=vencimento (depende do template)
    let policyNumber: string | undefined;
    let value: string | undefined;
    let dueDate: string | undefined;
    let contactName: string | undefined;
    let companyName: string | undefined;
    
    // Header geralmente é o nome do contato
    contactName = headerVars[0] || undefined;
    
    // Detectar padrão das variáveis do body
    if (variables.length >= 3) {
      // Verificar se primeira variável parece ser apólice (numérico)
      const firstVar = String(variables[0] || '');
      if (/^\d+$/.test(firstVar.replace(/[\s.-]/g, ''))) {
        // Padrão: [apólice, valor, vencimento]
        policyNumber = variables[0];
        value = variables[1];
        dueDate = variables[2];
      } else {
        // Padrão: [nome/empresa, apólice, valor, vencimento] ou similar
        companyName = variables[0];
        policyNumber = variables[1];
        value = variables[2];
        dueDate = variables[3];
      }
    } else if (variables.length === 2) {
      // Padrão simplificado: [valor, vencimento]
      value = variables[0];
      dueDate = variables[1];
    }
    
    return {
      templateName: metadata.template_name,
      sentAt: collectionTemplate.sent_at,
      policyNumber: policyNumber,
      value: value,
      dueDate: dueDate,
      contactName: contactName,
      companyName: companyName,
      messageContent: collectionTemplate.content
    };
  } catch (error) {
    console.error('[Nina] Error fetching collection template context:', error);
    return null;
  }
}

// Function to fetch and sum pending installments for a contact
async function fetchContactInstallments(supabase: any, contactId: string): Promise<InstallmentsData | null> {
  try {
    // 1. Buscar parcelas primeiro (sem JOIN para evitar problemas de foreign key)
    const { data: installments, error: instError } = await supabase
      .from('installments')
      .select('id, value, due_date, days_overdue, status, installment_number, policy_id')
      .eq('contact_id', contactId)
      .in('status', ['pending', 'overdue', 'negotiating'])
      .order('due_date', { ascending: true });
    
    if (instError) {
      console.error('[Nina] Error fetching installments:', instError);
      return null;
    }
    
    if (!installments || installments.length === 0) {
      console.log('[Nina] No pending installments found for contact');
      return null;
    }

    // 2. Extrair policy_ids únicos e buscar seguradoras separadamente
    const policyIds = [...new Set(installments.map((i: any) => i.policy_id).filter(Boolean))];
    let policiesMap: Record<string, { insurer: string; policy_number: string }> = {};
    
    if (policyIds.length > 0) {
      const { data: policies, error: polError } = await supabase
        .from('policies')
        .select('id, insurer, policy_number')
        .in('id', policyIds);
      
      if (polError) {
        console.warn('[Nina] Error fetching policies:', polError);
      } else if (policies) {
        policies.forEach((p: any) => {
          policiesMap[p.id] = { insurer: p.insurer, policy_number: p.policy_number };
        });
        console.log(`[Nina] 📋 Found ${policies.length} policies for ${policyIds.length} policy_ids`);
      }
    }

    // 3. Combinar dados de parcelas com informações das apólices
    const enrichedInstallments = installments.map((inst: any) => ({
      ...inst,
      policies: policiesMap[inst.policy_id] || null
    }));

    const totalValue = enrichedInstallments.reduce((sum: number, inst: any) => 
      sum + parseFloat(inst.value || 0), 0);
    const oldestDueDate = enrichedInstallments[0]?.due_date || null;
    
    // 4. Extrair seguradoras únicas
    const insurersSet = new Set<string>();
    enrichedInstallments.forEach((inst: any) => {
      if (inst.policies?.insurer) {
        insurersSet.add(inst.policies.insurer);
      }
    });
    const insurers = Array.from(insurersSet);
    
    console.log(`[Nina] 💰 Found ${enrichedInstallments.length} pending installments, total: R$ ${totalValue.toFixed(2)}, insurers: ${insurers.join(', ') || 'N/A'}`);
    
    return {
      count: enrichedInstallments.length,
      totalValue,
      oldestDueDate,
      installments: enrichedInstallments,
      insurers
    };
  } catch (error) {
    console.error('[Nina] Error in fetchContactInstallments:', error);
    return null;
  }
}


// ===== OUT OF SCOPE DETECTION =====
// Removed — no longer applicable in OrbePet context.
// The detectOutOfScopeInsurance function returns a no-op result.

interface OutOfScopeResult {
  isOutOfScope: boolean;
  insuranceType: string | null;
  friendlyName: string | null;
  detectedKeyword: string | null;
}

function detectOutOfScopeInsurance(_messageContent: string, _currentAgentSlug: string | null): OutOfScopeResult {
  return { isOutOfScope: false, insuranceType: null, friendlyName: null, detectedKeyword: null };
}

// ===== TRANSFER TO HUMAN DETECTION =====
// Keywords que indicam confirmação de transferência
const TRANSFER_CONFIRMATION_KEYWORDS = [
  'sim', 'pode', 'ok', 'quero', 'por favor', 'pode sim', 
  'quero sim', 'tá', 'tá bom', 'ta bom', 'transfira', 'passa', 
  'pode transferir', 'quero falar', 'sim por favor', 'claro',
  'pode ser', 'isso', 'isso mesmo', 'quero sim', 'aceito'
];

// Padrões que indicam que Nina ofereceu transferência
const TRANSFER_OFFER_PATTERNS = [
  /transferir.*especialista/i,
  /encaminhar.*atendente/i,
  /passar.*humano/i,
  /falar.*corretor/i,
  /transferir.*você/i,
  /posso\s+transferir/i,
  /quer\s+falar.*corretor/i,
  /quer\s+falar.*atendente/i,
  /gostaria.*falar.*humano/i,
  /encaminh.*para.*equipe/i,
  /passar.*para.*equipe/i
];

// Keywords para pedido direto de transferência
const DIRECT_TRANSFER_KEYWORDS = [
  // Pedidos diretos
  'quero falar com humano',
  'quero um atendente',
  'falar com pessoa',
  'atendente humano',
  'atendimento humano',
  'quero falar com gente',
  'quero falar com corretor',
  'falar com corretor',
  
  // Variações com "um humano"
  'falar com um humano',
  'quero falar com um humano',
  'preciso de um humano',
  'preciso falar com humano',
  'preciso de atendimento humano',
  
  // "me coloque/coloca para falar"
  'me coloque para falar',
  'me coloca pra falar',
  'me coloca para falar',
  'coloque para falar com humano',
  'coloca pra falar com humano',
  
  // Pedir para transferir
  'me transfere',
  'me transfere para humano',
  'me transfere pra humano',
  'me transfira',
  'me transfira para humano',
  
  // Pedir para passar
  'me passe para humano',
  'me passa para humano',
  'me passa pra humano',
  'passar para atendente',
  'passar pra alguém',
  'passar pra alguem',
  
  // Conectar
  'me conecta com humano',
  'me conecte com humano',
  'me conecta com atendente',
  
  // Falar com alguém/pessoa real
  'falar com alguém',
  'falar com alguem',
  'falar com uma pessoa',
  'falar com pessoa real',
  'pessoa de verdade',
  'quero atendente humano',
  
  // Não quero robô/bot
  'não quero falar com robô',
  'nao quero falar com robo',
  'não quero falar com bot',
  'nao quero falar com bot',
  'não quero robô',
  'nao quero robo',
  'chega de robô',
  'chega de robo',
  
  // Variações simplificadas
  'falar com humano',
  'passa pra humano',
  'transfere pra humano',
  'quero humano'
];

// Detect direct transfer request
function detectDirectTransferRequest(messageContent: string): boolean {
  const normalized = messageContent.toLowerCase().trim();
  return DIRECT_TRANSFER_KEYWORDS.some(keyword => 
    normalized.includes(keyword)
  );
}

// Detect transfer confirmation (user said "sim" after Nina offered transfer)
function detectTransferConfirmation(
  currentMessage: string, 
  recentMessages: any[]
): boolean {
  const normalizedMessage = currentMessage.toLowerCase().trim();
  
  // Check if current message is a confirmation
  const isConfirmation = TRANSFER_CONFIRMATION_KEYWORDS.some(keyword => 
    normalizedMessage === keyword || 
    normalizedMessage.startsWith(keyword + ' ') ||
    normalizedMessage.startsWith(keyword + ',') ||
    normalizedMessage.startsWith(keyword + '.')
  );
  
  if (!isConfirmation) return false;
  
  // Check if last Nina message offered transfer
  const lastNinaMessage = recentMessages
    .filter((m: any) => m.from_type === 'nina')
    .slice(-1)[0];
  
  if (!lastNinaMessage?.content) return false;
  
  return TRANSFER_OFFER_PATTERNS.some(pattern => 
    pattern.test(lastNinaMessage.content)
  );
}

// Find online agent (last_active within 5 minutes, sorted by fewest active conversations)
async function findOnlineAgent(supabase: any): Promise<{
  id: string;
  name: string;
  email: string;
} | null> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  // Get agents online (last_active within 5 min, status active)
  const { data: onlineAgents, error } = await supabase
    .from('team_members')
    .select('id, name, email')
    .eq('status', 'active')
    .gte('last_active', fiveMinutesAgo)
    .order('last_active', { ascending: false });
  
  if (error) {
    console.error('[Nina] Error fetching online agents:', error);
    return null;
  }
  
  if (!onlineAgents || onlineAgents.length === 0) {
    console.log('[Nina] Nenhum agente online encontrado');
    return null;
  }
  
  console.log(`[Nina] 👥 ${onlineAgents.length} agente(s) online: ${onlineAgents.map((a: any) => a.name).join(', ')}`);
  
  // Get conversation counts for each agent to do load balancing
  const agentsWithCounts = await Promise.all(
    onlineAgents.map(async (agent: any) => {
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_user_id', agent.id)
        .eq('status', 'human')
        .eq('is_active', true);
      
      return {
        ...agent,
        activeConversations: count || 0
      };
    })
  );
  
  // Sort by fewest active conversations (round-robin load balancing)
  agentsWithCounts.sort((a: any, b: any) => 
    a.activeConversations - b.activeConversations
  );
  
  const selectedAgent = agentsWithCounts[0];
  console.log(`[Nina] 🎯 Agente selecionado: ${selectedAgent.name} (${selectedAgent.activeConversations} conversas ativas)`);
  
  return selectedAgent;
}
// ===== END TRANSFER TO HUMAN DETECTION =====

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 120/min per IP (heavy AI function)
  {
    const _rlIp = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const _rlClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: _rlAllowed } = await _rlClient.rpc('check_rate_limit', {
      _key: `nina-orchestrator:${_rlIp}`, _max: 120, _window_seconds: 60,
    });
    if (_rlAllowed === false) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }
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


  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Nina] Starting orchestration...');

    // Claim batch of messages to process
    const { data: queueItems, error: claimError } = await supabase
      .rpc('claim_nina_processing_batch', { p_limit: 10 });

    if (claimError) {
      console.error('[Nina] Error claiming batch:', claimError);
      throw claimError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('[Nina] No messages to process');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Nina] Processing ${queueItems.length} messages`);

    // Get Nina settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('*')
      .maybeSingle();

    if (!settings) {
      console.log('[Nina] Sistema não configurado, marcando mensagens como não processadas');
      for (const item of queueItems) {
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: 'failed', 
            processed_at: new Date().toISOString(),
            error_message: 'Sistema não configurado - acesse /settings para configurar'
          })
          .eq('id', item.id);
      }
      return new Response(JSON.stringify({ 
        processed: 0, 
        reason: 'system_not_configured',
        message: 'Acesse /settings para configurar o sistema' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if Nina is active
    if (!settings.is_active) {
      console.log('[Nina] Nina is disabled, skipping all messages');
      for (const item of queueItems) {
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: 'completed', 
            processed_at: new Date().toISOString(),
            error_message: 'Nina disabled - message not processed'
          })
          .eq('id', item.id);
      }
      return new Response(JSON.stringify({ processed: 0, reason: 'nina_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load all active agents
    const { data: agents } = await supabase
      .from('agents')
      .select('*')
      .eq('is_active', true);

    const activeAgents = (agents || []) as Agent[];
    const defaultAgent = activeAgents.find(a => a.is_default);
    
    console.log(`[Nina] Loaded ${activeAgents.length} active agents`);

    let processed = 0;

    for (const item of queueItems) {
      try {
        // 🔒 RACE CONDITION FIX: Verificar se item ainda está pendente de processamento
        // (pode ter sido agregado por outro item na mesma iteração)
        const { data: currentItem } = await supabase
          .from('nina_processing_queue')
          .select('status, error_message')
          .eq('id', item.id)
          .single();
        
        // Se já foi agregado ou processado, pular
        if (currentItem?.status === 'completed' || 
            currentItem?.error_message === 'Aggregated with other messages') {
          console.log(`[Nina] ⏭️ Item ${item.id} já foi agregado, pulando...`);
          continue;
        }
        
        await processQueueItem(supabase, lovableApiKey, item, settings, activeAgents, defaultAgent);
        
        // 🛡️ SAFETY NET: Check if message was marked as processed but no response was queued
        // This catches "lost responses" where early returns set processed_by_nina=true without enqueuing a reply
        try {
          const { data: processedMsg } = await supabase
            .from('messages')
            .select('id, processed_by_nina, conversation_id, content')
            .eq('id', item.message_id)
            .single();
          
          if (processedMsg?.processed_by_nina === true) {
            // Check if any response was queued for this message
            const { data: queuedResponses } = await supabase
              .from('send_queue')
              .select('id')
              .eq('conversation_id', processedMsg.conversation_id)
              .filter('metadata->>response_to_message_id', 'eq', item.message_id)
              .in('status', ['pending', 'processing', 'completed'])
              .limit(1);
            
            // Also check if a nina/human message was already inserted after this message
            const { data: subsequentResponse } = await supabase
              .from('messages')
              .select('id')
              .eq('conversation_id', processedMsg.conversation_id)
              .in('from_type', ['nina', 'human'])
              .gt('sent_at', new Date(Date.now() - 60000).toISOString()) // last 60s
              .limit(1);
            
            const hasResponse = (queuedResponses && queuedResponses.length > 0) || 
                                (subsequentResponse && subsequentResponse.length > 0);
            
            if (!hasResponse) {
              console.error(`[Nina] 🛡️ SAFETY NET: Message ${item.message_id} was processed but NO response was queued!`);
              console.error(`[Nina] 🛡️ Message content: "${processedMsg.content?.substring(0, 80)}..."`);
              
              // Check if window is still open
              const { data: conv } = await supabase
                .from('conversations')
                .select('whatsapp_window_start, contact_id, status')
                .eq('id', processedMsg.conversation_id)
                .single();
              
              // Only enqueue safety response if conversation is still in nina mode and window is open
              if (conv?.status === 'nina' && conv?.whatsapp_window_start) {
                const windowStart = new Date(conv.whatsapp_window_start);
                const windowOpen = (Date.now() - windowStart.getTime()) < 24 * 60 * 60 * 1000;
                
                if (windowOpen) {
                  console.log(`[Nina] 🛡️ Enqueuing safety-net follow-up response`);
                  
                  // Get contact name for personalized message
                  const { data: contact } = await supabase
                    .from('contacts')
                    .select('name, call_name')
                    .eq('id', conv.contact_id)
                    .single();
                  
                  const contactName = contact?.call_name || contact?.name || 'Cliente';
                  const safetyMessage = `Oi ${contactName}! Desculpa a demora, posso te ajudar com algo?`;
                  
                  await supabase
                    .from('send_queue')
                    .insert({
                      conversation_id: processedMsg.conversation_id,
                      contact_id: conv.contact_id,
                      content: safetyMessage,
                      from_type: 'nina',
                      message_type: 'text',
                      priority: 1,
                      metadata: {
                        response_to_message_id: item.message_id,
                        safety_net: true,
                        reason: 'No response was queued after processing'
                      }
                    });
                  
                  console.log(`[Nina] 🛡️ Safety net response queued successfully`);
                }
              }
            }
          }
        } catch (safetyError) {
          console.error('[Nina] 🛡️ Safety net check failed (non-critical):', safetyError);
        }
        
        // Mark as completed
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: 'completed', 
            processed_at: new Date().toISOString() 
          })
          .eq('id', item.id);
        
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Nina] Error processing item ${item.id}:`, error);
        
        // Mark as failed with retry
        const newRetryCount = (item.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < 3;
        
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: shouldRetry ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: errorMessage,
            scheduled_for: shouldRetry 
              ? new Date(Date.now() + newRetryCount * 30000).toISOString() 
              : null
          })
          .eq('id', item.id);
      }
    }

    console.log(`[Nina] Processed ${processed}/${queueItems.length} messages`);

    return new Response(JSON.stringify({ processed, total: queueItems.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Nina] Orchestrator error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Determine which agent should handle the conversation
function detectAgent(
  messageContent: string, 
  conversation: any, 
  agents: Agent[], 
  defaultAgent: Agent | undefined
): { agent: Agent | null; isHandoff: boolean } {
  const content = messageContent.toLowerCase();
  
  console.log('[Nina][Routing] ========== INÍCIO ROTEAMENTO DE AGENTE ==========');
  console.log('[Nina][Routing] Mensagem analisada:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
  console.log('[Nina][Routing] Conversation ID:', conversation.id);
  console.log('[Nina][Routing] Agente atual ID:', conversation.current_agent_id || 'nenhum');
  console.log('[Nina][Routing] Total de agentes ativos:', agents.length);
  console.log('[Nina][Routing] Agentes disponíveis:', agents.map(a => `${a.name} (${a.slug})`).join(', '));
  
  // PRIORIDADE 1: Se conversa é de prospecção ativa, usar Atlas
  const conversationMetadata = conversation.metadata || {};
  console.log('[Nina][Routing] Metadata da conversa:', JSON.stringify(conversationMetadata));
  
  if (conversationMetadata.origin === 'prospeccao') {
    console.log('[Nina][Routing] 🎯 Conversa de PROSPECÇÃO detectada!');
    const atlasAgent = agents.find(a => a.slug === 'atlas');
    if (atlasAgent) {
      console.log('[Nina][Routing] → Roteando para Atlas (agente de prospecção)');
      console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
      return { agent: atlasAgent, isHandoff: false };
    } else {
      console.log('[Nina][Routing] ⚠️ Atlas não encontrado, continuando verificação...');
    }
  }
  
  // PRIORIDADE 2: Verificar keywords para permitir handoffs pós-triagem
  console.log('[Nina][Routing] --- Checando keywords dos agentes especializados ---');
  
  for (const agent of agents) {
    if (agent.is_default) {
      console.log(`[Nina][Routing] ⏭️ Pulando agente default: ${agent.name}`);
      continue;
    }
    
    const agentKeywords = agent.detection_keywords || [];
    console.log(`[Nina][Routing] Testando agente: ${agent.name} (${agent.slug})`);
    console.log(`[Nina][Routing] Keywords configuradas (${agentKeywords.length} total): [${agentKeywords.slice(0, 5).join(', ')}${agentKeywords.length > 5 ? '...' : ''}]`);
    
    const matchedKeyword = agentKeywords.find(keyword => 
      content.includes(keyword.toLowerCase())
    );
    
    if (matchedKeyword) {
      console.log(`[Nina][Routing] ✅ MATCH! Keyword encontrada: "${matchedKeyword}"`);
      console.log(`[Nina][Routing] Agente selecionado: ${agent.name} (${agent.slug})`);
      const isNewHandoff = conversation.current_agent_id !== agent.id;
      console.log(`[Nina][Routing] É handoff novo?: ${isNewHandoff}`);
      console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
      return { agent, isHandoff: isNewHandoff };
    } else {
      console.log(`[Nina][Routing] ❌ Nenhuma keyword de ${agent.name} encontrada`);
    }
  }
  
  console.log('[Nina][Routing] --- Nenhum match de keyword encontrado ---');
  
  // Se não houver match de keyword, continuar com agente atual
  if (conversation.current_agent_id) {
    const currentAgent = agents.find(a => a.id === conversation.current_agent_id);
    if (currentAgent) {
      console.log(`[Nina][Routing] 🔄 Continuando com agente já atribuído: ${currentAgent.name} (${currentAgent.slug})`);
      console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
      return { agent: currentAgent, isHandoff: false };
    } else {
      console.log(`[Nina][Routing] ⚠️ Agente atual ${conversation.current_agent_id} não encontrado na lista ativa`);
    }
  }
  
  // Return default agent
  console.log(`[Nina][Routing] 📌 Usando agente DEFAULT: ${defaultAgent?.name || 'NENHUM'} (${defaultAgent?.slug || 'n/a'})`);
  console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
  return { agent: defaultAgent || null, isHandoff: false };
}

// Check if message is a prospecting rejection (hard rejection - wrong number, no interest, etc.)
function isProspectingRejection(messageContent: string): boolean {
  const content = messageContent.toLowerCase().trim();
  
  // First check if it's a soft rejection - those should be handled differently
  if (isSoftRejection(content)) {
    return false;
  }
  
  const rejectionPhrases = [
    'não sou da empresa', 'nao sou da empresa',
    'não trabalho', 'nao trabalho',
    'número errado', 'numero errado',
    'não é comigo', 'nao e comigo',
    'não tenho interesse', 'nao tenho interesse',
    'não quero', 'nao quero',
    'sem interesse',
    'errou o número', 'errou o numero',
    'ligou errado',
    'não conheço', 'nao conheco',
    'empresa errada',
    'pare de', 'para de',
    'não me ligue', 'nao me ligue',
    'não mande', 'nao mande',
    'remove', 'remova',
    // Novas frases de rejeição
    'esse número não é', 'esse numero nao e',
    'não é da empresa', 'nao e da empresa',
    'esse telefone não é', 'esse telefone nao e',
    'engano',
    'número particular', 'numero particular',
    'celular pessoal', 'meu pessoal',
    'não é comercial', 'nao e comercial',
    'pessoal esse número', 'pessoal esse numero',
    // Recusas agressivas
    'sai fora', 'me deixa', 'para com isso',
    'perturbando', 'encher o saco', 'chato',
    // Contexto transportadora
    'não sou transportadora', 'nao sou transportadora',
    'não tenho caminhão', 'nao tenho caminhao',
    'não faço transporte', 'nao faco transporte',
    'vendi a empresa', 'fechou a empresa', 'empresa fechada',
    // Pedidos para parar
    'não me mande mais', 'nao me mande mais',
    'não envie mais', 'nao envie mais',
    'bloquear', 'denunciar', 'spam',
    // Número/contato incorreto
    'não é aqui', 'nao e aqui',
    'mandou errado', 'trocou de número', 'trocou de numero',
    'esse whatsapp não é', 'esse whatsapp nao e',
    'esse zap não é', 'esse zap nao e',
    'não sou eu', 'nao sou eu',
    'sou outra pessoa', 'não é meu', 'nao e meu',
    'número antigo', 'numero antigo', 'mudou de dono'
  ];
  
  return rejectionPhrases.some(phrase => content.includes(phrase));
}

// Check if the message is ONLY a simple greeting (no substantive question/request).
// Used to decide whether to send the fixed greeting_message or let the AI answer.
function isPureGreeting(messageContent: string): boolean {
  let content = (messageContent || '').toLowerCase().trim();
  if (!content) return true;

  // Remove common greeting phrases/words
  const greetingPhrases = [
    'bom dia', 'boa tarde', 'boa noite',
    'tudo bem', 'tudo bom', 'como vai', 'como você está', 'como voce esta',
    'olá', 'ola', 'oie', 'oi', 'opa', 'eae', 'e aí', 'e ai', 'salve',
    'hello', 'hi', 'ola tudo bem', 'prazer'
  ];
  for (const phrase of greetingPhrases) {
    content = content.replace(new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
  }
  // Strip punctuation/emojis and collapse whitespace
  content = content.replace(/[^a-zà-ú0-9]/gi, ' ').replace(/\s+/g, ' ').trim();

  // If almost nothing meaningful remains, it's a pure greeting
  return content.length <= 3;
}


// Check if message is a soft rejection (has broker, satisfied, not now - can nurture later)
function isSoftRejection(messageContent: string): boolean {
  const content = typeof messageContent === 'string' ? messageContent.toLowerCase().trim() : '';
  const softRejectionPhrases = [
    'já tenho corretor', 'ja tenho corretor',
    'tenho meu corretor', 'tenho corretor',
    'meu corretor', 'corretor de confiança', 'corretor de confianca',
    'já tenho seguro', 'ja tenho seguro',
    'estou satisfeito', 'satisfeito com',
    'não preciso agora', 'nao preciso agora',
    'no momento não', 'no momento nao',
    'por enquanto não', 'por enquanto nao',
    'já tenho', 'ja tenho',
    'estou bem servido', 'bem atendido',
    'renova automático', 'renova automatico',
    'renovação automática', 'renovacao automatica',
    'não é o momento', 'nao e o momento',
    'talvez depois', 'talvez mais tarde',
    'agora não dá', 'agora nao da',
    'outro momento', 'mais pra frente'
  ];
  
  return softRejectionPhrases.some(phrase => content.includes(phrase));
}

// Patterns that indicate the AGENT closed the conversation (farewell messages)
const AGENT_CLOSURE_PATTERNS = [
  /tenha.*(um|ótimo|bom).*(dia|tarde|noite)/i,
  /qualquer.*(dúvida|pergunta|coisa).*(procure|contate|fale|estamos|aqui)/i,
  /se.*(precisar|quiser).*(voltar|retornar|falar)/i,
  /obrigad.*pelo.*(contato|interesse|retorno)/i,
  /boa.*sorte/i,
  /desculpe.*contato/i,
  /agradeço.*atenção/i,
  /fico.*à.*disposição/i,
  /estamos.*à.*disposição/i,
  /conte.*conosco/i,
  /até.*próxima/i,
  // Handoff patterns - quando transfere para equipe humana
  /vou\s*(passar|encaminhar).*dados.*equipe/i,
  /breve.*entrar.*(em)?\s*contato/i,
  /encaminh.*(para|pra).*(corretor|equipe|especialista)/i,
  /passando.*informações.*para/i,
  /nosso.*especialista.*entrar.*contato/i,
  /equipe.*comercial.*entrar.*contato/i,
  /aguarde.*retorno/i,
];

// Patterns for minimalist client responses confirming closure
const CLIENT_CLOSURE_PATTERNS = [
  /^(ok|ok\.|okay|certo|blz|vlw|valeu|obrigad)\.?$/i,
  /^(entendi|beleza|tá\s*bom|ta\s*bom|combinado)\.?$/i,
  /^(pode\s*ser|tranquilo|de\s*boa|suave)\.?$/i,
  /^(brigad|obg|grato|grata)\.?$/i,
  /^👍$/,
  // Variações de agradecimento abreviado
  /^(obgda|obgd|obgg|obgdo|obga)\.?$/i,
  /^(entendido|anotado|perfeito|show)\.?$/i,
  // Reações do WhatsApp são confirmações implícitas
  /^\[reaction\].*$/i,
  /^👌|👍|✅|🙏|💪$/,
];

// Detect if conversation should be closed based on agent's last message and client's response
function detectConversationClosure(
  agentLastMessage: string | null, 
  clientMessage: string
): { isClosed: boolean; reason: string } {
  if (!agentLastMessage || !clientMessage) {
    return { isClosed: false, reason: '' };
  }
  
  // Check if agent sent a closure message
  const agentClosed = AGENT_CLOSURE_PATTERNS.some(p => p.test(agentLastMessage));
  
  // Check if client confirmed with a short acknowledgment
  const clientConfirmed = CLIENT_CLOSURE_PATTERNS.some(p => p.test(clientMessage.trim()));
  
  if (agentClosed && clientConfirmed) {
    return { isClosed: true, reason: 'Lead desqualificado/encerrado pelo agente' };
  }
  
  return { isClosed: false, reason: '' };
}

// ===== CALLBACK DETECTION PATTERNS =====
interface CallbackIntent {
  hasIntent: boolean;
  suggestedDate?: Date;
  suggestedTime?: string;
  rawText?: string;
}

function detectCallbackIntent(messageContent: string): CallbackIntent {
  const content = messageContent.toLowerCase().trim();
  
  // Patterns that indicate the lead wants to be called back later
  const callbackPhrases = [
    // Time-based
    'falar depois', 'fala depois', 'ligar depois', 'liga depois',
    'retornar depois', 'retorna depois', 'me liga mais tarde',
    'outra hora', 'outro horário', 'outro horario', 'outro momento',
    // Day-based
    'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado', 'domingo',
    'amanhã', 'amanha', 'depois de amanhã', 'depois de amanha',
    'semana que vem', 'próxima semana', 'proxima semana',
    // Busy signals
    'agora não posso', 'agora nao posso', 'agora não dá', 'agora nao da',
    'ocupado', 'ocupada', 'em reunião', 'em reuniao', 'dirigindo',
    'trabalhando', 'no trabalho', 'no serviço', 'no servico',
    'estou na rua', 'estou no carro', 'estou no caminhão', 'estou no caminhao',
    'estou viajando', 'to na estrada', 'na estrada',
    // Commercial hours
    'horário comercial', 'horario comercial', 'no comercial',
    'das 8', 'das 9', 'das 10', 'depois das', 'antes das',
    'após o almoço', 'apos o almoco', 'depois do almoço', 'depois do almoco',
    // Explicit requests
    'pode me ligar', 'podem me ligar', 'liga pra mim',
    'me retorna', 'me retorne', 'retorne minha ligação', 'retorne minha ligacao',
    'vamos conversar', 'podemos conversar', 'quer conversar'
  ];
  
  const hasIntent = callbackPhrases.some(phrase => content.includes(phrase));
  
  if (!hasIntent) {
    return { hasIntent: false };
  }
  
  let suggestedDate: Date | undefined;
  let suggestedTime: string | undefined;
  
  // Try to extract specific time
  const timeMatch = content.match(/(\d{1,2})[:\s]?(?:h(?:oras?)?|:(\d{2}))/i);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (hour >= 7 && hour <= 19) {
      suggestedTime = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Try to extract specific day
  const now = new Date();
  const daysOfWeek: Record<string, number> = {
    'domingo': 0, 'segunda': 1, 'terça': 2, 'terca': 2, 
    'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6
  };
  
  for (const [day, num] of Object.entries(daysOfWeek)) {
    if (content.includes(day)) {
      const date = new Date(now);
      const currentDay = date.getDay();
      let daysToAdd = num - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next week
      date.setDate(date.getDate() + daysToAdd);
      suggestedDate = date;
      break;
    }
  }
  
  // Tomorrow
  if (content.includes('amanhã') || content.includes('amanha')) {
    suggestedDate = new Date(now);
    suggestedDate.setDate(suggestedDate.getDate() + 1);
  }
  
  // Next week
  if (content.includes('semana que vem') || content.includes('próxima semana') || content.includes('proxima semana')) {
    suggestedDate = new Date(now);
    suggestedDate.setDate(suggestedDate.getDate() + 7);
  }
  
  return {
    hasIntent: true,
    suggestedDate,
    suggestedTime,
    rawText: content
  };
}

// Calculate next business hour for callback scheduling
function calculateNextBusinessHour(suggestedDate?: Date, suggestedTime?: string): Date {
  const now = new Date();
  let targetDate = suggestedDate ? new Date(suggestedDate) : new Date(now);
  
  // Set the time
  if (suggestedTime) {
    const [hours, minutes] = suggestedTime.split(':').map(Number);
    targetDate.setHours(hours, minutes, 0, 0);
  } else {
    // Default to next available business hour
    const currentHour = now.getHours();
    
    if (targetDate.toDateString() === now.toDateString()) {
      // Same day - find next available hour
      if (currentHour < 9) {
        targetDate.setHours(9, 0, 0, 0);
      } else if (currentHour < 14) {
        targetDate.setHours(14, 0, 0, 0); // After lunch
      } else if (currentHour < 17) {
        targetDate.setHours(currentHour + 1, 0, 0, 0);
      } else {
        // Next business day
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(9, 0, 0, 0);
      }
    } else {
      targetDate.setHours(9, 0, 0, 0); // 9 AM on suggested day
    }
  }
  
  // Skip weekends
  while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(9, 0, 0, 0);
  }
  
  // Ensure it's in the future
  if (targetDate <= now) {
    targetDate = new Date(now);
    targetDate.setMinutes(targetDate.getMinutes() + 30);
  }
  
  return targetDate;
}

// Get next assignee using weighted round-robin
async function getNextAssignee(
  supabase: any, 
  pipelineId: string
): Promise<{ id: string; name: string; email: string } | null> {
  try {
    // 1. Find team for this pipeline
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!team) {
      console.log('[Callback] No team found for pipeline, will not assign');
      return null;
    }
    
    // 2. Get active team members with weight
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, email, weight')
      .eq('team_id', team.id)
      .eq('status', 'active')
      .order('weight', { ascending: false });
    
    if (!members || members.length === 0) {
      console.log('[Callback] No active team members found');
      return null;
    }
    
    // 3. Get last assignment for this pipeline
    const { data: lastAssignment } = await supabase
      .from('callback_assignments')
      .select('last_assigned_member_id, assignment_count')
      .eq('pipeline_id', pipelineId)
      .maybeSingle();
    
    // 4. Round-robin: find next member
    let nextMember: typeof members[0];
    
    if (!lastAssignment?.last_assigned_member_id) {
      // First assignment - pick first (highest weight)
      nextMember = members[0];
    } else {
      // Find current member's index and go to next
      const lastIndex = members.findIndex((m: any) => m.id === lastAssignment.last_assigned_member_id);
      const nextIndex = (lastIndex + 1) % members.length;
      nextMember = members[nextIndex];
    }
    
    // 5. Update assignment tracking
    await supabase
      .from('callback_assignments')
      .upsert({
        pipeline_id: pipelineId,
        team_id: team.id,
        last_assigned_member_id: nextMember.id,
        assignment_count: (lastAssignment?.assignment_count || 0) + 1,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'team_id,pipeline_id'
      });
    
    console.log(`[Callback] 🔄 Assigned to: ${nextMember.name} (round-robin)`);
    
    return {
      id: nextMember.id,
      name: nextMember.name,
      email: nextMember.email
    };
  } catch (error) {
    console.error('[Callback] Error getting next assignee:', error);
    return null;
  }
}

// Create callback activity in deal
async function createCallbackActivity(
  supabase: any,
  contactId: string,
  pipelineId: string,
  scheduledAt: Date,
  messageContent: string,
  assignee: { id: string; name: string } | null
): Promise<boolean> {
  try {
    // Get deal for this contact
    const { data: deal } = await supabase
      .from('deals')
      .select('id, title, pipeline_id')
      .eq('contact_id', contactId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle();
    
    if (!deal) {
      // Try any deal for this contact
      const { data: anyDeal } = await supabase
        .from('deals')
        .select('id, title, pipeline_id')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!anyDeal) {
        console.log('[Callback] No deal found for contact');
        return false;
      }
    }
    
    const targetDeal = deal || null;
    if (!targetDeal) return false;
    
    // Create the callback activity
    const { error } = await supabase
      .from('deal_activities')
      .insert({
        deal_id: targetDeal.id,
        type: 'call',
        title: 'Retornar ligação (solicitado pelo lead)',
        description: `Lead pediu para retornar.\nMensagem: "${messageContent}"\nAgendado para: ${scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        scheduled_at: scheduledAt.toISOString(),
        created_by: assignee?.id || null,
        is_completed: false
      });
    
    if (error) {
      console.error('[Callback] Error creating activity:', error);
      return false;
    }
    
    // Update deal owner if we have an assignee
    if (assignee) {
      await supabase
        .from('deals')
        .update({ owner_id: assignee.id })
        .eq('id', targetDeal.id);
    }
    
    console.log(`[Callback] ✅ Callback activity created for ${scheduledAt.toISOString()}`);
    return true;
  } catch (error) {
    console.error('[Callback] Error creating callback activity:', error);
    return false;
  }
}

// Parse renewal date from user message (e.g., "março", "15/03", "daqui 3 meses")
function parseRenewalDate(text: string): string | null {
  const content = text.toLowerCase().trim();
  
  // Month names in Portuguese
  const months: Record<string, number> = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3,
    'abril': 4, 'maio': 5, 'junho': 6, 'julho': 7,
    'agosto': 8, 'setembro': 9, 'outubro': 10,
    'novembro': 11, 'dezembro': 12
  };
  
  // Try to match month name: "março", "em maio", "mês de junho"
  for (const [month, num] of Object.entries(months)) {
    if (content.includes(month)) {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      // If month is in the past this year, assume next year
      const year = num >= currentMonth ? now.getFullYear() : now.getFullYear() + 1;
      return `${year}-${String(num).padStart(2, '0')}-15`;
    }
  }
  
  // Try to match date format: "15/03", "15/03/25", "15-03-2025"
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const match = content.match(dateRegex);
  if (match) {
    const [, day, month, year] = match;
    const now = new Date();
    let fullYear: string;
    if (year) {
      fullYear = year.length === 2 ? `20${year}` : year;
    } else {
      // No year specified - assume current year, or next year if date is in the past
      const monthNum = parseInt(month);
      const currentMonth = now.getMonth() + 1;
      fullYear = String(monthNum >= currentMonth ? now.getFullYear() : now.getFullYear() + 1);
    }
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try to match relative: "daqui 3 meses", "em 2 meses", "próximo mês"
  const relativeRegex = /(\d+)\s*m[eê]s/;
  const relMatch = content.match(relativeRegex);
  if (relMatch) {
    const monthsAhead = parseInt(relMatch[1]);
    const date = new Date();
    date.setMonth(date.getMonth() + monthsAhead);
    return date.toISOString().split('T')[0];
  }
  
  // "próximo mês" / "mês que vem"
  if (content.includes('próximo mês') || content.includes('proximo mes') || content.includes('mês que vem') || content.includes('mes que vem')) {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
  }
  
  // "fim do ano" / "final do ano"
  if (content.includes('fim do ano') || content.includes('final do ano')) {
    const year = new Date().getFullYear();
    return `${year}-12-31`;
  }
  
  // "início do ano" / "começo do ano" (next year)
  if (content.includes('início do ano') || content.includes('inicio do ano') || content.includes('começo do ano') || content.includes('comeco do ano')) {
    const year = new Date().getFullYear() + 1;
    return `${year}-01-15`;
  }
  
  return null;
}

// Generate personalized renewal email using AI
async function generateRenewalEmail(
  lovableApiKey: string,
  contact: any,
  renewalDate: string
): Promise<{ subject: string; body_html: string } | null> {
  try {
    const contactName = contact?.name || contact?.call_name || 'Cliente';
    const companyName = contact?.company || 'sua empresa';
    const formattedDate = new Date(renewalDate).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const prompt = `Gere um email profissional de follow-up de renovação de seguro de cargas.

Dados do lead:
- Nome: ${contactName}
- Empresa: ${companyName}
- Data de renovação: ${formattedDate}

Contexto: O lead disse que já tem corretor, mas informou quando vence o seguro atual. Queremos oferecer uma cotação competitiva para renovação.

Tom: Profissional mas cordial, sem ser invasivo. Mencionar que é sem compromisso.

IMPORTANTE: 
- Não use markdown, apenas HTML simples
- Seja breve (máximo 3 parágrafos)
- Inclua CTA claro (responder email ou WhatsApp)

Responda APENAS no formato JSON (sem markdown code blocks):
{"subject": "assunto do email", "body_html": "<div>HTML do corpo do email</div>"}`;

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      console.error('[Nina] AI error generating email:', response.status);
      return getDefaultRenewalEmail(contactName, companyName, formattedDate);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[Nina] Empty AI response for email');
      return getDefaultRenewalEmail(contactName, companyName, formattedDate);
    }

    // Parse JSON response (handle markdown code blocks if present)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonContent);
    console.log('[Nina] 📧 AI generated email content');

    return {
      subject: parsed.subject || `Renovação do seu seguro de cargas - ${formattedDate}`,
      body_html: parsed.body_html || parsed.body || getDefaultRenewalEmail(contactName, companyName, formattedDate).body_html
    };

  } catch (error) {
    console.error('[Nina] Error generating renewal email:', error);
    const contactName = contact?.name || 'Cliente';
    const companyName = contact?.company || 'sua empresa';
    const formattedDate = new Date(renewalDate).toLocaleDateString('pt-BR');
    return getDefaultRenewalEmail(contactName, companyName, formattedDate);
  }
}

// Default email template if AI fails
function getDefaultRenewalEmail(
  contactName: string,
  companyName: string,
  formattedDate: string
): { subject: string; body_html: string } {
  return {
    subject: `Renovação do seu seguro de cargas - ${formattedDate}`,
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Olá ${contactName}!</h2>
        <p>Espero que esteja tudo bem com você e com a ${companyName}.</p>
        <p>Estamos entrando em contato porque você mencionou que seu seguro de cargas vence em <strong>${formattedDate}</strong>.</p>
        <p>Gostaríamos de apresentar uma cotação competitiva para a renovação. Trabalhamos com as melhores seguradoras do mercado e podemos oferecer condições diferenciadas.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>📞</strong> Entre em contato conosco</p>
        </div>
        <p>Responda este email ou envie uma mensagem no WhatsApp - fazemos uma proposta sem compromisso!</p>
        <p style="margin-top: 30px;">
          Atenciosamente,<br>
          <strong>Equipe Jacometo Corretora de Seguros</strong><br><br>
          <span style="color:#6b7280;">Jacometo Corretora - Atendimento</span><br>
          <span style="font-size:12px;color:#9ca3af;">À disposição para esclarecimento</span>
        </p>
      </div>
    `
  };
}

// Note: WhatsApp only supports audio/ogg; codecs=opus, audio/mpeg, audio/amr, audio/mp4, audio/aac
// WAV is NOT supported. We use MP3 directly from ElevenLabs.

// Helper function to get secret from Vault or fallback to table
async function getSecret(supabase: any, vaultName: string, tableValue: string | null): Promise<string | null> {
  // Try Vault first
  try {
    const { data: vaultSecret } = await supabase.rpc('get_vault_secret', { secret_name: vaultName });
    if (vaultSecret) {
      console.log(`[Nina] Using secret from Vault: ${vaultName}`);
      return vaultSecret;
    }
  } catch (e) {
    console.log(`[Nina] Vault lookup failed for ${vaultName}, using table fallback`);
  }
  
  // Fallback to table value
  return tableValue;
}

// Resolve ElevenLabs key: conector (env) > Vault > tabela
async function getElevenLabsKey(supabase: any, settings: any): Promise<string | null> {
  const envKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (envKey) return envKey;
  return await getSecret(supabase, 'vault_elevenlabs_key', settings?.elevenlabs_api_key);
}

// Limite de caracteres para TTS (áudios longos ficam caros/ruins)
const TTS_MAX_CHARS = 900;

// Generate audio using ElevenLabs (outputs MP3 for WhatsApp compatibility)
async function generateAudioElevenLabs(supabase: any, settings: any, text: string, agent?: Agent | null): Promise<{ buffer: ArrayBuffer; format: 'mp3' } | null> {
  const apiKey = await getElevenLabsKey(supabase, settings);
  
  if (!apiKey) {
    console.log('[Nina] ElevenLabs API key not configured');
    return null;
  }


  try {
    // Perfil de voz do ambiente de produção (conversas reais)
    const { data: ttsProfile } = await supabase
      .from('tts_profiles')
      .select('*')
      .eq('environment', 'production')
      .maybeSingle();

    // Priority: agent config > perfil do ambiente > global config > fallback defaults
    const voiceId = agent?.elevenlabs_voice_id || ttsProfile?.voice_id || settings.elevenlabs_voice_id || '9BWtsMINqrJLrRacOk9x';
    const model = agent?.elevenlabs_model || ttsProfile?.model || settings.elevenlabs_model || 'eleven_turbo_v2_5';
    const stability = agent?.elevenlabs_stability ?? ttsProfile?.stability ?? settings.elevenlabs_stability ?? 0.75;
    const similarityBoost = agent?.elevenlabs_similarity_boost ?? ttsProfile?.similarity_boost ?? settings.elevenlabs_similarity_boost ?? 0.80;
    const style = agent?.elevenlabs_style ?? ttsProfile?.style ?? settings.elevenlabs_style ?? 0.30;
    const speed = agent?.elevenlabs_speed ?? ttsProfile?.speed ?? settings.elevenlabs_speed ?? 1.0;
    const speakerBoost = agent?.elevenlabs_speaker_boost ?? ttsProfile?.speaker_boost ?? settings.elevenlabs_speaker_boost ?? true;


    console.log(`[Nina] Generating audio (MP3) - voice: ${voiceId}, model: ${model}, agent: ${agent?.name || 'global'}`);

    // Request MP3 format (WhatsApp supports audio/mpeg)
    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: model,
        output_format: 'mp3_44100_128', // MP3 44.1kHz 128kbps
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost,
          style: style,
          speed: speed,
          use_speaker_boost: speakerBoost
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Nina] ElevenLabs error:', response.status, errorText);
      return null;
    }

    const mp3Buffer = await response.arrayBuffer();
    console.log(`[Nina] 🎤 Received MP3 audio: ${mp3Buffer.byteLength} bytes`);
    
    return { buffer: mp3Buffer, format: 'mp3' };
  } catch (error) {
    console.error('[Nina] Error generating audio:', error);
    return null;
  }
}

// ===== QUALIFICATION COMPLETION CHECK FUNCTION =====
// Check if all essential qualification fields (modelo Mitsui) are collected.
// Sequence: CNPJ -> empresa/RNTRC confirmados -> tipo de transportador -> e-mail -> celular.
function isQualificationComplete(contact: any, qualificationAnswers: { [key: string]: string }): boolean {
  const hasCnpj = !!contact?.cnpj;
  const hasEmail = !!contact?.email;
  // Celular: a conversa já é no WhatsApp, então o número de telefone do contato serve.
  const hasCelular = !!(contact?.phone_number || contact?.whatsapp_id);
  const tipo = (qualificationAnswers?.tipo_transportador || '').toLowerCase();
  const isSubcontratado = tipo.includes('subcontrat') || tipo.includes('agregad');

  const isComplete = hasCnpj && hasEmail && hasCelular && isSubcontratado;

  if (isComplete) {
    console.log(`[Nina] 📊 Qualification check (Mitsui): CNPJ=${hasCnpj}, Email=${hasEmail}, Celular=${hasCelular}, Subcontratado=${isSubcontratado} -> COMPLETE`);
  }

  return isComplete;
}

// ===== CONTRATADO DATA COMPLETION CHECK =====
// Para o transportador CONTRATADO (responsável pela carga) coletamos os mesmos
// dados essenciais (CNPJ + e-mail + celular) ANTES de encaminhar para o corretor
// humano — que fará o produto COM cobertura/averbação.
function isContratadoDataComplete(contact: any): boolean {
  const hasCnpj = !!contact?.cnpj;
  const hasEmail = !!contact?.email;
  const hasCelular = !!(contact?.phone_number || contact?.whatsapp_id);
  const isComplete = hasCnpj && hasEmail && hasCelular;
  if (isComplete) {
    console.log(`[Nina] 📊 Contratado data check: CNPJ=${hasCnpj}, Email=${hasEmail}, Celular=${hasCelular} -> COMPLETE (handoff)`);
  }
  return isComplete;
}

// ===== REAL-TIME QUALIFICATION EXTRACTION FUNCTION =====
// Extract the tipo de transportador (contratado/subcontratado) from user messages.
function extractQualificationFromMessages(userMessages: string[]): { [key: string]: string | null } {
  const extracted: { [key: string]: string | null } = {};
  const allText = userMessages.join(' ').toLowerCase();

  // Subcontratado / agregado tem prioridade quando ambos aparecem, pois é o
  // termo que o lead usa para se descrever como agregado de outra transportadora.
  if (/\b(subcontratad|sub-contratad|agregad)\w*/i.test(allText)) {
    extracted.tipo_transportador = 'subcontratado';
  } else if (/\b(contratad|responsável pela carga|responsavel pela carga|transportador principal|emito o cte|emito o ct-e)\w*/i.test(allText)) {
    extracted.tipo_transportador = 'contratado';
  }

  return extracted;
}


// Sanitize text for TTS - simplify URLs for natural speech
function sanitizeTextForAudio(text: string): string {
  let sanitized = text;
  
  // Remove protocol (https://, http://)
  sanitized = sanitized.replace(/https?:\/\//g, '');
  
  return sanitized;
}

// Upload audio to Supabase Storage (MP3 format for WhatsApp compatibility)
async function uploadAudioToStorage(
  supabase: any, 
  audioBuffer: ArrayBuffer, 
  conversationId: string,
  format: 'mp3' = 'mp3'
): Promise<string | null> {
  try {
    const fileName = `${conversationId}/${Date.now()}.mp3`;
    const contentType = 'audio/mpeg';
    
    const { data, error } = await supabase.storage
      .from('nina-audio')
      .upload(fileName, audioBuffer, {
        contentType: contentType,
        cacheControl: '3600'
      });

    if (error) {
      console.error('[Nina] Error uploading audio:', error);
      return null;
    }

    // Use signed URL for security (bucket is private)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('nina-audio')
      .createSignedUrl(fileName, 3600 * 24); // 24 hours expiry

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('[Nina] Error creating signed URL:', signedUrlError);
      return null;
    }

    console.log(`[Nina] Audio uploaded (${format}):`, signedUrlData.signedUrl);
    return signedUrlData.signedUrl;
  } catch (error) {
    console.error('[Nina] Error uploading audio to storage:', error);
    return null;
  }
}

// ===== LOOK-AHEAD DEBOUNCE: Wait for pending messages arriving soon =====
// Before processing, check if there are more messages scheduled to arrive in the next 10 seconds
async function waitForPendingMessages(
  supabase: any,
  conversationId: string,
  maxWaitMs: number = 10000
): Promise<void> {
  const checkInterval = 2000; // Check every 2 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    // Check for pending messages with scheduled_for in the near future (next 10 seconds)
    const now = new Date();
    const futureLimit = new Date(Date.now() + 10000);
    
    const { data: upcomingItems } = await supabase
      .from('nina_processing_queue')
      .select('id, scheduled_for')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .gt('scheduled_for', now.toISOString())
      .lte('scheduled_for', futureLimit.toISOString());
    
    if (!upcomingItems || upcomingItems.length === 0) {
      // No more messages arriving soon, safe to process
      console.log(`[Nina] ✅ No pending messages arriving soon, proceeding with processing`);
      return;
    }
    
    console.log(`[Nina] ⏳ Waiting for ${upcomingItems.length} pending messages in same conversation (arriving within 10s)...`);
    
    // Wait and check again
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  console.log(`[Nina] ⚠️ Max wait time reached, proceeding with available messages`);
}

// Aggregate pending messages from the same conversation for debouncing
async function aggregatePendingMessages(
  supabase: any,
  conversationId: string,
  currentItemId: string
): Promise<{ aggregatedContent: string; messageIds: string[]; primaryMessageId: string; queueItemIds: string[] } | null> {
  // Get all pending messages for this conversation that are ready to process
  const { data: pendingItems, error } = await supabase
    .from('nina_processing_queue')
    .select('id, message_id')
    .eq('conversation_id', conversationId)
    .eq('status', 'processing')
    .order('created_at', { ascending: true });

  if (error || !pendingItems || pendingItems.length === 0) {
    return null;
  }

  // Fetch all messages
  const messageIds = pendingItems.map((p: any) => p.message_id);
  const queueItemIds = pendingItems.map((p: any) => p.id);
  
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('id, content, type, sent_at')
    .in('id', messageIds)
    .eq('from_type', 'user')
    .order('sent_at', { ascending: true });

  if (msgError || !messages || messages.length === 0) {
    return null;
  }

  // If only one message, no aggregation needed
  if (messages.length === 1) {
    return null;
  }

  // Aggregate content from multiple messages
  const contents = messages
    .filter((m: any) => m.content && m.content.trim())
    .map((m: any) => m.content.trim());

  if (contents.length === 0) {
    return null;
  }

  // 🔒 DEDUPLICATION: Remove conteúdo idêntico (cliente enviou mesma mensagem múltiplas vezes)
  const uniqueContents = [...new Set(contents)];
  const aggregatedContent = uniqueContents.join('\n');
  
  if (uniqueContents.length < contents.length) {
    console.log(`[Nina] 🔄 Deduplicados ${contents.length - uniqueContents.length} mensagens idênticas`);
  }
  const primaryMessageId = messages[messages.length - 1].id; // Use latest message as primary

  console.log(`[Nina] 📦 Aggregated ${messages.length} messages into one: "${aggregatedContent.substring(0, 100)}..."`);

  return {
    aggregatedContent,
    messageIds: messages.map((m: any) => m.id),
    primaryMessageId,
    queueItemIds
  };
}

// Helper to mark all aggregated messages as processed
async function markMessagesAsProcessed(
  supabase: any,
  primaryMessageId: string,
  aggregatedMessageIds: string[],
  responseTime: number
) {
  // Mark primary message
  await supabase
    .from('messages')
    .update({ 
      processed_by_nina: true,
      nina_response_time: responseTime
    })
    .eq('id', primaryMessageId);

  // Mark additional aggregated messages (if any)
  if (aggregatedMessageIds.length > 1) {
    const otherMessageIds = aggregatedMessageIds.filter(id => id !== primaryMessageId);
    if (otherMessageIds.length > 0) {
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .in('id', otherMessageIds);
    }
  }
}

// Helper to mark all aggregated queue items as completed
async function markAggregatedQueueItemsCompleted(
  supabase: any,
  currentItemId: string,
  aggregatedQueueItemIds: string[]
) {
  // Mark all aggregated queue items as completed (except the current one, which is handled by the main loop)
  const otherQueueIds = aggregatedQueueItemIds.filter(id => id !== currentItemId);
  if (otherQueueIds.length > 0) {
    console.log(`[Nina] Marking ${otherQueueIds.length} additional queue items as completed (aggregated)`);
    await supabase
      .from('nina_processing_queue')
      .update({ 
        status: 'completed', 
        processed_at: new Date().toISOString(),
        error_message: 'Aggregated with other messages'
      })
      .in('id', otherQueueIds);
  }
}

// ===== CONVERSATION LOCK: Prevent parallel processing of same conversation =====
async function waitForConversationLock(
  supabase: any,
  conversationId: string,
  currentItemId: string,
  currentCreatedAt: string,
  maxWaitMs: number = 30000
): Promise<boolean> {
  const checkInterval = 1000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    // Check for OTHER items with status='processing' in the same conversation
    const { data: processingItems } = await supabase
      .from('nina_processing_queue')
      .select('id, created_at')
      .eq('conversation_id', conversationId)
      .eq('status', 'processing')
      .neq('id', currentItemId);
    
    if (!processingItems || processingItems.length === 0) {
      // No other items processing - we can proceed
      console.log(`[Nina] 🔓 Conversa ${conversationId} livre para processamento`);
      return true;
    }
    
    // Check if any processing items are OLDER than us (started before us)
    const olderItems = processingItems.filter((p: any) => p.created_at < currentCreatedAt);
    
    if (olderItems.length > 0) {
      console.log(`[Nina] 🔒 Conversa ${conversationId} em processamento por outro orchestrator (${olderItems.length} item(s) mais antigo(s)), aguardando...`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    } else {
      // We're the oldest - proceed
      console.log(`[Nina] 🔓 Somos o item mais antigo, prosseguindo`);
      return true;
    }
  }
  
  console.log(`[Nina] ⚠️ Timeout aguardando lock da conversa ${conversationId}, continuando mesmo assim`);
  return false;
}

async function processQueueItem(
  supabase: any,
  lovableApiKey: string,
  item: any,
  settings: any,
  agents: Agent[],
  defaultAgent: Agent | undefined
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  console.log(`[Nina] Processing queue item: ${item.id}`);

  // 🆕 CONVERSATION LOCK: Wait if another orchestrator is processing this conversation
  // This ensures only one orchestrator processes messages at a time, enabling proper aggregation
  await waitForConversationLock(supabase, item.conversation_id, item.id, item.created_at);

  // 🆕 LOOK-AHEAD: Wait briefly if there are more messages arriving soon from the same conversation
  // This prevents processing the first message before subsequent messages are ready for aggregation
  await waitForPendingMessages(supabase, item.conversation_id);

  // Check for message aggregation (debouncing)
  const aggregated = await aggregatePendingMessages(supabase, item.conversation_id, item.id);
  
  let message: any;
  let aggregatedMessageIds: string[] = [];
  let aggregatedQueueItemIds: string[] = [];
  
  if (aggregated) {
    // Use aggregated content but get the primary message for metadata
    const { data: primaryMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('id', aggregated.primaryMessageId)
      .maybeSingle();

    if (!primaryMessage) {
      throw new Error('Primary message not found');
    }

    // Override content with aggregated content
    message = { ...primaryMessage, content: aggregated.aggregatedContent };
    aggregatedMessageIds = aggregated.messageIds;
    aggregatedQueueItemIds = aggregated.queueItemIds;
    
    console.log(`[Nina] Using aggregated content from ${aggregated.messageIds.length} messages`);
    
    // Mark other queue items as completed immediately
    await markAggregatedQueueItemsCompleted(supabase, item.id, aggregatedQueueItemIds);
  } else {
    // Normal single message processing
    const { data: singleMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('id', item.message_id)
      .maybeSingle();

    if (!singleMessage) {
      throw new Error('Message not found');
    }
    
    message = singleMessage;
    aggregatedMessageIds = [singleMessage.id];
  }

  // Get conversation with contact info
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*, contact:contacts(*), whatsapp_window_start')
    .eq('id', item.conversation_id)
    .maybeSingle();

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Check if conversation is still in Nina mode
  if (conversation.status !== 'nina') {
    console.log('[Nina] Conversation no longer in Nina mode, skipping');
    return;
  }

  // 🆕 GUARD 1: Skip if message already flagged as processed
  if (message.processed_by_nina === true) {
    console.log(`[Nina] ⏭️ Message ${message.id} already has processed_by_nina=true, skipping`);
    return;
  }

  // 🆕 GUARD 2: Check if a Nina response already exists in messages table
  const { data: subsequentNinaMessages } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('from_type', 'nina')
    .gt('sent_at', message.sent_at)
    .limit(1);

  if (subsequentNinaMessages && subsequentNinaMessages.length > 0) {
    console.log('[Nina] ⏭️ Message already has Nina response after it, skipping duplicate processing');
    console.log(`[Nina] ⏭️ Message ID: ${message.id}, Subsequent Nina message: ${subsequentNinaMessages[0].id}`);
    return;
  }

  // 🆕 GUARD 3: Check if a response is already pending in send_queue for this message
  const { data: queuedForThisMsg } = await supabase
    .from('send_queue')
    .select('id, metadata')
    .eq('conversation_id', conversation.id)
    .in('status', ['pending', 'processing'])
    .limit(20);

  const hasQueuedResponse = queuedForThisMsg?.some((sq: any) => {
    return sq.metadata?.response_to_message_id === message.id;
  });

  if (hasQueuedResponse) {
    console.log(`[Nina] ⏭️ Response already queued in send_queue for message ${message.id}, skipping`);
    return;
  }

  // 🆕 GUARD 4: Immediately mark as processed to prevent concurrent triggers
  await supabase
    .from('messages')
    .update({ processed_by_nina: true })
    .eq('id', message.id)
    .eq('processed_by_nina', false); // Only update if still false (atomic check)

  // Check WhatsApp 24h window
  const windowStart = conversation.whatsapp_window_start ? new Date(conversation.whatsapp_window_start) : null;
  const now = new Date();
  const windowEndTime = windowStart ? new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) : null;
  const isWindowOpen = windowStart !== null && windowEndTime !== null && now < windowEndTime;

  if (!isWindowOpen) {
    console.log('[Nina] WhatsApp 24h window is closed, skipping AI response');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }

  // Check if auto-response is enabled
  if (!settings?.auto_response_enabled) {
    console.log('[Nina] Auto-response disabled, marking as processed without responding');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }

  // ===== SKIP WHATSAPP REACTIONS =====
  // Reactions like [reaction] or emoji reactions should not trigger AI responses
  const messageContent = message.content?.trim() || '';
  const isReactionMessage = 
    messageContent === '[reaction]' || 
    messageContent.startsWith('[reaction') ||
    /^\[reaction.*\]$/i.test(messageContent);
    
  if (isReactionMessage) {
    console.log('[Nina] ⏭️ WhatsApp reaction detected, skipping AI response');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }
  // ===== END SKIP WHATSAPP REACTIONS =====

  // Detect which agent should handle this conversation
  const { agent, isHandoff } = detectAgent(
    message.content || '', 
    conversation, 
    agents, 
    defaultAgent
  );

  if (!agent) {
    console.log('[Nina] No agent available, using default system prompt');
  } else {
    console.log(`[Nina] Using agent: ${agent.name} (handoff: ${isHandoff})`);
  }

  // ===== AUTOMATIC CONVERSATION CLOSURE DETECTION =====
  // Check if agent sent a farewell message and client confirmed
  const conversationMetadata = conversation.metadata || {};
  if (message.content) {
    // Get last agent message before this client message
    const { data: lastAgentMessages } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', conversation.id)
      .in('from_type', ['nina', 'human'])
      .lt('sent_at', message.sent_at)
      .order('sent_at', { ascending: false })
      .limit(1);
    
    const lastAgentMessage = lastAgentMessages?.[0]?.content || null;
    const closureDetected = detectConversationClosure(lastAgentMessage, message.content);
    
    if (closureDetected.isClosed) {
      console.log(`[Nina] 🔒 Conversation closure detected: ${closureDetected.reason}`);
      
      // Mark message as processed
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // Mark conversation as closed
      await supabase
        .from('conversations')
        .update({ 
          status: 'paused',
          is_active: false
        })
        .eq('id', conversation.id);
      
      // Find deal and move to "Perdido" stage
      const { data: deal } = await supabase
        .from('deals')
        .select('id, pipeline_id')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (deal) {
        const { data: lostStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', deal.pipeline_id)
          .eq('title', 'Perdido')
          .maybeSingle();
        
        if (lostStage) {
          await supabase
            .from('deals')
            .update({
              stage_id: lostStage.id,
              lost_at: new Date().toISOString(),
              lost_reason: closureDetected.reason
            })
            .eq('id', deal.id);
          
          console.log(`[Nina] 📉 Deal moved to Perdido stage automatically`);
        }
      }
      
      console.log(`[Nina] ✅ Conversation auto-closed, no response needed`);
      return;
    }
  }
  // ===== END AUTOMATIC CONVERSATION CLOSURE DETECTION =====

  // ===== PROSPECTING REJECTION DETECTION =====
  // Check if this is a prospecting conversation and message is a rejection
  if (conversationMetadata.origin === 'prospeccao' && message.content && isProspectingRejection(message.content)) {
    console.log(`[Nina] 🚫 Prospecting rejection detected: "${message.content}"`);
    
    // Use agent's handoff_message (graceful exit message)
    const rejectionResponse = agent?.handoff_message || 'Obrigado pelo retorno! Desculpe o contato.';
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Queue the rejection response
    await queueTextResponse(supabase, conversation, message, rejectionResponse, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Move deal to "Perdido" stage
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .single();
    
    if (prospectingPipeline) {
      const { data: lostStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectingPipeline.id)
        .eq('title', 'Perdido')
        .single();
      
      if (lostStage) {
        await supabase
          .from('deals')
          .update({ 
            stage_id: lostStage.id,
            lost_at: new Date().toISOString(),
            lost_reason: 'Lead rejeitou prospecção'
          })
          .eq('contact_id', conversation.contact_id);
        
        console.log(`[Nina] 📉 Deal moved to Perdido stage`);
      }
    }
    
    // Pause conversation (end prospecting)
    await supabase
      .from('conversations')
      .update({ status: 'paused' })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-prospecting-rejection' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Prospecting rejection handled, conversation paused`);
    return;
  }
  // ===== END PROSPECTING REJECTION DETECTION =====

  // ===== SOFT REJECTION STEP 3: CAPTURE EMAIL AND FINALIZE =====
  // Check if we're awaiting email after getting renewal date
  const ninaContext = conversation.nina_context || {};
  if (conversationMetadata.origin === 'prospeccao' && 
      (ninaContext.awaiting_email === true || ninaContext.awaiting_email_confirmation === true) && 
      message.content) {
    console.log(`[Nina] 📧 Awaiting email, received: "${message.content}"`);
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Try to extract email from message
    const emailMatch = message.content.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const isConfirmation = /sim|pode|isso|tá certo|correto|esse mesmo|esse aí|esse ai|pode ser|ok|blz|beleza/i.test(message.content);
    
    let finalEmail: string | null = null;
    
    if (emailMatch) {
      finalEmail = emailMatch[0].toLowerCase();
      // Save new email to contact
      await supabase
        .from('contacts')
        .update({ email: finalEmail })
        .eq('id', conversation.contact_id);
      console.log(`[Nina] 📧 New email captured and saved: ${finalEmail}`);
    } else if (isConfirmation && conversation.contact?.email) {
      finalEmail = conversation.contact.email;
      console.log(`[Nina] 📧 Email confirmed: ${finalEmail}`);
    }
    
    // Get prospecting pipeline and nurture stage
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .maybeSingle();
    
    const renewalDate = ninaContext.renewal_date;
    let responseText: string;
    
    if (finalEmail && renewalDate && prospectingPipeline) {
      // Generate personalized email using AI
      const emailContent = await generateRenewalEmail(
        lovableApiKey,
        conversation.contact,
        renewalDate
      );
      
      // Get deal for scheduled email
      const { data: deal } = await supabase
        .from('deals')
        .select('id, title')
        .eq('contact_id', conversation.contact_id)
        .eq('pipeline_id', prospectingPipeline.id)
        .maybeSingle();
      
      if (deal && emailContent) {
        // Calculate scheduled date (60 days before renewal)
        const renewalDateObj = new Date(renewalDate);
        const scheduledDate = new Date(renewalDateObj);
        scheduledDate.setDate(scheduledDate.getDate() - 60);
        
        // If scheduled date is in the past, schedule for 3 days from now
        const now = new Date();
        if (scheduledDate <= now) {
          scheduledDate.setTime(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        }
        
        // Insert scheduled email
        await supabase
          .from('scheduled_emails')
          .insert({
            deal_id: deal.id,
            contact_id: conversation.contact_id,
            to_email: finalEmail,
            subject: emailContent.subject,
            body_html: emailContent.body_html,
            scheduled_for: scheduledDate.toISOString().split('T')[0],
            days_before_due: 60,
            generated_by: 'ai'
          });
        
        console.log(`[Nina] 📧 Renewal email scheduled for ${scheduledDate.toISOString().split('T')[0]}`);
        
        // Create follow-up task for operator
        await supabase
          .from('deal_activities')
          .insert({
            deal_id: deal.id,
            type: 'task',
            title: 'Follow-up Renovação',
            description: `Lead rejeitou por já ter corretor.\nData de renovação: ${new Date(renewalDate).toLocaleDateString('pt-BR')}\nEmail agendado para 60 dias antes: ${finalEmail}\n\nAgendar recontato próximo da data de vencimento.`,
            scheduled_at: scheduledDate.toISOString(),
            is_completed: false
          });
        
        console.log(`[Nina] 📋 Follow-up task created for operator`);
      }
      
      responseText = 'Tudo certo! Vou enviar um lembrete próximo da renovação. Bom trabalho!';
    } else if (!finalEmail) {
      // Could not get email - graceful exit
      responseText = 'Sem problema! Quando precisar de uma cotação é só chamar. Bom trabalho!';
    } else {
      responseText = 'Perfeito! Entro em contato próximo da renovação. Bom trabalho!';
    }
    
    // Queue the response
    await queueTextResponse(supabase, conversation, message, responseText, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Move deal to Nurture stage
    if (prospectingPipeline) {
      const { data: nurtureStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectingPipeline.id)
        .eq('title', 'Nurture')
        .maybeSingle();
      
      if (nurtureStage) {
        const { data: existingDeal } = await supabase
          .from('deals')
          .select('notes')
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id)
          .maybeSingle();
        
        const existingNotes = existingDeal?.notes || '';
        const newNote = `[${new Date().toLocaleDateString('pt-BR')}] Soft rejection - Renovação: ${renewalDate ? new Date(renewalDate).toLocaleDateString('pt-BR') : 'N/A'} - Email: ${finalEmail || 'N/A'}`;
        
        await supabase
          .from('deals')
          .update({ 
            stage_id: nurtureStage.id,
            notes: existingNotes ? `${existingNotes}\n\n${newNote}` : newNote
          })
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id);
        
        console.log(`[Nina] 🌱 Deal moved to Nurture stage`);
      }
    }
    
    // Clear awaiting flags and pause conversation
    await supabase
      .from('conversations')
      .update({ 
        status: 'paused',
        nina_context: { 
          ...ninaContext, 
          awaiting_email: false, 
          awaiting_email_confirmation: false,
          awaiting_renewal_date: false 
        }
      })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-email-capture' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Email flow completed, deal in Nurture for follow-up`);
    return;
  }
  // ===== END SOFT REJECTION STEP 3 =====

  // ===== SOFT REJECTION STEP 2: CAPTURE RENEWAL DATE =====
  // Check if we're awaiting renewal date from a previous soft rejection
  if (conversationMetadata.origin === 'prospeccao' && ninaContext.awaiting_renewal_date === true && message.content) {
    console.log(`[Nina] 📅 Awaiting renewal date, received: "${message.content}"`);
    
    const renewalDate = parseRenewalDate(message.content);
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Get prospecting pipeline and nurture stage
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .maybeSingle();
    
    let responseText: string;
    
    if (renewalDate) {
      console.log(`[Nina] 📅 Parsed renewal date: ${renewalDate}`);
      
      // Save renewal date to deal.due_date
      if (prospectingPipeline) {
        await supabase
          .from('deals')
          .update({ 
            due_date: renewalDate,
            notes: `Data de renovação informada: ${new Date(renewalDate).toLocaleDateString('pt-BR')}`
          })
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id);
        
        console.log(`[Nina] 📅 Due date saved: ${renewalDate}`);
      }
      
      // Check if contact already has email
      if (conversation.contact?.email) {
        // Email exists - confirm it
        responseText = `Posso enviar informações no email ${conversation.contact.email}? Se preferir outro, me passa!`;
        await supabase
          .from('conversations')
          .update({ 
            nina_context: { 
              ...ninaContext, 
              awaiting_renewal_date: false,
              awaiting_email_confirmation: true, 
              renewal_date: renewalDate 
            }
          })
          .eq('id', conversation.id);
      } else {
        // No email - ask for it
        responseText = 'Perfeito! Pra enviar informações na época da renovação, qual seu melhor email?';
        await supabase
          .from('conversations')
          .update({ 
            nina_context: { 
              ...ninaContext, 
              awaiting_renewal_date: false,
              awaiting_email: true, 
              renewal_date: renewalDate 
            }
          })
          .eq('id', conversation.id);
      }
    } else {
      console.log(`[Nina] 📅 Could not parse date from: "${message.content}"`);
      responseText = 'Sem problema! Quando precisar de uma cotação é só chamar. Bom trabalho!';
      
      // Clear flag and move to Nurture without email
      await supabase
        .from('conversations')
        .update({ 
          status: 'paused',
          nina_context: { ...ninaContext, awaiting_renewal_date: false }
        })
        .eq('id', conversation.id);
      
      // Move deal to Nurture
      if (prospectingPipeline) {
        const { data: nurtureStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', prospectingPipeline.id)
          .eq('title', 'Nurture')
          .maybeSingle();
        
        if (nurtureStage) {
          await supabase
            .from('deals')
            .update({ stage_id: nurtureStage.id })
            .eq('contact_id', conversation.contact_id)
            .eq('pipeline_id', prospectingPipeline.id);
        }
      }
    }
    
    // Queue the response
    await queueTextResponse(supabase, conversation, message, responseText, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-renewal-date-capture' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Renewal date step completed`);
    return;
  }
  // ===== END SOFT REJECTION STEP 2 =====

  // ===== SOFT REJECTION STEP 1: ASK FOR RENEWAL DATE =====
  // Check if this is a prospecting conversation and message is a soft rejection
  if (conversationMetadata.origin === 'prospeccao' && message.content && isSoftRejection(message.content)) {
    console.log(`[Nina] 💛 Soft rejection detected: "${message.content}"`);
    
    // Ask for renewal date instead of immediate closure
    const askRenewalResponse = 'Entendido! Quando vence seu seguro atual? Assim posso entrar em contato na época da renovação.';
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Queue the renewal date question
    await queueTextResponse(supabase, conversation, message, askRenewalResponse, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Set awaiting_renewal_date flag (but don't move to Nurture yet)
    await supabase
      .from('conversations')
      .update({ 
        nina_context: { 
          ...ninaContext, 
          awaiting_renewal_date: true,
          soft_rejection_at: new Date().toISOString(),
          soft_rejection_reason: message.content
        }
      })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-soft-rejection-ask-date' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Soft rejection detected, asking for renewal date`);
    return;
  }
  // ===== END SOFT REJECTION STEP 1 =====

  // ===== OUT OF SCOPE INSURANCE DETECTION - HANDOFF TO SOFIA =====
  // Detect when lead asks for insurance types outside transport scope
  if (message.content && agent) {
    const outOfScopeCheck = detectOutOfScopeInsurance(message.content, agent.slug);
    
    if (outOfScopeCheck.isOutOfScope) {
      console.log(`[Nina] 🔄 Out of scope insurance detected: ${outOfScopeCheck.insuranceType} - "${outOfScopeCheck.detectedKeyword}"`);
      
      // Find Sofia agent
      const sofiaAgent = agents.find((a: Agent) => a.slug === 'sofia');
      
      if (sofiaAgent) {
        console.log(`[Nina] 🤖 Handoff to Sofia for ${outOfScopeCheck.friendlyName}`);
        
        // Update conversation to use Sofia agent and store detected insurance type
        const updatedContext = {
          ...ninaContext,
          out_of_scope_insurance: outOfScopeCheck.insuranceType,
          out_of_scope_friendly_name: outOfScopeCheck.friendlyName,
          out_of_scope_detected_at: new Date().toISOString(),
          handoff_from_agent: agent.name
        };
        
        await supabase
          .from('conversations')
          .update({ 
            current_agent_id: sofiaAgent.id,
            nina_context: updatedContext
          })
          .eq('id', conversation.id);
        
        // Generate Sofia's greeting based on insurance type
        let sofiaGreeting = `Olá! Sou especialista em ${outOfScopeCheck.friendlyName}. `;
        
        // Add first qualification question based on type
        switch (outOfScopeCheck.insuranceType) {
          case 'auto':
            sofiaGreeting += 'Qual veículo você quer segurar? (marca/modelo/ano)';
            break;
          case 'residencial':
            sofiaGreeting += 'É casa ou apartamento?';
            break;
          case 'vida':
            sofiaGreeting += 'O seguro seria individual ou para um grupo?';
            break;
          case 'viagem':
            sofiaGreeting += 'Para qual destino você vai viajar e por quantos dias?';
            break;
          case 'empresarial':
            sofiaGreeting += 'Qual tipo de negócio você tem?';
            break;
          case 'frota_geral':
            sofiaGreeting += 'Quantos veículos tem na frota?';
            break;
          default:
            sofiaGreeting += 'Me conta mais sobre o que você precisa proteger?';
        }
        
        // Calculate delay
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        
        // Get AI settings for metadata
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        // Queue Sofia's greeting
        await queueTextResponse(supabase, conversation, message, sofiaGreeting, settings, aiSettings, delay, sofiaAgent);
        
        // Mark message as processed
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        // Update deal - move to "Outros Seguros" pipeline
        const { data: currentDeal } = await supabase
          .from('deals')
          .select('id, notes')
          .eq('contact_id', conversation.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (currentDeal) {
          // Buscar pipeline "Outros Seguros"
          const { data: outrosSeguros } = await supabase
            .from('pipelines')
            .select('id')
            .eq('slug', 'outros-seguros')
            .single();
          
          let updateData: Record<string, unknown> = {};
          const existingNotes = currentDeal.notes || '';
          const newNote = `[${new Date().toLocaleDateString('pt-BR')}] Lead solicitou ${outOfScopeCheck.friendlyName} - transferido para Sofia`;
          updateData.notes = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;
          
          if (outrosSeguros) {
            // Buscar primeiro estágio do pipeline "Outros Seguros"
            const { data: firstStage } = await supabase
              .from('pipeline_stages')
              .select('id')
              .eq('pipeline_id', outrosSeguros.id)
              .order('position', { ascending: true })
              .limit(1)
              .single();
            
            updateData.pipeline_id = outrosSeguros.id;
            if (firstStage) {
              updateData.stage_id = firstStage.id;
            }
            console.log(`[Nina] 📦 Moving deal to "Outros Seguros" pipeline`);
          }
          
          await supabase
            .from('deals')
            .update(updateData)
            .eq('id', currentDeal.id);
        }
        
        // Trigger whatsapp-sender
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-sofia-handoff' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        console.log(`[Nina] ✅ Out of scope insurance handled, handed off to Sofia`);
        return;
      } else {
        // Sofia not found - fallback to human
        console.log(`[Nina] ⚠️ Sofia agent not found, transferring to human`);
        
        const fallbackMessage = `Obrigada pelo contato! Para ${outOfScopeCheck.friendlyName}, vou encaminhar para um de nossos corretores especializados que vai te ajudar.`;
        
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        await queueTextResponse(supabase, conversation, message, fallbackMessage, settings, aiSettings, delay, agent);
        
        await supabase
          .from('conversations')
          .update({ 
            status: 'human',
            nina_context: {
              ...ninaContext,
              out_of_scope_insurance: outOfScopeCheck.insuranceType,
              transferred_to_human_at: new Date().toISOString()
            }
          })
          .eq('id', conversation.id);
        
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-out-of-scope-fallback' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        return;
      }
    }
  }
  // ===== END OUT OF SCOPE INSURANCE DETECTION =====

  // ===== TRANSFER TO HUMAN DETECTION =====
  // Check if user is requesting transfer to human agent (direct request or confirmation)
  if (message.content) {
    const messageText = message.content.trim();
    
    // Get recent messages for context
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, content, from_type, sent_at')
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: false })
      .limit(5);
    
    const isDirectRequest = detectDirectTransferRequest(messageText);
    const isConfirmation = detectTransferConfirmation(messageText, recentMessages || []);
    
    if (isDirectRequest || isConfirmation) {
      console.log(`[Nina] 🔄 Transfer to human detected - Direct: ${isDirectRequest}, Confirmation: ${isConfirmation}`);
      
      // Find online agent
      const onlineAgent = await findOnlineAgent(supabase);
      
      let responseMessage: string;
      const contactName = conversation.contact?.call_name || conversation.contact?.name || 'você';
      
      // Calculate delay
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      
      // Get AI settings for metadata
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      // Check business hours
      const businessHoursStart = settings?.business_hours_start || '09:00:00';
      const businessHoursEnd = settings?.business_hours_end || '18:00:00';
      const businessDays = settings?.business_days || [1, 2, 3, 4, 5]; // Mon-Fri
      const timezone = settings?.timezone || 'America/Sao_Paulo';
      
      // Get current time in the configured timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: timezone,
        weekday: 'long'
      });
      
      const currentTimeStr = formatter.format(now);
      const currentDayOfWeek = new Date(now.toLocaleString('en-US', { timeZone: timezone })).getDay();
      
      // Parse times to compare
      const [startHour, startMin] = businessHoursStart.split(':').map(Number);
      const [endHour, endMin] = businessHoursEnd.split(':').map(Number);
      const [currentHour, currentMin] = currentTimeStr.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const currentMinutes = currentHour * 60 + currentMin;
      
      const isBusinessDay = businessDays.includes(currentDayOfWeek);
      const isWithinHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      const isWithinBusinessHours = isBusinessDay && isWithinHours;
      
      console.log(`[Nina] 🕐 Business hours check: day=${currentDayOfWeek}, time=${currentTimeStr}, isBusinessDay=${isBusinessDay}, isWithinHours=${isWithinHours}`);
      
      // Calculate next business time
      const getNextBusinessTime = (): { dayName: string; time: string } => {
        const daysOfWeek = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
        
        // If within business day but after hours, next is tomorrow (or next business day)
        // If weekend or non-business day, find next business day
        let daysToAdd = 1;
        let nextDay = (currentDayOfWeek + daysToAdd) % 7;
        
        while (!businessDays.includes(nextDay)) {
          daysToAdd++;
          nextDay = (currentDayOfWeek + daysToAdd) % 7;
          if (daysToAdd > 7) break; // Safety
        }
        
        // If we're on a business day but before hours, it's today
        if (isBusinessDay && currentMinutes < startMinutes) {
          return {
            dayName: 'hoje',
            time: `${startHour.toString().padStart(2, '0')}h`
          };
        }
        
        return {
          dayName: daysToAdd === 1 ? 'amanhã' : daysOfWeek[nextDay],
          time: `${startHour.toString().padStart(2, '0')}h`
        };
      };
      
      if (onlineAgent) {
        // Mensagem de despedida elaborada com agente online
        responseMessage = `Foi um prazer conversar com você, ${contactName}!

Vou te transferir agora para ${onlineAgent.name}, que vai continuar te atendendo.
Obrigada pela paciência e até a próxima!`;
        
        // Assign conversation to online agent
        await supabase
          .from('conversations')
          .update({
            status: 'human',
            assigned_user_id: onlineAgent.id,
            assigned_user_name: onlineAgent.name,
            nina_context: {
              ...ninaContext,
              transferred_at: new Date().toISOString(),
              transferred_to: onlineAgent.name,
              transferred_to_id: onlineAgent.id,
              transfer_reason: isDirectRequest ? 'direct_request' : 'user_confirmation'
            }
          })
          .eq('id', conversation.id);
        
        console.log(`[Nina] ✅ Conversa transferida para ${onlineAgent.name} (ID: ${onlineAgent.id})`);
      } else if (isWithinBusinessHours) {
        // Dentro do horário comercial, mas sem agente online
        responseMessage = `Obrigada por conversar comigo, ${contactName}!

Nossos corretores estão atendendo outros clientes no momento, mas um deles vai te responder em breve.
Agradeço sua paciência!`;
        
        // Mark as human without assignment (for triage)
        await supabase
          .from('conversations')
          .update({
            status: 'human',
            nina_context: {
              ...ninaContext,
              transferred_at: new Date().toISOString(),
              transfer_reason: isDirectRequest ? 'direct_request' : 'user_confirmation',
              no_agent_available: true,
              within_business_hours: true
            }
          })
          .eq('id', conversation.id);
        
        console.log(`[Nina] ⚠️ Dentro do horário comercial, nenhum agente online - conversa marcada como human para triagem`);
      } else {
        // Fora do horário comercial
        const nextBusiness = getNextBusinessTime();
        const currentDayName = dayFormatter.format(now).toLowerCase();
        const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;
        
        if (isWeekend) {
          responseMessage = `Obrigada por conversar comigo, ${contactName}!

Hoje é ${currentDayName} e nosso time está curtindo o merecido descanso.
Um corretor vai te responder na segunda-feira a partir das 09h.
Tenha um ótimo fim de semana!`;
        } else {
          responseMessage = `Obrigada por conversar comigo, ${contactName}!

Nosso horário de atendimento é de segunda a sexta, das ${startHour}h às ${endHour}h.
Um corretor vai te responder ${nextBusiness.dayName} a partir das ${nextBusiness.time}.
Agradeço pela compreensão!`;
        }
        
        // Mark as human without assignment (for triage)
        await supabase
          .from('conversations')
          .update({
            status: 'human',
            nina_context: {
              ...ninaContext,
              transferred_at: new Date().toISOString(),
              transfer_reason: isDirectRequest ? 'direct_request' : 'user_confirmation',
              no_agent_available: true,
              within_business_hours: false,
              next_business_time: `${nextBusiness.dayName} às ${nextBusiness.time}`
            }
          })
          .eq('id', conversation.id);
        
        console.log(`[Nina] ⚠️ Fora do horário comercial - próximo atendimento: ${nextBusiness.dayName} às ${nextBusiness.time}`);
      }
      
      // Queue the transfer confirmation message
      await queueTextResponse(supabase, conversation, message, responseMessage, settings, aiSettings, delay, agent);
      
      // Mark messages as processed
      const responseTime = Date.now() - new Date(message.sent_at).getTime();
      await markMessagesAsProcessed(supabase, message.id, aggregatedMessageIds, responseTime);
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-transfer-to-human' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log(`[Nina] ✅ Transfer to human completed`);
      return;
    }
  }
  // ===== END TRANSFER TO HUMAN DETECTION =====

  // ===== CALLBACK REQUEST DETECTION =====
  // Detect when lead wants to be called back at a specific time
  if (message.content) {
    const callbackIntent = detectCallbackIntent(message.content);
    
    if (callbackIntent.hasIntent) {
      console.log(`[Nina] 📞 Callback intent detected: "${message.content}"`);
      
      // Get the pipeline for this conversation's deal
      const { data: deal } = await supabase
        .from('deals')
        .select('id, pipeline_id')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (deal) {
        // Calculate the scheduled callback time
        const scheduledAt = calculateNextBusinessHour(callbackIntent.suggestedDate, callbackIntent.suggestedTime);
        
        // Get next assignee using round-robin
        const assignee = await getNextAssignee(supabase, deal.pipeline_id);
        
        // Create the callback activity
        const created = await createCallbackActivity(
          supabase,
          conversation.contact_id,
          deal.pipeline_id,
          scheduledAt,
          message.content,
          assignee
        );
        
        if (created) {
          // Generate response with scheduled date and period (not exact time)
          const formattedDate = scheduledAt.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            day: '2-digit', 
            month: 'long',
            timeZone: 'America/Sao_Paulo'
          });
          
          // Determine period of day based on scheduled hour
          const scheduledHour = scheduledAt.getHours();
          let periodText = '';
          if (scheduledHour < 12) {
            periodText = 'pela manhã';
          } else if (scheduledHour < 18) {
            periodText = 'à tarde';
          } else {
            periodText = 'no fim do dia';
          }
          
          const contactName = conversation.contact?.call_name || conversation.contact?.name || 'você';
          let responseText = `Perfeito, ${contactName}! `;
          
          if (assignee) {
            responseText += `${assignee.name} vai entrar em contato ${formattedDate}, ${periodText}.`;
          } else {
            responseText += `Vamos entrar em contato ${formattedDate}, ${periodText}.`;
          }
          
          // Calculate delay
          const delayMin = settings?.response_delay_min || 1000;
          const delayMax = settings?.response_delay_max || 3000;
          const delay = Math.random() * (delayMax - delayMin) + delayMin;
          
          // Get AI settings for metadata
          const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
          
          // Queue the confirmation response
          await queueTextResponse(supabase, conversation, message, responseText, settings, aiSettings, delay, agent);
          
          // Mark message as processed
          const responseTime = Date.now() - new Date(message.sent_at).getTime();
          await supabase
            .from('messages')
            .update({ 
              processed_by_nina: true,
              nina_response_time: responseTime
            })
            .eq('id', message.id);
          
          // Trigger whatsapp-sender
          try {
            const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
            fetch(senderUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ triggered_by: 'nina-orchestrator-callback-scheduled' })
            }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
          } catch (e) {
            console.error('[Nina] Failed to trigger whatsapp-sender:', e);
          }
          
          console.log(`[Nina] ✅ Callback scheduled for ${scheduledAt.toISOString()}, assigned to ${assignee?.name || 'unassigned'}`);
          return;
        }
      }
      // If we couldn't create the callback, continue with normal processing
      console.log('[Nina] Could not create callback activity, continuing with normal flow');
    }
  }
  // ===== END CALLBACK REQUEST DETECTION =====

  // If this is a prospecting conversation and lead responded (not rejection), move to Em Qualificação
  if (conversationMetadata.origin === 'prospeccao' && message.content) {
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .single();
    
    if (prospectingPipeline) {
      const { data: qualifyingStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectingPipeline.id)
        .eq('title', 'Em Qualificação')
        .single();
      
      if (qualifyingStage) {
        await supabase
          .from('deals')
          .update({ stage_id: qualifyingStage.id })
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id);
        
        console.log(`[Nina] 📊 Prospecting deal moved to Em Qualificação`);
      }
    }
  }
  // ===== END PROSPECTING STAGE UPDATE =====

  // Update conversation with current agent if changed
  if (agent && conversation.current_agent_id !== agent.id) {
    await supabase
      .from('conversations')
      .update({ current_agent_id: agent.id })
      .eq('id', conversation.id);
    console.log(`[Nina] Updated conversation agent to: ${agent.name}`);

    // Move deal to agent's pipeline if this is a handoff
    if (isHandoff) {
      const { data: agentPipeline } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('agent_id', agent.id)
        .eq('is_active', true)
        .maybeSingle();

      if (agentPipeline) {
        const { data: firstStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', agentPipeline.id)
          .eq('is_active', true)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          // Get next owner based on agent distribution (round_robin or fixed)
          const { data: nextOwnerId } = await supabase.rpc('get_next_deal_owner', { 
            p_agent_id: agent.id 
          });
          
          await supabase
            .from('deals')
            .update({ 
              pipeline_id: agentPipeline.id,
              stage_id: firstStage.id,
              owner_id: nextOwnerId || null
            })
            .eq('contact_id', conversation.contact_id);
          
          console.log(`[Nina] Deal movido para pipeline: ${agentPipeline.name}, owner: ${nextOwnerId || 'not assigned'}`);
        }
      }
    }
  }

  // ===== ENSURE DEAL HAS OWNER (even without handoff) =====
  // Check if current deal has no owner and assign one based on agent
  if (agent) {
    const { data: currentDeal } = await supabase
      .from('deals')
      .select('id, owner_id')
      .eq('contact_id', conversation.contact_id)
      .is('owner_id', null)
      .maybeSingle();

    if (currentDeal) {
      const { data: nextOwnerId } = await supabase.rpc('get_next_deal_owner', { 
        p_agent_id: agent.id 
      });
      
      if (nextOwnerId) {
        await supabase
          .from('deals')
          .update({ owner_id: nextOwnerId })
          .eq('id', currentDeal.id);
        
        console.log(`[Nina] 👤 Auto-assigned owner ${nextOwnerId} to deal ${currentDeal.id} (first assignment)`);
      }
    }
  }

  // Get recent messages for context
  // Omega (collection agent) uses 40 messages for better negotiation context, others use 20
  const messageLimit = agent?.slug === 'omega' ? 40 : 20;
  
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: false })
    .limit(messageLimit);
  
  console.log(`[Nina] 📝 Loaded ${recentMessages?.length || 0}/${messageLimit} messages for context (agent: ${agent?.slug || 'default'})`);

  // Build conversation history for AI
  const conversationHistory = (recentMessages || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.from_type === 'user' ? 'user' : 'assistant',
      content: msg.content || '[media]'
    }));

  // Get client memory
  const clientMemory = conversation.contact?.client_memory || {};

  // ===== CNPJ CONFIRMATION RESPONSE DETECTION =====
  // Check if IMMEDIATELY PREVIOUS assistant message was a CNPJ confirmation request
  // recentMessages is in DESC order (newest first), so:
  // 1. Find the current message index
  // 2. Get the next nina message after it (which is the one immediately before in time)
  const currentMessageIndex = (recentMessages || []).findIndex((m: any) => m.id === message.id);
  const immediatelyPreviousNinaMessage = currentMessageIndex >= 0 
    ? (recentMessages || []).slice(currentMessageIndex + 1).find((m: any) => m.from_type === 'nina')
    : null;
  
  const isConfirmationResponse = immediatelyPreviousNinaMessage?.content?.includes('Encontrei:') && 
                                  immediatelyPreviousNinaMessage?.content?.includes('Está correto?');
  
  if (isConfirmationResponse && message.content) {
    const userResponse = message.content.toLowerCase().trim();
    
    // Check for positive confirmation
    const positiveResponses = ['sim', 'confirmo', 'isso', 'correto', 'certo', 'isso mesmo', 'é isso', 'exato', 'exatamente', 's', 'ss', 'sss', 'simmm', 'simm', 'isso aí', 'isso ai', 'certinho', 'é esse', 'é essa', 'é sim', 'é'];
    const isPositive = positiveResponses.some(r => userResponse === r || userResponse.startsWith(r + ' ') || userResponse.endsWith(' ' + r));
    
    // Check for negative response with company correction
    const negativeResponses = ['não', 'nao', 'n', 'nn', 'nnn', 'errado', 'incorreto', 'não é', 'nao é', 'não, é', 'nao, é', 'na verdade', 'na vdd'];
    const isNegative = negativeResponses.some(r => userResponse.startsWith(r));
    
    if (isPositive) {
      console.log(`[Nina] ✅ Client confirmed company name`);
      
      // Continue with qualification - let AI continue the conversation
      // No early return - flow continues to AI processing
      
    } else if (isNegative) {
      console.log(`[Nina] ❌ Client rejected company name, checking for correction...`);
      
      // Try to extract the correct company name from the response
      // Common patterns: "Não, é XYZ", "Na verdade é XYZ", "É [company name]"
      const correctionPatterns = [
        /(?:não|nao|na verdade|na vdd)[,\s]+(?:é|e|o nome é|a empresa é|é a|nome é)\s+(.+)/i,
        /(?:é|o nome é|a empresa é)\s+(.+)/i,
        /(?:não|nao)[,\s]+(.+)/i
      ];
      
      let correctedName: string | null = null;
      for (const pattern of correctionPatterns) {
        const match = userResponse.match(pattern);
        if (match && match[1]) {
          const rawName = match[1].trim();
          // Clean up common trailing words
          correctedName = rawName.replace(/\s*(mesmo|sim|ok|tá|ta|beleza)$/i, '').trim();
          break;
        }
      }
      
      if (correctedName && correctedName.length > 2) {
        // Update contact with corrected company name
        await supabase
          .from('contacts')
          .update({ 
            company: correctedName.toUpperCase(),
            updated_at: new Date().toISOString() 
          })
          .eq('id', conversation.contact_id);
        
        console.log(`[Nina] 📝 Company name corrected to: ${correctedName.toUpperCase()}`);
        
        // Send acknowledgment message
        const ackMessage = `Anotado: ${correctedName.toUpperCase()}.`;
        
        // Calculate delay
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        
        // Get AI settings for metadata
        const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
        
        // Queue the acknowledgment message
        await queueTextResponse(supabase, conversation, message, ackMessage, settings, aiSettings, delay, agent);
        
        // Mark message as processed
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        // Trigger whatsapp-sender
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-cnpj-correction' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        console.log(`[Nina] 📋 Company correction acknowledged`);
        return; // Return early, next message will continue qualification
      }
      // If we couldn't extract a correction, let AI handle the response naturally
    }
  }
  // ===== END CNPJ CONFIRMATION RESPONSE DETECTION =====

  // ===== IMMEDIATE CNPJ DETECTION WITH CONFIRMATION =====
  // Detect CNPJ in user message, fetch company data, and ask for confirmation
  if (message.content) {
    const cnpjRegex = /(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\.\s]?\d{2})/g;
    const cnpjMatch = message.content.match(cnpjRegex);
    
    if (cnpjMatch) {
      const cleanCnpj = cnpjMatch[0].replace(/\D/g, '');
      if (cleanCnpj.length === 14) {
        console.log(`[Nina] 📋 CNPJ detected in message: ${cleanCnpj}`);
        
        // Check if contact already has this CNPJ
        const existingCnpj = conversation.contact?.cnpj?.replace(/\D/g, '');
        if (existingCnpj !== cleanCnpj) {
          // Fetch company data from BrasilAPI
          try {
            const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (brasilApiResponse.ok) {
              const cnpjData = await brasilApiResponse.json();
              const companyName = cnpjData.nome_fantasia || cnpjData.razao_social;
              
              // ===== ANTT / RNTRC LOOKUP =====
              // Consulta o RNTRC do transportador na ANTT (portal oficial via consulta-antt)
              let anttResult: any = null;
              try {
                const anttResp = await fetch(`${supabaseUrl}/functions/v1/consulta-antt`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({ cnpj: cleanCnpj })
                });
                if (anttResp.ok) {
                  anttResult = await anttResp.json();
                  console.log(`[Nina] 🚚 ANTT lookup: ${JSON.stringify(anttResult)}`);
                }
              } catch (anttErr) {
                console.log('[Nina] ⚠️ ANTT lookup failed:', anttErr);
              }
              
              // Update contact with CNPJ, company name and RNTRC
              const updateData: Record<string, any> = { 
                cnpj: cleanCnpj,
                updated_at: new Date().toISOString() 
              };
              
              if (companyName) {
                updateData.company = companyName;
              }
              
              if (anttResult?.found && anttResult?.rntrc) {
                updateData.rntrc = anttResult.rntrc;
              }
              
              await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', conversation.contact_id);
                
              console.log(`[Nina] ✅ Contact updated - CNPJ: ${cleanCnpj}, Company: ${companyName || 'N/A'}, RNTRC: ${updateData.rntrc || 'N/A'}`);
              
              // If we got company name, send confirmation message and return early
              if (companyName) {
                let confirmationMessage: string;
                if (anttResult?.found && anttResult?.rntrc) {
                  const situacao = anttResult.situacao ? ` — situação na ANTT: ${anttResult.situacao}` : '';
                  confirmationMessage = `Encontrei: ${companyName.toUpperCase()}. RNTRC nº ${anttResult.rntrc}${situacao}. Está correto?`;
                } else {
                  confirmationMessage = `Encontrei: ${companyName.toUpperCase()}. Não localizei um RNTRC ativo na ANTT para este CNPJ. Você já tem registro de ETC (Empresa de Transporte de Carga) na ANTT? Está correto o nome da empresa?`;
                }

                
                // Calculate delay
                const delayMin = settings?.response_delay_min || 1000;
                const delayMax = settings?.response_delay_max || 3000;
                const delay = Math.random() * (delayMax - delayMin) + delayMin;
                
                // Get AI settings for metadata
                const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
                
                // Queue the confirmation message
                await queueTextResponse(supabase, conversation, message, confirmationMessage, settings, aiSettings, delay, agent);
                
                // Mark message as processed
                const responseTime = Date.now() - new Date(message.sent_at).getTime();
                await supabase
                  .from('messages')
                  .update({ 
                    processed_by_nina: true,
                    nina_response_time: responseTime
                  })
                  .eq('id', message.id);
                
                // Trigger whatsapp-sender
                try {
                  const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
                  fetch(senderUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseServiceKey}`
                    },
                    body: JSON.stringify({ triggered_by: 'nina-orchestrator-cnpj-confirmation' })
                  }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
                } catch (e) {
                  console.error('[Nina] Failed to trigger whatsapp-sender:', e);
                }
                
                console.log(`[Nina] 📋 CNPJ confirmation message queued for ${companyName}`);
                return new Response(JSON.stringify({ 
                  success: true, 
                  action: 'cnpj_confirmation_sent',
                  company: companyName
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            } else {
              // BrasilAPI failed but still save the CNPJ
              await supabase
                .from('contacts')
                .update({ 
                  cnpj: cleanCnpj,
                  updated_at: new Date().toISOString() 
                })
                .eq('id', conversation.contact_id);
                
              console.log(`[Nina] ⚠️ CNPJ saved (BrasilAPI lookup failed): ${cleanCnpj}`);
            }
          } catch (err) {
            console.log('[Nina] ⚠️ BrasilAPI error, saving CNPJ anyway:', err);
            // Still save the CNPJ even if BrasilAPI fails
            await supabase
              .from('contacts')
              .update({ 
                cnpj: cleanCnpj,
                updated_at: new Date().toISOString() 
              })
              .eq('id', conversation.contact_id);
          }
        } else {
          console.log(`[Nina] CNPJ already saved: ${cleanCnpj}`);
        }
      }
    }
  }
  // ===== END CNPJ DETECTION =====

  // ===== IMMEDIATE EMAIL DETECTION =====
  // Detect email in user message and save to contact automatically
  if (message.content) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const emailMatch = message.content.match(emailRegex);
    
    if (emailMatch) {
      const detectedEmail = emailMatch[0].toLowerCase();
      console.log(`[Nina] 📧 Email detected in message: ${detectedEmail}`);
      
      // Check if contact already has this email
      const existingEmail = conversation.contact?.email?.toLowerCase();
      if (existingEmail !== detectedEmail) {
        // Update contact with email
        const { error: emailUpdateError } = await supabase
          .from('contacts')
          .update({ 
            email: detectedEmail,
            updated_at: new Date().toISOString() 
          })
          .eq('id', conversation.contact_id);
          
        if (emailUpdateError) {
          console.error(`[Nina] ❌ Error updating contact email:`, emailUpdateError);
        } else {
          console.log(`[Nina] ✅ Contact email updated: ${detectedEmail}`);
        }
      } else {
        console.log(`[Nina] Email already saved: ${detectedEmail}`);
      }
    }
  }
  // ===== END EMAIL DETECTION =====

  // ===== REAL-TIME QUALIFICATION EXTRACTION (modelo Mitsui) =====
  const existingQA = conversation.nina_context?.qualification_answers || {};
  const mergedQA: { [key: string]: string } = { ...existingQA };

  // Extrai o tipo de transportador (contratado/subcontratado) das mensagens do lead
  const userMsgTexts = (conversationHistory as any[])
    .filter((m: any) => m.role === 'user' && m.content)
    .map((m: any) => String(m.content));
  if (message.content) userMsgTexts.push(String(message.content));

  const extractedQA = extractQualificationFromMessages(userMsgTexts);
  for (const [k, v] of Object.entries(extractedQA)) {
    if (v) mergedQA[k] = v as string;
  }

  // Persiste as respostas de qualificação no nina_context (usado no prompt anti-repetição)
  if (Object.keys(extractedQA).length > 0) {
    const newContext = { ...(conversation.nina_context || {}), qualification_answers: mergedQA };
    conversation.nina_context = newContext;
    await supabase
      .from('conversations')
      .update({ nina_context: newContext })
      .eq('id', conversation.id);
  }

  // ===== AÇÃO DE CONCLUSÃO DA QUALIFICAÇÃO =====
  // Recarrega o contato para ter cnpj/email/telefone mais recentes (podem ter sido
  // atualizados acima na detecção de CNPJ/e-mail).
  const { data: freshContact } = await supabase
    .from('contacts')
    .select('id, cnpj, email, phone_number, whatsapp_id')
    .eq('id', conversation.contact_id)
    .maybeSingle();
  const contactForCheck = freshContact || conversation.contact;

  const tipoTransportador = (mergedQA.tipo_transportador || '').toLowerCase();
  const linkAlreadySent = !!conversation.nina_context?.qualification_link_sent;

  // GATILHO: lead é CONTRATADO -> precisa do produto COM cobertura/averbação.
  // Antes de encaminhar para o corretor humano, COLETAMOS os dados essenciais
  // (CNPJ + e-mail + celular). Enquanto faltar dado, NÃO faz handoff — deixa a
  // IA continuar coletando (uma pergunta por vez, conforme o prompt).
  if (tipoTransportador === 'contratado' && !conversation.nina_context?.contratado_handoff_done) {
    if (isContratadoDataComplete(contactForCheck)) {
      console.log('[Nina] ✅ Contratado com dados completos — encaminhando para corretor humano.');
      const handoffMsg = 'Perfeito, já tenho seus dados! Como você atua como contratado (responsável pela carga), o certo é o seguro convencional COM averbação dos embarques — o pacote de compliance do subcontratado não cobre frete fechado direto com o dono da carga. Já deixei seu atendimento com um dos nossos corretores especialistas, que vai montar a proposta certa pra você.';
      const aiSettings = getModelSettings(settings, conversationHistory, message, contactForCheck, clientMemory);
      const delay = Math.random() * ((settings?.response_delay_max || 3000) - (settings?.response_delay_min || 1000)) + (settings?.response_delay_min || 1000);
      await queueTextResponse(supabase, conversation, message, handoffMsg, settings, aiSettings, delay, agent);

      // Registra/avisa o corretor: lead_status='proposal' dispara notify_lead_proposal -> replicate-lead-to-crm
      await supabase
        .from('contacts')
        .update({ lead_status: 'proposal', updated_at: new Date().toISOString() })
        .eq('id', conversation.contact_id);

      await supabase
        .from('conversations')
        .update({
          status: 'open',
          is_active: false,
          nina_context: { ...(conversation.nina_context || {}), contratado_handoff_done: true },
        })
        .eq('id', conversation.id);
      await supabase.from('messages').update({ processed_by_nina: true, nina_response_time: Date.now() - new Date(message.sent_at).getTime() }).eq('id', message.id);
      try {
        fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-contratado-handoff' }),
        }).catch((e) => console.error('[Nina] sender trigger error:', e));
      } catch (_) { /* noop */ }
      return new Response(JSON.stringify({ success: true, action: 'contratado_handoff' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Dados ainda incompletos: segue o fluxo normal da IA para coletar CNPJ/e-mail/celular.
    console.log('[Nina] ⏳ Contratado sem dados completos — continuando coleta antes do handoff.');
  }

  // SUBCONTRATADO qualificado (CNPJ + e-mail + celular + tipo) -> envia link + registra lead
  if (!linkAlreadySent && isQualificationComplete(contactForCheck, mergedQA)) {
    console.log('[Nina] ✅ Qualificação completa (subcontratado) — enviando link e registrando lead.');
    const linkMsg = 'Perfeito! Você está 100% dentro do perfil.\n\nÉ só preencher a proposta neste link oficial para eu emitir sua cotação e a apólice com as 3 coberturas (RCTR-C, RC-DC e RC-V):\nhttps://rctr-c.rc-dc.rc-v.jacometo.com.br\n\nQualquer dúvida no preenchimento, é só me chamar aqui. Já deixei seu atendimento com um corretor também.';
    const aiSettings = getModelSettings(settings, conversationHistory, message, contactForCheck, clientMemory);
    const delay = Math.random() * ((settings?.response_delay_max || 3000) - (settings?.response_delay_min || 1000)) + (settings?.response_delay_min || 1000);
    await queueTextResponse(supabase, conversation, message, linkMsg, settings, aiSettings, delay, agent);

    // Registra/avisa o corretor: lead_status='proposal' dispara notify_lead_proposal -> replicate-lead-to-crm
    await supabase
      .from('contacts')
      .update({ lead_status: 'proposal', updated_at: new Date().toISOString() })
      .eq('id', conversation.contact_id);

    await supabase
      .from('conversations')
      .update({ nina_context: { ...(conversation.nina_context || {}), qualification_link_sent: true } })
      .eq('id', conversation.id);

    await supabase.from('messages').update({ processed_by_nina: true, nina_response_time: Date.now() - new Date(message.sent_at).getTime() }).eq('id', message.id);
    try {
      fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-qualification-complete' }),
      }).catch((e) => console.error('[Nina] sender trigger error:', e));
    } catch (_) { /* noop */ }
    return new Response(JSON.stringify({ success: true, action: 'qualification_complete_link_sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  // ===== END REAL-TIME QUALIFICATION EXTRACTION =====

  // (Cargo email capture and qualification blocks removed - not applicable for OrbePet)

  // (Cargo qualification complete check removed - not applicable for OrbePet)

  // Check if this is the first interaction (only 1 user message, no assistant messages yet)
  const userMessages = conversationHistory.filter((m: any) => m.role === 'user');
  const assistantMessages = conversationHistory.filter((m: any) => m.role === 'assistant');
  const isFirstInteraction = userMessages.length === 1 && assistantMessages.length === 0;

  // If first interaction and agent has greeting_message, use it ONLY when the
  // first message is a pure greeting. If the lead already arrives with a real
  // question/request (e.g. "Olá! ...dúvidas sobre os 3 seguros..."), let the AI
  // answer it instead of sending the fixed greeting text.
  if (isFirstInteraction && agent?.greeting_message && isPureGreeting(message.content)) {

    // Normal greeting
    console.log(`[Nina] First interaction - using greeting_message for ${agent.name}`);
    const greetingContent = processPromptTemplate(agent.greeting_message, conversation.contact);
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
    
    // Queue the greeting message
    await queueTextResponse(supabase, conversation, message, greetingContent, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);

    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-greeting' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (err) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', err);
    }

    console.log('[Nina] Greeting message queued, skipping AI call');
    return;
  }

  // Build system prompt - use agent prompt or fallback to settings/default
  let systemPrompt: string;
  if (agent) {
    systemPrompt = agent.system_prompt;
  } else {
    systemPrompt = settings?.system_prompt_override || getDefaultSystemPrompt();
  }

  // Build enhanced system prompt with context (including qualification answers from nina_context)
  // Also pass recent user messages for history verification
  const recentUserMsgs = (recentMessages || [])
    .filter((m: any) => m.from_type === 'user' && m.content)
    .slice(-8)
    .map((m: any) => m.content);
  
  // ===== EXTRACT RECENT AGENT MESSAGES FOR ANTI-REPETITION =====
  const recentAgentMsgs = (recentMessages || [])
    .filter((m: any) => m.from_type === 'nina' && m.content)
    .slice(-3)
    .map((m: any) => m.content);
  
  // ===== FETCH RECENT CALL LOGS WITH TRANSCRIPTIONS FOR RETURNING LEADS =====
  let recentCallLogs: any[] = [];
  try {
    const { data: callLogs } = await supabase
      .from('call_logs')
      .select('started_at, status, transcription, duration_seconds')
      .eq('contact_id', conversation.contact_id)
      .not('transcription', 'is', null)
      .order('started_at', { ascending: false })
      .limit(3);
    
    if (callLogs && callLogs.length > 0) {
      recentCallLogs = callLogs;
      console.log(`[Nina] 📞 Loaded ${callLogs.length} call logs with transcriptions for context`);
    }
  } catch (err) {
    console.error('[Nina] Error fetching call logs:', err);
  }
  
  // ===== FETCH INSTALLMENTS DATA FOR COLLECTION QUERIES =====
  let installmentsData: InstallmentsData | null = null;
  
  // Detect if current message is asking about pending payments OR if using omega (collection) agent
  const currentMessageContent = message.content || '';
  const isFinancialQuery = isCollectionQuery(currentMessageContent) || agent?.slug === 'omega';
  
  if (isFinancialQuery && conversation.contact_id) {
    console.log('[Nina] 💰 Financial query detected, fetching installments data...');
    installmentsData = await fetchContactInstallments(supabase, conversation.contact_id);
  }
  
  // ===== FETCH PRODUCT KNOWLEDGE =====
  let productKnowledgeContent = '';
  try {
    const { data: activeProducts } = await supabase
      .from('product_knowledge')
      .select('name, insurer, full_content, summary')
      .eq('is_active', true)
      .eq('extraction_status', 'completed');
    
    if (activeProducts && activeProducts.length > 0) {
      productKnowledgeContent = '\n\n## 📚 BASE DE CONHECIMENTO - CONDIÇÕES GERAIS DOS PRODUTOS\n';
      for (const prod of activeProducts) {
        productKnowledgeContent += `\n### ${prod.name}${prod.insurer ? ` (${prod.insurer})` : ''}\n`;
        if (prod.summary) {
          productKnowledgeContent += `**Resumo:** ${prod.summary}\n\n`;
        }
        if (prod.full_content) {
          productKnowledgeContent += prod.full_content + '\n';
        }
      }
      productKnowledgeContent += `\n⚠️ Use estas informações das condições gerais para responder perguntas sobre coberturas, exclusões, carências, limites e procedimentos dos produtos. Cite as condições gerais quando relevante.`;
      console.log(`[Nina] 📚 Product knowledge loaded: ${activeProducts.length} products, ${productKnowledgeContent.length} chars`);
    }
  } catch (err) {
    console.error('[Nina] Error fetching product knowledge:', err);
  }

  // ===== FETCH PLANS CATALOG (SINGLE SOURCE OF TRUTH) =====
  let plansCatalogContent = '';
  try {
    const { data: plans } = await supabase
      .from('orbe_plans_catalog')
      .select('plan_name, monthly_price, coverages, limits_per_event, annual_limit, waiting_period_days, max_pet_age_years, preexisting_conditions_rule')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    
    if (plans && plans.length > 0) {
      plansCatalogContent = '\n\n## 📋 CATÁLOGO OFICIAL DE SEGUROS (FONTE ÚNICA DE VERDADE)\n';
      plansCatalogContent += '\n⛔ NUNCA invente preços, coberturas ou percentuais. Use APENAS os dados abaixo.\n';
      plansCatalogContent += '\nℹ️ O pacote reúne as 3 coberturas obrigatórias (RCTR-C, RC-DC e RC-V) em uma ÚNICA apólice da seguradora parceira, com um único pagamento anual. NÃO há averbação por embarque para o subcontratado.\n';
      plansCatalogContent += `
🚫 REGRA CRÍTICA DE PREÇO — use EXATAMENTE estes valores, nunca invente percentuais, prazos ou descontos:

• Preço: R$ 911,66/ano (prêmio básico anual, pagamento à vista via Pix).
• O pagamento anual cobre a emissão das 3 coberturas obrigatórias (RCTR-C, RC-DC e RC-V) em uma única apólice, com um número para indicar no RNTRC.

• Vigência: 1 ano a partir da emissão.
• Emissão da apólice: em até 2 HORAS após o aceite da proposta e a confirmação do pagamento.
• NÃO existe averbação por embarque nesta modalidade — é um valor anual único.

⚠️ IMPORTANTE: esta é a modalidade de COMPROVAÇÃO do seguro obrigatório do transportador SUBCONTRATADO. A carga transportada é averbada na apólice da TRANSPORTADORA CONTRATANTE, que é quem responde pela cobertura do embarque. Deixe SEMPRE explícito que embarques feitos como CONTRATADO DIRETO (frete fechado direto com o dono da carga) NÃO estão cobertos por esta apólice. Nunca prometa cobertura própria da carga nesta modalidade.

`;
      plansCatalogContent += `
⛔ REGRA INEGOCIÁVEL — QUEM PODE CONTRATAR
- MEI e ME com registro no RNTRC da ANTT como ETC (Empresa de Transporte de Carga).
- Também atende EPP de pequeno porte, principalmente como subcontratada de transportadoras maiores.
- Base legal: RCTR-C, RC-DC e RC-V são obrigatórios pela Lei 14.599/2023 (obrigatório desde 09/01/2026); base histórica no Art. 13 da Lei 11.442/2007.
- Seguradora emissora: seguradora parceira registrada na SUSEP. A Jacometo é a corretora que cuida de toda a contratação.
- NUNCA invente outras coberturas, descontos ou produtos que não estejam neste catálogo.
`;
      plansCatalogContent += `
⛔ REGRA DE CONTRATAÇÃO — CANAL ÚNICO
- Seu papel é TIRAR DÚVIDAS do transportador (coberturas, preços, regularização ANTT e como funciona atuar como SUBCONTRATADO de transportadoras maiores).
- A contratação é feita EXCLUSIVAMENTE pelo site oficial: https://rctr-c.rc-dc.rc-v.jacometo.com.br
- Você (Iris) NÃO fecha contrato, NÃO gera boleto e NÃO coleta pagamento pelo chat.

🎯 FLUXO DE QUALIFICAÇÃO (SIGA ESTA ORDEM — UMA PERGUNTA POR VEZ):

PERGUNTA 0 — TRIAGEM (SEMPRE PRIMEIRO, ANTES DE QUALQUER PITCH):
Logo na abertura da conversa, faça APENAS a pergunta de triagem, sem apresentar produto, preço ou coberturas ainda:
"Você atua como CONTRATADO (responsável pela carga, emite o próprio CT-e como principal) ou como SUBCONTRATADO/agregado de outra transportadora?"
Só depois de saber o tipo é que você segue o caminho certo. NÃO explique a apólice antes dessa resposta.

➡️ SE SUBCONTRATADO (agregado): apresente a apólice de compliance (com os avisos obrigatórios: sem averbação por viagem, carga averbada na apólice do contratante, e embarques como contratado direto NÃO cobertos) e conduza a qualificação:
1. CNPJ da transportadora. (Ao receber, o sistema consulta Receita + ANTT automaticamente e já mostra a confirmação — não peça de novo.)
2. Confirme a empresa e o RNTRC/situação na ANTT que o sistema encontrou.
3. Peça o E-MAIL para envio da cotação.
4. Confirme o CELULAR (WhatsApp): como a conversa já é no WhatsApp, pergunte "Posso usar este mesmo número para o atendimento?" — NÃO peça o número do zero.
5. Com tudo confirmado (CNPJ + e-mail + celular), envie o link: https://rctr-c.rc-dc.rc-v.jacometo.com.br para o lead preencher a proposta.

➡️ SE CONTRATADO (responsável pela carga): este pacote de compliance NÃO serve — ele precisa do produto COM cobertura efetiva/averbação da carga. NÃO envie o link do site. Explique isso em 1 frase e COLETE os dados para o corretor humano montar a proposta certa, uma pergunta por vez:
1. CNPJ da transportadora. (O sistema consulta Receita + ANTT automaticamente — não peça de novo.)
2. Confirme a empresa e o RNTRC/situação na ANTT.
3. Peça o E-MAIL para envio da cotação.
4. Confirme o CELULAR (WhatsApp): "Posso usar este mesmo número?" — NÃO peça do zero.
5. Com CNPJ + e-mail + celular coletados, avise que vai encaminhar para um corretor especialista (o sistema faz o handoff automaticamente).

`;
      plansCatalogContent += `
⛔ REGRA INEGOCIÁVEL — APÓLICE DO TRANSPORTADOR SUBCONTRATADO (AGREGADO)
Modalidade inédita no mercado, criada para o transportador que atua como SUBCONTRATADO (agregado) e precisa apenas cumprir a exigência legal de possuir seguro de transporte para operar com o RNTRC (ANTT).

Como funciona na prática:
- Como subcontratado, o transportador NÃO precisa averbar os embarques. A carga é averbada na apólice da TRANSPORTADORA CONTRATANTE, que responde pela cobertura do embarque.
- Esta apólice COMPROVA que o transportador possui o seguro obrigatório exigido para operar com o RNTRC (ANTT), sem burocracia de averbação a cada viagem.
- A fiscalização é ELETRÔNICA: as seguradoras informam as apólices emitidas e a ANTT cruza esses dados com o RNTRC. Sem apólice vinculada, o registro fica irregular/suspenso.
- Passo a passo: preencher a proposta online com o CNPJ → aceitar a proposta e pagar → emissão em até 2 horas → indicar o número da apólice no RNTRC.

⚠️ ATENÇÃO — INFORMAÇÃO ESSENCIAL (NUNCA OMITIR):
- Esta apólice cobre a operação como SUBCONTRATADO. Embarques em que o transportador atua como CONTRATADO DIRETO (fecha frete direto com o dono da carga) NÃO estão cobertos por ela.
- Sempre que explicar a modalidade subcontratado, deixe esse limite EXPLÍCITO.

⛔ QUEM NÃO É ELEGÍVEL:
- Quem fecha frete direto com o dono da carga ou precisa averbar cada embarque.
- Pessoa física / autônomo (TAC) — o produto é EXCLUSIVO para PJ (MEI, ME ou EPP) com RNTRC ativo como ETC.

📌 REGRAS OPERACIONAIS:
- Apenas UMA apólice ativa por registro RNTRC. Quem já tem seguro vigente deve falar com a Central antes, para fazer a troca na virada.
- RNTRC vencido ou suspenso: a proposta pode ser registrada, mas a emissão depende de regularizar o registro na ANTT.
- Central de Atendimento Jacometo: (43) 3321-5007 · WhatsApp (43) 99156-2099.

MIGRAÇÃO PARA CONTRATADO (responsável pela carga):
- Se o transportador passar a atuar como CONTRATADO direto, precisa avisar a Central ANTES do embarque para migrar ao seguro convencional (com averbação, faturamento mensal e gerenciamento de risco).
- Somente com o produto convencional as viagens como contratado ficam efetivamente protegidas.

`;

      const formatLimitKey = (key: string) =>
        key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      for (const plan of plans) {
        const price = parseFloat(plan.monthly_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const coverages = Array.isArray(plan.coverages) ? plan.coverages.join('; ') : 'Consulte detalhes';
        plansCatalogContent += `\n### ${plan.plan_name} — ${price}/ano`;
        plansCatalogContent += `\n- Coberturas: ${coverages}`;
        if (plan.limits_per_event && typeof plan.limits_per_event === 'object') {
          plansCatalogContent += `\n- Regras e valores:`;
          for (const [key, raw] of Object.entries(plan.limits_per_event)) {
            const label = formatLimitKey(key);
            if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
              const obj = raw as Record<string, any>;
              const valorRaw = obj.valor;
              const valorStr = typeof valorRaw === 'number'
                ? `R$ ${valorRaw.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : String(valorRaw ?? '—');
              const parts: string[] = [];
              if (obj.limite) parts.push(String(obj.limite));
              if (obj.observacao) parts.push(String(obj.observacao));
              const suffix = parts.length ? ` (${parts.join(', ')})` : '';
              plansCatalogContent += `\n  • ${label}: ${valorStr}${suffix}`;
            } else {
              plansCatalogContent += `\n  • ${label}: ${raw}`;
            }
          }
        }
        if (plan.preexisting_conditions_rule) plansCatalogContent += `\n- Observação: ${plan.preexisting_conditions_rule}`;
        plansCatalogContent += '\n';
      }

      console.log(`[Nina] 📋 Plans catalog loaded: ${plans.length} plans`);
    }
  } catch (err) {
    console.error('[Nina] Error fetching plans catalog:', err);
  }
  
  // ===== FETCH COLLECTION TEMPLATE CONTEXT =====
  // Buscar contexto do template de cobrança enviado para manter continuidade
  let collectionContext: CollectionTemplateContext | null = null;
  
  // Buscar se agente é omega (cobrança) OU se é uma query financeira OU sempre buscar para ter contexto
  if (agent?.slug === 'omega' || isFinancialQuery || true) { // Sempre buscar para ter contexto
    collectionContext = await fetchCollectionTemplateContext(supabase, conversation.id);
    if (collectionContext) {
      console.log('[Nina] 📋 Collection template context found:', collectionContext.templateName);
    }
  }
  
  const enhancedSystemPrompt = buildEnhancedPrompt(
    systemPrompt, 
    conversation.contact, 
    clientMemory,
    agent,
    conversation.nina_context,
    recentUserMsgs,
    recentAgentMsgs,
    recentCallLogs,
    installmentsData,
    collectionContext,
    productKnowledgeContent + plansCatalogContent
  );

  // Process template variables
  let processedPrompt = processPromptTemplate(enhancedSystemPrompt, conversation.contact);

  // (Pet-specific enforcement removed — Jacometo Corretora context is cargo insurance.)
  const orbe360Intent = false;
  const overAgePet = false;

  console.log('[Nina] Calling Lovable AI...');

  // Get AI model settings
  const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);

  console.log('[Nina] Using AI settings:', aiSettings);

  // If this is a handoff, prepend the handoff message
  let aiContent: string;
  
  if (isHandoff && agent?.handoff_message) {
    // Send handoff message first, then process the actual question
    console.log(`[Nina] Sending handoff message for ${agent.name}`);
    
    const handoffContent = processPromptTemplate(agent.handoff_message, conversation.contact);
    
    // Queue handoff message
    await queueTextResponse(
      supabase, 
      conversation, 
      message, 
      handoffContent, 
      settings, 
      aiSettings, 
      500 // Short delay for handoff
    );
    
    // Wait a bit before generating AI response
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: 'system', content: processedPrompt },
          ...conversationHistory
        ],
        temperature: aiSettings.temperature,
        max_tokens: 2500,
        ...(aiSettings.reasoning && { reasoning: aiSettings.reasoning })
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Nina] AI response error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded, will retry later');
      }
      if (aiResponse.status === 402) {
        throw new Error('Payment required - please add credits');
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    aiContent = aiData.choices?.[0]?.message?.content;
    
    // 🛡️ AUTO-RETRY: Se a resposta foi truncada (finish_reason=length), refaz com max_tokens maior
    if (aiContent && aiData.choices?.[0]?.finish_reason === 'length') {
      console.warn('[Nina] ⚠️ Resposta de handoff truncada (finish_reason=length, len=' + aiContent.length + '), refazendo com max_tokens=4000');
      try {
        const retryResponse = await fetch(LOVABLE_AI_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: aiSettings.model,
            messages: [{ role: 'system', content: processedPrompt }, ...conversationHistory],
            temperature: aiSettings.temperature,
            max_tokens: 4000,
            ...(aiSettings.reasoning && { reasoning: aiSettings.reasoning })
          })
        });
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryContent = retryData.choices?.[0]?.message?.content;
          if (retryContent && retryData.choices[0].finish_reason !== 'length') {
            aiContent = retryContent;
            console.log('[Nina] ✅ Retry de handoff bem-sucedido (len=' + retryContent.length + ')');
          } else if (retryContent && retryContent.length > aiContent.length) {
            // Mesmo truncado, se for maior, usa
            aiContent = retryContent;
            console.warn('[Nina] ⚠️ Retry ainda truncado, mas mais completo (len=' + retryContent.length + ')');
          }
        }
      } catch (retryErr) {
        console.error('[Nina] Erro no retry de handoff:', retryErr);
      }
    }
    
    // Fallback to alternative model if primary returns empty response
    if (!aiContent) {
      console.warn('[Nina] ⚠️ Empty response from primary model in handoff, retrying with gemini-2.5-flash...');
      console.warn('[Nina] Original model was:', aiSettings.model);
      
      const fallbackResponse = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: processedPrompt },
            ...conversationHistory
          ],
          temperature: 0.8,
          max_tokens: 2500
        })
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        aiContent = fallbackData.choices?.[0]?.message?.content;
        console.log('[Nina] Fallback model (gemini-2.5-flash) response in handoff:', aiContent ? 'success' : 'also empty');
      } else {
        console.error('[Nina] Fallback model (gemini-2.5-flash) also failed in handoff:', fallbackResponse.status);
      }
    }

    // 🆕 Second fallback in handoff: Try GPT-5-mini
    if (!aiContent) {
      console.warn('[Nina] ⚠️ Gemini fallback also empty in handoff, trying gpt-5-mini...');
      
      try {
        const gptFallbackResponse = await fetch(LOVABLE_AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-5-mini',
            messages: [
              { role: 'system', content: processedPrompt },
              ...conversationHistory
            ],
            max_completion_tokens: 1000
          })
        });

        if (gptFallbackResponse.ok) {
          const gptData = await gptFallbackResponse.json();
          aiContent = gptData.choices?.[0]?.message?.content;
          console.log('[Nina] GPT-5-mini fallback response in handoff:', aiContent ? 'success' : 'also empty');
        } else {
          console.error('[Nina] GPT-5-mini fallback also failed in handoff:', gptFallbackResponse.status);
        }
      } catch (gptError) {
        console.error('[Nina] GPT-5-mini fallback error in handoff:', gptError);
      }
    }
    
    // 🆕 Enhanced fallback message for handoff
    if (!aiContent) {
      console.error('[Nina] All 3 models returned empty response in handoff, using enhanced fallback message');
      aiContent = 'Tive uma pequena dificuldade técnica para processar sua mensagem. Posso te transferir para um atendente humano se preferir. Deseja continuar conversando comigo ou falar com alguém da equipe?';
    }

    // Sanitize handoff response (also runs enforceOrbe360Link automatically)
    aiContent = sanitizeAiResponse(aiContent);

    // ===== ORBE 360 SAFETY NET (handoff path) =====
    if (orbe360Intent && aiContent && !aiContent.toLowerCase().includes('orbepet.com.br/orbe-360')) {
      console.warn('[Nina][Orbe360][SafetyNet] intent_detected_no_mention (handoff) — aplicando fallback determinístico.');
      aiContent = ORBE_360_FALLBACK_RESPONSE;
    }

    // ===== AGE GUARD SAFETY NET (handoff path) =====
    if (overAgePet && aiContent && mentionsPetPlan(aiContent)) {
      console.warn('[Nina][AgeGuard][SafetyNet] pet>10 + plano pet citado (handoff) — substituindo por resposta segura.');
      aiContent = OVER_AGE_FALLBACK_RESPONSE;
    }
    
    // Queue AI response with additional delay after handoff
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);

    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin + 2000; // Extra 2s after handoff

    await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay);
  } else {
    // Normal flow - no handoff
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: 'system', content: processedPrompt },
          ...conversationHistory
        ],
        temperature: aiSettings.temperature,
        max_tokens: 2500,
        ...(aiSettings.reasoning && { reasoning: aiSettings.reasoning })
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Nina] AI response error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded, will retry later');
      }
      if (aiResponse.status === 402) {
        throw new Error('Payment required - please add credits');
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    aiContent = aiData.choices?.[0]?.message?.content;

    // Log AI response details for debugging
    console.log('[Nina] AI Response Debug:', JSON.stringify({
      status: aiResponse.status,
      model: aiSettings.model,
      hasChoices: !!aiData.choices,
      choicesLength: aiData.choices?.length,
      finishReason: aiData.choices?.[0]?.finish_reason,
      contentLength: aiData.choices?.[0]?.message?.content?.length || 0,
      messageContent: message.content?.substring(0, 50)
    }));

    // 🛡️ AUTO-RETRY: Se a resposta foi truncada (finish_reason=length), refaz com max_tokens maior
    if (aiContent && aiData.choices?.[0]?.finish_reason === 'length') {
      console.warn('[Nina] ⚠️ Resposta truncada (finish_reason=length, len=' + aiContent.length + '), refazendo com max_tokens=4000');
      try {
        const retryResponse = await fetch(LOVABLE_AI_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: aiSettings.model,
            messages: [{ role: 'system', content: processedPrompt }, ...conversationHistory],
            temperature: aiSettings.temperature,
            max_tokens: 4000,
            ...(aiSettings.reasoning && { reasoning: aiSettings.reasoning })
          })
        });
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryContent = retryData.choices?.[0]?.message?.content;
          if (retryContent && retryData.choices[0].finish_reason !== 'length') {
            aiContent = retryContent;
            console.log('[Nina] ✅ Retry bem-sucedido, conteúdo completo recuperado (len=' + retryContent.length + ')');
          } else if (retryContent && retryContent.length > aiContent.length) {
            // Mesmo truncado, se for maior, usa
            aiContent = retryContent;
            console.warn('[Nina] ⚠️ Retry ainda truncado, mas mais completo (len=' + retryContent.length + ')');
          }
        } else {
          console.error('[Nina] Retry falhou com status:', retryResponse.status);
        }
      } catch (retryErr) {
        console.error('[Nina] Erro no auto-retry:', retryErr);
      }
    }

    // Fallback to alternative model if primary returns empty response
    if (!aiContent) {
      console.warn('[Nina] ⚠️ Empty response from primary model, retrying with gemini-2.5-flash...');
      console.warn('[Nina] Original model was:', aiSettings.model);
      
      const fallbackResponse = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: processedPrompt },
            ...conversationHistory
          ],
          temperature: 0.8,
          max_tokens: 2500
        })
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        aiContent = fallbackData.choices?.[0]?.message?.content;
        console.log('[Nina] Fallback model (gemini-2.5-flash) response:', aiContent ? 'success' : 'also empty');
      } else {
        console.error('[Nina] Fallback model (gemini-2.5-flash) also failed:', fallbackResponse.status);
      }
    }

    // 🆕 Second fallback: Try GPT-5-mini if Gemini also failed
    if (!aiContent) {
      console.warn('[Nina] ⚠️ Gemini fallback also empty, trying gpt-5-mini as last resort...');
      
      try {
        const gptFallbackResponse = await fetch(LOVABLE_AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'openai/gpt-5-mini',
            messages: [
              { role: 'system', content: processedPrompt },
              ...conversationHistory
            ],
            max_completion_tokens: 1000
          })
        });

        if (gptFallbackResponse.ok) {
          const gptData = await gptFallbackResponse.json();
          aiContent = gptData.choices?.[0]?.message?.content;
          console.log('[Nina] GPT-5-mini fallback response:', aiContent ? 'success' : 'also empty');
        } else {
          console.error('[Nina] GPT-5-mini fallback also failed:', gptFallbackResponse.status);
        }
      } catch (gptError) {
        console.error('[Nina] GPT-5-mini fallback error:', gptError);
      }
    }
    
    // 🆕 Enhanced fallback message with transfer option
    if (!aiContent) {
      console.error('[Nina] ❌ All 3 models returned empty response, using enhanced fallback message');
      console.error('[Nina] Message that caused empty response:', JSON.stringify({
        content: message.content?.substring(0, 100),
        from: message.from_type,
        conversationId: conversation.id
      }));
      
      // Log to queue for traceability
      await supabase
        .from('nina_processing_queue')
        .update({ 
          error_message: 'All AI models (primary + gemini + gpt-5-mini) returned empty response - fallback used'
        })
        .eq('id', item.id);
      
      aiContent = 'Tive uma pequena dificuldade técnica para processar sua mensagem. Posso te transferir para um atendente humano se preferir. Deseja continuar conversando comigo ou falar com alguém da equipe?';
    }

    // ===== SANITIZE AI RESPONSE: Remove prompt leaks and internal markers =====
    aiContent = sanitizeAiResponse(aiContent);

    // ===== ORBE 360 SAFETY NET (normal flow) =====
    // Sanitizer já anexa o link quando produto/benefícios são citados.
    // Este net cobre o caso em que a intenção do usuário foi detectada mas a IA
    // não citou nem o produto nem os benefícios — força resposta determinística.
    if (orbe360Intent && aiContent && !aiContent.toLowerCase().includes('orbepet.com.br/orbe-360')) {
      console.warn('[Nina][Orbe360][SafetyNet] intent_detected_no_mention — aplicando fallback determinístico Orbe 360.');
      aiContent = ORBE_360_FALLBACK_RESPONSE;
    }

    // ===== AGE GUARD SAFETY NET (normal flow) =====
    // Bloqueia recomendação de plano pet quando idade do pet > 10 anos.
    if (overAgePet && aiContent && mentionsPetPlan(aiContent)) {
      console.warn('[Nina][AgeGuard][SafetyNet] pet>10 + plano pet citado — substituindo por resposta segura.');
      aiContent = OVER_AGE_FALLBACK_RESPONSE;
    }

    console.log('[Nina] AI response received (sanitized), length:', aiContent.length);

    // Calculate response time
    const responseTime = Date.now() - new Date(message.sent_at).getTime();

    // Update original message as processed
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);

    // Add response delay if configured
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;

    // ===== AUTO-SEND PLAN VIDEO (antes do texto/áudio) =====
    try {
      const videosQueued = await queuePlanVideoIfMentioned(
        supabase, conversation, message, aiContent, delay, agent
      );
      if (videosQueued > 0) {
        console.log(`[Nina] 🎬 ${videosQueued} vídeo(s) de plano enfileirado(s) antes da resposta de texto`);
      }
    } catch (e) {
      console.error('[Nina] 🎬 Erro no auto-envio de vídeo de plano:', e);
    }

    // Check if audio response should be sent
    const incomingWasAudio = message.type === 'audio';
    const agentAudioEnabled = agent?.audio_response_enabled ?? false;
    
    // ===== DETAILED AUDIO DECISION LOGGING =====
    console.log('[Nina] 🎵 ========== AUDIO DECISION CHECK ==========');
    console.log(`[Nina] 🎵 Message type: ${message.type}`);
    console.log(`[Nina] 🎵 Incoming was audio: ${incomingWasAudio}`);
    console.log(`[Nina] 🎵 Global audio_response_enabled: ${settings?.audio_response_enabled}`);
    console.log(`[Nina] 🎵 Agent audio_response_enabled: ${agentAudioEnabled}`);
    console.log(`[Nina] 🎵 Agent name: ${agent?.name || 'nenhum'}`);
    console.log(`[Nina] 🎵 Agent ID: ${agent?.id || 'nenhum'}`);
    console.log(`[Nina] 🎵 Has ElevenLabs API key in table: ${!!settings?.elevenlabs_api_key}`);
    console.log(`[Nina] 🎵 ElevenLabs key in Vault flag: ${settings?.elevenlabs_key_in_vault}`);
    console.log(`[Nina] 🎵 Agent voice ID: ${agent?.elevenlabs_voice_id || 'usando global'}`);
    console.log(`[Nina] 🎵 Global voice ID: ${settings?.elevenlabs_voice_id || 'não configurado'}`);
    
    // Logic: respond with audio IF:
    // 1. Global audio_response_enabled is ON, OR
    // 2. Incoming was audio AND agent allows audio response
    // AND always: ElevenLabs configurado (conector/env, Vault ou tabela)
    const elevenLabsKey = await getElevenLabsKey(supabase, settings);
    const sanitizedText = sanitizeTextForAudio(aiContent);
    const tooLongForTTS = sanitizedText.length > TTS_MAX_CHARS;

    const shouldSendAudio = (
      settings?.audio_response_enabled || 
      (incomingWasAudio && agentAudioEnabled)
    ) && !!elevenLabsKey && !tooLongForTTS;

    console.log(`[Nina] 🎵 → Condition 1 (Global enabled): ${settings?.audio_response_enabled}`);
    console.log(`[Nina] 🎵 → Condition 2 (Incoming audio + Agent enabled): ${incomingWasAudio && agentAudioEnabled}`);
    console.log(`[Nina] 🎵 → Has ElevenLabs key (env/vault/table): ${!!elevenLabsKey}`);
    console.log(`[Nina] 🎵 → Texto longo demais para TTS (${sanitizedText.length}/${TTS_MAX_CHARS}): ${tooLongForTTS}`);
    console.log(`[Nina] 🎵 → FINAL DECISION - Should send audio: ${shouldSendAudio}`);
    console.log('[Nina] 🎵 ========== FIM AUDIO DECISION ==========');

    if (shouldSendAudio) {
      console.log('[Nina] 🎤 Attempting audio generation...');
      console.log(`[Nina] 🎤 Text sanitized for TTS (${sanitizedText.length} chars)`);
      
      const audioResult = await generateAudioElevenLabs(supabase, settings, sanitizedText, agent);

      
      if (audioResult) {
        console.log(`[Nina] ✅ Audio generated successfully: ${audioResult.buffer.byteLength} bytes, format: ${audioResult.format}`);
        console.log('[Nina] 🎤 Uploading audio to storage (bucket: nina-audio)...');
        
        const audioUrl = await uploadAudioToStorage(supabase, audioResult.buffer, conversation.id, audioResult.format);
        
        if (audioUrl) {
          console.log(`[Nina] ✅ Audio uploaded successfully: ${audioUrl}`);
          
          const { error: sendQueueError } = await supabase
            .from('send_queue')
            .insert({
              conversation_id: conversation.id,
              contact_id: conversation.contact_id,
              content: aiContent,
              from_type: 'nina',
              message_type: 'audio',
              media_url: audioUrl,
              priority: 1,
              scheduled_at: new Date(Date.now() + delay).toISOString(),
              metadata: {
                response_to_message_id: message.id,
                ai_model: aiSettings.model,
                audio_generated: true,
                text_content: aiContent,
                agent_id: agent?.id,
                agent_name: agent?.name
              }
            });

          if (sendQueueError) {
            console.error('[Nina] ❌ Error queuing audio response:', sendQueueError);
            throw sendQueueError;
          }

          console.log('[Nina] ✅ Audio response queued for sending via WhatsApp');
        } else {
          console.error('[Nina] ❌ Failed to upload audio to storage (bucket may not exist or upload failed), falling back to TEXT');
          await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
        }
      } else {
        console.error('[Nina] ❌ Failed to generate audio from ElevenLabs (API error or no key), falling back to TEXT');
        await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
      }
    } else {
      console.log('[Nina] 📝 Sending TEXT response (audio not enabled for this case)');
      await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
    }
  }

  // Trigger whatsapp-sender
  try {
    const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
    fetch(senderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ triggered_by: 'nina-orchestrator' })
    }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
  } catch (err) {
    console.error('[Nina] Failed to trigger whatsapp-sender:', err);
  }

  // Trigger analyze-conversation
  fetch(`${supabaseUrl}/functions/v1/analyze-conversation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      user_message: message.content,
      ai_response: aiContent,
      current_memory: clientMemory
    })
  }).catch(err => console.error('[Nina] Error triggering analyze-conversation:', err));
}

// ===== AUTO-SEND PLAN VIDEO =====
// Detecta menções a planos específicos (Órbita Plus/Total/Galáxia) tanto na MENSAGEM DO CLIENTE
// quanto na RESPOSTA da IA, e enfileira o vídeo correspondente da biblioteca ANTES do texto.
// Também envia o vídeo de COMPARATIVO quando o cliente pergunta a diferença entre planos.
// Regras:
// - Cooldown padrão: 30 minutos para o mesmo vídeo na mesma conversa
// - Cliente pode pedir reenvio explícito ("manda de novo") → bypass do cooldown
// - Vídeo é enviado primeiro (priority maior + scheduled_at mais cedo) e o texto vem depois
const VIDEO_COOLDOWN_MS = 30 * 60 * 1000; // 30min
const VIDEO_RESEND_REGEX = /manda(r)?\s+(de\s+novo|novamente|outra\s+vez|denovo)|reenvi[ao]|envia(r)?\s+(de\s+novo|novamente)/i;
const VIDEO_COMPARISON_REGEX = /(diferen[çc]a\s+entre|comparar|comparativo|qual\s+(escolher|melhor|recomenda)|entre\s+os\s+planos|qual\s+plano\s+(escolher|melhor))/i;

async function queuePlanVideoIfMentioned(
  supabase: any,
  conversation: any,
  message: any,
  aiContent: string,
  baseDelay: number,
  agent?: Agent | null
): Promise<number> {
  const userMessage: string = (message?.content || '').toString();
  if (!aiContent && !userMessage) return 0;

  // Normaliza texto para detecção (remove acentos)
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const normalizedAi = normalize(aiContent || '');
  const normalizedUser = normalize(userMessage || '');

  // Mapeamento plano -> categoria na media_library
  // Inclui padrões nominais ("órbita plus") e semânticos ("plano intermediário")
  const planMatchers: Array<{ category: string; patterns: RegExp[]; label: string }> = [
    {
      category: 'orbita_galaxia',
      label: 'Órbita Galáxia',
      patterns: [
        /\borbita\s+galaxia\b/, /\bplano\s+galaxia\b/, /\bgalaxia\b/,
        /\bplano\s+(mais\s+)?completo\b/, /\btop\s+de\s+linha\b/, /\bplano\s+premium\b/,
      ],
    },
    {
      category: 'orbita_total',
      label: 'Órbita Total',
      patterns: [
        /\borbita\s+total\b/, /\bplano\s+total\b/, /\btotal\b/,
        /\bplano\s+(mais\s+)?(barato|basico|b[aá]sico)\b/, /\bplano\s+(de\s+)?entrada\b/, /\bmais\s+em\s+conta\b/,
      ],
    },
    {
      category: 'orbita_plus',
      label: 'Órbita Plus',
      patterns: [
        /\borbita\s+plus\b/, /\bplano\s+plus\b/, /\bplus\b/,
        /\bplano\s+(intermedi[aá]rio|do\s+meio|mediano)\b/,
      ],
    },
  ];

  // Detectar onde foi encontrado (preferir user message para gatilhar mesmo com IA genérica)
  const mentioned: Array<typeof planMatchers[number] & { source: 'user_message' | 'ai_response' }> = [];
  const seenCategories = new Set<string>();

  for (const matcher of planMatchers) {
    const inUser = matcher.patterns.some((p) => p.test(normalizedUser));
    const inAi = matcher.patterns.some((p) => p.test(normalizedAi));
    if (inUser || inAi) {
      if (seenCategories.has(matcher.category)) continue;
      seenCategories.add(matcher.category);
      mentioned.push({ ...matcher, source: inUser ? 'user_message' : 'ai_response' });
    }
  }

  // 🎯 PRIORIZAÇÃO: se o user mencionou explicitamente algum plano,
  // descartar planos que apareceram APENAS na resposta da IA (geralmente
  // citações comparativas como "diferente do Galáxia, o Plus..."). Isso
  // evita enviar o vídeo errado quando a IA cita outro plano de passagem.
  const hasUserPlanMention = mentioned.some((m) => m.source === 'user_message');
  if (hasUserPlanMention) {
    const beforeCount = mentioned.length;
    const filtered = mentioned.filter((m) => m.source === 'user_message');
    if (filtered.length < beforeCount) {
      const dropped = mentioned
        .filter((m) => m.source === 'ai_response')
        .map((m) => m.label)
        .join(', ');
      console.log(`[Nina] 🎬 🎯 User pediu plano específico — descartando ${beforeCount - filtered.length} citação(ões) da IA: ${dropped}`);
    }
    mentioned.length = 0;
    mentioned.push(...filtered);
  }

  // Detectar intenção de comparativo (sempre via user message)
  const isComparison = VIDEO_COMPARISON_REGEX.test(userMessage);
  if (isComparison && !seenCategories.has('comparativo')) {
    mentioned.push({
      category: 'comparativo',
      label: 'Comparativo de Planos',
      patterns: [],
      source: 'user_message',
    } as any);
  }

  if (mentioned.length === 0) return 0;

  // Detectar pedido explícito de reenvio (bypass cooldown)
  const isResendRequest = VIDEO_RESEND_REGEX.test(userMessage);

  console.log(`[Nina] 🎬 Planos detectados: ${mentioned.map((m) => `${m.label}(${m.source})`).join(', ')}${isResendRequest ? ' [RESEND]' : ''}`);

  let queuedCount = 0;
  for (let i = 0; i < mentioned.length; i++) {
    const plan = mentioned[i];

    // Busca o vídeo mais usado (maior send_count) e ativo na categoria
    const { data: videos, error: videoErr } = await supabase
      .from('media_library')
      .select('id, name, file_url, mime_type, send_count, last_sent_at')
      .eq('category', plan.category)
      .eq('is_active', true)
      .eq('media_type', 'video')
      .order('send_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    if (videoErr || !videos || videos.length === 0) {
      console.log(`[Nina] 🎬 Sem vídeo cadastrado para ${plan.label} (categoria ${plan.category})`);
      continue;
    }

    const video = videos[0];

    // Anti-spam: cooldown padrão 30min — bypass se cliente pediu reenvio explícito
    // Nota: usa media_url pois a tabela messages não tem coluna media_id
    if (!isResendRequest) {
      const cooldownAgo = new Date(Date.now() - VIDEO_COOLDOWN_MS).toISOString();
      const { data: recentSends } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('media_url', video.file_url)
        .gte('sent_at', cooldownAgo)
        .limit(1);

      if (recentSends && recentSends.length > 0) {
        console.log(`[Nina] 🎬 Vídeo "${video.name}" já enviado nos últimos 30min, pulando (sem pedido de reenvio)`);
        continue;
      }
    } else {
      console.log(`[Nina] 🎬 ↻ Cliente pediu reenvio — cooldown ignorado para "${video.name}"`);
    }

    // Verifica se já está na fila pendente
    const { data: pendingSends } = await supabase
      .from('send_queue')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('media_url', video.file_url)
      .in('status', ['pending', 'processing'])
      .limit(1);

    if (pendingSends && pendingSends.length > 0) {
      console.log(`[Nina] 🎬 Vídeo "${video.name}" já está na fila, pulando`);
      continue;
    }

    // Envia o vídeo ANTES do texto: usa priority maior e scheduled_at anterior
    // Cada vídeo subsequente espaçado em 1.5s
    const videoDelay = Math.max(0, baseDelay - 2000) + i * 1500;
    const triggerSource = (plan as any).source === 'user_message' && plan.category === 'comparativo'
      ? 'comparison_intent'
      : (plan as any).source || 'ai_response';

    const { error: insertErr } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        content: '',
        from_type: 'nina',
        message_type: 'video',
        media_url: video.file_url,
        priority: 2,
        scheduled_at: new Date(Date.now() + videoDelay).toISOString(),
        metadata: {
          response_to_message_id: message.id,
          source: 'auto_plan_video',
          plan_label: plan.label,
          plan_category: plan.category,
          video_name: video.name,
          media_id: video.id,
          agent_id: agent?.id,
          agent_name: agent?.name,
          video_trigger_source: triggerSource,
          video_category_matched: plan.category,
          video_resend_bypass: isResendRequest,
        },
      });

    if (insertErr) {
      console.error(`[Nina] 🎬 Erro ao enfileirar vídeo "${video.name}":`, insertErr);
      continue;
    }

    queuedCount++;
    console.log(`[Nina] 🎬 ✅ Vídeo "${video.name}" (${plan.label}) enfileirado [origem=${triggerSource}]`);
  }

  return queuedCount;
}

// ============================================================================
// ANTI-LOOP: Detecção de respostas repetidas/equivalentes
// ============================================================================
const ANTI_LOOP_THRESHOLD = 0.85;
const ANTI_LOOP_HISTORY_SIZE = 5;
const ANTI_LOOP_HANDOFF_AT = 3;

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(vc|voce)\b/g, 'você')
    .replace(/\b(tb|tbm)\b/g, 'também')
    .replace(/\b(pra)\b/g, 'para')
    .replace(/\b(td)\b/g, 'tudo')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function trigramSimilarity(a: string, b: string): number {
  const trigrams = (s: string) => {
    const set = new Set<string>();
    const padded = ` ${s} `;
    for (let i = 0; i <= padded.length - 3; i++) set.add(padded.substring(i, i + 3));
    return set;
  };
  const tA = trigrams(a), tB = trigrams(b);
  if (tA.size === 0 || tB.size === 0) return 0;
  const intersection = [...tA].filter(t => tB.has(t)).length;
  return intersection / Math.max(tA.size, tB.size);
}

function antiLoopSimilarityScore(candidate: string, existing: string): number {
  const a = normalizeForComparison(candidate);
  const b = normalizeForComparison(existing);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const jac = jaccardSimilarity(a, b);
  const tri = trigramSimilarity(a, b);
  const lexical = Math.max(jac, tri);
  const prefixLen = Math.min(40, a.length, b.length);
  const prefixSim = (prefixLen >= 20 && a.substring(0, prefixLen) === b.substring(0, prefixLen)) ? 1 : 0;
  return Math.min(1, lexical * 0.7 + prefixSim * 0.3);
}

function findHighestSimilarity(
  candidate: string,
  history: Array<{ content: string }>
): { maxScore: number; mostSimilar: string | null } {
  let maxScore = 0;
  let mostSimilar: string | null = null;
  for (const h of history) {
    if (!h?.content) continue;
    const score = antiLoopSimilarityScore(candidate, h.content);
    if (score > maxScore) {
      maxScore = score;
      mostSimilar = h.content;
    }
  }
  return { maxScore, mostSimilar };
}

function getAntiLoopFallback(contactName: string | null | undefined, agentName?: string | null): string {
  const name = (contactName || '').split(' ')[0] || '';
  const nameSuffix = name ? `, ${name}` : '';
  const options = [
    `Quer que eu te explique de outro jeito${nameSuffix}? Posso focar no que mais te interessa.`,
    `Me conta${nameSuffix}: qual parte ainda ficou em dúvida pra eu te ajudar melhor?`,
    `Posso te enviar mais detalhes ou prefere que a gente avance pro próximo passo${nameSuffix}?`,
    `Se preferir${nameSuffix}, posso te chamar pra uma conversa rápida — fica mais fácil tirar dúvidas.`,
    `Tem alguma informação específica que eu posso te enviar agora${nameSuffix}?`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

async function regenerateWithAntiLoop(
  supabase: any,
  conversation: any,
  aiSettings: any,
  blockedContent: string,
  similarMessage: string,
  recentHistory: Array<{ content: string; from_type: string }>,
  contactName: string | null | undefined
): Promise<string | null> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) return null;

  const lastSimilarTrunc = similarMessage.length > 200 ? similarMessage.substring(0, 200) + '...' : similarMessage;
  const blockedTrunc = blockedContent.length > 200 ? blockedContent.substring(0, 200) + '...' : blockedContent;

  // Build minimal history (last 6 messages) so the model has context
  const miniHistory = recentHistory.slice(0, 6).reverse().map((m: any) => ({
    role: m.from_type === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  const antiLoopSystem = `Você é um assistente de vendas brasileiro. Sua última resposta foi BLOQUEADA por estar muito parecida com algo que você já disse.

❌ MENSAGEM BLOQUEADA (não repita): "${blockedTrunc}"
❌ MENSAGEM ANTERIOR PARECIDA: "${lastSimilarTrunc}"

⛔ REGRAS OBRIGATÓRIAS:
1. NÃO repita a estrutura, palavras-chave ou pergunta da mensagem bloqueada.
2. Se você já fez essa pergunta, AVANCE: ofereça o próximo passo (link, plano, agendamento, fechamento).
3. Mude o ângulo: se perguntou, agora afirme. Se ofereceu A, ofereça B.
4. Seja curto (1-2 frases), natural e em português brasileiro.
5. Não comece com "Olá" nem repita o nome do cliente se já o fez.
${contactName ? `6. Nome do cliente: ${contactName.split(' ')[0]} (use só se fizer sentido).` : ''}

Responda APENAS com a nova mensagem, sem explicações nem aspas.`;

  try {
    const resp = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiSettings?.model || 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: antiLoopSystem },
          ...miniHistory
        ],
        temperature: 0.95,
        max_tokens: 600
      })
    });

    if (!resp.ok) {
      console.warn('[Nina][AntiLoop] Regeneração falhou:', resp.status);
      return null;
    }
    const data = await resp.json();
    let regenerated = data.choices?.[0]?.message?.content?.trim();
    if (!regenerated) return null;
    regenerated = regenerated.replace(/^["']|["']$/g, '').trim();
    regenerated = sanitizeAiResponse(regenerated);
    return regenerated || null;
  } catch (e) {
    console.warn('[Nina][AntiLoop] Erro na regeneração:', e);
    return null;
  }
}

async function bumpConsecutiveLoops(supabase: any, conversationId: string, increment: boolean) {
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('nina_context')
      .eq('id', conversationId)
      .maybeSingle();
    const ctx = (conv?.nina_context || {}) as any;
    const current = Number(ctx.consecutive_loops || 0);
    const next = increment ? current + 1 : 0;
    const updated: any = { ...ctx, consecutive_loops: next };
    if (next >= ANTI_LOOP_HANDOFF_AT) {
      updated.requires_human_handoff = true;
      updated.handoff_reason = 'anti_loop_threshold_reached';
    }
    await supabase
      .from('conversations')
      .update({ nina_context: updated })
      .eq('id', conversationId);
  } catch (e) {
    console.warn('[Nina][AntiLoop] Falha ao atualizar consecutive_loops:', e);
  }
}
// ============================================================================

// Helper function to queue text response with chunking and anti-loop check
async function queueTextResponse(
  supabase: any,
  conversation: any,
  message: any,
  aiContent: string,
  settings: any,
  aiSettings: any,
  delay: number,
  agent?: Agent | null
) {
  const userMessage: string = (message?.content || '').toString();

  // ===== ANTI-LOOP: comparar candidata com últimas mensagens enviadas =====
  // Pega últimas N mensagens enviadas pela Orbi/humano (independente do tempo)
  const { data: recentSentMessages } = await supabase
    .from('messages')
    .select('content, from_type, sent_at')
    .eq('conversation_id', conversation.id)
    .in('from_type', ['nina', 'human'])
    .order('sent_at', { ascending: false })
    .limit(ANTI_LOOP_HISTORY_SIZE);

  // Também busca histórico completo para regeneração contextual
  const { data: recentAllMessages } = await supabase
    .from('messages')
    .select('content, from_type, sent_at')
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: false })
    .limit(8);

  let { maxScore, mostSimilar } = findHighestSimilarity(aiContent, recentSentMessages || []);
  let antiLoopRegenerated = false;
  let antiLoopFallbackUsed = false;
  let finalContent = aiContent;

  if (maxScore >= ANTI_LOOP_THRESHOLD && mostSimilar) {
    console.warn(`[Nina][AntiLoop] 🔁 Bloqueado score=${maxScore.toFixed(2)} | candidata="${aiContent.substring(0, 80)}..." | similar="${mostSimilar.substring(0, 80)}..."`);

    // Buscar contato para personalizar fallback/regeneração
    const { data: contactRow } = await supabase
      .from('contacts')
      .select('name')
      .eq('id', conversation.contact_id)
      .maybeSingle();
    const contactName: string | null = contactRow?.name || null;

    // Tentar regenerar uma vez
    const regenerated = await regenerateWithAntiLoop(
      supabase,
      conversation,
      aiSettings,
      aiContent,
      mostSimilar,
      recentAllMessages || [],
      contactName
    );

    if (regenerated) {
      const recheck = findHighestSimilarity(regenerated, recentSentMessages || []);
      if (recheck.maxScore < ANTI_LOOP_THRESHOLD) {
        console.log(`[Nina][AntiLoop] ✅ Regenerado com sucesso (score=${recheck.maxScore.toFixed(2)})`);
        finalContent = regenerated;
        antiLoopRegenerated = true;
        maxScore = recheck.maxScore;
        await bumpConsecutiveLoops(supabase, conversation.id, false);
      } else {
        console.warn(`[Nina][AntiLoop] ⚠️ Regeneração ainda em loop (score=${recheck.maxScore.toFixed(2)}), usando fallback`);
        finalContent = getAntiLoopFallback(contactName, agent?.name);
        antiLoopFallbackUsed = true;
        await bumpConsecutiveLoops(supabase, conversation.id, true);
      }
    } else {
      console.warn('[Nina][AntiLoop] 🆘 Regeneração indisponível, usando fallback');
      finalContent = getAntiLoopFallback(contactName, agent?.name);
      antiLoopFallbackUsed = true;
      await bumpConsecutiveLoops(supabase, conversation.id, true);
    }
  } else {
    // Sem loop: zera contador
    await bumpConsecutiveLoops(supabase, conversation.id, false);
  }

  const normalizedFinalContent = finalContent.toLowerCase().trim();

  // Checa fila pendente (mesmo response_to_message_id ou conteúdo idêntico)
  const { data: pendingMessages } = await supabase
    .from('send_queue')
    .select('content, metadata')
    .eq('conversation_id', conversation.id)
    .in('status', ['pending', 'processing'])
    .limit(10);

  const isPendingDuplicate = pendingMessages?.some((m: any) => {
    if (!m.content) return false;
    if (m.content.toLowerCase().trim() === normalizedFinalContent) return true;
    if (m.metadata?.response_to_message_id === message.id) return true;
    return false;
  });

  if (isPendingDuplicate) {
    console.log('[Nina][AntiLoop] ⚠️ Já há mensagem equivalente na fila (conteúdo/message_id), não duplicando');
    return;
  }
  // ===== FIM ANTI-LOOP =====

  // Substitui aiContent pelo conteúdo final (regenerado/fallback se aplicável)
  aiContent = finalContent;

  // Garante o link do site de contratação quando o lead demonstra intenção de fechar
  aiContent = enforceContractSiteLink(aiContent, userMessage);

  const messageChunks = settings?.message_breaking_enabled 
    ? breakMessageIntoChunks(aiContent)
    : [aiContent];

  console.log(`[Nina] Sending ${messageChunks.length} text message chunk(s)`);

  for (let i = 0; i < messageChunks.length; i++) {
    const chunkDelay = delay + (i * 1500);
    
    const { error: sendQueueError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        content: messageChunks[i],
        from_type: 'nina',
        message_type: 'text',
        priority: 1,
        scheduled_at: new Date(Date.now() + chunkDelay).toISOString(),
        metadata: {
          response_to_message_id: message.id,
          ai_model: aiSettings.model,
          chunk_index: i,
          total_chunks: messageChunks.length,
          agent_id: agent?.id,
          agent_name: agent?.name,
          anti_loop_score: Number(maxScore.toFixed(3)),
          anti_loop_regenerated: antiLoopRegenerated,
          anti_loop_fallback_used: antiLoopFallbackUsed
        }
      });

    if (sendQueueError) {
      console.error('[Nina] Error queuing response chunk:', sendQueueError);
      throw sendQueueError;
    }
  }

  console.log('[Nina] Text response(s) queued for sending');
}

function getDefaultSystemPrompt(): string {
  return `Você é Iris, assistente virtual da Jacometo Corretora de Seguros, especialista em seguros obrigatórios de transporte rodoviário de carga (RCTR-C, RC-DC e RC-V) para pequenos transportadores (MEI, ME e EPP). Seu papel é:

1. ATENDIMENTO: Responder de forma profissional, direta e sem burocracia (estilo WhatsApp)
2. TIRAR DÚVIDAS: Esclarecer coberturas, preços, averbação, carências, regularização ANTT e como funciona atuar como SUBCONTRATADO de transportadoras maiores
3. QUALIFICAÇÃO: Entender o transportador (CNPJ, RNTRC, porte, veículo, tipo de carga, rota)
4. DIRECIONAR PARA CONTRATAÇÃO: A contratação é feita SOMENTE pelo site oficial. Após esclarecer as dúvidas, envie o link para o transportador preencher a proposta: https://rctr-c.rc-dc.rc-v.jacometo.com.br
5. REGULARIZAÇÃO: Conduzir o transportador a ficar regular na ANTT (indicar a apólice no RNTRC)

REGRAS:
- Use linguagem natural e amigável (estilo WhatsApp)
- Seja conciso (mensagens de até 3 parágrafos)
- Faça perguntas para entender melhor o transportador
- Nunca invente informações sobre preços, coberturas ou percentuais
- Você NÃO fecha contrato, NÃO gera boleto e NÃO coleta pagamento pelo chat — a contratação é exclusivamente pelo site https://rctr-c.rc-dc.rc-v.jacometo.com.br
- Se não souber algo, ofereça transferir para um atendente humano

INFORMAÇÕES DA EMPRESA:
- Jacometo Corretora de Seguros — seguros obrigatórios do transportador (apólices emitidas por seguradora parceira registrada na SUSEP)
- Atende MEI, ME e EPP registrados como ETC na ANTT (inclui quem atua como subcontratado)
- Contratação exclusiva pelo site: https://rctr-c.rc-dc.rc-v.jacometo.com.br
- Para casos urgentes, um humano pode assumir a conversa`;
}


function processPromptTemplate(prompt: string, contact: any): string {
  const now = new Date();
  const brOptions: Intl.DateTimeFormatOptions = { timeZone: 'America/Sao_Paulo' };
  
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', { 
    ...brOptions, 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', { 
    ...brOptions, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false
  });
  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { 
    ...brOptions, 
    weekday: 'long' 
  });
  
  const variables: Record<string, string> = {
    'data_hora': `${dateFormatter.format(now)} ${timeFormatter.format(now)}`,
    'data': dateFormatter.format(now),
    'hora': timeFormatter.format(now),
    'dia_semana': weekdayFormatter.format(now),
    'cliente_nome': contact?.name || contact?.call_name || 'Cliente',
    'cliente_telefone': contact?.phone_number || '',
  };
  
  return prompt.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

function buildEnhancedPrompt(
  basePrompt: string, 
  contact: any, 
  memory: any,
  agent?: Agent | null,
  ninaContext?: any,
  recentUserMessages?: string[],
  recentAgentMessages?: string[],
  recentCallLogs?: any[],
  installmentsData?: InstallmentsData | null,
  collectionContext?: CollectionTemplateContext | null,
  productKnowledge?: string
): string {
  let contextInfo = '';

  // Add agent info
  if (agent) {
    contextInfo += `\n\nAGENTE: ${agent.name}`;
    if (agent.specialty) contextInfo += ` (${agent.specialty})`;
  }

  // ===== INFORMAÇÕES OFICIAIS DA EMPRESA =====
  contextInfo += `\n\n## INFORMAÇÕES OFICIAIS DA EMPRESA:
- **Empresa:** Jacometo Corretora de Seguros
- **Segmento:** Seguros obrigatórios de transporte rodoviário de carga
- **Seguradora emissora:** seguradora parceira registrada na SUSEP
- **Corretor responsável:** Adriano Jacometo
- **Atendimento:** humano, em Londrina/PR · +25 anos de experiência

⚠️ NUNCA invente endereços, telefones ou informações da empresa.`;

  // ===== CONHECIMENTO ESPECIALIZADO - SEGUROS DE CARGA =====
  contextInfo += `\n\n## CONHECIMENTO ESPECIALIZADO - SEGUROS OBRIGATÓRIOS DO TRANSPORTADOR

### REGRAS GERAIS:
- A Jacometo é a corretora especialista que regulariza pequenos transportadores (MEI, ME e EPP) na ANTT.
- O produto oficial é o pacote com as 3 apólices obrigatórias — RCTR-C, RC-DC e RC-V — na modalidade de COMPROVAÇÃO do seguro obrigatório do transportador SUBCONTRATADO (agregado), por R$ 911,66/ano (prêmio básico anual, pago via Pix).
- Esta modalidade comprova o seguro obrigatório perante a ANTT. A carga é averbada na apólice da TRANSPORTADORA CONTRATANTE, que responde pela cobertura do embarque. Embarques como CONTRATADO DIRETO não estão cobertos por esta apólice.
- Produto EXCLUSIVO para PJ (MEI, ME ou EPP) com RNTRC ativo como ETC. Pessoa física / autônomo (TAC) não é elegível.
- Os detalhes completos estão na base de conhecimento e no catálogo de seguros (injetados abaixo). É a FONTE ÚNICA DE VERDADE.
- Sempre consulte essas fontes antes de responder sobre coberturas, preço e prazos.
- NUNCA invente coberturas, percentuais, descontos ou produtos que não estejam documentados. NÃO existe averbação por embarque nesta modalidade.
- Base legal: Lei 14.599/2023 (obrigatório desde 09/01/2026); base histórica no Art. 13 da Lei 11.442/2007.

### ORIENTAÇÕES DE ATENDIMENTO:
- Qualifique o transportador: CNPJ, RNTRC ativo, porte (MEI/ME/EPP) e se atua como subcontratado (agregado).
- Explique de forma simples e direta o pacote das 3 apólices e o preço: R$ 911,66/ano (pagamento anual à vista via Pix), sem averbação por embarque.
- Deixe SEMPRE explícito o limite: a apólice cobre a atuação como subcontratado; frete fechado direto com o dono da carga exige o seguro convencional com averbação.
- Reforce o benefício: ficar regular na ANTT (indicar o número da apólice no RNTRC). A fiscalização é eletrônica — a ANTT cruza as apólices informadas pelas seguradoras com o RNTRC.
- Passo a passo: preencher online com CNPJ → aceitar a proposta e pagar → emissão em até 2 horas → indicar o número da apólice no RNTRC.
- Apenas uma apólice ativa por registro RNTRC; quem já tem seguro vigente fala com a Central antes para trocar na virada. RNTRC vencido/suspenso: a proposta é registrada, mas a emissão depende de regularizar o registro.
- Se o transportador atua como CONTRATADO (responsável pela carga), oriente a falar com a Jacometo ANTES do embarque para migrar ao seguro convencional (averbação, faturamento mensal, gerenciamento de risco).
- Central de Atendimento Jacometo: (43) 3321-5007 · WhatsApp (43) 99156-2099.
- Após esclarecer as dúvidas, conduza o lead a preencher a proposta no site oficial: https://rctr-c.rc-dc.rc-v.jacometo.com.br (a contratação é feita exclusivamente por lá).
- Em caso de dúvida sobre cobertura específica, oriente a consultar as Condições Gerais da seguradora parceira (SUSEP).
 - Se o contato NÃO for transportador de carga OU buscar outro tipo de seguro, NUNCA dispense e NUNCA mande procurar outra corretora. Siga o protocolo "OUTROS SEGUROS" abaixo: a Jacometo trabalha com TODOS os tipos de seguro.`;

  // ===== OUTROS SEGUROS (FORA DO PACOTE DE CARGA) =====
  contextInfo += `\n\n## 🟩 OUTROS SEGUROS (FORA DO PACOTE DE CARGA) — NUNCA DISPENSE
A Jacometo Corretora trabalha com TODOS os tipos de seguro (auto, vida, empresarial, transporte de passageiros/van, residencial, saúde, patrimonial, etc.). Se o lead buscar QUALQUER seguro diferente do pacote obrigatório de carga:

🚫 PROIBIDO:
- NUNCA diga que "não se aplica ao seu caso" ou que o serviço é "exclusivo para carga".
- NUNCA mande procurar "outra corretora especializada". Isso é REGRA DE OURO: jamais dispense o lead.

✅ O QUE FAZER (acolher e coletar, UMA pergunta por vez, tom curto e humano):
1. Entenda QUAL seguro a pessoa precisa / o que quer proteger (ex.: van de passageiros, carro, vida, empresa).
2. Confirme os dados de contato: nome e melhor telefone/e-mail.
3. Descubra se é Pessoa Física ou Pessoa Jurídica — se for PJ, peça o CNPJ.
4. Com os dados em mãos, informe que vai REPASSAR AO RESPONSÁVEL da Jacometo, que fará o atendimento especializado.
   Ex.: "Perfeito! Já vou repassar seus dados ao nosso responsável, que fala com você em breve pra montar seu seguro."
- Depois de coletar e avisar que vai repassar, acione o handoff para atendimento humano.`;

  // ===== ABERTURA = PERGUNTA DE TRIAGEM (TODOS OS LEADS NOVOS) =====
  // Na PRIMEIRA mensagem de qualquer lead, a Iris faz APENAS a pergunta de
  // triagem (contratado × subcontratado), sem pitch de produto. Só depois da
  // resposta é que apresenta o caminho certo.
  const isFirstContact = !recentAgentMessages || recentAgentMessages.length === 0;
  const tipoJaConhecido = (ninaContext?.qualification_answers?.tipo_transportador || '').toLowerCase();
  const leadName = contact?.call_name || contact?.name || '';

  if (isFirstContact && !tipoJaConhecido) {
    contextInfo += `\n\n## 🟢 ABERTURA — PERGUNTA DE TRIAGEM (PRIMEIRA MENSAGEM)
Esta é a PRIMEIRA mensagem da conversa. Nesta abertura, faça APENAS a pergunta de triagem para descobrir o tipo de transportador. NÃO apresente produto, preço, coberturas nem o modelo do subcontratado ainda — só depois da resposta você segue o caminho certo.

⚠️ Como usar o modelo:
- ADAPTE a redação com suas palavras (tom curto, humano, estilo WhatsApp). Não precisa copiar literalmente.
- Faça SÓ UMA pergunta: contratado × subcontratado. Nada de explicar a apólice nesta mensagem.
- Preserve os destaques em *negrito* (asteriscos do WhatsApp) nos pontos-chave.
${leadName ? `- PERSONALIZE cumprimentando pelo nome: "Olá, ${leadName}!".` : `- Se souber o nome do lead depois, personalize o cumprimento.`}
- ⚠️ EXCEÇÃO: se o lead já deixar claro que busca OUTRO seguro (ex.: van/passageiros, auto, vida, empresa), NÃO faça a triagem de carga — siga o protocolo "OUTROS SEGUROS" (acolher, coletar necessidade + contato + PF/PJ com CNPJ, e repassar ao responsável). Jamais dispense.

MODELO (base para adaptar):
"""
Olá${leadName ? `, ${leadName}` : ''}! Aqui é da *Jacometo Corretora*, especialista em seguro de transporte

Pra eu te direcionar certo: você atua como *contratado* (responsável pela carga, emite o próprio CT-e como principal) ou como *subcontratado/agregado* de outra transportadora?
"""`;
  }

  // ===== PÓS-TRIAGEM: APÓLICE DO SUBCONTRATADO (só depois de identificado) =====
  const isSubcontratadoLead = tipoJaConhecido.includes('subcontrat') || tipoJaConhecido.includes('agregad');
  if (isSubcontratadoLead) {
    contextInfo += `\n\n## 🟢 APRESENTAÇÃO DA APÓLICE — TRANSPORTADOR SUBCONTRATADO (AGREGADO)
O lead se identificou como SUBCONTRATADO (agregado). Se você ainda não apresentou a apólice de compliance nesta conversa, apresente agora com base no MODELO abaixo e depois siga a qualificação (CNPJ → e-mail → confirmar celular → link).

⚠️ Como usar o modelo:
- ADAPTE a redação com suas palavras (tom curto, humano, estilo WhatsApp).
- MANTENHA obrigatoriamente os avisos essenciais: a carga é averbada na apólice da transportadora contratante e embarques como contratado direto NÃO estão cobertos por esta apólice.
- Preserve os destaques em *negrito*.
- NÃO repita a apresentação se já a fez antes nesta conversa — nesse caso, apenas continue a qualificação.

MODELO (base para adaptar):
"""
É a nossa *solução de compliance* para o transportador *subcontratado (agregado)* — RCTR-C, RC-DC e RC-V em *uma única apólice* da seguradora parceira (SUSEP) por *R$ 911,66/ano* (Pix).

*O que ela resolve:*
- Comprova que você tem o *seguro obrigatório* exigido para operar com o RNTRC (ANTT)
- Mantém você *regular perante a fiscalização eletrônica*, evitando multas e suspensão do registro
- *Sem averbação por viagem* — a carga é averbada na apólice da *transportadora contratante*
- *Emissão em até 2 horas* após o aceite e o pagamento

*A contratação é 100% online*, sem fila, direto no site oficial: https://rctr-c.rc-dc.rc-v.jacometo.com.br

*Importante:* ela vale para a sua atuação como *subcontratado*. Se você fechar frete *direto com o dono da carga*, esse embarque *não é coberto* por esta apólice — nesse caso o certo é o seguro convencional, com averbação.
"""`;
  }

  // ===== PÓS-TRIAGEM: COLETA DE DADOS DO CONTRATADO (só depois de identificado) =====
  const isContratadoLead = tipoJaConhecido.includes('contratad') && !isSubcontratadoLead;
  if (isContratadoLead && !ninaContext?.contratado_handoff_done) {
    const jaTemCnpj = !!contact?.cnpj;
    const jaTemEmail = !!contact?.email;
    contextInfo += `\n\n## 🟠 CAMINHO CONTRATADO — COLETA DE DADOS ANTES DO CORRETOR
O lead se identificou como CONTRATADO (responsável pela carga, emite o próprio CT-e). Nesse caso o produto certo é o *seguro COM cobertura efetiva/averbação*, que é montado por um *corretor especialista* — NÃO é o pacote de compliance do subcontratado.

⚠️ Sua missão AGORA é COLETAR os dados essenciais para o corretor conseguir montar a proposta. Colete UMA pergunta por vez, tom curto e humano (estilo WhatsApp), nesta ordem:
1. CNPJ da empresa ${jaTemCnpj ? '(JÁ TEMOS — não pergunte de novo)' : '(ainda falta — peça agora)'}
2. Melhor e-mail para contato ${jaTemEmail ? '(JÁ TEMOS — não pergunte de novo)' : '(ainda falta — peça em seguida)'}
3. Confirmar o melhor celular/WhatsApp para o corretor falar (o número desta conversa já serve — apenas CONFIRME, ex.: "Esse mesmo número é o melhor pra falarmos?").

REGRAS:
- NÃO prometa preço, coberturas nem percentuais — isso é papel do corretor especialista.
- NÃO apresente o pacote de compliance/subcontratado (não se aplica a ele).
- Respeite os dados JÁ consultados (CNPJ/RNTRC): nunca pergunte de novo o que já foi buscado automaticamente.
- Só depois de ter CNPJ + e-mail + celular confirmados, avise que vai repassar ao corretor especialista. Ex.: "Perfeito, já tenho seus dados! Vou repassar ao nosso corretor especialista pra montar a proposta com cobertura da carga."`;
  }





  if (contact) {
    contextInfo += `\n\nCONTEXTO DO CLIENTE:`;
    if (contact.name) contextInfo += `\n- Nome: ${contact.name}`;
    if (contact.call_name) contextInfo += ` (trate por: ${contact.call_name})`;
    if (contact.tags?.length) contextInfo += `\n- Tags: ${contact.tags.join(', ')}`;

    // ===== DADOS DO TRANSPORTADOR JÁ CONSULTADOS (CNPJ / RAZÃO SOCIAL / RNTRC-ANTT) =====
    // Estes dados JÁ foram consultados automaticamente (BrasilAPI + portal da ANTT).
    // O agente DEVE usar essas informações e NUNCA perguntar novamente o CNPJ ou o RNTRC.
    if (contact.cnpj || contact.company || contact.rntrc) {
      contextInfo += `\n\n## 🚚 DADOS DO TRANSPORTADOR (JÁ CONSULTADOS — NÃO PERGUNTAR NOVAMENTE):`;
      if (contact.cnpj) {
        const cnpjFmt = String(contact.cnpj).replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        contextInfo += `\n- CNPJ: ${cnpjFmt || contact.cnpj} (já consultado — NÃO peça o CNPJ de novo)`;
      }
      if (contact.company) contextInfo += `\n- Razão social/Empresa: ${contact.company}`;
      if (contact.rntrc) {
        contextInfo += `\n- RNTRC (ANTT): ${contact.rntrc} — transportador REGULAR na ANTT. Confirme e siga a qualificação.`;
      } else if (contact.cnpj) {
        contextInfo += `\n- RNTRC (ANTT): NÃO localizado para este CNPJ na ANTT. Este CNPJ pode não ter registro de ETC ativo. Pergunte com tato se ele já possui RNTRC/registro de ETC ou se precisa regularizar.`;
      }
      contextInfo += `\n⚠️ Estes dados já foram buscados automaticamente. Use-os na conversa e NUNCA volte a pedir o CNPJ ou o número do RNTRC.`;
    }

    // Cidade/Estado do lead (extraído do DDD do telefone)
    if (contact.city && contact.state) {
      contextInfo += `\n- Localização (pelo DDD): ${contact.city} - ${contact.state}`;
      contextInfo += `\n  ⚠️ CONFIRME a cidade ao invés de perguntar! Ex: "Você está em ${contact.city}?" ou use diretamente.`;
    } else if (contact.state) {
      contextInfo += `\n- Estado (pelo DDD): ${contact.state}`;
      contextInfo += `\n  ⚠️ Use esta informação e pergunte apenas a cidade.`;
    }
    
    // ===== NOTAS/RESUMO ANTERIOR DO CLIENTE (HISTÓRICO) =====
    if (contact.notes && contact.notes.trim()) {
      contextInfo += `\n\n## NOTAS/RESUMO ANTERIOR (HISTÓRICO DO CLIENTE):
${contact.notes}

⚠️ IMPORTANTE: Este cliente já entrou em contato antes. Use essas informações para dar continuidade sem repetir perguntas já respondidas.`;
    }
  }
  
  // ===== HISTÓRICO DE LIGAÇÕES COM TRANSCRIÇÕES =====
  if (recentCallLogs && recentCallLogs.length > 0) {
    contextInfo += `\n\n## RESUMO DE LIGAÇÕES ANTERIORES:`;
    for (const call of recentCallLogs) {
      const date = new Date(call.started_at).toLocaleDateString('pt-BR');
      const status = call.status === 'completed' ? 'Atendida' : call.status;
      const transcription = call.transcription 
        ? call.transcription.substring(0, 500) + (call.transcription.length > 500 ? '...' : '')
        : 'Sem transcrição disponível';
      contextInfo += `\n[${date} - ${status}]: ${transcription}`;
    }
    contextInfo += `\n\n⚠️ Use o histórico de ligações para contextualizar a conversa e não repetir perguntas.`;
  }

  // ===== DADOS FINANCEIROS - PARCELAS PENDENTES =====
  if (installmentsData && installmentsData.count > 0) {
    const formattedValue = installmentsData.totalValue.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
    
    const formattedDate = installmentsData.oldestDueDate 
      ? new Date(installmentsData.oldestDueDate).toLocaleDateString('pt-BR')
      : 'N/A';
    
    // Formatar lista de seguradoras
    const insurersList = installmentsData.insurers && installmentsData.insurers.length > 0 
      ? installmentsData.insurers.join(', ') 
      : 'Não identificada';
    
    contextInfo += `\n\n## 🚨 DADOS FINANCEIROS ATUALIZADOS (FONTE: BANCO DE DADOS EM TEMPO REAL)

### VALORES OFICIAIS - PRIORIDADE MÁXIMA:
- **QUANTIDADE DE PARCELAS EM ABERTO:** ${installmentsData.count}
- **VALOR TOTAL PENDENTE (sem juros):** ${formattedValue}
- **VENCIMENTO MAIS ANTIGO:** ${formattedDate}
- **SEGURADORA(S):** ${insurersList}

### ⛔ REGRA OBRIGATÓRIA:
1. ESTES DADOS SÃO DO BANCO DE DADOS E SÃO MAIS RECENTES QUE O HISTÓRICO DE CONVERSA
2. SE O CLIENTE PERGUNTAR QUAL SEGURADORA, RESPONDA: "${insurersList}"
3. USE OBRIGATORIAMENTE: "${installmentsData.count} parcelas" e "${formattedValue}"
4. SEMPRE inclua o nome da seguradora ao falar de valores pendentes
5. NÃO repita informações antigas do histórico que conflitem com estes dados
6. Se o cliente perguntar sobre parcelas, responda com TODOS os ${installmentsData.count} itens, não apenas um`;

    console.log(`[Nina] 💰 Installments data injected into prompt: ${installmentsData.count} parcelas, ${formattedValue}, seguradoras: ${insurersList}`);

    // Detalhamento das parcelas (máximo 10)
    if (installmentsData.installments.length <= 10) {
      contextInfo += `\n\nDetalhamento das parcelas:`;
      for (const inst of installmentsData.installments) {
        const value = parseFloat(inst.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const date = new Date(inst.due_date).toLocaleDateString('pt-BR');
        const statusLabel = inst.status === 'overdue' ? '⚠️ VENCIDA' : inst.status === 'negotiating' ? '🤝 EM NEGOCIAÇÃO' : '📅 PENDENTE';
        const daysOverdue = inst.days_overdue && inst.days_overdue > 0 ? ` (${inst.days_overdue} dias de atraso)` : '';
        const insurer = inst.policies?.insurer || 'N/A';
        const policyNum = inst.policies?.policy_number || '';
        contextInfo += `\n- Parcela ${inst.installment_number}: ${value} venc. ${date} - ${insurer}${policyNum ? ` (${policyNum})` : ''} ${statusLabel}${daysOverdue}`;
      }
    } else {
      contextInfo += `\n\n(${installmentsData.count} parcelas no total - mostrando resumo)`;
    }
  }

  // ===== CONTEXTO DO TEMPLATE DE COBRANÇA ENVIADO =====
  if (collectionContext) {
    const sentDate = new Date(collectionContext.sentAt).toLocaleString('pt-BR', { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    contextInfo += `\n\n## 📩 TEMPLATE DE COBRANÇA ENVIADO (CONTEXTO ATIVO)

### Você INICIOU esta conversa enviando uma mensagem de cobrança:
- **Template usado:** ${collectionContext.templateName}
- **Enviado em:** ${sentDate}`;

    if (collectionContext.policyNumber) {
      contextInfo += `\n- **Apólice mencionada:** ${collectionContext.policyNumber}`;
    }
    if (collectionContext.value) {
      contextInfo += `\n- **Valor informado:** ${collectionContext.value}`;
    }
    if (collectionContext.dueDate) {
      contextInfo += `\n- **Vencimento informado:** ${collectionContext.dueDate}`;
    }
    if (collectionContext.contactName) {
      contextInfo += `\n- **Nome usado no template:** ${collectionContext.contactName}`;
    }
    if (collectionContext.companyName) {
      contextInfo += `\n- **Empresa mencionada:** ${collectionContext.companyName}`;
    }
    
    if (collectionContext.messageContent) {
      // Mostrar trecho da mensagem enviada para referência
      const msgPreview = collectionContext.messageContent.length > 200 
        ? collectionContext.messageContent.substring(0, 200) + '...' 
        : collectionContext.messageContent;
      contextInfo += `\n\n**Mensagem enviada (referência):**
"${msgPreview}"`;
    }

    contextInfo += `

### ⚠️ CONTEXTO CRÍTICO PARA SUA RESPOSTA:
1. O cliente está RESPONDENDO à mensagem de cobrança que você enviou
2. Use as informações acima como referência (apólice, valor, vencimento)
3. NÃO pergunte "em que posso ajudar?" - você já sabe o motivo do contato
4. Seja direto: confirme se o cliente deseja regularizar a parcela
5. Ofereça opções: enviar 2ª via do boleto, informar dados PIX, verificar outras pendências

### Exemplos de respostas adequadas ao contexto:
- Se cliente disse "Boa tarde": "Boa tarde! ${collectionContext.contactName || 'Tudo bem'}? Vi que você recebeu a informação sobre a parcela${collectionContext.policyNumber ? ` da apólice ${collectionContext.policyNumber}` : ''}${collectionContext.value ? ` de ${collectionContext.value}` : ''}. Posso te ajudar com a regularização?"
- Se cliente fez pergunta: Responda contextualizando que é sobre a cobrança enviada
- Se cliente quer pagar: "Ótimo! Posso te enviar a 2ª via do boleto ou prefere pagar via PIX?"
- Se cliente disse que já pagou: "Deixa eu verificar aqui. Qual foi a data do pagamento?"`;

    console.log('[Nina] 📋 Collection template context injected into prompt');
  }

  // ===== QUALIFICATION ANSWERS - CRITICAL ANTI-REPETITION =====
  if (ninaContext?.qualification_answers) {
    const qa = ninaContext.qualification_answers;
    const answeredFields: string[] = [];
    
    // Map field names to readable labels
    const fieldLabels: Record<string, string> = {
      cnpj: 'CNPJ',
      rntrc: 'RNTRC (ANTT)',
      tipo_transportador: 'Tipo de transportador (contratado/subcontratado)',
      email: 'E-mail',
      celular: 'Celular (WhatsApp)'
    };

    
    for (const [key, value] of Object.entries(qa)) {
      if (value && fieldLabels[key]) {
        answeredFields.push(`- ${fieldLabels[key]}: ${value}`);
      }
    }
    
    if (answeredFields.length > 0) {
      contextInfo += `\n\n## INFORMAÇÕES JÁ COLETADAS (NÃO PERGUNTE NOVAMENTE, NÃO REPITA):\n${answeredFields.join('\n')}`;
    }
  }

  if (memory && Object.keys(memory).length > 0) {
    contextInfo += `\n\nMEMÓRIA DO CLIENTE:`;
    
    if (memory.lead_profile) {
      const lp = memory.lead_profile;
      if (lp.interests?.length) contextInfo += `\n- Interesses: ${lp.interests.join(', ')}`;
      if (lp.products_discussed?.length) contextInfo += `\n- Produtos discutidos: ${lp.products_discussed.join(', ')}`;
      if (lp.lead_stage) contextInfo += `\n- Estágio: ${lp.lead_stage}`;
    }
    
    if (memory.sales_intelligence) {
      const si = memory.sales_intelligence;
      if (si.pain_points?.length) contextInfo += `\n- Dores: ${si.pain_points.join(', ')}`;
      if (si.next_best_action) contextInfo += `\n- Próxima ação sugerida: ${si.next_best_action}`;
    }
  }

  // ===== ÚLTIMAS RESPOSTAS DO CLIENTE - REFERÊNCIA PARA VERIFICAR HISTÓRICO =====
  if (recentUserMessages && recentUserMessages.length > 0) {
    contextInfo += `\n\n## ÚLTIMAS RESPOSTAS DO CLIENTE (VERIFIQUE ANTES DE PERGUNTAR):`;
    for (const msg of recentUserMessages) {
      contextInfo += `\n- "${msg}"`;
    }
  }

  // ===== ÚLTIMAS MENSAGENS DO AGENTE (ANTI-REPETIÇÃO) =====
  if (recentAgentMessages && recentAgentMessages.length > 0) {
    contextInfo += `\n\n## ⚠️ SUAS ÚLTIMAS MENSAGENS (NÃO REPITA!):`;
    for (const msg of recentAgentMessages) {
      const truncated = msg.length > 150 ? msg.substring(0, 150) + '...' : msg;
      contextInfo += `\n- "${truncated}"`;
    }
    contextInfo += `\n\n⛔ CRÍTICO: LEIA ACIMA antes de responder! NÃO repita essas frases ou ideias similares!`;
  }

  // ===== NOMENCLATURA DAS COBERTURAS =====
  contextInfo += `\n\n## 📛 NOMES DAS COBERTURAS — USE SEMPRE O NOME CORRETO:
- "RCTR-C" (danos à carga por acidente com o veículo)
- "RC-DC" (roubo, furto e desaparecimento da carga)
- "RC-V" (danos a terceiros causados pelo veículo)
- "Pacote 3 Seguros Obrigatórios" (as três apólices juntas — R$ 911,66/ano, modalidade de comprovação do subcontratado)
⚠️ Nunca troque os nomes nem invente outras coberturas. Se o cliente perguntar sobre UMA cobertura específica, responda sobre ela sem confundir com as demais.`;


  // ===== ANTI-ECO + VERIFICAÇÃO DE HISTÓRICO =====
  contextInfo += `\n\n## REGRAS CRÍTICAS DE COMUNICAÇÃO:

### REGRA DE ESTILO — SEM EMOJIS (OBRIGATÓRIA):
- NUNCA use emojis, emoticons, figurinhas ou pictogramas em nenhuma mensagem enviada ao contato.
- Sem exceções: nem em saudações, nem em despedidas, nem para suavizar o tom.
- Transmita simpatia apenas com as palavras (padrão de comunicação da empresa).

### REGRA ANTI-ECO:
- NUNCA repita ou resuma o que o cliente acabou de dizer
- Vá DIRETO para a próxima pergunta ou ação
- NÃO use frases como "Entendi que você...", "Então você transporta...", "Certo, [resposta]..."

ERRADO: "Entendi, subcontratado. Qual seu e-mail?"
CORRETO: "Qual seu e-mail?"

### 🔴 REGRA ANTI-REPETIÇÃO DE AÇÕES (CRÍTICO!):
Antes de QUALQUER resposta, verifique suas ÚLTIMAS 3 MENSAGENS no histórico acima:

1. **Se você já ofereceu transferência/handoff:**
   - NÃO ofereça novamente!
   - Diga apenas: "Já estou te conectando!" ou "A equipe já foi avisada."

2. **Se você já disse "aguarde" ou "um momento":**
   - NÃO repita essas expressões!
   - Apenas confirme: "Em breve você será atendido!"

3. **Se você já mencionou "atendente humano" ou "especialista":**
   - Na próxima mensagem, seja MUITO mais breve
   - Exemplo: "Certo!" ou "Ok, já estão vindo!"

### DETECÇÃO DE LOOPS (LEIA!):
Se você perceber que está prestes a dizer algo que JÁ DISSE:
- PARE imediatamente
- Varie a frase COMPLETAMENTE
- Use sinônimos e estruturas diferentes

ERRADO (loop repetitivo):
"Vou te transferir para um especialista."
"Aguarde um momento enquanto transfiro."
"Vou te encaminhar para um atendente humano." ← REPETIÇÃO!

CORRETO (variado e natural):
"Certo, vou te conectar!"
"Pronto, já estou te transferindo!"
"A equipe foi notificada, já vão te atender."

### VARIAÇÕES OBRIGATÓRIAS PARA HANDOFF:
Use UMA destas variações (nunca a mesma duas vezes):
- "Já estou te conectando com um especialista!"
- "Certo, vou passar para nossa equipe."
- "Perfeito! Alguém já vai te atender."
- "Ok! Transferindo agora."
- "Pronto! A equipe já foi avisada."

### REGRA VERIFICAR HISTÓRICO (CRÍTICO):
Antes de fazer QUALQUER pergunta:
1. LEIA as "ÚLTIMAS RESPOSTAS DO CLIENTE" acima
2. VERIFIQUE as "INFORMAÇÕES JÁ COLETADAS" acima
3. Se o dado já foi informado, PULE para a próxima pergunta

### Se cliente disser "já respondi" ou "já informei":
- NUNCA peça para repetir
- Consulte o histórico e reconheça o dado que está lá
- Responda: "Vi aqui. Sobre [próxima pergunta pendente]?"
- Continue para o próximo item pendente

### Lista de verificação antes de perguntar (sequência de qualificação Mitsui):
- CNPJ - já está no contexto do cliente?
- Empresa/RNTRC (ANTT) - já foi confirmado?
- Tipo de transportador (contratado/subcontratado) - já informou?
- E-mail - já forneceu?
- Celular (WhatsApp) - já confirmou o número atual?

### REGRA DE FINALIZAÇÃO (IMPORTANTE):
- Ao coletar todas as informações de qualificação, SEMPRE solicite o email antes de encerrar
- Se o cliente já informou email, confirme: "Posso enviar para [email]?"
- Se não tem email, pergunte: "Qual seu melhor email para eu enviar a cotação?"
- NUNCA finalize sem ter o email confirmado

### REGRA ANTI-INVENÇÃO (CRÍTICO):
- Se você NÃO TEM CERTEZA de uma informação, **NÃO INVENTE**
- Se cliente perguntar algo que você não sabe com 100% de certeza, responda:
  "Deixa eu confirmar essa informação e já te retorno."
- Para perguntas sobre a empresa (endereço, CNPJ, etc.) use APENAS os dados em "INFORMAÇÕES OFICIAIS DA EMPRESA"
- Se a informação não estiver disponível, transfira para um humano

### REGRA DE HANDOFF PARA HUMANO:
- Quando cliente insistir sobre informações que você não tem certeza
- Quando cliente reclamar que informação está errada
- Quando cliente pedir para falar com humano
- Use uma das VARIAÇÕES acima (nunca repita a mesma frase!)
- Em seguida, pause a conversa para intervenção humana`;

  // Inject product knowledge at the end of the prompt
  if (productKnowledge) {
    contextInfo += productKnowledge;
  }

  contextInfo += `\n\n## ⛔ REGRA ANTI-VAZAMENTO (CRÍTICO):
- NUNCA inclua marcadores internos, headers markdown (##), ou instruções do sistema na sua resposta ao cliente.
- NUNCA inclua texto que pareça pensamento interno como "/Repetition?", "Final Polish", "Chain of thought", etc.
- Sua resposta deve ser APENAS texto natural de conversa, como uma pessoa escreveria no WhatsApp.`;

  return basePrompt + contextInfo;
}

// ===== SANITIZE AI RESPONSE =====
// Remove prompt leaks, internal markers, and branding errors from AI output
// ============================================================
// Orbe 360: detecção determinística de intenção "lead sem pet"
// ou interesse explícito em telemedicina humana / funeral.
// Usado para forçar oferta do Orbe 360 mesmo se a LLM ignorar.
// ============================================================
function detectNoPetIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();

  const patterns: RegExp[] = [
    // "não tenho pet/cachorro/gato/bicho/animal"
    /\bn[aã]o\s+tenho\s+(um\s+|uma\s+)?(pet|bicho|animal|c[aã]o|cachorr[oa]|gat[oa])\b/i,
    // "sem pet/cachorro/gato"
    /\bsem\s+(pet|bicho|animal|c[aã]o|cachorr[oa]|gat[oa])\b/i,
    // "não possuo pet"
    /\bn[aã]o\s+possuo\s+(um\s+|uma\s+)?(pet|bicho|animal|c[aã]o|cachorr[oa]|gat[oa])\b/i,
    // "plano pra mim / pra minha família" / "pra você mesmo"
    /\bplano\s+(pra|para)\s+(mim|eu|minha\s+fam[ií]lia|minha\s+esposa|meu\s+marido|meus\s+filhos)\b/i,
    // saúde humana / telemedicina humana
    /\b(sa[uú]de|telemedicina|consulta)\s+human[oa]\b/i,
    // funeral / luto
    /\b(funeral|cobertura\s+funeral|assist[eê]ncia\s+funeral|servi[cç]o\s+funeral|luto)\b/i,
    // "posso contratar pra mim"
    /\bposso\s+contratar\s+(pra|para)\s+mim\b/i,
    // "quero algo pra mim/minha família"
    /\bquero\s+(algo|um\s+plano|cobertura)\s+(pra|para)\s+(mim|minha\s+fam[ií]lia)\b/i,
  ];

  return patterns.some((rx) => rx.test(t));
}

const ORBE_360_FORCED_INSTRUCTION = `

🚨 INSTRUÇÃO OBRIGATÓRIA DETECTADA — LEAD SEM PET / INTERESSE HUMANO 🚨

O sistema detectou que o lead:
- NÃO tem pet, OU
- Está pedindo proteção para si mesmo / família, OU
- Mencionou telemedicina humana, funeral, luto ou saúde humana.

REGRAS OBRIGATÓRIAS PARA ESTA RESPOSTA (SEM EXCEÇÃO):
1. NÃO sugira adotar pet, NÃO diga que o plano é "exclusivo para cães e gatos", NÃO encerre a conversa.
2. APRESENTE o **Orbe 360** como alternativa contratável de forma ISOLADA (não exige pet).
3. Cite os 2 benefícios principais: **telemedicina humana 24h** + **cobertura funeral completa com apoio psicológico**.
4. INCLUA OBRIGATORIAMENTE o link: https://orbepet.com.br/orbe-360
5. Resposta CURTA (2–3 linhas), tom acolhedor, sem listas longas.

Exemplo de tom esperado:
"Mesmo sem pet eu tenho uma alternativa pra você. O Orbe 360 cobre telemedicina humana 24h e assistência funeral completa pra você e sua família. Confere aqui: https://orbepet.com.br/orbe-360"
`;

const ORBE_360_FALLBACK_RESPONSE = `Mesmo sem pet eu tenho uma alternativa pra você. O Orbe 360 cobre telemedicina humana 24h e assistência funeral completa pra você e sua família. Confere aqui: https://orbepet.com.br/orbe-360`;

const ORBE_360_LINK = 'https://orbepet.com.br/orbe-360';

// ============================================================
// AGE GUARD: detecta pets com mais de 10 anos (limite máx. de contratação)
// Lê últimas mensagens do tutor e client_memory.pet_idade
// ============================================================
function detectOverAgePet(text: string, clientMemory: any): { over: boolean; age: number | null } {
  let detectedAge: number | null = null;

  // 1. client_memory primeiro (fonte mais confiável)
  if (clientMemory && typeof clientMemory === 'object') {
    const raw = clientMemory.pet_idade ?? clientMemory.pet_age ?? clientMemory.idade_pet;
    if (raw) {
      const m = String(raw).match(/(\d{1,2})/);
      if (m) detectedAge = parseInt(m[1], 10);
    }
  }

  // 2. texto da mensagem do tutor
  if (detectedAge === null && text) {
    const t = text.toLowerCase();
    // padrões: "tem 11 anos", "11 aninhos", "11 anos de idade", "ele tem 12"
    const patterns: RegExp[] = [
      /\b(?:tem|ten|com|de)\s+(\d{1,2})\s*(?:anos?|aninhos?)\b/i,
      /\b(\d{1,2})\s*(?:anos?|aninhos?)\s*(?:de\s+idade)?\b/i,
    ];
    for (const rx of patterns) {
      const m = t.match(rx);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= 1 && n <= 30) { detectedAge = n; break; }
      }
    }
  }

  if (detectedAge !== null && detectedAge > 10) {
    return { over: true, age: detectedAge };
  }
  return { over: false, age: detectedAge };
}

const PET_PLAN_REGEX = /\b(?:[oó]rbita\s+(?:plus|total|gal[áa]xia)|essencial)\b/i;

function mentionsPetPlan(text: string): boolean {
  if (!text) return false;
  return PET_PLAN_REGEX.test(text);
}

const OVER_AGE_FORCED_INSTRUCTION = `

🚨 INSTRUÇÃO OBRIGATÓRIA — PET COM MAIS DE 10 ANOS DETECTADO 🚨

O sistema identificou que o pet do tutor tem MAIS de 10 anos.
REGRAS ABSOLUTAS para esta resposta:
1. NÃO recomende NENHUM plano pet (Essencial, Órbita Plus, Órbita Total, Órbita Galáxia).
2. NÃO cite preços de planos pet.
3. NÃO invente "plano sênior" ou "cobertura especial idoso" — não existe.
4. Reconheça com empatia a idade do pet.
5. Explique honestamente que o limite de contratação é até 10 anos.
6. Ofereça o Orbe 360 (telemedicina humana 24h + assistência funeral) ao tutor.
7. Inclua OBRIGATORIAMENTE o link: https://orbepet.com.br/orbe-360
8. Resposta CURTA (2–3 linhas), tom acolhedor.
`;

const OVER_AGE_FALLBACK_RESPONSE = `Entendo, ele já tem uma idade avançada. Infelizmente nossos planos pet aceitam contratação só até 10 anos completos. Mas posso te oferecer o Orbe 360, com telemedicina humana 24h e assistência funeral completa pra você e sua família. Dá uma olhada: https://orbepet.com.br/orbe-360`;



/**
 * Garante que toda resposta da IA que mencione o produto Orbe 360 ou seus
 * benefícios (telemedicina humana / funeral / apoio psicológico) inclua
 * obrigatoriamente o link orbepet.com.br/orbe-360.
 *
 * Caso A — Produto citado explicitamente sem o link: anexa o link no final.
 * Caso B — Apenas benefícios mencionados sem o nome do produto: substitui
 *          a resposta pelo fallback determinístico.
 * Caso neutro — Sem menção, retorna o conteúdo intacto.
 */
function enforceOrbe360Link(content: string): string {
  if (!content) return content;

  const lower = content.toLowerCase();
  if (lower.includes('orbepet.com.br/orbe-360')) return content;

  const mentionsProduct = /orbe[\s-]?360/i.test(content);
  const mentionsBenefits =
    /telemedicina\s+human[oa]/i.test(content) ||
    /(assist[eê]ncia|cobertura|servi[cç]o)\s+funeral/i.test(content) ||
    /apoio\s+psicol[oó]gico/i.test(content);

  if (mentionsProduct) {
    console.log('[Nina][Orbe360][Sanitizer] case=A link_appended');
    return `${content.trim()}\n\nConfere aqui: ${ORBE_360_LINK}`;
  }

  if (mentionsBenefits) {
    console.log('[Nina][Orbe360][Sanitizer] case=B fallback_replaced');
    return ORBE_360_FALLBACK_RESPONSE;
  }

  return content;
}

const CONTRACT_SITE_URL = 'https://rctr-c.rc-dc.rc-v.jacometo.com.br';

/**
 * Garante que, quando o lead demonstra intenção de contratar (pedir link, "como faço",
 * "quero contratar", "como pago" etc.), a resposta contenha o link do site oficial de
 * contratação. A contratação é feita EXCLUSIVAMENTE pelo site.
 */
function enforceContractSiteLink(content: string, userMessage: string): string {
  if (!content) return content;

  const domainRegex = /rctr-c\.rc-dc\.rc-v\.jacometo\.com\.br/i;
  if (domainRegex.test(content)) return content;

  const userLower = (userMessage || '').toLowerCase();
  const contractIntent = [
    'quero contratar', 'quero assinar', 'como contrato', 'como assino',
    'como faço', 'como faco', 'como funciona a contrata', 'fechar',
    'pagamento', 'como pago', 'link', 'proposta', 'preencher',
    'contratar', 'assinar', 'quero o seguro', 'quero fazer',
  ].some((k) => userLower.includes(k));

  if (!contractIntent) return content;

  console.log('[Nina][ContractSite] link_appended (intenção de contratação detectada)');
  return `${content.trim()}\n\nA contratação é rápida e feita direto pelo site oficial. É só preencher a proposta aqui: ${CONTRACT_SITE_URL}`;
}


function sanitizeAiResponse(content: string): string {
  if (!content) return content;
  
  let sanitized = content;
  
  // Remove lines starting with internal markers
  sanitized = sanitized.replace(/^[\/#⚠️⛔].+$/gm, '');
  
  // Remove specific known prompt leak patterns
  const leakPatterns = [
    /^.*\/Repetition\?.*$/gm,
    /^.*Final Polish.*$/gm,
    /^.*Chain of thought.*$/gm,
    /^.*REGRA:.*$/gm,
    /^.*⚠️ CRÍTICO.*$/gm,
    /^.*⛔ CRÍTICO.*$/gm,
    /^##\s+.+$/gm,
    /^###\s+.+$/gm,
    /^\*\*REGRA\*\*.*$/gm,
    /^AGENTE:.*$/gm,
    /^CONTEXTO DO CLIENTE:.*$/gm,
    /^MEMÓRIA DO CLIENTE:.*$/gm,
  ];
  
  for (const pattern of leakPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // Fix branding errors in AI output (cargo insurance brokerage)
  sanitized = sanitized.replace(/\bOrbePet\b/gi, 'Jacometo Corretora de Seguros');
  sanitized = sanitized.replace(/\bOrbi\b/g, 'Iris');
  
  // REGRA DA EMPRESA: nunca enviar emoji para contatos
  sanitized = stripEmojis(sanitized);

  // Clean up multiple blank lines
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();


  return sanitized || stripEmojis(content); // fallback to original if sanitization emptied it
}

function breakMessageIntoChunks(content: string): string[] {
  const chunks = content
    .split(/\n\n+/)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);
  
  return chunks.length > 0 ? chunks : [content];
}

function getModelSettings(
  settings: any,
  conversationHistory: any[],
  message: any,
  contact: any,
  clientMemory: any
): { model: string; temperature: number; reasoning?: { effort: string } } {
  const modelMode = settings?.ai_model_mode || 'adaptive';
  
  switch (modelMode) {
    case 'flash':
      return { model: 'google/gemini-3-flash-preview', temperature: 0.7 };
    case 'pro':
      return { model: 'google/gemini-2.5-pro', temperature: 0.7 };
    case 'pro3':
      // Modo "pro3" agora usa roteamento adaptativo h\u00edbrido (Flash r\u00e1pido + Pro para casos complexos)
      return getAdaptiveSettings(conversationHistory, message, contact, clientMemory);
    case 'adaptive':
      return getAdaptiveSettings(conversationHistory, message, contact, clientMemory);
    default:
      return getAdaptiveSettings(conversationHistory, message, contact, clientMemory);
  }
}

/**
 * Roteamento h\u00edbrido inteligente focado em VENDAS afiadas:
 * - Flash (r\u00e1pido, sem reasoning): perguntas simples, sauda\u00e7\u00f5es, primeiras intera\u00e7\u00f5es
 * - Flash + reasoning low: perguntas de pre\u00e7o/plano espec\u00edfico, qualifica\u00e7\u00e3o ativa
 * - Pro + reasoning medium: obje\u00e7\u00f5es, compara\u00e7\u00f5es, fechamento, reclama\u00e7\u00f5es
 *
 * Foco: detectar momentos cr\u00edticos da venda e investir mais racioc\u00ednio neles.
 */
function getAdaptiveSettings(
  conversationHistory: any[], 
  message: any, 
  contact: any,
  clientMemory: any
): { model: string; temperature: number; reasoning?: { effort: string } } {
  const messageCount = conversationHistory.length;
  const userContent = (message.content || '').toLowerCase();
  
  // ===== Sinais de momentos CR\u00cdTICOS de venda (merecem racioc\u00ednio profundo) =====
  
  // Obje\u00e7\u00f5es e d\u00favidas que precisam de argumenta\u00e7\u00e3o forte
  const objectionKeywords = [
    'caro', 'preco alto', 'pre\u00e7o alto', 'muito caro', 'n\u00e3o tenho', 'nao tenho',
    'pensar', 'depois', 'mais tarde', 'avaliar', 'comparar', 'concorrente',
    'petlove', 'porto seguro', 'pet love', 'outras', 'outros planos',
    'desconfio', 'duvida', 'd\u00favida', 'medo', 'receio', 'n\u00e3o sei se',
    'vale a pena', 'compensa', 'fidelidade', 'multa', 'cancelar'
  ];
  
  // Compara\u00e7\u00f5es entre planos (ancoragem requer racioc\u00ednio)
  const comparisonKeywords = [
    'diferen\u00e7a', 'diferenca', 'qual melhor', 'comparar', 'versus', ' vs ',
    'plus ou', 'plus e total', 'total ou', 'gal\u00e1xia ou', 'galaxia ou',
    'qual indica', 'qual recomenda', 'qual escolher'
  ];
  
  // Sinais de fechamento (momento de ouro - n\u00e3o errar)
  const closingKeywords = [
    'quero contratar', 'quero assinar', 'como contrato', 'como assino',
    'fechar', 'pagamento', 'cart\u00e3o', 'cartao', 'pix', 'link',
    'vou contratar', 'me manda o link', 'manda o link', 'como pago'
  ];
  
  // Reclama\u00e7\u00f5es (precisam de empatia + precis\u00e3o)
  const complaintKeywords = [
    'problema', 'erro', 'n\u00e3o funciona', 'nao funciona', 'reclama\u00e7\u00e3o',
    'reclamacao', 'p\u00e9ssimo', 'pessimo', 'horr\u00edvel', 'horrivel',
    'demorou', 'demorando', 'cad\u00ea', 'cade', 'reembolso', 'reembolsar'
  ];
  
  const hasObjection = objectionKeywords.some(k => userContent.includes(k));
  const hasComparison = comparisonKeywords.some(k => userContent.includes(k));
  const hasClosing = closingKeywords.some(k => userContent.includes(k));
  const hasComplaint = complaintKeywords.some(k => userContent.includes(k));
  
  const qualificationScore = clientMemory?.lead_profile?.qualification_score || 0;
  const leadStage = clientMemory?.lead_profile?.lead_stage || '';
  
  // ===== ROTEAMENTO =====
  
  // 1. FECHAMENTO ou OBJE\u00c7\u00c3O FORTE: Pro + reasoning medium (n\u00e3o pode errar)
  if (hasClosing || (hasObjection && qualificationScore > 30)) {
    console.log('[Nina][Adaptive] \ud83d\udd25 Momento cr\u00edtico detectado (fechamento/obje\u00e7\u00e3o), usando Pro + reasoning medium');
    return { 
      model: 'google/gemini-2.5-pro', 
      temperature: 0.4,
      reasoning: { effort: 'medium' }
    };
  }
  
  // 2. COMPARA\u00c7\u00c3O DE PLANOS: Pro + reasoning low (ancoragem t\u00e9cnica)
  if (hasComparison) {
    console.log('[Nina][Adaptive] \ud83d\udcca Compara\u00e7\u00e3o de planos detectada, usando Pro + reasoning low');
    return { 
      model: 'google/gemini-2.5-pro', 
      temperature: 0.5,
      reasoning: { effort: 'low' }
    };
  }
  
  // 3. RECLAMA\u00c7\u00c3O: Pro com temperatura baixa (precis\u00e3o + empatia)
  if (hasComplaint) {
    console.log('[Nina][Adaptive] \ud83d\udea8 Reclama\u00e7\u00e3o detectada, usando Pro temp=0.3');
    return { 
      model: 'google/gemini-2.5-pro', 
      temperature: 0.3,
      reasoning: { effort: 'low' }
    };
  }
  
  // 4. OBJE\u00c7\u00c3O LEVE (lead morno): Flash + reasoning low
  if (hasObjection) {
    console.log('[Nina][Adaptive] \u26a1 Obje\u00e7\u00e3o leve, usando Flash + reasoning low');
    return { 
      model: 'google/gemini-3-flash-preview', 
      temperature: 0.6,
      reasoning: { effort: 'low' }
    };
  }
  
  // 5. PRIMEIRAS INTERA\u00c7\u00d5ES (qualifica\u00e7\u00e3o): Flash r\u00e1pido, mais criativo
  if (messageCount < 6) {
    console.log('[Nina][Adaptive] \ud83d\udc4b Qualifica\u00e7\u00e3o inicial, usando Flash temp=0.8');
    return { model: 'google/gemini-3-flash-preview', temperature: 0.8 };
  }
  
  // 6. CONVERSA LONGA (manter consist\u00eancia): Flash temp baixa
  if (messageCount > 20) {
    console.log('[Nina][Adaptive] \ud83d\udcdc Conversa longa, usando Flash temp=0.5 (consist\u00eancia)');
    return { model: 'google/gemini-3-flash-preview', temperature: 0.5 };
  }
  
  // 7. DEFAULT: Flash equilibrado
  console.log('[Nina][Adaptive] \u2705 Conversa padr\u00e3o, usando Flash temp=0.7');
  return { model: 'google/gemini-3-flash-preview', temperature: 0.7 };
}
