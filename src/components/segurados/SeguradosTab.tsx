import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Search, RefreshCw, Plus, Upload, Download, ChevronDown, Sparkles, Trash2, X, Filter, GitMerge, AlertTriangle, CheckSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { CompaniesTable } from './CompaniesTable';
import { SeguradosPFTable } from './SeguradosPFTable';
import { CreateCompanyModal } from './CreateCompanyModal';
import { CreateSeguradoPFModal } from './CreateSeguradoPFModal';
import { EditCompanyModal } from './EditCompanyModal';
import { EditSeguradoPFModal } from './EditSeguradoPFModal';
import { ImportCompaniesModal } from './ImportCompaniesModal';
import { ImportContactsSeguradosModal } from './ImportContactsSeguradosModal';
import { ImportCompaniesWithContactsModal } from './ImportCompaniesWithContactsModal';
import { ImportDocumentAIModal } from './ImportDocumentAIModal';
import { CompanyDetailsDrawer } from './CompanyDetailsDrawer';
import { MergeCompaniesModal } from './MergeCompaniesModal';
import { DuplicateCompaniesReportModal } from './DuplicateCompaniesReportModal';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/services/api';
import { toast } from 'sonner';

import { useSeguradosData, useInvalidateSeguradosData, type Company, type SeguradoPF } from '@/hooks/useSeguradosData';
import { useUserRole } from '@/hooks/useUserRole';

