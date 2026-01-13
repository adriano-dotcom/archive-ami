import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Ramos SUSEP de seguro de transporte/carga
const CARGO_BRANCHES = ['309', '31', '32', '33', '0309', '031', '032', '033'];
const CARGO_PRODUCTS = ['transportador', 'rctr', 'rctr-c', 'rc-dc', 'carga', 'transporte', 'embarcador'];

export const isCargoInsurance = (policy: { branch?: string | null; product?: string | null; is_cargo_insurance?: boolean } | null): boolean => {
  if (!policy) return false;
  if (policy.is_cargo_insurance) return true;
  if (policy.branch && CARGO_BRANCHES.includes(policy.branch)) return true;
  if (policy.product) {
    const productLower = policy.product.toLowerCase();
    return CARGO_PRODUCTS.some(p => productLower.includes(p));
  }
  return false;
};

export interface Installment {
  id: string;
  installment_number: number;
  value: number;
  due_date: string;
  status: string;
  days_overdue: number;
  contact: {
    id: string;
    name: string;
    phone_number: string;
  } | null;
  policy: {
    id: string;
    policy_number: string;
    insurer: string;
    branch: string | null;
    product: string | null;
    is_cargo_insurance?: boolean | null;
    start_date: string | null;
    end_date: string | null;
    total_value: number | null;
    status: string;
    company: {
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
      cnpj: string | null;
    } | null;
  } | null;
}

export interface InstallmentHistory {
  id: string;
  installment_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  previous_value: number | null;
  new_value: number | null;
  performed_by: string | null;
  performed_at: string;
  notes: string | null;
  can_revert: boolean;
  metadata: Record<string, any>;
}

export type SortColumn = 'empresa' | 'cnpj' | 'contato' | 'seguradora' | 'apolice' | 'parcela' | 'valor' | 'vencimento' | 'days_overdue';
export type SortDirection = 'asc' | 'desc';

interface UseInstallmentsOptions {
  search: string;
  statusFilter: string;
  rangeFilter: string;
  dataQualityFilter: string;
  insurerFilter: string;
  cargoOnlyFilter: boolean;
  emailSentFilter: string; // 'all' | 'sent' | 'not-sent'
  whatsappSentFilter: string; // 'all' | 'sent' | 'not-sent'
}

