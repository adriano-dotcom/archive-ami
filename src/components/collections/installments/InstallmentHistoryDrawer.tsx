import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  History, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  ArrowRight,
  DollarSign,
  MessageSquare,
  Undo2
} from 'lucide-react';
import { Installment, InstallmentHistory } from './useInstallments';

interface InstallmentHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: Installment | null;
}

const formatCurrency = (value: number | null) => {
  if (value === null) return 'N/A';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
};

const getActionIcon = (action: string) => {
  switch (action) {
    case 'marked_paid':
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    case 'marked_overdue':
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    case 'marked_negotiating':
      return <MessageSquare className="w-4 h-4 text-blue-400" />;
    case 'status_changed':
      return <ArrowRight className="w-4 h-4 text-slate-400" />;
    case 'value_changed':
      return <DollarSign className="w-4 h-4 text-amber-400" />;
    case 'reverted':
      return <Undo2 className="w-4 h-4 text-purple-400" />;
    default:
      return <Clock className="w-4 h-4 text-slate-400" />;
  }
};

const getActionLabel = (action: string) => {
  switch (action) {
    case 'marked_paid':
      return 'Marcado como pago';
    case 'marked_overdue':
      return 'Marcado como vencido';
    case 'marked_negotiating':
      return 'Em negociação';
    case 'status_changed':
      return 'Status alterado';
    case 'value_changed':
      return 'Valor alterado';
    case 'reverted':
      return 'Ação revertida';
    case 'created':
      return 'Parcela criada';
    default:
      return action;
  }
};

const getStatusBadge = (status: string | null) => {
  if (!status) return null;
  
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Pago</Badge>;
    case 'overdue':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Vencido</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Pendente</Badge>;
    case 'negotiating':
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Negociando</Badge>;
    default:
      return <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">{status}</Badge>;
  }
};

export const InstallmentHistoryDrawer: React.FC<InstallmentHistoryDrawerProps> = ({
  open,
  onOpenChange,
  installment
}) => {
  const { data: history, isLoading } = useQuery({
    queryKey: ['installment-history', installment?.id],
    queryFn: async () => {
      if (!installment?.id) return [];
      
      const { data, error } = await supabase
        .from('installment_history')
        .select('*')
        .eq('installment_id', installment.id)
        .order('performed_at', { ascending: false });
      
      if (error) throw error;
      return data as InstallmentHistory[];
    },
    enabled: !!installment?.id && open
  });

  if (!installment) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-slate-900 border-slate-800 w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-slate-100">
            <History className="w-5 h-5 text-blue-400" />
            Histórico da Parcela
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Installment Info */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Parcela #{installment.installment_number}</span>
              <span className="text-lg font-bold text-amber-400">
                {formatCurrency(installment.value)}
              </span>
            </div>
            <div className="text-sm text-slate-300">
              {installment.policy?.company?.nome_fantasia || installment.policy?.company?.razao_social || 'Empresa não identificada'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Apólice: {installment.policy?.policy_number || 'N/A'}
            </div>
          </div>

          {/* Timeline */}
          <ScrollArea className="h-[calc(100vh-280px)]">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : history && history.length > 0 ? (
              <div className="relative space-y-4 pl-6">
                {/* Timeline line */}
                <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-slate-700" />
                
                {history.map((item, index) => (
                  <div key={item.id} className="relative">
                    {/* Timeline dot */}
                    <div className="absolute -left-6 top-1 w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center">
                      {getActionIcon(item.action)}
                    </div>
                    
                    {/* Content */}
                    <div className="bg-slate-800/30 rounded-lg p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-slate-200">
                          {getActionLabel(item.action)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {format(new Date(item.performed_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      
                      {/* Status change */}
                      {item.previous_status && item.new_status && (
                        <div className="flex items-center gap-2 text-sm">
                          {getStatusBadge(item.previous_status)}
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          {getStatusBadge(item.new_status)}
                        </div>
                      )}
                      
                      {/* Value change */}
                      {item.action === 'value_changed' && (
                        <div className="flex items-center gap-2 text-sm mt-1">
                          <span className="text-slate-400">{formatCurrency(item.previous_value)}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          <span className="text-amber-400 font-medium">{formatCurrency(item.new_value)}</span>
                        </div>
                      )}
                      
                      {/* Notes */}
                      {item.notes && (
                        <p className="text-sm text-slate-400 mt-2">{item.notes}</p>
                      )}
                      
                      {/* Metadata */}
                      {item.metadata && Object.keys(item.metadata).length > 0 && (
                        <div className="text-xs text-slate-500 mt-2">
                          {item.metadata.days_overdue_before !== undefined && (
                            <span>Atraso: {item.metadata.days_overdue_before}d → {item.metadata.days_overdue_after}d</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Nenhum histórico disponível</p>
                <p className="text-sm text-slate-500 mt-1">
                  As alterações futuras serão registradas aqui
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};
