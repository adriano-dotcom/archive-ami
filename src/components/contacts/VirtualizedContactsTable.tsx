import React, { useRef, useCallback, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Loader2, MessageSquare, Mail, Phone, Building2, Eye, Edit, Trash2, 
  ChevronDown, CheckSquare, Square, Minus, User, CalendarDays, Archive 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { ContactLight } from '@/hooks/useContacts';

// Alias para compatibilidade
type ExtendedContact = ContactLight;

const statusOptions = [
  { value: 'new', label: 'Novo Lead', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { value: 'customer', label: 'Cliente Ativo', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'third_party_claim', label: 'Terceiro Sinistro', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' }
];

type CreatedDateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month';
type ChatStatusFilter = 'all' | 'active' | 'archived' | 'none';
type ChannelFilter = 'all' | 'email' | 'phone' | 'both';
type CnpjFilter = 'all' | 'with' | 'without';
type DateFilter = 'all' | 'today' | 'week' | 'month';

interface VirtualizedContactsTableProps {
  contacts: ExtendedContact[];
  loading: boolean;
  selectedContactIds: Set<string>;
  toggleContactSelection: (id: string) => void;
  toggleAllContacts: () => void;
  handleStatusChange: (contactId: string, newStatus: string) => void;
  handleViewDetails: (contact: ExtendedContact) => void;
  handleEditContact: (contact: ExtendedContact) => void;
  handleDeleteClick: (contact: ExtendedContact) => void;
  handleConverse: (contactId: string) => void;
  // Filter states and setters
  letterFilter: string;
  setLetterFilter: (v: string) => void;
  selectedStatuses: string[];
  toggleStatusFilter: (status: string) => void;
  pipelineFilter: string;
  setPipelineFilter: (v: string) => void;
  availablePipelines: Array<{ id: string; slug: string; name: string; icon?: string }>;
  ownerFilter: string;
  setOwnerFilter: (v: string) => void;
  availableOwners: Array<{ id: string; name: string }>;
  createdDateFilter: CreatedDateFilter;
  setCreatedDateFilter: (v: CreatedDateFilter) => void;
  chatStatusFilter: ChatStatusFilter;
  setChatStatusFilter: (v: ChatStatusFilter) => void;
  channelFilter: ChannelFilter;
  setChannelFilter: (v: ChannelFilter) => void;
  cnpjFilter: CnpjFilter;
  setCnpjFilter: (v: CnpjFilter) => void;
  dateFilter: DateFilter;
  setDateFilter: (v: DateFilter) => void;
  // Infinite scroll
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  totalCount: number;
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Memoized contact row component for better performance
const ContactRow = memo(({ 
  contact, 
  isSelected, 
  style,
  toggleSelection,
  handleStatusChange,
  handleViewDetails,
  handleEditContact,
  handleDeleteClick,
  handleConverse,
  getStatusColor,
  getStatusLabel,
  getChatStatusBadge,
  getPipelineBadge
}: {
  contact: ExtendedContact;
  isSelected: boolean;
  style: React.CSSProperties;
  toggleSelection: () => void;
  handleStatusChange: (contactId: string, status: string) => void;
  handleViewDetails: (contact: ExtendedContact) => void;
  handleEditContact: (contact: ExtendedContact) => void;
  handleDeleteClick: (contact: ExtendedContact) => void;
  handleConverse: (contactId: string) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getChatStatusBadge: (contact: ExtendedContact) => React.ReactNode;
  getPipelineBadge: (contact: ExtendedContact) => React.ReactNode;
}) => {
  return (
    <tr 
      style={style}
      className={`hover:bg-slate-800/40 transition-colors group border-b border-slate-800/50 ${isSelected ? 'bg-cyan-500/5' : ''}`}
    >
      {/* Checkbox */}
      <td className="px-4 py-4 w-12">
        <Checkbox
          checked={isSelected}
          onCheckedChange={toggleSelection}
          className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
        />
      </td>
      <td className="px-4 py-4 min-w-[200px]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-cyan-400 shadow-inner flex-shrink-0">
            {contact.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors truncate">{contact.name}</div>
            {contact.company ? (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{contact.company}</span>
              </div>
            ) : (
              <div className="text-xs text-slate-600">Sem empresa</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[140px]">
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
      <td className="px-4 py-4 min-w-[100px]">
        {getPipelineBadge(contact)}
      </td>
      {/* Responsável Cell */}
      <td className="px-4 py-4 min-w-[100px]">
        {contact.ownerName ? (
          <span className="text-slate-300 text-xs flex items-center gap-1.5">
            <User className="w-3 h-3 text-slate-500" />
            {contact.ownerName?.split(' ')[0]}
          </span>
        ) : (
          <span className="text-slate-600 text-xs">-</span>
        )}
      </td>
      {/* Data Criação Cell */}
      <td className="px-4 py-4 min-w-[90px]">
        {contact.created_at ? (
          <span className="text-slate-400 text-xs">
            {new Date(contact.created_at).toLocaleDateString('pt-BR')}
          </span>
        ) : (
          <span className="text-slate-600 text-xs">-</span>
        )}
      </td>
      {/* Chat Status Cell */}
      <td className="px-4 py-4 min-w-[90px]">
        {getChatStatusBadge(contact)}
      </td>
      <td className="px-4 py-4 min-w-[180px]">
        <div className="flex flex-col gap-1">
          {contact.email && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[150px]">{contact.email}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
            {displayPhoneInternational(contact.phone)}
          </div>
        </div>
      </td>
      <td className="px-4 py-4 min-w-[130px]">
        {contact.cnpj ? (
          <span className="text-slate-400 text-xs font-mono">{contact.cnpj}</span>
        ) : (
          <span className="text-slate-600 text-xs">-</span>
        )}
      </td>
      <td className="px-4 py-4 min-w-[120px]">
        <span className="text-slate-400">{contact.lastContact}</span>
        <div className="text-[10px] text-slate-600">via WhatsApp</div>
      </td>
      <td className="px-4 py-4 text-right min-w-[160px]">
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
  );
});

ContactRow.displayName = 'ContactRow';

export const VirtualizedContactsTable: React.FC<VirtualizedContactsTableProps> = ({
  contacts,
  loading,
  selectedContactIds,
  toggleContactSelection,
  toggleAllContacts,
  handleStatusChange,
  handleViewDetails,
  handleEditContact,
  handleDeleteClick,
  handleConverse,
  letterFilter,
  setLetterFilter,
  selectedStatuses,
  toggleStatusFilter,
  pipelineFilter,
  setPipelineFilter,
  availablePipelines,
  ownerFilter,
  setOwnerFilter,
  availableOwners,
  createdDateFilter,
  setCreatedDateFilter,
  chatStatusFilter,
  setChatStatusFilter,
  channelFilter,
  setChannelFilter,
  cnpjFilter,
  setCnpjFilter,
  dateFilter,
  setDateFilter,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  totalCount
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const allSelected = contacts.length > 0 && selectedContactIds.size === contacts.length;
  const someSelected = selectedContactIds.size > 0 && selectedContactIds.size < contacts.length;

  // Virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: contacts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // ~72px per row
    overscan: 10, // Extra rows rendered for smoother scrolling
  });

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    if (distanceFromBottom < 300 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;
    
    element.addEventListener('scroll', handleScroll);
    return () => element.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const getStatusColor = (status: string) => {
    const option = statusOptions.find(o => o.value === status);
    return option?.color || 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getStatusLabel = (status: string) => {
    const option = statusOptions.find(o => o.value === status);
    return option?.label || 'Novo Lead';
  };

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

  const virtualRows = rowVirtualizer.getVirtualItems();

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl overflow-hidden min-h-[400px]">
        <div className="flex flex-col items-center justify-center h-80">
          <Loader2 className="h-10 w-10 animate-spin text-cyan-500 mb-3" />
          <span className="text-sm text-slate-400 animate-pulse">Carregando base de dados...</span>
        </div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl overflow-hidden min-h-[400px]">
        <div className="flex flex-col items-center justify-center h-80 text-slate-500">
          <User className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhum contato encontrado</p>
          <p className="text-sm mt-1">Aguardando contatos via WhatsApp</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Scrollable container with fixed height */}
      <div 
        ref={parentRef}
        className="overflow-auto"
        style={{ height: 'calc(100vh - 350px)', minHeight: '400px' }}
      >
        <table className="w-full text-sm text-left" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-slate-900/95 text-slate-400 border-b border-slate-800 font-medium text-xs uppercase tracking-wider sticky top-0 z-20">
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
              <th className="px-4 py-4 min-w-[200px]">
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
              <th className="px-4 py-4 min-w-[140px]">
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
              <th className="px-4 py-4 min-w-[100px]">
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
              <th className="px-4 py-4 min-w-[100px]">
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
              <th className="px-4 py-4 min-w-[90px]">
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
                          onClick={() => setCreatedDateFilter(opt.value as CreatedDateFilter)}
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
              <th className="px-4 py-4 min-w-[90px]">
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
                        { value: 'all', label: 'Todos', color: '' },
                        { value: 'active', label: '🟢 Ativo no chat', color: 'text-green-400' },
                        { value: 'archived', label: '⬜ Arquivado', color: 'text-slate-400' },
                        { value: 'none', label: 'Sem conversa', color: 'text-slate-500' }
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setChatStatusFilter(opt.value as ChatStatusFilter)}
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
              <th className="px-4 py-4 min-w-[180px]">
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
                          onClick={() => setChannelFilter(opt.value as ChannelFilter)}
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
              <th className="px-4 py-4 min-w-[130px]">
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
                          onClick={() => setCnpjFilter(opt.value as CnpjFilter)}
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
              <th className="px-4 py-4 min-w-[120px]">
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
                          onClick={() => setDateFilter(opt.value as DateFilter)}
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
              <th className="px-4 py-4 text-right min-w-[160px]">Ações</th>
            </tr>
          </thead>
          <tbody
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualRows.map((virtualRow) => {
              const contact = contacts[virtualRow.index];
              return (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  isSelected={selectedContactIds.has(contact.id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  toggleSelection={() => toggleContactSelection(contact.id)}
                  handleStatusChange={handleStatusChange}
                  handleViewDetails={handleViewDetails}
                  handleEditContact={handleEditContact}
                  handleDeleteClick={handleDeleteClick}
                  handleConverse={handleConverse}
                  getStatusColor={getStatusColor}
                  getStatusLabel={getStatusLabel}
                  getChatStatusBadge={getChatStatusBadge}
                  getPipelineBadge={getPipelineBadge}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Load More Indicator */}
      <div className="py-3 flex justify-center border-t border-slate-800">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando mais contatos...</span>
          </div>
        )}
        {!isFetchingNextPage && !hasNextPage && contacts.length > 0 && (
          <span className="text-sm text-slate-500">
            Todos os {totalCount} contatos carregados
          </span>
        )}
        {!isFetchingNextPage && hasNextPage && (
          <span className="text-sm text-slate-500">
            Mostrando {contacts.length} de {totalCount} contatos
          </span>
        )}
      </div>
    </div>
  );
};
