import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Published URL do Mitsui Projeto (destino do webhook).
// Troque por https://transporte.jacometoseguros.com.br se preferir o domínio custom.
const CRM_INGEST_URL = "https://direct-render-dupe.lovable.app/api/public/ingest-lead";

// Assinatura HMAC-SHA256 (hex) de `${timestamp}.${body}`
async function signPayload(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const secret = Deno.env.get("CRM_INGEST_SECRET");
    if (!secret) {
      console.error("[replicate-lead-to-crm] CRM_INGEST_SECRET não configurado");
      return new Response(
        JSON.stringify({ error: "CRM_INGEST_SECRET não configurado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { contact_id } = await req.json();
    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: "contact_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: contact, error } = await supabase
      .from("contacts")
      .select(
        "id, name, call_name, email, phone_number, company, cnpj, cpf, rntrc, company_type, cargo_type, vehicle_plate, vehicle_type, typical_route_km, cep, neighborhood, city, state, lead_source, lead_status, tags, notes, utm_source, utm_campaign, utm_content, utm_term",
      )
      .eq("id", contact_id)
      .maybeSingle();

    if (error || !contact) {
      console.error("[replicate-lead-to-crm] contato não encontrado:", contact_id, error?.message);
      return new Response(
        JSON.stringify({ error: "Contato não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const payload = {
      source_system: "jacometo-crm",
      external_id: contact.id,
      stage: "proposal",
      occurred_at: new Date().toISOString(),
      lead: {
        name: contact.name,
        call_name: contact.call_name,
        email: contact.email,
        phone_number: contact.phone_number,
        company: contact.company,
        cnpj: contact.cnpj,
        cpf: contact.cpf,
        rntrc: contact.rntrc,
        company_type: contact.company_type,
        cargo_type: contact.cargo_type,
        vehicle_plate: contact.vehicle_plate,
        vehicle_type: contact.vehicle_type,
        typical_route_km: contact.typical_route_km,
        cep: contact.cep,
        neighborhood: contact.neighborhood,
        city: contact.city,
        state: contact.state,
        lead_source: contact.lead_source,
        lead_status: contact.lead_status,
        tags: contact.tags,
        notes: contact.notes,
        utm_source: contact.utm_source,
        utm_campaign: contact.utm_campaign,
        utm_content: contact.utm_content,
        utm_term: contact.utm_term,
      },
    };

    const body = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = await signPayload(secret, timestamp, body);

    let response: Response;
    try {
      response = await fetch(CRM_INGEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": `sha256=${signature}`,
          "X-Timestamp": timestamp,
          "X-Event-Id": `${contact.id}-${timestamp}`,
        },
        body,
      });
    } catch (fetchErr) {
      console.error("[replicate-lead-to-crm] falha de rede ao enviar webhook:", fetchErr);
      return new Response(
        JSON.stringify({ success: false, error: "Falha de rede ao enviar webhook" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const responseText = await response.text();
    console.log(
      `[replicate-lead-to-crm] contato=${contact.id} status=${response.status} resposta=${responseText.slice(0, 500)}`,
    );

    return new Response(
      JSON.stringify({ success: response.ok, target_status: response.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[replicate-lead-to-crm] erro:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
