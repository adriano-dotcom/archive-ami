import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AppointmentSeed {
  title: string;
  description: string;
  date: string;
  time: string;
  duration: number;
  type: 'demo' | 'meeting' | 'support' | 'followup';
  attendees: string[];
  meeting_url?: string;
  status: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[seed-appointments] Starting seed process...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // --- Authorization: admin-only ---
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden - requires admin role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }



    // Get current date info
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Generate sample appointments for current month
    const appointments: AppointmentSeed[] = [
      {
        title: 'Demo - Sistema CRM',
        description: 'Demonstração completa do sistema para novo cliente',
        date: new Date(currentYear, currentMonth, 15).toISOString().split('T')[0],
        time: '10:00:00',
        duration: 60,
        type: 'demo',
        attendees: ['João Silva', 'Maria Santos'],
        meeting_url: 'https://meet.google.com/abc-defg-hij',
        status: 'scheduled'
      },
      {
        title: 'Reunião - Planejamento Q1',
        description: 'Reunião de planejamento trimestral',
        date: new Date(currentYear, currentMonth, 18).toISOString().split('T')[0],
        time: '14:00:00',
        duration: 90,
        type: 'meeting',
        attendees: ['Equipe Comercial'],
        status: 'scheduled'
      },
      {
        title: 'Suporte - Cliente ABC',
        description: 'Atendimento técnico para configuração',
        date: new Date(currentYear, currentMonth, 20).toISOString().split('T')[0],
        time: '09:30:00',
        duration: 45,
        type: 'support',
        attendees: ['Ana Costa'],
        status: 'scheduled'
      },
      {
        title: 'Follow-up - Proposta Empresa XYZ',
        description: 'Retorno sobre proposta enviada',
        date: new Date(currentYear, currentMonth, 22).toISOString().split('T')[0],
        time: '11:00:00',
        duration: 30,
        type: 'followup',
        attendees: ['Pedro Oliveira'],
        meeting_url: 'https://zoom.us/j/123456789',
        status: 'scheduled'
      },
      {
        title: 'Demo - Integração WhatsApp',
        description: 'Demonstração do módulo de WhatsApp',
        date: new Date(currentYear, currentMonth, 25).toISOString().split('T')[0],
        time: '15:00:00',
        duration: 60,
        type: 'demo',
        attendees: ['Carlos Mendes', 'Luciana Reis'],
        meeting_url: 'https://meet.google.com/xyz-abcd-efg',
        status: 'scheduled'
      },
      {
        title: 'Reunião - Revisão de Contrato',
        description: 'Discussão sobre renovação anual',
        date: new Date(currentYear, currentMonth, 28).toISOString().split('T')[0],
        time: '16:00:00',
        duration: 60,
        type: 'meeting',
        attendees: ['Roberto Lima'],
        status: 'scheduled'
      },
      {
        title: 'Suporte - Configuração IA',
        description: 'Ajuda com configuração do assistente Nina',
        date: new Date(currentYear, currentMonth, 12).toISOString().split('T')[0],
        time: '10:30:00',
        duration: 45,
        type: 'support',
        attendees: ['Fernanda Souza'],
        status: 'scheduled'
      },
      {
        title: 'Follow-up - Cliente Premium',
        description: 'Check-in mensal com cliente VIP',
        date: new Date(currentYear, currentMonth, 8).toISOString().split('T')[0],
        time: '14:30:00',
        duration: 30,
        type: 'followup',
        attendees: ['Eduardo Santos'],
        meeting_url: 'https://meet.google.com/premium-call',
        status: 'scheduled'
      }
    ];

    console.log(`[seed-appointments] Inserting ${appointments.length} appointments...`);

    const { data, error } = await supabase
      .from('appointments')
      .insert(appointments)
      .select();

    if (error) {
      console.error('[seed-appointments] Error inserting appointments:', error);
      throw error;
    }

    console.log(`[seed-appointments] Successfully inserted ${data?.length || 0} appointments`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${data?.length || 0} agendamentos criados com sucesso`,
        appointments: data
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[seed-appointments] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});