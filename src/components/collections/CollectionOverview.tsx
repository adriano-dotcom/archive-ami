import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Users, DollarSign, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

interface CollectionSummary {
  total_debtors: number;
  total_overdue_installments: number;
  total_overdue_value: number;
  range_1_30: number;
  range_31_60: number;
  range_61_90: number;
  range_90_plus: number;
  value_1_30: number;
  value_31_60: number;
  value_61_90: number;
  value_90_plus: number;
}

const COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444'];

export const CollectionOverview: React.FC = () => {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['collection-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_summary')
        .select('*')
        .single();
      
      if (error) throw error;
      return data as CollectionSummary;
    }
  });

  const { data: recentInstallments, isLoading: loadingRecent } = useQuery({
    queryKey: ['recent-overdue-installments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('installments')
        .select(`
          *,
          contact:contacts(name, phone_number),
          policy:policies(policy_number, insurer)
        `)
        .in('status', ['overdue', 'negotiating'])
        .order('days_overdue', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    }
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const pieData = summary ? [
    { name: '1-30 dias', value: summary.range_1_30, amount: summary.value_1_30 },
    { name: '31-60 dias', value: summary.range_31_60, amount: summary.value_31_60 },
    { name: '61-90 dias', value: summary.range_61_90, amount: summary.value_61_90 },
    { name: '90+ dias', value: summary.range_90_plus, amount: summary.value_90_plus },
  ].filter(d => d.value > 0) : [];

  const barData = summary ? [
    { range: '1-30', parcelas: summary.range_1_30, valor: summary.value_1_30 },
    { range: '31-60', parcelas: summary.range_31_60, valor: summary.value_31_60 },
    { range: '61-90', parcelas: summary.range_61_90, valor: summary.value_61_90 },
    { range: '90+', parcelas: summary.range_90_plus, valor: summary.value_90_plus },
  ] : [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-slate-900/50 border-white/5">
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-rose-300/80">Total em Atraso</p>
                <p className="text-2xl font-bold text-rose-400">
                  {formatCurrency(summary?.total_overdue_value || 0)}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-rose-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-300/80">Parcelas Vencidas</p>
                <p className="text-2xl font-bold text-amber-400">
                  {summary?.total_overdue_installments || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-300/80">Segurados Inadimplentes</p>
                <p className="text-2xl font-bold text-blue-400">
                  {summary?.total_debtors || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-300/80">Críticos (90+ dias)</p>
                <p className="text-2xl font-bold text-orange-400">
                  {summary?.range_90_plus || 0}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Distribuição por Faixa de Atraso</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${value} parcelas (${formatCurrency(props.payload.amount)})`,
                      name
                    ]}
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                Nenhuma parcela vencida
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart */}
        <Card className="bg-slate-900/50 border-white/5">
          <CardHeader>
            <CardTitle className="text-lg text-slate-200">Valores por Faixa de Atraso</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <XAxis dataKey="range" stroke="#64748b" />
                <YAxis 
                  stroke="#64748b"
                  tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="valor" 
                  name="Valor Total" 
                  fill="#f59e0b" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Overdue List */}
      <Card className="bg-slate-900/50 border-white/5">
        <CardHeader>
          <CardTitle className="text-lg text-slate-200">Parcelas Mais Críticas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingRecent ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentInstallments && recentInstallments.length > 0 ? (
            <div className="space-y-3">
              {recentInstallments.map((inst: any) => (
                <div 
                  key={inst.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-white/5 hover:border-amber-500/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      inst.days_overdue > 90 ? 'bg-rose-500/20 text-rose-400' :
                      inst.days_overdue > 60 ? 'bg-orange-500/20 text-orange-400' :
                      inst.days_overdue > 30 ? 'bg-amber-500/20 text-amber-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {inst.days_overdue}d
                    </div>
                    <div>
                      <p className="font-medium text-slate-200">
                        {inst.contact?.name || 'Contato não encontrado'}
                      </p>
                      <p className="text-sm text-slate-500">
                        Apólice: {inst.policy?.policy_number} • {inst.policy?.insurer}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-400">{formatCurrency(inst.value)}</p>
                    <p className="text-sm text-slate-500">
                      Parcela {inst.installment_number}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              Nenhuma parcela vencida encontrada
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
