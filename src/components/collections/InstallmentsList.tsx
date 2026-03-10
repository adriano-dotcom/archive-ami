import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Search, Filter, Download, RefreshCw, CheckCircle, MessageSquare, 
  Mail, Sparkles, AlertTriangle, Trash2, Pencil, Building2, 
  ChevronUp, ChevronDown, ArrowUpDown, Truck, History, Copy, MessageCircle, Clock,
  AlertOctagon
} from 'lucide-react';

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
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CollectionEmailCampaign } from './CollectionEmailCampaign';
import { SendInstallmentWhatsAppModal } from './SendInstallmentWhatsAppModal';
import { SendCollectionTemplateModal } from './SendCollectionTemplateModal';
import { CompanyDetailsDrawer, EditCompanyModal } from '@/components/segurados';
import { 
  useInstallments, 
  isCargoInsurance, 
  Installment, 
  SortColumn 
} from './installments';
import { InstallmentHistoryDrawer } from './installments/InstallmentHistoryDrawer';
import { MarkAsPaidDialog } from './installments/MarkAsPaidDialog';
import { EmptyState } from './installments/EmptyState';
import { EditInstallmentModal } from './installments/EditInstallmentModal';
import { DuplicateInstallmentsModal } from './DuplicateInstallmentsModal';
import { TablePagination } from '@/components/ui/table-pagination';
import { useDebounce } from '@/hooks/useDebounce';

// Interface for recent import
interface RecentImport {
  session_id: string;
  file_names: string[];
  created_at: string;
  imported_installments: number;
}

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

