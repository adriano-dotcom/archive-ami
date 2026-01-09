import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface DeliveryRateData {
  type: string;
  total: number;
  delivered: number;
  delivery_rate: number;
}

interface DeliveryRateChartProps {
  data: DeliveryRateData[];
  isLoading?: boolean;
}

const typeLabels: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  audio: 'Áudio',
  document: 'Documento',
  video: 'Vídeo',
  sticker: 'Sticker',
  template: 'Template',
};

const getBarColor = (rate: number) => {
  if (rate >= 95) return '#22c55e';
  if (rate >= 85) return '#eab308';
  return '#ef4444';
};

export function DeliveryRateChart({ data, isLoading }: DeliveryRateChartProps) {
  if (isLoading) {
    return (
      <div className="h-[300px] animate-pulse rounded-lg bg-muted/20" />
    );
  }

  const formattedData = data.map(item => ({
    ...item,
    typeLabel: typeLabels[item.type] || item.type,
    delivery_rate: Number(item.delivery_rate) || 0,
  }));

  return (
    <div className="rounded-xl border border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5 p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Taxa de Entrega por Tipo</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={formattedData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis
              type="number"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="typeLabel"
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f8fafc',
              }}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)}%`,
                'Taxa de Entrega',
              ]}
              labelFormatter={(label) => `Tipo: ${label}`}
            />
            <Bar dataKey="delivery_rate" radius={[0, 4, 4, 0]}>
              {formattedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.delivery_rate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
