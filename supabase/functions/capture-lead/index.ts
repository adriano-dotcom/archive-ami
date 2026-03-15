import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, pet_name, pet_species, landing_page_slug, utm_source, utm_campaign, utm_content, utm_term } = await req.json();

    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: "Email ou telefone é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate inputs
    if (name && name.length > 200) {
      return new Response(
        JSON.stringify({ error: "Nome muito longo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "Email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the landing page
    let landingPageId: string | null = null;
    let leadMagnetFileUrl: string | null = null;
    if (landing_page_slug) {
      const { data: lp } = await supabase
        .from("landing_pages")
        .select("id, lead_magnet_file_url")
        .eq("slug", landing_page_slug)
        .eq("is_active", true)
        .single();
      if (lp) {
        landingPageId = lp.id;
        leadMagnetFileUrl = lp.lead_magnet_file_url;
      }
    }

    // Clean phone number - keep only digits
    const cleanPhone = phone ? phone.replace(/\D/g, "") : null;
    const formattedPhone = cleanPhone
      ? cleanPhone.startsWith("55")
        ? cleanPhone
        : `55${cleanPhone}`
      : null;

    // Upsert contact
    let contactId: string | null = null;
    if (formattedPhone) {
      // Try to find existing contact by phone
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone_number", formattedPhone)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
        // Update with new info
        await supabase
          .from("contacts")
          .update({
            name: name || undefined,
            email: email || undefined,
            pet_name: pet_name || undefined,
            lead_source: "landing_page",
            utm_source: utm_source || undefined,
            utm_campaign: utm_campaign || undefined,
            utm_content: utm_content || undefined,
            utm_term: utm_term || undefined,
          })
          .eq("id", contactId);
      } else {
        const { data: newContact } = await supabase
          .from("contacts")
          .insert({
            phone_number: formattedPhone,
            name: name || null,
            email: email || null,
            pet_name: pet_name || null,
            lead_source: "landing_page",
            lead_status: "new",
            utm_source: utm_source || null,
            utm_campaign: utm_campaign || null,
            utm_content: utm_content || null,
            utm_term: utm_term || null,
          })
          .select("id")
          .single();
        contactId = newContact?.id || null;
      }
    }

    // Register lead capture
    await supabase.from("lead_captures").insert({
      landing_page_id: landingPageId,
      contact_id: contactId,
      name,
      email,
      phone: formattedPhone,
      pet_name,
      pet_species,
      lead_magnet_downloaded: !!leadMagnetFileUrl,
      utm_source,
      utm_campaign,
      utm_content,
      utm_term,
    });

    return new Response(
      JSON.stringify({
        success: true,
        lead_magnet_url: leadMagnetFileUrl,
        message: "Lead capturado com sucesso!",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error capturing lead:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar formulário" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

