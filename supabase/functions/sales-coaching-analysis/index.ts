import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SALES_MANAGER_PROMPT = `# PAPEL
Você é um Gerente de Vendas experiente e especialista em coaching de equipes comerciais.
Você tem profundo conhecimento em:
- Metodologias: SPIN Selling, Challenger Sale, Solution Selling, BANT, MEDDIC
- Psicologia de vendas e gatilhos mentais
- Mercado de saúde pet e planos veterinários
- Atendimento via WhatsApp e telefone

# OBJETIVO
Analisar as interações do agente de IA e dos operadores humanos para:
1. Identificar padrões de sucesso e fracasso
2. Mapear objeções mais comuns e como são tratadas
3. Avaliar qualidade das perguntas de qualificação
4. Verificar se informações técnicas estão corretas
5. Gerar feedbacks construtivos e acionáveis

# CRITÉRIOS DE AVALIAÇÃO
- Clareza e objetividade nas respostas (máximo 2 linhas, sem emojis)
- Progressão lógica da qualificação (perguntas na ordem correta)
- Tratamento de objeções (preço, complexidade, urgência)
- Uso correto de informações técnicas (planos OrbePet, coberturas, carências)
- Engajamento do lead (respostas rápidas, continuidade)
- Conversão para próximo estágio do funil

# REGRAS DO AGENTE
O agente deve seguir estas regras - avalie se estão sendo cumpridas:
- Sem emojis
- Máximo 2 linhas por mensagem
- Nunca repetir nome do cliente mais de 2x na conversa
- Nunca inventar URLs (só orbepet.com.br é permitido)
- Nunca repetir perguntas já respondidas
- Priorizar responder perguntas do cliente antes de continuar qualificação

# OUTPUT
Responda APENAS com um JSON válido no formato:
{
  "overall_score": <0-100>,
  "qualification_effectiveness": <0-100>,
  "objection_handling_score": <0-100>,
  "closing_skills_score": <0-100>,
  "strengths": [
    {"title": "...", "description": "...", "example": "..."}
  ],
  "improvement_areas": [
    {"title": "...", "description": "...", "example": "...", "suggestion": "..."}
  ],
  "recommended_actions": [
    {"priority": <1-5>, "action": "...", "impact": "...", "category": "prompt|training|process"}
  ],
  "prompt_suggestions": "Texto com sugestões específicas de ajuste no prompt do agente",
  "good_examples": [
    {"conversation_id": "...", "excerpt": "...", "why_good": "..."}
  ],
  "bad_examples": [
    {"conversation_id": "...", "excerpt": "...", "why_bad": "...", "better_response": "..."}
  ]
}`;

const PROSPECTING_MANAGER_PROMPT = `# PAPEL
Você é um Gerente de Prospecção especialista em outbound sales e cold outreach B2B.
Você tem profundo conhecimento em:
- Técnicas de prospecção ativa via WhatsApp
- Qualificação consultiva de leads
- Identificação de decisores vs. colaboradores
- Mercado de saúde pet

# OBJETIVO
Analisar as interações de prospecção ativa do agente Atlas para:
1. Avaliar taxa de resposta aos templates de abertura
2. Medir qualidade da abordagem inicial
3. Verificar rapidez na detecção de rejeição vs interesse
4. Analisar efetividade do fluxo de qualificação
5. Identificar padrões de sucesso e fracasso

# CRITÉRIOS ESPECÍFICOS DE PROSPECÇÃO
- Abertura: O template gera curiosidade e resposta?
- Detecção: Identifica rapidamente rejeição explícita ("não tenho interesse")?
- Qualificação: Segue fluxo pet → espécie → idade → plano de interesse?
- Encerramento: Sabe quando parar e quando insistir?
- Handoff: Passa leads qualificados corretamente?

# MÉTRICAS DE PROSPECÇÃO
{prospecting_metrics}

# OUTPUT
Responda APENAS com um JSON válido no formato:
{
  "overall_score": <0-100>,
  "qualification_effectiveness": <0-100>,
  "objection_handling_score": <0-100>,
  "closing_skills_score": <0-100>,
  "strengths": [{"title": "...", "description": "...", "example": "..."}],
  "improvement_areas": [{"title": "...", "description": "...", "example": "...", "suggestion": "..."}],
  "recommended_actions": [{"priority": <1-5>, "action": "...", "impact": "...", "category": "prompt|training|process"}],
  "prompt_suggestions": "Texto com sugestões específicas de ajuste no prompt do agente",
  "good_examples": [{"conversation_id": "...", "excerpt": "...", "why_good": "..."}],
  "bad_examples": [{"conversation_id": "...", "excerpt": "...", "why_bad": "...", "better_response": "..."}]
}`;

