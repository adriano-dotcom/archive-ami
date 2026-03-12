import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DealActivity {
  id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  type: string;
  is_completed: boolean;
  created_by: string | null;
  deal: {
    id: string;
    title: string;
    contact_id: string;
    pipeline_id: string;
    owner_id: string | null;
    contact: {
      id: string;
      name: string | null;
      call_name: string | null;
      phone_number: string;
      company: string | null;
    } | null;
  } | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[DailyCallbacks] Starting daily callback reminders...');

    // Get today's date range in BRT
    const now = new Date();
    // BRT is UTC-3
    const brtOffset = -3 * 60 * 60 * 1000;
    const brtNow = new Date(now.getTime() + brtOffset);
    
    const todayStart = new Date(brtNow);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(brtNow);
    todayEnd.setHours(23, 59, 59, 999);

    // Convert back to UTC for database query
    const utcStart = new Date(todayStart.getTime() - brtOffset);
    const utcEnd = new Date(todayEnd.getTime() - brtOffset);

    console.log(`[DailyCallbacks] Looking for callbacks between ${utcStart.toISOString()} and ${utcEnd.toISOString()}`);

    // Fetch all callback activities scheduled for today
    const { data: rawActivities, error: activitiesError } = await supabase
      .from('deal_activities')
      .select(`
        id, 
        title, 
        description, 
        scheduled_at,
        type,
        is_completed,
        created_by,
        deal:deals(
          id, 
          title,
          contact_id,
          pipeline_id,
          owner_id,
          contact:contacts(
            id,
            name, 
            call_name,
            phone_number,
            company
          )
        )
      `)
      .gte('scheduled_at', utcStart.toISOString())
      .lte('scheduled_at', utcEnd.toISOString())
      .eq('type', 'call')
      .eq('is_completed', false);

    if (activitiesError) {
      console.error('[DailyCallbacks] Error fetching activities:', activitiesError);
      throw activitiesError;
    }

    if (!rawActivities || rawActivities.length === 0) {
      console.log('[DailyCallbacks] No callbacks scheduled for today');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No callbacks for today',
        count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normalize activities to handle array results from Supabase
    const activities: DealActivity[] = rawActivities.map((a: any) => ({
      ...a,
      deal: Array.isArray(a.deal) ? a.deal[0] : a.deal,
    })).map((a: any) => ({
      ...a,
      deal: a.deal ? {
        ...a.deal,
        contact: Array.isArray(a.deal.contact) ? a.deal.contact[0] : a.deal.contact
      } : null
    }));

    console.log(`[DailyCallbacks] Found ${activities.length} callbacks for today`);

    // Get team members for lookup
    const memberIds = [...new Set(activities.map(a => a.deal?.owner_id || a.created_by).filter(Boolean))];
    
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, name, email')
      .in('id', memberIds);

    const memberMap = new Map((teamMembers || []).map((m: any) => [m.id, m]));

    // Group activities by assignee (owner or created_by)
    const byAssignee = new Map<string, DealActivity[]>();
    
    for (const activity of activities) {
      const assigneeId = activity.deal?.owner_id || activity.created_by;
      if (!assigneeId) continue;
      
      if (!byAssignee.has(assigneeId)) {
        byAssignee.set(assigneeId, []);
      }
      byAssignee.get(assigneeId)!.push(activity);
    }

    console.log(`[DailyCallbacks] Grouped into ${byAssignee.size} assignees`);

    // Send email to each assignee
    let emailsSent = 0;
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    for (const [assigneeId, tasks] of byAssignee.entries()) {
      const assignee = memberMap.get(assigneeId);
      if (!assignee?.email) {
        console.log(`[DailyCallbacks] No email for assignee ${assigneeId}, skipping`);
        continue;
      }

      // Sort tasks by scheduled time
      tasks.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

      // Generate HTML table of callbacks
      const tasksHtml = tasks.map(t => {
        const scheduledTime = new Date(t.scheduled_at).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo'
        });
        const contactName = t.deal?.contact?.name || t.deal?.contact?.call_name || 'N/A';
        const phone = t.deal?.contact?.phone_number || 'N/A';
        const company = t.deal?.contact?.company || '';
        
        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; font-weight: bold; color: #3b82f6;">${scheduledTime}</td>
            <td style="padding: 12px;">
              <strong>${contactName}</strong>
              ${company ? `<br><span style="color: #666; font-size: 12px;">${company}</span>` : ''}
            </td>
            <td style="padding: 12px;">
              <a href="https://wa.me/${phone.replace(/\D/g, '')}" style="color: #22c55e; text-decoration: none;">
                ${phone}
              </a>
            </td>
            <td style="padding: 12px; color: #666; font-size: 13px;">${t.title}</td>
          </tr>
        `;
      }).join('');

      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📞 Callbacks de Hoje</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">
              ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          </div>
          
          <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
            <p style="margin: 0 0 16px; color: #334155;">
              Bom dia, <strong>${assignee.name}</strong>! 👋
            </p>
            <p style="margin: 0 0 24px; color: #334155;">
              Você tem <strong style="color: #3b82f6; font-size: 18px;">${tasks.length}</strong> lead${tasks.length > 1 ? 's' : ''} para retornar hoje:
            </p>
            
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <thead>
                <tr style="background: #f1f5f9;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b;">Horário</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b;">Lead</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b;">Telefone</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b;">Assunto</th>
                </tr>
              </thead>
              <tbody>
                ${tasksHtml}
              </tbody>
            </table>
            
            <div style="margin-top: 24px; padding: 16px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                💡 <strong>Dica:</strong> Clique no número do telefone para abrir o WhatsApp diretamente.
              </p>
            </div>
            
            <div style="margin-top: 24px; text-align: center;">
              <a href="https://app.orbepet.com.br/scheduling" 
                 style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                Ver Agenda Completa
              </a>
            </div>
          </div>
          
          <div style="text-align: center; padding: 16px; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">OrbePet CRM • Enviado automaticamente às 8h</p>
          </div>
        </div>
      `;

      if (resend) {
        try {
          const { error: emailError } = await resend.emails.send({
            from: 'Jacometo CRM <notificacoes@resend.dev>',
            to: [assignee.email],
            subject: `📞 ${tasks.length} callback${tasks.length > 1 ? 's' : ''} agendado${tasks.length > 1 ? 's' : ''} para hoje`,
            html: emailHtml
          });

          if (emailError) {
            console.error(`[DailyCallbacks] Error sending email to ${assignee.email}:`, emailError);
          } else {
            console.log(`[DailyCallbacks] ✅ Email sent to ${assignee.email} with ${tasks.length} callbacks`);
            emailsSent++;
          }
        } catch (e) {
          console.error(`[DailyCallbacks] Exception sending email to ${assignee.email}:`, e);
        }
      } else {
        console.log(`[DailyCallbacks] RESEND_API_KEY not configured, would send email to ${assignee.email}`);
      }
    }

    console.log(`[DailyCallbacks] ✅ Completed. Sent ${emailsSent} reminder emails.`);

    return new Response(JSON.stringify({ 
      success: true, 
      totalCallbacks: activities.length,
      assignees: byAssignee.size,
      emailsSent 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[DailyCallbacks] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
