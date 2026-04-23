import React, { useRef, useCallback, useEffect, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { 
  Loader2, MessageSquare, Mail, Phone, Building2, Eye, Edit, Trash2, 
  ChevronDown, CheckSquare, Square, Minus, User, CalendarDays, Archive, Copy, UserCog, Crown, X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../ui/dropdown-menu';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { ContactLight, useTeamMembers } from '@/hooks/useContacts';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

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
type AssigneeFilter = 'all' | 'unassigned' | string; // 'all' | 'unassigned' | team_member_id

interface VirtualizedContactsTableProps {
  contacts: ExtendedContact[];
  loading: boolean;
  selectedContactIds: Set<string>;
  toggleContactSelection: (id: string) => void;
  toggleAllContacts: () => void;
  handleStatusChange: (contactId: string, newStatus: string) => void;
  handleAssignUser?: (contactId: string, userId: string | null) => void;
  handleViewDetails: (contact: ExtendedContact) => void;
  handleEditContact: (contact: ExtendedContact) => void;
  handleDeleteClick: (contact: ExtendedContact) => void;
  handleConverse: (contactId: string) => void;
  // Filter states and setters
  letterFilter: string;
  setLetterFilter: (v: string) => void;
  selectedStatuses: string[];
  toggleStatusFilter: (status: string) => void;
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
  // Duplicate modal callback with focus context
  onOpenDuplicatesModal?: (focus: { groupKey: string; contactId: string }) => void;
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Memoized contact row component for better performance
const ContactRow = memo(({ 
  contact, 
  isSelected, 
  style,
  toggleSelection,
  handleStatusChange,
  handleAssignUser,
  handleViewDetails,
  handleEditContact,
  handleDeleteClick,
  handleConverse,
  getStatusColor,
  getStatusLabel,
  getChatStatusBadge,
  onOpenDuplicatesModal,
  teamMembers
}: {
  contact: ExtendedContact;
  isSelected: boolean;
  style: React.CSSProperties;
  toggleSelection: () => void;
  handleStatusChange: (contactId: string, status: string) => void;
  handleAssignUser?: (contactId: string, userId: string | null) => void;
  handleViewDetails: (contact: ExtendedContact) => void;
  handleEditContact: (contact: ExtendedContact) => void;
  handleDeleteClick: (contact: ExtendedContact) => void;
  handleConverse: (contactId: string) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getChatStatusBadge: (contact: ExtendedContact) => React.ReactNode;
  onOpenDuplicatesModal?: (focus: { groupKey: string; contactId: string }) => void;
  teamMembers: { id: string; name: string }[];
}) => {
  // Column widths matching header - using grid layout for virtualization
  const colWidths = {
    checkbox: '48px',
    name: '200px',
    status: '130px',
    created: '100px',
    chat: '90px',
    assignee: '150px',
    channels: '170px',
    cnpj: '140px',
    lastInteraction: '120px',
    actions: '150px'
  };

  const isCustomer = contact.status === 'customer';
  const assignedName = contact.assigned_user_name || null;
  const initialsAssigned = assignedName ? assignedName.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() : null;
  const firstNameAssigned = assignedName ? assignedName.trim().split(/\s+/)[0] : null;

  return (
    <div 
      style={style}
      className={`hover:bg-slate-800/40 transition-colors group border-b border-slate-800/50 flex items-center ${isSelected ? 'bg-cyan-500/5' : ''}`}
    >
      {/* Checkbox */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.checkbox }}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={toggleSelection}
          className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
        />
      </div>
      {/* Nome */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.name }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400 shadow-inner flex-shrink-0">
            {contact.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="font-semibold text-slate-200 group-hover:text-cyan-400 transition-colors truncate text-sm">{contact.name}</div>
              {isCustomer && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-0.5 flex-shrink-0">
                        <Crown className="w-2.5 h-2.5" />
                        Cliente
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-slate-900 border-emerald-500/30 text-emerald-200">
                      <p className="text-xs">Cliente ativo (tutor)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {contact.duplicateInfo?.isDuplicate && (
                <TooltipProvider delayDuration={100}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (contact.duplicateInfo?.groupKey) {
                            onOpenDuplicatesModal?.({ groupKey: contact.duplicateInfo.groupKey, contactId: contact.id });
                          }
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center gap-0.5 cursor-pointer flex-shrink-0 hover:bg-amber-500/20 transition-colors"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        {contact.duplicateInfo.duplicateCount}x
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-slate-900 border-amber-500/30 text-amber-200">
                      <p className="text-xs">
                        {contact.duplicateInfo.duplicateCount} contatos com mesmo telefone - clique para mesclar
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
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
      </div>
      {/* Status */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.status }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={`px-2 py-1 rounded-md text-xs font-semibold border inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(contact.status)}`}>
              <span className="truncate max-w-[80px]">{getStatusLabel(contact.status)}</span>
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
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
      </div>
      {/* Data Criação */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.created }}>
        {contact.created_at ? (
          <span className="text-slate-400 text-xs">
            {new Date(contact.created_at).toLocaleDateString('pt-BR')}
          </span>
        ) : (
          <span className="text-slate-600 text-xs">-</span>
        )}
      </div>
      {/* Chat Status */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.chat }}>
        {getChatStatusBadge(contact)}
      </div>
      {/* Responsável */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.assignee }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 hover:border-cyan-500/40 transition-colors w-full max-w-full overflow-hidden">
              {assignedName ? (
                <>
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-600 to-teal-700 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
                    {initialsAssigned}
                  </div>
                  <span className="text-slate-200 truncate flex-1 text-left">{firstNameAssigned}</span>
                </>
              ) : (
                <>
                  <UserCog className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-500 italic flex-1 text-left">Atribuir</span>
                </>
              )}
              <ChevronDown className="w-3 h-3 text-slate-500 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-slate-900 border-slate-700 min-w-[200px] max-h-[300px] overflow-y-auto">
            {assignedName && (
              <>
                <DropdownMenuItem
                  onClick={() => handleAssignUser?.(contact.id, null)}
                  className="cursor-pointer hover:bg-slate-800 focus:bg-slate-800 text-red-400 text-xs"
                >
                  <X className="w-3.5 h-3.5 mr-2" />
                  Remover responsável
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-700" />
              </>
            )}
            {teamMembers.length === 0 && (
              <div className="px-3 py-2 text-xs text-slate-500">Nenhum membro da equipe ativo</div>
            )}
            {teamMembers.map(member => {
              const isSelected = contact.assigned_user_id === member.id;
              const initials = member.name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
              return (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() => !isSelected && handleAssignUser?.(contact.id, member.id)}
                  className={`cursor-pointer hover:bg-slate-800 focus:bg-slate-800 text-xs ${isSelected ? 'bg-cyan-500/10 text-cyan-300' : 'text-slate-200'}`}
                >
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-600 to-teal-700 flex items-center justify-center text-[9px] font-bold text-white mr-2">
                    {initials}
                  </div>
                  <span className="flex-1 truncate">{member.name}</span>
                  {isSelected && <span className="text-cyan-400 ml-2">✓</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Canais */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.channels }}>
        <div className="flex flex-col gap-1">
          {contact.email && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Mail className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate max-w-[120px]">{contact.email}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Phone className="w-3.5 h-3.5 flex-shrink-0" />
            {displayPhoneInternational(contact.phone)}
          </div>
        </div>
      </div>
      {/* CNPJ */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.cnpj }}>
        {contact.cnpj ? (
          <span className="text-slate-400 text-xs font-mono truncate block">{contact.cnpj}</span>
        ) : (
          <span className="text-slate-600 text-xs">-</span>
        )}
      </div>
      {/* Última Interação */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.lastInteraction }}>
        <span className="text-slate-400 text-xs">{contact.lastContact}</span>
        <div className="text-[10px] text-slate-600">via WhatsApp</div>
      </div>
      {/* Ações */}
      <div className="px-4 py-4 flex-shrink-0" style={{ width: colWidths.actions }}>
        <div className="flex items-center gap-1">
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0 rounded-lg hover:bg-slate-800 hover:text-cyan-400" 
            title="Ver Detalhes"
            onClick={() => handleViewDetails(contact)}
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0 rounded-lg hover:bg-slate-800 hover:text-cyan-400" 
            title="Editar"
            onClick={() => handleEditContact(contact)}
          >
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button 
            size="sm" 
            variant="default" 
            className="h-7 w-7 p-0 rounded-lg shadow-none bg-cyan-600 hover:bg-cyan-700" 
            title="Iniciar Conversa"
            onClick={() => handleConverse(contact.id)}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 w-7 p-0 rounded-lg hover:bg-red-500/20 hover:text-red-400" 
            title="Excluir"
            onClick={() => handleDeleteClick(contact)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
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
  handleAssignUser,
  handleViewDetails,
  handleEditContact,
  handleDeleteClick,
  handleConverse,
  letterFilter,
  setLetterFilter,
  selectedStatuses,
  toggleStatusFilter,
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
  totalCount,
  onOpenDuplicatesModal
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const { data: teamMembers = [] } = useTeamMembers();
  
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
        {/* Using div-based grid layout for proper virtualization alignment */}
        <div className="w-full text-sm text-left min-w-[1148px]">
          {/* Header */}
          <div className="bg-slate-900/95 text-slate-400 border-b border-slate-800 font-medium text-xs uppercase tracking-wider sticky top-0 z-20 flex items-center">
            {/* Checkbox Master */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '48px' }}>
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
            </div>
            {/* Nome */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '200px' }}>
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
            </div>
            {/* Status */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '130px' }}>
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
            </div>
            {/* Criado em */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '100px' }}>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                    <CalendarDays className="w-3 h-3" />
                    Criado
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
            </div>
            {/* Chat */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '90px' }}>
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
            </div>
            {/* Canais */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '170px' }}>
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
            </div>
            {/* CNPJ */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '140px' }}>
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
            </div>
            {/* Última Interação */}
            <div className="px-4 py-4 flex-shrink-0" style={{ width: '120px' }}>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
                    Interação
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
            </div>
            {/* Ações */}
            <div className="px-4 py-4 flex-shrink-0 text-right" style={{ width: '150px' }}>Ações</div>
          </div>
          
          {/* Body - Virtualized rows */}
          <div
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
                  onOpenDuplicatesModal={onOpenDuplicatesModal}
                />
              );
            })}
          </div>
        </div>
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