const ALERT_THRESHOLD = 70;
const DEFAULT_ALERT_RECIPIENTS = ["contato@orbepet.com.br"];

interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
}

interface Pipeline {
  id: string;
  name: string;
  slug: string;
  agent_id: string | null;
}

interface ProspectingMetrics {
  templates_sent: number;
  responses_received: number;
  positive_responses: number;
  rejections: number;
  response_rate: number;
  rejection_rate: number;
  positive_rate: number;
  conversion_rate: number;
  deals_qualified: number;
  deals_in_qualification: number;
  deals_lost: number;
}

async function calculateProspectingMetrics(
  supabase: any,
  agentId: string,
  pipelineId: string | null,
  periodStart: Date,
  periodEnd: Date
): Promise<ProspectingMetrics> {
  console.log('[sales-coaching] Calculating prospecting metrics...');
  
  // 1. Templates sent (messages with is_prospecting = true)
  const { data: templateMessages } = await supabase
    .from('messages')
    .select('id, conversation_id, metadata')
    .eq('from_type', 'nina')
    .gte('sent_at', periodStart.toISOString())
    .lte('sent_at', periodEnd.toISOString());
  
  const prospectingTemplates = (templateMessages || []).filter(
    (m: any) => m.metadata?.is_prospecting === true
  );
  const templatesSent = prospectingTemplates.length;
  
  // 2. Conversations with prospecting origin that received responses
  const { data: prospectingConversations } = await supabase
    .from('conversations')
    .select('id, status, metadata')
    .eq('current_agent_id', agentId)
    .gte('created_at', periodStart.toISOString());
  
  const prospectingConvs = (prospectingConversations || []).filter(
    (c: any) => c.metadata?.origin === 'prospeccao'
  );
  
  // Count conversations with user responses
  let responsesReceived = 0;
  for (const conv of prospectingConvs) {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('from_type', 'user');
    if (count && count > 0) responsesReceived++;
  }
  
  // 3. Deals in prospecting pipeline
  let dealsQuery = supabase
    .from('deals')
    .select(`
      id, 
      stage_id, 
      lost_reason,
      pipeline_stages!inner (title, pipeline_id)
    `)
    .gte('created_at', periodStart.toISOString());
  
  if (pipelineId) {
    dealsQuery = dealsQuery.eq('pipeline_stages.pipeline_id', pipelineId);
  }
  
  const { data: deals } = await dealsQuery;
  
  const rejections = (deals || []).filter(
    (d: any) => d.lost_reason === 'Lead rejeitou prospecção'
  ).length;
  
  const qualified = (deals || []).filter(
    (d: any) => d.pipeline_stages?.title === 'Qualificado'
  ).length;
  
  const inQualification = (deals || []).filter(
    (d: any) => d.pipeline_stages?.title === 'Em Qualificação'
  ).length;
  
  const lost = (deals || []).filter(
    (d: any) => d.pipeline_stages?.title === 'Perdido'
  ).length;
  
  const positiveResponses = responsesReceived - rejections;
  
  const metrics: ProspectingMetrics = {
    templates_sent: templatesSent,
    responses_received: responsesReceived,
    positive_responses: Math.max(0, positiveResponses),
    rejections,
    response_rate: templatesSent > 0 ? (responsesReceived / templatesSent) * 100 : 0,
    rejection_rate: templatesSent > 0 ? (rejections / templatesSent) * 100 : 0,
    positive_rate: templatesSent > 0 ? (positiveResponses / templatesSent) * 100 : 0,
    conversion_rate: templatesSent > 0 ? (qualified / templatesSent) * 100 : 0,
    deals_qualified: qualified,
    deals_in_qualification: inQualification,
    deals_lost: lost
  };
  
  console.log('[sales-coaching] Prospecting metrics:', metrics);
  return metrics;
}

