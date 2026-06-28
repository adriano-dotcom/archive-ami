import React, { useState, useMemo, useEffect } from 'react';
import { Building2, ChevronRight, Users, AlertTriangle, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { TablePagination } from '@/components/ui/table-pagination';
import { formatCNPJ } from '@/utils/phoneFormatter';

interface Company {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  city: string | null;
  state: string | null;
  contacts_count: number;
  billing_contacts_count: number;
  policies_count: number;
  overdue_value: number;
  max_days_overdue: number;
  seller_id: string | null;
  seller_name: string | null;
}

interface CompaniesTableProps {
  companies: Company[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onSelectCompany: (company: Company) => void;
  onEditCompany: (company: Company) => void;
  onDeleteCompany: (company: Company) => void;
}

type SortField = 'empresa' | 'cnpj' | 'localizacao' | 'contatos' | 'apolices' | 'valor' | 'atraso' | 'vendedor';
type SortDirection = 'asc' | 'desc';

export const CompaniesTable: React.FC<CompaniesTableProps> = ({ 
  companies, 
  loading, 
  selectedIds,
  onSelectionChange,
  onSelectCompany,
  onEditCompany,
  onDeleteCompany
}) => {
  const [sortField, setSortField] = useState<SortField>('empresa');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset page when companies data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [companies]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedCompanies = useMemo(() => {
    return [...companies].sort((a, b) => {
      let compareA: string | number;
      let compareB: string | number;

      switch (sortField) {
        case 'empresa':
          compareA = (a.nome_fantasia || a.razao_social).toLowerCase();
          compareB = (b.nome_fantasia || b.razao_social).toLowerCase();
          break;
        case 'cnpj':
          compareA = a.cnpj.replace(/\D/g, '');
          compareB = b.cnpj.replace(/\D/g, '');
          break;
        case 'localizacao':
          compareA = `${a.state || ''}${a.city || ''}`.toLowerCase();
          compareB = `${b.state || ''}${b.city || ''}`.toLowerCase();
          break;
        case 'contatos':
          compareA = a.contacts_count;
          compareB = b.contacts_count;
          break;
        case 'apolices':
          compareA = a.policies_count;
          compareB = b.policies_count;
          break;
        case 'valor':
          compareA = a.overdue_value;
          compareB = b.overdue_value;
          break;
        case 'atraso':
          compareA = a.max_days_overdue;
          compareB = b.max_days_overdue;
          break;
        case 'vendedor':
          compareA = (a.seller_name || '').toLowerCase();
          compareB = (b.seller_name || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (compareA < compareB) return sortDirection === 'asc' ? -1 : 1;
      if (compareA > compareB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [companies, sortField, sortDirection]);

  const paginatedCompanies = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedCompanies.slice(startIndex, startIndex + pageSize);
  }, [sortedCompanies, currentPage, pageSize]);

  // For selection, only consider current page items
  const currentPageIds = paginatedCompanies.map(c => c.id);
  const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));
  const someSelected = currentPageIds.some(id => selectedIds.includes(id)) && !allSelected;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-4 h-4 opacity-30" />;
    }
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      // Deselect all from current page
      onSelectionChange(selectedIds.filter(id => !currentPageIds.includes(id)));
    } else {
      // Select all from current page
      const newSelection = [...new Set([...selectedIds, ...currentPageIds])];
      onSelectionChange(newSelection);
    }
  };

  const toggleSelect = (companyId: string) => {
    if (selectedIds.includes(companyId)) {
      onSelectionChange(selectedIds.filter(id => id !== companyId));
    } else {
      onSelectionChange([...selectedIds, companyId]);
    }
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

  if (companies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-300 mb-2">Nenhuma empresa cadastrada</h3>
        <p className="text-slate-500 text-sm">
          As empresas serão criadas automaticamente ao importar arquivos com CNPJ
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      (el as any).indeterminate = someSelected;
                    }
                  }}
                  onCheckedChange={toggleSelectAll}
                  className="border-slate-600"
                />
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('empresa')}
              >
                <div className="flex items-center gap-1">
                  Empresa
                  <SortIcon field="empresa" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('cnpj')}
              >
                <div className="flex items-center gap-1">
                  CNPJ
                  <SortIcon field="cnpj" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('localizacao')}
              >
                <div className="flex items-center gap-1">
                  Localização
                  <SortIcon field="localizacao" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-center cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('contatos')}
              >
                <div className="flex items-center justify-center gap-1">
                  Contatos
                  <SortIcon field="contatos" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-center cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('apolices')}
              >
                <div className="flex items-center justify-center gap-1">
                  Apólices
                  <SortIcon field="apolices" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('valor')}
              >
                <div className="flex items-center justify-end gap-1">
                  Valor em Aberto
                  <SortIcon field="valor" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 text-center cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('atraso')}
              >
                <div className="flex items-center justify-center gap-1">
                  Atraso
                  <SortIcon field="atraso" />
                </div>
              </TableHead>
              <TableHead 
                className="text-slate-400 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => handleSort('vendedor')}
              >
                <div className="flex items-center gap-1">
                  Vendedor
                  <SortIcon field="vendedor" />
                </div>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedCompanies.map((company) => (
              <TableRow 
                key={company.id} 
                className={`border-white/5 hover:bg-white/5 cursor-pointer ${selectedIds.includes(company.id) ? 'bg-blue-500/10' : ''}`}
                onClick={() => onSelectCompany(company)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.includes(company.id)}
                    onCheckedChange={() => toggleSelect(company.id)}
                    className="border-slate-600"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">
                        {company.nome_fantasia || company.razao_social}
                      </p>
                      {company.nome_fantasia && (
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">
                          {company.razao_social}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm text-slate-400">
                    {formatCNPJ(company.cnpj)}
                  </span>
                </TableCell>
                <TableCell>
                  {company.city && company.state ? (
                    <span className="text-slate-400 text-sm">
                      {company.city}/{company.state}
                    </span>
                  ) : (
                    <span className="text-slate-600 text-sm">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Users className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-300">{company.contacts_count}</span>
                    {company.billing_contacts_count > 0 && (
                      <Badge variant="outline" className="ml-1 text-xs border-green-500/30 text-green-400">
                        {company.billing_contacts_count} cobrança
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-slate-300">{company.policies_count}</span>
                </TableCell>
                <TableCell className="text-right">
                  {company.overdue_value > 0 ? (
                    <span className="font-medium text-red-400">
                      {formatCurrency(company.overdue_value)}
                    </span>
                  ) : (
                    <span className="text-slate-500">-</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {company.max_days_overdue > 0 ? (
                    <Badge 
                      variant="outline" 
                      className={`${getOverdueColor(company.max_days_overdue)} border-current/30`}
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {company.max_days_overdue}d
                    </Badge>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {company.seller_name ? (
                    <div className="flex items-center gap-1.5">
                      <UserCog className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-sm text-slate-300 truncate max-w-[100px]" title={company.seller_name}>
                        {company.seller_name}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-600 text-sm">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-blue-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCompany(company);
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
                        onDeleteCompany(company);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-slate-400 hover:text-slate-200"
                      onClick={() => onSelectCompany(company)}
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
        totalItems={sortedCompanies.length}
        pageSize={pageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
};
