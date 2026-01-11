import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para determinar saudação baseada no horário de Brasília
function getGreetingByTime(): string {
  // Horário de Brasília (UTC-3)
  const now = new Date();
  const brasiliaOffset = -3 * 60; // -3 horas em minutos
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utcTime + (brasiliaOffset * 60000));
  
  const hour = brasiliaTime.getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'Bom dia';
  } else if (hour >= 12 && hour < 18) {
    return 'Boa tarde';
  } else {
    return 'Boa noite';
  }
}

// Conhecimento especializado por vertical
const VERTICAL_KNOWLEDGE: Record<string, string> = {
  transporte: `
PRODUTOS DE SEGURO DE TRANSPORTE:
- RCTR-C (Responsabilidade Civil do Transportador Rodoviário de Cargas): Cobre danos à carga durante o transporte
- RC-DC (Responsabilidade Civil Desaparecimento de Carga): Cobre roubo e furto de carga
- RC-V (Responsabilidade Civil Veicular): Cobre danos a terceiros

CONTEXTO DO TRANSPORTADOR:
- O seguro de carga é proteção essencial para operações profissionais de transporte
- Empresas bem estruturadas mantêm suas coberturas em dia para operar com tranquilidade
- O CT-e é o documento usado para vincular a apólice ao transporte
- Uma operação organizada inclui RCTR-C, RC-DC e RC-V para proteção completa

COBERTURAS ACESSÓRIAS RCTR-C:
- Limpeza de Pista
- Avarias (danos físicos à carga)
- Despesas Emergenciais/Salvamento
- Operações de Carga e Descarga
- Cobertura de Frete

COBERTURAS ACESSÓRIAS RC-DC:
- Desaparecimento de Carga
- Roubo em Depósitos
- Despesas Extraordinárias
- Impostos Suspensos e Benefícios Fiscais
- Cobertura de Frete

TOM: Profissional, técnico mas acessível, sem emojis, foco em proteção do patrimônio e tranquilidade operacional.
`,
  frotas: `
PRODUTOS DE SEGURO DE FROTA EMPRESARIAL:
- Seguro de Frota: Proteção completa para todos os veículos da empresa
- Auto Empresarial: Casco (colisão, incêndio, roubo), RCF-V (danos a terceiros), APP (acidentes pessoais)
- Rastreamento e Monitoramento: Integração com sistemas de telemetria
- Assistência 24h: Guincho, socorro mecânico, carro reserva

BENEFÍCIOS DO SEGURO DE FROTA:
- Proteção do patrimônio empresarial (veículos são ativos importantes)
- Desconto por volume (quanto mais veículos, melhor o preço por unidade)
- Cobertura personalizada por tipo de uso (comercial, serviço, carga leve)
- Gestão centralizada de sinistros e renovações
- Continuidade operacional em caso de perda total
- Redução de impacto financeiro em acidentes

CONTEXTO PARA AUTOMOTORES/CONCESSIONÁRIAS/LOCADORAS:
- Concessionárias têm veículos em estoque de alto valor agregado
- Veículos de test-drive e demonstração precisam de cobertura específica
- Transporte de veículos entre unidades ou clientes
- Proteção contra roubo de veículos em pátio (alta concentração de valor)
- Locadoras precisam de cobertura para frota rotativa com alto giro

DIFERENCIAL COMPETITIVO:
- Apólice única para toda a frota (simplifica gestão)
- Renovação centralizada com negociação anual
- Perfil de risco empresarial geralmente melhor que pessoa física

TOM: Profissional, foco em proteção patrimonial, segurança operacional, continuidade do negócio e redução de custos.
`,
  ambos: `
PRODUTOS DE SEGURO - SOLUÇÃO COMPLETA PARA TRANSPORTADORES:

**SEGURO DE TRANSPORTE (RCTR-C/RC-DC/RC-V):**
- Proteção essencial para operações de transporte profissional
- RCTR-C: Cobre danos à carga durante transporte
- RC-DC: Cobre roubo e furto de carga
- RC-V: Cobre danos a terceiros
- Cobertura completa para a operação do dia a dia
- CT-e vinculado à apólice para controle

**SEGURO DE FROTA EMPRESARIAL:**
- Proteção completa para veículos da empresa (cavalos, carretas, caminhões)
- Casco (colisão, incêndio, roubo), RCF-V (danos a terceiros), APP (acidentes pessoais)
- Desconto por volume (economia significativa ao segurar toda a frota)
- Assistência 24h: guincho, socorro mecânico
- Gestão centralizada de sinistros

DIFERENCIAL JACOMETO - SOLUÇÃO COMPLETA:
- Especialista em transportadores = entende todas as necessidades
- Carga protegida + Veículos protegidos = Operação 100% segura
- Economia ao contratar ambos com mesmo corretor (condições especiais)
- Gestão unificada de renovações, sinistros e documentação
- Proteção total da operação em um só lugar
- Único ponto de contato para todas as questões de seguros

ABORDAGEM RECOMENDADA:
- Focar na proteção TOTAL do negócio do transportador
- Enfatizar a simplificação: um corretor para todas as necessidades
- Destacar economia ao centralizar os seguros
- Mencionar a experiência específica com transportadores

TOM: Consultivo, foco em solução completa, economia e simplificação. Profissional sem emojis.
`,
  saude: `
PRODUTOS DE PLANOS DE SAÚDE:
- Planos empresariais (mínimo 2 vidas, vantagens fiscais)
- Planos individuais/familiares
- Planos odontológicos

OPERADORAS PARCEIRAS:
- Unimed, Bradesco Saúde, SulAmérica, Amil, Hapvida, Notre Dame, Porto Saúde

BENEFÍCIOS PARA EMPRESAS:
- Dedução fiscal (lucro real)
- Carência reduzida para grupos
- Coparticipação flexível
- Rede credenciada ampla

DIFERENCIAIS:
- Análise personalizada do perfil
- Comparativo entre operadoras
- Acompanhamento pós-venda
- Gestão de benefícios

TOM: Humanizado, foco em cuidado e bem-estar, empático, profissional.
`,
  prospeccao: `
OBJETIVO: Primeiro contato com leads, despertar interesse, gerar curiosidade

TÉCNICAS DE COLD EMAIL:
- Personalização é essencial (usar nome e empresa)
- Assunto curto e intrigante (máx 50 caracteres)
- Primeira linha captura atenção
- Benefício claro em 2-3 frases
- Call-to-action único e claro
- Senso de urgência sutil (sem pressão)
- PS pode reforçar valor

ESTRUTURA IDEAL:
1. Saudação personalizada
2. Contexto rápido (1 frase)
3. Proposta de valor (1-2 frases)
4. CTA claro
5. Assinatura profissional

TOM: Direto, personalizado, curioso, sem ser invasivo ou agressivo.
`
};