async function sendAlertEmail(
  supabaseUrl: string,
  supabaseKey: string,
  report: any,
  agentName: string,
  pipelineName: string | null
): Promise<{ sent: boolean; recipients: string[] }> {
  const recipients = DEFAULT_ALERT_RECIPIENTS;
  
  const improvementsList = (report.improvement_areas || [])
    .slice(0, 3)
    .map((area: any) => `<li><strong>${area.title}</strong>: ${area.description}</li>`)
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #dc2626;">Alerta de Coaching - Score Baixo Detectado</h1>
      
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h2 style="margin: 0 0 8px 0; color: #991b1b;">Score: ${report.overall_score}/100</h2>
        <p style="margin: 0; color: #7f1d1d;">Threshold mínimo: ${ALERT_THRESHOLD}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Agente:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${agentName}</td>
        </tr>
        ${pipelineName ? `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Departamento:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${pipelineName}</td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Qualificação:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${report.qualification_effectiveness || 'N/A'}/100</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Objeções:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${report.objection_handling_score || 'N/A'}/100</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Fechamento:</strong></td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${report.closing_skills_score || 'N/A'}/100</td>
        </tr>
      </table>
      
      ${improvementsList ? `
      <h3 style="color: #374151;">Principais Áreas de Melhoria:</h3>
      <ul style="color: #4b5563;">
        ${improvementsList}
      </ul>
      ` : ''}
      
      <div style="margin-top: 24px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">
          Este alerta foi gerado automaticamente pelo sistema de coaching.
          Acesse o painel de configurações para ver o relatório completo.
        </p>
      </div>
    </div>
  `;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        to: recipients[0],
        subject: `Alerta de Coaching - ${agentName} com Score ${report.overall_score}`,
        html,
      }),
    });

    if (!response.ok) {
      console.error("[sales-coaching] Erro ao enviar email de alerta:", await response.text());
      return { sent: false, recipients };
    }

    console.log("[sales-coaching] Email de alerta enviado para:", recipients);
    return { sent: true, recipients };
  } catch (error) {
    console.error("[sales-coaching] Erro ao enviar email:", error);
    return { sent: false, recipients };
  }
}

