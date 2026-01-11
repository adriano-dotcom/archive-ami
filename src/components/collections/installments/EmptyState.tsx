import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  PartyPopper, 
  Filter, 
  CheckCircle, 
  TrendingUp,
  Calendar
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EmptyStateProps {
  statusFilter: string;
  onShowAllIncludingPaid: () => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  statusFilter,
  onShowAllIncludingPaid
}) => {
  // Fetch monthly stats
  const { data: monthlyStats } = useQuery({
    queryKey: ['monthly-collection-stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      const { data, error } = await supabase
        .from('installments')
        .select('value, paid_at, status')
        .eq('status', 'paid')
        .gte('paid_at', monthStart.toISOString())
        .lte('paid_at', monthEnd.toISOString());

      if (error) throw error;

      const totalPaid = data?.reduce((sum, inst) => sum + (inst.value || 0), 0) || 0;
      const count = data?.length || 0;

      return { totalPaid, count };
    },
    enabled: statusFilter === 'all'
  });

  if (statusFilter === 'all') {
    // Show congratulations state
    return (
      <div className="text-center py-16 space-y-6">
        <div className="relative inline-block">
          <PartyPopper className="w-16 h-16 mx-auto text-amber-400 animate-bounce" />
          <div className="absolute -top-2 -right-2">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
              <CheckCircle className="w-3 h-3 mr-1" />
              Em dia!
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-slate-200">
            Parabéns! Nenhuma parcela pendente
          </h3>
          <p className="text-slate-400 max-w-md mx-auto">
            Todas as parcelas estão em dia. Continue o ótimo trabalho de cobrança!
          </p>
        </div>

        {/* Monthly summary */}
        {monthlyStats && monthlyStats.count > 0 && (
          <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl p-6 border border-green-500/20 max-w-md mx-auto">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400 font-medium">
                Resumo de {format(new Date(), 'MMMM', { locale: ptBR })}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {monthlyStats.count}
                </div>
                <div className="text-sm text-slate-400">parcelas pagas</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">
                  {formatCurrency(monthlyStats.totalPaid)}
                </div>
                <div className="text-sm text-slate-400">valor recebido</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1 mt-4 text-sm text-green-400">
              <TrendingUp className="w-4 h-4" />
              <span>Excelente performance!</span>
            </div>
          </div>
        )}

        <Button 
          variant="outline"
          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/20 gap-2"
          onClick={onShowAllIncludingPaid}
        >
          <Filter className="w-4 h-4" />
          Ver todas as parcelas (incluindo pagas)
        </Button>
      </div>
    );
  }

  // Generic empty state for other filters
  return (
    <div className="text-center py-12 space-y-4">
      <div className="text-slate-400 text-lg">
        <Filter className="w-12 h-12 mx-auto mb-4 text-slate-500" />
        <p className="font-medium">Nenhuma parcela encontrada</p>
        <p className="text-sm text-slate-500 mt-2">
          Tente ajustar os filtros aplicados
        </p>
      </div>
    </div>
  );
};
