import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, UserPlus, MessageSquare, Loader2, Mail, Phone, Upload, Building2, Eye, Edit, Trash2, ChevronDown, X, CheckSquare, Square, Minus, AlertTriangle, Send, Tag, User, CalendarDays, Archive } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useContacts, useCampaigns, useContactFilters, ContactLight } from '@/hooks/useContacts';
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
  
  // React Query hooks para dados com cache
  const { 
    contacts, 
    isLoading: loading, 
    isFetching,
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
  } = useContacts();
  
  const { data: availableCampaigns = [] } = useCampaigns();
  const { owners: availableOwners, pipelines: availablePipelines } = useContactFilters();
  
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
  
  const { isAdmin } = useUserRole();
  
  // Additional filters state
  const [cnpjFilter, setCnpjFilter] = useState<'all' | 'with' | 'without'>('all');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'phone' | 'both'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [letterFilter, setLetterFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [verticalFilter, setVerticalFilter] = useState<'all' | 'transporte' | 'frotas' | 'none'>('all');
  
  // New filters: Owner, Pipeline, and Chat status
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [pipelineFilter, setPipelineFilter] = useState<string>('all');
  const [createdDateFilter, setCreatedDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month'>('all');
  const [chatStatusFilter, setChatStatusFilter] = useState<'all' | 'active' | 'archived' | 'none'>('all');

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
    
    // Filtrar por responsável (owner)
    if (ownerFilter !== 'all') {
      if (ownerFilter === 'none') {
        filtered = filtered.filter(c => !(c as ExtendedContact).ownerId);
      } else {
        filtered = filtered.filter(c => (c as ExtendedContact).ownerId === ownerFilter);
      }
    }
    
    // Filtrar por pipeline (tipo)
    if (pipelineFilter !== 'all') {
      if (pipelineFilter === 'none') {
        filtered = filtered.filter(c => !(c as ExtendedContact).pipelineId);
      } else {
        filtered = filtered.filter(c => (c as ExtendedContact).pipelineSlug === pipelineFilter);
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
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(contact => {
        const extContact = contact as ExtendedContact;
        return contact.name.toLowerCase().includes(search) ||
          contact.email?.toLowerCase().includes(search) ||
          contact.phone?.includes(search) ||
          contact.company?.toLowerCase().includes(search) ||
          contact.cnpj?.includes(search) ||
          extContact.campaign?.toLowerCase().includes(search) ||
          extContact.ownerName?.toLowerCase().includes(search);
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
    setOwnerFilter('all');
    setPipelineFilter('all');
    setCreatedDateFilter('all');
    setChatStatusFilter('all');
  };
  
  const hasActiveFilters = selectedStatuses.length > 0 || cnpjFilter !== 'all' || channelFilter !== 'all' || dateFilter !== 'all' || letterFilter !== 'all' || campaignFilter !== 'all' || verticalFilter !== 'all' || ownerFilter !== 'all' || pipelineFilter !== 'all' || createdDateFilter !== 'all' || chatStatusFilter !== 'all';
  
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
  
  const getPipelineBadge = (contact: ExtendedContact) => {
    if (!contact.pipelineSlug) return <span className="text-slate-600 text-xs">-</span>;
    
    const icon = contact.pipelineIcon || '📋';
    const name = contact.pipelineName || '';
    const color = contact.pipelineColor || '#3b82f6';
    
    return (
      <span 
        className="px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 border"
        style={{ 
          backgroundColor: `${color}15`, 
          borderColor: `${color}30`,
          color: color 
        }}
      >
        {icon} {name}
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
  const ContactsTable = ({ contacts }: { contacts: ExtendedContact[] }) => {
    const allSelected = contacts.length > 0 && selectedContactIds.size === contacts.length;
    const someSelected = selectedContactIds.size > 0 && selectedContactIds.size < contacts.length;
    
    return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl overflow-hidden min-h-[400px]">
      {loading ? (
        <div className="flex flex-col items-center justify-center h-80">
          <Loader2 className="h-10 w-10 animate-spin text-cyan-500 mb-3" />
          <span className="text-sm text-slate-400 animate-pulse">Carregando base de dados...</span>
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-80 text-slate-500">
          <UserPlus className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhum contato encontrado</p>
          <p className="text-sm mt-1">Aguardando contatos via WhatsApp</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-medium text-xs uppercase tracking-wider">
              <tr>
                {/* Checkbox Master */}
                <th className="px-4 py-4 w-12">
                  <button 
                    onClick={toggleAllContacts}
                    className="flex items-center justify-center w-5 h-5 rounded border border-slate-600 hover:border-cyan-500 transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : someSelected ? (
                      <Minus className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        Nome
                        <ChevronDown className="w-3 h-3" />
                        {letterFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-64 p-3">
                      <div className="space-y-3">
                        <button
                          onClick={() => setLetterFilter('all')}
                          className={`w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                            letterFilter === 'all' 
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          Todos os contatos
                        </button>
                        <div className="grid grid-cols-9 gap-1">
                          {alphabet.map(letter => (
                            <button
                              key={letter}
                              onClick={() => setLetterFilter(letter)}
                              className={`w-6 h-6 flex items-center justify-center rounded text-xs font-medium transition-colors ${
                                letterFilter === letter
                                  ? 'bg-cyan-500 text-white'
                                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                              }`}
                            >
                              {letter}
                            </button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Status Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        Status
                        <ChevronDown className="w-3 h-3" />
                        {selectedStatuses.length > 0 && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-48 p-2">
                      <div className="space-y-1">
                        {statusOptions.map(option => (
                          <button
                            key={option.value}
                            onClick={() => toggleStatusFilter(option.value)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${selectedStatuses.includes(option.value) ? 'bg-slate-800' : ''}`}
                          >
                            <span className={`px-2 py-0.5 rounded border ${option.color}`}>
                              {option.label}
                            </span>
                            {selectedStatuses.includes(option.value) && <span className="text-cyan-400">✓</span>}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Pipeline/Tipo Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        Tipo
                        <ChevronDown className="w-3 h-3" />
                        {pipelineFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-48 p-2">
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        <button
                          onClick={() => setPipelineFilter('all')}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${pipelineFilter === 'all' ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                        >
                          Todos os tipos
                          {pipelineFilter === 'all' && <span>✓</span>}
                        </button>
                        {availablePipelines.map(pipeline => (
                          <button
                            key={pipeline.id}
                            onClick={() => setPipelineFilter(pipeline.slug)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${pipelineFilter === pipeline.slug ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                          >
                            <div className="flex items-center gap-2">
                              <span>{pipeline.icon || '📋'}</span>
                              <span>{pipeline.name}</span>
                            </div>
                            {pipelineFilter === pipeline.slug && <span>✓</span>}
                          </button>
                        ))}
                        <button
                          onClick={() => setPipelineFilter('none')}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${pipelineFilter === 'none' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'}`}
                        >
                          Sem pipeline
                          {pipelineFilter === 'none' && <span>✓</span>}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Responsável Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        <User className="w-3 h-3" />
                        Responsável
                        <ChevronDown className="w-3 h-3" />
                        {ownerFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-48 p-2">
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        <button
                          onClick={() => setOwnerFilter('all')}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${ownerFilter === 'all' ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                        >
                          Todos
                          {ownerFilter === 'all' && <span>✓</span>}
                        </button>
                        {availableOwners.map(owner => (
                          <button
                            key={owner.id}
                            onClick={() => setOwnerFilter(owner.id)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${ownerFilter === owner.id ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                          >
                            {owner.name}
                            {ownerFilter === owner.id && <span>✓</span>}
                          </button>
                        ))}
                        <button
                          onClick={() => setOwnerFilter('none')}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${ownerFilter === 'none' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'}`}
                        >
                          Sem responsável
                          {ownerFilter === 'none' && <span>✓</span>}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Data Criação Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        <CalendarDays className="w-3 h-3" />
                        Criado em
                        <ChevronDown className="w-3 h-3" />
                        {createdDateFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-40 p-2">
                      <div className="space-y-1">
                        {[
                          { value: 'all', label: 'Todos' },
                          { value: 'today', label: 'Hoje' },
                          { value: 'yesterday', label: 'Ontem' },
                          { value: 'week', label: 'Última semana' },
                          { value: 'month', label: 'Último mês' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setCreatedDateFilter(opt.value as typeof createdDateFilter)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${createdDateFilter === opt.value ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                          >
                            {opt.label}
                            {createdDateFilter === opt.value && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Chat Status Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        <MessageSquare className="w-3 h-3" />
                        Chat
                        <ChevronDown className="w-3 h-3" />
                        {chatStatusFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-44 p-2">
                      <div className="space-y-1">
                        {[
                          { value: 'all', label: 'Todos' },
                          { value: 'active', label: '🟢 Ativo no chat', color: 'text-green-400' },
                          { value: 'archived', label: '⬜ Arquivado', color: 'text-slate-400' },
                          { value: 'none', label: 'Sem conversa', color: 'text-slate-500' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setChatStatusFilter(opt.value as typeof chatStatusFilter)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${chatStatusFilter === opt.value ? 'bg-slate-800 text-cyan-400' : opt.color || 'text-slate-300'}`}
                          >
                            {opt.label}
                            {chatStatusFilter === opt.value && <span className="text-cyan-400">✓</span>}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Canais Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        Canais
                        <ChevronDown className="w-3 h-3" />
                        {channelFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-40 p-2">
                      <div className="space-y-1">
                        {[
                          { value: 'all', label: 'Todos' },
                          { value: 'email', label: 'Só Email' },
                          { value: 'phone', label: 'Só Telefone' },
                          { value: 'both', label: 'Ambos' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setChannelFilter(opt.value as typeof channelFilter)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${channelFilter === opt.value ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                          >
                            {opt.label}
                            {channelFilter === opt.value && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* CNPJ Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        CNPJ
                        <ChevronDown className="w-3 h-3" />
                        {cnpjFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-40 p-2">
                      <div className="space-y-1">
                        {[
                          { value: 'all', label: 'Todos' },
                          { value: 'with', label: 'Com CNPJ' },
                          { value: 'without', label: 'Sem CNPJ' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setCnpjFilter(opt.value as typeof cnpjFilter)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${cnpjFilter === opt.value ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                          >
                            {opt.label}
                            {cnpjFilter === opt.value && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                {/* Última Interação Header with Filter */}
                <th className="px-4 py-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                        Última Interação
                        <ChevronDown className="w-3 h-3" />
                        {dateFilter !== 'all' && <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-slate-900 border-slate-700 w-40 p-2">
                      <div className="space-y-1">
                        {[
                          { value: 'all', label: 'Todos' },
                          { value: 'today', label: 'Hoje' },
                          { value: 'week', label: 'Última semana' },
                          { value: 'month', label: 'Último mês' }
                        ].map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setDateFilter(opt.value as typeof dateFilter)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-800 transition-colors ${dateFilter === opt.value ? 'bg-slate-800 text-cyan-400' : 'text-slate-300'}`}
                          >
                            {opt.label}
                            {dateFilter === opt.value && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </th>
                <th className="px-4 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {contacts.map((contact) => (
                <tr key={contact.id} className={`hover:bg-slate-800/40 transition-colors group ${selectedContactIds.has(contact.id) ? 'bg-cyan-500/5' : ''}`}>
                  {/* Checkbox */}
                  <td className="px-4 py-4">
                    <Checkbox
                      checked={selectedContactIds.has(contact.id)}
                      onCheckedChange={() => toggleContactSelection(contact.id)}
                      className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-cyan-400 shadow-inner">
                        {contact.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors">{contact.name}</div>
                        {contact.company ? (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Building2 className="w-3 h-3" />
                            {contact.company}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-600">Sem empresa</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className={`px-2.5 py-1 rounded-md text-xs font-semibold border inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(contact.status)}`}>
                          {getStatusLabel(contact.status)}
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-slate-900 border-slate-700 min-w-[160px]">
                        {statusOptions.map(option => (
                          <DropdownMenuItem 
                            key={option.value}
                            onClick={() => handleStatusChange(contact.id, option.value)}
                            className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800"
                          >
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${option.color}`}>
                              {option.label}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                  {/* Pipeline/Tipo Cell */}
                  <td className="px-4 py-4">
                    {getPipelineBadge(contact as ExtendedContact)}
                  </td>
                  {/* Responsável Cell */}
                  <td className="px-4 py-4">
                    {(contact as ExtendedContact).ownerName ? (
                      <span className="text-slate-300 text-xs flex items-center gap-1.5">
                        <User className="w-3 h-3 text-slate-500" />
                        {(contact as ExtendedContact).ownerName?.split(' ')[0]}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">-</span>
                    )}
                  </td>
                  {/* Data Criação Cell */}
                  <td className="px-4 py-4">
                    {(contact as ExtendedContact).created_at ? (
                      <span className="text-slate-400 text-xs">
                        {new Date((contact as ExtendedContact).created_at!).toLocaleDateString('pt-BR')}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">-</span>
                    )}
                  </td>
                  {/* Chat Status Cell */}
                  <td className="px-4 py-4">
                    {getChatStatusBadge(contact as ExtendedContact)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      {contact.email && (
                        <div className="flex items-center gap-2 text-slate-400 text-xs">
                            <Mail className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[150px]">{contact.email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-slate-400 text-xs">
                          <Phone className="w-3.5 h-3.5" />
                          {displayPhoneInternational(contact.phone)}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {contact.cnpj ? (
                      <span className="text-slate-400 text-xs font-mono">{contact.cnpj}</span>
                    ) : (
                      <span className="text-slate-600 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                     <span className="text-slate-400">{contact.lastContact}</span>
                     <div className="text-[10px] text-slate-600">via WhatsApp</div>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 rounded-lg hover:bg-slate-800 hover:text-cyan-400" 
                        title="Ver Detalhes"
                        onClick={() => handleViewDetails(contact)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 rounded-lg hover:bg-slate-800 hover:text-cyan-400" 
                        title="Editar"
                        onClick={() => handleEditContact(contact)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="default" 
                        className="h-8 w-8 p-0 rounded-lg shadow-none bg-cyan-600 hover:bg-cyan-700" 
                        title="Iniciar Conversa"
                        onClick={() => handleConverse(contact.id)}
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 rounded-lg hover:bg-red-500/20 hover:text-red-400" 
                        title="Excluir"
                        onClick={() => handleDeleteClick(contact)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )};

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

        {/* Search Bar */}
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

        {/* Active Filter Chips */}
        {hasActiveFilters && (
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
          <ContactsTable contacts={filteredContacts} />
        </TabsContent>

        <TabsContent value="outbound" className="mt-0">
          <ContactsTable contacts={filteredContacts} />
        </TabsContent>

        <TabsContent value="facebook" className="mt-0">
          <ContactsTable contacts={filteredContacts} />
        </TabsContent>

        <TabsContent value="google" className="mt-0">
          <ContactsTable contacts={filteredContacts} />
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

    </div>
  );
};

export default Contacts;
