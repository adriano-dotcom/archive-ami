import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ecommerce-secret",
};

// Fire-and-forget notification to Jarvis
function notifyJarvis(event: string, data: Record<string, any>) {
  const url = Deno.env.get("JARVIS_WEBHOOK_URL");
  const secret = Deno.env.get("JARVIS_SYNC_SECRET");
  if (!url) return;
  try {
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-jarvis-secret": secret } : {}),
      },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }),
    }).catch((e) => console.error("[ecommerce-webhook] Jarvis notify error:", e));
  } catch (e) {
    console.error("[ecommerce-webhook] Jarvis notify error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate via multiple methods: x-ecommerce-secret, x-api-key, Authorization: Bearer, or query string ?token=
    const expectedSecret = Deno.env.get("ECOMMERCE_WEBHOOK_SECRET");
    const url = new URL(req.url);
    const secret =
      req.headers.get("x-ecommerce-secret") ||
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("token");

    if (!expectedSecret || secret !== expectedSecret) {
      console.error("[ecommerce-webhook] Auth failed. Received secret:", secret ? `${secret.substring(0, 4)}...` : "none");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await req.json();

    // Map Orbe Plano Pet format (tipo/telefone/nome) to internal format
    const tipoMap: Record<string, string> = { compra: "purchase_paid", reembolso: "refund_request" };
    const body = {
      ...raw,
      event: raw.event || tipoMap[raw.tipo] || raw.tipo,
      phone: raw.phone || raw.telefone,
      name: raw.name || raw.nome,
    };

    const { event, phone, name, email, pet_name, order_id, reason, claim_type } = body;

    // Monthly subscription value (multi-name compatibility)
    const rawMonthly =
      raw.valor_mensalidade ?? raw.monthly_amount ?? raw.valor ?? raw.amount ?? body.amount;
    const monthlyAmount =
      rawMonthly === null || rawMonthly === undefined || rawMonthly === ""
        ? null
        : Number(rawMonthly);
    const planName: string | null = raw.plano ?? raw.plan ?? raw.plan_name ?? null;
    const paymentMethod: string | null = raw.forma_pagamento ?? raw.payment_method ?? null;
    // Legacy `amount` kept for refund_request (claim amount)
    const amount = body.amount ?? rawMonthly ?? 0;

    if (!event || !phone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: event, phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For purchases, monthly value is required and must be > 0
    if (event === "purchase_paid") {
      if (monthlyAmount === null || Number.isNaN(monthlyAmount) || monthlyAmount <= 0) {
        return new Response(
          JSON.stringify({
            error:
              "Missing or invalid monthly value. Send `valor_mensalidade` (or `monthly_amount`/`valor`/`amount`) as a positive number.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const formatBRL = (v: number) =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Normalize phone number (ensure has 55 prefix)
    const normalizedPhone = phone.replace(/\D/g, "").replace(/^(?!55)/, "55");

    if (event === "purchase_paid") {
      // 1. Upsert contact (preserving and merging client_memory.subscription)
      const { data: existingContacts } = await supabase
        .from("contacts")
        .select("id, client_memory")
        .eq("phone_number", normalizedPhone)
        .limit(1);

      let contactId: string;

      const subscriptionPatch = {
        plan_name: planName,
        monthly_amount: monthlyAmount,
        monthly_amount_formatted: monthlyAmount ? formatBRL(monthlyAmount) : null,
        payment_method: paymentMethod,
        started_at: new Date().toISOString(),
        order_id: order_id || null,
      };

      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        const prevMemory = (existingContacts[0].client_memory as Record<string, any>) || {};
        const mergedMemory = {
          ...prevMemory,
          subscription: subscriptionPatch,
        };
        await supabase
          .from("contacts")
          .update({
            name: name || undefined,
            email: email || undefined,
            pet_name: pet_name || undefined,
            lead_status: "customer",
            lead_source: "ecommerce",
            last_activity: new Date().toISOString(),
            client_memory: mergedMemory,
          })
          .eq("id", contactId);
      } else {
        const { data: newContact, error: insertError } = await supabase
          .from("contacts")
          .insert({
            phone_number: normalizedPhone,
            name: name || null,
            email: email || null,
            pet_name: pet_name || null,
            lead_status: "customer",
            lead_source: "ecommerce",
            client_memory: { subscription: subscriptionPatch },
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        contactId = newContact.id;
      }

      // 2. Log ecommerce order (amount = monthly value)
      await supabase.from("ecommerce_orders").insert({
        contact_id: contactId,
        order_id: order_id || `auto_${Date.now()}`,
        event_type: "purchase_paid",
        amount: monthlyAmount || 0,
        metadata: {
          name,
          email,
          pet_name,
          phone: normalizedPhone,
          monthly_amount: monthlyAmount,
          monthly_amount_formatted: monthlyAmount ? formatBRL(monthlyAmount) : null,
          plan_name: planName,
          payment_method: paymentMethod,
        },
      });

      // 3. Create/find conversation
      const { data: existingConvs } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("is_active", true)
        .limit(1);

      let conversationId: string;
      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
      } else {
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({
            contact_id: contactId,
            status: "nina",
            is_active: true,
          })
          .select("id")
          .single();
        if (convError) throw convError;
        conversationId = newConv.id;
      }

      // 4. Send welcome template via WhatsApp
      // Template _bemvindo__famlia_orbe_pet requires 1 BODY var: customer first name
      const firstName = (name || "").trim().split(/\s+/)[0] || "tutor";
      try {
        const templateResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-whatsapp-template`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              template_name: "_bemvindo__famlia_orbe_pet",
              language: "en",
              contact_id: contactId,
              conversation_id: conversationId,
              variables: [firstName],
            }),
          }
        );
        const templateResult = await templateResponse.text();
        console.log("[ecommerce-webhook] Template sent:", templateResult);
        if (!templateResponse.ok) {
          console.error("[ecommerce-webhook] Template send failed:", templateResponse.status, templateResult);
        }
      } catch (templateErr) {
        console.error("[ecommerce-webhook] Template send error:", templateErr);
      }

      // Fire-and-forget: notify Jarvis
      notifyJarvis("nova_venda", {
        contact_id: contactId,
        contact_name: name || null,
        phone: normalizedPhone,
        amount: monthlyAmount || 0,
        monthly_amount: monthlyAmount,
        monthly_amount_formatted: monthlyAmount ? formatBRL(monthlyAmount) : null,
        plan_name: planName,
        payment_method: paymentMethod,
        order_id: order_id || null,
        conversation_id: conversationId,
      });

      return new Response(
        JSON.stringify({
          success: true,
          event: "purchase_paid",
          contact_id: contactId,
          conversation_id: conversationId,
          monthly_amount: monthlyAmount,
          plan_name: planName,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (event === "refund_request") {
      // Find existing contact
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, pet_name")
        .eq("phone_number", normalizedPhone)
        .limit(1);

      if (!contacts || contacts.length === 0) {
        return new Response(
          JSON.stringify({ error: "Contact not found for this phone number" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const contact = contacts[0];

      // Log ecommerce order
      await supabase.from("ecommerce_orders").insert({
        contact_id: contact.id,
        order_id: order_id || `refund_${Date.now()}`,
        event_type: "refund_request",
        amount: amount || 0,
        metadata: { reason, phone: normalizedPhone },
      });

      // Create reimbursement claim
      const validTypes = ['consulta', 'exame', 'cirurgia', 'internacao', 'outro'];
      const resolvedType = validTypes.includes(claim_type) ? claim_type : 'consulta';
      const typeLabels: Record<string, string> = {
        consulta: 'consulta veterinária',
        exame: 'exame veterinário',
        cirurgia: 'cirurgia veterinária',
        internacao: 'internação veterinária',
        outro: 'procedimento veterinário',
      };
      const { data: claim, error: claimError } = await supabase
        .from("reimbursement_claims")
        .insert({
          contact_id: contact.id,
          status: "submitted",
          amount_requested: amount || 0,
          pet_name: contact.pet_name || pet_name || null,
          claim_type: resolvedType,
          description: reason || `Solicitação de reembolso de ${typeLabels[resolvedType]}`,
          metadata: { order_id, source: "ecommerce_webhook" },
        })
        .select("id")
        .single();

      if (claimError) throw claimError;

      // Fire-and-forget: notify Jarvis
      notifyJarvis("novo_reembolso", {
        contact_id: contact.id,
        contact_name: contact.name || null,
        phone: normalizedPhone,
        amount: amount || 0,
        claim_id: claim.id,
        reason: reason || null,
      });

      return new Response(
        JSON.stringify({
          success: true,
          event: "refund_request",
          contact_id: contact.id,
          claim_id: claim.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown event type: ${event}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[ecommerce-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
