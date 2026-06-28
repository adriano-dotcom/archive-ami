import React, { useState, useMemo, useEffect } from 'react';
import { User, Phone, Mail, ChevronRight, AlertTriangle, MessageSquare, FileText, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import { formatCPF, displayPhoneInternational } from '@/utils/phoneFormatter';

interface SeguradoPF {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  cpf: string | null;
  city: string | null;
  state: string | null;
  policies_count: number;
  insurers: string[];
  overdue_value: number;
  max_days_overdue: number;
  tags?: string[] | null;
  subscription?: {
    plan_name?: string;
    monthly_amount?: number;
    monthly_amount_formatted?: string;
    payment_method?: string;
    started_at?: string;
  } | null;
  pet_name?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cartao: 'Cartão',
  cartao_credito: 'Cartão',
  pix: 'PIX',
  pix_mensal: 'PIX mensal',
  pix_anual: 'PIX anual',
};

interface SeguradosPFTableProps {
  segurados: SeguradoPF[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSelectSegurado: (segurado: SeguradoPF) => void;
  onOpenConversation: (contactId: string) => void;
  onEditSegurado: (segurado: SeguradoPF) => void;
  onDeleteSegurado: (segurado: SeguradoPF) => void;
}

type SortField = 'segurado' | 'cpf' | 'contato' | 'seguradoras' | 'apolices' | 'valor' | 'atraso';
type SortDirection = 'asc' | 'desc';

export const SeguradosPFTable: React.FC<SeguradosPFTableProps> = ({ 
  segurados, 
  loading, 
  selectedIds,
  onSelectionChange,
  onSelectSegurado,
  onOpenConversation,
  onEditSegurado,
  onDeleteSegurado
}) => {
  const [sortField, setSortField] = useState<SortField>('segurado');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset page when segurados data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [segurados]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedSegurados = useMemo(() => {
    return [...segurados].sort((a, b) => {
      let compareA: string | number;
      let compareB: string | number;
      
      switch (sortField) {
        case 'segurado':
          compareA = (a.name || '').toLowerCase();
          compareB = (b.name || '').toLowerCase();
          break;
        case 'cpf':
          compareA = a.cpf || '';
          compareB = b.cpf || '';
          break;
        case 'contato':
          compareA = a.phone_number;
          compareB = b.phone_number;
          break;
        case 'seguradoras':
          compareA = (a.insurers[0] || '').toLowerCase();
          compareB = (b.insurers[0] || '').toLowerCase();
          break;
        case 'apolices':
          compareA = a.policies_count + (a.subscription?.plan_name ? 1 : 0);
          compareB = b.policies_count + (b.subscription?.plan_name ? 1 : 0);
          break;
        case 'valor':
          compareA = a.overdue_value;
          compareB = b.overdue_value;
          break;
        case 'atraso':
          compareA = a.max_days_overdue;
          compareB = b.max_days_overdue;
          break;
        default:
          return 0;
      }
      
      if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [segurados, sortField, sortDirection]);

  const paginatedSegurados = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedSegurados.slice(startIndex, startIndex + pageSize);
  }, [sortedSegurados, currentPage, pageSize]);

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-4 h-4 opacity-30" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getOverdueColor = (days: number) => {
    if (days === 0) return 'text-slate-400';
    if (days <= 30) return 'text-yellow-400';
    if (days <= 60) return 'text-orange-400';
    return 'text-red-400';
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (segurados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <User className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-300 mb-2">Nenhum transportador cadastrado</h3>
        <p className="text-slate-500 text-sm">
          Os transportadores serão criados automaticamente ao importar arquivos
        </p>
      </div>
    );
  }

  // For selection, only consider current page items
  const currentPageIds = paginatedSegurados.map(s => s.id);
  const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));
  const someSelected = currentPageIds.some(id => selectedIds.includes(id)) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      // Deselect all from current page
      onSelectionChange(selectedIds.filter(id => !currentPageIds.includes(id)));
    } else {
      // Select all from current page
      const newSelection = [...new Set([...selectedIds, ...currentPageIds])];
      onSelectionChange(newSelection);
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox 
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  {...(someSelected ? { "data-state": "indeterminate" } : {})}
                />
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('segurado')}
              >
                <div className="flex items-center gap-1">
                  Transportador
                  {getSortIcon('segurado')}
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('cpf')}
              >
                <div className="flex items-center gap-1">
                  CPF
                  {getSortIcon('cpf')}
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('contato')}
              >
                <div className="flex items-center gap-1">
                  Contato
                  {getSortIcon('contato')}
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-center cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('apolices')}
              >
                <div className="flex items-center justify-center gap-1">
                  Apólices
                  {getSortIcon('apolices')}
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('valor')}
              >
                <div className="flex items-center justify-end gap-1">
                  Valor em Aberto
                  {getSortIcon('valor')}
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-center cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('atraso')}
              >
                <div className="flex items-center justify-center gap-1">
                  Atraso
                  {getSortIcon('atraso')}
                </div>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedSegurados.map((segurado) => (
              <TableRow 
                key={segurado.id} 
                className={`border-white/5 hover:bg-white/5 ${selectedIds.includes(segurado.id) ? 'bg-emerald-500/10' : ''}`}
              >
                <TableCell>
                  <Checkbox 
                    checked={selectedIds.includes(segurado.id)}
                    onCheckedChange={() => toggleOne(segurado.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  />
                </TableCell>
                <TableCell>
                  <div 
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => onSelectSegurado(segurado)}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">
                        {segurado.name || 'Sem nome'}
                      </p>
                      {segurado.city && segurado.state && (
                        <p className="text-xs text-slate-500">
                          {segurado.city}/{segurado.state}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {segurado.cpf ? (
                    <span className="font-mono text-sm text-slate-400">
                      {formatCPF(segurado.cpf)}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-sm">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {segurado.phone_number.startsWith('PENDENTE') ? (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          Telefone pendente
                        </span>
                      ) : (
                        <span className="text-slate-400">{displayPhoneInternational(segurado.phone_number)}</span>
                      )}
                    </div>
                    {segurado.email && (
                      <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Mail className="w-3 h-3" />
                        {segurado.email}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {segurado.subscription?.plan_name ? (
                    <div className="inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/30 text-left">
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-green-400 shrink-0" />
                        <span className="text-xs font-semibold text-green-400 truncate max-w-[140px]">
                          {segurado.subscription.plan_name}
                        </span>
                      </div>
                      <span className="text-[10px] text-green-400/80 pl-4">
                        {segurado.subscription.monthly_amount_formatted ||
                          (segurado.subscription.monthly_amount
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(segurado.subscription.monthly_amount)
                            : '—')}
                        {' / mês'}
                      </span>
                    </div>
                  ) : segurado.policies_count > 0 ? (
                    <div className="flex items-center justify-center gap-1">
                      <FileText className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-300">{segurado.policies_count}</span>
                    </div>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {segurado.overdue_value > 0 ? (
                    <span className="font-medium text-red-400">
                      {formatCurrency(segurado.overdue_value)}
                    </span>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {segurado.max_days_overdue > 0 ? (
                    <Badge 
                      variant="outline" 
                      className={`${getOverdueColor(segurado.max_days_overdue)} border-current/30`}
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {segurado.max_days_overdue}d
                    </Badge>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-green-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenConversation(segurado.id);
                      }}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-blue-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSegurado(segurado);
                      }}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegurado(segurado);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-slate-200"
                      onClick={() => onSelectSegurado(segurado)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      <TablePagination
        currentPage={currentPage}
        totalItems={sortedSegurados.length}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
};
