import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Send, MessageSquare, CheckCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AutomationMetrics {
  totalSent: number;
  responseRate: number;
  conversionRate: number;
  avgResponseTime: number;
  sentTrend: number;
  responseTrend: number;
  conversionTrend: number;
  timeTrend: number;
}

interface TemplatePerformance {
  name: string;
  sent: number;
  responded: number;
  converted: number;
  responseRate: number;
}

interface AutomationPerformance {
  id: string;
  name: string;
  sent: number;
  responded: number;
  converted: number;
  responseRate: number;
  conversionRate: number;
  isActive: boolean;
}

interface TimelineData {
  date: string;
  label: string;
  sent: number;
  responded: number;
}

export default function AutomationsDashboard() {
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [templatePerformance, setTemplatePerformance] = useState<TemplatePerformance[]>([]);
  const [automationPerformance, setAutomationPerformance] = useState<AutomationPerformance[]>([]);
  const [timeline, setTimeline] = useState<TimelineData[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [period]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const periodStart = subDays(new Date(), days);
      const periodStartStr = periodStart.toISOString();
      
      // Previous period for comparison
      const prevPeriodStart = subDays(new Date(), days * 2);
      const prevPeriodStartStr = prevPeriodStart.toISOString();

      // Fetch logs for current and previous period
      const [currentLogsRes, prevLogsRes, automationsRes] = await Promise.all([
        supabase
          .from('followup_logs')
          .select('*, conversations(id, contact_id)')
          .gte('created_at', periodStartStr),
        supabase
          .from('followup_logs')
          .select('id, status, template_name')
          .gte('created_at', prevPeriodStartStr)
          .lt('created_at', periodStartStr),
        supabase
          .from('followup_automations')
          .select('id, name, is_active')
      ]);

      if (currentLogsRes.error) throw currentLogsRes.error;
      if (prevLogsRes.error) throw prevLogsRes.error;
      if (automationsRes.error) throw automationsRes.error;

      const currentLogs = currentLogsRes.data || [];
      const prevLogs = prevLogsRes.data || [];
      const automations = automationsRes.data || [];

      // Calculate response rate for each log
      const logsWithResponse = await Promise.all(
        currentLogs.map(async (log) => {
          const { data: responseMsg } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', log.conversation_id)
            .eq('from_type', 'user')
            .gt('sent_at', log.created_at)
            .limit(1);

          const hasResponse = (responseMsg?.length || 0) > 0;

          // Conversão baseada em agendamentos ao invés de deals
          const { data: appointment } = await supabase
            .from('appointments')
            .select('id')
            .eq('contact_id', log.contact_id)
            .gt('created_at', log.created_at)
            .limit(1);

          const hasConversion = (appointment?.length || 0) > 0;

          // Get response time if responded
          let responseTime = null;
          if (hasResponse && responseMsg && responseMsg.length > 0) {
            const { data: firstResponse } = await supabase
              .from('messages')
              .select('sent_at')
              .eq('conversation_id', log.conversation_id)
              .eq('from_type', 'user')
              .gt('sent_at', log.created_at)
              .order('sent_at', { ascending: true })
              .limit(1);

            if (firstResponse && firstResponse.length > 0) {
              const logTime = new Date(log.created_at).getTime();
              const responseTimeMs = new Date(firstResponse[0].sent_at).getTime();
              responseTime = (responseTimeMs - logTime) / (1000 * 60 * 60); // hours
            }
          }

          return { ...log, hasResponse, hasConversion, responseTime };
        })
      );

      // Calculate metrics
      const successLogs = logsWithResponse.filter(l => l.status === 'sent');
      const totalSent = successLogs.length;
      const responded = successLogs.filter(l => l.hasResponse).length;
      const converted = successLogs.filter(l => l.hasConversion).length;
      const responseTimes = successLogs.filter(l => l.responseTime !== null).map(l => l.responseTime as number);
      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      // Previous period metrics
      const prevTotal = prevLogs.filter(l => l.status === 'sent').length;

      // Calculate trends
      const sentTrend = prevTotal > 0 ? ((totalSent - prevTotal) / prevTotal) * 100 : 0;

      setMetrics({
        totalSent,
        responseRate: totalSent > 0 ? (responded / totalSent) * 100 : 0,
        conversionRate: totalSent > 0 ? (converted / totalSent) * 100 : 0,
        avgResponseTime,
        sentTrend,
        responseTrend: 0, // Simplified for performance
        conversionTrend: 0,
        timeTrend: 0
      });

      // Group by template
      const templateMap = new Map<string, { sent: number; responded: number; converted: number }>();
      successLogs.forEach(log => {
        const name = log.template_name || 'Sem template';
        const current = templateMap.get(name) || { sent: 0, responded: 0, converted: 0 };
        current.sent++;
        if (log.hasResponse) current.responded++;
        if (log.hasConversion) current.converted++;
        templateMap.set(name, current);
      });

      const templatePerf = Array.from(templateMap.entries()).map(([name, data]) => ({
        name: name.length > 20 ? name.substring(0, 20) + '...' : name,
        sent: data.sent,
        responded: data.responded,
        converted: data.converted,
        responseRate: data.sent > 0 ? (data.responded / data.sent) * 100 : 0
      })).sort((a, b) => b.sent - a.sent);

      setTemplatePerformance(templatePerf);

      // Group by automation
      const automationMap = new Map<string, { sent: number; responded: number; converted: number }>();
      successLogs.forEach(log => {
        const id = log.automation_id || 'unknown';
        const current = automationMap.get(id) || { sent: 0, responded: 0, converted: 0 };
        current.sent++;
        if (log.hasResponse) current.responded++;
        if (log.hasConversion) current.converted++;
        automationMap.set(id, current);
      });

      const automationPerf = automations.map(auto => {
        const data = automationMap.get(auto.id) || { sent: 0, responded: 0, converted: 0 };
        return {
          id: auto.id,
          name: auto.name,
          sent: data.sent,
          responded: data.responded,
          converted: data.converted,
          responseRate: data.sent > 0 ? (data.responded / data.sent) * 100 : 0,
          conversionRate: data.sent > 0 ? (data.converted / data.sent) * 100 : 0,
          isActive: auto.is_active
        };
      }).filter(a => a.sent > 0 || a.isActive);

      setAutomationPerformance(automationPerf);

      // Build timeline
      const timelineMap = new Map<string, { sent: number; responded: number }>();
      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        timelineMap.set(dateStr, { sent: 0, responded: 0 });
      }

      successLogs.forEach(log => {
        const dateStr = format(parseISO(log.created_at), 'yyyy-MM-dd');
        const current = timelineMap.get(dateStr);
        if (current) {
          current.sent++;
          if (log.hasResponse) current.responded++;
        }
      });

      const timelineData = Array.from(timelineMap.entries()).map(([date, data]) => ({
        date,
        label: format(parseISO(date), 'dd/MM', { locale: ptBR }),
        sent: data.sent,
        responded: data.responded
      }));

      setTimeline(timelineData);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  const TrendIndicator = ({ value }: { value: number }) => {
    if (Math.abs(value) < 1) return <span className="text-muted-foreground text-xs">-</span>;
    const isPositive = value > 0;
    return (
      <span className={`flex items-center text-xs ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
        {isPositive ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
        {isPositive ? '+' : ''}{value.toFixed(0)}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Dashboard de Automações</h3>
          <p className="text-sm text-muted-foreground">
            Métricas de performance dos follow-ups automáticos
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Follow-ups Enviados</p>
                <p className="text-2xl font-bold">{metrics?.totalSent || 0}</p>
                <TrendIndicator value={metrics?.sentTrend || 0} />
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Send className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Resposta</p>
                <p className="text-2xl font-bold">{(metrics?.responseRate || 0).toFixed(1)}%</p>
                <TrendIndicator value={metrics?.responseTrend || 0} />
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                <p className="text-2xl font-bold">{(metrics?.conversionRate || 0).toFixed(1)}%</p>
                <TrendIndicator value={metrics?.conversionTrend || 0} />
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio Resposta</p>
                <p className="text-2xl font-bold">{formatHours(metrics?.avgResponseTime || 0)}</p>
                <TrendIndicator value={metrics?.timeTrend || 0} />
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Template Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance por Template</CardTitle>
          </CardHeader>
          <CardContent>
            {templatePerformance.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Nenhum dado no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={templatePerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'sent' ? 'Enviados' : name === 'responded' ? 'Responderam' : 'Converteram'
                    ]}
                  />
                  <Bar dataKey="sent" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline de Envios</CardTitle>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Nenhum dado no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'sent' ? 'Enviados' : 'Responderam'
                    ]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sent" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary))" 
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="responded" 
                    stroke="hsl(var(--chart-2))" 
                    fill="hsl(var(--chart-2))" 
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Automation Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance por Automação</CardTitle>
        </CardHeader>
        <CardContent>
          {automationPerformance.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhuma automação com dados no período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Automação</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Enviados</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Responderam</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Taxa Resposta</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Conversões</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Taxa Conversão</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {automationPerformance.map(auto => (
                    <tr key={auto.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{auto.name}</td>
                      <td className="py-3 px-2 text-center">{auto.sent}</td>
                      <td className="py-3 px-2 text-center">{auto.responded}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={auto.responseRate >= 50 ? 'text-green-500' : auto.responseRate >= 25 ? 'text-yellow-500' : 'text-red-500'}>
                          {auto.responseRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">{auto.converted}</td>
                      <td className="py-3 px-2 text-center">
                        <span className={auto.conversionRate >= 10 ? 'text-green-500' : auto.conversionRate >= 5 ? 'text-yellow-500' : 'text-muted-foreground'}>
                          {auto.conversionRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                          auto.isActive ? 'bg-green-500/20 text-green-500' : 'bg-muted text-muted-foreground'
                        }`}>
                          {auto.isActive ? '🟢' : '⚪'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
