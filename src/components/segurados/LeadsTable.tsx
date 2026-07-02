import React, { useState, useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { User, Phone, MessageSquare, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import { formatCPF, formatCNPJ, displayPhoneInternational } from '@/utils/phoneFormatter';
import type { Lead } from '@/hooks/useSeguradosData';

interface LeadsTableProps {
  leads: Lead[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onOpenConversation: (contactId: string) => void;
  onDeleteLead: (lead: Lead) => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new: { label: 'Novo', className: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  qualified: { label: 'Qualificado', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  contacted: { label: 'Contatado', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  negotiating: { label: 'Negociando', className: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  lost: { label: 'Perdido', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
};

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  chat: 'Chat',
  landing_page: 'Landing Page',
  manual: 'Manual',
  ecommerce: 'E-commerce',
};

const PAGE_SIZE = 20;

const formatDate = (value: string | null): string => {
  if (!value) return '—';
  try {
    return format(parseISO(value), "dd/MM/yy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '—';
  }
};

export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  loading,
  selectedIds,
  onSelectionChange,
  onOpenConversation,
  onDeleteLead,
}) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(leads.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pageLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return leads.slice(start, start + pageSize);
  }, [leads, currentPage, pageSize]);

  const allPageSelected = pageLeads.length > 0 && pageLeads.every(l => selectedIds.includes(l.id));

  const toggleAllPage = () => {
    if (allPageSelected) {
      onSelectionChange(selectedIds.filter(id => !pageLeads.some(l => l.id === id)));
    } else {
      const ids = new Set(selectedIds);
      pageLeads.forEach(l => ids.add(l.id));
      onSelectionChange([...ids]);
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(sid => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Carregando leads...</div>;
  }

  if (leads.length === 0) {
    return (
      <div className="p-12 text-center">
        <User className="w-10 h-10 mx-auto text-slate-600 mb-3" />
        <p className="text-slate-300 font-medium">Nenhum lead no momento</p>
        <p className="text-slate-500 text-sm mt-1">
          Novos contatos que chegarem pelo chat aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700 hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox checked={allPageSelected} onCheckedChange={toggleAllPage} aria-label="Selecionar todos" />
            </TableHead>
            <TableHead className="text-slate-400">Nome</TableHead>
            <TableHead className="text-slate-400">Telefone</TableHead>
            <TableHead className="text-slate-400">CNPJ / CPF</TableHead>
            <TableHead className="text-slate-400">Status</TableHead>
            <TableHead className="text-slate-400">Origem</TableHead>
            <TableHead className="text-slate-400">Entrou em</TableHead>
            <TableHead className="text-slate-400 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageLeads.map(lead => {
            const status = lead.lead_status ? STATUS_LABELS[lead.lead_status] : undefined;
            const doc = lead.cnpj
              ? formatCNPJ(lead.cnpj)
              : lead.cpf
                ? formatCPF(lead.cpf)
                : '—';
            return (
              <TableRow key={lead.id} className="border-slate-800 hover:bg-slate-800/40">
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(lead.id)}
                    onCheckedChange={() => toggleOne(lead.id)}
                    aria-label={`Selecionar ${lead.name || lead.phone_number}`}
                  />
                </TableCell>
                <TableCell className="font-medium text-slate-200">
                  {lead.name || 'Sem nome'}
                </TableCell>
                <TableCell className="text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    {displayPhoneInternational(lead.phone_number)}
                  </span>
                </TableCell>
                <TableCell className="text-slate-400 text-sm">{doc}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={status?.className || 'bg-slate-700/40 text-slate-300 border-slate-600'}>
                    {status?.label || lead.lead_status || 'Novo'}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-400 text-sm">
                  {lead.lead_source ? (SOURCE_LABELS[lead.lead_source] || lead.lead_source) : '—'}
                </TableCell>
                <TableCell className="text-slate-400 text-sm">
                  {formatDate(lead.last_activity || lead.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenConversation(lead.id)}
                      className="h-8 gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Conversa
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDeleteLead(lead)}
                      className="h-8 w-8 p-0 text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                      aria-label="Excluir lead"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {leads.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalItems={leads.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      )}

    </div>
  );
};