async function generateReportForAgent(
  supabase: any,
  lovableApiKey: string,
  agent: Agent,
  pipeline: Pipeline | null,
  days: number,
  reportType: string
): Promise<any> {
  const periodEnd = new Date();
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - days);

  console.log(`[sales-coaching] Gerando relatório para ${agent.name} (${days} dias)`);

  // Fetch conversations for this agent
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select(`
      id,
      status,
      current_agent_id,
      nina_context,
      contacts!inner (
        id,
        name,
        phone_number
      )
    `)
    .eq('current_agent_id', agent.id)
    .gte('last_message_at', periodStart.toISOString())
    .lte('last_message_at', periodEnd.toISOString())
    .order('last_message_at', { ascending: false })
    .limit(50);

  if (convError) {
    console.error('[sales-coaching] Error fetching conversations:', convError);
    throw convError;
  }

  console.log(`[sales-coaching] Found ${conversations?.length || 0} conversations for ${agent.name}`);

  // Fetch messages for these conversations
  const conversationIds = conversations?.map((c: any) => c.id) || [];
  
  let messages: any[] = [];
  if (conversationIds.length > 0) {
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .gte('created_at', periodStart.toISOString())
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('[sales-coaching] Error fetching messages:', msgError);
    } else {
      messages = msgData || [];
    }
  }

  console.log(`[sales-coaching] Found ${messages.length} messages for ${agent.name}`);

  // Fetch call logs with transcriptions for contacts in these conversations
  const contactIds = conversations?.map((c: any) => c.contacts?.id).filter(Boolean) || [];
  
  let calls: any[] = [];
  if (contactIds.length > 0) {
    const { data: callData, error: callError } = await supabase
      .from('call_logs')
      .select('*')
      .in('contact_id', contactIds)
      .gte('created_at', periodStart.toISOString())
      .not('transcription', 'is', null)
      .limit(20);

    if (callError) {
      console.error('[sales-coaching] Error fetching calls:', callError);
    } else {
      calls = callData || [];
    }
  }

  console.log(`[sales-coaching] Found ${calls.length} calls with transcriptions for ${agent.name}`);

  // Group messages by conversation
  const conversationsWithMessages = conversations?.map((conv: any) => {
    const convMessages = messages.filter(m => m.conversation_id === conv.id) || [];
    return {
      ...conv,
      messages: convMessages.map((m: any) => ({
        from: m.from_type,
        content: m.content,
        type: m.type,
        time: m.sent_at
      }))
    };
  }) || [];

  // Count message types
  const ninaMessages = messages.filter(m => m.from_type === 'nina').length;
  const humanMessages = messages.filter(m => m.from_type === 'human').length;
  const userMessages = messages.filter(m => m.from_type === 'user').length;

  // Calculate prospecting metrics if this is a prospecting agent
  const isProspectingAgent = agent.specialty === 'prospeccao_ativa';
  let prospectingMetrics: ProspectingMetrics | null = null;
  
  if (isProspectingAgent) {
    prospectingMetrics = await calculateProspectingMetrics(
      supabase, agent.id, pipeline?.id || null, periodStart, periodEnd
    );
  }

  // Prepare analysis data
  const analysisData = {
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      days
    },
    agent: agent.name,
    agent_specialty: agent.specialty,
    pipeline: pipeline?.name || null,
    metrics: {
      total_conversations: conversations?.length || 0,
      total_messages: messages.length,
      nina_messages: ninaMessages,
      human_messages: humanMessages,
      user_messages: userMessages,
      calls_with_transcription: calls.length
    },
    conversations: conversationsWithMessages.slice(0, 20),
    call_transcriptions: calls.map((c: any) => ({
      id: c.id,
      duration: c.duration_seconds,
      transcription: c.transcription?.substring(0, 2000)
    }))
  };

  // Choose prompt based on agent specialty
  let systemPrompt = SALES_MANAGER_PROMPT;
  if (isProspectingAgent && prospectingMetrics) {
    systemPrompt = PROSPECTING_MANAGER_PROMPT.replace(
      '{prospecting_metrics}',
      JSON.stringify(prospectingMetrics, null, 2)
    );
  }

  // Call AI for analysis
  console.log(`[sales-coaching] Calling AI for analysis of ${agent.name} (prospecting: ${isProspectingAgent})...`);
  
  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { 
          role: 'user', 
          content: `Analise os dados de ${isProspectingAgent ? 'prospecção' : 'vendas'} abaixo e gere um relatório de coaching:\n\n${JSON.stringify(analysisData, null, 2)}`
        }
      ],
      max_tokens: 4000
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('[sales-coaching] AI error:', aiResponse.status, errorText);
    throw new Error(`AI analysis failed: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const analysisContent = aiData.choices?.[0]?.message?.content;

  console.log(`[sales-coaching] AI response received for ${agent.name}, parsing...`);

  // Parse JSON from AI response
  let report;
  try {
    const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      report = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseError) {
    console.error('[sales-coaching] Failed to parse AI response:', parseError);
    report = {
      overall_score: 70,
      qualification_effectiveness: 70,
      objection_handling_score: 70,
      closing_skills_score: 70,
      strengths: [{ title: 'Análise em andamento', description: 'Não foi possível gerar análise detalhada', example: '' }],
      improvement_areas: [],
      recommended_actions: [],
      prompt_suggestions: 'Análise não disponível - tente novamente',
      good_examples: [],
      bad_examples: []
    };
  }

  // Save report to database
  const { data: savedReport, error: saveError } = await supabase
    .from('sales_coaching_reports')
    .insert({
      agent_id: agent.id,
      pipeline_id: pipeline?.id || null,
      pipeline_name: pipeline?.name || null,
      report_type: reportType,
      analysis_period_start: periodStart.toISOString(),
      analysis_period_end: periodEnd.toISOString(),
      conversations_analyzed: conversations?.length || 0,
      calls_analyzed: calls.length,
      human_interactions_analyzed: humanMessages,
      strengths: report.strengths || [],
      improvement_areas: report.improvement_areas || [],
      recommended_actions: report.recommended_actions || [],
      prompt_suggestions: report.prompt_suggestions || '',
      good_examples: report.good_examples || [],
      bad_examples: report.bad_examples || [],
      overall_score: report.overall_score,
      qualification_effectiveness: report.qualification_effectiveness,
      objection_handling_score: report.objection_handling_score,
      closing_skills_score: report.closing_skills_score,
      prospecting_metrics: prospectingMetrics || {}
    })
    .select()
    .single();

  if (saveError) {
    console.error('[sales-coaching] Error saving report:', saveError);
    throw saveError;
  }

  console.log(`[sales-coaching] Report saved for ${agent.name}:`, savedReport.id);

  // Aggregate learning insights from improvement_areas and recommended_actions
  await aggregateLearningInsights(supabase, savedReport, agent, pipeline);

  return {
    ...savedReport,
    agent_name: agent.name,
    pipeline_name: pipeline?.name
  };
}

// Function to aggregate learning insights from reports
async function aggregateLearningInsights(
  supabase: any,
  report: any,
  agent: Agent,
  pipeline: Pipeline | null
) {
  try {
    console.log(`[sales-coaching] Aggregating learning insights for ${agent.name}`);
    
    // Process improvement_areas
    const improvementAreas = report.improvement_areas || [];
    for (const area of improvementAreas) {
      await processInsight(supabase, {
        title: area.title,
        description: area.description,
        suggestion: area.suggestion || null,
        examples: area.example ? [{ type: 'bad', text: area.example }] : [],
        category: 'prompt',
        priority: 2, // Default to high priority for improvement areas
        agent_id: agent.id,
        pipeline_id: pipeline?.id || null,
        source_report_id: report.id
      });
    }

    // Process recommended_actions
    const recommendedActions = report.recommended_actions || [];
    for (const action of recommendedActions) {
      // Determine category based on action.category or default to 'process'
      const category = action.category === 'prompt' ? 'prompt' : 
                       action.category === 'training' ? 'training' : 'process';
      
      await processInsight(supabase, {
        title: action.action,
        description: action.impact || 'Ação recomendada pela análise de coaching',
        suggestion: null,
        examples: [],
        category,
        priority: action.priority || 2,
        agent_id: agent.id,
        pipeline_id: pipeline?.id || null,
        source_report_id: report.id
      });
    }

    console.log(`[sales-coaching] Learning insights aggregated for ${agent.name}`);
  } catch (error) {
    // Don't throw - just log the error so it doesn't break report generation
    console.error('[sales-coaching] Error aggregating learning insights:', error);
  }
}

// Process a single insight - check for similar existing, update or create
async function processInsight(
  supabase: any,
  insight: {
    title: string;
    description: string;
    suggestion: string | null;
    examples: any[];
    category: string;
    priority: number;
    agent_id: string;
    pipeline_id: string | null;
    source_report_id: string;
  }
) {
  // Look for similar existing insight (same title and agent)
  const { data: existing } = await supabase
    .from('learning_insights')
    .select('*')
    .eq('agent_id', insight.agent_id)
    .ilike('title', `%${insight.title.substring(0, 30)}%`)
    .in('status', ['pending', 'reviewing'])
    .limit(1);

  if (existing && existing.length > 0) {
    // Update existing insight - increment count and add source report
    const existingInsight = existing[0];
    const existingReports = existingInsight.source_reports || [];
    
    // Don't add duplicate report IDs
    if (!existingReports.includes(insight.source_report_id)) {
      const updatedReports = [...existingReports, insight.source_report_id];
      const updatedExamples = [...(existingInsight.examples || []), ...insight.examples];
      
      // Increase priority if occurrence is high
      const newCount = existingInsight.occurrence_count + 1;
      const newPriority = newCount >= 5 ? 1 : newCount >= 3 ? Math.min(existingInsight.priority, 2) : existingInsight.priority;
      
      await supabase
        .from('learning_insights')
        .update({
          occurrence_count: newCount,
          source_reports: updatedReports,
          examples: updatedExamples.slice(-10), // Keep last 10 examples
          priority: newPriority,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingInsight.id);
        
      console.log(`[sales-coaching] Updated existing insight: ${insight.title} (count: ${newCount})`);
    }
  } else {
    // Create new insight
    await supabase
      .from('learning_insights')
      .insert({
        title: insight.title,
        description: insight.description,
        suggestion: insight.suggestion,
        examples: insight.examples,
        category: insight.category,
        priority: insight.priority,
        agent_id: insight.agent_id,
        pipeline_id: insight.pipeline_id,
        source_reports: [insight.source_report_id],
        status: 'pending',
        occurrence_count: 1
      });
      
    console.log(`[sales-coaching] Created new insight: ${insight.title}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      report_type = 'daily', 
      agent_id = null, 
      days = 1,
      generate_all = true,
      send_alerts = true
    } = await req.json();

    console.log(`[sales-coaching] Starting ${report_type} analysis for ${days} day(s), generate_all=${generate_all}`);

    // Fetch active agents
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, name, slug, specialty')
      .eq('is_active', true)
      .order('name');

    if (agentsError) throw agentsError;

    // Fetch pipelines
    const { data: pipelines, error: pipelinesError } = await supabase
      .from('pipelines')
      .select('id, name, slug, agent_id')
      .eq('is_active', true);

    if (pipelinesError) throw pipelinesError;

    const reports: any[] = [];
    const alertsSent: any[] = [];

    // If specific agent_id, generate only for that agent
    if (agent_id) {
      const agent = agents?.find((a: Agent) => a.id === agent_id);
      if (!agent) {
        throw new Error(`Agent ${agent_id} not found`);
      }

      const pipeline = pipelines?.find((p: Pipeline) => p.agent_id === agent.id) || null;
      const report = await generateReportForAgent(
        supabase, lovableApiKey, agent, pipeline, days, report_type
      );
      reports.push(report);

      // Check for alert
      if (send_alerts && report.overall_score < ALERT_THRESHOLD) {
        const alertResult = await sendAlertEmail(
          supabaseUrl, supabaseServiceKey, report, agent.name, pipeline?.name || null
        );
        if (alertResult.sent) {
          await supabase
            .from('sales_coaching_reports')
            .update({
              alert_sent: true,
              alert_sent_at: new Date().toISOString(),
              alert_recipients: alertResult.recipients,
            })
            .eq('id', report.id);
          alertsSent.push({ agent: agent.name, score: report.overall_score });
        }
      }
    } 
    // Generate for all agents
    else if (generate_all) {
      for (const agent of agents || []) {
        try {
          const pipeline = pipelines?.find((p: Pipeline) => p.agent_id === agent.id) || null;
          const report = await generateReportForAgent(
            supabase, lovableApiKey, agent, pipeline, days, report_type
          );
          reports.push(report);

          // Check for alert
          if (send_alerts && report.overall_score < ALERT_THRESHOLD) {
            const alertResult = await sendAlertEmail(
              supabaseUrl, supabaseServiceKey, report, agent.name, pipeline?.name || null
            );
            if (alertResult.sent) {
              await supabase
                .from('sales_coaching_reports')
                .update({
                  alert_sent: true,
                  alert_sent_at: new Date().toISOString(),
                  alert_recipients: alertResult.recipients,
                })
                .eq('id', report.id);
              alertsSent.push({ agent: agent.name, score: report.overall_score });
            }
          }
        } catch (agentError) {
          console.error(`[sales-coaching] Error generating report for ${agent.name}:`, agentError);
        }
      }
    }

    console.log(`[sales-coaching] Reports generated: ${reports.length}, Alerts sent: ${alertsSent.length}`);

    return new Response(JSON.stringify({
      success: true,
      reports_count: reports.length,
      reports: reports.map(r => ({
        id: r.id,
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        pipeline_name: r.pipeline_name,
        overall_score: r.overall_score,
      })),
      alerts_sent: alertsSent,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sales-coaching] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
