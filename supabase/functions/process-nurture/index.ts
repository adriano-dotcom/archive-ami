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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check business hours (São Paulo timezone)
    const now = new Date();
    const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hour = spTime.getHours();
    const dayOfWeek = spTime.getDay(); // 0=Sun, 6=Sat

    if (hour < 9 || hour >= 18 || dayOfWeek === 0 || dayOfWeek === 6) {
      return new Response(
        JSON.stringify({ message: "Outside business hours, skipping" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch active enrollments with their sequences
    const { data: enrollments, error: enrollError } = await supabase
      .from("lead_nurture_enrollments")
      .select("*, nurture_sequences(*), contacts(id, phone_number, email, name)")
      .eq("status", "active");

    if (enrollError) throw enrollError;
    if (!enrollments || enrollments.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active enrollments", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const enrollment of enrollments) {
      try {
        const sequence = enrollment.nurture_sequences;
        if (!sequence || !sequence.is_active) continue;

        const steps = (sequence.steps || []) as Array<{
          day: number;
          channel: string;
          template_name?: string;
          subject?: string;
          content?: string;
        }>;

        if (steps.length === 0) continue;

        const enrolledAt = new Date(enrollment.enrolled_at);
        const daysSinceEnrollment = Math.floor(
          (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Find next step to execute
        const nextStepIndex = enrollment.current_step + 1;
        if (nextStepIndex >= steps.length) {
          // All steps done, mark completed
          await supabase
            .from("lead_nurture_enrollments")
            .update({ status: "completed", completed_at: new Date().toISOString() })
            .eq("id", enrollment.id);
          continue;
        }

        const nextStep = steps[nextStepIndex];
        if (nextStep.day > daysSinceEnrollment) continue; // Not time yet

        const contact = enrollment.contacts;
        if (!contact) continue;

        let stepStatus = "sent";
        let errorMessage: string | null = null;

        try {
          if (nextStep.channel === "whatsapp" && nextStep.template_name) {
            // Send WhatsApp template
            if (contact.phone_number) {
              const { error: sendErr } = await supabase.functions.invoke("send-whatsapp-template", {
                body: {
                  phone_number: contact.phone_number,
                  template_name: nextStep.template_name,
                  language_code: "pt_BR",
                },
              });
              if (sendErr) throw sendErr;
            } else {
              stepStatus = "failed";
              errorMessage = "Contact has no phone number";
            }
          } else if (nextStep.channel === "email" && nextStep.subject && nextStep.content) {
            // Send email via send-email edge function
            if (contact.email) {
              const { error: emailErr } = await supabase.functions.invoke("send-email", {
                body: {
                  to: contact.email,
                  subject: nextStep.subject,
                  html: nextStep.content.replace(/\{\{name\}\}/g, contact.name || ""),
                },
              });
              if (emailErr) throw emailErr;
            } else {
              stepStatus = "failed";
              errorMessage = "Contact has no email";
            }
          } else {
            stepStatus = "failed";
            errorMessage = "Invalid step configuration";
          }
        } catch (sendError) {
          stepStatus = "failed";
          errorMessage = sendError.message || "Send error";
        }

        // Log the step
        await supabase.from("nurture_step_logs").insert({
          enrollment_id: enrollment.id,
          step_index: nextStepIndex,
          channel: nextStep.channel,
          status: stepStatus,
          error_message: errorMessage,
        });

        // Update enrollment
        const isLastStep = nextStepIndex >= steps.length - 1;
        await supabase
          .from("lead_nurture_enrollments")
          .update({
            current_step: nextStepIndex,
            last_step_sent_at: new Date().toISOString(),
            ...(isLastStep && stepStatus === "sent"
              ? { status: "completed", completed_at: new Date().toISOString() }
              : {}),
          })
          .eq("id", enrollment.id);

        processed++;
      } catch (err) {
        console.error(`Error processing enrollment ${enrollment.id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ message: "Nurture processing complete", processed, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in process-nurture:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
