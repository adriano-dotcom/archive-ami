import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripEmojis } from "../_shared/text-sanitize.ts";

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

// Normaliza telefone BR: só dígitos, garante prefixo 55.
function normalizePhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// Normaliza CNPJ: só dígitos.
function normalizeCNPJ(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits || null;
}

function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limit: 60/min por IP (webhook público, defesa em profundidade)
  {
    const _rlIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const _rlClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: _rlAllowed } = await _rlClient.rpc("check_rate_limit", {
      _key: `ecommerce-webhook:${_rlIp}`,
      _max: 60,
      _window_seconds: 60,
    });
    if (_rlAllowed === false) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }
  }

  try {
    // Autenticação: x-ecommerce-secret | x-api-key | Authorization: Bearer | ?token=
    const expectedSecret = Deno.env.get("ECOMMERCE_WEBHOOK_SECRET");
    const url = new URL(req.url);
    const secret =
      req.headers.get("x-ecommerce-secret") ||
      req.headers.get("x-api-key") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      url.searchParams.get("token");

    if (!expectedSecret || secret !== expectedSecret) {
      console.error(
        "[ecommerce-webhook] Auth failed. Received secret:",
        secret ? `${secret.substring(0, 4)}...` : "none",
      );
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await req.json();

    // ===== PAYLOAD ESPERADO DO CHECKOUT 3-SEGUROS =====
    // Aceita nomes canônicos + aliases (retro-compat / flexibilidade do checkout externo).
    const event: string =
      raw.event || raw.status || (raw.tipo === "compra" ? "purchase_paid" : raw.tipo) || "";

    const phone: string = raw.phone || raw.telefone || raw.whatsapp || "";
    const name: string | null = raw.responsavel || raw.name || raw.nome || null;
    const email: string | null = raw.email || null;
    const cnpj = normalizeCNPJ(raw.cnpj || raw.CNPJ || null);
    const razaoSocial: string | null = raw.razao_social || raw.razaoSocial || raw.company || null;
    const protocolo: string | null = raw.protocolo || raw.protocol || raw.order_id || null;

    const rawPremio =
      raw.premio ??
      raw.premium ??
      raw.valor ??
      raw.amount ??
      raw.valor_total ??
      raw.monthly_amount ??
      null;
    const premio =
      rawPremio === null || rawPremio === undefined || rawPremio === ""
        ? null
        : Number(rawPremio);

    // UTM / rastreio (opcionais, vindos do checkout)
    const utm_source: string | null = raw.utm_source || null;
    const utm_campaign: string | null = raw.utm_campaign || null;
    const utm_content: string | null = raw.utm_content || null;
    const utm_term: string | null = raw.utm_term || null;

    // Validação mínima
    if (!event) {
      return new Response(
        JSON.stringify({ error: "Missing required field: event/status/tipo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Missing required field: phone/telefone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (event === "purchase_paid" && (premio === null || Number.isNaN(premio) || premio <= 0)) {
      return new Response(
        JSON.stringify({
          error:
            "Missing or invalid premium. Send `premio` (or `premium`/`valor`/`amount`) as a positive number.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const normalizedPhone = normalizePhone(phone);

    if (event === "purchase_paid") {
      // 1) Upsert contact (não sobrescreve CTWA/UTM já gravados)
      const { data: existingContacts } = await supabase
        .from("contacts")
        .select("id, client_memory, utm_source, utm_campaign, utm_content, utm_term")
        .eq("phone_number", normalizedPhone)
        .limit(1);

      let contactId: string;

      const purchasePatch = {
        product: "3_seguros_obrigatorios",
        protocolo,
        premio,
        premio_formatted: premio ? formatBRL(premio) : null,
        razao_social: razaoSocial,
        cnpj,
        paid_at: new Date().toISOString(),
      };

      if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
        const prevMemory = (existingContacts[0].client_memory as Record<string, any>) || {};
        const mergedMemory = {
          ...prevMemory,
          purchase: purchasePatch,
        };
        await supabase
          .from("contacts")
          .update({
            name: name || undefined,
            email: email || undefined,
            company: razaoSocial || undefined,
            cnpj: cnpj || undefined,
            lead_status: "customer",
            lead_source: "checkout_3seguros",
            vertical: "transporte",
            // Só atualiza UTM se vier no payload E o contato ainda não tiver (não sobrescreve rastreio original)
            utm_source: existingContacts[0].utm_source ? undefined : (utm_source || undefined),
            utm_campaign: existingContacts[0].utm_campaign ? undefined : (utm_campaign || undefined),
            utm_content: existingContacts[0].utm_content ? undefined : (utm_content || undefined),
            utm_term: existingContacts[0].utm_term ? undefined : (utm_term || undefined),
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
            company: razaoSocial || null,
            cnpj: cnpj || null,
            lead_status: "customer",
            lead_source: "checkout_3seguros",
            vertical: "transporte",
            utm_source: utm_source || null,
            utm_campaign: utm_campaign || null,
            utm_content: utm_content || null,
            utm_term: utm_term || null,
            client_memory: { purchase: purchasePatch },
          })
          .select("id")
          .single();

        if (insertError) throw insertError;
        contactId = newContact.id;
      }

      // 2) Log da ordem
      await supabase.from("ecommerce_orders").insert({
        contact_id: contactId,
        order_id: protocolo || `auto_${Date.now()}`,
        event_type: "purchase_paid",
        amount: premio || 0,
        status: "paid",
        metadata: {
          product: "3_seguros_obrigatorios",
          protocolo,
          name,
          email,
          cnpj,
          razao_social: razaoSocial,
          phone: normalizedPhone,
          premio,
          premio_formatted: premio ? formatBRL(premio) : null,
          utm_source,
          utm_campaign,
          utm_content,
          utm_term,
        },
      });

      // 3) Cria/reaproveita conversa e loga uma mensagem interna (system) com o resumo da compra
      const { data: existingConvs } = await supabase
        .from("conversations")
        .select("id, metadata")
        .eq("contact_id", contactId)
        .eq("is_active", true)
        .limit(1);

      let conversationId: string;
      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
        const prevConvMeta = (existingConvs[0].metadata as Record<string, any>) || {};
        await supabase
          .from("conversations")
          .update({
            status: "human",
            last_message_at: new Date().toISOString(),
            metadata: {
              ...prevConvMeta,
              product: "3_seguros_obrigatorios",
              last_purchase_protocolo: protocolo,
            },
          })
          .eq("id", conversationId);
      } else {
        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({
            contact_id: contactId,
            status: "human",
            is_active: true,
            last_message_at: new Date().toISOString(),
            metadata: {
              product: "3_seguros_obrigatorios",
              first_purchase_protocolo: protocolo,
            },
          })
          .select("id")
          .single();
        if (convError) throw convError;
        conversationId = newConv.id;
      }

      // 4) Mensagem interna (system) para a equipe ver o novo pagamento
      const resumo = [
        `Nova compra confirmada — 3 seguros obrigatórios`,
        protocolo ? `Protocolo: ${protocolo}` : null,
        razaoSocial ? `Empresa: ${razaoSocial}` : null,
        cnpj ? `CNPJ: ${cnpj}` : null,
        name ? `Responsável: ${name}` : null,
        `Prêmio: ${premio ? formatBRL(premio) : "-"}`,
      ]
        .filter(Boolean)
        .join("\n");

      {
        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_type: "human",
          type: "text",
          content: resumo,
          status: "sent",
          processed_by_nina: true,
          sent_at: new Date().toISOString(),
          metadata: {
            source: "ecommerce_webhook",
            event: "purchase_paid",
            internal_note: true,
            contact_id: contactId,
            product: "3_seguros_obrigatorios",
          },
        });
        if (msgError) {
          console.error("[ecommerce-webhook] Nota interna não gravada:", msgError);
        }
      }

      // 5) Boas-vindas automáticas ao cliente (texto livre dentro da janela de 24h)
      let welcomeSent = false;
      let welcomeSkippedReason: string | null = null;
      const welcomeProtocolo = protocolo || `auto_${contactId}`;

      try {
        // 5.1) Idempotência por protocolo
        const { data: alreadySent } = await supabase
          .from("messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("metadata->>welcome_protocolo", welcomeProtocolo)
          .limit(1);

        const { data: alreadyQueued } = await supabase
          .from("send_queue")
          .select("id")
          .eq("conversation_id", conversationId)
          .eq("metadata->>welcome_protocolo", welcomeProtocolo)
          .limit(1);

        if ((alreadySent && alreadySent.length > 0) || (alreadyQueued && alreadyQueued.length > 0)) {
          welcomeSkippedReason = "already_sent";
        } else {
          // 5.2) Janela de 24h do WhatsApp
          const { data: windowOpen } = await supabase.rpc("is_whatsapp_window_open", {
            p_conversation_id: conversationId,
          });

          const firstName = (name || "").trim().split(/\s+/)[0] || null;
          const empresaLinha = razaoSocial
            ? `Empresa: ${razaoSocial}${cnpj ? ` - CNPJ ${cnpj}` : ""}`
            : cnpj
              ? `CNPJ: ${cnpj}`
              : null;

          const welcomeText = stripEmojis(
            [
              firstName
                ? `Olá, ${firstName}! Recebemos a confirmação do seu pagamento.`
                : "Olá! Recebemos a confirmação do seu pagamento.",
              "",
              protocolo ? `Protocolo: ${protocolo}` : null,
              empresaLinha,
              premio ? `Valor pago: ${formatBRL(premio)}` : null,
              "",
              "Seu pacote com as 3 apólices obrigatórias do transportador (RCTR-C, RC-DC e RC-V) já está em emissão. O prazo é de até 2 horas úteis e você recebe os documentos por aqui e por e-mail.",
              "",
              "As apólices atendem à exigência de quem contrata você como transportador subcontratado. Qualquer dúvida, é só responder nesta conversa.",
            ]
              .filter((l) => l !== null)
              .join("\n"),
          );

          if (windowOpen === true) {
            const { error: queueError } = await supabase.from("send_queue").insert({
              conversation_id: conversationId,
              contact_id: contactId,
              message_type: "text",
              from_type: "nina",
              content: welcomeText,
              status: "pending",
              priority: 8,
              metadata: {
                source: "ecommerce_welcome",
                welcome_protocolo: welcomeProtocolo,
                product: "3_seguros_obrigatorios",
              },
            });

            if (queueError) {
              console.error("[ecommerce-webhook] Falha ao enfileirar boas-vindas:", queueError);
              welcomeSkippedReason = "queue_error";
            } else {
              welcomeSent = true;
            }
          } else {
            welcomeSkippedReason = "whatsapp_window_closed";
            const { error: noteError } = await supabase.from("messages").insert({
              conversation_id: conversationId,
              from_type: "human",
              type: "text",
              content:
                "Boas-vindas da compra NÃO enviadas: a janela de 24h do WhatsApp está fechada. Entre em contato manualmente com o cliente.",
              status: "sent",
              processed_by_nina: true,
              sent_at: new Date().toISOString(),
              metadata: {
                source: "ecommerce_webhook",
                internal_note: true,
                welcome_protocolo: welcomeProtocolo,
                welcome_skipped_reason: "whatsapp_window_closed",
              },
            });
            if (noteError) {
              console.error("[ecommerce-webhook] Aviso interno não gravado:", noteError);
            }
          }
        }
      } catch (welcomeErr) {
        console.error("[ecommerce-webhook] Erro nas boas-vindas:", welcomeErr);
        welcomeSkippedReason = "error";
      }

      // 6) Notifica Jarvis (fire-and-forget)
      notifyJarvis("nova_venda_3seguros", {
        contact_id: contactId,
        contact_name: name || null,
        company: razaoSocial || null,
        cnpj,
        phone: normalizedPhone,
        premio,
        premio_formatted: premio ? formatBRL(premio) : null,
        protocolo,
        conversation_id: conversationId,
        product: "3_seguros_obrigatorios",
      });

      return new Response(
        JSON.stringify({
          success: true,
          event: "purchase_paid",
          product: "3_seguros_obrigatorios",
          contact_id: contactId,
          conversation_id: conversationId,
          protocolo,
          premio,
          welcome_sent: welcomeSent,
          welcome_skipped_reason: welcomeSkippedReason,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Qualquer outro evento — 400 explícito (não temos mais refund_request neste produto)
    return new Response(
      JSON.stringify({ error: `Unsupported event type for this product: ${event}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ecommerce-webhook] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
