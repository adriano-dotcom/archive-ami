import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { detectDuplicates, DuplicateInfo } from '@/utils/duplicateDetection';

const PAGE_SIZE = 50;

// Interface para contatos leves (carregamento rápido)
export interface ContactLight {
  id: string;
  name: string;
  phone: string;
  email: string;
  company?: string;
  cnpj?: string;
  cpf?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  status: string;
  lastContact: string;
  created_at?: string;
  lead_source?: string;
  whatsapp_id?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  campaign?: string;
  vertical?: 'transporte' | 'frotas';
  // Dados relacionais (carregados sob demanda ou em batch separado)
  conversationActive?: boolean | null;
  conversationStatus?: string;
  policiesCount?: number;
  insurers?: string[];
  overdueValue?: number;
  maxDaysOverdue?: number;
  // Duplicate detection info
  duplicateInfo?: DuplicateInfo;
}

// Formatadores
const formatCNPJDisplay = (cnpj: string | null) => {
  if (!cnpj) return undefined;
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

const formatCPFDisplay = (cpf: string | null) => {
  if (!cpf) return undefined;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
};

// Mapear contato para interface
const mapContactToLight = (c: any): ContactLight => ({
  id: c.id,
  name: c.name || c.call_name || c.phone_number,
  phone: c.phone_number,
  email: c.email || '',
  company: c.company || undefined,
  cnpj: formatCNPJDisplay(c.cnpj),
  cpf: formatCPFDisplay(c.cpf),
  cep: c.cep || undefined,
  street: c.street || undefined,
  number: c.number || undefined,
  complement: c.complement || undefined,
  neighborhood: c.neighborhood || undefined,
  city: c.city || undefined,
  state: c.state || undefined,
  notes: c.notes || undefined,
  status: c.lead_status || 'new',
  lastContact: new Date(c.last_activity).toLocaleDateString('pt-BR'),
  created_at: c.created_at,
  lead_source: c.lead_source || 'inbound',
  whatsapp_id: c.whatsapp_id || undefined,
  utm_source: c.utm_source || undefined,
  utm_campaign: c.utm_campaign || undefined,
  utm_content: c.utm_content || undefined,
  utm_term: c.utm_term || undefined,
  campaign: c.campaign || undefined,
  vertical: c.vertical as 'transporte' | 'frotas' | undefined,
});

// Função para buscar uma página de contatos
const fetchContactsPage = async (page: number): Promise<{
  contacts: ContactLight[];
  nextPage: number | null;
  totalCount: number;
}> => {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: contactsData, error, count } = await supabase
    .from('contacts')
    .select('id, name, call_name, phone_number, email, company, cnpj, cpf, cep, street, number, complement, neighborhood, city, state, notes, lead_status, last_activity, created_at, lead_source, whatsapp_id, utm_source, utm_campaign, utm_content, utm_term, campaign, vertical', { count: 'exact' })
    .order('last_activity', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('[useContacts] Error fetching contacts page:', error);
    throw error;
  }

  const contacts = (contactsData || []).map(mapContactToLight);
  const hasMore = count ? from + contacts.length < count : false;
  
  return {
    contacts,
    nextPage: hasMore ? page + 1 : null,
    totalCount: count || 0
  };
};

