import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { contact_id, conversation_id, user_message, ai_response, current_memory } = await req.json();

    console.log(`[Analyze Conversation] Starting analysis for contact ${contact_id}`);

    // Calculate interaction count
    const interactionCount = (current_memory.interaction_summary?.total_conversations || 0) + 1;
    
    // Determine if full AI analysis should run (message 1, 5, 10, 15, 20...)
    const shouldAnalyze = interactionCount === 1 || interactionCount % 5 === 0;
    
    console.log(`[Analyze] Interaction #${interactionCount}, full analysis: ${shouldAnalyze}`);

    if (!shouldAnalyze) {
      // BASIC UPDATE: Just increment counter and add to history
      const basicMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200)
          }
        ]
      };
      
      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: basicMemory
      });
      
      console.log('[Analyze] Basic update completed');
      return new Response(JSON.stringify({ updated: true, type: 'basic' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // FULL ANALYSIS: Fetch pipeline stages and current deal
    // Only fetch AI-managed stages with criteria
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, title, ai_trigger_criteria, position')
      .eq('is_ai_managed', true)
      .not('ai_trigger_criteria', 'is', null)
      .eq('is_active', true)
      .order('position', { ascending: true });

    const { data: currentDeal } = await supabase
      .from('deals')
      .select('id, stage_id, stage, owner_id')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasAiManagedStages = stages && stages.length > 0;
    
    if (!hasAiManagedStages) {
      console.log('[Analyze] ⏭️ No AI-managed stages with criteria - skipping stage determination');
    }

    console.log(`[Analyze] Running full AI analysis${hasAiManagedStages ? ' with stage determination' : ' (insights only)'}...`);

    // Prepare stage criteria for AI (only if there are AI-managed stages)
    const stagesCriteria = hasAiManagedStages
      ? stages.map(s => `- ${s.title} (ID: ${s.id}): ${s.ai_trigger_criteria}`).join('\n')
      : '';

    // Prepare conversation snippet for AI analysis
    const conversationSnippet = `
MENSAGEM DO CLIENTE:
${user_message}

RESPOSTA DO ASSISTENTE:
${ai_response}

CONTEXTO ATUAL:
- Interesses conhecidos: ${current_memory.lead_profile?.interests?.join(', ') || 'Nenhum'}
- Dores identificadas: ${current_memory.sales_intelligence?.pain_points?.join(', ') || 'Nenhuma'}
- Score atual: ${current_memory.lead_profile?.qualification_score || 0}/100
${hasAiManagedStages ? `
CRITÉRIOS DOS ESTÁGIOS DO PIPELINE:
${stagesCriteria}

ESTÁGIO ATUAL DO DEAL: ${currentDeal?.stage || 'Sem estágio'}` : ''}
    `.trim();

    // Build tools array - always include memory insights and contact data extraction, conditionally include stage determination
    const tools: any[] = [
      {
        type: "function",
        function: {
          name: "update_memory_insights",
          description: "Extrair insights estruturados da conversa para atualizar memória do cliente",
          parameters: {
            type: "object",
            properties: {
              interests: {
                type: "array",
                items: { type: "string" },
                description: "Lista de interesses ou necessidades mencionados pelo cliente (max 5)"
              },
              pain_points: {
                type: "array",
                items: { type: "string" },
                description: "Dores, problemas ou desafios mencionados (max 5)"
              },
              qualification_score: {
                type: "number",
                description: "Score de qualificação de 0 a 100 baseado em: interesse demonstrado, budget implícito, urgência, fit com produto",
                minimum: 0,
                maximum: 100
              },
              next_best_action: {
                type: "string",
                enum: ["qualify", "demo", "followup", "close", "nurture"],
                description: "Próxima melhor ação"
              },
              budget_indication: {
                type: "string",
                enum: ["unknown", "low", "medium", "high"],
                description: "Indicação de orçamento baseado em sinais implícitos"
              },
              decision_timeline: {
                type: "string",
                enum: ["unknown", "immediate", "1month", "3months", "6months+"],
                description: "Timeline de decisão baseado em urgência"
              }
            },
            required: ["interests", "pain_points", "qualification_score", "next_best_action", "budget_indication", "decision_timeline"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "extract_contact_data",
          description: "Extrair dados de contato mencionados pelo cliente na conversa (CNPJ, email, nome da empresa). Use apenas se o cliente fornecer explicitamente esses dados.",
          parameters: {
            type: "object",
            properties: {
              cnpj: {
                type: "string",
                description: "CNPJ mencionado pelo cliente (qualquer formato, ex: 12.345.678/0001-90 ou 12345678000190)"
              },
              email: {
                type: "string",
                description: "Email mencionado pelo cliente"
              },
              name: {
                type: "string",
                description: "Nome completo do cliente se mencionado"
              },
              company: {
                type: "string",
                description: "Nome da empresa se mencionado"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "extract_qualification_answers",
          description: "Extrair respostas específicas de qualificação dadas pelo cliente na conversa. Use para identificar informações já coletadas. IMPORTANTE: Interprete as respostas semanticamente - se o cliente diz 'CTE em meu nome', 'emito CTE', 'faço CTE próprio', isso significa que ELE EMITE CT-e, então cte='sim'. Só use cte='nao' se ele disser explicitamente que NÃO emite ou que outro faz por ele.",
          parameters: {
            type: "object",
            properties: {
              contratacao: {
                type: "string",
                enum: ["direto", "subcontratado", "ambos"],
                description: "Tipo de contratação: direto, subcontratado, ou ambos"
              },
              tipo_carga: {
                type: "string",
                description: "Tipo de mercadoria/carga transportada (ex: grãos, alimentos, químicos)"
              },
              estados: {
                type: "string",
                description: "Estados/regiões atendidos (ex: SP, PR, MT)"
              },
              viagens_mes: {
                type: "string",
                description: "Quantidade de viagens por mês"
              },
              valor_medio: {
                type: "string",
                description: "Valor médio por carga transportada"
              },
              maior_valor: {
                type: "string",
                description: "Maior valor já transportado"
              },
              tipo_frota: {
                type: "string",
                description: "Tipo de frota: própria, agregados, terceiros, ou combinação"
              },
              antt: {
                type: "string",
                description: "Status da ANTT: regularizada, pendente, ou não possui"
              },
              cte: {
                type: "string",
                enum: ["sim", "nao", "as_vezes"],
                description: "Se o cliente emite CT-e. IMPORTANTE: 'CTE em meu nome', 'faço CTE próprio', 'emito CTE' = 'sim'. 'CTE do embarcador', 'não emito', 'terceiro faz' = 'nao'"
              },
              sinistros: {
                type: "string",
                description: "Histórico de sinistros (roubo, acidente)"
              },
              cnpj: {
                type: "string",
                description: "CNPJ da empresa do cliente (ex: 12.345.678/0001-90)"
              },
              email: {
                type: "string",
                description: "Email do cliente"
              },
              plano_tipo: {
                type: "string",
                enum: ["individual", "familiar", "empresarial"],
                description: "Tipo de plano de saúde (para agente Barbara)"
              },
              quantidade_vidas: {
                type: "string",
                description: "Quantidade de pessoas/vidas para plano de saúde"
              },
              idades: {
                type: "string",
                description: "Idades dos beneficiários do plano"
              },
              cidade: {
                type: "string",
                description: "Cidade/região para cobertura do plano"
              },
              operadora_preferida: {
                type: "string",
                description: "Operadora de preferência (Unimed, Bradesco, etc)"
              }
            },
            additionalProperties: false
          }
        }
      }
    ];

    // Only add stage determination tool if there are AI-managed stages
    if (hasAiManagedStages) {
      tools.push({
        type: "function",
        function: {
          name: "determine_deal_stage",
          description: "Determinar para qual estágio do pipeline o deal deve ir com base nos critérios",
          parameters: {
            type: "object",
            properties: {
              suggested_stage_id: {
                type: "string",
                enum: stages.map(s => s.id),
                description: "ID do estágio sugerido"
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Confiança na sugestão (0-100)"
              },
              reasoning: {
                type: "string",
                description: "Justificativa breve para a mudança (max 200 chars)"
              }
            },
            required: ["suggested_stage_id", "confidence", "reasoning"],
            additionalProperties: false
          }
        }
      });
    }

    const systemPrompt = hasAiManagedStages 
      ? `Você é um analista de conversas de vendas. Analise a interação e:
1. Extraia insights estruturados para atualizar a memória do cliente
2. Extraia TODAS as informações de qualificação mencionadas (CNPJ, email, tipo de contratação, carga, estados, etc)
3. IMPORTANTE sobre CT-e: Se o cliente disser "CTE em meu nome", "faço meu próprio CTE", "emito CTE", isso significa que ELE EMITE CT-e, então cte="sim". Só use cte="nao" se ele explicitamente disser que não emite.
4. Determine para qual estágio do pipeline o deal deve ir com base nos critérios fornecidos`
      : `Você é um analista de conversas de vendas. Analise a interação e:
1. Extraia insights estruturados para atualizar a memória do cliente
2. Extraia TODAS as informações de qualificação mencionadas (CNPJ, email, tipo de contratação, carga, estados, etc)
3. IMPORTANTE sobre CT-e: Se o cliente disser "CTE em meu nome", "faço meu próprio CTE", "emito CTE", isso significa que ELE EMITE CT-e, então cte="sim". Só use cte="nao" se ele explicitamente disser que não emite.`;

    // Call AI to extract insights AND determine deal stage (if applicable)
    const analysisResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationSnippet }
        ],
        tools: tools
      })
    });

    if (!analysisResponse.ok) {
      console.error('[Analyze] AI analysis failed:', analysisResponse.status);
      throw new Error('AI analysis failed');
    }

    const analysisData = await analysisResponse.json();
    const toolCalls = analysisData.choices?.[0]?.message?.tool_calls || [];
    
    if (toolCalls.length === 0) {
      console.error('[Analyze] No tool calls in AI response');
      throw new Error('No insights extracted');
    }

    // Extract insights from tool calls
    let insights = null;
    let stageResult = null;
    let contactData = null;
    let qualificationAnswers = null;

    for (const toolCall of toolCalls) {
      if (toolCall.function?.name === 'update_memory_insights') {
        insights = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'determine_deal_stage') {
        stageResult = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'extract_contact_data') {
        contactData = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'extract_qualification_answers') {
        qualificationAnswers = JSON.parse(toolCall.function.arguments);
      }
    }

    console.log('[Analyze] Insights extracted:', insights);
    console.log('[Analyze] Stage suggestion:', stageResult);
    console.log('[Analyze] Contact data extracted:', contactData);
    console.log('[Analyze] Qualification answers extracted:', qualificationAnswers);

    // ===== UPDATE NINA_CONTEXT WITH QUALIFICATION ANSWERS =====
    if (qualificationAnswers && Object.keys(qualificationAnswers).filter(k => qualificationAnswers[k]).length > 0) {
      // Get current nina_context from conversation
      const { data: convData } = await supabase
        .from('conversations')
        .select('nina_context')
        .eq('id', conversation_id)
        .maybeSingle();
      
      const currentContext = convData?.nina_context || {};
      const existingAnswers = currentContext.qualification_answers || {};
      
      // Merge new answers with existing ones (don't overwrite with empty/null values)
      const mergedAnswers: Record<string, any> = { ...existingAnswers };
      for (const [key, value] of Object.entries(qualificationAnswers)) {
        if (value && String(value).trim()) {
          mergedAnswers[key] = value;
        }
      }
      
      // Update nina_context on conversation
      const updatedContext = {
        ...currentContext,
        qualification_answers: mergedAnswers,
        last_qualification_update: new Date().toISOString()
      };
      
      const { error: contextUpdateError } = await supabase
        .from('conversations')
        .update({ nina_context: updatedContext })
        .eq('id', conversation_id);
      
      if (contextUpdateError) {
        console.error('[Analyze] Error updating nina_context:', contextUpdateError);
      } else {
        console.log('[Analyze] ✅ Nina context updated with qualification answers:', Object.keys(mergedAnswers).length, 'fields');
      }
    }

    // Auto-update contact data if extracted
    if (contactData && (contactData.cnpj || contactData.email || contactData.name || contactData.company)) {
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (contactData.cnpj) {
        // Normalize CNPJ (remove formatting)
        const cleanCnpj = contactData.cnpj.replace(/\D/g, '');
        updateData.cnpj = cleanCnpj;
        
        // Auto-fetch company name from BrasilAPI if not already provided
        if (!contactData.company && cleanCnpj.length === 14) {
          console.log('[Analyze] 🔍 Fetching company data from BrasilAPI for CNPJ:', cleanCnpj);
          try {
            const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (brasilApiResponse.ok) {
              const cnpjData = await brasilApiResponse.json();
              const companyName = cnpjData.nome_fantasia || cnpjData.razao_social;
              if (companyName) {
                updateData.company = companyName;
                console.log('[Analyze] ✅ Company auto-filled from BrasilAPI:', companyName);
              }
            } else {
              console.log('[Analyze] ⚠️ BrasilAPI returned status:', brasilApiResponse.status);
            }
          } catch (brasilApiError) {
            console.log('[Analyze] ⚠️ BrasilAPI lookup failed:', brasilApiError);
          }
        }
      }
      if (contactData.email) {
        updateData.email = contactData.email.toLowerCase().trim();
      }
      if (contactData.name) {
        updateData.name = contactData.name.trim();
      }
      if (contactData.company) {
        updateData.company = contactData.company.trim();
      }

      const { error: contactUpdateError } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', contact_id);

      if (contactUpdateError) {
        console.error('[Analyze] Error updating contact data:', contactUpdateError);
      } else {
        console.log('[Analyze] ✅ Contact data auto-updated:', updateData);
      }
    }

    // Update client memory with insights
    if (insights) {
      const updatedMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        lead_profile: {
          ...current_memory.lead_profile,
          interests: Array.from(new Set([
            ...(current_memory.lead_profile?.interests || []),
            ...insights.interests
          ])).slice(0, 10),
          qualification_score: insights.qualification_score,
          lead_stage: insights.qualification_score > 70 ? 'qualified' : 
                      insights.qualification_score > 40 ? 'engaged' : 'new',
          budget_indication: insights.budget_indication,
          decision_timeline: insights.decision_timeline
        },
        sales_intelligence: {
          ...current_memory.sales_intelligence,
          pain_points: Array.from(new Set([
            ...(current_memory.sales_intelligence?.pain_points || []),
            ...insights.pain_points
          ])).slice(0, 10),
          next_best_action: insights.next_best_action
        },
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200),
            insights_extracted: {
              qualification_score: insights.qualification_score,
              next_action: insights.next_best_action
            }
          }
        ]
      };

      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: updatedMemory
      });

      console.log('[Analyze] Memory updated successfully');
    }

    // ===== ENHANCED QUALIFICATION CHECK =====
    // Fetch contact data to supplement qualification answers
    const { data: contactRecord } = await supabase
      .from('contacts')
      .select('cnpj, email, company, name')
      .eq('id', contact_id)
      .maybeSingle();
    
    // Get qualification answers from conversation
    const { data: convDataForQualification } = await supabase
      .from('conversations')
      .select('nina_context')
      .eq('id', conversation_id)
      .maybeSingle();
    
    const currentQualificationAnswers = (convDataForQualification?.nina_context as any)?.qualification_answers || {};
    
    // Supplement qualification answers with contact data
    const enrichedQualificationAnswers = { ...currentQualificationAnswers };
    
    // Add CNPJ from contacts table if not in qualification_answers
    if (contactRecord?.cnpj && !enrichedQualificationAnswers.cnpj) {
      enrichedQualificationAnswers.cnpj = contactRecord.cnpj;
      console.log('[Analyze] 📋 CNPJ suplementado da tabela contacts:', contactRecord.cnpj);
    }
    
    // Add email from contacts table if not in qualification_answers
    if (contactRecord?.email && !enrichedQualificationAnswers.email) {
      enrichedQualificationAnswers.email = contactRecord.email;
      console.log('[Analyze] 📋 Email suplementado da tabela contacts:', contactRecord.email);
    }
    
    // Count total qualification fields
    const qualificationFieldsFilled = Object.keys(enrichedQualificationAnswers).filter(k => enrichedQualificationAnswers[k]).length;
    console.log('[Analyze] 📊 Total de campos de qualificação preenchidos (incluindo dados do contato):', qualificationFieldsFilled);
    console.log('[Analyze] 📊 Campos preenchidos:', Object.keys(enrichedQualificationAnswers).filter(k => enrichedQualificationAnswers[k]).join(', '));
    
    // Check key qualification criteria for "Qualificado pela IA"
    const hasKeyQualificationData = !!(
      enrichedQualificationAnswers.cnpj || 
      enrichedQualificationAnswers.email ||
      enrichedQualificationAnswers.contratacao ||
      enrichedQualificationAnswers.tipo_carga ||
      enrichedQualificationAnswers.estados
    );
    
    console.log('[Analyze] 🔑 Tem dados-chave de qualificação:', hasKeyQualificationData);
    console.log('[Analyze] 🔑 Detalhes: CNPJ:', !!enrichedQualificationAnswers.cnpj, 
      '| Email:', !!enrichedQualificationAnswers.email,
      '| Contratação:', !!enrichedQualificationAnswers.contratacao,
      '| Carga:', !!enrichedQualificationAnswers.tipo_carga,
      '| Estados:', !!enrichedQualificationAnswers.estados);

    // Move deal if confidence > 70% and stage is different
    let dealMoved = false;
    if (stageResult && currentDeal && stageResult.suggested_stage_id !== currentDeal.stage_id && stageResult.confidence > 70) {
      const newStage = stages?.find(s => s.id === stageResult.suggested_stage_id);
      
        if (newStage) {
        const { error: updateError } = await supabase
          .from('deals')
          .update({ 
            stage_id: stageResult.suggested_stage_id,
            stage: newStage.title
          })
          .eq('id', currentDeal.id);

        if (!updateError) {
          dealMoved = true;
          console.log(`[Analyze] Deal moved to stage: ${newStage.title} (confidence: ${stageResult.confidence}%)`);
          console.log(`[Analyze] Reasoning: ${stageResult.reasoning}`);
          
          // Check if it's a qualification stage and send email notifications
          const isQualifiedStage = newStage.title.toLowerCase().includes('qualificad');
          
          console.log(`[Analyze] 📧 Stage qualification check: "${newStage.title}" → isQualifiedStage: ${isQualifiedStage}`);
          
          if (isQualifiedStage) {
            console.log('='.repeat(60));
            console.log('[Analyze] 🎯 LEAD QUALIFICADO - INICIANDO NOTIFICAÇÃO POR EMAIL');
            console.log('='.repeat(60));
            console.log(`[Analyze] Deal ID: ${currentDeal.id}`);
            console.log(`[Analyze] Contact ID: ${contact_id}`);
            console.log(`[Analyze] Conversation ID: ${conversation_id}`);
            console.log(`[Analyze] Novo estágio: ${newStage.title}`);
            console.log(`[Analyze] Confiança: ${stageResult.confidence}%`);
            console.log(`[Analyze] Razão: ${stageResult.reasoning}`);
            
            try {
              // Fetch contact data
              const { data: contactData } = await supabase
                .from('contacts')
                .select('name, phone_number, email, company, cnpj')
                .eq('id', contact_id)
                .single();
              
              console.log('[Analyze] 📋 Dados do contato carregados:', {
                name: contactData?.name || 'N/A',
                phone: contactData?.phone_number || 'N/A',
                email: contactData?.email || 'N/A',
                company: contactData?.company || 'N/A',
                cnpj: contactData?.cnpj || 'N/A'
              });
              
              // Build recipients list - always include admin
              const recipients: string[] = [];
              
              // Fetch owner email if exists
              if (currentDeal.owner_id) {
                console.log(`[Analyze] 👤 Buscando owner do deal: ${currentDeal.owner_id}`);
                const { data: owner } = await supabase
                  .from('team_members')
                  .select('email, name')
                  .eq('id', currentDeal.owner_id)
                  .single();
                
                if (owner?.email && !recipients.includes(owner.email)) {
                  recipients.push(owner.email);
                  console.log(`[Analyze] 👤 Owner adicionado: ${owner.name} <${owner.email}>`);
                }
              }
              
              console.log(`[Analyze] 📬 Destinatários: ${recipients.join(', ')}`);
              
              // Fetch qualification answers from conversation
              const { data: convData } = await supabase
                .from('conversations')
                .select('nina_context')
                .eq('id', conversation_id)
                .single();
              
              const qualificationAnswers = (convData?.nina_context as any)?.qualification_answers || {};
              const answersCount = Object.keys(qualificationAnswers).filter(k => qualificationAnswers[k]).length;
              console.log(`[Analyze] 📝 Respostas de qualificação: ${answersCount} campos preenchidos`);
              if (answersCount > 0) {
                console.log('[Analyze] Campos:', Object.keys(qualificationAnswers).filter(k => qualificationAnswers[k]).join(', '));
              }
              
              // Format qualification answers for email
              const formatKey = (key: string) => {
                const keyMap: Record<string, string> = {
                  contratacao: 'Tipo de Contratação',
                  tipo_carga: 'Tipo de Carga',
                  estados: 'Estados Atendidos',
                  cnpj: 'CNPJ',
                  empresa: 'Empresa',
                  viagens_mes: 'Viagens/Mês',
                  valor_medio: 'Valor Médio por Carga',
                  maior_valor: 'Maior Valor Transportado',
                  tipo_frota: 'Tipo de Frota',
                  antt: 'ANTT Regularizada',
                  cte: 'Emite CT-e',
                  historico_sinistros: 'Histórico de Sinistros',
                  tipo_plano: 'Tipo de Plano',
                  quantidade_vidas: 'Quantidade de Vidas',
                  idades: 'Idades',
                  cidade_regiao: 'Cidade/Região',
                  operadora_preferida: 'Operadora Preferida',
                  necessidades: 'Necessidades Específicas',
                  condicoes_saude: 'Condições de Saúde',
                  faixa_valor: 'Faixa de Valor'
                };
                return keyMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              };
              
              const qualificationHtml = Object.entries(qualificationAnswers)
                .filter(([_, value]) => value)
                .map(([key, value]) => `<p style="margin: 4px 0;"><strong>${formatKey(key)}:</strong> ${value}</p>`)
                .join('');
              
              // Build email HTML
              const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">🎯 Novo Lead Qualificado!</h1>
                  </div>
                  
                  <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0;">
                    <h2 style="color: #1e293b; margin: 0 0 16px 0; font-size: 18px;">📋 Dados do Lead</h2>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr><td style="padding: 8px 0; color: #64748b;">Nome:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${contactData?.name || 'Não informado'}</td></tr>
                      <tr><td style="padding: 8px 0; color: #64748b;">Telefone:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${contactData?.phone_number || 'Não informado'}</td></tr>
                      <tr><td style="padding: 8px 0; color: #64748b;">Email:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${contactData?.email || 'Não informado'}</td></tr>
                      <tr><td style="padding: 8px 0; color: #64748b;">Empresa:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${contactData?.company || 'Não informado'}</td></tr>
                      <tr><td style="padding: 8px 0; color: #64748b;">CNPJ:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${contactData?.cnpj || 'Não informado'}</td></tr>
                    </table>
                  </div>
                  
                  <div style="background: #ecfdf5; padding: 20px; border: 1px solid #d1fae5; border-top: none;">
                    <h2 style="color: #065f46; margin: 0 0 16px 0; font-size: 18px;">✅ Qualificação</h2>
                    <div style="display: flex; gap: 20px; margin-bottom: 16px;">
                      <div style="background: white; padding: 12px 20px; border-radius: 8px; text-align: center;">
                        <div style="font-size: 28px; font-weight: bold; color: #059669;">${stageResult.confidence}%</div>
                        <div style="font-size: 12px; color: #6b7280;">Score</div>
                      </div>
                      <div style="background: white; padding: 12px 20px; border-radius: 8px; flex: 1;">
                        <div style="font-size: 14px; font-weight: 500; color: #1e293b;">${newStage.title}</div>
                        <div style="font-size: 12px; color: #6b7280;">Estágio Atual</div>
                      </div>
                    </div>
                    ${qualificationHtml ? `
                    <div style="background: white; padding: 16px; border-radius: 8px;">
                      <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">Respostas Coletadas:</h3>
                      ${qualificationHtml}
                    </div>
                    ` : ''}
                  </div>
                  
                  <div style="background: #fef3c7; padding: 16px; border: 1px solid #fcd34d; border-top: none; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                      ⏰ <strong>Ação recomendada:</strong> Entre em contato o mais rápido possível!
                    </p>
                  </div>
                  
                  <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 20px;">
                    Este email foi enviado automaticamente pelo sistema de IA - OrbePet
                  </p>
                </div>
              `;
              
              console.log('[Analyze] 📧 Enviando emails de notificação...');
              
              // Send emails to all recipients
              let emailsSent = 0;
              let emailsFailed = 0;
              
              for (const recipientEmail of recipients) {
                try {
                  console.log(`[Analyze] 📤 Enviando para: ${recipientEmail}...`);
                  const startTime = Date.now();
                  
                  const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-email', {
                    body: {
                      to: recipientEmail,
                      subject: `🎯 Lead Qualificado: ${contactData?.name || contactData?.phone_number || 'Novo Lead'}`,
                      html: emailHtml
                    }
                  });
                  
                  const elapsed = Date.now() - startTime;
                  
                  if (emailError) {
                    console.error(`[Analyze] ❌ Falha ao enviar para ${recipientEmail} (${elapsed}ms):`, emailError);
                    emailsFailed++;
                  } else {
                    console.log(`[Analyze] ✅ Email enviado para ${recipientEmail} (${elapsed}ms)`, emailResult);
                    emailsSent++;
                  }
                } catch (emailError) {
                  console.error(`[Analyze] ❌ Exceção ao enviar para ${recipientEmail}:`, emailError);
                  emailsFailed++;
                }
              }
              
              console.log('='.repeat(60));
              console.log(`[Analyze] 📊 RESUMO DE NOTIFICAÇÕES: ${emailsSent} enviados, ${emailsFailed} falhas`);
              console.log('='.repeat(60));
              
            } catch (notificationError) {
              console.error('[Analyze] ❌ Erro geral no envio de notificações:', notificationError);
              // Don't fail the analysis if email fails
            }
          }
        } else {
          console.error('[Analyze] Error moving deal:', updateError);
        }
      }
    } else if (stageResult && currentDeal) {
      console.log(`[Analyze] Deal NOT moved: same stage or low confidence (${stageResult.confidence}%)`);
    }

    return new Response(JSON.stringify({ 
      updated: true, 
      type: 'full',
      insights,
      stage_result: stageResult,
      deal_moved: dealMoved
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Analyze] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