export const SeguradosTab: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [activeSubTab, setActiveSubTab] = useState<'pj' | 'pf'>('pj');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Use optimized data hook with caching
  const { data, isLoading: loading, refetch } = useSeguradosData();
  const invalidateSegurados = useInvalidateSeguradosData();
  
  // Extract data from hook
  const companies = data?.companies || [];
  const seguradosPF = data?.seguradosPF || [];
  
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showCreateSeguradoPF, setShowCreateSeguradoPF] = useState(false);
  const [showImportCompanies, setShowImportCompanies] = useState(false);
  const [showImportContacts, setShowImportContacts] = useState(false);
  const [showImportCompaniesWithContacts, setShowImportCompaniesWithContacts] = useState(false);
  const [showImportDocumentAI, setShowImportDocumentAI] = useState(false);
  const [showMergeCompanies, setShowMergeCompanies] = useState(false);
  const [showDuplicatesReport, setShowDuplicatesReport] = useState(false);
  
  // Filters for Companies (PJ)
  const [stateFilterPJ, setStateFilterPJ] = useState<string>('all');
  const [overdueStatusPJ, setOverdueStatusPJ] = useState<string>('all');
  const [overdueRangePJ, setOverdueRangePJ] = useState<string>('all');
  
  // Filters for Segurados (PF)
  
  const [stateFilterPF, setStateFilterPF] = useState<string>('all');
  const [overdueStatusPF, setOverdueStatusPF] = useState<string>('all');
  const [overdueRangePF, setOverdueRangePF] = useState<string>('all');
  
  // Edit/Delete states
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingSegurado, setEditingSegurado] = useState<SeguradoPF | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deletingSegurado, setDeletingSegurado] = useState<SeguradoPF | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Bulk selection states - Companies
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  
  // Bulk selection states - Segurados PF
  const [selectedSeguradoIds, setSelectedSeguradoIds] = useState<string[]>([]);
  const [showBulkDeleteSeguradosConfirm, setShowBulkDeleteSeguradosConfirm] = useState(false);
  const [bulkDeleteSeguradosLoading, setBulkDeleteSeguradosLoading] = useState(false);
  
  // Company details drawer
  const [selectedCompanyDetails, setSelectedCompanyDetails] = useState<Company | null>(null);
  
  // Dynamic state options
  const uniqueStatesPJ = useMemo(() => {
    return [...new Set(companies.map(c => c.state).filter(Boolean))].sort() as string[];
  }, [companies]);
  
  const uniqueStatesPF = useMemo(() => {
    return [...new Set(seguradosPF.map(s => s.state).filter(Boolean))].sort() as string[];
  }, [seguradosPF]);
  
  // Check if any PJ filters are active
  const hasActivePJFilters = stateFilterPJ !== 'all' || overdueStatusPJ !== 'all' || overdueRangePJ !== 'all';
  
  // Check if any PF filters are active
  const hasActivePFFilters = stateFilterPF !== 'all' || overdueStatusPF !== 'all' || overdueRangePF !== 'all';
  
  // Clear all PJ filters
  const clearPJFilters = () => {
    setStateFilterPJ('all');
    setOverdueStatusPJ('all');
    setOverdueRangePJ('all');
  };
  
  // Clear all PF filters
  const clearPFFilters = () => {
    setStateFilterPF('all');
    setOverdueStatusPF('all');
    setOverdueRangePF('all');
  };

  const downloadCompaniesTemplate = () => {
    const headers = 'cnpj;razao_social;nome_fantasia;cep;cidade;estado\n';
    const example = '12345678000190;Empresa ABC Ltda;ABC Transportes;86000000;Londrina;PR\n';
    const blob = new Blob([headers + example], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_empresas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadContactsTemplate = () => {
    const headers = 'nome;telefone;email;cpf;cnpj;cargo;contato_cobranca;cep;cidade;estado\n';
    const example1 = 'João Silva;43999998888;joao@email.com;12345678900;12345678000190;Gerente;sim;86000000;Londrina;PR\n';
    const example2 = 'Maria Santos;43988887777;maria@email.com;98765432100;;;nao;86000000;Londrina;PR\n';
    const blob = new Blob([headers + example1 + example2], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_contatos_segurados.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadCompaniesWithContactsTemplate = () => {
    const headers = 'cnpj;razao_social;nome_fantasia;cidade;estado;nome_contato;telefone;email;cargo;contato_cobranca\n';
    const example1 = '12345678000190;Empresa ABC Ltda;ABC Transportes;Londrina;PR;João Silva;43999998888;joao@email.com;Gerente;sim\n';
    const example2 = '12345678000190;Empresa ABC Ltda;ABC Transportes;Londrina;PR;Maria Santos;43988887777;maria@email.com;Financeiro;sim\n';
    const example3 = '98765432000100;Outra Empresa SA;;Curitiba;PR;Carlos Souza;41999991111;carlos@email.com;Diretor;nao\n';
    const blob = new Blob([headers + example1 + example2 + example3], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_empresas_com_contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Refresh data - uses React Query's refetch with cache invalidation
  const loadData = async () => {
    invalidateSegurados();
    await refetch();
  };

  const handleOpenConversation = async (contactId: string) => {
    try {
      const conversationId = await api.getOrCreateConversation(contactId);
      navigate(`/chat?conversation=${conversationId}`);
    } catch (error) {
      console.error('Error opening conversation:', error);
      toast.error('Erro ao abrir conversa');
    }
  };

  const handleSelectCompany = (company: Company) => {
    setSelectedCompanyDetails(company);
  };

  const handleSelectSegurado = (segurado: SeguradoPF) => {
    toast.info(`Detalhes do tutor: ${segurado.name}`);
  };

  const handleDeleteCompany = async () => {
    if (!deletingCompany) return;
    
    setDeleteLoading(true);
    try {
      // Check for linked contacts
      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', deletingCompany.id);

      if (contactsCount && contactsCount > 0) {
        toast.error(`Esta empresa possui ${contactsCount} contatos vinculados. Desvincule-os antes de excluir.`);
        return;
      }

      // Check for linked policies
      const { count: policiesCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', deletingCompany.id);

      if (policiesCount && policiesCount > 0) {
        toast.error(`Esta empresa possui ${policiesCount} apólices vinculadas. Remova-as antes de excluir.`);
        return;
      }

      // Delete company
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', deletingCompany.id);

      if (error) throw error;

      toast.success('Empresa excluída com sucesso!');
      setDeletingCompany(null);
      loadData();
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Erro ao excluir empresa');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteSegurado = async () => {
    if (!deletingSegurado) return;
    
    setDeleteLoading(true);
    try {
      // Check for linked policies
      const { count: policiesCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', deletingSegurado.id);

      if (policiesCount && policiesCount > 0) {
        toast.error(`Este tutor possui ${policiesCount} planos vinculados. Remova-os antes de excluir.`);
        return;
      }

      // Delete contact
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', deletingSegurado.id);

      if (error) throw error;

      toast.success('Segurado excluído com sucesso!');
      setDeletingSegurado(null);
      loadData();
    } catch (error) {
      console.error('Error deleting segurado:', error);
      toast.error('Erro ao excluir segurado');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Bulk delete companies (cascade: deletes policies, installments, unlinks contacts)
  const handleBulkDeleteCompanies = async () => {
    setBulkDeleteLoading(true);
    let deletedCount = 0;
    let errorCount = 0;

    try {
      for (const companyId of selectedCompanyIds) {
        try {
          // 1. Buscar apólices da empresa
          const { data: policies } = await supabase
            .from('policies')
            .select('id')
            .eq('company_id', companyId);

          if (policies && policies.length > 0) {
            const policyIds = policies.map(p => p.id);
            
            // 2. Excluir parcelas das apólices
            await supabase
              .from('installments')
              .delete()
              .in('policy_id', policyIds);

            // 3. Excluir apólices
            await supabase
              .from('policies')
              .delete()
              .eq('company_id', companyId);
          }

          // 4. Desvincular contatos (set company_id = null)
          await supabase
            .from('contacts')
            .update({ company_id: null })
            .eq('company_id', companyId);

          // 5. Excluir empresa
          const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', companyId);

          if (error) throw error;
          deletedCount++;
        } catch (err) {
          console.error('Error deleting company:', err);
          errorCount++;
        }
      }

      if (deletedCount > 0) {
        toast.success(`${deletedCount} empresa(s) excluída(s) com sucesso!`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} empresa(s) não puderam ser excluídas`);
      }

      setSelectedCompanyIds([]);
      setShowBulkDeleteConfirm(false);
      loadData();
    } catch (error) {
      console.error('Error in bulk delete:', error);
      toast.error('Erro ao excluir empresas');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // Bulk delete segurados PF (cascade: deletes policies, installments, conversations)
  const handleBulkDeleteSegurados = async () => {
    setBulkDeleteSeguradosLoading(true);
    let deletedCount = 0;
    let errorCount = 0;

    try {
      for (const seguradoId of selectedSeguradoIds) {
        try {
          // 1. Buscar apólices do segurado
          const { data: policies } = await supabase
            .from('policies')
            .select('id')
            .eq('contact_id', seguradoId);

          if (policies && policies.length > 0) {
            const policyIds = policies.map(p => p.id);
            
            // 2. Excluir parcelas das apólices
            await supabase
              .from('installments')
              .delete()
              .in('policy_id', policyIds);

            // 3. Excluir apólices
            await supabase
              .from('policies')
              .delete()
              .eq('contact_id', seguradoId);
          }

          // 4. Buscar conversas do contato
          const { data: conversations } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_id', seguradoId);

          if (conversations && conversations.length > 0) {
            const conversationIds = conversations.map(c => c.id);
            
            // 5. Excluir mensagens das conversas
            await supabase
              .from('messages')
              .delete()
              .in('conversation_id', conversationIds);

            // 6. Excluir conversas
            await supabase
              .from('conversations')
              .delete()
              .eq('contact_id', seguradoId);
          }

          // 7. Excluir segurado (contact)
          const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', seguradoId);

          if (error) throw error;
          deletedCount++;
        } catch (err) {
          console.error('Error deleting segurado:', err);
          errorCount++;
        }
      }

      if (deletedCount > 0) {
        toast.success(`${deletedCount} segurado(s) excluído(s) com sucesso!`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} segurado(s) não puderam ser excluídos`);
      }

      setSelectedSeguradoIds([]);
      setShowBulkDeleteSeguradosConfirm(false);
      loadData();
    } catch (error) {
      console.error('Error in bulk delete segurados:', error);
      toast.error('Erro ao excluir segurados');
    } finally {
      setBulkDeleteSeguradosLoading(false);
    }
  };

  // Filter data based on search term and filters
  const filteredCompanies = useMemo(() => {
    const normalizedSearch = searchTerm.replace(/\D/g, '');
    const lowerSearch = searchTerm.toLowerCase();
    
    return companies.filter(c => {
      // Text search - normalize CNPJ for comparison (remove formatting)
      const matchesName = 
        c.razao_social.toLowerCase().includes(lowerSearch) ||
        c.nome_fantasia?.toLowerCase().includes(lowerSearch);
      
      const matchesCNPJ = 
        normalizedSearch.length > 0 && 
        c.cnpj.includes(normalizedSearch);
      
      const matchesSearch = searchTerm === '' || matchesName || matchesCNPJ;
      
      // State filter
      const matchesState = stateFilterPJ === 'all' || c.state === stateFilterPJ;
      
      // Overdue status filter
      const matchesOverdueStatus = 
        overdueStatusPJ === 'all' ||
        (overdueStatusPJ === 'overdue' && c.max_days_overdue > 0) ||
        (overdueStatusPJ === 'no_overdue' && c.max_days_overdue === 0);
      
      // Overdue range filter
      const matchesOverdueRange = 
        overdueRangePJ === 'all' ||
        (overdueRangePJ === '1-30' && c.max_days_overdue >= 1 && c.max_days_overdue <= 30) ||
        (overdueRangePJ === '31-60' && c.max_days_overdue >= 31 && c.max_days_overdue <= 60) ||
        (overdueRangePJ === '60+' && c.max_days_overdue > 60);
      
      return matchesSearch && matchesState && matchesOverdueStatus && matchesOverdueRange;
    });
  }, [companies, searchTerm, stateFilterPJ, overdueStatusPJ, overdueRangePJ]);

  const filteredSeguradosPF = useMemo(() => {
    return seguradosPF.filter(s => {
      // Text search
      const matchesSearch = searchTerm === '' ||
        s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.cpf?.includes(searchTerm) ||
        s.phone_number.includes(searchTerm);
      
      // State filter
      const matchesState = stateFilterPF === 'all' || s.state === stateFilterPF;
      
      // Overdue status filter
      const matchesOverdueStatus = 
        overdueStatusPF === 'all' ||
        (overdueStatusPF === 'overdue' && s.max_days_overdue > 0) ||
        (overdueStatusPF === 'no_overdue' && s.max_days_overdue === 0);
      
      // Overdue range filter
      const matchesOverdueRange = 
        overdueRangePF === 'all' ||
        (overdueRangePF === '1-30' && s.max_days_overdue >= 1 && s.max_days_overdue <= 30) ||
        (overdueRangePF === '31-60' && s.max_days_overdue >= 31 && s.max_days_overdue <= 60) ||
        (overdueRangePF === '60+' && s.max_days_overdue > 60);
      
      return matchesSearch && matchesState && matchesOverdueStatus && matchesOverdueRange;
    });
  }, [seguradosPF, searchTerm, stateFilterPF, overdueStatusPF, overdueRangePF]);

  return (
    <div className="space-y-4">
      {/* Header with search and filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500 w-4 h-4" />
          <Input
            placeholder="Buscar por nome, documento ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-slate-900/50 border-slate-600 text-slate-200 placeholder:text-slate-500"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>

        {/* Import Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="border-slate-600 text-slate-200 hover:bg-slate-800 hover:text-white gap-2">
              <Upload className="w-4 h-4" />
              Importar
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-slate-900 border-slate-700">
            <DropdownMenuItem onClick={() => setShowImportDocumentAI(true)} className="gap-2 cursor-pointer">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Importar com IA (PDF/Excel/Imagem)
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem onClick={() => setShowImportCompaniesWithContacts(true)} className="gap-2 cursor-pointer">
              <Building2 className="w-4 h-4 text-purple-400" />
              Empresas + Contatos (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowImportCompanies(true)} className="gap-2 cursor-pointer">
              <Building2 className="w-4 h-4 text-blue-400" />
              Apenas Empresas (CSV)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowImportContacts(true)} className="gap-2 cursor-pointer">
              <User className="w-4 h-4 text-emerald-400" />
              Apenas Contatos (CSV)
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem onClick={downloadCompaniesWithContactsTemplate} className="gap-2 cursor-pointer">
              <Download className="w-4 h-4 text-purple-400" />
              Template Empresas + Contatos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadCompaniesTemplate} className="gap-2 cursor-pointer">
              <Download className="w-4 h-4 text-slate-400" />
              Template Empresas
            </DropdownMenuItem>
            <DropdownMenuItem onClick={downloadContactsTemplate} className="gap-2 cursor-pointer">
              <Download className="w-4 h-4 text-slate-400" />
              Template Contatos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        
        {activeSubTab === 'pj' ? (
          <Button
            size="sm"
            onClick={() => setShowCreateCompany(true)}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Nova Empresa
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => setShowCreateSeguradoPF(true)}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo Tutor
          </Button>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-slate-500" />
        
        {activeSubTab === 'pj' ? (
          <>
            <Select value={stateFilterPJ} onValueChange={setStateFilterPJ}>
              <SelectTrigger className="w-[130px] h-8 bg-slate-900/50 border-slate-600 text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Todos Estados</SelectItem>
                {uniqueStatesPJ.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={overdueStatusPJ} onValueChange={setOverdueStatusPJ}>
              <SelectTrigger className="w-[140px] h-8 bg-slate-900/50 border-slate-600 text-sm">
                <SelectValue placeholder="Status Atraso" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="overdue">Com Atraso</SelectItem>
                <SelectItem value="no_overdue">Sem Atraso</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={overdueRangePJ} onValueChange={setOverdueRangePJ}>
              <SelectTrigger className="w-[140px] h-8 bg-slate-900/50 border-slate-600 text-sm">
                <SelectValue placeholder="Faixa Atraso" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Todas Faixas</SelectItem>
                <SelectItem value="1-30">1-30 dias</SelectItem>
                <SelectItem value="31-60">31-60 dias</SelectItem>
                <SelectItem value="60+">60+ dias</SelectItem>
              </SelectContent>
            </Select>
            
            {hasActivePJFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPJFilters}
                className="h-8 text-slate-400 hover:text-slate-200 gap-1 px-2"
              >
                <X className="w-3 h-3" />
                Limpar
              </Button>
            )}
          </>
        ) : (
          <>
            
            <Select value={stateFilterPF} onValueChange={setStateFilterPF}>
              <SelectTrigger className="w-[130px] h-8 bg-slate-900/50 border-slate-600 text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Todos Estados</SelectItem>
                {uniqueStatesPF.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={overdueStatusPF} onValueChange={setOverdueStatusPF}>
              <SelectTrigger className="w-[140px] h-8 bg-slate-900/50 border-slate-600 text-sm">
                <SelectValue placeholder="Status Atraso" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="overdue">Com Atraso</SelectItem>
                <SelectItem value="no_overdue">Sem Atraso</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={overdueRangePF} onValueChange={setOverdueRangePF}>
              <SelectTrigger className="w-[140px] h-8 bg-slate-900/50 border-slate-600 text-sm">
                <SelectValue placeholder="Faixa Atraso" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="all">Todas Faixas</SelectItem>
                <SelectItem value="1-30">1-30 dias</SelectItem>
                <SelectItem value="31-60">31-60 dias</SelectItem>
                <SelectItem value="60+">60+ dias</SelectItem>
              </SelectContent>
            </Select>
            
            {hasActivePFFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPFFilters}
                className="h-8 text-slate-400 hover:text-slate-200 gap-1 px-2"
              >
                <X className="w-3 h-3" />
                Limpar
              </Button>
            )}
          </>
        )}
        
        {/* Active filters badges */}
        <div className="flex items-center gap-1 ml-2">
          {activeSubTab === 'pj' && (
            <>
              {stateFilterPJ !== 'all' && (
                <Badge variant="secondary" className="gap-1 bg-slate-700/50 text-slate-300">
                  {stateFilterPJ}
                  <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setStateFilterPJ('all')} />
                </Badge>
              )}
              {overdueStatusPJ !== 'all' && (
                <Badge variant="secondary" className="gap-1 bg-slate-700/50 text-slate-300">
                  {overdueStatusPJ === 'overdue' ? 'Com Atraso' : 'Sem Atraso'}
                  <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setOverdueStatusPJ('all')} />
                </Badge>
              )}
              {overdueRangePJ !== 'all' && (
                <Badge variant="secondary" className="gap-1 bg-slate-700/50 text-slate-300">
                  {overdueRangePJ} dias
                  <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setOverdueRangePJ('all')} />
                </Badge>
              )}
            </>
          )}
          {activeSubTab === 'pf' && (
            <>
              {stateFilterPF !== 'all' && (
                <Badge variant="secondary" className="gap-1 bg-slate-700/50 text-slate-300">
                  {stateFilterPF}
                  <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setStateFilterPF('all')} />
                </Badge>
              )}
              {overdueStatusPF !== 'all' && (
                <Badge variant="secondary" className="gap-1 bg-slate-700/50 text-slate-300">
                  {overdueStatusPF === 'overdue' ? 'Com Atraso' : 'Sem Atraso'}
                  <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setOverdueStatusPF('all')} />
                </Badge>
              )}
              {overdueRangePF !== 'all' && (
                <Badge variant="secondary" className="gap-1 bg-slate-700/50 text-slate-300">
                  {overdueRangePF} dias
                  <X className="w-3 h-3 cursor-pointer hover:text-white" onClick={() => setOverdueRangePF('all')} />
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs for PJ and PF */}
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as 'pj' | 'pf')}>
        <TabsList className="bg-slate-900/50 border border-slate-700">
          <TabsTrigger 
            value="pj" 
            className="gap-2 text-slate-300 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400"
          >
            <Building2 className="w-4 h-4" />
            Clínicas/Petshops
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded-full">
              {filteredCompanies.length}
            </span>
          </TabsTrigger>
          <TabsTrigger 
            value="pf" 
            className="gap-2 text-slate-300 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400"
          >
            <User className="w-4 h-4" />
            Tutores
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-slate-700 text-slate-300 rounded-full">
              {filteredSeguradosPF.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pj" className="mt-4 space-y-3">
          {/* Actions Bar */}
          <div className="flex items-center gap-3 p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowDuplicatesReport(true)}
              disabled={companies.length < 2}
              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 gap-2"
            >
              <AlertTriangle className="w-4 h-4" />
              Duplicatas
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowMergeCompanies(true)}
              disabled={companies.length < 2}
              className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10 gap-2"
            >
              <GitMerge className="w-4 h-4" />
              Mesclar
            </Button>
            
            {/* Admin bulk actions */}
            {isAdmin && (
              <>
                <div className="h-4 w-px bg-slate-700" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedCompanyIds(filteredCompanies.map(c => c.id))}
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
                >
                  <CheckSquare className="w-4 h-4" />
                  Selecionar Todos ({filteredCompanies.length})
                </Button>
              </>
            )}
            
            {selectedCompanyIds.length > 0 && (
              <>
                <div className="h-4 w-px bg-slate-700" />
                <span className="text-sm text-blue-400 font-medium">
                  {selectedCompanyIds.length} selecionada(s)
                </span>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir ({selectedCompanyIds.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedCompanyIds([])}
                  className="text-slate-400 hover:text-slate-200 gap-2"
                >
                  <X className="w-4 h-4" />
                  Limpar seleção
                </Button>
              </>
            )}
          </div>
          
          <Card className="bg-slate-900/30 border-white/5">
            <CompaniesTable
              companies={filteredCompanies}
              loading={loading}
              selectedIds={selectedCompanyIds}
              onSelectionChange={setSelectedCompanyIds}
              onSelectCompany={handleSelectCompany}
              onEditCompany={(company) => setEditingCompany(company)}
              onDeleteCompany={(company) => setDeletingCompany(company)}
            />
          </Card>
        </TabsContent>

        <TabsContent value="pf" className="mt-4 space-y-3">
          {/* Bulk Actions Bar - Segurados PF */}
          {/* Admin bulk actions - Segurados PF */}
          {isAdmin && (
            <div className="flex items-center gap-3 p-3 bg-slate-800/30 border border-slate-700/50 rounded-lg">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedSeguradoIds(filteredSeguradosPF.map(s => s.id))}
                className="border-red-500/50 text-red-400 hover:bg-red-500/10 gap-2"
              >
                <CheckSquare className="w-4 h-4" />
                Selecionar Todos ({filteredSeguradosPF.length})
              </Button>
            </div>
          )}
          
          {selectedSeguradoIds.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <span className="text-sm text-emerald-400 font-medium">
                {selectedSeguradoIds.length} selecionado(s)
              </span>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowBulkDeleteSeguradosConfirm(true)}
                  className="gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir ({selectedSeguradoIds.length})
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedSeguradoIds([])}
                className="text-slate-400 hover:text-slate-200 gap-2"
              >
                <X className="w-4 h-4" />
                Limpar seleção
              </Button>
            </div>
          )}
          
          <Card className="bg-slate-900/30 border-white/5">
            <SeguradosPFTable
              segurados={filteredSeguradosPF}
              loading={loading}
              selectedIds={selectedSeguradoIds}
              onSelectionChange={setSelectedSeguradoIds}
              onSelectSegurado={handleSelectSegurado}
              onOpenConversation={handleOpenConversation}
              onEditSegurado={(segurado) => setEditingSegurado(segurado)}
              onDeleteSegurado={(segurado) => setDeletingSegurado(segurado)}
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <CreateCompanyModal
        open={showCreateCompany}
        onOpenChange={setShowCreateCompany}
        onSuccess={loadData}
      />
      <CreateSeguradoPFModal
        open={showCreateSeguradoPF}
        onOpenChange={setShowCreateSeguradoPF}
        onSuccess={loadData}
      />
      <EditCompanyModal
        open={!!editingCompany}
        company={editingCompany}
        onOpenChange={() => setEditingCompany(null)}
        onSuccess={loadData}
      />
      <EditSeguradoPFModal
        open={!!editingSegurado}
        segurado={editingSegurado}
        onOpenChange={() => setEditingSegurado(null)}
        onSuccess={loadData}
      />
      <ImportCompaniesModal
        open={showImportCompanies}
        onOpenChange={setShowImportCompanies}
        onSuccess={loadData}
      />
      <ImportContactsSeguradosModal
        open={showImportContacts}
        onOpenChange={setShowImportContacts}
        onSuccess={loadData}
      />
      <ImportCompaniesWithContactsModal
        open={showImportCompaniesWithContacts}
        onOpenChange={setShowImportCompaniesWithContacts}
        onSuccess={loadData}
      />

      {/* Company Details Drawer */}
      <CompanyDetailsDrawer
        open={!!selectedCompanyDetails}
        onOpenChange={(open) => !open && setSelectedCompanyDetails(null)}
        company={selectedCompanyDetails}
        onEdit={() => {
          const company = selectedCompanyDetails;
          setSelectedCompanyDetails(null);
          setEditingCompany(company);
        }}
        onRefresh={loadData}
      />

      {/* Delete Confirmation Dialogs */}
      <AlertDialog open={!!deletingCompany} onOpenChange={() => setDeletingCompany(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Excluir Empresa</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir a empresa <strong className="text-slate-200">{deletingCompany?.nome_fantasia || deletingCompany?.razao_social}</strong>? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteCompany}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingSegurado} onOpenChange={() => setDeletingSegurado(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Excluir Segurado</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir o segurado <strong className="text-slate-200">{deletingSegurado?.name}</strong>? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSegurado}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Excluir Empresas em Lote</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir <strong className="text-slate-200">{selectedCompanyIds.length} empresa(s)</strong>? 
              <br /><br />
              <span className="text-red-400">⚠️ Atenção:</span> Apólices, parcelas e vínculos com contatos serão removidos junto com as empresas.
              <br /><br />
              <strong className="text-red-400">Esta ação não pode ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDeleteCompanies}
              disabled={bulkDeleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteLoading ? 'Excluindo...' : `Excluir ${selectedCompanyIds.length} empresa(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Segurados PF Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteSeguradosConfirm} onOpenChange={setShowBulkDeleteSeguradosConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Excluir Segurados em Lote</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir <strong className="text-slate-200">{selectedSeguradoIds.length} segurado(s)</strong>? 
              <br /><br />
              <span className="text-red-400">⚠️ Atenção:</span> Apólices, parcelas e conversas serão removidas junto com os segurados.
              <br /><br />
              <strong className="text-red-400">Esta ação não pode ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDeleteSegurados}
              disabled={bulkDeleteSeguradosLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteSeguradosLoading ? 'Excluindo...' : `Excluir ${selectedSeguradoIds.length} segurado(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportDocumentAIModal
        open={showImportDocumentAI}
        onOpenChange={setShowImportDocumentAI}
        onSuccess={loadData}
      />

      <MergeCompaniesModal
        open={showMergeCompanies}
        companies={companies}
        onOpenChange={setShowMergeCompanies}
        onSuccess={loadData}
      />

      <DuplicateCompaniesReportModal
        open={showDuplicatesReport}
        companies={companies}
        onOpenChange={setShowDuplicatesReport}
        onSuccess={loadData}
      />
    </div>
  );
};
