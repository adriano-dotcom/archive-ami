import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcription, callDate, contactName } = await req.json();

    if (!transcription) {
      return new Response(
        JSON.stringify({ error: 'Transcrição é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const formattedDate = callDate 
      ? new Date(callDate).toLocaleString('pt-BR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : new Date().toLocaleString('pt-BR');

    const systemPrompt = `Você é um especialista em vendas B2B de seguros de transporte/carga. Analise a transcrição da ligação e gere um resumo estruturado.

FORMATO OBRIGATÓRIO:

📞 RESUMO DA LIGAÇÃO (${formattedDate})
${contactName ? `Cliente: ${contactName}` : ''}

🎯 ASSUNTOS DISCUTIDOS
[Liste os principais tópicos abordados na ligação - máximo 3-4 itens]

📋 INFORMAÇÕES COLETADAS
[Dados mencionados: CNPJ, tipo de carga, região de atuação, valor de mercadoria, etc. - se nenhum, escreva "Nenhuma informação nova coletada"]

⏭️ PRÓXIMOS PASSOS
[Ações acordadas ou pendências identificadas - se nenhum, escreva "Nenhum acordo específico"]

💡 OBSERVAÇÕES
[Tom da conversa, objeções mencionadas, nível de interesse, pontos de atenção - máximo 2 linhas]

REGRAS:
- Seja conciso e direto
- Não invente informações - baseie-se apenas na transcrição
- Use bullet points quando houver múltiplos itens
- Mantenha o tom profissional`;

    console.log('[summarize-transcription] Calling AI Gateway...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Transcrição da ligação:\n\n${transcription}` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[summarize-transcription] AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit excedido, tente novamente em alguns segundos' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || '';

    console.log('[summarize-transcription] Summary generated, length:', summary.length);

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[summarize-transcription] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao gerar resumo' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