export function useInstallments(options: UseInstallmentsOptions) {
  const { search, statusFilter, rangeFilter, dataQualityFilter, insurerFilter, cargoOnlyFilter, emailSentFilter, whatsappSentFilter } = options;
  const queryClient = useQueryClient();
  
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortColumn, setSortColumn] = useState<SortColumn>('days_overdue');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [lastMarkedAsPaid, setLastMarkedAsPaid] = useState<{ 
    ids: string[]; 
    previousStatuses: Map<string, { status: string; paid_at: string | null }> 
  } | null>(null);

  // Fetch attempt counts
  const { data: attemptCounts } = useQuery({
    queryKey: ['installment-attempt-counts'],
    queryFn: async () => {
      const { data: whatsappData, error: whatsappError } = await supabase
        .from('collection_attempts')
        .select('installment_id')
        .eq('channel', 'whatsapp')
        .eq('status', 'sent');

      if (whatsappError) throw whatsappError;

      const { data: emailData, error: emailError } = await supabase
        .from('collection_email_logs')
        .select('installments_included')
        .eq('status', 'sent');

      if (emailError) throw emailError;

      const whatsappCounts: Record<string, number> = {};
      whatsappData?.forEach(row => {
        if (row.installment_id) {
          whatsappCounts[row.installment_id] = (whatsappCounts[row.installment_id] || 0) + 1;
        }
      });

      const emailCounts: Record<string, number> = {};
      emailData?.forEach(log => {
        const installments = log.installments_included as Array<{ id: string }> | null;
        installments?.forEach(inst => {
          if (inst.id) {
            emailCounts[inst.id] = (emailCounts[inst.id] || 0) + 1;
          }
        });
      });

      return { whatsappCounts, emailCounts };
    }
  });

  // Fetch installments
  const { data: installments, isLoading, refetch } = useQuery({
    queryKey: ['installments', search, statusFilter, rangeFilter, dataQualityFilter, insurerFilter, cargoOnlyFilter, emailSentFilter, whatsappSentFilter],
    queryFn: async () => {
      let query = supabase
        .from('installments')
        .select(`
          *,
          contact:contacts(id, name, phone_number),
          policy:policies(id, policy_number, insurer, branch, product, is_cargo_insurance, start_date, end_date, total_value, status, company:companies(id, razao_social, nome_fantasia, cnpj))
        `)
        .order('days_overdue', { ascending: false });

      if (statusFilter === 'all-including-paid') {
        // Show all
      } else if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      } else {
        query = query.in('status', ['pending', 'overdue', 'negotiating']);
      }

      if (rangeFilter !== 'all') {
        switch (rangeFilter) {
          case '1-30':
            query = query.gte('days_overdue', 1).lte('days_overdue', 30);
            break;
          case '31-60':
            query = query.gte('days_overdue', 31).lte('days_overdue', 60);
            break;
          case '61-90':
            query = query.gte('days_overdue', 61).lte('days_overdue', 90);
            break;
          case '90+':
            query = query.gt('days_overdue', 90);
            break;
        }
      }

      if (dataQualityFilter !== 'all') {
        switch (dataQualityFilter) {
          case 'no-policy':
            query = query.is('policy_id', null);
            break;
          case 'no-contact':
            query = query.is('contact_id', null);
            break;
          case 'incomplete':
            query = query.or('policy_id.is.null,contact_id.is.null');
            break;
        }
      }

      const { data, error } = await query.limit(500);
      
      if (error) throw error;
      
      let filteredData = data as Installment[];
      
      if (insurerFilter !== 'all') {
        filteredData = filteredData.filter(inst => 
          inst.policy?.insurer?.toUpperCase() === insurerFilter.toUpperCase()
        );
      }
      
      if (cargoOnlyFilter) {
        filteredData = filteredData.filter(inst => isCargoInsurance(inst.policy));
      }
      
      if (search) {
        const searchLower = search.toLowerCase();
        const searchDigitsOnly = search.replace(/\D/g, '');
        
        filteredData = filteredData.filter(inst => {
          const matchesName = inst.contact?.name?.toLowerCase().includes(searchLower);
          const matchesPhone = inst.contact?.phone_number?.includes(search);
          const matchesPolicyNumber = inst.policy?.policy_number?.toLowerCase().includes(searchLower);
          const matchesInsurer = inst.policy?.insurer?.toLowerCase().includes(searchLower);
          const matchesRazaoSocial = inst.policy?.company?.razao_social?.toLowerCase().includes(searchLower);
          const matchesNomeFantasia = inst.policy?.company?.nome_fantasia?.toLowerCase().includes(searchLower);
          
          const companyCnpj = inst.policy?.company?.cnpj?.replace(/\D/g, '') || '';
          const matchesCNPJ = searchDigitsOnly.length > 0 && companyCnpj.includes(searchDigitsOnly);
          
          return matchesName || matchesPhone || matchesPolicyNumber || 
                 matchesInsurer || matchesRazaoSocial || matchesNomeFantasia || matchesCNPJ;
        });
      }
      
      return filteredData;
    },
  });

  // Apply email sent filter (needs attemptCounts which is fetched separately)
  const filteredByEmail = useMemo(() => {
    if (!installments || emailSentFilter === 'all' || !attemptCounts) {
      return installments || [];
    }
    
    const { emailCounts } = attemptCounts;
    
    if (emailSentFilter === 'sent') {
      return installments.filter(inst => emailCounts[inst.id] > 0);
    } else if (emailSentFilter === 'not-sent') {
      return installments.filter(inst => !emailCounts[inst.id]);
    }
    
    return installments;
  }, [installments, emailSentFilter, attemptCounts]);

  // Apply WhatsApp sent filter
  const filteredByWhatsApp = useMemo(() => {
    if (!filteredByEmail || whatsappSentFilter === 'all' || !attemptCounts) {
      return filteredByEmail;
    }
    
    const { whatsappCounts } = attemptCounts;
    
    if (whatsappSentFilter === 'sent') {
      return filteredByEmail.filter(inst => whatsappCounts[inst.id] > 0);
    } else if (whatsappSentFilter === 'not-sent') {
      return filteredByEmail.filter(inst => !whatsappCounts[inst.id]);
    }
    
    return filteredByEmail;
  }, [filteredByEmail, whatsappSentFilter, attemptCounts]);

  // Sort installments
  const sortedInstallments = useMemo(() => {
    if (!filteredByWhatsApp || filteredByWhatsApp.length === 0) return [];
    
    return [...filteredByWhatsApp].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;
      
      switch (sortColumn) {
        case 'empresa':
          valA = (a.policy?.company?.nome_fantasia || a.policy?.company?.razao_social || '').toLowerCase();
          valB = (b.policy?.company?.nome_fantasia || b.policy?.company?.razao_social || '').toLowerCase();
          break;
        case 'cnpj':
          valA = a.policy?.company?.cnpj || '';
          valB = b.policy?.company?.cnpj || '';
          break;
        case 'contato':
          valA = (a.contact?.name || '').toLowerCase();
          valB = (b.contact?.name || '').toLowerCase();
          break;
        case 'seguradora':
          valA = (a.policy?.insurer || '').toLowerCase();
          valB = (b.policy?.insurer || '').toLowerCase();
          break;
        case 'apolice':
          valA = (a.policy?.policy_number || '').toLowerCase();
          valB = (b.policy?.policy_number || '').toLowerCase();
          break;
        case 'parcela':
          valA = a.installment_number || 0;
          valB = b.installment_number || 0;
          break;
        case 'valor':
          valA = a.value || 0;
          valB = b.value || 0;
          break;
        case 'vencimento':
          valA = new Date(a.due_date).getTime();
          valB = new Date(b.due_date).getTime();
          break;
        case 'days_overdue':
          valA = a.days_overdue || 0;
          valB = b.days_overdue || 0;
          break;
        default:
          return 0;
      }
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredByWhatsApp, sortColumn, sortDirection]);

  // Computed values
  const selectedTotal = useMemo(() => {
    if (!installments || selectedIds.length === 0) return 0;
    return installments
      .filter(inst => selectedIds.includes(inst.id))
      .reduce((sum, inst) => sum + (inst.value || 0), 0);
  }, [installments, selectedIds]);

  const overdue30Count = useMemo(() => {
    return installments?.filter(inst => inst.days_overdue > 30).length || 0;
  }, [installments]);

  const incompleteCount = useMemo(() => {
    return installments?.filter(inst => !inst.policy || !inst.contact).length || 0;
  }, [installments]);

  const atmRiskCount = useMemo(() => {
    return installments?.filter(inst => 
      isCargoInsurance(inst.policy) && inst.days_overdue >= 15
    ).length || 0;
  }, [installments]);

  const uniqueContactsCount = useMemo(() => {
    if (!installments || selectedIds.length === 0) return 0;
    const selectedInstallments = installments.filter(inst => selectedIds.includes(inst.id));
    const uniquePhones = new Set(
      selectedInstallments.map(inst => inst.contact?.phone_number).filter(Boolean)
    );
    return uniquePhones.size;
  }, [installments, selectedIds]);

  // Mutations
  const markAsPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: currentData, error: fetchError } = await supabase
        .from('installments')
        .select('id, status, paid_at')
        .in('id', ids);
      
      if (fetchError) throw fetchError;
      
      const previousStatuses = new Map<string, { status: string; paid_at: string | null }>();
      currentData?.forEach(item => {
        previousStatuses.set(item.id, { status: item.status, paid_at: item.paid_at });
      });

      const { error } = await supabase
        .from('installments')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString(),
          days_overdue: 0 
        })
        .in('id', ids);
      
      if (error) throw error;
      
      return { ids, previousStatuses };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      setSelectedIds([]);
      setLastMarkedAsPaid(data);
      
      toast.success(
        `${data.ids.length} parcela(s) marcada(s) como paga(s)`,
        {
          duration: 15000,
          action: {
            label: 'Desfazer',
            onClick: () => handleUndoMarkAsPaid(data),
          },
        }
      );
      
      setTimeout(() => setLastMarkedAsPaid(null), 30000);
    },
    onError: () => {
      toast.error('Erro ao atualizar parcelas');
    }
  });

  const handleUndoMarkAsPaid = async (data: { ids: string[]; previousStatuses: Map<string, { status: string; paid_at: string | null }> }) => {
    try {
      for (const [id, prev] of data.previousStatuses) {
        await supabase
          .from('installments')
          .update({ status: prev.status, paid_at: prev.paid_at })
          .eq('id', id);
      }
      
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      setLastMarkedAsPaid(null);
      toast.success('Ação desfeita! Parcelas restauradas ao status anterior.');
    } catch (error) {
      console.error('Error undoing mark as paid:', error);
      toast.error('Erro ao desfazer ação');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('installments')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      setSelectedIds([]);
      toast.success(`${count} parcela(s) excluída(s)`);
    },
    onError: () => {
      toast.error('Erro ao excluir parcelas');
    }
  });

  const updateInsurerMutation = useMutation({
    mutationFn: async ({ policyId, insurer }: { policyId: string; insurer: string }) => {
      const { error } = await supabase
        .from('policies')
        .update({ insurer })
        .eq('id', policyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      toast.success('Seguradora atualizada');
    },
    onError: () => {
      toast.error('Erro ao atualizar seguradora');
    }
  });

  const bulkUpdateInsurerMutation = useMutation({
    mutationFn: async ({ installmentIds, insurer }: { installmentIds: string[]; insurer: string }) => {
      const selectedInstallments = installments?.filter(inst => installmentIds.includes(inst.id)) || [];
      const policyIds = [...new Set(selectedInstallments.map(inst => inst.policy?.id).filter(Boolean))] as string[];
      
      if (policyIds.length === 0) throw new Error('Nenhuma apólice encontrada');
      
      const { error } = await supabase
        .from('policies')
        .update({ insurer })
        .in('id', policyIds);
      
      if (error) throw error;
      return policyIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      toast.success(`Seguradora atualizada em ${count} apólice(s)`);
    },
    onError: () => {
      toast.error('Erro ao atualizar seguradoras');
    }
  });

  // Actions
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (installments && selectedIds.length === installments.length) {
      setSelectedIds([]);
    } else if (installments) {
      setSelectedIds(installments.map(i => i.id));
    }
  };

  const selectOverdue30Plus = () => {
    if (!installments) return;
    
    const overdue30 = installments.filter(inst => inst.days_overdue > 30);
    const overdue30Ids = overdue30.map(i => i.id);
    
    const allSelected = overdue30Ids.length > 0 && overdue30Ids.every(id => selectedIds.includes(id));
    
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !overdue30Ids.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...overdue30Ids])]);
    }
  };

  return {
    // Data
    installments,
    sortedInstallments,
    attemptCounts,
    isLoading,
    
    // Selection
    selectedIds,
    setSelectedIds,
    toggleSelect,
    toggleSelectAll,
    selectOverdue30Plus,
    
    // Sorting
    sortColumn,
    sortDirection,
    handleSort,
    
    // Computed
    selectedTotal,
    overdue30Count,
    incompleteCount,
    atmRiskCount,
    uniqueContactsCount,
    
    // Mutations
    markAsPaidMutation,
    deleteMutation,
    updateInsurerMutation,
    bulkUpdateInsurerMutation,
    
    // Other
    refetch,
    lastMarkedAsPaid,
  };
}