// Função para enriquecer contatos com dados relacionais
const enrichContactsWithRelations = async (contacts: ContactLight[], allLoadedContacts: ContactLight[] = []): Promise<ContactLight[]> => {
  if (contacts.length === 0) return contacts;

  const contactIds = contacts.map(c => c.id);
  
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

  const conversationsByContact = new Map<string, any>();
  (conversationsResult.data || []).forEach(conv => {
    if (!conversationsByContact.has(conv.contact_id)) {
      conversationsByContact.set(conv.contact_id, conv);
    }
  });

  const policiesByContact = new Map<string, { count: number; insurers: Set<string> }>();
  (policiesResult.data || []).forEach(policy => {
    const existing = policiesByContact.get(policy.contact_id!) || { count: 0, insurers: new Set<string>() };
    existing.count += 1;
    if (policy.insurer) existing.insurers.add(policy.insurer);
    policiesByContact.set(policy.contact_id!, existing);
  });

  const overdueByContact = new Map<string, { totalValue: number; maxDays: number }>();
  (installmentsResult.data || []).forEach(inst => {
    const existing = overdueByContact.get(inst.contact_id!) || { totalValue: 0, maxDays: 0 };
    existing.totalValue += Number(inst.value) || 0;
    existing.maxDays = Math.max(existing.maxDays, inst.days_overdue || 0);
    overdueByContact.set(inst.contact_id!, existing);
  });

  // Detect duplicates across all loaded contacts
  const allContactsForDuplicates = [...allLoadedContacts, ...contacts.filter(c => !allLoadedContacts.some(ac => ac.id === c.id))];
  const duplicateMap = detectDuplicates(allContactsForDuplicates.map(c => ({
    id: c.id,
    phone: c.phone,
    whatsapp_id: c.whatsapp_id
  })));

  // Enriquecer contatos
  return contacts.map(contact => {
    const conversation = conversationsByContact.get(contact.id);
    const policyData = policiesByContact.get(contact.id);
    const overdueData = overdueByContact.get(contact.id);

    return {
      ...contact,
      conversationActive: conversation?.is_active ?? null,
      conversationStatus: conversation?.status || undefined,
      policiesCount: policyData?.count || 0,
      insurers: policyData ? Array.from(policyData.insurers) : [],
      overdueValue: overdueData?.totalValue || 0,
      maxDaysOverdue: overdueData?.maxDays || 0,
      duplicateInfo: duplicateMap.get(contact.id),
    };
  });
};

