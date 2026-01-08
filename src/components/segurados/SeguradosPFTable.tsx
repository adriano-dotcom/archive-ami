import React from 'react';
import { User, Phone, Mail, ChevronRight, AlertTriangle, MessageSquare, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
}

interface SeguradosPFTableProps {
  segurados: SeguradoPF[];
  loading: boolean;
  onSelectSegurado: (segurado: SeguradoPF) => void;
  onOpenConversation: (contactId: string) => void;
}

export const SeguradosPFTable: React.FC<SeguradosPFTableProps> = ({ 
  segurados, 
  loading, 
  onSelectSegurado,
  onOpenConversation
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

  if (segurados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <User className="w-12 h-12 text-slate-600 mb-4" />
        <h3 className="text-lg font-medium text-slate-300 mb-2">Nenhum segurado PF cadastrado</h3>
        <p className="text-slate-500 text-sm">
          Os segurados serão criados automaticamente ao importar arquivos de cobrança
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-white/5 hover:bg-transparent">
            <TableHead className="text-slate-400">Segurado</TableHead>
            <TableHead className="text-slate-400">CPF</TableHead>
            <TableHead className="text-slate-400">Contato</TableHead>
            <TableHead className="text-slate-400">Seguradoras</TableHead>
            <TableHead className="text-slate-400 text-center">Apólices</TableHead>
            <TableHead className="text-slate-400 text-right">Valor em Aberto</TableHead>
            <TableHead className="text-slate-400 text-center">Atraso</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {segurados.map((segurado) => (
            <TableRow 
              key={segurado.id} 
              className="border-white/5 hover:bg-white/5"
            >
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
                  <div className="flex items-center gap-1 text-sm text-slate-400">
                    <Phone className="w-3 h-3" />
                    {displayPhoneInternational(segurado.phone_number)}
                  </div>
                  {segurado.email && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Mail className="w-3 h-3" />
                      {segurado.email}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {segurado.insurers.slice(0, 2).map((insurer, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs border-white/10 text-slate-300">
                      {insurer}
                    </Badge>
                  ))}
                  {segurado.insurers.length > 2 && (
                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">
                      +{segurado.insurers.length - 2}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">{segurado.policies_count}</span>
                </div>
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
  );
};