const formatCNPJ = (cnpj: string | null | undefined) => {
  if (!cnpj) return 'N/A';
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

export const InstallmentsList: React.FC = () => {
  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [rangeFilter, setRangeFilter] = useState<string>('all');
  const [dataQualityFilter, setDataQualityFilter] = useState<string>('all');
  
  const [cargoOnlyFilter, setCargoOnlyFilter] = useState<boolean>(false);
  const [emailSentFilter, setEmailSentFilter] = useState<string>('all');
  const [whatsappSentFilter, setWhatsappSentFilter] = useState<string>('all');
  const [importSessionFilter, setImportSessionFilter] = useState<string>('all');
  const [collectedThisWeekFilter, setCollectedThisWeekFilter] = useState<string>('all');
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // UI state
  const [showEmailCampaign, setShowEmailCampaign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMarkAsPaidConfirm, setShowMarkAsPaidConfirm] = useState(false);
  const [pendingMarkAsPaidIds, setPendingMarkAsPaidIds] = useState<string[]>([]);
  const [selectedInstallmentForWhatsApp, setSelectedInstallmentForWhatsApp] = useState<Installment | null>(null);
  const [showBulkWhatsAppModal, setShowBulkWhatsAppModal] = useState(false);
  const [selectedCompanyForDrawer, setSelectedCompanyForDrawer] = useState<CompanyForDrawer | null>(null);
  const [selectedCompanyForEdit, setSelectedCompanyForEdit] = useState<CompanyForDrawer | null>(null);
  const [loadingCompany, setLoadingCompany] = useState<string | null>(null);
  const [selectedInstallmentForHistory, setSelectedInstallmentForHistory] = useState<Installment | null>(null);
  const [selectedInstallmentForEdit, setSelectedInstallmentForEdit] = useState<Installment | null>(null);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

  // Fetch recent imports for filter
  const { data: recentImports } = useQuery({
    queryKey: ['recent-imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_audit_logs')
        .select('session_id, file_names, created_at, imported_installments')
        .eq('status', 'completed')
        .gt('imported_installments', 0)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as RecentImport[];
    }
  });

  // Apply debounce to search for better performance
  const debouncedSearch = useDebounce(search, 300);

  // Use custom hook with debounced search
  const {
    sortedInstallments,
    attemptCounts,
    isLoading,
    selectedIds,
    setSelectedIds,
    toggleSelect,
    toggleSelectAll,
    selectOverdue30Plus,
    sortColumn,
    sortDirection,
    handleSort,
    selectedTotal,
    overdue30Count,
    incompleteCount,
    atmRiskCount,
    uniqueContactsCount,
    markAsPaidMutation,
    deleteMutation,
    clearAllMutation,
    refetch,
  } = useInstallments({
    search: debouncedSearch,  // Use debounced value
    statusFilter,
    rangeFilter,
    dataQualityFilter,
    insurerFilter: 'all',
    cargoOnlyFilter,
    emailSentFilter,
    whatsappSentFilter,
    importSessionFilter,
    collectedThisWeekFilter,
  });

  // Paginated installments
  const paginatedInstallments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedInstallments.slice(start, start + pageSize);
  }, [sortedInstallments, currentPage, pageSize]);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, rangeFilter, dataQualityFilter, cargoOnlyFilter, emailSentFilter, whatsappSentFilter, importSessionFilter, collectedThisWeekFilter]);

  // Pending mark as paid value
  const pendingMarkAsPaidValue = useMemo(() => {
    if (pendingMarkAsPaidIds.length === 0) return 0;
    return sortedInstallments
      .filter(inst => pendingMarkAsPaidIds.includes(inst.id))
      .reduce((sum, inst) => sum + (inst.value || 0), 0);
  }, [sortedInstallments, pendingMarkAsPaidIds]);

  const pendingInstallments = useMemo(() => {
    return sortedInstallments.filter(inst => pendingMarkAsPaidIds.includes(inst.id));
  }, [sortedInstallments, pendingMarkAsPaidIds]);

  // Sortable header component
  const SortableHeader: React.FC<{ column: SortColumn; label: string; className?: string }> = ({ column, label, className = '' }) => (
    <TableHead 
      className={`cursor-pointer hover:bg-white/5 transition-colors select-none ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortColumn === column ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="w-4 h-4 text-blue-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-blue-400" />
          )
        ) : (
          <ArrowUpDown className="w-3 h-3 text-slate-500" />
        )}
      </div>
    </TableHead>
  );

  // Fetch company details for drawer
  const handleOpenCompanyDrawer = async (companyId: string) => {
    if (!companyId) return;
    
    setLoadingCompany(companyId);
    
    try {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();
      
      if (companyError) throw companyError;
      
      const { data: policies } = await supabase
        .from('policies')
        .select('id')
        .eq('company_id', companyId);
      
      const policyIds = policies?.map(p => p.id) || [];
      
      const [contactsResult, billingContactsResult, policiesResult] = await Promise.all([
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('is_billing_contact', true),
        supabase.from('policies').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
      ]);
      
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
      
      setSelectedCompanyForDrawer({
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
      });
    } catch (error) {
      console.error('Error fetching company details:', error);
      toast.error('Erro ao carregar dados da empresa');
    } finally {
      setLoadingCompany(null);
    }
  };

  const handleMarkAsPaid = (ids: string[]) => {
    setPendingMarkAsPaidIds(ids);
    setShowMarkAsPaidConfirm(true);
  };

  const confirmMarkAsPaid = () => {
    markAsPaidMutation.mutate(pendingMarkAsPaidIds);
    setShowMarkAsPaidConfirm(false);
    setPendingMarkAsPaidIds([]);
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

  const getAtmRiskBadge = (inst: Installment) => {
    if (isCargoInsurance(inst.policy) && inst.days_overdue >= 15) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge className="bg-red-500/30 text-red-400 border-red-500/40 animate-pulse ml-1">
                <Truck className="w-3 h-3 mr-1" />
                ATM
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-sm">Seguro de carga com risco de suspensão do ATM</p>
              <p className="text-xs text-slate-400">Atraso &gt; 15 dias pode bloquear averbações</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return null;
  };

  const handleExport = () => {
    if (!sortedInstallments || sortedInstallments.length === 0) {
      toast.error('Nenhuma parcela para exportar');
      return;
    }

    const csvContent = [
      ['Empresa', 'CNPJ', 'Contato', 'Telefone', 'Seguradora', 'Apólice', 'Parcela', 'Valor', 'Vencimento', 'Dias Atraso', 'Status'].join(';'),
      ...sortedInstallments.map(inst => [
        inst.policy?.company?.nome_fantasia || inst.policy?.company?.razao_social || '',
        inst.policy?.company?.cnpj || '',
        inst.contact?.name || '',
        inst.contact?.phone_number || '',
        inst.policy?.insurer || '',
        inst.policy?.policy_number || '',
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
              <Input
                placeholder="Buscar por nome, telefone, apólice..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-slate-800/50 border-white/10"
                aria-label="Buscar parcelas por nome, telefone ou apólice"
              />
            </div>

            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Pendentes</SelectItem>
                <SelectItem value="all-including-paid">Todas as Parcelas</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="negotiating">Negociando</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
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

            <Select value={emailSentFilter} onValueChange={setEmailSentFilter}>
              <SelectTrigger className="w-[180px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Status Email" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (Email)</SelectItem>
                <SelectItem value="sent">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-green-400" />
                    Com email enviado
                  </div>
                </SelectItem>
                <SelectItem value="not-sent">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    Sem email enviado
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={whatsappSentFilter} onValueChange={setWhatsappSentFilter}>
              <SelectTrigger className="w-[180px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Status WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (WhatsApp)</SelectItem>
                <SelectItem value="sent">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-green-400" />
                    Com WhatsApp enviado
                  </div>
                </SelectItem>
                <SelectItem value="not-sent">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-slate-400" />
                    Sem WhatsApp enviado
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Collected this week filter */}
            <Select value={collectedThisWeekFilter} onValueChange={setCollectedThisWeekFilter}>
              <SelectTrigger className="w-[200px] bg-slate-800/50 border-white/10">
                <SelectValue placeholder="Cobrança Semana" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos (Semana)</SelectItem>
                <SelectItem value="collected">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-green-400" />
                    Já cobrado esta semana
                  </div>
                </SelectItem>
                <SelectItem value="not-collected">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    Não cobrado esta semana
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Import session filter */}
            {recentImports && recentImports.length > 0 && (
              <Select value={importSessionFilter} onValueChange={setImportSessionFilter}>
                <SelectTrigger className="w-[200px] bg-slate-800/50 border-white/10">
                  <SelectValue placeholder="Importação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      Todas Importações
                    </div>
                  </SelectItem>
                  {recentImports.map((imp) => {
                    const firstFileName = imp.file_names?.[0] || 'Arquivo';
                    const shortName = firstFileName.length > 20 
                      ? firstFileName.substring(0, 20) + '...' 
                      : firstFileName;
                    const dateFormatted = format(new Date(imp.created_at), 'dd/MM HH:mm', { locale: ptBR });
                    
                    return (
                      <SelectItem key={imp.session_id} value={imp.session_id}>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-400" />
                          <span className="truncate max-w-[130px]">{shortName}</span>
                          <span className="text-xs text-slate-500">
                            {dateFormatted} ({imp.imported_installments})
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}

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
              aria-label="Atualizar lista de parcelas"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </Button>

            <Button 
              variant="outline"
              onClick={handleExport}
              className="border-white/10 gap-2"
              aria-label="Exportar parcelas para arquivo CSV"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Exportar
            </Button>

            <Button 
              variant={cargoOnlyFilter ? "default" : "outline"}
              onClick={() => setCargoOnlyFilter(!cargoOnlyFilter)}
              className={cargoOnlyFilter 
                ? "bg-blue-600 hover:bg-blue-700 gap-2" 
                : "border-blue-500/30 text-blue-400 hover:bg-blue-500/20 gap-2"
              }
            >
              <Truck className="w-4 h-4" />
              Só Carga {atmRiskCount > 0 && `(${atmRiskCount} ATM risco)`}
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

            <Button 
              variant="outline"
              onClick={() => setShowDuplicatesModal(true)}
              className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20 gap-2"
              disabled={sortedInstallments.length === 0}
              aria-label="Abrir modal para detectar parcelas duplicadas"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              Detectar Duplicatas
            </Button>

            <AlertDialog open={showClearAllConfirm} onOpenChange={setShowClearAllConfirm}>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/20 gap-2"
                  disabled={sortedInstallments.length === 0}
                >
                  <AlertOctagon className="w-4 h-4" />
                  Limpar Todas
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertOctagon className="w-5 h-5 text-red-500" />
                    Limpar Todas as Parcelas Pendentes
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <span className="block">
                      Esta ação irá excluir <strong>TODAS</strong> as parcelas pendentes, vencidas e em negociação do sistema.
                    </span>
                    <span className="block text-amber-400 font-medium">
                      Total de parcelas que serão excluídas: {sortedInstallments.length}
                    </span>
                    <span className="block text-red-400 font-medium">
                      ⚠️ Esta ação NÃO pode ser desfeita!
                    </span>
                    <span className="block text-slate-500 text-xs">
                      O histórico de cobranças anteriores será mantido nos logs.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearAllMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                    disabled={clearAllMutation.isPending}
                  >
                    {clearAllMutation.isPending ? 'Excluindo...' : 'Sim, Limpar Tudo'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Selected Actions */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
              <span className="text-sm text-slate-400">
                {selectedIds.length} selecionado(s)
              </span>
              <Button 
                size="sm" 
                variant="outline"
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20 gap-2"
                onClick={() => handleMarkAsPaid(selectedIds)}
                disabled={markAsPaidMutation.isPending}
              >
                <CheckCircle className="w-4 h-4" />
                Marcar como Pago ({selectedIds.length})
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 gap-2"
                      onClick={() => setShowEmailCampaign(true)}
                    >
                      <Sparkles className="w-4 h-4" />
                      Gerar Emails ({uniqueContactsCount} contato{uniqueContactsCount !== 1 ? 's' : ''})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {selectedIds.length} parcelas de {uniqueContactsCount} contato(s) - valores serão consolidados
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700 gap-2"
                      onClick={() => setShowBulkWhatsAppModal(true)}
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp ({uniqueContactsCount} contato{uniqueContactsCount !== 1 ? 's' : ''})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {selectedIds.length} parcelas de {uniqueContactsCount} contato(s) - valores serão consolidados
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              
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
          ) : sortedInstallments && sortedInstallments.length > 0 ? (
            <Table aria-label="Lista de parcelas pendentes">
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedIds.length === sortedInstallments.length && sortedInstallments.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Selecionar todas as parcelas"
                    />
                  </TableHead>
                  <SortableHeader column="empresa" label="Empresa" />
                  <SortableHeader column="cnpj" label="CNPJ" />
                  <SortableHeader column="contato" label="Contato" />
                  
                  <SortableHeader column="apolice" label="Apólice" />
                  <SortableHeader column="parcela" label="Parcela" className="text-center" />
                  <SortableHeader column="valor" label="Valor" className="text-right" />
                  <SortableHeader column="vencimento" label="Vencimento" className="text-center" />
                  <SortableHeader column="days_overdue" label="Atraso" className="text-center" />
                  <TableHead className="text-center" scope="col">Status</TableHead>
                  <TableHead className="text-center" scope="col">Envios</TableHead>
                  <TableHead className="text-center" scope="col">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInstallments.map((inst) => (
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
                        aria-label={`Selecionar parcela ${inst.installment_number} de ${inst.policy?.company?.razao_social || 'empresa desconhecida'}`}
                      />
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
                    <TableCell className="text-slate-400 text-sm font-mono">
                      {formatCNPJ(inst.policy?.company?.cnpj)}
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
                    <TableCell className="text-slate-300">
                      {inst.policy ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help truncate max-w-[120px] inline-block underline decoration-dotted decoration-slate-500 hover:decoration-slate-300 transition-colors">
                                {inst.policy.policy_number || 'N/A'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs p-3">
                              <div className="space-y-2 text-xs">
                                <div className="font-semibold text-sm border-b border-slate-600 pb-1.5 mb-2">
                                  Apólice {inst.policy.policy_number}
                                </div>
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                                  <span className="text-slate-400">Seguradora:</span>
                                  <span className="text-slate-200">{inst.policy.insurer || 'N/A'}</span>
                                  
                                  <span className="text-slate-400">Ramo:</span>
                                  <span className="text-slate-200">{inst.policy.branch || 'N/A'}</span>
                                  
                                  <span className="text-slate-400">Produto:</span>
                                  <span className="text-slate-200">{inst.policy.product || 'N/A'}</span>
                                  
                                  <span className="text-slate-400">Vigência:</span>
                                  <span className="text-slate-200">
                                    {inst.policy.start_date && inst.policy.end_date 
                                      ? `${format(new Date(inst.policy.start_date), 'dd/MM/yy')} - ${format(new Date(inst.policy.end_date), 'dd/MM/yy')}`
                                      : 'N/A'}
                                  </span>
                                  
                                  <span className="text-slate-400">Valor Total:</span>
                                  <span className="text-slate-200">{inst.policy.total_value ? formatCurrency(inst.policy.total_value) : 'N/A'}</span>
                                  
                                  <span className="text-slate-400">Status:</span>
                                  <span className="text-slate-200 capitalize">{inst.policy.status || 'N/A'}</span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                      {format(parseISO(inst.due_date), 'dd/MM/yyyy', { locale: ptBR })}
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
                      <div className="flex items-center justify-center gap-1">
                        {getStatusBadge(inst.status, inst.days_overdue)}
                        {getAtmRiskBadge(inst)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-purple-400" />
                                <span className={`text-sm ${
                                  (attemptCounts?.emailCounts[inst.id] || 0) > 0 
                                    ? 'text-purple-400' 
                                    : 'text-slate-600'
                                }`}>
                                  {attemptCounts?.emailCounts[inst.id] || 0}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {attemptCounts?.emailCounts[inst.id] || 0} e-mail(s) enviado(s)
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3 text-green-400" />
                                <span className={`text-sm ${
                                  (attemptCounts?.whatsappCounts[inst.id] || 0) > 0 
                                    ? 'text-green-400' 
                                    : 'text-slate-600'
                                }`}>
                                  {attemptCounts?.whatsappCounts[inst.id] || 0}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {attemptCounts?.whatsappCounts[inst.id] || 0} WhatsApp(s) enviado(s)
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-purple-500/20 hover:text-purple-400"
                          title="Editar parcela"
                          onClick={() => setSelectedInstallmentForEdit(inst)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-blue-500/20 hover:text-blue-400"
                          title="Ver histórico"
                          onClick={() => setSelectedInstallmentForHistory(inst)}
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 hover:bg-amber-500/20 hover:text-amber-400"
                          title="Marcar como pago"
                          onClick={() => handleMarkAsPaid([inst.id])}
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
            <EmptyState 
              statusFilter={statusFilter}
              onShowAllIncludingPaid={() => setStatusFilter('all-including-paid')}
            />
          )}
          
          {/* Pagination */}
          {sortedInstallments.length > 0 && (
            <TablePagination
              currentPage={currentPage}
              totalItems={sortedInstallments.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
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

      {/* Mark as Paid Dialog */}
      <MarkAsPaidDialog
        open={showMarkAsPaidConfirm}
        onOpenChange={(open) => {
          setShowMarkAsPaidConfirm(open);
          if (!open) setPendingMarkAsPaidIds([]);
        }}
        installments={pendingInstallments}
        totalValue={pendingMarkAsPaidValue}
        isPending={markAsPaidMutation.isPending}
        onConfirm={confirmMarkAsPaid}
      />

      {/* History Drawer */}
      <InstallmentHistoryDrawer
        open={!!selectedInstallmentForHistory}
        onOpenChange={(open) => !open && setSelectedInstallmentForHistory(null)}
        installment={selectedInstallmentForHistory}
      />

      {/* Edit Installment Modal */}
      <EditInstallmentModal
        open={!!selectedInstallmentForEdit}
        onOpenChange={(open) => !open && setSelectedInstallmentForEdit(null)}
        installment={selectedInstallmentForEdit}
        onSuccess={() => {
          setSelectedInstallmentForEdit(null);
          refetch();
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

      {/* Duplicate Installments Modal */}
      <DuplicateInstallmentsModal
        open={showDuplicatesModal}
        installments={sortedInstallments}
        onOpenChange={setShowDuplicatesModal}
        onSuccess={() => {
          setShowDuplicatesModal(false);
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
                
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 gap-2"
                        onClick={() => setShowEmailCampaign(true)}
                      >
                        <Sparkles className="w-4 h-4" />
                        Emails ({uniqueContactsCount})
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {selectedIds.length} parcelas → {uniqueContactsCount} email(s) consolidado(s)
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
