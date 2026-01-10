import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Filter, Send, Download, RefreshCw, CheckCircle, AlertCircle, Clock, MessageSquare, Mail, Sparkles, AlertTriangle, Trash2, Pencil, Building2 } from 'lucide-react';
import { KNOWN_INSURERS } from '@/constants/insurers';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CollectionEmailCampaign } from './CollectionEmailCampaign';
import { SendInstallmentWhatsAppModal } from './SendInstallmentWhatsAppModal';
import { SendCollectionTemplateModal } from './SendCollectionTemplateModal';
import { CompanyDetailsDrawer, EditCompanyModal } from '@/components/segurados';

// Interface for company details drawer
interface CompanyForDrawer {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  cep?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  notes?: string | null;
  contacts_count: number;
  billing_contacts_count: number;
  policies_count: number;
  overdue_value: number;
  max_days_overdue: number;
}

interface Installment {
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
    company: {
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
    } | null;
  } | null;
}

export const InstallmentsList: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<string>('all');
  const [dataQualityFilter, setDataQualityFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showEmailCampaign, setShowEmailCampaign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedInstallmentForWhatsApp, setSelectedInstallmentForWhatsApp] = useState<Installment | null>(null);
  const [showBulkWhatsAppModal, setShowBulkWhatsAppModal] = useState(false);
  const [selectedCompanyForDrawer, setSelectedCompanyForDrawer] = useState<CompanyForDrawer | null>(null);
  const [selectedCompanyForEdit, setSelectedCompanyForEdit] = useState<CompanyForDrawer | null>(null);
  const [loadingCompany, setLoadingCompany] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch company details for drawer
  const handleOpenCompanyDrawer = async (companyId: string) => {
    if (!companyId) {
      console.log('handleOpenCompanyDrawer: No companyId provided');
      return;
    }
    
    console.log('handleOpenCompanyDrawer: Opening drawer for company:', companyId);
    setLoadingCompany(companyId);
    
    try {
      // Fetch company data
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      
      if (companyError) throw companyError;
      console.log('handleOpenCompanyDrawer: Company data loaded:', company);
      
      // First fetch policies for this company
      const { data: policies } = await supabase
        .from('policies')
        .select('id')
        .eq('company_id', companyId);
      
      const policyIds = policies?.map(p => p.id) || [];
      console.log('handleOpenCompanyDrawer: Found policies:', policyIds.length);
      
      // Fetch counts and aggregations
      const [contactsResult, billingContactsResult, policiesResult] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_billing_contact', true),
        supabase.from('policies').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      ]);
      
      // Fetch installments using policy IDs
      let overdueValue = 0;
      let maxDaysOverdue = 0;
      
      if (policyIds.length > 0) {
        const { data: installmentsData } = await supabase
          .from('installments')
          .select('value, days_overdue')
          .in('policy_id', policyIds)
          .in('status', ['pending', 'overdue', 'negotiating']);
        
        const overdueInstallments = installmentsData || [];
        overdueValue = overdueInstallments.reduce((sum, i) => sum + (i.value || 0), 0);
        maxDaysOverdue = overdueInstallments.length > 0 
          ? Math.max(...overdueInstallments.map(i => i.days_overdue || 0))
          : 0;
      }
      
      const companyData = {
        id: company.id,
        cnpj: company.cnpj,
        razao_social: company.razao_social,
        nome_fantasia: company.nome_fantasia,
        city: company.city,
        state: company.state,
        street: company.street,
        number: company.number,
        complement: company.complement,
        neighborhood: company.neighborhood,
        cep: company.cep,
        inscricao_estadual: company.inscricao_estadual,
        inscricao_municipal: company.inscricao_municipal,
        notes: company.notes,
        contacts_count: contactsResult.count || 0,
        billing_contacts_count: billingContactsResult.count || 0,
        policies_count: policiesResult.count || 0,
        overdue_value: overdueValue,
        max_days_overdue: maxDaysOverdue
      };
      
      console.log('handleOpenCompanyDrawer: Setting company for drawer:', companyData);
      setSelectedCompanyForDrawer(companyData);
    } catch (error) {
      console.error('Error fetching company details:', error);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setLoadingCompany(null);
    }
  };

  const { data: installments, isLoading, refetch } = useQuery({
    queryKey: ['installments', search, statusFilter, rangeFilter, dataQualityFilter],
    queryFn: async () => {
      let query = supabase
        .from('installments')
        .select(`
          *,
          contact:contacts(id, name, phone_number),
          policy:policies(id, policy_number, insurer, company:companies(id, razao_social, nome_fantasia))
        `)
        .order('days_overdue', { ascending: false });

      if (statusFilter !== 'all') {
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

      // Data quality filter
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

      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      
      // Filter by search locally
      if (search) {
        const searchLower = search.toLowerCase();
        return (data as Installment[]).filter(inst => 
          inst.contact?.name?.toLowerCase().includes(searchLower) ||
          inst.contact?.phone_number?.includes(search) ||
          inst.policy?.policy_number?.toLowerCase().includes(searchLower) ||
          inst.policy?.insurer?.toLowerCase().includes(searchLower) ||
          inst.policy?.company?.razao_social?.toLowerCase().includes(searchLower) ||
          inst.policy?.company?.nome_fantasia?.toLowerCase().includes(searchLower)
        );
      }
      
      return data as Installment[];
    }
  });

  // Calculate selected total value
  const selectedTotal = useMemo(() => {
    if (!installments || selectedIds.length === 0) return 0;
    return installments
      .filter(inst => selectedIds.includes(inst.id))
      .reduce((sum, inst) => sum + (inst.value || 0), 0);
  }, [installments, selectedIds]);

  // Count of installments with >30 days overdue
  const overdue30Count = useMemo(() => {
    return installments?.filter(inst => inst.days_overdue > 30).length || 0;
  }, [installments]);

  // Count of incomplete installments
  const incompleteCount = useMemo(() => {
    return installments?.filter(inst => !inst.policy || !inst.contact).length || 0;
  }, [installments]);

  // Select all installments with >30 days overdue
  const selectOverdue30Plus = () => {
    if (!installments) return;
    
    const overdue30 = installments.filter(inst => inst.days_overdue > 30);
    const overdue30Ids = overdue30.map(i => i.id);
    
    // Toggle: if all are already selected, deselect
    const allSelected = overdue30Ids.length > 0 && overdue30Ids.every(id => selectedIds.includes(id));
    
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !overdue30Ids.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...overdue30Ids])]);
    }
  };

  const markAsPaidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('installments')
        .update({ 
          status: 'paid', 
          paid_at: new Date().toISOString(),
          days_overdue: 0 
        })
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      setSelectedIds([]);
      toast.success('Parcelas marcadas como pagas');
    },
    onError: () => {
      toast.error('Erro ao atualizar parcelas');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('installments')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-summary'] });
      const count = selectedIds.length;
      setSelectedIds([]);
      setShowDeleteConfirm(false);
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getStatusBadge = (status: string, daysOverdue: number) => {
    if (status === 'paid') {
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Pago</Badge>;
    }
    if (status === 'negotiating') {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Negociando</Badge>;
    }
    if (daysOverdue > 90) {
      return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Crítico</Badge>;
    }
    if (daysOverdue > 60) {
      return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Urgente</Badge>;
    }
    if (daysOverdue > 30) {
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Atrasado</Badge>;
    }
    if (daysOverdue > 0) {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Vencido</Badge>;
    }
    return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">Pendente</Badge>;
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

  const handleExport = () => {
    if (!installments || installments.length === 0) {
      toast.error('Nenhuma parcela para exportar');
      return;
    }

    const csvContent = [
      ['Nome', 'Telefone', 'Empresa', 'Apólice', 'Seguradora', 'Parcela', 'Valor', 'Vencimento', 'Dias Atraso', 'Status'].join(';'),
      ...installments.map(inst => [
        inst.contact?.name || '',
        inst.contact?.phone_number || '',
        inst.policy?.company?.nome_fantasia || inst.policy?.company?.razao_social || '',
        inst.policy?.policy_number || '',
        inst.policy?.insurer || '',
        inst.installment_number,
        inst.value,
        inst.due_date,
        inst.days_overdue,
        inst.status
      ].join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `parcelas_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    toast.success('Arquivo exportado com sucesso');
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Filters Bar */}
      <Card className="bg-slate-900/50 border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Buscar por nome, telefone, apólice..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-800/50 border-white/10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="negotiating">Negociando</SelectItem>
              </SelectContent>
            </Select>

            <Select value={rangeFilter} onValueChange={setRangeFilter}>
              <SelectTrigger className="w-[150px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Dias atraso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="1-30">1-30 dias</SelectItem>
                <SelectItem value="31-60">31-60 dias</SelectItem>
                <SelectItem value="61-90">61-90 dias</SelectItem>
                <SelectItem value="90+">90+ dias</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dataQualityFilter} onValueChange={setDataQualityFilter}>
              <SelectTrigger className="w-[180px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Qualidade dados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os registros</SelectItem>
                <SelectItem value="incomplete">⚠️ Dados incompletos</SelectItem>
                <SelectItem value="no-policy">Sem apólice</SelectItem>
                <SelectItem value="no-contact">Sem contato</SelectItem>
              </SelectContent>
            </Select>

            {incompleteCount > 0 && dataQualityFilter === 'all' && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                {incompleteCount} incompleto(s)
              </Badge>
            )}

            <Button 
              variant="outline" 
              size="icon"
              onClick={() => refetch()}
              className="border-white/10"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>

            <Button 
              variant="outline"
              onClick={handleExport}
              className="border-white/10 gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar
            </Button>

            <Button 
              variant="outline"
              onClick={selectOverdue30Plus}
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/20 gap-2"
              disabled={overdue30Count === 0}
            >
              <AlertTriangle className="w-4 h-4" />
              Selecionar +30d ({overdue30Count})
            </Button>
          </div>

          {/* Selected Actions */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
              <span className="text-sm text-slate-400">
                {selectedIds.length} selecionado(s)
              </span>
              <Button 
                size="sm" 
                className="bg-green-600 hover:bg-green-700 gap-2"
                onClick={() => markAsPaidMutation.mutate(selectedIds)}
                disabled={markAsPaidMutation.isPending}
              >
                <CheckCircle className="w-4 h-4" />
                Marcar como Pago
              </Button>
              <Button 
                size="sm" 
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 gap-2"
                onClick={() => setShowEmailCampaign(true)}
              >
                <Sparkles className="w-4 h-4" />
                Gerar Emails com IA ({selectedIds.length})
              </Button>
              <Button 
                size="sm" 
                className="bg-green-600 hover:bg-green-700 gap-2"
                onClick={() => setShowBulkWhatsAppModal(true)}
              >
                <MessageSquare className="w-4 h-4" />
                WhatsApp ({selectedIds.length})
              </Button>
              
              <Select
                value=""
                onValueChange={(value) => {
                  bulkUpdateInsurerMutation.mutate({ 
                    installmentIds: selectedIds, 
                    insurer: value 
                  });
                }}
              >
                <SelectTrigger className="w-[180px] h-9 bg-slate-800/50 border-white/10">
                  <Pencil className="w-4 h-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Trocar Seguradora" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {KNOWN_INSURERS.map((insurer) => (
                    <SelectItem key={insurer} value={insurer}>
                      {insurer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/20 gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir ({selectedIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <span>Tem certeza que deseja excluir {selectedIds.length} parcela(s)?</span>
                      <br />
                      <span className="text-amber-400 font-medium">
                        Valor total: {formatCurrency(selectedTotal)}
                      </span>
                      <br />
                      <span className="text-red-400 font-medium">
                        Esta ação não pode ser desfeita.
                      </span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate(selectedIds)}
                      className="bg-red-600 hover:bg-red-700"
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-slate-900/50 border-white/5">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : installments && installments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedIds.length === installments.length && installments.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Apólice</TableHead>
                  <TableHead>Seguradora</TableHead>
                  <TableHead className="text-center">Parcela</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Vencimento</TableHead>
                  <TableHead className="text-center">Atraso</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {installments.map((inst) => (
                  <TableRow 
                    key={inst.id} 
                    className={`border-white/5 hover:bg-white/[0.02] ${
                      (!inst.policy || !inst.contact) ? 'bg-amber-500/5 border-l-2 border-l-amber-500/50' : ''
                    }`}
                  >
                    <TableCell>
                      <Checkbox 
                        checked={selectedIds.includes(inst.id)}
                        onCheckedChange={() => toggleSelect(inst.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-200">
                          {inst.contact?.name || 'N/A'}
                        </p>
                        <p className="text-sm text-slate-500">
                          {inst.contact?.phone_number || ''}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {inst.policy?.company?.id ? (
                        <button
                          onClick={() => handleOpenCompanyDrawer(inst.policy!.company!.id)}
                          disabled={loadingCompany === inst.policy?.company?.id}
                          className="group flex items-center gap-2 font-medium text-slate-200 truncate max-w-[180px] hover:text-blue-400 transition-colors text-left disabled:opacity-50"
                          title={inst.policy?.company?.razao_social || ''}
                        >
                          {loadingCompany === inst.policy?.company?.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
                          ) : (
                            <Building2 className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors flex-shrink-0" />
                          )}
                          <span className="truncate">
                            {inst.policy?.company?.nome_fantasia || inst.policy?.company?.razao_social}
                          </span>
                        </button>
                      ) : (
                        <span className="text-slate-500">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {inst.policy?.policy_number || 'N/A'}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {inst.policy?.id ? (
                        <Select
                          value={inst.policy.insurer || ''}
                          onValueChange={(value) => updateInsurerMutation.mutate({ policyId: inst.policy!.id, insurer: value })}
                        >
                          <SelectTrigger className="h-8 w-[160px] bg-transparent border-transparent hover:border-white/20 hover:bg-white/5 text-left">
                            <SelectValue placeholder="Selecionar">
                              <span className="flex items-center gap-2">
                                {inst.policy.insurer || 'N/A'}
                                <Pencil className="w-3 h-3 text-slate-500" />
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px]">
                            {KNOWN_INSURERS.map((insurer) => (
                              <SelectItem key={insurer} value={insurer}>
                                {insurer}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell className="text-center text-slate-300">
                      {inst.installment_number}
                    </TableCell>
                    <TableCell className="text-right font-medium text-amber-400">
                      {formatCurrency(inst.value)}
                    </TableCell>
                    <TableCell className="text-center text-slate-300">
                      {format(new Date(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${
                        inst.days_overdue > 90 ? 'text-rose-400' :
                        inst.days_overdue > 60 ? 'text-orange-400' :
                        inst.days_overdue > 30 ? 'text-amber-400' :
                        inst.days_overdue > 0 ? 'text-yellow-400' :
                        'text-slate-400'
                      }`}>
                        {inst.days_overdue}d
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(inst.status, inst.days_overdue)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-green-500/20 hover:text-green-400"
                          title="Marcar como pago"
                          onClick={() => markAsPaidMutation.mutate([inst.id])}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-green-500/20 hover:text-green-400"
                          title="Enviar cobrança via WhatsApp"
                          onClick={() => setSelectedInstallmentForWhatsApp(inst)}
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-red-500/20 hover:text-red-400"
                          title="Excluir parcela"
                          onClick={() => {
                            setSelectedIds([inst.id]);
                            setShowDeleteConfirm(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-slate-500">
              Nenhuma parcela encontrada com os filtros aplicados
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Campaign Modal */}
      <CollectionEmailCampaign
        open={showEmailCampaign}
        onOpenChange={setShowEmailCampaign}
        filters={{ 
          range: rangeFilter,
          selectedInstallmentIds: selectedIds 
        }}
      />

      {/* Individual WhatsApp Modal */}
      <SendInstallmentWhatsAppModal
        isOpen={!!selectedInstallmentForWhatsApp}
        onClose={() => setSelectedInstallmentForWhatsApp(null)}
        installment={selectedInstallmentForWhatsApp}
        onSent={() => refetch()}
      />

      {/* Bulk WhatsApp Modal */}
      <SendCollectionTemplateModal
        isOpen={showBulkWhatsAppModal}
        onClose={() => setShowBulkWhatsAppModal(false)}
        rangeFilter={rangeFilter}
        installmentIds={selectedIds}
        onSent={() => {
          refetch();
          setSelectedIds([]);
        }}
      />

      {/* Company Details Drawer */}
      <CompanyDetailsDrawer
        open={!!selectedCompanyForDrawer}
        onOpenChange={(open) => !open && setSelectedCompanyForDrawer(null)}
        company={selectedCompanyForDrawer}
        onEdit={() => {
          setSelectedCompanyForEdit(selectedCompanyForDrawer);
        }}
        onRefresh={() => refetch()}
      />

      {/* Edit Company Modal */}
      <EditCompanyModal
        open={!!selectedCompanyForEdit}
        company={selectedCompanyForEdit}
        onOpenChange={(open) => !open && setSelectedCompanyForEdit(null)}
        onSuccess={() => {
          setSelectedCompanyForEdit(null);
          setSelectedCompanyForDrawer(null);
          refetch();
        }}
      />

      {/* Floating Selection Counter */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <Card className="bg-slate-900/95 border-white/10 shadow-2xl backdrop-blur-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-slate-200">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="font-medium">{selectedIds.length} parcelas</span>
                  </div>
                  <div className="text-lg font-bold text-amber-400">
                    {formatCurrency(selectedTotal)}
                  </div>
                </div>
                
                <Button 
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 gap-2"
                  onClick={() => setShowEmailCampaign(true)}
                >
                  <Sparkles className="w-4 h-4" />
                  Gerar Emails
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
