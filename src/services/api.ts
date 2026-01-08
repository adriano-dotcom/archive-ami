import { supabase } from '@/integrations/supabase/client';
import { 
  Contact, 
  StatMetric, 
  TeamMember, 
  Appointment, 
  Deal,
  DBConversation,
  DBMessage,
  UIConversation,
  transformDBToUIConversation
} from '../types';
import { MOCK_CONTACTS, MOCK_TEAM, MOCK_APPOINTMENTS, MOCK_DEALS } from '../constants';

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
        wonDealsPeriodResult,
        wonDealsPrevResult,
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
        // Won deals in period
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .not('won_at', 'is', null)
          .gte('won_at', periodStartStr),
        // Won deals in previous period
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .not('won_at', 'is', null)
          .gte('won_at', prevPeriodStartStr)
          .lt('won_at', periodStartStr),
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
      
      // Conversões = deals ganhos + appointments agendados
      const conversionsPeriod = (wonDealsPeriodResult.count || 0) + (appointmentsPeriodResult.count || 0);
      const conversionsPrev = (wonDealsPrevResult.count || 0) + (appointmentsPrevResult.count || 0);
      
      const responseTimes = avgResponseResult.data?.map(m => m.nina_response_time).filter(Boolean) || [];
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
          label: 'Conversões',
          value: conversionsPeriod.toString(),
          trend: calculateTrend(conversionsPeriod, conversionsPrev),
          trendUp: conversionsPeriod >= conversionsPrev
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
        { label: 'Conversões', value: '0', trend: '0%', trendUp: true },
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
      const [messagesResult, dealsResult, appointmentsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('sent_at')
          .gte('sent_at', periodStart.toISOString()),
        supabase
          .from('deals')
          .select('won_at')
          .not('won_at', 'is', null)
          .gte('won_at', periodStart.toISOString()),
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

      // Group conversions by day (deals + appointments)
      const conversionsMap = new Map<string, number>();
      (dealsResult.data || []).forEach(d => {
        if (d.won_at) {
          const dateStr = getDateString(new Date(d.won_at));
          conversionsMap.set(dateStr, (conversionsMap.get(dateStr) || 0) + 1);
        }
      });
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
   * Fetch contacts from database with deal/owner/pipeline/conversation/policies data
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

    // Fetch deals with owner and pipeline info
    const contactIds = contactsData.map(c => c.id);
    const [dealsResult, conversationsResult, policiesResult, installmentsResult] = await Promise.all([
      supabase
        .from('deals')
        .select(`
          id,
          contact_id,
          owner_id,
          pipeline_id,
          created_at,
          team_members!deals_owner_id_fkey(id, name),
          pipelines(id, name, slug, icon, color)
        `)
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false }),
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

    const dealsData = dealsResult.data;
    const conversationsData = conversationsResult.data;
    const policiesData = policiesResult.data;
    const installmentsData = installmentsResult.data;

    // Create a map of contact_id to deal info (most recent deal per contact)
    const dealsByContact = new Map<string, any>();
    (dealsData || []).forEach(deal => {
      if (!dealsByContact.has(deal.contact_id)) {
        dealsByContact.set(deal.contact_id, deal);
      }
    });

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
      const existing = policiesByContact.get(policy.contact_id) || { count: 0, insurers: new Set() };
      existing.count += 1;
      if (policy.insurer) existing.insurers.add(policy.insurer);
      policiesByContact.set(policy.contact_id, existing);
    });

    // Create maps for overdue installments
    const overdueByContact = new Map<string, { totalValue: number; maxDays: number }>();
    (installmentsData || []).forEach(inst => {
      const existing = overdueByContact.get(inst.contact_id) || { totalValue: 0, maxDays: 0 };
      existing.totalValue += Number(inst.value) || 0;
      existing.maxDays = Math.max(existing.maxDays, inst.days_overdue || 0);
      overdueByContact.set(inst.contact_id, existing);
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
      const deal = dealsByContact.get(c.id);
      const owner = deal?.team_members;
      const pipeline = deal?.pipelines;
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
        // Deal/Owner/Pipeline data
        ownerId: owner?.id || undefined,
        ownerName: owner?.name || undefined,
        pipelineId: pipeline?.id || undefined,
        pipelineName: pipeline?.name || undefined,
        pipelineSlug: pipeline?.slug || undefined,
        pipelineIcon: pipeline?.icon || undefined,
        pipelineColor: pipeline?.color || undefined,
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
   * Delete contact and all related data (conversations, messages, deals)
   */
  deleteContact: async (id: string): Promise<void> => {
    // First delete related deals
    const { error: dealsError } = await supabase
      .from('deals')
      .delete()
      .eq('contact_id', id);

    if (dealsError) {
      console.error('[API] Error deleting deals:', dealsError);
    }

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
      weight: m.weight,
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
      weight: data.weight
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
      description: a.description,
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
      description: data.description,
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
   * Fetch pipeline/deals with real data
   * @param pipelineId - Optional pipeline ID to filter by
   */
  fetchPipeline: async (pipelineId?: string): Promise<Deal[]> => {
    let query = supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(name, call_name, phone_number, email, client_memory),
        owner:team_members!deals_owner_id_fkey(name, avatar)
      `)
      .order('created_at', { ascending: false });

    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[API] Error fetching pipeline:', error);
      return [];
    }

    // Buscar conversation IDs para cada deal com contact_id
    const contactIds = data?.filter(d => d.contact_id).map(d => d.contact_id) || [];
    
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id, contact_id')
      .in('contact_id', contactIds);

    const convMap = new Map(conversations?.map(c => [c.contact_id, c.id]) || []);

    return (data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      company: d.company || d.contact?.name || d.contact?.call_name || 'Sem empresa',
      value: Number(d.value) || 0,
      stage: d.stage,
      stageId: d.stage_id,
      pipelineId: d.pipeline_id,
      ownerAvatar: d.owner?.avatar || 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
      ownerId: d.owner_id,
      ownerName: d.owner?.name,
      tags: d.tags || [],
      dueDate: d.due_date,
      priority: (d.priority || 'medium') as 'low' | 'medium' | 'high',
      contactId: d.contact_id,
      contactName: d.contact?.name || d.contact?.call_name,
      contactPhone: d.contact?.phone_number,
      contactEmail: d.contact?.email,
      wonAt: d.won_at,
      lostAt: d.lost_at,
      lostReason: d.lost_reason,
      clientMemory: d.contact?.client_memory || null,
      conversationId: convMap.get(d.contact_id) || null,
    }));
  },

  // Pipeline Stages CRUD
  fetchPipelineStages: async (pipelineId?: string): Promise<any[]> => {
    let query = supabase
      .from('pipeline_stages')
      .select('*')
      .eq('is_active', true)
      .order('position', { ascending: true });

    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching pipeline stages:', error);
      throw error;
    }

    return data.map(stage => ({
      id: stage.id,
      title: stage.title,
      color: stage.color,
      position: stage.position,
      isSystem: stage.is_system,
      isActive: stage.is_active,
      isAiManaged: stage.is_ai_managed || false,
      aiTriggerCriteria: stage.ai_trigger_criteria,
      pipelineId: stage.pipeline_id,
      syncToPipedrive: stage.sync_to_pipedrive || false
    }));
  },

  createPipelineStage: async (stage: { title: string; color: string; pipelineId: string; isAiManaged?: boolean; aiTriggerCriteria?: string }): Promise<any> => {
    // Get the highest position within this pipeline
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('position')
      .eq('pipeline_id', stage.pipelineId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = stages && stages.length > 0 ? stages[0].position + 1 : 0;

    const { data, error } = await supabase
      .from('pipeline_stages')
      .insert({
        title: stage.title,
        color: stage.color,
        position: nextPosition,
        pipeline_id: stage.pipelineId,
        is_system: false,
        is_active: true,
        is_ai_managed: stage.isAiManaged || false,
        ai_trigger_criteria: stage.aiTriggerCriteria || null
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating pipeline stage:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      color: data.color,
      position: data.position,
      isSystem: data.is_system,
      isActive: data.is_active,
      isAiManaged: data.is_ai_managed || false,
      aiTriggerCriteria: data.ai_trigger_criteria
    };
  },

  updatePipelineStage: async (id: string, updates: any): Promise<void> => {
    const dbUpdates: any = {};
    
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.position !== undefined) dbUpdates.position = updates.position;
    if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
    if (updates.isAiManaged !== undefined) dbUpdates.is_ai_managed = updates.isAiManaged;
    if (updates.aiTriggerCriteria !== undefined) dbUpdates.ai_trigger_criteria = updates.aiTriggerCriteria;
    if (updates.syncToPipedrive !== undefined) dbUpdates.sync_to_pipedrive = updates.syncToPipedrive;

    const { error } = await supabase
      .from('pipeline_stages')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating pipeline stage:', error);
      throw error;
    }
  },

  deletePipelineStage: async (id: string, moveToStageId?: string): Promise<void> => {
    // If moveToStageId is provided, move all deals to that stage first
    if (moveToStageId) {
      const { error: moveError } = await supabase
        .from('deals')
        .update({ stage_id: moveToStageId })
        .eq('stage_id', id);

      if (moveError) {
        console.error('Error moving deals:', moveError);
        throw moveError;
      }
    }

    // Delete the stage
    const { error } = await supabase
      .from('pipeline_stages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting pipeline stage:', error);
      throw error;
    }
  },

  reorderPipelineStages: async (stageIds: string[]): Promise<void> => {
    // Update position for each stage
    const updates = stageIds.map((id, index) => 
      supabase
        .from('pipeline_stages')
        .update({ position: index })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Error reordering stages:', errors);
      throw errors[0].error;
    }
  },

  /**
   * Get deal by contact ID
   */
  getDealByContactId: async (contactId: string): Promise<Deal | null> => {
    const { data, error } = await supabase
      .from('deals')
      .select('*, owner:team_members!deals_owner_id_fkey(id, name, avatar), pipeline:pipelines!deals_pipeline_id_fkey(id, slug, name, color, icon)')
      .eq('contact_id', contactId)
      .maybeSingle();

    if (error) {
      console.error('[API] Error fetching deal by contact:', error);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      title: data.title,
      company: data.company || 'Sem empresa',
      value: Number(data.value) || 0,
      stage: data.stage,
      stageId: data.stage_id,
      pipelineId: data.pipeline_id,
      owner: data.owner,
      ownerAvatar: data.owner?.avatar || 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
      pipeline: data.pipeline,
      tags: data.tags || [],
      dueDate: data.due_date,
      priority: data.priority as 'low' | 'medium' | 'high',
      contactId: data.contact_id,
    };
  },

  /**
   * Create a new deal
   */
  createDeal: async (deal: {
    contact_id: string;
    title: string;
    company?: string;
    value?: number;
    stage?: string;
    stage_id?: string;
    priority?: string;
    tags?: string[];
    due_date?: string;
    owner_id?: string;
    notes?: string;
  }): Promise<Deal> => {
    // Remove undefined stage_id to let DB use default
    const dealData: any = { ...deal };
    if (!dealData.stage_id) {
      delete dealData.stage_id;
    }
    
    const { data, error } = await supabase
      .from('deals')
      .insert([dealData])
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating deal:', error);
      throw error;
    }

    return {
      id: data.id,
      title: data.title,
      company: data.company || 'Sem empresa',
      value: Number(data.value) || 0,
      stage: data.stage,
      stageId: data.stage_id,
      ownerAvatar: 'https://ui-avatars.com/api/?name=NA&background=334155&color=fff',
      tags: data.tags || [],
      dueDate: data.due_date,
      priority: data.priority as 'low' | 'medium' | 'high',
    };
  },

  /**
   * Update a deal
   */
  updateDeal: async (id: string, updates: Partial<{
    title: string;
    company: string;
    value: number;
    stage: string;
    priority: string;
    tags: string[];
    due_date: string;
    owner_id: string;
    notes: string;
    lost_reason: string;
  }>): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating deal:', error);
      throw error;
    }
  },

  /**
   * Delete a deal
   */
  deleteDeal: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting deal:', error);
      throw error;
    }
  },

  /**
   * Move deal to a new stage
   * If moving to a Pipedrive stage, automatically sync to Pipedrive
   */
  moveDealStage: async (id: string, newStageId: string): Promise<{ synced?: boolean; error?: string }> => {
    // First, get the stage info to check if it's a Pipedrive sync stage
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('title, sync_to_pipedrive')
      .eq('id', newStageId)
      .single();

    // Move the deal
    const { error } = await supabase
      .from('deals')
      .update({ stage_id: newStageId })
      .eq('id', id);

    if (error) {
      console.error('[API] Error moving deal stage:', error);
      throw error;
    }

    // Check if this stage has Pipedrive sync enabled (explicit configuration)
    const isPipedriveStage = stage?.sync_to_pipedrive === true;

    if (isPipedriveStage) {
      console.log('[API] Pipedrive sync stage detected, triggering sync...');
      try {
        // Get contactId from the deal
        const { data: deal } = await supabase
          .from('deals')
          .select('contact_id')
          .eq('id', id)
          .single();

        if (!deal?.contact_id) {
          console.log('[API] No contact_id found for deal, skipping Pipedrive sync');
          return { synced: false, error: 'Deal sem contato associado' };
        }

        const { data, error: syncError } = await supabase.functions.invoke('sync-pipedrive', {
          body: { contactId: deal.contact_id, dealId: id }
        });

        if (syncError) {
          console.error('[API] Error syncing to Pipedrive:', syncError);
          return { synced: false, error: syncError.message };
        }

        if (data?.success) {
          console.log('[API] Successfully synced to Pipedrive:', data);
          return { synced: true };
        } else {
          console.log('[API] Pipedrive sync skipped:', data?.message);
          return { synced: false, error: data?.message || data?.error };
        }
      } catch (syncErr: any) {
        console.error('[API] Exception syncing to Pipedrive:', syncErr);
        return { synced: false, error: syncErr.message };
      }
    }

    return {};
  },

  /**
   * Mark deal as won
   */
  markDealWon: async (dealId: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update({ 
        stage: 'won',
        won_at: new Date().toISOString()
      })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error marking deal as won:', error);
      throw error;
    }
  },

  /**
   * Mark deal as lost with reason
   */
  markDealLost: async (dealId: string, reason: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update({ 
        stage: 'lost',
        lost_at: new Date().toISOString(),
        lost_reason: reason
      })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error marking deal as lost:', error);
      throw error;
    }
  },

  /**
   * Update deal owner
   */
  updateDealOwner: async (dealId: string, ownerId: string): Promise<void> => {
    const { error } = await supabase
      .from('deals')
      .update({ owner_id: ownerId })
      .eq('id', dealId);
      
    if (error) {
      console.error('[API] Error updating deal owner:', error);
      throw error;
    }
  },

  /**
   * Fetch activities for a deal
   */
  fetchDealActivities: async (dealId: string): Promise<any[]> => {
    const { data, error } = await supabase
      .from('deal_activities')
      .select(`
        *,
        created_by_member:team_members!deal_activities_created_by_fkey(name)
      `)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Error fetching deal activities:', error);
      throw error;
    }
    
    return data || [];
  },

  /**
   * Create a new deal activity
   */
  createDealActivity: async (activity: {
    dealId: string;
    type: 'note' | 'call' | 'email' | 'meeting' | 'task';
    title: string;
    description?: string;
    scheduledAt?: string;
    createdBy?: string;
  }): Promise<any> => {
    const { data, error } = await supabase
      .from('deal_activities')
      .insert({
        deal_id: activity.dealId,
        type: activity.type,
        title: activity.title,
        description: activity.description,
        scheduled_at: activity.scheduledAt,
        created_by: activity.createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating deal activity:', error);
      throw error;
    }
    
    return data;
  },

  /**
   * Update a deal activity
   */
  updateDealActivity: async (id: string, updates: {
    title?: string;
    description?: string;
    scheduledAt?: string;
    isCompleted?: boolean;
  }): Promise<void> => {
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.scheduledAt !== undefined) dbUpdates.scheduled_at = updates.scheduledAt;
    if (updates.isCompleted !== undefined) {
      dbUpdates.is_completed = updates.isCompleted;
      dbUpdates.completed_at = updates.isCompleted ? new Date().toISOString() : null;
    }

    const { error } = await supabase
      .from('deal_activities')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating deal activity:', error);
      throw error;
    }
  },

  /**
   * Delete a deal activity
   */
  deleteDealActivity: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('deal_activities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting deal activity:', error);
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
        contact:contacts(*),
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
          contact:contacts(*),
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

    // Fetch deals with pipeline and owner data for all contacts
    const contactIds = allConversations.map(c => c.contact_id).filter(Boolean);
    const { data: deals } = await supabase
      .from('deals')
      .select(`
        contact_id,
        pipeline:pipelines!deals_pipeline_id_fkey(id, name, icon, color),
        owner:team_members!deals_owner_id_fkey(id, name)
      `)
      .in('contact_id', contactIds);

    // Create maps of contact_id to pipeline and owner data
    const pipelineByContact = new Map<string, { id: string; name: string; icon: string; color: string } | null>();
    const ownerByContact = new Map<string, { id: string; name: string } | null>();
    if (deals) {
      for (const deal of deals) {
        if (deal.contact_id && deal.pipeline) {
          pipelineByContact.set(deal.contact_id, deal.pipeline as any);
        }
        if (deal.contact_id && deal.owner) {
          ownerByContact.set(deal.contact_id, deal.owner as any);
        }
      }
    }

    // Note: assigned_user_name is populated when the operator takes over
    // and passed from the client side (derived from their email)

    // Fetch messages for each conversation
    const conversationsWithMessages: UIConversation[] = await Promise.all(
      allConversations.map(async (conv) => {
        const { data: messages, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: true })
          .limit(100);

        if (msgError) {
          console.error(`[API] Error fetching messages for ${conv.id}:`, msgError);
        }

        // Enrich conversation with pipeline and owner data
        const pipeline = pipelineByContact.get(conv.contact_id);
        const owner = ownerByContact.get(conv.contact_id);

        const enrichedConv = {
          ...conv,
          pipelineId: pipeline?.id || null,
          pipelineName: pipeline?.name || null,
          pipelineIcon: pipeline?.icon || null,
          pipelineColor: pipeline?.color || null,
          // Read assigned_user_name from database
          assignedUserName: (conv as any).assigned_user_name || null,
          // Deal owner
          dealOwnerId: owner?.id || null,
          dealOwnerName: owner?.name || null
        };

        return transformDBToUIConversation(
          enrichedConv as unknown as DBConversation,
          (messages || []) as unknown as DBMessage[]
        );
      })
    );

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
   * Assign conversation to a team member and sync with deal
   */
  assignConversation: async (conversationId: string, userId: string | null, contactId: string): Promise<void> => {
    // Update conversation
    const { error: convError } = await supabase
      .from('conversations')
      .update({ assigned_user_id: userId })
      .eq('id', conversationId);

    if (convError) {
      console.error('[API] Error assigning conversation:', convError);
      throw convError;
    }

    // Update deal(s) with same contact_id
    const { error: dealError } = await supabase
      .from('deals')
      .update({ owner_id: userId })
      .eq('contact_id', contactId);

    if (dealError) {
      console.error('[API] Error updating deal owner:', dealError);
      throw dealError;
    }

    console.log(`[API] Conversation ${conversationId} and deals assigned to user ${userId}`);
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

  // ============= PIPELINES =============
  
  /**
   * Fetch all pipelines
   */
  fetchPipelines: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('pipelines')
      .select(`
        *,
        agent:agents(name)
      `)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('[API] Error fetching pipelines:', error);
      throw error;
    }

    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      agentId: p.agent_id,
      agentName: p.agent?.name || null,
      color: p.color,
      icon: p.icon,
      isActive: p.is_active,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }));
  },

  /**
   * Create a new pipeline
   */
  createPipeline: async (pipeline: { name: string; slug: string; agentId?: string; color?: string; icon?: string }): Promise<any> => {
    const { data, error } = await supabase
      .from('pipelines')
      .insert({
        name: pipeline.name,
        slug: pipeline.slug,
        agent_id: pipeline.agentId || null,
        color: pipeline.color || '#3b82f6',
        icon: pipeline.icon || '📋',
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Error creating pipeline:', error);
      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      agentId: data.agent_id,
      color: data.color,
      icon: data.icon,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  },

  /**
   * Update a pipeline
   */
  updatePipeline: async (id: string, updates: Partial<{ name: string; agentId: string | null; color: string; icon: string }>): Promise<void> => {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.agentId !== undefined) dbUpdates.agent_id = updates.agentId;
    if (updates.color !== undefined) dbUpdates.color = updates.color;
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon;

    const { error } = await supabase
      .from('pipelines')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('[API] Error updating pipeline:', error);
      throw error;
    }
  },

  /**
   * Delete a pipeline (soft delete)
   */
  deletePipeline: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('pipelines')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('[API] Error deleting pipeline:', error);
      throw error;
    }
  },

  /**
   * Link agents to pipelines after migration
   */
  linkAgentsToPipelines: async (): Promise<void> => {
    // Get all agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id, slug')
      .eq('is_active', true);

    // Get all pipelines
    const { data: pipelines } = await supabase
      .from('pipelines')
      .select('id, slug')
      .eq('is_active', true);

    if (!agents || !pipelines) return;

    // Map agents to pipelines by slug (iris -> transporte, barbara -> saude)
    const agentPipelineMap: Record<string, string> = {
      'iris': 'transporte',
      'barbara': 'saude'
    };

    for (const agent of agents) {
      const pipelineSlug = agentPipelineMap[agent.slug];
      if (pipelineSlug) {
        const pipeline = pipelines.find(p => p.slug === pipelineSlug);
        if (pipeline) {
          await supabase
            .from('pipelines')
            .update({ agent_id: agent.id })
            .eq('id', pipeline.id);
        }
      }
    }
  },

  /**
   * Get existing conversation for a contact or create a new one
   * @param contactId - The contact ID to find or create conversation for
   * @returns The conversation ID (existing or newly created)
   */
  getOrCreateConversation: async (contactId: string): Promise<string> => {
    // First, try to find an existing active conversation
    const { data: existingConv, error: findError } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('[API] Error finding conversation:', findError);
      throw findError;
    }

    // If conversation exists, return its ID
    if (existingConv) {
      console.log('[API] Found existing conversation:', existingConv.id);
      return existingConv.id;
    }

    // Create a new conversation
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

    // Fetch messages for each conversation
    const conversationsWithMessages: UIConversation[] = await Promise.all(
      conversations.map(async (conv) => {
        const { data: messages, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: true })
          .limit(100);

        if (msgError) {
          console.error(`[API] Error fetching messages for ${conv.id}:`, msgError);
        }

        return transformDBToUIConversation(
          conv as unknown as DBConversation,
          (messages || []) as unknown as DBMessage[]
        );
      })
    );

    return conversationsWithMessages;
  },
};
