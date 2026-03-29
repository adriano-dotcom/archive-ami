import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCHEMA_VERSION = '2.0';

const ALLOWED_VIEWS = [
  'support_tickets',
  'support_daily',
  'support_weekly',
  'support_quality_daily',
  'reembolsos',
  'reembolso_daily',
] as const;

type ViewName = typeof ALLOWED_VIEWS[number];

// Prompt leak detection patterns
const PROMPT_LEAK_PATTERNS = [
  '/Repetition',
  'Final Polish',
  'Chain of thought',
  'REGRA:',
  '⚠️ CRÍTICO',
  '⛔ CRÍTICO',
  '## REGRAS',
  '## INFORMAÇÕES OFICIAIS',
  'AGENTE:',
  'CONTEXTO DO CLIENTE:',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate BRIDGE_SECRET
    const authHeader = req.headers.get('Authorization');
    const bridgeSecret = Deno.env.get('BRIDGE_SECRET');

    if (!bridgeSecret) {
      return new Response(
        JSON.stringify({ error: 'Server misconfigured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader?.replace('Bearer ', '');
    if (!token || token !== bridgeSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { view, limit } = await req.json().catch(() => ({ view: null, limit: null }));

    if (!view || !ALLOWED_VIEWS.includes(view)) {
      return new Response(
        JSON.stringify({ error: `Invalid view. Use: ${ALLOWED_VIEWS.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const now = new Date().toISOString();
    let result: any;

    switch (view as ViewName) {
      case 'support_daily':
        result = await buildSupportMetrics(supabase, 'daily');
        break;
      case 'support_weekly':
        result = await buildSupportMetrics(supabase, 'weekly');
        break;
      case 'support_quality_daily':
        result = await buildQualityMetrics(supabase);
        break;
      case 'support_tickets':
        result = await getTickets(supabase, limit);
        break;
      case 'reembolsos':
        result = await getReembolsos(supabase, limit);
        break;
      case 'reembolso_daily':
        result = await buildReembolsoMetrics(supabase);
        break;
    }

    return new Response(
      JSON.stringify({
        schema_version: SCHEMA_VERSION,
        generated_at: now,
        view,
        ...result,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in mission-control-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ===== SUPPORT METRICS (daily/weekly) =====
async function buildSupportMetrics(supabase: any, windowType: 'daily' | 'weekly') {
  const now = new Date();

  // All conversations
  const { data: allConvs } = await supabase
    .from('conversations')
    .select('id, status, is_active, assigned_user_id, assigned_user_name, contact_id, last_message_at, whatsapp_window_start, created_at, tags');

  const convs = allConvs || [];
  const active = convs.filter((c: any) => c.is_active);
  const archived = convs.filter((c: any) => !c.is_active);
  
  const orphans = active.filter((c: any) => !c.assigned_user_id && c.status !== 'closed');
  const assigned = active.filter((c: any) => c.assigned_user_id);
  const humanStatus = active.filter((c: any) => c.status === 'human');
  const ninaStatus = active.filter((c: any) => c.status === 'nina');
  const pausedStatus = active.filter((c: any) => c.status === 'paused');

  // Window expired: whatsapp_window_start > 24h ago
  const windowExpired = active.filter((c: any) => {
    if (!c.whatsapp_window_start) return false;
    const ws = new Date(c.whatsapp_window_start);
    return (now.getTime() - ws.getTime()) > 24 * 60 * 60 * 1000;
  });

  // Pending over 24h: last message from user >24h ago, no agent response after
  const pendingOver24h = active.filter((c: any) => {
    if (!c.last_message_at) return false;
    const lm = new Date(c.last_message_at);
    return (now.getTime() - lm.getTime()) > 24 * 60 * 60 * 1000;
  });

  // By attendant
  const byAttendant: Record<string, number> = {};
  for (const c of assigned) {
    const name = c.assigned_user_name || 'Sem nome';
    byAttendant[name] = (byAttendant[name] || 0) + 1;
  }

  // By status
  const statusCounts: Record<string, number> = {};
  for (const c of active) {
    const s = c.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  // Top urgent: orphans + pending >24h + window expired, sorted by last_message_at
  const urgentSet = new Set<string>();
  const urgentConvs: any[] = [];
  
  const addUrgent = (conv: any) => {
    if (!urgentSet.has(conv.id)) {
      urgentSet.add(conv.id);
      urgentConvs.push(conv);
    }
  };
  
  orphans.forEach(addUrgent);
  pendingOver24h.forEach(addUrgent);
  windowExpired.forEach(addUrgent);

  // Fetch contacts for urgent conversations
  const urgentContactIds = [...new Set(urgentConvs.map((c: any) => c.contact_id))];
  let contactsMap: Record<string, any> = {};
  if (urgentContactIds.length > 0) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, call_name, phone_number')
      .in('id', urgentContactIds);
    contactsMap = Object.fromEntries((contacts || []).map((c: any) => [c.id, c]));
  }

  // Get last message info for urgent conversations
  const urgentConvIds = urgentConvs.map((c: any) => c.id);
  let lastMessagesMap: Record<string, any> = {};
  if (urgentConvIds.length > 0) {
    // Get last message per conversation
    for (const convId of urgentConvIds.slice(0, 20)) { // limit to top 20
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('from_type, content, sent_at')
        .eq('conversation_id', convId)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastMsg) {
        lastMessagesMap[convId] = lastMsg;
      }
    }
  }

  // Count unread per conversation (messages from user without read_at)
  const topUrgent = urgentConvs
    .sort((a: any, b: any) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
    .slice(0, 20)
    .map((c: any) => {
      const contact = contactsMap[c.contact_id] || {};
      const lastMsg = lastMessagesMap[c.id];
      const isWindowExpired = c.whatsapp_window_start 
        ? (now.getTime() - new Date(c.whatsapp_window_start).getTime()) > 24 * 60 * 60 * 1000
        : true;
      
      return {
        chat_id: c.id,
        customer_name: contact.call_name || contact.name || 'Desconhecido',
        customer_phone: contact.phone_number || '',
        status: c.status,
        attendant: c.assigned_user_name || null,
        last_message_at: c.last_message_at,
        last_message_from: lastMsg?.from_type === 'user' ? 'customer' : 'agent',
        window_expired: isWindowExpired,
        unread_count: 0, // simplified
        summary: lastMsg?.content ? lastMsg.content.substring(0, 100) : '',
      };
    });

  return {
    window: { type: windowType, tz: 'America/Sao_Paulo' },
    kpis: {
      active_total: active.length,
      archived_total: archived.length,
      orphan_total: orphans.length,
      assigned_total: assigned.length,
      human_total: humanStatus.length,
      orbi_total: ninaStatus.length,
      paused_total: pausedStatus.length,
      window_expired_total: windowExpired.length,
      pending_over_24h_total: pendingOver24h.length,
    },
    by_attendant: Object.entries(byAttendant).map(([name, count]) => ({ name, count })),
    by_status: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    top_urgent: topUrgent,
  };
}

// ===== QUALITY METRICS =====
async function buildQualityMetrics(supabase: any) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch nina messages from last 24h
  const { data: ninaMessages } = await supabase
    .from('messages')
    .select('content')
    .eq('from_type', 'nina')
    .gte('sent_at', oneDayAgo)
    .not('content', 'is', null);

  const messages = ninaMessages || [];
  
  let brandingMismatchCount = 0;
  let promptLeakCount = 0;
  const leakExamples: string[] = [];

  for (const msg of messages) {
    const content = msg.content || '';
    
    // Check branding
    if (/jacometo/i.test(content)) {
      brandingMismatchCount++;
    }
    
    // Check prompt leaks
    for (const pattern of PROMPT_LEAK_PATTERNS) {
      if (content.includes(pattern)) {
        promptLeakCount++;
        if (leakExamples.length < 5) {
          leakExamples.push(content.substring(0, 150));
        }
        break; // count once per message
      }
    }
  }

  // Window expired conversations
  const { data: expiredConvs } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .not('whatsapp_window_start', 'is', null)
    .lt('whatsapp_window_start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  return {
    window: { type: 'daily', tz: 'America/Sao_Paulo' },
    quality: {
      messages_analyzed: messages.length,
      branding_mismatch_count: brandingMismatchCount,
      prompt_leak_count: promptLeakCount,
      prompt_leak_examples: leakExamples,
      window_expired_conversations: expiredConvs || 0,
    },
  };
}

// ===== REEMBOLSO METRICS =====
async function buildReembolsoMetrics(supabase: any) {
  const todayStart = new Date();
  todayStart.setHours(todayStart.getHours() - 3); // Approx Brasília
  const todayStr = todayStart.toISOString().split('T')[0];

  const { data: allClaims } = await supabase
    .from('reimbursement_claims')
    .select('id, status, amount_requested, amount_paid, created_at, paid_at');

  const claims = allClaims || [];
  
  const submittedToday = claims.filter((c: any) => c.created_at?.startsWith(todayStr));
  const pendingNow = claims.filter((c: any) => ['submitted', 'under_review'].includes(c.status));
  const paidToday = claims.filter((c: any) => c.status === 'paid' && c.paid_at?.startsWith(todayStr));
  const over7d = pendingNow.filter((c: any) => {
    const created = new Date(c.created_at);
    return (Date.now() - created.getTime()) > 7 * 24 * 60 * 60 * 1000;
  });

  const amountRequestedToday = submittedToday.reduce((s: number, c: any) => s + (parseFloat(c.amount_requested) || 0), 0);
  const amountPaidToday = paidToday.reduce((s: number, c: any) => s + (parseFloat(c.amount_paid) || 0), 0);

  return {
    window: { type: 'daily', tz: 'America/Sao_Paulo' },
    kpis: {
      submitted_today: submittedToday.length,
      pending_now: pendingNow.length,
      paid_today: paidToday.length,
      over_7d: over7d.length,
      amount_requested_today: amountRequestedToday,
      amount_paid_today: amountPaidToday,
    },
  };
}

// ===== SIMPLE LIST VIEWS =====
async function getTickets(supabase: any, limit?: number) {
  let query = supabase.from('orbe_support_tickets_v').select('*');
  if (limit && typeof limit === 'number') query = query.limit(Math.min(limit, 1000));
  const { data, error } = await query;
  if (error) throw error;
  return { count: data?.length || 0, data };
}

async function getReembolsos(supabase: any, limit?: number) {
  let query = supabase.from('orbe_reembolsos_v').select('*');
  if (limit && typeof limit === 'number') query = query.limit(Math.min(limit, 1000));
  const { data, error } = await query;
  if (error) throw error;
  return { count: data?.length || 0, data };
}
