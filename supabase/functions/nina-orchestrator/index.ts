import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
                  const safetyMessage = `Oi ${contactName}! Desculpa a demora, posso te ajudar com algo? 😊`;
                  
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
          <strong>Equipe OrbePet</strong><br><br>
          <span style="color:#6b7280;">OrbePet - Equipe de Cobrança</span><br>
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

// Generate audio using ElevenLabs (outputs MP3 for WhatsApp compatibility)
async function generateAudioElevenLabs(supabase: any, settings: any, text: string, agent?: Agent | null): Promise<{ buffer: ArrayBuffer; format: 'mp3' } | null> {
  // Get API key from Vault or fallback to table
  const apiKey = await getSecret(supabase, 'vault_elevenlabs_key', settings.elevenlabs_api_key);
  
  if (!apiKey) {
    console.log('[Nina] ElevenLabs API key not configured');
    return null;
  }

  try {
    // Priority: agent config > global config > fallback defaults
    const voiceId = agent?.elevenlabs_voice_id || settings.elevenlabs_voice_id || '9BWtsMINqrJLrRacOk9x';
    const model = agent?.elevenlabs_model || settings.elevenlabs_model || 'eleven_turbo_v2_5';
    const stability = agent?.elevenlabs_stability ?? settings.elevenlabs_stability ?? 0.75;
    const similarityBoost = agent?.elevenlabs_similarity_boost ?? settings.elevenlabs_similarity_boost ?? 0.80;
    const style = agent?.elevenlabs_style ?? settings.elevenlabs_style ?? 0.30;
    const speed = agent?.elevenlabs_speed ?? settings.elevenlabs_speed ?? 1.0;
    const speakerBoost = agent?.elevenlabs_speaker_boost ?? settings.elevenlabs_speaker_boost ?? true;

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
// Check if all essential qualification fields are collected
function isQualificationComplete(contact: any, qualificationAnswers: { [key: string]: string }): boolean {
  // Essential fields for Seguro de Cargas qualification
  const hasCnpj = !!contact?.cnpj;
  const hasTipoCarga = !!qualificationAnswers?.tipo_carga;
  const hasEstados = !!qualificationAnswers?.estados;
  const hasVolume = !!(qualificationAnswers?.viagens_mes || qualificationAnswers?.valor_medio);
  const hasTipoFrota = !!qualificationAnswers?.tipo_frota;
  
  const isComplete = hasCnpj && hasTipoCarga && hasEstados && hasVolume && hasTipoFrota;
  
  if (isComplete) {
    console.log(`[Nina] 📊 Qualification check: CNPJ=${hasCnpj}, TipoCarga=${hasTipoCarga}, Estados=${hasEstados}, Volume=${hasVolume}, TipoFrota=${hasTipoFrota} -> COMPLETE`);
  }
  
  return isComplete;
}

// ===== REAL-TIME QUALIFICATION EXTRACTION FUNCTION =====
// Extract qualification answers from user messages for immediate saving
function extractQualificationFromMessages(userMessages: string[]): { [key: string]: string | null } {
  const extracted: { [key: string]: string | null } = {};
  const allText = userMessages.join(' ').toLowerCase();
  
  // Patterns for qualification fields
  const patterns: { [key: string]: RegExp } = {
    contratacao: /\b(direto|subcontratado|ambos|contratado direto|subcontrata|sub-contratado)\b/i,
    tipo_carga: /\b(alumínio|aluminio|ferro|grão|grãos|graos|grao|alimento|alimentos|químico|quimicos|químicos|madeira|cimento|frigorific|refrigerad|seca|geral|carga geral|paletizada|granel|container|containers|bebidas?|perecíveis|pereciveis|eletrônicos|eletronicos|máquinas|maquinas|equipamentos?)\b/i,
    tipo_frota: /\b(própria|propria|próprio|proprio|agregado|agregados|terceiro|terceiros|frota própria|frota propria|mista)\b/i,
    antt: /\b(regularizada|pessoa física|pessoa fisica|ativa|não tenho antt|nao tenho antt|em processo|sim tenho|tenho sim|antt ok|antt ativa)\b/i,
    cte: /\b(sim|não|nao|emito|emite|vou começar|vou comecar|já emito|ja emito|emitimos|não emito|nao emito|emissão|emissao)\b/i,
  };
  
  // Extract estados (can be multiple)
  const estadosRegex = /(SP|PR|MG|MT|MS|GO|RS|SC|RJ|BA|ES|DF|TO|PA|AM|CE|PE|MA|PI|RN|PB|AL|SE|RO|RR|AP|AC|São Paulo|Paraná|Minas|Mato Grosso|Goiás|Rio Grande|Santa Catarina|Rio de Janeiro|Bahia|Ceará|Pernambuco)/gi;
  const estadosMatches = allText.match(estadosRegex);
  if (estadosMatches && estadosMatches.length > 0) {
    extracted.estados = [...new Set(estadosMatches.map(s => s.toUpperCase()))].join(', ');
  }
  
  // Extract other fields
  for (const [field, regex] of Object.entries(patterns)) {
    const match = allText.match(regex);
    if (match) {
      extracted[field] = match[0];
    }
  }
  
  // Extract viagens/mes (numeric pattern)
  const viagensMatch = allText.match(/(\d+)\s*(?:viagens?|vezes?|por mês|ao mês|por mes|mensal|mensais)/i);
  if (viagensMatch) {
    extracted.viagens_mes = viagensMatch[1];
  }
  
  // Extract valor médio (currency pattern)
  const valorMatch = allText.match(/(?:R\$|reais)\s*(\d+(?:\.\d{3})*(?:,\d{2})?)|(\d+(?:\.\d{3})*(?:,\d{2})?)\s*(?:mil|reais)/gi);
  if (valorMatch && valorMatch.length > 0) {
    extracted.valor_medio = valorMatch[0];
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
        responseMessage = `Foi um prazer conversar com você, ${contactName}! 😊

Vou te transferir agora para ${onlineAgent.name}, que vai continuar te atendendo.
Obrigada pela paciência e até a próxima! 🙌`;
        
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
        responseMessage = `Obrigada por conversar comigo, ${contactName}! 😊

Nossos corretores estão atendendo outros clientes no momento, mas um deles vai te responder em breve.
Agradeço sua paciência! 🙏`;
        
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
          responseMessage = `Obrigada por conversar comigo, ${contactName}! 😊

Hoje é ${currentDayName} e nosso time está curtindo o merecido descanso. 🏖️
Um corretor vai te responder na segunda-feira a partir das 09h.
Tenha um ótimo fim de semana! 🙌`;
        } else {
          responseMessage = `Obrigada por conversar comigo, ${contactName}! 😊

Nosso horário de atendimento é de segunda a sexta, das ${startHour}h às ${endHour}h.
Um corretor vai te responder ${nextBusiness.dayName} a partir das ${nextBusiness.time}.
Agradeço pela compreensão! 🙏`;
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
              
              // Update contact with CNPJ and company name
              const updateData: Record<string, any> = { 
                cnpj: cleanCnpj,
                updated_at: new Date().toISOString() 
              };
              
              if (companyName) {
                updateData.company = companyName;
              }
              
              await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', conversation.contact_id);
                
              console.log(`[Nina] ✅ Contact updated - CNPJ: ${cleanCnpj}, Company: ${companyName || 'N/A'}`);
              
              // If we got company name, send confirmation message and return early
              if (companyName) {
                const confirmationMessage = `Encontrei: ${companyName.toUpperCase()}. Está correto?`;
                
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

  // ===== REAL-TIME QUALIFICATION EXTRACTION =====
  // Qualification extraction is now handled by individual agent AI prompts
  const existingQA = conversation.nina_context?.qualification_answers || {};
  const mergedQA: { [key: string]: string } = { ...existingQA };
  // ===== END REAL-TIME QUALIFICATION EXTRACTION =====

  // (Cargo email capture and qualification blocks removed - not applicable for OrbePet)

  // (Cargo qualification complete check removed - not applicable for OrbePet)

  // Check if this is the first interaction (only 1 user message, no assistant messages yet)
  const userMessages = conversationHistory.filter((m: any) => m.role === 'user');
  const assistantMessages = conversationHistory.filter((m: any) => m.role === 'assistant');
  const isFirstInteraction = userMessages.length === 1 && assistantMessages.length === 0;

  // If first interaction and agent has greeting_message, use it instead of AI
  if (isFirstInteraction && agent?.greeting_message) {
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
    productKnowledgeContent
  );

  // Process template variables
  const processedPrompt = processPromptTemplate(enhancedSystemPrompt, conversation.contact);

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
        max_tokens: 1000
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
          max_tokens: 1000
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
      aiContent = 'Tive uma pequena dificuldade técnica para processar sua mensagem. 🙏 Posso te transferir para um atendente humano se preferir. Deseja continuar conversando comigo ou falar com alguém da equipe?';
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
        max_tokens: 1000
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
          max_tokens: 1000
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
      
      aiContent = 'Tive uma pequena dificuldade técnica para processar sua mensagem. 🙏 Posso te transferir para um atendente humano se preferir. Deseja continuar conversando comigo ou falar com alguém da equipe?';
    }

    // ===== SANITIZE AI RESPONSE: Remove prompt leaks and internal markers =====
    aiContent = sanitizeAiResponse(aiContent);

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
    // AND always: ElevenLabs is configured
    const shouldSendAudio = (
      settings?.audio_response_enabled || 
      (incomingWasAudio && agentAudioEnabled)
    ) && settings?.elevenlabs_api_key;

    console.log(`[Nina] 🎵 → Condition 1 (Global enabled): ${settings?.audio_response_enabled}`);
    console.log(`[Nina] 🎵 → Condition 2 (Incoming audio + Agent enabled): ${incomingWasAudio && agentAudioEnabled}`);
    console.log(`[Nina] 🎵 → Has ElevenLabs key: ${!!settings?.elevenlabs_api_key}`);
    console.log(`[Nina] 🎵 → FINAL DECISION - Should send audio: ${shouldSendAudio}`);
    console.log('[Nina] 🎵 ========== FIM AUDIO DECISION ==========');

    if (shouldSendAudio) {
      console.log('[Nina] 🎤 Attempting audio generation...');
      
      // Sanitize text for natural TTS pronunciation (simplify URLs)
      const sanitizedText = sanitizeTextForAudio(aiContent);
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

// Helper function to queue text response with chunking and duplicate check
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
  // ===== DUPLICATE MESSAGE CHECK =====
  // Check if the same message was sent in the last 5 minutes to prevent repetition
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content')
    .eq('conversation_id', conversation.id)
    .in('from_type', ['nina', 'human'])
    .gte('sent_at', fiveMinutesAgo)
    .order('sent_at', { ascending: false })
    .limit(5);

  const normalizedNewContent = aiContent.toLowerCase().trim();
  const isDuplicate = recentMessages?.some((m: any) => {
    if (!m.content) return false;
    const normalizedExisting = m.content.toLowerCase().trim();
    // Check for exact match or very similar (>90% similarity)
    return normalizedExisting === normalizedNewContent || 
           (normalizedExisting.length > 20 && normalizedNewContent.includes(normalizedExisting.substring(0, 50)));
  });

  if (isDuplicate) {
    console.log('[Nina] ⚠️ Mensagem duplicada detectada, não enviando:', aiContent.substring(0, 50) + '...');
    return;
  }
  
  // Also check send_queue for pending duplicates (by content OR by response_to_message_id)
  const { data: pendingMessages } = await supabase
    .from('send_queue')
    .select('content, metadata')
    .eq('conversation_id', conversation.id)
    .in('status', ['pending', 'processing'])
    .limit(10);
    
  const isPendingDuplicate = pendingMessages?.some((m: any) => {
    if (!m.content) return false;
    // Check exact text match
    if (m.content.toLowerCase().trim() === normalizedNewContent) return true;
    // Check if already responding to same message
    if (m.metadata?.response_to_message_id === message.id) return true;
    return false;
  });
  
  if (isPendingDuplicate) {
    console.log('[Nina] ⚠️ Mensagem já está na fila de envio (conteúdo ou message_id), não duplicando');
    return;
  }
  // ===== END DUPLICATE MESSAGE CHECK =====

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
          agent_name: agent?.name
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
  return `Você é Nina, assistente virtual inteligente da empresa. Seu papel é:

1. ATENDIMENTO: Responder de forma profissional, amigável e eficiente
2. QUALIFICAÇÃO: Entender as necessidades do cliente e qualificá-lo
3. VENDAS: Apresentar soluções e benefícios dos produtos/serviços
4. AGENDAMENTO: Quando necessário, sugerir agendar uma reunião ou demo

REGRAS:
- Use linguagem natural e amigável (estilo WhatsApp)
- Seja conciso (mensagens de até 3 parágrafos)
- Faça perguntas para entender melhor o cliente
- Nunca invente informações sobre preços ou produtos
- Se não souber algo, ofereça transferir para um atendente humano

INFORMAÇÕES DA EMPRESA:
- Oferecemos soluções de automação e IA para empresas
- Horário de atendimento: Segunda a Sexta, 9h às 18h
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
- **Empresa:** OrbePet
- **Segmento:** Planos de saúde pet

⚠️ NUNCA invente endereços, telefones ou informações da empresa.`;

  // ===== CONHECIMENTO ESPECIALIZADO - SAÚDE PET =====
  contextInfo += `\n\n## CONHECIMENTO ESPECIALIZADO - PLANOS DE SAÚDE PET

### REGRAS GERAIS:
- A OrbePet oferece planos de saúde pet com diferentes níveis de cobertura
- Os detalhes completos de cada plano estão na base de conhecimento de produtos (injetada abaixo)
- Sempre consulte a base de conhecimento antes de responder sobre coberturas, carências e exclusões
- NUNCA invente coberturas ou condições que não estejam documentadas

### ORIENTAÇÕES DE ATENDIMENTO:
- Pergunte sobre o pet (nome, espécie, idade, raça) para personalizar a recomendação
- Compare os planos de forma objetiva quando o cliente tiver dúvidas
- Destaque os diferenciais de cada plano sem depreciar os demais
- Em caso de dúvida sobre cobertura específica, oriente o cliente a consultar as Condições Gerais completas`;

  if (contact) {
    contextInfo += `\n\nCONTEXTO DO CLIENTE:`;
    if (contact.name) contextInfo += `\n- Nome: ${contact.name}`;
    if (contact.call_name) contextInfo += ` (trate por: ${contact.call_name})`;
    if (contact.tags?.length) contextInfo += `\n- Tags: ${contact.tags.join(', ')}`;
    
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
      pet_nome: 'Nome do pet',
      pet_especie: 'Espécie',
      pet_idade: 'Idade do pet',
      pet_raca: 'Raça',
      plano_interesse: 'Plano de interesse',
      preocupacao_principal: 'Preocupação principal',
      ja_tem_plano: 'Já possui plano de saúde pet',
      cidade: 'Cidade/região',
      quantidade_pets: 'Quantidade de pets',
      condicao_preexistente: 'Condição pré-existente'
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

  // ===== ANTI-ECO + VERIFICAÇÃO DE HISTÓRICO =====
  contextInfo += `\n\n## REGRAS CRÍTICAS DE COMUNICAÇÃO:

### REGRA ANTI-ECO:
- NUNCA repita ou resuma o que o cliente acabou de dizer
- Vá DIRETO para a próxima pergunta ou ação
- NÃO use frases como "Entendi que você...", "Então você transporta...", "Certo, [resposta]..."

ERRADO: "Entendi, alimentos. Quais estados atende?"
CORRETO: "Quais estados atende?"

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

### Lista de verificação antes de perguntar:
- Tipo de contratação (direto/subcontratado) - já informou?
- Tipo de carga - já mencionou no histórico?
- Estados/regiões - já apareceu nas mensagens?
- CNPJ - já está no contexto do cliente?
- Tipo de frota - própria/agregado/terceiro definido?
- ANTT - já falou sobre regularização?
- CT-e - já confirmou se emite ou não?

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

  return basePrompt + contextInfo;
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
): { model: string; temperature: number } {
  const modelMode = settings?.ai_model_mode || 'flash';
  
  switch (modelMode) {
    case 'flash':
      return { model: 'google/gemini-2.5-flash', temperature: 0.7 };
    case 'pro':
      return { model: 'google/gemini-2.5-pro', temperature: 0.7 };
    case 'pro3':
      return { model: 'google/gemini-3-pro-preview', temperature: 0.7 };
    case 'adaptive':
      return getAdaptiveSettings(conversationHistory, message, contact, clientMemory);
    default:
      return { model: 'google/gemini-2.5-flash', temperature: 0.7 };
  }
}

function getAdaptiveSettings(
  conversationHistory: any[], 
  message: any, 
  contact: any,
  clientMemory: any
): { model: string; temperature: number } {
  const defaultSettings = {
    model: 'google/gemini-2.5-flash',
    temperature: 0.7
  };

  const messageCount = conversationHistory.length;
  const userContent = message.content?.toLowerCase() || '';
  
  const isComplaintKeywords = ['problema', 'erro', 'não funciona', 'reclamação', 'péssimo', 'horrível'];
  const isSalesKeywords = ['preço', 'valor', 'desconto', 'comprar', 'contratar', 'plano'];
  const isTechnicalKeywords = ['como funciona', 'integração', 'api', 'configurar', 'instalar'];
  const isUrgentKeywords = ['urgente', 'agora', 'rápido', 'emergência'];

  const isComplaint = isComplaintKeywords.some(k => userContent.includes(k));
  const isSales = isSalesKeywords.some(k => userContent.includes(k));
  const isTechnical = isTechnicalKeywords.some(k => userContent.includes(k));
  const isUrgent = isUrgentKeywords.some(k => userContent.includes(k));
  
  const leadStage = clientMemory?.lead_profile?.lead_stage;
  const qualificationScore = clientMemory?.lead_profile?.qualification_score || 0;

  if (isComplaint || isUrgent) {
    return { model: 'google/gemini-2.5-pro', temperature: 0.3 };
  }

  if (isSales && qualificationScore > 50) {
    return { model: 'google/gemini-2.5-flash', temperature: 0.5 };
  }

  if (isTechnical) {
    return { model: 'google/gemini-2.5-pro', temperature: 0.4 };
  }

  if (messageCount < 5) {
    return { model: 'google/gemini-2.5-flash', temperature: 0.8 };
  }

  if (messageCount > 15) {
    return { model: 'google/gemini-2.5-flash', temperature: 0.5 };
  }

  return defaultSettings;
}