// Tipos de email com instruções específicas
const EMAIL_TYPES: Record<string, string> = {
  'cobranca': `
OBJETIVO: Cobrar parcelas em atraso de forma profissional mas firme

ESTRUTURA:
1. Saudação cordial mas direta (usar a saudação fornecida)
2. Identificar a empresa e mencionar o relacionamento como corretor
3. Informar o valor total em aberto e quantidade de parcelas
4. Mencionar consequências sutis (regularização para manter apólice ativa, evitar cancelamento)
5. Oferecer formas de pagamento e parcelamento se aplicável
6. CTA claro (entrar em contato para regularização, solicitar novo boleto)
7. Tom profissional, sem agressividade, mas com senso de urgência

VARIÁVEIS DISPONÍVEIS:
- {{valor_total}} - Valor total em aberto
- {{qtd_parcelas}} - Quantidade de parcelas
- {{dias_atraso}} - Maior atraso em dias
- {{empresa}} - Nome da empresa

IMPORTANTE:
- Seja cordial mas firme
- Foco em regularização e manutenção do relacionamento
- Mencione que a Jacometo está à disposição para ajudar
- Não seja agressivo ou ameaçador
- Ofereça alternativas (parcelamento, novo boleto, etc.)
`,
  'cold-email': `
OBJETIVO: Primeiro contato frio com lead de prospecção

SEGMENTAÇÃO POR VERTICAL/CNAE:
- Se vertical="transporte": Focar em proteção da carga, segurança operacional, tranquilidade no dia a dia, especialização em transportadores
- Se vertical="frotas": Focar em proteção patrimonial dos veículos, seguro de frota empresarial, economia por volume, gestão centralizada
- Se vertical="ambos": Oferecer SOLUÇÃO COMPLETA - seguro de carga + seguro de frota juntos, economia ao centralizar com mesmo corretor, proteção total da operação
- Se vertical="prospeccao" (genérico): Usar CNAE para identificar melhor abordagem

PERSONALIZAÇÃO GEOGRÁFICA:
- SEMPRE usar cidade/estado do lead para criar proximidade regional
- Mencionar "aqui na região de [cidade]" ou "empresas de [estado]" quando disponível
- Contextualizar riscos locais se relevante (ex: grandes centros = mais roubo, rodovias = mais acidentes)

ESTRUTURA:
1. Saudação dinâmica por horário + nome do lead (usar a saudação fornecida: "Bom dia/Boa tarde/Boa noite [Nome],")
2. Reconhecimento da empresa e localização
3. Gancho relevante baseado na vertical:
   - Transporte: Proteção da operação, segurança da carga, especialização em transportadores
   - Frotas: Proteção do patrimônio, veículos como ativos, economia
3. Proposta de valor em 2-3 frases concisas
4. CTA único e claro (agendar conversa breve de 10-15 min)
5. Tom consultivo, não vendedor
6. Máximo 150 palavras no corpo
`,
  'follow-up': `
OBJETIVO: Reengajar lead que não respondeu
- Referência ao contato anterior
- Novo ângulo ou informação
- Pergunta aberta para retomar diálogo
- Sem cobranças ou pressão
`,
  'proposta': `
OBJETIVO: Apresentar proposta comercial
- Resumo do que foi discutido
- Benefícios principais
- Próximos passos claros
- Disponibilidade para dúvidas
`,
  'boas-vindas': `
OBJETIVO: Onboarding de novo cliente
- Agradecimento caloroso
- O que esperar a partir de agora
- Canais de contato/suporte
- Próximos passos práticos
`,
  'renewal': `
OBJETIVO: Lembrete de renovação
- Valor do relacionamento
- Benefícios de renovar
- Condições especiais (se houver)
- Prazo claro mas sem pressão
`,
  'cotacao': `
OBJETIVO: Envio de valores/proposta
- Resumo da necessidade identificada
- Valores claros e organizados
- Diferenciais inclusos
- Validade da proposta
- CTA para fechamento
`
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vertical, emailType, briefing, leadContext } = await req.json();

    if (!vertical || !emailType) {
      return new Response(
        JSON.stringify({ error: 'vertical e emailType são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const verticalKnowledge = VERTICAL_KNOWLEDGE[vertical] || '';
    const emailTypeInstructions = EMAIL_TYPES[emailType] || '';

    const systemPrompt = `Você é um copywriter especialista em emails B2B para uma corretora de seguros (Jacometo Seguros).

${verticalKnowledge}

${emailTypeInstructions}

REGRAS CRÍTICAS:
1. NUNCA use emojis no corpo do email
2. Use as variáveis disponíveis: {{nome}}, {{empresa}}, {{valor}}, {{email}}, {{telefone}}
3. O HTML deve ser simples e responsivo (max-width: 600px)
4. Parágrafos curtos (máx 3 linhas)
5. Assunto máximo 60 caracteres
6. Tom profissional e brasileiro
7. NÃO inclua assinatura no final - ela será adicionada automaticamente pelo sistema com o nome do operador
8. SEMPRE inicie o email com a saudação do horário fornecida seguida do nome (ex: "Bom dia João," ou "Boa tarde Maria,")

FORMATO DE RESPOSTA (JSON):
{
  "subject": "Assunto do email aqui",
  "body_html": "<div style='...'>HTML do email aqui</div>"
}

IMPORTANTE: Retorne APENAS o JSON, sem markdown, sem explicações.`;

    // Build context-aware user prompt
    let userPrompt = `Gere um email do tipo "${emailType}" para a vertical "${vertical}".`;
    
    if (leadContext) {
      userPrompt += `\n\nDADOS DO LEAD:`;
      if (leadContext.name) userPrompt += `\n- Nome: ${leadContext.name}`;
      if (leadContext.company) userPrompt += `\n- Empresa: ${leadContext.company}`;
      if (leadContext.cnpj) userPrompt += `\n- CNPJ: ${leadContext.cnpj}`;
      if (leadContext.phone) userPrompt += `\n- Telefone: ${leadContext.phone}`;
      if (leadContext.email) userPrompt += `\n- Email: ${leadContext.email}`;
      if (leadContext.cidade) userPrompt += `\n- Cidade: ${leadContext.cidade}`;
      if (leadContext.qualification_score) userPrompt += `\n- Score de qualificação: ${leadContext.qualification_score}%`;
      
      // CNPJ enrichment data
      if (leadContext.cnae) userPrompt += `\n- Atividade (CNAE): ${leadContext.cnae}`;
      if (leadContext.porte) userPrompt += `\n- Porte da empresa: ${leadContext.porte}`;
      if (leadContext.capital_social) userPrompt += `\n- Capital social: ${leadContext.capital_social}`;
      if (leadContext.situacao_cadastral) userPrompt += `\n- Situação cadastral: ${leadContext.situacao_cadastral}`;
      if (leadContext.data_abertura) userPrompt += `\n- Data de abertura: ${leadContext.data_abertura}`;
      
      if (leadContext.qualification_answers && Object.keys(leadContext.qualification_answers).length > 0) {
        userPrompt += `\n\nRESPOSTAS DE QUALIFICAÇÃO:`;
        const qaLabels: Record<string, string> = {
          contratacao: 'Tipo de contratação',
          tipo_carga: 'Tipo de carga',
          estados: 'Estados atendidos',
          viagens_mes: 'Viagens por mês',
          valor_medio: 'Valor médio por carga',
          maior_valor: 'Maior valor transportado',
          tipo_frota: 'Tipo de frota',
          antt: 'ANTT',
          cte: 'CT-e',
        };
        for (const [key, value] of Object.entries(leadContext.qualification_answers)) {
          if (value) {
            const label = qaLabels[key] || key;
            userPrompt += `\n- ${label}: ${value}`;
          }
        }
      }
      
      if (leadContext.interests && leadContext.interests.length > 0) {
        userPrompt += `\n\nINTERESSES: ${leadContext.interests.join(', ')}`;
      }
      
      if (leadContext.pain_points && leadContext.pain_points.length > 0) {
        userPrompt += `\n\nDORES IDENTIFICADAS: ${leadContext.pain_points.join(', ')}`;
      }
      
      if (leadContext.conversation_summary) {
        userPrompt += `\n\nRESUMO DA CONVERSA:\n${leadContext.conversation_summary}`;
      }
      
      // Contexto de cobrança
      if (leadContext.collectionContext) {
        userPrompt += `\n\nCONTEXTO DE COBRANÇA:`;
        userPrompt += `\n- Valor total em aberto: R$ ${leadContext.collectionContext.totalOverdue?.toFixed(2) || '0.00'}`;
        userPrompt += `\n- Quantidade de parcelas/apólices: ${leadContext.collectionContext.installmentsCount || 0}`;
        userPrompt += `\n- Maior atraso: ${leadContext.collectionContext.maxDaysOverdue || 0} dias`;
        userPrompt += `\n- Empresa: ${leadContext.collectionContext.companyName || 'Não informada'}`;
        userPrompt += `\n\nUse as variáveis: {{valor_total}}, {{qtd_parcelas}}, {{dias_atraso}}, {{empresa}}`;
      }
    }
    
    if (briefing) {
      userPrompt += `\n\nBRIEFING ADICIONAL:\n${briefing}`;
    }
    
    // Adicionar saudação dinâmica por horário
    const saudacao = getGreetingByTime();
    userPrompt += `\n\nSAUDAÇÃO DO HORÁRIO: "${saudacao}" - Use esta saudação para iniciar o email (ex: "${saudacao} João,")`;
    
    userPrompt += `\n\nGere um email ALTAMENTE PERSONALIZADO usando os dados acima. Mencione informações específicas do lead para criar conexão.`;

    console.log(`Gerando email: vertical=${vertical}, tipo=${emailType}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('Resposta da IA:', content.substring(0, 200));

    // Parse do JSON da resposta
    let result;
    try {
      // Remove possíveis backticks de markdown
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Erro ao parsear resposta:', parseError);
      // Fallback: tenta extrair subject e body_html manualmente
      const subjectMatch = content.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = content.match(/"body_html"\s*:\s*"([\s\S]*?)"\s*}/);
      
      if (subjectMatch && bodyMatch) {
        result = {
          subject: subjectMatch[1],
          body_html: bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
        };
      } else {
        throw new Error('Não foi possível parsear a resposta da IA');
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro no generate-email-copy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar email';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
