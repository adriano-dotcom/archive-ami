import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[ScheduledEmails] Starting scheduled email processing...');

    if (!resendApiKey) {
      console.error('[ScheduledEmails] RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resend = new Resend(resendApiKey);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Fetch pending emails scheduled for today or earlier
    const { data: dueEmails, error: fetchError } = await supabase
      .from('scheduled_emails')
      .select(`
        *,
        contact:contacts(name, phone_number),
        deal:deals(title)
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', today);

    if (fetchError) {
      console.error('[ScheduledEmails] Error fetching emails:', fetchError);
      throw fetchError;
    }

    if (!dueEmails || dueEmails.length === 0) {
      console.log('[ScheduledEmails] No emails due for sending');
      return new Response(JSON.stringify({ processed: 0, message: 'No emails due' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[ScheduledEmails] Found ${dueEmails.length} emails to send`);

    let sent = 0;
    let failed = 0;

    for (const email of dueEmails) {
      try {
        console.log(`[ScheduledEmails] Sending email to ${email.to_email}...`);

        // Get nina_settings for from address
        const { data: settings } = await supabase
          .from('nina_settings')
          .select('company_name')
          .maybeSingle();

        const fromName = settings?.company_name || 'OrbePet';
        const fromEmail = `${fromName} <onboarding@resend.dev>`;

        const emailResponse = await resend.emails.send({
          from: fromEmail,
          to: [email.to_email],
          subject: email.subject,
          html: email.body_html,
        });

        console.log(`[ScheduledEmails] Email sent successfully:`, emailResponse);

        // Update email status to sent
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', email.id);

        sent++;

      } catch (sendError: any) {
        console.error(`[ScheduledEmails] Failed to send email ${email.id}:`, sendError);

        // Update email status to failed
        await supabase
          .from('scheduled_emails')
          .update({
            status: 'failed',
            error_message: sendError.message || 'Unknown error'
          })
          .eq('id', email.id);

        failed++;
      }
    }

    console.log(`[ScheduledEmails] Processing complete: ${sent} sent, ${failed} failed`);

    return new Response(JSON.stringify({ 
      processed: dueEmails.length,
      sent,
      failed 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ScheduledEmails] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