// Hook principal com paginação infinita
export const useContactsInfinite = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch
  } = useInfiniteQuery({
    queryKey: ['contacts-infinite'],
    queryFn: async ({ pageParam = 0, queryKey, meta }) => {
      const page = await fetchContactsPage(pageParam);
      // Get all previously loaded contacts for duplicate detection across pages
      const allPreviousContacts: ContactLight[] = [];
      const enriched = await enrichContactsWithRelations(page.contacts, allPreviousContacts);
      return { ...page, contacts: enriched };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 10 * 60 * 1000,  // 10 minutos
    gcTime: 30 * 60 * 1000,     // 30 minutos
  });

  // Flatten todas as páginas em uma lista única
  const contacts = useMemo(() => 
    data?.pages.flatMap(page => page.contacts) ?? [],
    [data?.pages]
  );

  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Mutation para atualizar status com optimistic update
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ lead_status: status })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['contacts-infinite'] });
      const previousData = queryClient.getQueryData(['contacts-infinite']);
      
      queryClient.setQueryData(['contacts-infinite'], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any) => ({
          ...page,
          contacts: page.contacts.map((c: ContactLight) => 
            c.id === id ? { ...c, status } : c
          )
        })) || []
      }));
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(['contacts-infinite'], context?.previousData);
      toast.error('Erro ao atualizar status');
    },
    onSuccess: () => {
      toast.success('Status atualizado');
    },
  });

  // Mutation para deletar contato
  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['contacts-infinite'] });
      const previousData = queryClient.getQueryData(['contacts-infinite']);
      
      queryClient.setQueryData(['contacts-infinite'], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any) => ({
          ...page,
          contacts: page.contacts.filter((c: ContactLight) => c.id !== id),
          totalCount: page.totalCount - 1
        })) || []
      }));
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(['contacts-infinite'], context?.previousData);
      toast.error('Erro ao excluir contato');
    },
    onSuccess: () => {
      toast.success('Contato excluído com sucesso');
    },
  });

  // Mutation para atualizar status em massa
  const bulkUpdateStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ lead_status: status })
        .in('id', ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, status }) => {
      await queryClient.cancelQueries({ queryKey: ['contacts-infinite'] });
      const previousData = queryClient.getQueryData(['contacts-infinite']);
      
      queryClient.setQueryData(['contacts-infinite'], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any) => ({
          ...page,
          contacts: page.contacts.map((c: ContactLight) => 
            ids.includes(c.id) ? { ...c, status } : c
          )
        })) || []
      }));
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(['contacts-infinite'], context?.previousData);
      toast.error('Erro ao atualizar status em massa');
    },
    onSuccess: (_, { ids }) => {
      toast.success(`Status atualizado para ${ids.length} contato(s)`);
    },
  });

  // Mutation para deletar em massa
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['contacts-infinite'] });
      const previousData = queryClient.getQueryData(['contacts-infinite']);
      
      queryClient.setQueryData(['contacts-infinite'], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any) => ({
          ...page,
          contacts: page.contacts.filter((c: ContactLight) => !ids.includes(c.id)),
          totalCount: page.totalCount - ids.length
        })) || []
      }));
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(['contacts-infinite'], context?.previousData);
      toast.error('Erro ao excluir contatos em massa');
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} contato(s) excluído(s) com sucesso`);
    },
  });

  // Mutation para atualizar campanha em massa
  const bulkUpdateCampaignMutation = useMutation({
    mutationFn: async ({ ids, campaign }: { ids: string[]; campaign: string | null }) => {
      const { error } = await supabase
        .from('contacts')
        .update({ campaign })
        .in('id', ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, campaign }) => {
      await queryClient.cancelQueries({ queryKey: ['contacts-infinite'] });
      const previousData = queryClient.getQueryData(['contacts-infinite']);
      
      queryClient.setQueryData(['contacts-infinite'], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any) => ({
          ...page,
          contacts: page.contacts.map((c: ContactLight) => 
            ids.includes(c.id) ? { ...c, campaign: campaign || undefined } : c
          )
        })) || []
      }));
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(['contacts-infinite'], context?.previousData);
      toast.error('Erro ao atualizar campanha em massa');
    },
    onSuccess: (_, { ids, campaign }) => {
      toast.success(`Campanha ${campaign ? 'atribuída' : 'removida'} de ${ids.length} contato(s)`);
    },
  });

  return {
    contacts,
    totalCount,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    refetch,
    updateStatus: updateStatusMutation.mutate,
    updateStatusAsync: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
    deleteContact: deleteContactMutation.mutate,
    deleteContactAsync: deleteContactMutation.mutateAsync,
    isDeleting: deleteContactMutation.isPending,
    bulkUpdateStatus: bulkUpdateStatusMutation.mutate,
    isBulkUpdatingStatus: bulkUpdateStatusMutation.isPending,
    bulkDelete: bulkDeleteMutation.mutate,
    isBulkDeleting: bulkDeleteMutation.isPending,
    bulkUpdateCampaign: bulkUpdateCampaignMutation.mutate,
    isBulkUpdatingCampaign: bulkUpdateCampaignMutation.isPending,
    invalidateContacts: () => queryClient.invalidateQueries({ queryKey: ['contacts-infinite'] }),
  };
};

// Manter useContacts como alias para compatibilidade
export const useContacts = useContactsInfinite;

// Hook separado para campanhas (cache longo)
export const useCampaigns = () => {
  return useQuery({
    queryKey: ['campaigns-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
    staleTime: 30 * 60 * 1000,  // 30 minutos
    gcTime: 60 * 60 * 1000,     // 1 hora
  });
};

// Hook separado para filtros (owners e pipelines)
export const useContactFilters = () => {
  const ownersQuery = useQuery({
    queryKey: ['team-members-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      return data || [];
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  return {
    owners: ownersQuery.data || [],
    pipelines: [],
    isLoading: ownersQuery.isLoading,
  };
};
