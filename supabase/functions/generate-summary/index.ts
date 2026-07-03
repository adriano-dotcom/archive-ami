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
    const { messages, callTranscriptions, contactName, agentName } = await req.json();

    const hasMessages = messages && messages.length > 0;
    const hasCalls = callTranscriptions && callTranscriptions.length > 0;

    if (!hasMessages && !hasCalls) {
      return new Response(
        JSON.stringify({ error: 'No messages or calls provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Format messages for context
    let conversationText = '';
    
    if (hasMessages) {
      conversationText += '📱 CONVERSA WHATSAPP:\n';
      conversationText += messages.map((m: any) => {
        const sender = m.from_type === 'user' ? contactName : (m.from_type === 'nina' ? agentName : 'Operador');
        return `${sender}: ${m.content || '[mídia]'}`;
      }).join('\n');
    }

    if (hasCalls) {
      if (hasMessages) conversationText += '\n\n';
      conversationText += '📞 LIGAÇÕES TELEFÔNICAS:\n';
      conversationText += callTranscriptions.map((call: any) => {
        const date = new Date(call.started_at).toLocaleString('pt-BR');
        const duration = call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : 'N/A';
        const status = call.status === 'completed' ? 'Concluída' : 
                      call.status === 'no_answer' ? 'Não atendeu' : 
                      call.status === 'busy' ? 'Ocupado' : call.status;
        return `[${date} | ${status} | Duração: ${duration}]\n${call.transcription}`;
      }).join('\n\n');
    }

    const systemPrompt = `Você é um especialista em análise de conversas de vendas B2B. Analise TODA a comunicação (WhatsApp e ligações telefônicas) e gere um resumo conciso e estruturado.

Formato do resumo (use exatamente estes cabeçalhos):

📌 SITUAÇÃO
[Contexto geral: quem é o lead, como chegou, qual interesse inicial]

🎯 NECESSIDADES
[O que o cliente busca/precisa, problemas que quer resolver]

📋 DADOS COLETADOS
[Informações obtidas: CNPJ, tipo de carga, estados, valores, ANTT, CT-e, etc.]

📞 INFORMAÇÕES DAS LIGAÇÕES
[Resumo do que foi discutido nas ligações, tom do cliente, compromissos verbais]

⏭️ PRÓXIMOS PASSOS
[O que precisa ser feito: cotação, documentos, contato, etc.]

💡 OBSERVAÇÕES
[Detalhes relevantes, objeções, pontos de atenção]

Regras:
- Seja conciso, máximo 200 palavras total
- Use bullet points quando apropriado
- Foque em informações acionáveis
- Omita seções sem informação relevante (exceto se tiver ligações, sempre inclua 📞)
- Mantenha tom profissional
- Integre informações de AMBOS os canais (WhatsApp e ligações) em cada seção relevante`;

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
          { role: 'user', content: `Analise esta comunicação completa e gere o resumo:\n\n${conversationText}` }
        ],
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('No summary generated');
    }

    console.log('Summary generated successfully for contact:', contactName, '- Messages:', messages?.length || 0, '- Calls:', callTranscriptions?.length || 0);

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-summary:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate summary';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
