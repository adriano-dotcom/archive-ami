import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, UserPlus, MessageSquare, Loader2, Mail, Phone, Upload, Building2, Eye, Edit, Trash2, ChevronDown, X, CheckSquare, Square, Minus, AlertTriangle, Send, Tag, User, CalendarDays, Archive, Copy } from 'lucide-react';
import { VirtualizedContactsTable, DuplicateContactsReportModal } from './contacts';
import { useUserRole } from '@/hooks/useUserRole';
import { useContactsInfinite, useCampaigns, ContactLight } from '@/hooks/useContacts';
import { Button } from './ui/button';
import { api } from '../services/api';
import { Contact } from '../types';
import CreateContactModal from './CreateContactModal';
import ImportContactsModal from './ImportContactsModal';
import EditContactModal from './EditContactModal';
import ContactDetailsDrawer from './ContactDetailsDrawer';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { BulkSendTemplateModal } from './BulkSendTemplateModal';
import { SeguradosTab } from './segurados';

const statusOptions = [
  { value: 'new', label: 'Novo Lead', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { value: 'customer', label: 'Cliente Ativo', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'third_party_claim', label: 'Terceiro Sinistro', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
];

// Alias para compatibilidade
type ExtendedContact = ContactLight;

const Contacts: React.FC = () => {
  const navigate = useNavigate();
  
  // React Query hooks para dados com cache e paginação infinita
  const { 
    contacts, 
    totalCount,
    isLoading: loading, 
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    updateStatus, 
    deleteContact: deleteContactMutation,
    isDeleting,
    bulkUpdateStatus,
    isBulkUpdatingStatus: isBulkUpdating,
    bulkDelete,
    isBulkDeleting,
    bulkUpdateCampaign,
    isBulkUpdatingCampaign: isBulkCampaignUpdating,
    invalidateContacts
  } = useContactsInfinite();
  
  const { data: availableCampaigns = [] } = useCampaigns();
  
  // Ref para IntersectionObserver (scroll infinito)
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // Local UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ExtendedContact | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<ExtendedContact | null>(null);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbound' | 'segurados'>('inbound');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  
  // Bulk selection state
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkSendTemplateOpen, setIsBulkSendTemplateOpen] = useState(false);
  const [isDuplicateContactsModalOpen, setIsDuplicateContactsModalOpen] = useState(false);
  
  const { isAdmin } = useUserRole();
  
  // Additional filters state
  const [cnpjFilter, setCnpjFilter] = useState<'all' | 'with' | 'without'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'phone' | 'both'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [letterFilter, setLetterFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [verticalFilter, setVerticalFilter] = useState<'all' | 'transporte' | 'frotas' | 'none'>('all');
  
  const [createdDateFilter, setCreatedDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [chatStatusFilter, setChatStatusFilter] = useState<'all' | 'active' | 'archived' | 'none'>('all');

  // IntersectionObserver callback para scroll infinito
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Setup do IntersectionObserver
  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: '200px',
      threshold: 0.1
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [handleObserver]);

  const handleConverse = async (contactId: string) => {
    try {
      setIsLoadingConversation(true);
      const conversationId = await api.getOrCreateConversation(contactId);
      navigate(`/chat?conversation=${conversationId}`);
    } catch (error) {
      console.error('Erro ao abrir conversa:', error);
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const handleViewDetails = (contact: ExtendedContact) => {
    setSelectedContact(contact);
    setIsDetailsDrawerOpen(true);
  };

  const handleEditContact = (contact: ExtendedContact) => {
    setSelectedContact(contact);
    setIsEditModalOpen(true);
  };

  const handleEditFromDrawer = () => {
    setIsDetailsDrawerOpen(false);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (contact: ExtendedContact) => {
    setContactToDelete(contact);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!contactToDelete) return;
    deleteContactMutation(contactToDelete.id, {
      onSuccess: () => {
        setIsDeleteDialogOpen(false);
        setContactToDelete(null);
      }
    });
  };

  const getStatusColor = (status: string) => {
    const option = statusOptions.find(o => o.value === status);
    return option?.color || 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getStatusLabel = (status: string) => {
    const option = statusOptions.find(o => o.value === status);
    return option?.label || 'Novo Lead';
  };

  const handleStatusChange = (contactId: string, newStatus: string) => {
    updateStatus({ id: contactId, status: newStatus });
  };

  // Filtrar por origem (inbound/segurados) - excluir contatos de cobrança que vão para aba Segurados
  const inboundContacts = contacts.filter(c => (c.lead_source as string) !== 'import_cobranca');

  // Filtrar pela aba ativa + termo de busca + status + outros filtros
  const getFilteredContacts = () => {
    const baseContacts = inboundContacts;
    
    let filtered = baseContacts;
    
    // Filtrar por status selecionados
    if (selectedStatuses.length > 0) {
      filtered = filtered.filter(contact => selectedStatuses.includes(contact.status));
    }
    
    // Filtrar por CNPJ
    if (cnpjFilter === 'with') {
      filtered = filtered.filter(contact => contact.cnpj && contact.cnpj.length > 0);
    } else if (cnpjFilter === 'without') {
      filtered = filtered.filter(contact => !contact.cnpj || contact.cnpj.length === 0);
    }
    
    // Filtrar por canal
    if (channelFilter === 'email') {
      filtered = filtered.filter(contact => contact.email && !contact.phone);
    } else if (channelFilter === 'phone') {
      filtered = filtered.filter(contact => contact.phone && !contact.email);
    } else if (channelFilter === 'both') {
      filtered = filtered.filter(contact => contact.email && contact.phone);
    }
    
    // Filtrar por data de interação
    if (dateFilter !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(todayStart);
      monthStart.setMonth(monthStart.getMonth() - 1);
      
      filtered = filtered.filter(contact => {
        if (!contact.lastContact) return false;
        const contactDate = new Date(contact.lastContact);
        if (dateFilter === 'today') return contactDate >= todayStart;
        if (dateFilter === 'week') return contactDate >= weekStart;
        if (dateFilter === 'month') return contactDate >= monthStart;
        return true;
      });
    }
    
    // Filtrar por letra inicial
    if (letterFilter !== 'all') {
      filtered = filtered.filter(contact => 
        contact.name?.charAt(0).toUpperCase() === letterFilter
      );
    }
    
    // Filtrar por campanha
    if (campaignFilter !== 'all') {
      filtered = filtered.filter(contact => 
        (contact as ExtendedContact).campaign === campaignFilter
      );
    }
    
    // Filtrar por segmento (vertical)
    if (verticalFilter !== 'all') {
      if (verticalFilter === 'none') {
        filtered = filtered.filter(contact => !(contact as ExtendedContact).vertical);
      } else {
        filtered = filtered.filter(contact => (contact as ExtendedContact).vertical === verticalFilter);
      }
    }
    
    
    // Filtrar por data de criação
    if (createdDateFilter !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(todayStart);
      monthStart.setMonth(monthStart.getMonth() - 1);
      
      filtered = filtered.filter(contact => {
        const extContact = contact as ExtendedContact;
        if (!extContact.created_at) return false;
        const contactDate = new Date(extContact.created_at);
        if (createdDateFilter === 'today') return contactDate >= todayStart;
        if (createdDateFilter === 'yesterday') return contactDate >= yesterdayStart && contactDate < todayStart;
        if (createdDateFilter === 'week') return contactDate >= weekStart;
        if (createdDateFilter === 'month') return contactDate >= monthStart;
        return true;
      });
    }
    
    // Filtrar por status de conversa (chat)
    if (chatStatusFilter !== 'all') {
      if (chatStatusFilter === 'none') {
        filtered = filtered.filter(c => (c as ExtendedContact).conversationActive === null || (c as ExtendedContact).conversationActive === undefined);
      } else if (chatStatusFilter === 'active') {
        filtered = filtered.filter(c => (c as ExtendedContact).conversationActive === true);
      } else if (chatStatusFilter === 'archived') {
        filtered = filtered.filter(c => (c as ExtendedContact).conversationActive === false);
      }
    }
    
    // Filtrar por termo de busca (incluindo campanha e responsável)
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      // Normalizar busca: remover caracteres não-numéricos para CNPJ/CPF/Telefone
      const normalizedSearch = searchTerm.replace(/\D/g, '');
      
      filtered = filtered.filter(contact => {
        const extContact = contact as ExtendedContact;
        
        // Busca por nome (parcial, case-insensitive)
        const matchesName = contact.name?.toLowerCase().includes(lowerSearch);
        
        // Busca por empresa (parcial, case-insensitive)
        const matchesCompany = contact.company?.toLowerCase().includes(lowerSearch);
        
        // Busca por CNPJ normalizado (sem formatação)
        const contactCnpjDigits = contact.cnpj?.replace(/\D/g, '') || '';
        const matchesCnpj = normalizedSearch.length > 0 && 
          contactCnpjDigits.includes(normalizedSearch);
        
        // Busca por CPF normalizado (sem formatação)
        const contactCpfDigits = (contact as any).cpf?.replace(/\D/g, '') || '';
        const matchesCpf = normalizedSearch.length > 0 && 
          contactCpfDigits.includes(normalizedSearch);
        
        // Busca por email
        const matchesEmail = contact.email?.toLowerCase().includes(lowerSearch);
        
        // Busca por telefone (numérico normalizado)
        const contactPhoneDigits = contact.phone?.replace(/\D/g, '') || '';
        const matchesPhone = contact.phone?.includes(lowerSearch) ||
          (normalizedSearch.length > 0 && contactPhoneDigits.includes(normalizedSearch));
        
        // Busca por campanha
        const matchesCampaign = extContact.campaign?.toLowerCase().includes(lowerSearch);
        
        return matchesName || matchesCompany || matchesCnpj || matchesCpf || 
               matchesEmail || matchesPhone || matchesCampaign;
      });
    }
    
    return filtered;
  };
  
  // Bulk selection functions
  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(contactId)) {
        newSet.delete(contactId);
      } else {
        newSet.add(contactId);
      }
      return newSet;
    });
  };
  
  const toggleAllContacts = () => {
    if (selectedContactIds.size === filteredContacts.length) {
      setSelectedContactIds(new Set());
    } else {
      setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
    }
  };
  
  const handleBulkStatusChange = (newStatus: string) => {
    if (selectedContactIds.size === 0) return;
    bulkUpdateStatus(
      { ids: Array.from(selectedContactIds), status: newStatus },
      { onSuccess: () => setSelectedContactIds(new Set()) }
    );
  };
  
  const handleBulkCampaignChange = (campaign: string) => {
    if (selectedContactIds.size === 0) return;
    const campaignValue = campaign === '__none__' ? null : campaign;
    bulkUpdateCampaign(
      { ids: Array.from(selectedContactIds), campaign: campaignValue },
      { onSuccess: () => setSelectedContactIds(new Set()) }
    );
  };
  
  const handleBulkDelete = () => {
    if (selectedContactIds.size === 0) return;
    bulkDelete(
      Array.from(selectedContactIds),
      { 
        onSuccess: () => {
          setSelectedContactIds(new Set());
          setIsBulkDeleteDialogOpen(false);
        }
      }
    );
  };
  
  const clearAllFilters = () => {
    setSelectedStatuses([]);
    setCnpjFilter('all');
    setChannelFilter('all');
    setDateFilter('all');
    setLetterFilter('all');
    setCampaignFilter('all');
    setVerticalFilter('all');
    setCreatedDateFilter('all');
    setChatStatusFilter('all');
  };
  
  const hasActiveFilters = selectedStatuses.length > 0 || cnpjFilter !== 'all' || channelFilter !== 'all' || dateFilter !== 'all' || letterFilter !== 'all' || campaignFilter !== 'all' || verticalFilter !== 'all' || createdDateFilter !== 'all' || chatStatusFilter !== 'all';
  
  const getChatStatusBadge = (contact: ExtendedContact) => {
    if (contact.conversationActive === null || contact.conversationActive === undefined) {
      return <span className="text-slate-600 text-xs">—</span>;
    }
    if (contact.conversationActive) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 inline-flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          Ativo
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-700/50 text-slate-400 border border-slate-600/30 inline-flex items-center gap-1">
        <Archive className="w-3 h-3" />
        Arquivado
      </span>
    );
  };
  
  
  const getVerticalBadge = (vertical?: 'transporte' | 'frotas') => {
    if (vertical === 'transporte') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20 inline-flex items-center gap-1">
          🚛 Carga
        </span>
      );
    }
    if (vertical === 'frotas') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-flex items-center gap-1">
          🚗 Frota
        </span>
      );
    }
    return <span className="text-slate-600 text-xs">-</span>;
  };
  
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  const toggleStatusFilter = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearStatusFilters = () => {
    setSelectedStatuses([]);
  };
  const filteredContacts = getFilteredContacts();

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-950 text-slate-50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Contatos</h2>
          <p className="text-sm text-slate-400 mt-1">Gerencie sua base de leads e clientes com inteligência.</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setIsDuplicateContactsModalOpen(true)}
            className="border-amber-700/50 text-amber-400 hover:bg-amber-900/20 hover:text-amber-300"
          >
            <Copy className="w-4 h-4 mr-2" />
            Duplicados
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsImportModalOpen(true)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar CSV
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)} className="shadow-lg shadow-cyan-500/20">
            <UserPlus className="w-4 h-4 mr-2" />
            Novo Contato
          </Button>
        </div>
      </div>

      {/* Tabs Inbound/Segurados */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'inbound' | 'segurados')} className="mb-6">
        <TabsList className="bg-slate-900/50 border border-slate-800 p-1">
          <TabsTrigger 
            value="inbound" 
            className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white px-6"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Inbound ({inboundContacts.length})
          </TabsTrigger>
          <TabsTrigger 
            value="segurados"
            className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white px-6"
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Segurados
          </TabsTrigger>
        </TabsList>

        {/* Bulk Actions Bar */}
        {selectedContactIds.size > 0 && (
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-4 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-5 h-5 text-cyan-400" />
              <span className="text-cyan-400 font-medium">
                {selectedContactIds.size} contato{selectedContactIds.size > 1 ? 's' : ''} selecionado{selectedContactIds.size > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Select onValueChange={handleBulkStatusChange} disabled={isBulkUpdating}>
                <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue placeholder={isBulkUpdating ? "Atualizando..." : "Alterar Status"} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${option.color}`}>
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select onValueChange={handleBulkCampaignChange} disabled={isBulkCampaignUpdating}>
                <SelectTrigger className="w-48 bg-slate-900 border-slate-700 text-slate-200">
                  <SelectValue placeholder={isBulkCampaignUpdating ? "Atualizando..." : "🏷️ Campanha"} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="__none__" className="cursor-pointer text-slate-400">
                    Remover campanha
                  </SelectItem>
                  {availableCampaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.name} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: campaign.color || '#3b82f6' }} />
                        {campaign.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsBulkSendTemplateOpen(true)}
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              >
                <Send className="w-4 h-4 mr-1" />
                Enviar Template
              </Button>
              {isAdmin && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsBulkDeleteDialogOpen(true)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Excluir
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedContactIds(new Set())}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            </div>
          </div>
        )}

        {/* Search Bar - hidden on Segurados tab which has its own search */}
        {activeTab !== 'segurados' && (
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-6 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Buscar por nome, email, telefone, empresa ou CNPJ"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 placeholder:text-slate-600 transition-all"
              />
            </div>
            
            {/* Clear All Filters Button */}
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm"
                onClick={clearAllFilters}
                className="text-slate-400 hover:text-cyan-400"
              >
                <X className="w-4 h-4 mr-1" />
                Limpar filtros
              </Button>
            )}
          </div>
        )}

        {/* Active Filter Chips - only for Inbound tab */}
        {activeTab !== 'segurados' && hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs text-muted-foreground">Filtros ativos:</span>
            {selectedStatuses.map(status => {
              const option = statusOptions.find(o => o.value === status);
              return (
                <button
                  key={status}
                  onClick={() => toggleStatusFilter(status)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${option?.color} hover:opacity-80 transition-opacity group`}
                >
                  {option?.label}
                  <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                </button>
              );
            })}
            {cnpjFilter !== 'all' && (
              <button
                onClick={() => setCnpjFilter('all')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-purple-500/10 text-purple-400 border-purple-500/20 hover:opacity-80 transition-opacity group"
              >
                {cnpjFilter === 'with' ? 'Com CNPJ' : 'Sem CNPJ'}
                <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
              </button>
            )}
            {channelFilter !== 'all' && (
              <button
                onClick={() => setChannelFilter('all')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-amber-500/10 text-amber-400 border-amber-500/20 hover:opacity-80 transition-opacity group"
              >
                {channelFilter === 'email' ? 'Só Email' : channelFilter === 'phone' ? 'Só Telefone' : 'Ambos'}
                <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
              </button>
            )}
            {dateFilter !== 'all' && (
              <button
                onClick={() => setDateFilter('all')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-rose-500/10 text-rose-400 border-rose-500/20 hover:opacity-80 transition-opacity group"
              >
                {dateFilter === 'today' ? 'Hoje' : dateFilter === 'week' ? 'Última semana' : 'Último mês'}
                <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
              </button>
            )}
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
            >
              Limpar todos
            </button>
          </div>
        )}

        <TabsContent value="inbound" className="mt-0">
          <VirtualizedContactsTable 
            contacts={filteredContacts}
            loading={loading}
            selectedContactIds={selectedContactIds}
            toggleContactSelection={toggleContactSelection}
            toggleAllContacts={toggleAllContacts}
            handleStatusChange={handleStatusChange}
            handleViewDetails={handleViewDetails}
            handleEditContact={handleEditContact}
            handleDeleteClick={handleDeleteClick}
            handleConverse={handleConverse}
            letterFilter={letterFilter}
            setLetterFilter={setLetterFilter}
            selectedStatuses={selectedStatuses}
            toggleStatusFilter={toggleStatusFilter}
            createdDateFilter={createdDateFilter}
            setCreatedDateFilter={setCreatedDateFilter}
            chatStatusFilter={chatStatusFilter}
            setChatStatusFilter={setChatStatusFilter}
            channelFilter={channelFilter}
            setChannelFilter={setChannelFilter}
            cnpjFilter={cnpjFilter}
            setCnpjFilter={setCnpjFilter}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage || false}
            fetchNextPage={fetchNextPage}
            totalCount={totalCount}
          />
        </TabsContent>

        <TabsContent value="segurados" className="mt-6">
          <SeguradosTab />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <CreateContactModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSuccess={invalidateContacts}
      />
      <ImportContactsModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        onSuccess={invalidateContacts}
      />
      <EditContactModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        contact={selectedContact}
        onSuccess={invalidateContacts}
      />
      <ContactDetailsDrawer
        open={isDetailsDrawerOpen}
        onOpenChange={setIsDetailsDrawerOpen}
        contact={selectedContact}
        onEdit={handleEditFromDrawer}
        onConverse={() => selectedContact && handleConverse(selectedContact.id)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Contato</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Tem certeza que deseja excluir <span className="font-semibold text-white">{contactToDelete?.name}</span>?
              <br />
              Esta ação não pode ser desfeita. O contato, suas conversas e mensagens serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog - Admin Only */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Excluir {selectedContactIds.size} Contato(s)
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              <span className="text-red-400 font-medium">Atenção: Esta ação é permanente e não pode ser desfeita.</span>
              <br /><br />
              Você está prestes a excluir <span className="font-semibold text-white">{selectedContactIds.size} contato(s)</span>.
              Todas as conversas e mensagens associadas também serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              disabled={isBulkDeleting}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Confirmar Exclusão
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Send Template Modal */}
      <BulkSendTemplateModal
        isOpen={isBulkSendTemplateOpen}
        onClose={() => setIsBulkSendTemplateOpen(false)}
        contacts={contacts.filter(c => selectedContactIds.has(c.id)) as any}
        onComplete={() => {
          setSelectedContactIds(new Set());
          invalidateContacts();
        }}
      />

      {/* Duplicate Contacts Report Modal */}
      <DuplicateContactsReportModal
        open={isDuplicateContactsModalOpen}
        onOpenChange={setIsDuplicateContactsModalOpen}
        onSuccess={() => {
          invalidateContacts();
        }}
      />

    </div>
  );
};

export default Contacts;
