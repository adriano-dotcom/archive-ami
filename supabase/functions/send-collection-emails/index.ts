import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailToSend {
  contactId: string;
  contactName: string;
  email: string;
  subject: string;
  bodyHtml: string;
  installments: Array<{
    id: string;
    value: number;
    dueDate: string;
    daysOverdue: number;
  }>;
  totalValue: number;
}

interface SendEmailsRequest {
  batchId: string;
  emails: EmailToSend[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Fetch email configuration from nina_settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('collection_email_from, collection_email_bcc')
      .single();

    const emailFrom = settings?.collection_email_from || 'Jacometo Seguros <jacometo@jacometo.com.br>';
    const emailBcc = settings?.collection_email_bcc || ['joao.pedro@jacometo.com.br'];

    const { batchId, emails }: SendEmailsRequest = await req.json();

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ 
          sent: 0, 
          failed: 0, 
          results: [],
          message: "Nenhum email para enviar"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending ${emails.length} collection emails for batch ${batchId}`);

    const results: any[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const emailData of emails) {
      try {
        // Send email via Resend with dynamic settings
        const emailResponse = await resend.emails.send({
          from: emailFrom,
          to: [emailData.email],
          bcc: emailBcc,
          subject: emailData.subject,
          html: emailData.bodyHtml,
        });

        if (emailResponse.error) {
          throw new Error(emailResponse.error.message);
        }

        // Log successful send
        const { error: logError } = await supabase
          .from('collection_email_logs')
          .insert({
            batch_id: batchId,
            contact_id: emailData.contactId,
            email_to: emailData.email,
            subject: emailData.subject,
            body_html: emailData.bodyHtml,
            installments_included: emailData.installments,
            status: 'sent',
            sent_at: new Date().toISOString()
          });

        if (logError) {
          console.error("Error logging email:", logError);
        }

        // Create collection attempts for each installment
        for (const installment of emailData.installments) {
          await supabase
            .from('collection_attempts')
            .insert({
              batch_id: batchId,
              contact_id: emailData.contactId,
              installment_id: installment.id,
              channel: 'email',
              status: 'sent',
              sent_at: new Date().toISOString(),
              message_content: emailData.subject
            });
        }

        results.push({
          contactId: emailData.contactId,
          email: emailData.email,
          status: 'sent',
          resendId: emailResponse.data?.id
        });
        sentCount++;

      } catch (error: any) {
        console.error(`Failed to send email to ${emailData.email}:`, error);

        // Log failed send
        await supabase
          .from('collection_email_logs')
          .insert({
            batch_id: batchId,
            contact_id: emailData.contactId,
            email_to: emailData.email,
            subject: emailData.subject,
            body_html: emailData.bodyHtml,
            installments_included: emailData.installments,
            status: 'failed',
            error_message: error?.message || 'Unknown error'
          });

        results.push({
          contactId: emailData.contactId,
          email: emailData.email,
          status: 'failed',
          error: error?.message || 'Unknown error'
        });
        failedCount++;
      }
    }

    // Update batch counts
    if (batchId) {
      const { error: updateError } = await supabase
        .from('collection_batches')
        .update({
          sent_count: sentCount,
          failed_count: failedCount,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', batchId);

      if (updateError) {
        console.error("Error updating batch:", updateError);
      }
    }

    console.log(`Completed: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        sent: sentCount,
        failed: failedCount,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-collection-emails:", error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
