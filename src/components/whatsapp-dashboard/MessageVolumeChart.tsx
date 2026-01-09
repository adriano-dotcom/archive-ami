import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MessageVolumeData {
  date: string;
  sent: number;
  received: number;
}

interface MessageVolumeChartProps {
  data: MessageVolumeData[];
  isLoading?: boolean;
}

export function MessageVolumeChart({ data, isLoading }: MessageVolumeChartProps) {
  if (isLoading) {
    return (
      <div className="h-[300px] animate-pulse rounded-lg bg-muted/20" />
    );
  }

  const formattedData = data.map(item => ({
    ...item,
    dateFormatted: format(new Date(item.date), 'dd/MM', { locale: ptBR }),
  }));

  return (
    <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Volume de Mensagens</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData}>
            <defs>
              <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="dateFormatted"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
            />
            <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              formatter={(value) => (
                <span className="text-sm text-muted-foreground">
                  {value === 'sent' ? 'Enviadas' : 'Recebidas'}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="sent"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#sentGradient)"
              name="sent"
            />
            <Area
              type="monotone"
              dataKey="received"
              stroke="#06b6d4"
              strokeWidth={2}
              fill="url(#receivedGradient)"
              name="received"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
