import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripEmojis } from '../_shared/text-sanitize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateMessageRequest {
  contact_name: string;
  contact_company?: string;
  agent_name?: string;
  agent_specialty?: string;
  agent_slug?: string;
  prompt_type: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call' | 'schedule_call_transportador' | 'unanswered_question';
  hours_waiting?: number;
  attempt_number: number;
  conversation_context?: string;
  pending_question?: string | null;
  last_message_sent?: string; // NEW: Anti-repetition
}

const PROMPT_TEMPLATES: Record<string, string> = {
  unanswered_question: `Retome EXATAMENTE a pergunta pendente, de forma mais simples ou com opções prontas — NÃO troque por outra pergunta.`,
  qualification: `Você precisa descobrir mais sobre as necessidades do cliente. 
Faça UMA pergunta aberta e natural para entender melhor:
- Qual problema/dor ele está tentando resolver
- O que motivou ele a procurar sua solução
Exemplo de estrutura: "Entendi! E me conta, [pergunta sobre necessidade específica]?"`,

  urgency: `Você precisa entender a urgência do cliente.
Faça UMA pergunta natural para descobrir:
- Quando ele precisa resolver isso
- Se há algum prazo ou evento que exige pressa
Exemplo de estrutura: "E pra quando você precisaria resolver isso?"`,

  budget: `Você precisa entender a disponibilidade de investimento.
Faça UMA pergunta indireta e natural sobre orçamento:
- Sem parecer invasivo ou comercial demais
- Focando no valor/investimento esperado
Exemplo de estrutura: "Você já tem uma ideia de quanto pretende investir nisso?"`,

  decision: `Você precisa entender o processo de decisão.
Faça UMA pergunta natural para descobrir:
- Quem mais participa da decisão
- Se ele é o decisor final
Exemplo de estrutura: "Além de você, mais alguém vai participar dessa decisão?"`,

  soft_reengagement: `O cliente não respondeu há algum tempo.
Envie uma mensagem leve e amigável para retomar:
- Sem ser insistente
- Oferecendo ajuda genuína
- Deixando a porta aberta
VARIE a abordagem: pergunte sobre dúvidas, ofereça ajuda específica, ou mencione disponibilidade.`,

  last_chance: `Encerre o contato sem pressionar e sem fazer nova pergunta.
Use um fechamento como: "Vou deixar por aqui pra não te incomodar. Se precisar, é só chamar neste número."`,

  schedule_call: `O cliente não respondeu à primeira mensagem.
Sua missão é perguntar qual o melhor horário para uma conversa.
Seja direto e natural, ofereça opções flexíveis:
- Pergunte se prefere manhã, tarde ou noite
- Ou deixe ele escolher o melhor momento
- Seja breve e objetivo`,

  schedule_call_transportador: `O cliente é um transportador ocupado. Ofereça telefone sem prometer prazo nem ligação imediata.
Exemplo: "Se for mais fácil por telefone, o corretor te liga. Qual o melhor horário?"
Seja direto, respeite o tempo dele e nunca peça e-mail.`,
};

// Varied fallback messages to never repeat the same one
const FALLBACK_MESSAGES = [
  "Ficou alguma dúvida? Posso te ajudar por aqui.",
  "Se ainda precisar regularizar o RNTRC, me chama aqui.",
  "Quer que eu retome de onde paramos?",
  "Se travou em alguma etapa, me fala que eu ajudo.",
];

