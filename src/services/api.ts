import { supabase } from '@/integrations/supabase/client';
import { 
  Contact, 
  StatMetric, 
  TeamMember, 
  Appointment, 
  DBConversation,
  DBMessage,
  UIConversation,
  transformDBToUIConversation
} from '../types';
import { MOCK_CONTACTS, MOCK_TEAM, MOCK_APPOINTMENTS } from '../constants';

// Helper functions for dashboard metrics
const formatResponseTime = (ms: number): string => {
  if (!ms || ms === 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const calculateTrend = (today: number, yesterday: number): string => {
  if (yesterday === 0) return today > 0 ? '+100%' : '0%';
  const diff = ((today - yesterday) / yesterday) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const getDayName = (date: Date): string => {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return days[date.getDay()];
};

const getDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const api = {
  /**
   * Fetch dashboard metrics with real data from Supabase
   * @param days - Number of days to fetch (1 = today, 7 = last 7 days, 30 = last 30 days)
   */
  fetchDashboardMetrics: async (days: number = 1): Promise<StatMetric[]> => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    
    // Period start
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);
    const periodStartStr = periodStart.toISOString();
    
    // Previous period for comparison
    const prevPeriodEnd = new Date(periodStart);
    prevPeriodEnd.setMilliseconds(-1);
    const prevPeriodEndStr = prevPeriodEnd.toISOString();
    
    const prevPeriodStart = new Date(periodStart);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - days);
    const prevPeriodStartStr = prevPeriodStart.toISOString();

    try {
      // Fetch all metrics in parallel
      const [
        messagesPeriodResult,
        messagesPrevResult,
        contactsPeriodResult,
        contactsPrevResult,
        appointmentsPeriodResult,
        appointmentsPrevResult,
        avgResponseResult
      ] = await Promise.all([
        // Messages in period
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .gte('sent_at', periodStartStr),
        // Messages in previous period
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .gte('sent_at', prevPeriodStartStr)
          .lt('sent_at', periodStartStr),
        // New contacts in period
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', periodStartStr),
        // New contacts in previous period
        supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        // Appointments in period
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', periodStartStr),
        // Appointments in previous period
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        // Average response time (for the period)
        supabase
          .from('messages')
          .select('nina_response_time')
          .not('nina_response_time', 'is', null)
          .gt('nina_response_time', 0)
          .gte('sent_at', periodStartStr)
      ]);

      const messagesPeriod = messagesPeriodResult.count || 0;
      const messagesPrev = messagesPrevResult.count || 0;
      const contactsPeriod = contactsPeriodResult.count || 0;
      const contactsPrev = contactsPrevResult.count || 0;
      
      // Conversões = appointments agendados
      const conversionsPeriod = appointmentsPeriodResult.count || 0;
      const conversionsPrev = appointmentsPrevResult.count || 0;
      
      const responseTimes = (avgResponseResult.data?.map(m => m.nina_response_time).filter(Boolean) || []) as number[];
      const avgResponseMs = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      return [
        {
          label: 'Atendimentos',
          value: messagesPeriod.toString(),
          trend: calculateTrend(messagesPeriod, messagesPrev),
          trendUp: messagesPeriod >= messagesPrev
        },
        {
          label: 'Tempo Médio',
          value: formatResponseTime(avgResponseMs),
          trend: '-',
          trendUp: true
        },
        {
          label: 'Novos Leads',
          value: contactsPeriod.toString(),
          trend: calculateTrend(contactsPeriod, contactsPrev),
          trendUp: contactsPeriod >= contactsPrev
        }
      ];
    } catch (error) {
      console.error('[API] Error fetching dashboard metrics:', error);
      // Return fallback metrics
      return [
        { label: 'Atendimentos', value: '0', trend: '0%', trendUp: true },
        { label: 'Tempo Médio', value: '0s', trend: '-', trendUp: true },
        { label: 'Novos Leads', value: '0', trend: '0%', trendUp: true }
      ];
    }
  },

  /**
   * Fetch chart data for the specified number of days
   * @param days - Number of days to fetch
   */
  fetchChartData: async (days: number = 7): Promise<any[]> => {
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (days - 1));
    periodStart.setHours(0, 0, 0, 0);

    try {
      const [messagesResult, appointmentsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('sent_at')
          .gte('sent_at', periodStart.toISOString()),
        supabase
          .from('appointments')
          .select('created_at')
          .gte('created_at', periodStart.toISOString())
      ]);

      // Group messages by day
      const messagesMap = new Map<string, number>();
      (messagesResult.data || []).forEach(m => {
        const dateStr = getDateString(new Date(m.sent_at));
        messagesMap.set(dateStr, (messagesMap.get(dateStr) || 0) + 1);
      });

      // Group conversions by day (appointments)
      const conversionsMap = new Map<string, number>();
      (appointmentsResult.data || []).forEach(a => {
        if (a.created_at) {
          const dateStr = getDateString(new Date(a.created_at));
          conversionsMap.set(dateStr, (conversionsMap.get(dateStr) || 0) + 1);
        }
      });

      // Generate days
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = getDateString(date);
        
        // Format name based on number of days
        let name: string;
        if (days === 1) {
          name = 'Hoje';
        } else if (days <= 7) {
          name = getDayName(date);
        } else {
          name = `${date.getDate()}/${date.getMonth() + 1}`;
        }
        
        result.push({
          name,
          chats: messagesMap.get(dateStr) || 0,
          sales: conversionsMap.get(dateStr) || 0
        });
      }

      return result;
    } catch (error) {
      console.error('[API] Error fetching chart data:', error);
      // Return empty data
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        result.push({
          name: days === 1 ? 'Hoje' : (days <= 7 ? getDayName(date) : `${date.getDate()}/${date.getMonth() + 1}`),
          chats: 0,
          sales: 0
        });
      }
      return result;
    }
  },

  /**
   * Fetch contacts from database with conversation/policies data
   */
  fetchContacts: async (): Promise<Contact[]> => {
    // Fetch contacts
    const { data: contactsData, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(500);

    if (contactsError) {
      console.error('[API] Error fetching contacts:', contactsError);
      return MOCK_CONTACTS;
    }

    if (!contactsData || contactsData.length === 0) {
      return MOCK_CONTACTS;
    }

    const contactIds = contactsData.map(c => c.id);
    const [conversationsResult, policiesResult, installmentsResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('contact_id, is_active, status, updated_at')
        .in('contact_id', contactIds)
        .order('updated_at', { ascending: false }),
      supabase
        .from('policies')
        .select('id, contact_id, insurer')
        .in('contact_id', contactIds),
      supabase
        .from('installments')
        .select('contact_id, value, status, days_overdue')
        .in('contact_id', contactIds)
        .eq('status', 'overdue')
    ]);

    const conversationsData = conversationsResult.data;
    const policiesData = policiesResult.data;
    const installmentsData = installmentsResult.data;

    // Create a map of contact_id to conversation info (most recent conversation per contact)
    const conversationsByContact = new Map<string, any>();
    (conversationsData || []).forEach(conv => {
      if (!conversationsByContact.has(conv.contact_id)) {
        conversationsByContact.set(conv.contact_id, conv);
      }
    });

    // Create maps for policies count and insurers
    const policiesByContact = new Map<string, { count: number; insurers: Set<string> }>();
    (policiesData || []).forEach(policy => {
      const existing = policiesByContact.get(policy.contact_id!) || { count: 0, insurers: new Set<string>() };
      existing.count += 1;
      if (policy.insurer) existing.insurers.add(policy.insurer);
      policiesByContact.set(policy.contact_id!, existing);
    });

    // Create maps for overdue installments
    const overdueByContact = new Map<string, { totalValue: number; maxDays: number }>();
    (installmentsData || []).forEach(inst => {
      const existing = overdueByContact.get(inst.contact_id!) || { totalValue: 0, maxDays: 0 };
      existing.totalValue += Number(inst.value) || 0;
      existing.maxDays = Math.max(existing.maxDays, inst.days_overdue || 0);
      overdueByContact.set(inst.contact_id!, existing);
    });

    // Format CNPJ for display
    const formatCNPJDisplay = (cnpj: string | null) => {
      if (!cnpj) return undefined;
      const digits = cnpj.replace(/\D/g, '');
      if (digits.length !== 14) return cnpj;
      return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
    };

    // Format CPF for display
    const formatCPFDisplay = (cpf: string | null) => {
      if (!cpf) return undefined;
      const digits = cpf.replace(/\D/g, '');
      if (digits.length !== 11) return cpf;
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
    };

    return contactsData.map(c => {
      const conversation = conversationsByContact.get(c.id);
      const policyData = policiesByContact.get(c.id);
      const overdueData = overdueByContact.get(c.id);

      return {
        id: c.id,
        name: c.name || c.call_name || c.phone_number,
        phone: c.phone_number,
        email: c.email || '',
        company: (c as any).company || undefined,
        cnpj: formatCNPJDisplay((c as any).cnpj),
        cpf: formatCPFDisplay((c as any).cpf),
        cep: (c as any).cep || undefined,
        street: (c as any).street || undefined,
        number: (c as any).number || undefined,
        complement: (c as any).complement || undefined,
        neighborhood: (c as any).neighborhood || undefined,
        city: (c as any).city || undefined,
        state: (c as any).state || undefined,
        notes: c.notes || undefined,
        status: ((c as any).lead_status || 'new') as 'new' | 'lead' | 'qualified' | 'customer' | 'churned',
        lastContact: new Date(c.last_activity).toLocaleDateString('pt-BR'),
        created_at: c.created_at,
        lead_source: (c as any).lead_source || 'inbound',
        whatsapp_id: c.whatsapp_id || undefined,
        utm_source: (c as any).utm_source || undefined,
        utm_campaign: (c as any).utm_campaign || undefined,
        utm_content: (c as any).utm_content || undefined,
        utm_term: (c as any).utm_term || undefined,
        campaign: (c as any).campaign || undefined,
        vertical: (c as any).vertical || undefined,
        // Conversation data
        conversationActive: conversation?.is_active ?? null,
        conversationStatus: conversation?.status || undefined,
        // Policies data (segurados)
        policiesCount: policyData?.count || 0,
        insurers: policyData ? Array.from(policyData.insurers) : [],
        overdueValue: overdueData?.totalValue || 0,
        maxDaysOverdue: overdueData?.maxDays || 0,
      };
    });
  },

  /**
   * Update contact lead status
   */
  updateContactStatus: async (id: string, status: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ lead_status: status })
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating contact status:', error);
      throw error;
    }
  },

  /**
   * Update contact in database
   */
  updateContact: async (id: string, data: {
    name?: string;
    phone_number?: string;
    email?: string | null;
    company?: string | null;
    cnpj?: string | null;
    cpf?: string | null;
    pet_name?: string | null;
    fleet_size?: number | null;
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    notes?: string | null;
    campaign?: string | null;
    vertical?: string | null;
  }): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating contact:', error);
      throw error;
    }
  },

  /**
   * Update campaign for multiple contacts
   */
  updateContactsCampaign: async (contactIds: string[], campaign: string | null): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ campaign, updated_at: new Date().toISOString() })
      .in('id', contactIds);

    if (error) {
      console.error('[API] Error updating contacts campaign:', error);
      throw error;
    }
  },

  /**
   * Delete contact and all related data (conversations, messages)
   */
  deleteContact: async (id: string): Promise<void> => {
    // Delete messages for conversations of this contact
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', id);

    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map(c => c.id);
      
      // Delete messages
      const { error: messagesError } = await supabase
        .from('messages')
        .delete()
        .in('conversation_id', conversationIds);

      if (messagesError) {
        console.error('[API] Error deleting messages:', messagesError);
      }

      // Delete from nina_processing_queue
      await supabase
        .from('nina_processing_queue')
        .delete()
        .in('conversation_id', conversationIds);

      // Delete from send_queue
      await supabase
        .from('send_queue')
        .delete()
        .in('conversation_id', conversationIds);

      // Delete conversations
      const { error: conversationsError } = await supabase
        .from('conversations')
        .delete()
        .eq('contact_id', id);

      if (conversationsError) {
        console.error('[API] Error deleting conversations:', conversationsError);
      }
    }

    // Delete call logs
    await supabase
      .from('call_logs')
      .delete()
      .eq('contact_id', id);

    // Finally delete the contact
    const { error: contactError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (contactError) {
      console.error('[API] Error deleting contact:', contactError);
      throw contactError;
    }
  },

  /**
   * Fetch team members from database
   */
  fetchTeam: async (): Promise<TeamMember[]> => {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        *,
        team:teams(*),
        function:team_functions(*)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching team members:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role as 'admin' | 'manager' | 'agent',
      status: m.status as 'active' | 'invited' | 'disabled',
      avatar: m.avatar || `https://ui-avatars.com/api/?name=${m.name.replace(' ', '+')}&background=random`,
      lastActive: m.last_active || undefined,
      team_id: m.team_id,
      function_id: m.function_id,
      weight: m.weight ?? undefined,
      team: m.team as any,
      function: m.function as any
    }));
  },

  /**
   * Create pending invite for a user
   */
  createPendingInvite: async (invite: {
    email: string;
    app_role: 'admin' | 'operator';
    team_member_id: string;
  }): Promise<void> => {
    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('pending_invites')
      .upsert({
        email: invite.email,
        app_role: invite.app_role,
        team_member_id: invite.team_member_id,
        invited_by: userData.user?.id
      }, { onConflict: 'email' });
    
    if (error) {
      console.error('[API] Error creating pending invite:', error);
      throw error;
    }
  },

  /**
   * Create team member
   */
  createTeamMember: async (member: {
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'agent';
    team_id?: string;
    function_id?: string;
    weight?: number;
  }): Promise<TeamMember> => {
    const { data, error } = await supabase
      .from('team_members')
      .insert({
        name: member.name,
        email: member.email,
        role: member.role,
        team_id: member.team_id,
        function_id: member.function_id,
        weight: member.weight || 1,
        status: 'invited'
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team member:', error);
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role as 'admin' | 'manager' | 'agent',
      status: data.status as 'active' | 'invited' | 'disabled',
      avatar: data.avatar || `https://ui-avatars.com/api/?name=${data.name.replace(' ', '+')}&background=random`,
      team_id: data.team_id,
      function_id: data.function_id,
      weight: data.weight ?? undefined
    };
  },

  /**
   * Update team member
   */
  updateTeamMember: async (id: string, updates: Partial<{
    name: string;
    email: string;
    role: 'admin' | 'manager' | 'agent';
    status: 'active' | 'invited' | 'disabled';
    team_id: string | null;
    function_id: string | null;
    weight: number;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team member:', error);
      throw error;
    }
  },

  /**
   * Fetch teams
   */
  fetchTeams: async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching teams:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create team
   */
  createTeam: async (team: { name: string; description?: string; color?: string }) => {
    const { data, error } = await supabase
      .from('teams')
      .insert({
        name: team.name,
        description: team.description,
        color: team.color || '#3b82f6'
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update team
   */
  updateTeam: async (id: string, updates: Partial<{ name: string; description: string; color: string }>) => {
    const { error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team:', error);
      throw error;
    }
  },

  /**
   * Delete team
   */
  deleteTeam: async (id: string) => {
    const { error } = await supabase
      .from('teams')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team:', error);
      throw error;
    }
  },

  /**
   * Fetch team functions
   */
  fetchTeamFunctions: async () => {
    const { data, error } = await supabase
      .from('team_functions')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching team functions:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create team function
   */
  createTeamFunction: async (func: { name: string; description?: string }) => {
    const { data, error } = await supabase
      .from('team_functions')
      .insert({
        name: func.name,
        description: func.description
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating team function:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update team function
   */
  updateTeamFunction: async (id: string, updates: Partial<{ name: string; description: string }>) => {
    const { error } = await supabase
      .from('team_functions')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating team function:', error);
      throw error;
    }
  },

  /**
   * Delete team function
   */
  deleteTeamFunction: async (id: string) => {
    const { error } = await supabase
      .from('team_functions')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting team function:', error);
      throw error;
    }
  },

  /**
   * Fetch sellers
   */
  fetchSellers: async () => {
    const { data, error } = await supabase
      .from('sellers')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching sellers:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Create seller
   */
  createSeller: async (seller: { name: string; email: string; phone?: string }) => {
    const { data, error } = await supabase
      .from('sellers')
      .insert({
        name: seller.name,
        email: seller.email,
        phone: seller.phone || null
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating seller:', error);
      throw error;
    }

    return data;
  },

  /**
   * Update seller
   */
  updateSeller: async (id: string, updates: Partial<{ name: string; email: string; phone: string; is_active: boolean }>) => {
    const { error } = await supabase
      .from('sellers')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating seller:', error);
      throw error;
    }
  },

  /**
   * Delete seller (soft delete)
   */
  deleteSeller: async (id: string) => {
    const { error } = await supabase
      .from('sellers')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting seller:', error);
      throw error;
    }
  },

  /**
   * Fetch appointments from database
   */
  fetchAppointments: async (): Promise<Appointment[]> => {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('[API] Error fetching appointments:', error);
      return MOCK_APPOINTMENTS; // Fallback to mock data
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data.map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      time: a.time,
      duration: a.duration,
      type: a.type as 'demo' | 'meeting' | 'support' | 'followup',
      description: a.description ?? undefined,
      attendees: a.attendees || []
    }));
  },

  /**
   * Create new appointment
   */
  createAppointment: async (appointment: {
    title: string;
    description?: string;
    date: string;
    time: string;
    duration?: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    attendees?: string[];
    contact_id?: string;
    meeting_url?: string;
  }): Promise<Appointment> => {
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        title: appointment.title,
        description: appointment.description,
        date: appointment.date,
        time: appointment.time,
        duration: appointment.duration || 60,
        type: appointment.type,
        attendees: appointment.attendees || [],
        contact_id: appointment.contact_id,
        meeting_url: appointment.meeting_url,
        status: 'scheduled'
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating appointment:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      date: data.date,
      time: data.time,
      duration: data.duration,
      type: data.type as 'demo' | 'meeting' | 'support' | 'followup',
      description: data.description ?? undefined,
      attendees: data.attendees || []
    };
  },

  /**
   * Update existing appointment
   */
  updateAppointment: async (id: string, updates: Partial<{
    title: string;
    description: string;
    date: string;
    time: string;
    duration: number;
    type: 'demo' | 'meeting' | 'support' | 'followup';
    attendees: string[];
    meeting_url: string;
    status: string;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating appointment:', error);
      throw error;
    }
  },

  /**
   * Delete appointment
   */
  deleteAppointment: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting appointment:', error);
      throw error;
    }
  },

  /**
   * Fetch conversations with messages from database
   */
  fetchConversations: async (includeConversationId?: string): Promise<UIConversation[]> => {
    console.log('[API] Fetching conversations from Supabase...');
    
    // Fetch active conversations with contact data and agent data
    let query = supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*, linked_company:companies(id, razao_social, nome_fantasia, cnpj)),
        agent:agents(id, name, slug),
        whatsapp_window_start
      `)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false })
      .limit(100);

    const { data: conversations, error: convError } = await query;
    
    // If we need to include a specific conversation that might not be in the top 50
    let allConversations = conversations || [];
    if (includeConversationId && !allConversations.some(c => c.id === includeConversationId)) {
      const { data: specificConv } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*, linked_company:companies(id, razao_social, nome_fantasia, cnpj)),
          agent:agents(id, name, slug),
          whatsapp_window_start
        `)
        .eq('id', includeConversationId)
        .single();
      
      if (specificConv) {
        allConversations = [specificConv, ...allConversations];
      }
    }

    if (convError) {
      console.error('[API] Error fetching conversations:', convError);
      throw convError;
    }

    if (allConversations.length === 0) {
      console.log('[API] No conversations found');
      return [];
    }

    console.log(`[API] Found ${allConversations.length} conversations`);

    // OPTIMIZED: single batch query for all messages instead of N+1
    const conversationIds = allConversations.map(c => c.id);
    const { data: allMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .order('sent_at', { ascending: true });

    if (msgError) {
      console.error('[API] Error fetching messages batch:', msgError);
    }

    // Group messages by conversation_id
    const messagesByConv = new Map<string, DBMessage[]>();
    for (const msg of (allMessages || []) as unknown as DBMessage[]) {
      const arr = messagesByConv.get(msg.conversation_id) || [];
      arr.push(msg);
      messagesByConv.set(msg.conversation_id, arr);
    }

    const conversationsWithMessages: UIConversation[] = allConversations.map((conv) => {
      const enrichedConv = {
        ...conv,
        assignedUserName: (conv as any).assigned_user_name || null,
      };
      return transformDBToUIConversation(
        enrichedConv as unknown as DBConversation,
        messagesByConv.get(conv.id) || []
      );
    });

    return conversationsWithMessages;
  },

  /**
   * Send a message (insert into send_queue for human messages)
   * Returns the ID of the created message
   * @param operatorName - Optional operator name to display in WhatsApp message
   */
  sendMessage: async (conversationId: string, content: string, operatorName?: string): Promise<string> => {
    console.log(`[API] Sending message to conversation ${conversationId}`);

    // Get conversation to find contact_id
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[API] Error getting conversation:', convError);
      throw new Error('Conversation not found');
    }

    // Format content for WhatsApp (with operator name on separate line)
    const whatsappContent = operatorName 
      ? `*${operatorName.toUpperCase()}:*\n${content}` 
      : content;

    // First create the message record with status 'processing'
    // Store original content (without prefix) + sender_name in metadata
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: content,
        type: 'text',
        from_type: 'human',
        status: 'processing',
        sent_at: new Date().toISOString(),
        metadata: operatorName ? { sender_name: operatorName } : {}
      })
      .select('id')
      .single();

    if (msgError || !msgData) {
      console.error('[API] Error creating message record:', msgError);
      throw new Error('Failed to create message record');
    }

    console.log('[API] Message created with ID:', msgData.id);

    // Then queue message for sending WITH formatted content for WhatsApp
    const { error: sendError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        content: whatsappContent, // Formatted with operator name
        from_type: 'human',
        message_type: 'text',
        priority: 2, // Higher priority for human messages
        message_id: msgData.id  // Reference to the pre-created message
      });

    if (sendError) {
      console.error('[API] Error queuing message:', sendError);
      throw sendError;
    }

    console.log('[API] Message queued for sending');

    // Trigger whatsapp-sender to process the queue immediately
    try {
      console.log('[API] Triggering whatsapp-sender...');
      const { error: triggerError } = await supabase.functions.invoke('whatsapp-sender');
      
      if (triggerError) {
        console.error('[API] Error triggering whatsapp-sender:', triggerError);
        // Don't throw - message is in queue and will be processed eventually
      } else {
        console.log('[API] whatsapp-sender triggered successfully');
      }
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender:', err);
      // Don't throw - message is in queue
    }

    return msgData.id;
  },

  /**
   * Update conversation status (nina/human/paused)
   * When switching to 'human', also assigns the current user
   */
  updateConversationStatus: async (
    conversationId: string, 
    status: 'nina' | 'human' | 'paused' | 'closed',
    userId?: string,
    userName?: string
  ): Promise<void> => {
    const updateData: any = { status };
    
    // When switching to human, assign the current user and save their name
    if (status === 'human' && userId) {
      updateData.assigned_user_id = userId;
      if (userName) {
        updateData.assigned_user_name = userName;
      }
    }
    // When switching back to nina, clear the assignment
    if (status === 'nina') {
      updateData.assigned_user_id = null;
      updateData.assigned_user_name = null;
    }
    
    const { error } = await supabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error updating conversation status:', error);
      throw error;
    }

    console.log(`[API] Conversation ${conversationId} status updated to ${status}`);
  },

  /**
   * Mark all unread messages in a conversation as read
   */
  markMessagesAsRead: async (conversationId: string): Promise<void> => {
    const { error } = await supabase
      .from('messages')
      .update({ 
        status: 'read',
        read_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('from_type', 'user')
      .in('status', ['sent', 'delivered']);

    if (error) {
      console.error('[API] Error marking messages as read:', error);
      throw error;
    }

    console.log(`[API] Messages marked as read for conversation ${conversationId}`);
  },

  /**
   * Assign conversation to a team member
   */
  assignConversation: async (conversationId: string, userId: string | null, _contactId: string): Promise<void> => {
    // Update conversation
    const { error: convError } = await supabase
      .from('conversations')
      .update({ assigned_user_id: userId })
      .eq('id', conversationId);

    if (convError) {
      console.error('[API] Error assigning conversation:', convError);
      throw convError;
    }

    console.log(`[API] Conversation ${conversationId} assigned to user ${userId}`);
  },

  /**
   * Update contact notes
   */
  updateContactNotes: async (contactId: string, notes: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ notes })
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error updating contact notes:', error);
      throw error;
    }
  },

  /**
   * Block/unblock contact
   */
  toggleContactBlock: async (contactId: string, blocked: boolean, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ 
        is_blocked: blocked,
        blocked_at: blocked ? new Date().toISOString() : null,
        blocked_reason: blocked ? reason : null
      })
      .eq('id', contactId);

    if (error) {
      console.error('[API] Error toggling contact block:', error);
      throw error;
    }
  },

  /**
   * Fetch tag definitions
   */
  fetchTagDefinitions: async () => {
    const { data, error } = await supabase
      .from('tag_definitions')
      .select('*')
      .eq('is_active', true)
      .order('category', { ascending: true });
    
    if (error) {
      console.error('[API] Error fetching tag definitions:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Update contact tags
   */
  updateContactTags: async (contactId: string, tags: string[]): Promise<void> => {
    const { error } = await supabase
      .from('contacts')
      .update({ tags })
      .eq('id', contactId);
    
    if (error) {
      console.error('[API] Error updating contact tags:', error);
      throw error;
    }
  },

  /**
   * Create new tag definition
   */
  createTagDefinition: async (tag: { key: string; label: string; color: string; category: string }) => {
    const { data, error } = await supabase
      .from('tag_definitions')
      .insert({
        key: tag.key,
        label: tag.label,
        color: tag.color,
        category: tag.category,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      console.error('[API] Error creating tag definition:', error);
      throw error;
    }
    return data;
  },

  /**
   * Fetch recent messages for a conversation (for deal drawer)
   */
  fetchConversationMessages: async (conversationId: string, limit: number = 10): Promise<any[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, from_type, type, sent_at, media_url')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[API] Error fetching conversation messages:', error);
      return [];
    }

    return (data || []).reverse(); // Reverter para ordem cronológica
  },


  /**
   * Get existing conversation for a contact or create a new one
   * Searches by contact_id AND by normalized phone number to avoid duplicates
   * @param contactId - The contact ID to find or create conversation for
   * @returns The conversation ID (existing or newly created)
   */
  getOrCreateConversation: async (contactId: string): Promise<string> => {
    // First, get the contact's phone number to search by normalized number
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('phone_number, whatsapp_id')
      .eq('id', contactId)
      .single();

    if (contactError) {
      console.error('[API] Error fetching contact:', contactError);
      throw contactError;
    }

    // Normalize phone number and create variations (with/without 9th digit)
    const phoneDigits = contact?.phone_number?.replace(/\D/g, '') || '';
    const whatsappDigits = contact?.whatsapp_id?.replace(/\D/g, '') || '';
    
    const phoneVariations = new Set<string>();
    [phoneDigits, whatsappDigits].filter(Boolean).forEach(digits => {
      phoneVariations.add(digits);
      // If 13 digits (55 + DDD + 9 + 8 digits), create version without 9th digit
      if (digits.length === 13) {
        phoneVariations.add(digits.slice(0, 4) + digits.slice(5));
      }
      // If 12 digits (55 + DDD + 8 digits old format), create version with 9th digit
      else if (digits.length === 12) {
        phoneVariations.add(digits.slice(0, 4) + '9' + digits.slice(4));
      }
    });

    const phoneVariationsArray = Array.from(phoneVariations).filter(Boolean);
    console.log('[API] Searching for conversations with phone variations:', phoneVariationsArray);

    // First, try to find an existing active conversation by contact_id
    const { data: existingByContact, error: findError } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('[API] Error finding conversation by contact:', findError);
    }

    if (existingByContact) {
      console.log('[API] Found existing conversation by contact_id:', existingByContact.id);
      return existingByContact.id;
    }

    // If not found by contact_id, search by phone number variations
    if (phoneVariationsArray.length > 0) {
      // Get all contacts with matching phone numbers
      const { data: matchingContacts, error: matchError } = await supabase
        .from('contacts')
        .select('id, phone_number, whatsapp_id')
        .or(phoneVariationsArray.map(p => `phone_number.eq.${p},whatsapp_id.eq.${p}`).join(','));

      if (matchError) {
        console.error('[API] Error finding contacts by phone:', matchError);
      }

      if (matchingContacts && matchingContacts.length > 0) {
        const matchingContactIds = matchingContacts.map(c => c.id);
        console.log('[API] Found matching contacts by phone:', matchingContactIds);

        // Search for active conversations for these contacts
        const { data: existingByPhone, error: phoneError } = await supabase
          .from('conversations')
          .select('id, contact_id')
          .in('contact_id', matchingContactIds)
          .eq('is_active', true)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (phoneError) {
          console.error('[API] Error finding conversation by phone:', phoneError);
        }

        if (existingByPhone) {
          console.log('[API] Found existing conversation by phone number:', existingByPhone.id, 'for contact:', existingByPhone.contact_id);
          return existingByPhone.id;
        }
      }
    }

    // Create a new conversation if none found
    const { data: newConv, error: createError } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId,
        status: 'human', // Started by human agent
        is_active: true
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[API] Error creating conversation:', createError);
      throw createError;
    }

    console.log('[API] Created new conversation:', newConv.id);
    return newConv.id;
  },

  /**
   * Archive a conversation (set is_active to false)
   * Used to remove disqualified leads from the queue
   */
  archiveConversation: async (conversationId: string): Promise<void> => {
    console.log(`[API] Archiving conversation ${conversationId}`);
    
    const { error } = await supabase
      .from('conversations')
      .update({ is_active: false })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error archiving conversation:', error);
      throw error;
    }
    
    console.log(`[API] Conversation ${conversationId} archived successfully`);
  },

  /**
   * Archive multiple conversations at once (bulk operation)
   */
  archiveConversationsBulk: async (conversationIds: string[]): Promise<void> => {
    console.log(`[API] Bulk archiving ${conversationIds.length} conversations`);
    
    const { error } = await supabase
      .from('conversations')
      .update({ is_active: false })
      .in('id', conversationIds);

    if (error) {
      console.error('[API] Error bulk archiving conversations:', error);
      throw error;
    }
    
    console.log(`[API] ${conversationIds.length} conversations archived successfully`);
  },

  /**
   * Unarchive a conversation (set is_active to true)
   */
  unarchiveConversation: async (conversationId: string): Promise<void> => {
    console.log(`[API] Unarchiving conversation ${conversationId}`);
    
    const { error } = await supabase
      .from('conversations')
      .update({ is_active: true })
      .eq('id', conversationId);

    if (error) {
      console.error('[API] Error unarchiving conversation:', error);
      throw error;
    }
    
    console.log(`[API] Conversation ${conversationId} unarchived successfully`);
  },

  /**
   * Fetch archived conversations
   */
  fetchArchivedConversations: async (): Promise<UIConversation[]> => {
    console.log('[API] Fetching archived conversations...');
    
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*),
        agent:agents(id, name, slug)
      `)
      .eq('is_active', false)
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (convError) {
      console.error('[API] Error fetching archived conversations:', convError);
      throw convError;
    }

    if (!conversations || conversations.length === 0) {
      console.log('[API] No archived conversations found');
      return [];
    }

    console.log(`[API] Found ${conversations.length} archived conversations`);

    // OPTIMIZED: single batch query for all messages instead of N+1
    const conversationIds = conversations.map(c => c.id);
    const { data: allMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .order('sent_at', { ascending: true });

    if (msgError) {
      console.error('[API] Error fetching archived messages batch:', msgError);
    }

    const messagesByConv = new Map<string, DBMessage[]>();
    for (const msg of (allMessages || []) as unknown as DBMessage[]) {
      const arr = messagesByConv.get(msg.conversation_id) || [];
      arr.push(msg);
      messagesByConv.set(msg.conversation_id, arr);
    }

    const conversationsWithMessages: UIConversation[] = conversations.map((conv) => {
      return transformDBToUIConversation(
        conv as unknown as DBConversation,
        messagesByConv.get(conv.id) || []
      );
    });

    return conversationsWithMessages;
  },

  /**
   * Send a media message (image, document, audio, video)
   * 1. Upload file to Supabase Storage
   * 2. Create message record
   * 3. Queue for WhatsApp sending
   */
  sendMediaMessage: async (
    conversationId: string, 
    file: File, 
    operatorName?: string
  ): Promise<string> => {
    console.log(`[API] Sending media message to conversation ${conversationId}`);
    
    // Get conversation to find contact_id
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      console.error('[API] Conversation not found:', convError);
      throw new Error('Conversation not found');
    }

    // Determine message type based on file MIME
    let messageType: 'image' | 'document' | 'audio' | 'video' = 'document';
    let mediaType = file.type;
    
    if (file.type.startsWith('image/')) {
      messageType = 'image';
    } else if (file.type.startsWith('audio/')) {
      messageType = 'audio';
    } else if (file.type.startsWith('video/')) {
      messageType = 'video';
    }

    // WhatsApp Cloud API só aceita audio/ogg;opus | mpeg | amr | mp4 | aac.
    // Normalizamos qualquer áudio gravado no browser para audio/ogg; codecs=opus
    // (o ChatInterface já entrega nesse formato via opus-recorder).
    let uploadContentType = file.type || 'application/octet-stream';
    if (messageType === 'audio') {
      mediaType = 'audio/ogg; codecs=opus';
      uploadContentType = 'audio/ogg';
    }

    // Generate unique filename
    let ext = file.name.split('.').pop() || 'bin';
    if (messageType === 'audio') ext = 'ogg';
    const fileName = `${conversationId}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

    console.log(`[API] Uploading file: ${fileName}, type: ${messageType}, contentType: ${uploadContentType}`);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('whatsapp-media')
      .upload(fileName, file, {
        contentType: uploadContentType,
        upsert: false
      });

    if (uploadError) {
      console.error('[API] Error uploading file:', uploadError);
      throw new Error('Failed to upload file');
    }

    // Get public URL
    const { data: urlData } = supabase
      .storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    const mediaUrl = urlData.publicUrl;
    console.log('[API] File uploaded, URL:', mediaUrl);

    // Build caption with operator name if provided
    const caption = operatorName ? `[${operatorName}] ${file.name}` : file.name;

    // Create message record with 'processing' status
    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: caption,
        type: messageType,
        from_type: 'human',
        status: 'processing',
        media_url: mediaUrl,
        media_type: mediaType,
        sent_at: new Date().toISOString(),
        metadata: operatorName ? { sender_name: operatorName } : {}
      })
      .select('id')
      .single();

    if (msgError || !msgData) {
      console.error('[API] Error creating message record:', msgError);
      throw new Error('Failed to create message record');
    }

    console.log('[API] Message record created:', msgData.id);

    // Queue for sending
    const { error: sendError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        content: caption,
        media_url: mediaUrl,
        from_type: 'human',
        message_type: messageType,
        priority: 2,
        message_id: msgData.id
      });

    if (sendError) {
      console.error('[API] Error queuing media message:', sendError);
      throw sendError;
    }

    console.log('[API] Media message queued for sending');

    // Trigger whatsapp-sender to process the queue immediately
    try {
      console.log('[API] Triggering whatsapp-sender...');
      const { error: triggerError } = await supabase.functions.invoke('whatsapp-sender');
      
      if (triggerError) {
        console.error('[API] Error triggering whatsapp-sender:', triggerError);
      } else {
        console.log('[API] whatsapp-sender triggered successfully');
      }
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender:', err);
    }

    return msgData.id;
  },

  /**
   * Send a media file already stored in the media_library (no re-upload).
   * Reuses the existing public URL, queues for WhatsApp delivery and
   * increments the library item's send_count.
   */
  sendLibraryMedia: async (
    conversationId: string,
    libraryItem: {
      id: string;
      name: string;
      file_url: string;
      media_type: string;
      mime_type: string | null;
      send_count?: number;
    },
    operatorName?: string
  ): Promise<string> => {
    console.log(`[API] Sending library media ${libraryItem.id} to conversation ${conversationId}`);

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversation not found');
    }

    const messageType =
      (['image', 'video', 'audio', 'document'].includes(libraryItem.media_type)
        ? libraryItem.media_type
        : 'document') as 'image' | 'video' | 'audio' | 'document';

    const caption = operatorName ? `[${operatorName}] ${libraryItem.name}` : libraryItem.name;

    const { data: msgData, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: caption,
        type: messageType,
        from_type: 'human',
        status: 'processing',
        media_url: libraryItem.file_url,
        media_type: libraryItem.mime_type || messageType,
        sent_at: new Date().toISOString(),
        metadata: {
          ...(operatorName ? { sender_name: operatorName } : {}),
          source: 'media_library',
          library_item_id: libraryItem.id,
        },
      })
      .select('id')
      .single();

    if (msgError || !msgData) {
      console.error('[API] Error creating library media message:', msgError);
      throw new Error('Failed to create message record');
    }

    const { error: sendError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        content: caption,
        media_url: libraryItem.file_url,
        from_type: 'human',
        message_type: messageType,
        priority: 2,
        message_id: msgData.id,
      });

    if (sendError) {
      console.error('[API] Error queuing library media:', sendError);
      throw sendError;
    }

    // Increment send_count + last_sent_at (best-effort, don't block UI)
    supabase
      .from('media_library')
      .update({
        send_count: (libraryItem.send_count ?? 0) + 1,
        last_sent_at: new Date().toISOString(),
      })
      .eq('id', libraryItem.id)
      .then(({ error }) => {
        if (error) console.warn('[API] Failed to update media_library counters:', error);
      });

    // Trigger sender
    try {
      await supabase.functions.invoke('whatsapp-sender');
    } catch (err) {
      console.error('[API] Failed to trigger whatsapp-sender:', err);
    }

    return msgData.id;
  },
};
