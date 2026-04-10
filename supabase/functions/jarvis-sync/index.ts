import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jarvis-secret",
};

const ALLOWED_VIEWS = [
  "dashboard",
  "vendas_hoje",
  "vendas_mes",
  "vendas_por_utm",
  "reembolsos",
  "leads_por_origem",
  "cobranca",
] as const;

type ViewName = (typeof ALLOWED_VIEWS)[number];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("JARVIS_SYNC_SECRET")?.trim();
    if (!secret) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token = req.headers.get("x-jarvis-secret")?.trim() ?? "";
    if (!token) {
      const auth = req.headers.get("Authorization");
      if (auth?.toLowerCase().startsWith("bearer ")) {
        token = auth.slice(7).trim();
      }
    }

    const norm = (s: string) => s.replace(/[\s\n\r]/g, "");
    if (!token || norm(token) !== norm(secret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { view, limit } = await req.json().catch(() => ({ view: null, limit: null }));

    if (!view || !ALLOWED_VIEWS.includes(view)) {
      return new Response(
        JSON.stringify({ error: `Invalid view. Use: ${ALLOWED_VIEWS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    let result: any;

    switch (view as ViewName) {
      case "dashboard":
        result = await buildDashboard(supabase, now);
        break;
      case "vendas_hoje":
        result = await getVendasHoje(supabase, now);
        break;
      case "vendas_mes":
        result = await getVendasMes(supabase, now);
        break;
      case "vendas_por_utm":
        result = await getVendasPorUtm(supabase);
        break;
      case "reembolsos":
        result = await getReembolsos(supabase);
        break;
      case "leads_por_origem":
        result = await getLeadsPorOrigem(supabase);
        break;
      case "cobranca":
        result = await getCobranca(supabase);
        break;
    }

    return new Response(
      JSON.stringify({ generated_at: now.toISOString(), view, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[jarvis-sync] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ===== HELPERS =====
function todayBrasilia(now: Date): string {
  const br = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return br.toISOString().split("T")[0];
}

function monthStartBrasilia(now: Date): string {
  const br = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return br.toISOString().split("T")[0].slice(0, 7) + "-01";
}

// ===== 1. DASHBOARD =====
async function buildDashboard(supabase: any, now: Date) {
  const today = todayBrasilia(now);
  const monthStart = monthStartBrasilia(now);

  // Vendas hoje
  const { data: vendasHoje } = await supabase
    .from("ecommerce_orders")
    .select("amount")
    .eq("event_type", "purchase_paid")
    .gte("created_at", today + "T00:00:00-03:00");
  const salesTodayCount = vendasHoje?.length || 0;
  const salesTodayAmount = (vendasHoje || []).reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);

  // Vendas mês
  const { data: vendasMes } = await supabase
    .from("ecommerce_orders")
    .select("amount")
    .eq("event_type", "purchase_paid")
    .gte("created_at", monthStart + "T00:00:00-03:00");
  const salesMonthCount = vendasMes?.length || 0;
  const salesMonthAmount = (vendasMes || []).reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);

  // Reembolsos pendentes
  const { data: reembolsosPendentes } = await supabase
    .from("reimbursement_claims")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "under_review"]);

  // Leads ativos
  const { data: leadsAtivos } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .in("lead_status", ["new", "qualified", "negotiating"]);

  // Conversas ativas
  const { data: convsAtivas } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  // Inadimplência total
  const { data: inadimplentes } = await supabase
    .from("installments")
    .select("id, value")
    .eq("status", "overdue");
  const overdueCount = inadimplentes?.length || 0;
  const overdueAmount = (inadimplentes || []).reduce((s: number, r: any) => s + (parseFloat(r.value) || 0), 0);

  // MRR estimado (clientes ativos com installments pendentes no mês)
  const { data: mrrData } = await supabase
    .from("installments")
    .select("value")
    .eq("status", "pending")
    .gte("due_date", monthStart)
    .lte("due_date", today);
  const mrr = (mrrData || []).reduce((s: number, r: any) => s + (parseFloat(r.value) || 0), 0);

  return {
    kpis: {
      vendas_hoje: { count: salesTodayCount, amount: salesTodayAmount },
      vendas_mes: { count: salesMonthCount, amount: salesMonthAmount },
      reembolsos_pendentes: reembolsosPendentes || 0,
      leads_ativos: leadsAtivos || 0,
      conversas_ativas: convsAtivas || 0,
      inadimplencia: { count: overdueCount, amount: overdueAmount },
      mrr_estimado: mrr,
    },
  };
}

// ===== 2. VENDAS HOJE =====
async function getVendasHoje(supabase: any, now: Date) {
  const today = todayBrasilia(now);

  const { data: orders } = await supabase
    .from("ecommerce_orders")
    .select("id, order_id, amount, created_at, contact_id, metadata")
    .eq("event_type", "purchase_paid")
    .gte("created_at", today + "T00:00:00-03:00")
    .order("created_at", { ascending: false });

  const contactIds = [...new Set((orders || []).map((o: any) => o.contact_id).filter(Boolean))];
  let contactsMap: Record<string, any> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, name, phone_number, utm_source, utm_campaign, utm_content, utm_term")
      .in("id", contactIds);
    contactsMap = Object.fromEntries((contacts || []).map((c: any) => [c.id, c]));
  }

  const data = (orders || []).map((o: any) => {
    const contact = contactsMap[o.contact_id] || {};
    return {
      order_id: o.order_id,
      amount: parseFloat(o.amount) || 0,
      created_at: o.created_at,
      customer_name: contact.name || null,
      customer_phone: contact.phone_number || null,
      utm_source: contact.utm_source || null,
      utm_campaign: contact.utm_campaign || null,
      utm_content: contact.utm_content || null,
      utm_term: contact.utm_term || null,
    };
  });

  return { count: data.length, data };
}

// ===== 3. VENDAS MÊS =====
async function getVendasMes(supabase: any, now: Date) {
  const monthStart = monthStartBrasilia(now);

  const { data: orders } = await supabase
    .from("ecommerce_orders")
    .select("amount, created_at")
    .eq("event_type", "purchase_paid")
    .gte("created_at", monthStart + "T00:00:00-03:00")
    .order("created_at", { ascending: true });

  const byDay: Record<string, { count: number; amount: number }> = {};
  for (const o of orders || []) {
    const day = o.created_at?.split("T")[0] || "unknown";
    if (!byDay[day]) byDay[day] = { count: 0, amount: 0 };
    byDay[day].count++;
    byDay[day].amount += parseFloat(o.amount) || 0;
  }

  const totalAmount = (orders || []).reduce((s: number, o: any) => s + (parseFloat(o.amount) || 0), 0);

  return {
    total_count: orders?.length || 0,
    total_amount: totalAmount,
    by_day: Object.entries(byDay).map(([date, v]) => ({ date, ...v })),
  };
}

// ===== 4. VENDAS POR UTM =====
async function getVendasPorUtm(supabase: any) {
  const { data: orders } = await supabase
    .from("ecommerce_orders")
    .select("contact_id, amount")
    .eq("event_type", "purchase_paid");

  const contactIds = [...new Set((orders || []).map((o: any) => o.contact_id).filter(Boolean))];
  let contactsMap: Record<string, any> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, utm_source, utm_campaign")
      .in("id", contactIds);
    contactsMap = Object.fromEntries((contacts || []).map((c: any) => [c.id, c]));
  }

  const grouped: Record<string, { count: number; amount: number }> = {};
  for (const o of orders || []) {
    const c = contactsMap[o.contact_id] || {};
    const key = `${c.utm_source || "direto"}|${c.utm_campaign || "sem_campanha"}`;
    if (!grouped[key]) grouped[key] = { count: 0, amount: 0 };
    grouped[key].count++;
    grouped[key].amount += parseFloat(o.amount) || 0;
  }

  return {
    data: Object.entries(grouped)
      .map(([key, v]) => {
        const [utm_source, utm_campaign] = key.split("|");
        return { utm_source, utm_campaign, ...v };
      })
      .sort((a, b) => b.count - a.count),
  };
}

// ===== 5. REEMBOLSOS =====
async function getReembolsos(supabase: any) {
  const { data: claims } = await supabase
    .from("reimbursement_claims")
    .select("id, status, amount_requested, amount_paid, created_at, paid_at, pet_name, claim_type, contact_id");

  const all = claims || [];
  const byStatus: Record<string, number> = {};
  let totalRequested = 0;
  let totalPaid = 0;

  for (const c of all) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    totalRequested += parseFloat(c.amount_requested) || 0;
    if (c.status === "paid") totalPaid += parseFloat(c.amount_paid) || 0;
  }

  const pending = all.filter((c: any) => ["submitted", "under_review"].includes(c.status));
  const avgResolutionDays = all
    .filter((c: any) => c.paid_at)
    .map((c: any) => (new Date(c.paid_at).getTime() - new Date(c.created_at).getTime()) / 86400000);
  const avgDays = avgResolutionDays.length > 0
    ? Math.round((avgResolutionDays.reduce((a, b) => a + b, 0) / avgResolutionDays.length) * 10) / 10
    : null;

  return {
    kpis: {
      total: all.length,
      pending: pending.length,
      total_requested: totalRequested,
      total_paid: totalPaid,
      avg_resolution_days: avgDays,
    },
    by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
  };
}

// ===== 6. LEADS POR ORIGEM =====
async function getLeadsPorOrigem(supabase: any) {
  const { data: contacts } = await supabase
    .from("contacts")
    .select("lead_source, lead_status");

  const grouped: Record<string, { total: number; customers: number }> = {};
  for (const c of contacts || []) {
    const src = c.lead_source || "desconhecido";
    if (!grouped[src]) grouped[src] = { total: 0, customers: 0 };
    grouped[src].total++;
    if (c.lead_status === "customer") grouped[src].customers++;
  }

  return {
    data: Object.entries(grouped)
      .map(([source, v]) => ({
        source,
        total: v.total,
        customers: v.customers,
        conversion_rate: v.total > 0 ? Math.round((v.customers / v.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

// ===== 7. COBRANÇA =====
async function getCobranca(supabase: any) {
  const { data: installments } = await supabase
    .from("installments")
    .select("id, value, days_overdue, status, due_date, contact_id")
    .eq("status", "overdue");

  const ranges = [
    { label: "1-30d", min: 1, max: 30 },
    { label: "31-60d", min: 31, max: 60 },
    { label: "61-90d", min: 61, max: 90 },
    { label: "90d+", min: 91, max: Infinity },
  ];

  const buckets = ranges.map((r) => {
    const items = (installments || []).filter(
      (i: any) => (i.days_overdue || 0) >= r.min && (i.days_overdue || 0) <= r.max
    );
    return {
      faixa: r.label,
      count: items.length,
      total_value: items.reduce((s: number, i: any) => s + (parseFloat(i.value) || 0), 0),
    };
  });

  const totalOverdue = (installments || []).reduce((s: number, i: any) => s + (parseFloat(i.value) || 0), 0);

  return {
    kpis: {
      total_overdue_count: installments?.length || 0,
      total_overdue_value: totalOverdue,
    },
    by_range: buckets,
  };
}
