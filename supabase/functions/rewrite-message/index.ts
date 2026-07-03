import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ToneType = 'friendly' | 'professional' | 'sympathetic' | 'clearer';

const tonePrompts: Record<ToneType, string> = {
  friendly: 'caloroso, empático e acolhedor. Use linguagem mais suave e demonstre interesse genuíno.',
  professional: 'corporativo, objetivo e formal. Mantenha clareza e respeito sem ser frio.',
  sympathetic: 'simpático e cordial. Adicione gentileza e mostre disposição em ajudar.',
  clearer: 'claro, objetivo e fácil de entender. Simplifique a linguagem e organize melhor as ideias.'
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
    const { originalMessage, tone, context } = await req.json();

    if (!originalMessage || !tone) {
      return new Response(
        JSON.stringify({ error: 'originalMessage and tone are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const toneInstruction = tonePrompts[tone as ToneType] || tonePrompts.professional;
    const contactName = context?.contactName || 'Cliente';
    const lastMessages = context?.lastMessages || [];

    const contextStr = lastMessages.length > 0 
      ? `\n\nÚltimas mensagens da conversa:\n${lastMessages.join('\n')}`
      : '';

    const systemPrompt = `Você é um especialista em comunicação empresarial para uma corretora de seguros.
Sua tarefa é reescrever mensagens ajustando o tom conforme solicitado.

REGRAS OBRIGATÓRIAS:
- Mantenha o conteúdo e as informações originais
- NÃO invente informações novas
- Mantenha a mensagem curta (máximo 2-3 linhas)
- NÃO use emojis (padrão da empresa)
- Use linguagem profissional
- Considere o contexto da conversa
- Responda APENAS com a mensagem reescrita, sem explicações`;

    const userPrompt = `Reescreva a mensagem abaixo para ser ${toneInstruction}

Nome do lead: ${contactName}${contextStr}

MENSAGEM ORIGINAL:
${originalMessage}

MENSAGEM REESCRITA:`;

    console.log(`[RewriteMessage] Rewriting with tone: ${tone}`);
    console.log(`[RewriteMessage] Original: ${originalMessage}`);

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
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[RewriteMessage] AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const rewrittenMessage = data.choices?.[0]?.message?.content?.trim();

    if (!rewrittenMessage) {
      throw new Error('Empty response from AI');
    }

    console.log(`[RewriteMessage] Rewritten: ${rewrittenMessage}`);

    return new Response(
      JSON.stringify({ rewrittenMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[RewriteMessage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
