import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
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


  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    console.log("🧪 Iniciando teste de email de qualificação...");

    // 1. Buscar deal em "Qualificação IA - Transporte"
    const qualificacaoStageId = '8133ea67-2542-4257-a3dd-0eef404c90d1';
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select('id, title, contact_id, owner_id, stage_id, pipeline_id, value')
      .eq('stage_id', qualificacaoStageId)
      .limit(1)
      .maybeSingle();

    if (dealError) {
      console.error("Erro ao buscar deal:", dealError);
      throw new Error(`Erro ao buscar deal: ${dealError.message}`);
    }

    if (!deal) {
      return new Response(JSON.stringify({ 
        error: 'Nenhum deal encontrado em Qualificação IA - Transporte',
        hint: 'Mova um deal para o estágio "Qualificação IA" primeiro'
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`📋 Deal encontrado: ${deal.title} (${deal.id})`);

    // 2. Buscar dados do contato
    const { data: contact } = await supabase
      .from('contacts')
      .select('name, phone_number, email, company, cnpj, call_name')
      .eq('id', deal.contact_id)
      .maybeSingle();

    console.log(`👤 Contato: ${contact?.name || contact?.phone_number}`);

    // 3. Buscar conversação e qualification_answers
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, nina_context')
      .eq('contact_id', deal.contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 4. Novo estágio: Qualificado pela IA
    const newStageId = '241c7066-cd47-451f-8b57-9b4434b90715';
    const newStageTitle = 'Qualificado pela IA';
    const simulatedScore = 85;

    // 5. Mover deal para novo estágio
    const { error: updateError } = await supabase
      .from('deals')
      .update({ stage_id: newStageId, stage: newStageTitle })
      .eq('id', deal.id);

    if (updateError) {
      console.error("Erro ao mover deal:", updateError);
      throw new Error(`Erro ao mover deal: ${updateError.message}`);
    }

    console.log(`✅ Deal movido para: ${newStageTitle}`);

    // 6. Montar lista de destinatários
    const recipients: string[] = [];
    
    if (deal.owner_id) {
      const { data: owner } = await supabase
        .from('team_members')
        .select('email')
        .eq('id', deal.owner_id)
        .maybeSingle();
      
      if (owner?.email && !recipients.includes(owner.email)) {
        recipients.push(owner.email);
      }
    }

    console.log(`📧 Destinatários: ${recipients.join(', ')}`);

    // 7. Qualification answers (real ou mock)
    const ninaContext = conversation?.nina_context as Record<string, any> || {};
    const qualificationAnswers = ninaContext.qualification_answers || {
      contratacao: 'Direto',
      tipo_carga: 'Alimentos refrigerados',
      estados: 'PR, SC, RS, SP',
      viagens_mes: '20',
      valor_medio: 'R$ 80.000',
      maior_valor: 'R$ 150.000',
      tipo_frota: 'Própria (5 caminhões)',
      antt: 'Sim, regularizada',
      cte: 'Sim, emite normalmente',
      historico_sinistros: 'Nenhum nos últimos 2 anos'
    };

    // 8. Construir email HTML
    const contactName = contact?.name || contact?.call_name || contact?.phone_number || 'Lead';
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .header .score { font-size: 48px; font-weight: bold; margin: 10px 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .section { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
    .section h2 { color: #059669; margin-top: 0; font-size: 18px; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
    .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .info-label { font-weight: 600; color: #6b7280; min-width: 140px; }
    .info-value { color: #111827; }
    .badge { display: inline-block; background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    .cta-button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 Lead Qualificado!</h1>
      <div class="score">${simulatedScore}%</div>
      <span class="badge">${newStageTitle}</span>
    </div>
    
    <div class="content">
      <div class="section">
        <h2>👤 Dados do Lead</h2>
        <div class="info-row">
          <span class="info-label">Nome:</span>
          <span class="info-value">${contactName}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Telefone:</span>
          <span class="info-value">${contact?.phone_number || 'N/A'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">${contact?.email || 'Não informado'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Empresa:</span>
          <span class="info-value">${contact?.company || 'Não informada'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">CNPJ:</span>
          <span class="info-value">${contact?.cnpj || 'Não informado'}</span>
        </div>
      </div>
      
      <div class="section">
        <h2>📋 Respostas de Qualificação</h2>
        ${Object.entries(qualificationAnswers).map(([key, value]) => `
        <div class="info-row">
          <span class="info-label">${formatQuestionLabel(key)}:</span>
          <span class="info-value">${value}</span>
        </div>
        `).join('')}
      </div>
      
      <div class="section">
        <h2>📊 Informações do Deal</h2>
        <div class="info-row">
          <span class="info-label">Título:</span>
          <span class="info-value">${deal.title}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Valor:</span>
          <span class="info-value">${deal.value ? `R$ ${Number(deal.value).toLocaleString('pt-BR')}` : 'A definir'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Pipeline:</span>
          <span class="info-value">Transporte</span>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 20px;">
        <p><strong>⚡ Este lead está pronto para contato!</strong></p>
      </div>
    </div>
    
    <div class="footer">
      <p>Este é um email de teste do sistema de qualificação automática.</p>
      <p>OrbePet CRM</p>
    </div>
  </div>
</body>
</html>
    `;

    // 9. Enviar emails
    const emailResults = [];
    for (const email of recipients) {
      console.log(`📤 Enviando email para: ${email}`);
      
      const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: `🎯 [TESTE] Lead Qualificado: ${contactName} - Score ${simulatedScore}%`,
          html: emailHtml
        }
      });

      if (emailError) {
        console.error(`❌ Erro ao enviar para ${email}:`, emailError);
        emailResults.push({ email, success: false, error: emailError.message });
      } else {
        console.log(`✅ Email enviado para ${email}`);
        emailResults.push({ email, success: true, result: emailResult });
      }
    }

    // 10. Retornar resultado
    const response = {
      success: true,
      test_type: 'qualification_email',
      deal_moved: { 
        id: deal.id, 
        title: deal.title, 
        from_stage: 'Qualificação IA',
        to_stage: newStageTitle 
      },
      contact: {
        name: contactName,
        phone: contact?.phone_number,
        email: contact?.email,
        company: contact?.company,
        cnpj: contact?.cnpj
      },
      qualification: {
        score: simulatedScore,
        answers: qualificationAnswers,
        source: ninaContext.qualification_answers ? 'real' : 'mock'
      },
      recipients,
      email_results: emailResults
    };

    console.log("🎉 Teste concluído com sucesso!");
    
    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("❌ Erro no teste:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

function formatQuestionLabel(key: string): string {
  const labels: Record<string, string> = {
    contratacao: 'Contratação',
    tipo_carga: 'Tipo de Carga',
    estados: 'Estados Atendidos',
    viagens_mes: 'Viagens/Mês',
    valor_medio: 'Valor Médio',
    maior_valor: 'Maior Valor',
    tipo_frota: 'Tipo de Frota',
    antt: 'ANTT',
    cte: 'CT-e',
    historico_sinistros: 'Histórico de Sinistros',
    cnpj: 'CNPJ',
    empresa: 'Empresa'
  };
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
