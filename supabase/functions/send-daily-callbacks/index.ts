import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CallbackAppointment {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string;
  type: string;
  status: string | null;
  attendees: string[] | null;
  contact: {
    id: string;
    name: string | null;
    call_name: string | null;
    phone_number: string;
    company: string | null;
  } | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard: internal service-role (cron/triggers/bridge) OR authenticated staff (admin/operator) ---
  {
    const _supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const _svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const _anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const _token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const _cronSecret = Deno.env.get('INTERNAL_CRON_SECRET') || '';
    const _isInternalCron = !!_cronSecret && req.headers.get('x-internal-secret') === _cronSecret;
    if (_token !== _svcKey && !_isInternalCron) {
      if (!_token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const _authClient = createClient(_supabaseUrl, _anonKey, { global: { headers: { Authorization: `Bearer ${_token}` } } });
      const { data: _authData, error: _authErr } = await _authClient.auth.getUser();
      if (_authErr || !_authData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: _roleRows } = await _authClient.from('user_roles').select('role').eq('user_id', _authData.user.id);
      if (!(_roleRows || []).some((r: any) => r.role === 'admin' || r.role === 'operator')) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }
  }


  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[DailyCallbacks] Starting daily callback reminders...');

    // Today's date in BRT (UTC-3)
    const now = new Date();
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const todayStr = brtNow.toISOString().split('T')[0];

    console.log(`[DailyCallbacks] Looking for callbacks scheduled on ${todayStr}`);

    // Fetch all callback appointments scheduled for today
    const { data: rawAppointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select(`
        id,
        title,
        description,
        date,
        time,
        type,
        status,
        attendees,
        contact:contacts(
          id,
          name,
          call_name,
          phone_number,
          company
        )
      `)
      .eq('date', todayStr)
      .eq('type', 'followup')
      .neq('status', 'cancelled');

    if (appointmentsError) {
      console.error('[DailyCallbacks] Error fetching appointments:', appointmentsError);
      throw new Error(appointmentsError.message || 'Failed to fetch appointments');
    }

    if (!rawAppointments || rawAppointments.length === 0) {
      console.log('[DailyCallbacks] No callbacks scheduled for today');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No callbacks for today',
        count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const appointments: CallbackAppointment[] = rawAppointments.map((a: any) => ({
      ...a,
      contact: Array.isArray(a.contact) ? a.contact[0] : a.contact,
    }));

    console.log(`[DailyCallbacks] Found ${appointments.length} callbacks for today`);

    // Active team members are the possible recipients
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, name, email')
      .eq('status', 'active');

    const members = (teamMembers || []).filter((m: any) => m.email);
    if (members.length === 0) {
      console.log('[DailyCallbacks] No active team members with email');
      return new Response(JSON.stringify({ success: true, count: appointments.length, emailsSent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group appointments by recipient: named attendee, or everyone when unassigned
    const byAssignee = new Map<string, CallbackAppointment[]>();
    const push = (id: string, appt: CallbackAppointment) => {
      if (!byAssignee.has(id)) byAssignee.set(id, []);
      byAssignee.get(id)!.push(appt);
    };

    for (const appt of appointments) {
      const names = (appt.attendees || []).map((n) => String(n).toLowerCase());
      const matched = members.filter((m: any) => names.includes(String(m.name || '').toLowerCase()));
      if (matched.length > 0) {
        matched.forEach((m: any) => push(m.id, appt));
      } else {
        members.forEach((m: any) => push(m.id, appt));
      }
    }

    const memberMap = new Map(members.map((m: any) => [m.id, m]));

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
      tasks.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      // Generate HTML table of callbacks
      const tasksHtml = tasks.map(t => {
        const scheduledTime = (t.time || '').slice(0, 5);
        const contactName = t.contact?.name || t.contact?.call_name || 'N/A';
        const phone = t.contact?.phone_number || 'N/A';
        const company = t.contact?.company || '';
        
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
            from: 'OrbePet CRM <notificacoes@resend.dev>',
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
