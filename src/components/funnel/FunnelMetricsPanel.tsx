import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, TrendingUp, TrendingDown } from 'lucide-react';

interface Stage {
  key: string;
  label: string;
  dotColor: string;
}

interface FunnelMetricsPanelProps {
  contactsByStage: Record<string, any[]>;
  stages: Stage[];
  totalLeads: number;
}

const TRANSITION_COLORS = ['#3b82f6', '#eab308', '#f97316', '#a855f7', '#22c55e'];

const FunnelMetricsPanel: React.FC<FunnelMetricsPanelProps> = ({ contactsByStage, stages, totalLeads }) => {
  const metrics = useMemo(() => {
    const activeFunnel = stages.filter(s => s.key !== 'churned');
    const churnedCount = (contactsByStage['churned'] || []).length;

    // For each stage, count leads that reached it or beyond
    const reachedCounts: number[] = activeFunnel.map((_, idx) => {
      let sum = 0;
      for (let i = idx; i < activeFunnel.length; i++) {
        sum += (contactsByStage[activeFunnel[i].key] || []).length;
      }
      return sum;
    });

    // Transitions between consecutive stages
    const transitions = activeFunnel.slice(0, -1).map((stage, idx) => {
      const fromReached = reachedCounts[idx];
      const toReached = reachedCounts[idx + 1];
      const rate = fromReached > 0 ? (toReached / fromReached) * 100 : 0;
      return {
        label: `${stage.label} → ${activeFunnel[idx + 1].label}`,
        from: fromReached,
        to: toReached,
        rate: Math.round(rate * 10) / 10,
        color: TRANSITION_COLORS[idx] || '#64748b',
      };
    });

    const generalConversion = totalLeads > 0
      ? ((contactsByStage['customer'] || []).length / totalLeads) * 100
      : 0;

    const churnRate = totalLeads > 0 ? (churnedCount / totalLeads) * 100 : 0;

    return { transitions, generalConversion, churnRate, churnedCount };
  }, [contactsByStage, stages, totalLeads]);

  return (
    <div className="border-b border-border bg-muted/20 p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total de Leads</p>
            <p className="text-xl font-bold text-foreground">{totalLeads}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="rounded-md bg-green-500/10 p-2">
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Conversão Geral</p>
            <p className="text-xl font-bold text-foreground">{metrics.generalConversion.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">Novo → Vendido</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
          <div className="rounded-md bg-red-500/10 p-2">
            <TrendingDown className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Taxa de Perda</p>
            <p className="text-xl font-bold text-foreground">{metrics.churnRate.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">{metrics.churnedCount} leads perdidos</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Taxa de Passagem entre Estágios</h3>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={metrics.transitions} layout="vertical" margin={{ left: 20 }}>
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={150}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                }}
                formatter={(value: number, _name: string, entry: any) => [
                  `${value}% (${entry.payload.to} de ${entry.payload.from} leads)`,
                  'Taxa',
                ]}
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]} barSize={24}>
                {metrics.transitions.map((t, i) => (
                  <Cell key={i} fill={t.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default FunnelMetricsPanel;
