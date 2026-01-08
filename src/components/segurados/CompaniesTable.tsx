import React from 'react';
import { Building2, Phone, ChevronRight, Users, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
}

interface CompaniesTableProps {
  companies: Company[];
  loading: boolean;
  onSelectCompany: (company: Company) => void;
}

export const CompaniesTable: React.FC<CompaniesTableProps> = ({ 
  companies, 
  loading, 
  onSelectCompany 
}) => {
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
          As empresas serão criadas automaticamente ao importar arquivos de cobrança com CNPJ
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-white/5 hover:bg-transparent">
            <TableHead className="text-slate-400">Empresa</TableHead>
            <TableHead className="text-slate-400">CNPJ</TableHead>
            <TableHead className="text-slate-400">Localização</TableHead>
            <TableHead className="text-slate-400 text-center">Contatos</TableHead>
            <TableHead className="text-slate-400 text-center">Apólices</TableHead>
            <TableHead className="text-slate-400 text-right">Valor em Aberto</TableHead>
            <TableHead className="text-slate-400 text-center">Atraso</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow 
              key={company.id} 
              className="border-white/5 hover:bg-white/5 cursor-pointer"
              onClick={() => onSelectCompany(company)}
            >
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
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-200">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
