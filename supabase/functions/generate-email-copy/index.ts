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

// Tipos de email com instruções específicas - agora com HTML profissional
const EMAIL_TYPES: Record<string, string> = {
  'cobranca': `
OBJETIVO: Cobrar parcelas em atraso de forma profissional mas firme

ESTRUTURA HTML OBRIGATÓRIA:
1. Container com max-width: 600px, centralizado, fundo branco
2. Header azul marinho (#1e3a5f) com logo/nome da empresa
3. Saudação cordial usando {{nome}}
4. Se tiver {{empresa}} e {{cnpj}}, referenciar
5. TABELA ESTILIZADA de parcelas se houver detalhes (fundo alternado, bordas arredondadas)
6. Box de DESTAQUE para valor total (fundo azul claro #dbeafe, borda azul #3b82f6)
7. Texto sobre regularização
8. Botão CTA estilizado (fundo #1e3a5f, texto branco, border-radius: 8px)
9. Footer com assinatura: Jacometo Seguros - Equipe de Cobrança

VARIÁVEIS DISPONÍVEIS:
- {{nome}}, {{empresa}}, {{cnpj}}, {{valor_total}}, {{qtd_parcelas}}, {{dias_atraso}}

IMPORTANTE:
- Seja cordial mas firme
- Foco em regularização e manutenção do relacionamento
- Mencione que a Jacometo está à disposição para ajudar
`,
  'cobranca-leve': `
OBJETIVO: Primeiro contato amigável sobre parcelas em atraso

TOM: Amigável, acolhedor, oferecendo ajuda

ESTRUTURA HTML OBRIGATÓRIA:
1. Container centralizado (max-width: 600px) com font-family: Arial, sans-serif
2. Header com background #1e3a5f, padding 24px, texto branco "Jacometo Seguros"
3. Corpo com padding 32px, background branco
4. Saudação personalizada: "{{saudacao}} {{nome}}," em negrito
5. Referência à empresa: "Referente à empresa {{empresa}}" + CNPJ se disponível
6. Se houver parcelas: TABELA HTML ESTILIZADA com:
   - Header da tabela: background #f1f5f9, texto #475569
   - Colunas: Seguradora | Parcela | Valor | Vencimento | Atraso
   - Linhas alternadas: #ffffff e #f8fafc
   - Bordas suaves, border-radius: 8px no container
7. Box de VALOR TOTAL com:
   - background: #dbeafe (azul claro)
   - border-left: 4px solid #3b82f6
   - padding: 16px
   - Texto grande e bold para o valor
8. Parágrafo com tom acolhedor oferecendo ajuda
9. Botão CTA: background #1e3a5f, color white, padding 14px 28px, border-radius 8px
10. Footer: background #f3f4f6, texto #6b7280, font-size 12px

IMPORTANTE: Gere HTML COMPLETO e INLINE STYLES (não use classes CSS).
`,
  'cobranca-moderada': `
OBJETIVO: Lembrete profissional, reforço de contato

TOM: Profissional, direto mas cordial

ESTRUTURA HTML OBRIGATÓRIA:
1. Container centralizado (max-width: 600px) com font-family: Arial, sans-serif
2. Header com background #1e3a5f, texto branco "Jacometo Seguros"
3. Corpo com padding 32px
4. Saudação + referência ao contato anterior
5. TABELA DE PARCELAS ESTILIZADA:
   - Header: background #fef3c7 (amarelo claro) para indicar alerta
   - Colunas destacando dias de atraso
   - Valores em negrito
6. Box de VALOR TOTAL com:
   - border: 2px solid #f59e0b (laranja)
   - background: #fffbeb
   - Ícone de alerta (pode usar emoji ⚠️ no texto)
7. Parágrafo sobre importância de manter apólice ativa
8. Botão CTA laranja: background #f59e0b, color white
9. Footer com Equipe de Cobrança

TOM: Mais assertivo que o leve, mencionar que é segundo contato.
`,
  'cobranca-firme': `
OBJETIVO: Tom assertivo, criar senso de urgência

TOM: Firme, profissional, com urgência clara

ESTRUTURA HTML OBRIGATÓRIA:
1. Container com BORDA VERMELHA no topo (border-top: 4px solid #dc2626)
2. Header com background #dc2626 (vermelho), texto branco
3. Badge/texto "URGENTE" ou "ATENÇÃO IMEDIATA" no início
4. TABELA DE PARCELAS com:
   - Header vermelho (#fecaca) para destaque
   - Valores em atraso crítico em vermelho (#dc2626)
   - Dias de atraso em BOLD e vermelho se > 30
5. Box de VALOR TOTAL com:
   - background: #fef2f2 (rosa claro)
   - border: 2px solid #dc2626
   - Texto do valor em vermelho e grande
6. Parágrafo sobre CONSEQUÊNCIAS:
   - Suspensão de cobertura
   - Risco de cancelamento
   - Perda de proteção
7. Botão CTA URGENTE: background #dc2626, texto "REGULARIZAR AGORA"
8. Footer sério: Departamento de Cobrança

IMPORTANTE: Criar senso real de urgência sem ser agressivo.
`,
  'cobranca-negociacao': `
OBJETIVO: Oferecer alternativas de pagamento

TOM: Empático, solução-orientado

ESTRUTURA HTML OBRIGATÓRIA:
1. Container com visual amigável (borda verde #10b981 no topo)
2. Header azul padrão
3. Saudação empática reconhecendo possíveis dificuldades
4. TABELA DE PARCELAS padrão
5. Box de VALOR TOTAL neutro
6. SEÇÃO DESTACADA de opções:
   - Background #ecfdf5 (verde claro)
   - Título "Opções de Negociação"
   - Lista de alternativas:
     * Parcelamento do débito
     * Desconto para pagamento à vista
     * Renegociação de datas
7. Botão CTA verde: "AGENDAR CONVERSA" ou "SOLICITAR NEGOCIAÇÃO"
8. Mensagem de que equipe está disponível para encontrar solução

TOM: Mostrar que entendemos dificuldades e queremos ajudar.
`,
  'cobranca-aviso-final': `
OBJETIVO: Último aviso antes de ações mais severas

TOM: Sério, formal, definitivo

ESTRUTURA HTML OBRIGATÓRIA:
1. Container com BORDA GROSSA VERMELHA (border: 3px solid #dc2626)
2. BANNER no topo: background #dc2626, texto branco grande "⚠️ AVISO FINAL"
3. Saudação formal
4. Texto explicando que é ÚLTIMA comunicação antes de medidas
5. TABELA COMPLETA de todas as parcelas em atraso
6. Box VERMELHO com valor total e prazo final
7. SEÇÃO de consequências em lista:
   - Cancelamento definitivo da apólice
   - Possível negativação
   - Perda total de cobertura
8. PRAZO FINAL em destaque (data específica se possível)
9. Botão CTA final: "REGULARIZAR ATÉ [DATA]"
10. Footer formal: Departamento Jurídico/Cobrança

IMPORTANTE: Tom definitivo, última chance real.
`,
  'cold-email': `
OBJETIVO: Primeiro contato frio com lead de prospecção

ESTRUTURA HTML PROFISSIONAL:
1. Container limpo max-width: 600px
2. Header discreto azul
3. Personalização com nome e empresa
4. Proposta de valor em 2-3 parágrafos curtos
5. CTA para agendar conversa
6. Footer com dados de contato

TOM: Consultivo, não vendedor, criar curiosidade.
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

    // Detectar se é email de cobrança para usar HTML elaborado
    const isCollectionEmail = emailType.startsWith('cobranca');
    
    const htmlBaseTemplate = isCollectionEmail ? `
ESTRUTURA HTML BASE (USE ESTE TEMPLATE):
<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#ffffff;">
  <!-- HEADER -->
  <div style="background:#1e3a5f;padding:24px;text-align:center;">
     <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">OrbePet</span>
   </div>
  
  <!-- CORPO -->
  <div style="padding:32px;background:#ffffff;">
    <!-- Saudação -->
    <p style="font-size:16px;color:#1e293b;margin-bottom:24px;">
      <strong>{{saudacao}} {{nome}},</strong>
    </p>
    
    <!-- Referência empresa -->
    <p style="font-size:14px;color:#475569;margin-bottom:8px;">
      Referente à empresa <strong>{{empresa}}</strong>
    </p>
    <p style="font-size:13px;color:#64748b;margin-bottom:24px;">
      CNPJ: {{cnpj}}
    </p>
    
    <!-- TABELA DE PARCELAS (se houver) -->
    <div style="margin:24px 0;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:12px;text-align:left;font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;">Seguradora</th>
            <th style="padding:12px;text-align:center;font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;">Parcela</th>
            <th style="padding:12px;text-align:right;font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;">Valor</th>
            <th style="padding:12px;text-align:center;font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;">Vencimento</th>
            <th style="padding:12px;text-align:center;font-size:12px;color:#475569;font-weight:600;text-transform:uppercase;">Atraso</th>
          </tr>
        </thead>
        <tbody>
          <!-- Linhas alternadas: background #ffffff e #f8fafc -->
          <tr style="background:#ffffff;">
            <td style="padding:12px;font-size:14px;color:#1e293b;">Seguradora</td>
            <td style="padding:12px;text-align:center;font-size:14px;color:#1e293b;">X/Y</td>
            <td style="padding:12px;text-align:right;font-size:14px;color:#1e293b;font-weight:600;">R$ 0,00</td>
            <td style="padding:12px;text-align:center;font-size:14px;color:#1e293b;">DD/MM/AA</td>
            <td style="padding:12px;text-align:center;font-size:14px;color:#dc2626;font-weight:600;">X dias</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- BOX VALOR TOTAL -->
    <div style="margin:24px 0;padding:20px;background:#dbeafe;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-size:13px;color:#1e40af;text-transform:uppercase;font-weight:600;margin-bottom:4px;">Valor Total em Aberto</p>
      <p style="margin:0;font-size:28px;color:#1e3a8a;font-weight:bold;">R$ {{valor_total}}</p>
      <p style="margin:0;font-size:12px;color:#3b82f6;margin-top:4px;">{{qtd_parcelas}} parcela(s) • Maior atraso: {{dias_atraso}} dias</p>
    </div>
    
    <!-- Texto -->
    <p style="font-size:15px;color:#334155;line-height:1.7;margin-bottom:24px;">
      [TEXTO DO EMAIL AQUI]
    </p>
    
    <!-- BOTÃO CTA -->
    <div style="text-align:center;margin:32px 0;">
      <a href="#" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
        Regularizar Agora
      </a>
    </div>
  </div>
  
  <!-- FOOTER -->
  <div style="background:#f3f4f6;padding:20px;text-align:center;">
    <p style="margin:0;font-size:13px;color:#374151;">Atenciosamente,</p>
    <p style="margin:4px 0 0 0;font-size:14px;color:#1e3a5f;font-weight:600;">João Pedro</p>
    <p style="margin:4px 0 0 0;font-size:12px;color:#374151;">
      WhatsApp: <a href="https://wa.me/5543991562099" style="color:#25d366;text-decoration:none;">+55 43 99156-2099</a>
    </p>
    <p style="margin:12px 0 0 0;font-size:12px;color:#6b7280;">OrbePet - Equipe de Cobrança</p>
    <p style="margin:4px 0 0 0;font-size:11px;color:#9ca3af;">À disposição para esclarecimento</p>
  </div>
</div>
` : '';
    
    const systemPrompt = `Você é um copywriter especialista em emails B2B para a OrbePet (planos de saúde pet).

${verticalKnowledge}

${emailTypeInstructions}

${htmlBaseTemplate}

REGRAS CRÍTICAS:
1. NUNCA use emojis no corpo do email (exceto em badges de urgência quando apropriado)
2. Use as variáveis disponíveis: {{nome}}, {{empresa}}, {{cnpj}}, {{valor_total}}, {{qtd_parcelas}}, {{dias_atraso}}
3. ${isCollectionEmail ? 'Gere HTML PROFISSIONAL E RESPONSIVO usando a estrutura base fornecida. Use INLINE STYLES (não classes CSS).' : 'O HTML deve ser simples e responsivo (max-width: 600px)'}
4. Parágrafos curtos (máx 3 linhas)
5. Assunto máximo 60 caracteres
6. Tom profissional e brasileiro
7. NÃO inclua assinatura pessoal no final - use apenas o footer corporativo
8. SEMPRE inicie o email com a saudação do horário fornecida seguida do nome

${isCollectionEmail ? `
PARA EMAILS DE COBRANÇA:
- Use a estrutura HTML base fornecida
- Se tiver detalhes de parcelas, CRIE A TABELA com os dados reais
- Ajuste as cores conforme o tom (leve=azul, moderado=laranja, firme/final=vermelho)
- O BOX de valor total é OBRIGATÓRIO
- O BOTÃO CTA é OBRIGATÓRIO
- CORES: azul=#1e3a5f, vermelho=#dc2626, laranja=#f59e0b, verde=#10b981
` : ''}

FORMATO DE RESPOSTA (JSON):
{
  "subject": "Assunto do email aqui",
  "body_html": "<div style='...'>HTML COMPLETO do email aqui</div>"
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
      
      // Contexto de cobrança - enriquecido com detalhes de parcelas
      if (leadContext.collectionContext) {
        const cc = leadContext.collectionContext;
        userPrompt += `\n\n=== CONTEXTO DE COBRANÇA ===`;
        userPrompt += `\n- Empresa: ${cc.companyName || leadContext.company || 'Não informada'}`;
        userPrompt += `\n- CNPJ: ${cc.cnpj || leadContext.cnpj || 'Não informado'}`;
        userPrompt += `\n- Valor total em aberto: R$ ${cc.totalOverdue?.toFixed(2) || '0.00'}`;
        userPrompt += `\n- Quantidade de parcelas: ${cc.installmentsCount || 0}`;
        userPrompt += `\n- Maior atraso: ${cc.maxDaysOverdue || 0} dias`;
        
        // Se tiver detalhes de parcelas individuais, inclui para gerar tabela
        if (cc.installmentDetails && Array.isArray(cc.installmentDetails) && cc.installmentDetails.length > 0) {
          userPrompt += `\n\nDETALHES DAS PARCELAS (use para criar a TABELA):`;
          cc.installmentDetails.forEach((inst: any, idx: number) => {
            userPrompt += `\n${idx + 1}. Seguradora: ${inst.insurer || 'N/A'} | Parcela: ${inst.number || 'N/A'} | Valor: R$ ${inst.value?.toFixed(2) || '0.00'} | Vencimento: ${inst.dueDate || 'N/A'} | Atraso: ${inst.daysOverdue || 0} dias`;
          });
          userPrompt += `\n\nCRIE UMA TABELA HTML BONITA com esses dados de parcelas!`;
        }
        
        userPrompt += `\n\nVARIÁVEIS A USAR: {{valor_total}}=${cc.totalOverdue?.toFixed(2)}, {{qtd_parcelas}}=${cc.installmentsCount}, {{dias_atraso}}=${cc.maxDaysOverdue}, {{empresa}}=${cc.companyName || leadContext.company}`;
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
