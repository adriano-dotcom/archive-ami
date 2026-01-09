import { useState, useEffect, useCallback } from 'react';
import { Send, MessageCircle, CheckCheck, XCircle, RefreshCw, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  WhatsAppKPICard,
  MessageVolumeChart,
  ConnectionStatusCard,
  DeliveryRateChart,
  RecentErrorsList,
  SendQueueTable,
} from './whatsapp-dashboard';

interface MessageMetrics {
  sent: number;
  received: number;
  delivered: number;
  read: number;
  failed: number;
  prevSent: number;
  prevFailed: number;
}

interface DailyVolume {
  date: string;
  sent: number;
  received: number;
}

interface DeliveryByType {
  type: string;
  total: number;
  delivered: number;
  delivery_rate: number;
}

interface QueueItem {
  id: string;
  contact_name: string | null;
  message_type: string;
  status: string;
  created_at: string;
  error_message: string | null;
}

interface ErrorItem {
  id: string;
  created_at: string;
  error_message: string;
  contact_name?: string;
}

type PeriodOption = '1' | '7' | '30';

export default function WhatsAppDashboard() {
  const [period, setPeriod] = useState<PeriodOption>('7');
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [metrics, setMetrics] = useState<MessageMetrics>({
    sent: 0,
    received: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    prevSent: 0,
    prevFailed: 0,
  });
  const [dailyVolume, setDailyVolume] = useState<DailyVolume[]>([]);
  const [deliveryByType, setDeliveryByType] = useState<DeliveryByType[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [recentErrors, setRecentErrors] = useState<ErrorItem[]>([]);

  const fetchMetrics = useCallback(async () => {
    const days = parseInt(period);
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);

    // Current period metrics
    const { data: currentData } = await supabase
      .from('messages')
      .select('from_type, status')
      .gte('created_at', startDate.toISOString());

    // Previous period metrics
    const { data: prevData } = await supabase
      .from('messages')
      .select('from_type, status')
      .gte('created_at', prevStartDate.toISOString())
      .lt('created_at', startDate.toISOString());

    const current = currentData || [];
    const prev = prevData || [];

    setMetrics({
      sent: current.filter((m) => m.from_type === 'nina').length,
      received: current.filter((m) => m.from_type === 'user').length,
      delivered: current.filter((m) => m.status === 'delivered' || m.status === 'read').length,
      read: current.filter((m) => m.status === 'read').length,
      failed: current.filter((m) => m.status === 'failed').length,
      prevSent: prev.filter((m) => m.from_type === 'nina').length,
      prevFailed: prev.filter((m) => m.status === 'failed').length,
    });
  }, [period]);

  const fetchDailyVolume = useCallback(async () => {
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data } = await supabase
      .from('messages')
      .select('created_at, from_type')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (!data) return;

    // Group by date
    const volumeMap = new Map<string, { sent: number; received: number }>();

    data.forEach((msg) => {
      const date = msg.created_at.split('T')[0];
      const existing = volumeMap.get(date) || { sent: 0, received: 0 };

      if (msg.from_type === 'nina') {
        existing.sent += 1;
      } else {
        existing.received += 1;
      }

      volumeMap.set(date, existing);
    });

    const volumeArray: DailyVolume[] = Array.from(volumeMap.entries()).map(
      ([date, counts]) => ({
        date,
        sent: counts.sent,
        received: counts.received,
      })
    );

    setDailyVolume(volumeArray);
  }, [period]);

  const fetchDeliveryByType = useCallback(async () => {
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data } = await supabase
      .from('messages')
      .select('type, status')
      .eq('from_type', 'nina')
      .gte('created_at', startDate.toISOString());

    if (!data) return;

    // Group by type
    const typeMap = new Map<string, { total: number; delivered: number }>();

    data.forEach((msg) => {
      const existing = typeMap.get(msg.type) || { total: 0, delivered: 0 };
      existing.total += 1;
      if (msg.status === 'delivered' || msg.status === 'read') {
        existing.delivered += 1;
      }
      typeMap.set(msg.type, existing);
    });

    const typeArray: DeliveryByType[] = Array.from(typeMap.entries()).map(
      ([type, counts]) => ({
        type,
        total: counts.total,
        delivered: counts.delivered,
        delivery_rate: counts.total > 0 ? (counts.delivered / counts.total) * 100 : 0,
      })
    );

    setDeliveryByType(typeArray.sort((a, b) => b.total - a.total));
  }, [period]);

  const fetchQueueItems = useCallback(async () => {
    const { data } = await supabase
      .from('send_queue')
      .select('id, message_type, status, created_at, error_message, contact_id')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      // Fetch contact names separately
      const contactIds = [...new Set(data.map(item => item.contact_id).filter(Boolean))];
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds);

      const contactMap = new Map(contacts?.map(c => [c.id, c.name]) || []);

      setQueueItems(
        data.map((item) => ({
          id: item.id,
          contact_name: item.contact_id ? contactMap.get(item.contact_id) || null : null,
          message_type: item.message_type,
          status: item.status,
          created_at: item.created_at,
          error_message: item.error_message,
        }))
      );
    }
  }, []);

  const fetchRecentErrors = useCallback(async () => {
    const { data } = await supabase
      .from('send_queue')
      .select('id, created_at, error_message, contact_id')
      .eq('status', 'failed')
      .not('error_message', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      // Fetch contact names separately
      const contactIds = [...new Set(data.map(item => item.contact_id).filter(Boolean))];
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .in('id', contactIds);

      const contactMap = new Map(contacts?.map(c => [c.id, c.name]) || []);

      setRecentErrors(
        data.map((item) => ({
          id: item.id,
          created_at: item.created_at,
          error_message: item.error_message || 'Erro desconhecido',
          contact_name: item.contact_id ? contactMap.get(item.contact_id) || undefined : undefined,
        }))
      );
    } else {
      setRecentErrors([]);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        fetchMetrics(),
        fetchDailyVolume(),
        fetchDeliveryByType(),
        fetchQueueItems(),
        fetchRecentErrors(),
      ]);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  }, [fetchMetrics, fetchDailyVolume, fetchDeliveryByType, fetchQueueItems, fetchRecentErrors]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllData();
    setIsRefreshing(false);
    toast.success('Dados atualizados');
  };

  // Initial fetch and period change
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Realtime subscription for send_queue
  useEffect(() => {
    const channel = supabase
      .channel('send-queue-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'send_queue' },
        () => {
          fetchQueueItems();
          fetchRecentErrors();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchQueueItems, fetchRecentErrors]);

  // Calculate derived metrics
  const deliveryRate = metrics.sent > 0 ? ((metrics.delivered / metrics.sent) * 100).toFixed(1) : '0';
  const sentTrend = metrics.prevSent > 0 ? ((metrics.sent - metrics.prevSent) / metrics.prevSent) * 100 : 0;
  const failedTrend = metrics.prevFailed > 0 ? ((metrics.failed - metrics.prevFailed) / metrics.prevFailed) * 100 : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/20">
            <MessageCircle className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">WhatsApp Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Última atualização: {lastRefresh.toLocaleTimeString('pt-BR')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="w-[140px] gap-2">
              <Calendar className="h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <WhatsAppKPICard
              title="Mensagens Enviadas"
              value={metrics.sent}
              icon={Send}
              trend={{ value: sentTrend, isPositive: sentTrend >= 0 }}
              variant="success"
            />
            <WhatsAppKPICard
              title="Mensagens Recebidas"
              value={metrics.received}
              icon={MessageCircle}
              variant="default"
            />
            <WhatsAppKPICard
              title="Taxa de Entrega"
              value={`${deliveryRate}%`}
              icon={CheckCheck}
              subtitle={`${metrics.delivered} entregues de ${metrics.sent}`}
              variant="success"
            />
            <WhatsAppKPICard
              title="Erros"
              value={metrics.failed}
              icon={XCircle}
              trend={{ value: failedTrend, isPositive: failedTrend <= 0 }}
              variant={metrics.failed > 0 ? 'error' : 'success'}
            />
          </div>

          {/* Charts Row */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <MessageVolumeChart data={dailyVolume} isLoading={isLoading} />
            </div>
            <ConnectionStatusCard />
          </div>

          {/* Second Row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <DeliveryRateChart data={deliveryByType} isLoading={isLoading} />
            <RecentErrorsList errors={recentErrors} isLoading={isLoading} />
          </div>

          {/* Queue Table */}
          <SendQueueTable items={queueItems} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
