import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendInviteRequest {
  email: string;
  name: string;
  role: string;
  inviter_name: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth guard: require authenticated admin/operator caller
    const _token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!_token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    {
      const _authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${_token}` } } });
      const { data: _authData, error: _authErr } = await _authClient.auth.getUser();
      if (_authErr || !_authData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: _roleRows } = await _authClient.from("user_roles").select("role").eq("user_id", _authData.user.id);
      if (!(_roleRows || []).some((r: any) => r.role === "admin" || r.role === "operator")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    const { email, name, role, inviter_name }: SendInviteRequest = await req.json();

    if (!email || !name) {
      console.error("Missing required fields:", { email: !!email, name: !!name });
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: email, name" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const roleDisplay = role === 'admin' ? 'Administrador' : role === 'manager' ? 'Gerente' : 'Atendente';
    
    // Use origin header or fallback to published URL
    const origin = req.headers.get('origin') || 'https://archive-ami.lovable.app';
    const authUrl = `${origin}/auth`;

    console.log(`Sending invite email to: ${email}, role: ${role}, inviter: ${inviter_name}, authUrl: ${authUrl}`);

    const emailResponse = await resend.emails.send({
      from: "OrbePet CRM <onboarding@resend.dev>",
      to: [email],
      subject: `${inviter_name} convidou você para o OrbePet CRM`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 16px; overflow: hidden;">
            
            <!-- Header -->
            <div style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #334155;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">OrbePet CRM</h1>
              <p style="color: #94a3b8; margin: 8px 0 0; font-size: 14px;">Planos de Saúde Pet</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 32px;">
              <p style="color: #f1f5f9; font-size: 18px; margin: 0 0 8px;">
                Olá, <strong>${name}</strong>!
              </p>
              
              <p style="color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
                ${inviter_name} convidou você para fazer parte da equipe no OrbePet CRM como <strong style="color: #22d3ee;">${roleDisplay}</strong>.
              </p>
              
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #94a3b8; font-size: 13px; margin: 0 0 12px;">
                  Para começar, crie sua conta usando este email:
                </p>
                <p style="color: #22d3ee; font-size: 15px; font-weight: 600; margin: 0; word-break: break-all;">
                  ${email}
                </p>
              </div>
              
              <a href="${authUrl}" 
                 style="display: block; background: linear-gradient(135deg, #0ea5e9, #22d3ee); color: #0f172a; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Criar Minha Conta
              </a>
              
              <p style="color: #64748b; font-size: 13px; text-align: center; margin: 20px 0 0;">
                Este convite expira em 7 dias.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="padding: 24px 32px; border-top: 1px solid #334155; text-align: center;">
              <p style="color: #475569; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} OrbePet
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Invite email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      id: emailResponse.data?.id,
      message: "Convite enviado com sucesso!" 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in send-invite-email function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao enviar convite",
        details: error.statusCode ? `Status: ${error.statusCode}` : undefined
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