// Get a fallback message that's different from the last one
function getVariedFallback(contactName: string, lastMessage?: string): string {
  const name = contactName || 'Cliente';
  const candidates = FALLBACK_MESSAGES.map(message => message.replace('{nome}', name))
    .filter(message => message !== lastMessage);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function resolvePromptType(promptType: GenerateMessageRequest['prompt_type'], pendingQuestion?: string | null): GenerateMessageRequest['prompt_type'] {
  return pendingQuestion?.trim() && promptType !== 'last_chance' ? 'unanswered_question' : promptType;
}

if (typeof Deno.test === 'function') {
  Deno.test('pergunta pendente prevalece em todos os tipos exceto last_chance', () => {
    const types: GenerateMessageRequest['prompt_type'][] = ['qualification', 'urgency', 'budget', 'decision', 'soft_reengagement', 'schedule_call', 'schedule_call_transportador', 'unanswered_question'];
    for (const type of types) {
      if (resolvePromptType(type, 'Você emite CT-e?') !== 'unanswered_question') throw new Error(type);
    }
    if (resolvePromptType('last_chance', 'Você emite CT-e?') !== 'last_chance') throw new Error('last_chance');
    if (resolvePromptType('budget', null) !== 'budget') throw new Error('sem pergunta');
  });
  Deno.test('fallback não repete a última mensagem', () => {
    for (const lastMessage of FALLBACK_MESSAGES) {
      if (getVariedFallback('Cliente', lastMessage) === lastMessage) throw new Error('Fallback repetido');
    }
  });
}

// Check if two messages are too similar
function messagesTooSimilar(msg1: string, msg2: string): boolean {
  if (!msg1 || !msg2) return false;
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const n1 = normalize(msg1);
  const n2 = normalize(msg2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // High overlap (>80% of words match)
  const words1 = new Set(n1.split(/\s+/));
  const words2 = new Set(n2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  const similarity = intersection / union;
  
  return similarity > 0.8;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard: allow internal service-role calls OR authenticated admin/operator
    const _svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const _token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (_token !== _svcKey) {
      if (!_token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const body: GenerateMessageRequest = await req.json();
    const { 
      contact_name, 
      contact_company, 
      agent_name, 
      agent_specialty,
      prompt_type, 
      hours_waiting,
      attempt_number,
      conversation_context,
      pending_question,
      last_message_sent
    } = body;

    console.log(`[generate-followup-message] Generating ${prompt_type} message for ${contact_name}, attempt ${attempt_number}`);
    if (last_message_sent) {
      console.log(`[generate-followup-message] Last message to avoid: "${last_message_sent.substring(0, 50)}..."`);
    }

    const effectivePromptType = resolvePromptType(prompt_type, pending_question);
    const promptInstruction = PROMPT_TEMPLATES[effectivePromptType] || PROMPT_TEMPLATES.soft_reengagement;

    // Build anti-repetition instruction
    const antiRepetitionRule = last_message_sent 
      ? `\n\n⚠️ REGRA CRÍTICA ANTI-REPETIÇÃO:
Sua última mensagem foi: "${last_message_sent}"
Você DEVE criar uma mensagem COMPLETAMENTE DIFERENTE:
- Use outra estrutura de frase
- Faça outra pergunta ou ofereça algo diferente
- Mude o CTA (call to action)
- NÃO comece igual nem use as mesmas palavras-chave`
      : '';

    const systemPrompt = `Você é ${agent_name || 'um assistente de vendas'} ${agent_specialty ? `especializado em ${agent_specialty}` : ''}.
Sua missão é gerar UMA mensagem de follow-up curta e natural para WhatsApp.

REGRAS OBRIGATÓRIAS:
1. No máximo 2 linhas curtas, uma única pergunta ou pedido.
2. ZERO emoji.
3. Proibido: "tudo bem?", "tudo certo?", "E aí", "Olá!", "Ótimo", "Perfeito", "Passando pra", "Pelo visto".
4. Se o nome for "Cliente", não use nome; se for real, no máximo 1 vez, sem "Oi Nome!" no começo.
5. Nunca prometa ligar em X minutos nem "agora"; pode oferecer "se preferir, o corretor te liga — qual o melhor horário?".
6. Nunca peça e-mail, nunca cite preço diferente de R$ 911,66, nunca cite seguradora, nunca diga que o seguro "indeniza".
7. Pareça escrito por uma pessoa do comercial.
8. Cada mensagem diferente da anterior.
${antiRepetitionRule}

${promptInstruction}`;

    const userPrompt = `Gere uma mensagem de follow-up para:
- Nome do cliente: ${contact_name}
${contact_company ? `- Empresa: ${contact_company}` : ''}
${hours_waiting ? `- Horas sem resposta: ${Math.round(hours_waiting)}h` : ''}
- Tentativa número: ${attempt_number}
${conversation_context ? `- Contexto da conversa: ${conversation_context}` : ''}
${pending_question && effectivePromptType === 'unanswered_question' ? `- Pergunta pendente que deve ser retomada: ${pending_question}` : ''}
${last_message_sent ? `\n❌ NÃO repita nem pareça com: "${last_message_sent}"` : ''}

Responda APENAS com a mensagem, sem explicações ou aspas.`;

    // Use higher temperature for more creativity and variation
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
        max_tokens: 350,
        temperature: 0.95, // Higher temperature for more variation
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-followup-message] AI Gateway error:', response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        const fallbackMessage = getVariedFallback(contact_name, last_message_sent);
        return new Response(JSON.stringify({ 
          error: response.status === 429 ? 'Rate limit exceeded' : 'Créditos insuficientes',
          message: fallbackMessage,
          is_fallback: true
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    let generatedMessage = data.choices?.[0]?.message?.content?.trim();

    if (!generatedMessage) {
      throw new Error('Nenhuma mensagem gerada pela IA');
    }

    // Clean up the message (remove quotes if present)
    generatedMessage = stripEmojis(generatedMessage.replace(/^["']|["']$/g, '').trim());

    // Check if message is too similar to last one - regenerate if needed
    if (last_message_sent && messagesTooSimilar(generatedMessage, last_message_sent)) {
      console.log('[generate-followup-message] Generated message too similar to last, using fallback');
      generatedMessage = getVariedFallback(contact_name, last_message_sent);
    }

    console.log(`[generate-followup-message] Generated: "${generatedMessage.substring(0, 50)}..."`);

    return new Response(JSON.stringify({ 
      message: generatedMessage,
      prompt_type: effectivePromptType,
      attempt_number 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-followup-message] Error:', error);
    
    // Parse body again for fallback
    let contactName = 'Cliente';
    let lastMessage: string | undefined;
    try {
      const body = await req.clone().json();
      contactName = body.contact_name || 'Cliente';
      lastMessage = body.last_message_sent;
    } catch {}
    
    const fallbackMessage = getVariedFallback(contactName, lastMessage);
    
    return new Response(JSON.stringify({ 
      message: fallbackMessage,
      error: String(error),
      is_fallback: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
