import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Copy, 
  ExternalLink, 
  Loader2, 
  Play, 
  RefreshCw, 
  Server,
  XCircle,
  Wifi,
  WifiOff,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

interface QueueStats {
  nina_pending: number;
  nina_processing: number;
  nina_failed: number;
  send_pending: number;
  send_processing: number;
  send_failed: number;
}

interface WebhookStats {
  total_posts_24h: number;
  total_gets_24h: number;
  last_post_at: string | null;
  last_message_from_user: string | null;
  errors_24h: number;
}

interface SubscriptionStatus {
  status: 'ok' | 'warning' | 'error' | 'unknown';
  waba_subscribed: boolean;
  subscribed_fields: string[];
  missing_fields: string[];
  message: string;
}

interface WebhookConfig {
  phone_number_id: string | null;
  verify_token: string | null;
  callback_url: string;
}

interface LastWebhookEvent {
  timestamp: string;
  type: string;
  from_number: string;
  is_test: boolean;
}

interface WebhookTestResult {
  success: boolean;
  message_id?: string;
  conversation_id?: string;
  queued_for_nina?: boolean;
  error?: string;
}

interface WebhookLog {
  id: string;
  created_at: string;
  method: string;
  event_type: string | null;
  response_status: number | null;
  is_meta_test: boolean;
  error_message: string | null;
  processing_time_ms: number | null;
}

export const WhatsAppDiagnosticPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [lastEvent, setLastEvent] = useState<LastWebhookEvent | null>(null);
  const [triggeringNina, setTriggeringNina] = useState(false);
  const [triggeringSender, setTriggeringSender] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [webhookStats, setWebhookStats] = useState<WebhookStats | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [fixingSubscription, setFixingSubscription] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Calculate 24h ago timestamp
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // Fetch queue stats
      const [ninaQueue, sendQueue, settings, recentMessages, webhookLogsResult, postsLast24h, getsLast24h, errorsLast24h, lastPost, lastUserMessage] = await Promise.all([
        supabase
          .from('nina_processing_queue')
          .select('status')
          .in('status', ['pending', 'processing', 'failed']),
        supabase
          .from('message_processing_queue')
          .select('status')
          .in('status', ['pending', 'processing', 'failed']),
        supabase
          .from('nina_settings')
          .select('whatsapp_phone_number_id, whatsapp_verify_token')
          .maybeSingle(),
        supabase
          .from('messages')
          .select('created_at, from_type, metadata, conversation_id')
          .eq('from_type', 'user')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('webhook_request_logs')
          .select('id, created_at, method, event_type, response_status, is_meta_test, error_message, processing_time_ms')
          .order('created_at', { ascending: false })
          .limit(20),
        // Count POSTs in last 24h
        supabase
          .from('webhook_request_logs')
          .select('id', { count: 'exact', head: true })
          .eq('method', 'POST')
          .gte('created_at', twentyFourHoursAgo),
        // Count GETs in last 24h
        supabase
          .from('webhook_request_logs')
          .select('id', { count: 'exact', head: true })
          .eq('method', 'GET')
          .gte('created_at', twentyFourHoursAgo),
        // Count errors in last 24h
        supabase
          .from('webhook_request_logs')
          .select('id', { count: 'exact', head: true })
          .not('error_message', 'is', null)
          .gte('created_at', twentyFourHoursAgo),
        // Last POST received
        supabase
          .from('webhook_request_logs')
          .select('created_at')
          .eq('method', 'POST')
          .order('created_at', { ascending: false })
          .limit(1),
        // Last user message received
        supabase
          .from('messages')
          .select('created_at')
          .eq('from_type', 'user')
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      // Set webhook stats
      setWebhookStats({
        total_posts_24h: postsLast24h.count || 0,
        total_gets_24h: getsLast24h.count || 0,
        errors_24h: errorsLast24h.count || 0,
        last_post_at: lastPost.data?.[0]?.created_at || null,
        last_message_from_user: lastUserMessage.data?.[0]?.created_at || null
      });

      // Calculate queue counts
      const ninaStats = {
        pending: ninaQueue.data?.filter(q => q.status === 'pending').length || 0,
        processing: ninaQueue.data?.filter(q => q.status === 'processing').length || 0,
        failed: ninaQueue.data?.filter(q => q.status === 'failed').length || 0,
      };

      const sendStats = {
        pending: sendQueue.data?.filter(q => q.status === 'pending').length || 0,
        processing: sendQueue.data?.filter(q => q.status === 'processing').length || 0,
        failed: sendQueue.data?.filter(q => q.status === 'failed').length || 0,
      };

      setQueueStats({
        nina_pending: ninaStats.pending,
        nina_processing: ninaStats.processing,
        nina_failed: ninaStats.failed,
        send_pending: sendStats.pending,
        send_processing: sendStats.processing,
        send_failed: sendStats.failed,
      });

      // Set config
      const projectId = 'bbllbsbcogngjfrhhggq';
      setConfig({
        phone_number_id: settings.data?.whatsapp_phone_number_id || null,
        verify_token: settings.data?.whatsapp_verify_token || null,
        callback_url: `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook`
      });

      // Set last event from recent messages
      if (recentMessages.data && recentMessages.data.length > 0) {
        const msg = recentMessages.data[0];
        setLastEvent({
          timestamp: msg.created_at,
          type: 'message',
          from_number: 'cliente',
          is_test: false
        });
      }

      // Set webhook logs
      if (webhookLogsResult.data) {
        setWebhookLogs(webhookLogsResult.data as WebhookLog[]);
      }

    } catch (error) {
      console.error('Error fetching diagnostic data:', error);
      toast.error('Erro ao carregar diagnóstico');
    } finally {
      setLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook-health', {
        body: { check_subscription: true }
      });
      
      if (error) throw error;
      
      if (data?.checks?.subscription) {
        const sub = data.checks.subscription;
        setSubscriptionStatus({
          status: sub.status,
          waba_subscribed: sub.waba_subscribed || false,
          subscribed_fields: sub.subscribed_fields || [],
          missing_fields: sub.missing_fields || [],
          message: sub.message || 'Status desconhecido'
        });
      }
      
      setHealthStatus(data?.status === 'healthy' ? 'ok' : 'error');
      toast.success('Verificação de assinatura concluída');
    } catch (error) {
      console.error('Error checking subscription:', error);
      toast.error('Erro ao verificar assinatura');
      setSubscriptionStatus({
        status: 'error',
        waba_subscribed: false,
        subscribed_fields: [],
        missing_fields: ['messages'],
        message: 'Erro ao verificar assinatura'
      });
    } finally {
      setCheckingSubscription(false);
    }
  };

  const fixWebhookSubscription = async () => {
    setFixingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-subscribe-webhook', {
        body: {}
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(data.message || 'Inscrição do webhook corrigida!');
        // Refresh subscription status after fix
        setTimeout(checkSubscriptionStatus, 2000);
      } else {
        toast.error(data?.error || 'Falha ao corrigir inscrição');
        if (data?.instructions) {
          console.log('Instructions:', data.instructions);
        }
      }
    } catch (error) {
      console.error('Error fixing subscription:', error);
      toast.error('Erro ao corrigir inscrição do webhook');
    } finally {
      setFixingSubscription(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const triggerNinaOrchestrator = async () => {
    setTriggeringNina(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-nina-orchestrator', {
        body: { source: 'diagnostic_panel' }
      });
      if (error) throw error;
      toast.success('Nina Orchestrator disparado com sucesso');
      setTimeout(fetchData, 2000);
    } catch (error) {
      console.error('Error triggering nina:', error);
      toast.error('Erro ao disparar processamento');
    } finally {
      setTriggeringNina(false);
    }
  };

  const triggerWhatsAppSender = async () => {
    setTriggeringSender(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-whatsapp-sender', {
        body: { source: 'diagnostic_panel' }
      });
      if (error) throw error;
      toast.success('WhatsApp Sender disparado com sucesso');
      setTimeout(fetchData, 2000);
    } catch (error) {
      console.error('Error triggering sender:', error);
      toast.error('Erro ao disparar envio');
    } finally {
      setTriggeringSender(false);
    }
  };

  const checkWebhookHealth = async () => {
    setCheckingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook-health', {
        body: {}
      });
      if (error) throw error;
      setHealthStatus(data?.healthy ? 'ok' : 'error');
      toast.success('Health check concluído');
    } catch (error) {
      console.error('Error checking health:', error);
      setHealthStatus('error');
      toast.error('Erro no health check');
    } finally {
      setCheckingHealth(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const simulateWebhook = async () => {
    setTestingWebhook(true);
    setTestResult(null);
    try {
      const testPhone = '5511999999999';
      const testMessage = `Teste de webhook - ${new Date().toLocaleString('pt-BR')}`;
      
      const { data, error } = await supabase.functions.invoke('simulate-webhook', {
        body: { 
          phone: testPhone, 
          name: 'Teste Diagnóstico',
          message: testMessage 
        }
      });
      
      if (error) throw error;
      
      setTestResult({
        success: data?.success ?? true,
        message_id: data?.message_id,
        conversation_id: data?.conversation_id,
        queued_for_nina: data?.queued_for_nina
      });
      toast.success('Webhook simulado com sucesso!');
      setTimeout(fetchData, 2000);
    } catch (error: any) {
      console.error('Error simulating webhook:', error);
      toast.error('Erro ao simular webhook');
      setTestResult({ success: false, error: error.message });
    } finally {
      setTestingWebhook(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Diagnóstico WhatsApp</h3>
          <p className="text-sm text-slate-400">Status do webhook e filas de processamento</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* CRITICAL: Webhook Receiving Monitor */}
      <Card className={cn(
        "border-2",
        webhookStats?.total_posts_24h === 0 
          ? "bg-red-500/10 border-red-500/50" 
          : "bg-emerald-500/10 border-emerald-500/30"
      )}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {webhookStats?.total_posts_24h === 0 ? (
              <XCircle className="w-5 h-5 text-red-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            )}
            Monitor de Recebimento (Últimas 24h)
          </CardTitle>
          <CardDescription>
            {webhookStats?.total_posts_24h === 0 
              ? '⚠️ Nenhum POST do WhatsApp nas últimas 24h - verifique a configuração no Meta' 
              : 'Webhook está recebendo mensagens do WhatsApp'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className={cn(
                "text-3xl font-bold",
                webhookStats?.total_posts_24h === 0 ? "text-red-400" : "text-emerald-400"
              )}>
                {webhookStats?.total_posts_24h || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">POSTs (mensagens)</div>
            </div>
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className="text-3xl font-bold text-blue-400">
                {webhookStats?.total_gets_24h || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">GETs (verificação)</div>
            </div>
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className={cn(
                "text-3xl font-bold",
                (webhookStats?.errors_24h || 0) > 0 ? "text-red-400" : "text-slate-400"
              )}>
                {webhookStats?.errors_24h || 0}
              </div>
              <div className="text-xs text-slate-400 mt-1">Erros</div>
            </div>
            <div className="text-center p-3 bg-slate-800/50 rounded-lg">
              <div className="text-xs text-slate-300">
                {webhookStats?.last_post_at 
                  ? formatDistanceToNow(new Date(webhookStats.last_post_at), { addSuffix: true, locale: ptBR })
                  : 'Nunca'}
              </div>
              <div className="text-xs text-slate-400 mt-1">Último POST</div>
            </div>
          </div>
          
          {webhookStats?.total_posts_24h === 0 && (
            <div className="mt-4 p-3 bg-red-500/20 rounded-lg border border-red-500/30">
              <h4 className="font-medium text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Problema Detectado: Webhook não está recebendo mensagens
              </h4>
              <p className="text-sm text-red-200/80 mt-2">
                O WhatsApp <strong>não está enviando</strong> webhooks para este endpoint. Isso indica um problema na configuração do Meta Business Suite, não no sistema.
              </p>
              <div className="mt-3 space-y-2 text-sm text-red-200/70">
                <p>✅ Verifique se o webhook está configurado no número/WABA correto</p>
                <p>✅ Confirme que o campo <code className="bg-red-900/50 px-1 rounded">messages</code> está inscrito</p>
                <p>✅ Verifique se o app está em modo <strong>Live</strong></p>
                <p>✅ Teste enviando mensagem de um número externo (não do próprio WhatsApp Business)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription Status Check */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-violet-400" />
              Verificação de Assinatura do Webhook
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={checkSubscriptionStatus}
              disabled={checkingSubscription}
              className="gap-2"
            >
              {checkingSubscription ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Activity className="w-4 h-4" />
              )}
              Verificar Assinatura
            </Button>
          </CardTitle>
          <CardDescription>
            Verifica se o WABA está inscrito no webhook e quais campos estão ativos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptionStatus ? (
            <div className={cn(
              "p-3 rounded-lg border",
              subscriptionStatus.status === 'ok' && "bg-emerald-500/10 border-emerald-500/30",
              subscriptionStatus.status === 'warning' && "bg-amber-500/10 border-amber-500/30",
              subscriptionStatus.status === 'error' && "bg-red-500/10 border-red-500/30",
              subscriptionStatus.status === 'unknown' && "bg-slate-800 border-slate-700"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {subscriptionStatus.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {subscriptionStatus.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                {subscriptionStatus.status === 'error' && <XCircle className="w-4 h-4 text-red-400" />}
                <span className={cn(
                  "font-medium",
                  subscriptionStatus.status === 'ok' && "text-emerald-400",
                  subscriptionStatus.status === 'warning' && "text-amber-400",
                  subscriptionStatus.status === 'error' && "text-red-400"
                )}>
                  {subscriptionStatus.message}
                </span>
              </div>
              
              {subscriptionStatus.subscribed_fields.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-slate-400">Campos inscritos: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {subscriptionStatus.subscribed_fields.map(field => (
                      <Badge key={field} variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              {subscriptionStatus.missing_fields.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-red-400">Campos faltando: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {subscriptionStatus.missing_fields.map(field => (
                      <Badge key={field} variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                        {field}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Fix Subscription Button */}
                  <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-amber-300">⚠️ Ação Necessária</h4>
                        <p className="text-xs text-amber-200/70 mt-1">
                          O campo "messages" não está inscrito. Clique para corrigir automaticamente ou configure manualmente no Meta Business Suite.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fixWebhookSubscription}
                        disabled={fixingSubscription}
                        className="gap-2 bg-amber-500/20 border-amber-500/50 hover:bg-amber-500/30 text-amber-200 shrink-0"
                      >
                        {fixingSubscription ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                        Corrigir Agora
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Clique em "Verificar Assinatura" para checar a configuração do webhook no Meta.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Webhook Configuration */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            Configuração do Webhook
          </CardTitle>
          <CardDescription>
            Certifique-se de que estes valores estão configurados no Meta Business Suite
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Callback URL */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wide">Callback URL</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-slate-800 px-3 py-2 rounded text-sm text-cyan-300 font-mono overflow-x-auto">
                {config?.callback_url}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(config?.callback_url || '', 'URL')}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Verify Token */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wide">Verify Token</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-slate-800 px-3 py-2 rounded text-sm text-emerald-300 font-mono overflow-x-auto">
                {config?.verify_token || 'Não configurado'}
              </code>
              {config?.verify_token && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(config.verify_token!, 'Token')}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Phone Number ID */}
          <div>
            <label className="text-xs text-slate-400 uppercase tracking-wide">Phone Number ID</label>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 bg-slate-800 px-3 py-2 rounded text-sm text-amber-300 font-mono">
                {config?.phone_number_id || 'Não configurado'}
              </code>
            </div>
          </div>

          {/* Webhook Health Check */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-700">
            <div className="flex items-center gap-2">
              {healthStatus === 'ok' ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : healthStatus === 'error' ? (
                <WifiOff className="w-5 h-5 text-red-400" />
              ) : (
                <Activity className="w-5 h-5 text-slate-400" />
              )}
              <span className="text-sm text-slate-300">
                Status: {healthStatus === 'ok' ? 'Online' : healthStatus === 'error' ? 'Erro' : 'Desconhecido'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={checkWebhookHealth}
              disabled={checkingHealth}
              className="gap-2"
            >
              {checkingHealth ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
              <Activity className="w-4 h-4" />
              )}
              Testar Conexão
            </Button>
          </div>

          {/* Simulate Webhook Test */}
          <div className="flex flex-col gap-3 pt-4 border-t border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm text-slate-300">Teste de Processamento</span>
                <span className="text-xs text-slate-500">
                  Simula uma mensagem de cliente para testar o pipeline completo
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={simulateWebhook}
                disabled={testingWebhook}
                className="gap-2"
              >
                {testingWebhook ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Simular Mensagem
              </Button>
            </div>
            
            {testResult && (
              <div className={cn(
                "p-3 rounded-lg text-sm",
                testResult.success 
                  ? "bg-emerald-500/10 border border-emerald-500/30" 
                  : "bg-red-500/10 border border-red-500/30"
              )}>
                {testResult.success ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Pipeline funcionando!
                    </div>
                    <div className="text-xs text-slate-400 space-y-0.5">
                      <p>Conversa: {testResult.conversation_id?.slice(0, 8)}...</p>
                      <p>Mensagem: {testResult.message_id?.slice(0, 8)}...</p>
                      <p>Na fila Nina: {testResult.queued_for_nina ? 'Sim' : 'Não'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400">
                    <XCircle className="w-4 h-4" />
                    Erro no processamento: {testResult.error || 'Desconhecido'}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Important Configuration Alert */}
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-300">Verificação Importante</h4>
              <p className="text-sm text-amber-200/80 mt-1">
                No <strong>Meta Business Suite → WhatsApp → Configuration → Webhooks</strong>, verifique:
              </p>
              <ul className="text-sm text-amber-200/80 mt-2 space-y-1 list-disc list-inside">
                <li>Campo <code className="bg-amber-900/50 px-1 rounded">messages</code> está inscrito (Subscribe)</li>
                <li>O webhook está configurado para o WABA/número correto</li>
                <li>O aplicativo está em modo <strong>Live</strong> (não Development)</li>
                <li>Permissão <code className="bg-amber-900/50 px-1 rounded">whatsapp_business_messaging</code> está ativa</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Webhook Event */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Última Mensagem Recebida
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastEvent ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {lastEvent.is_test ? (
                  <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                    Teste Meta
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    Cliente Real
                  </Badge>
                )}
                <span className="text-sm text-slate-300">
                  {formatDistanceToNow(new Date(lastEvent.timestamp), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {format(new Date(lastEvent.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma mensagem de cliente recebida ainda</p>
          )}
        </CardContent>
      </Card>

      {/* Queue Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nina Processing Queue */}
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Server className="w-4 h-4 text-violet-400" />
                Fila Nina (Processamento)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerNinaOrchestrator}
                disabled={triggeringNina}
                className="gap-2"
              >
                {triggeringNina ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Executar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {queueStats?.nina_pending || 0}
                </div>
                <div className="text-xs text-slate-400">Pendentes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {queueStats?.nina_processing || 0}
                </div>
                <div className="text-xs text-slate-400">Processando</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {queueStats?.nina_failed || 0}
                </div>
                <div className="text-xs text-slate-400">Erros</div>
              </div>
            </div>
            {(queueStats?.nina_pending || 0) > 0 && (
              <div className="mt-4 p-2 bg-amber-500/10 rounded border border-amber-500/20">
                <p className="text-xs text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-3 h-3" />
                  {queueStats?.nina_pending} mensagem(ns) aguardando processamento
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Message Send Queue */}
        <Card className="bg-slate-900/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                Fila de Envio
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={triggerWhatsAppSender}
                disabled={triggeringSender}
                className="gap-2"
              >
                {triggeringSender ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                Executar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {queueStats?.send_pending || 0}
                </div>
                <div className="text-xs text-slate-400">Pendentes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">
                  {queueStats?.send_processing || 0}
                </div>
                <div className="text-xs text-slate-400">Enviando</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {queueStats?.send_failed || 0}
                </div>
                <div className="text-xs text-slate-400">Erros</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Request Logs */}
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            Requisições Recebidas do Webhook
          </CardTitle>
          <CardDescription>
            Últimas 20 requisições recebidas no endpoint do webhook
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhookLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Hora</TableHead>
                    <TableHead className="text-slate-400">Método</TableHead>
                    <TableHead className="text-slate-400">Tipo</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Tempo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhookLogs.map((log) => (
                    <TableRow key={log.id} className="border-slate-700">
                      <TableCell className="text-xs text-slate-300">
                        {format(new Date(log.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.method}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs",
                            log.event_type === 'message' && !log.is_meta_test && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                            log.event_type === 'message' && log.is_meta_test && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                            log.event_type === 'status' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                            log.event_type === 'verification' && "bg-violet-500/20 text-violet-400 border-violet-500/30",
                            log.error_message && "bg-red-500/20 text-red-400 border-red-500/30"
                          )}
                        >
                          {log.is_meta_test && log.event_type === 'message' ? 'teste' : (log.event_type || 'unknown')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-xs font-mono",
                          log.response_status === 200 && "text-emerald-400",
                          log.response_status !== 200 && "text-red-400"
                        )}>
                          {log.response_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {log.processing_time_ms ? `${log.processing_time_ms}ms` : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhuma requisição recebida ainda.</p>
              <p className="text-xs text-slate-500 mt-1">
                Isso pode significar que o Meta não está enviando webhooks.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* External Link */}
      <div className="flex justify-end">
        <a
          href="https://business.facebook.com/settings/whatsapp-business-accounts"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          Abrir Meta Business Suite
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default WhatsAppDiagnosticPanel;
