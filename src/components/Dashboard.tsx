import React, { useEffect, useState } from 'react';
import { Activity, DollarSign, MessageSquare, Users, Loader2, TrendingUp, TrendingDown, ArrowUpRight, Bot, Phone, Briefcase, Layers, Zap, MessageCircle, Clock, PhoneCall, PhoneOff, PhoneMissed, Timer, Mail, Send, CheckCircle, XCircle } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from 'recharts';
import { StatMetric } from '../types';
import { api } from '../services/api';
import { supabase } from '@/integrations/supabase/client';

type PeriodFilter = 'today' | '7days' | '30days';

const periodLabels: Record<PeriodFilter, string> = {
  today: 'Hoje',
  '7days': '7 Dias',
  '30days': '30 Dias'
};

const periodDays: Record<PeriodFilter, number> = {
  today: 1,
  '7days': 7,
  '30days': 30
};

interface SystemMetrics {
  totalMessages: number;
  aiMessages: number;
  clientMessages: number;
  avgResponseTime: number;
  totalContacts: number;
  totalConversations: number;
  totalCalls: number;
  totalAgents: number;
  activeAutomations: number;
  approvedTemplates: number;
  integrations: {
    whatsapp: boolean;
    elevenlabs: boolean;
    resend: boolean;
    api4com: boolean;
    pipedrive: boolean;
  };
  systemStartDate: string | null;
}


interface CallMetrics {
  totalCalls: number;
  completedCalls: number;
  noAnswerCalls: number;
  failedCalls: number;
  totalDuration: number;
  avgDuration: number;
  completionRate: number;
}

interface SellerCallData {
  extension: string;
  sellerName: string | null;
  total: number;
  completed: number;
  noAnswer: number;
  failed: number;
  avgDuration: number;
  completionRate: number;
}

interface DailyCallData {
  date: string;
  total: number;
  completed: number;
}

interface CollectionEmailMetrics {
  totalSent: number;
  successful: number;
  failed: number;
  byDay: { date: string; sent: number; failed: number }[];
}

interface CollectionWhatsAppMetrics {
  totalSent: number;
  delivered: number;
  failed: number;
  byTemplate: { template: string; count: number }[];
  byDay: { date: string; sent: number; failed: number; cost: number }[];
}

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<StatMetric[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  
  const [callMetrics, setCallMetrics] = useState<CallMetrics | null>(null);
  const [sellerCallData, setSellerCallData] = useState<SellerCallData[]>([]);
  const [dailyCallData, setDailyCallData] = useState<DailyCallData[]>([]);
  const [collectionEmailMetrics, setCollectionEmailMetrics] = useState<CollectionEmailMetrics | null>(null);
  const [collectionWhatsAppMetrics, setCollectionWhatsAppMetrics] = useState<CollectionWhatsAppMetrics | null>(null);
  const [costPerMessage, setCostPerMessage] = useState<number>(0.41);

  const fetchSystemMetrics = async () => {
    try {
      const [
        { count: totalMessages },
        { count: aiMessages },
        { count: clientMessages },
        { data: avgTimeData },
        { count: totalContacts },
        { count: totalConversations },
        { count: totalCalls },
        { count: totalAgents },
        { count: activeAutomations },
        { count: approvedTemplates },
        { data: settingsData },
        { data: firstConversation }
      ] = await Promise.all([
        supabase.from('messages').select('*', { count: 'exact', head: true }),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('from_type', 'nina'),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('from_type', 'user'),
        supabase.from('messages').select('nina_response_time').not('nina_response_time', 'is', null),
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase.from('call_logs').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('followup_automations').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('whatsapp_templates').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED'),
        supabase.from('nina_settings').select('whatsapp_phone_number_id, elevenlabs_api_key, api4com_enabled, pipedrive_enabled, elevenlabs_key_in_vault, api4com_token_in_vault, pipedrive_token_in_vault').limit(1).maybeSingle(),
        supabase.from('conversations').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle()
      ]);

      const avgResponseTime = avgTimeData && avgTimeData.length > 0
        ? Number((avgTimeData.reduce((sum, m) => sum + (m.nina_response_time || 0), 0) / avgTimeData.length / 1000).toFixed(1))
        : 0;

      setSystemMetrics({
        totalMessages: totalMessages || 0,
        aiMessages: aiMessages || 0,
        clientMessages: clientMessages || 0,
        avgResponseTime,
        totalContacts: totalContacts || 0,
        totalConversations: totalConversations || 0,
        totalCalls: totalCalls || 0,
        totalAgents: totalAgents || 0,
        activeAutomations: activeAutomations || 0,
        approvedTemplates: approvedTemplates || 0,
        integrations: {
          whatsapp: !!settingsData?.whatsapp_phone_number_id,
          elevenlabs: !!settingsData?.elevenlabs_api_key || !!settingsData?.elevenlabs_key_in_vault,
          resend: true,
          api4com: !!settingsData?.api4com_enabled || !!settingsData?.api4com_token_in_vault,
          pipedrive: !!settingsData?.pipedrive_enabled || !!settingsData?.pipedrive_token_in_vault
        },
        systemStartDate: firstConversation?.created_at || null
      });
    } catch (error) {
      console.error('Erro ao carregar métricas do sistema:', error);
    }
  };


  const fetchCollectionEmailMetrics = async () => {
    try {
      const days = periodDays[period];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: emailLogs } = await supabase
        .from('collection_email_logs')
        .select('id, status, sent_at')
        .gte('sent_at', startDate);

      if (!emailLogs || emailLogs.length === 0) {
        setCollectionEmailMetrics(null);
        return;
      }

      const totalSent = emailLogs.length;
      const successful = emailLogs.filter(e => e.status === 'sent').length;
      const failed = emailLogs.filter(e => e.status === 'failed').length;

      // Group by day for chart
      const byDay: Record<string, { sent: number; failed: number }> = {};
      emailLogs.forEach(log => {
        if (!log.sent_at) return;
        const date = new Date(log.sent_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (!byDay[date]) byDay[date] = { sent: 0, failed: 0 };
        if (log.status === 'sent') byDay[date].sent++;
        else if (log.status === 'failed') byDay[date].failed++;
      });

      const chartData = Object.entries(byDay)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => {
          const [dayA, monthA] = a.date.split('/').map(Number);
          const [dayB, monthB] = b.date.split('/').map(Number);
          return monthA !== monthB ? monthA - monthB : dayA - dayB;
        });

      setCollectionEmailMetrics({ totalSent, successful, failed, byDay: chartData });
    } catch (error) {
      console.error('Erro ao carregar métricas de emails de cobrança:', error);
    }
  };

  const fetchCollectionWhatsAppMetrics = async () => {
    try {
      const days = periodDays[period];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data: attempts } = await supabase
        .from('collection_attempts')
        .select('id, status, sent_at, template_name')
        .eq('channel', 'whatsapp')
        .gte('sent_at', startDate);

      if (!attempts || attempts.length === 0) {
        setCollectionWhatsAppMetrics({
          totalSent: 0,
          delivered: 0,
          failed: 0,
          byTemplate: [],
          byDay: []
        });
        return;
      }

      const totalSent = attempts.length;
      const delivered = attempts.filter(a => a.status === 'delivered' || a.status === 'sent').length;
      const failed = attempts.filter(a => a.status === 'failed').length;

      // Group by template
      const byTemplateMap: Record<string, number> = {};
      attempts.forEach(a => {
        const template = a.template_name || 'Sem nome';
        byTemplateMap[template] = (byTemplateMap[template] || 0) + 1;
      });
      const byTemplate = Object.entries(byTemplateMap)
        .map(([template, count]) => ({ template, count }))
        .sort((a, b) => b.count - a.count);

      // Group by day with cost calculation
      const byDayMap: Record<string, { sent: number; failed: number; cost: number }> = {};
      attempts.forEach(a => {
        if (!a.sent_at) return;
        const date = new Date(a.sent_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (!byDayMap[date]) byDayMap[date] = { sent: 0, failed: 0, cost: 0 };
        if (a.status === 'failed') {
          byDayMap[date].failed++;
        } else {
          byDayMap[date].sent++;
          byDayMap[date].cost += costPerMessage;
        }
      });

      const byDay = Object.entries(byDayMap)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => {
          const [dayA, monthA] = a.date.split('/').map(Number);
          const [dayB, monthB] = b.date.split('/').map(Number);
          return monthA !== monthB ? monthA - monthB : dayA - dayB;
        });

      setCollectionWhatsAppMetrics({ totalSent, delivered, failed, byTemplate, byDay });
    } catch (error) {
      console.error('Erro ao carregar métricas de WhatsApp de cobrança:', error);
    }
  };

  const fetchCallMetrics = async () => {
    try {
      const days = periodDays[period];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      // Fetch all call logs in period
      const { data: callLogs } = await supabase
        .from('call_logs')
        .select('extension, status, duration_seconds, started_at')
        .gte('started_at', startDate);

      if (!callLogs || callLogs.length === 0) {
        setCallMetrics(null);
        setSellerCallData([]);
        setDailyCallData([]);
        return;
      }

      // Fetch team members to map extensions to names
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('name, api4com_extension');

      const extensionToName: Record<string, string> = {};
      teamMembers?.forEach(member => {
        if (member.api4com_extension) {
          extensionToName[member.api4com_extension] = member.name;
        }
      });

      // Calculate general metrics
      const totalCalls = callLogs.length;
      const completedCalls = callLogs.filter(c => c.status === 'completed').length;
      const noAnswerCalls = callLogs.filter(c => c.status === 'no_answer').length;
      const failedCalls = callLogs.filter(c => ['failed', 'timeout'].includes(c.status)).length;
      const totalDuration = callLogs.reduce((sum, c) => sum + (c.duration_seconds || 0), 0);
      const avgDuration = completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0;
      const completionRate = totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0;

      setCallMetrics({
        totalCalls,
        completedCalls,
        noAnswerCalls,
        failedCalls,
        totalDuration,
        avgDuration,
        completionRate
      });

      // Group by extension (seller)
      const byExtension: Record<string, { total: number; completed: number; noAnswer: number; failed: number; duration: number }> = {};
      callLogs.forEach(call => {
        const ext = call.extension || 'unknown';
        if (!byExtension[ext]) {
          byExtension[ext] = { total: 0, completed: 0, noAnswer: 0, failed: 0, duration: 0 };
        }
        byExtension[ext].total++;
        if (call.status === 'completed') {
          byExtension[ext].completed++;
          byExtension[ext].duration += call.duration_seconds || 0;
        }
        if (call.status === 'no_answer') byExtension[ext].noAnswer++;
        if (['failed', 'timeout'].includes(call.status)) byExtension[ext].failed++;
      });

      const sellerData: SellerCallData[] = Object.entries(byExtension)
        .map(([extension, data]) => ({
          extension,
          sellerName: extensionToName[extension] || null,
          total: data.total,
          completed: data.completed,
          noAnswer: data.noAnswer,
          failed: data.failed,
          avgDuration: data.completed > 0 ? Math.round(data.duration / data.completed) : 0,
          completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
        }))
        .sort((a, b) => b.total - a.total);

      setSellerCallData(sellerData);

      // Group by day for chart
      const byDay: Record<string, { total: number; completed: number }> = {};
      callLogs.forEach(call => {
        const date = new Date(call.started_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (!byDay[date]) byDay[date] = { total: 0, completed: 0 };
        byDay[date].total++;
        if (call.status === 'completed') byDay[date].completed++;
      });

      const dailyData = Object.entries(byDay)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => {
          const [dayA, monthA] = a.date.split('/').map(Number);
          const [dayB, monthB] = b.date.split('/').map(Number);
          return monthA !== monthB ? monthA - monthB : dayA - dayB;
        });

      setDailyCallData(dailyData);
    } catch (error) {
      console.error('Erro ao carregar métricas de ligações:', error);
    }
  };

  const fetchMessageCost = async () => {
    const { data } = await supabase
      .from('nina_settings')
      .select('message_cost_per_unit')
      .maybeSingle();
    
    if (data?.message_cost_per_unit !== null && data?.message_cost_per_unit !== undefined) {
      setCostPerMessage(Number(data.message_cost_per_unit));
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const days = periodDays[period];
        const [metricsData, chartDataResponse] = await Promise.all([
          api.fetchDashboardMetrics(days),
          api.fetchChartData(days),
          fetchSystemMetrics(),
          fetchCallMetrics(),
          fetchCollectionEmailMetrics(),
          fetchCollectionWhatsAppMetrics(),
          fetchMessageCost()
        ]);
        setMetrics(metricsData);
        setChartData(chartDataResponse);
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [period]);

  const getIcon = (label: string) => {
    if (label.includes('Conversões')) return <DollarSign className="h-5 w-5 text-emerald-400" />;
    if (label.includes('Atendimentos')) return <MessageSquare className="h-5 w-5 text-cyan-400" />;
    if (label.includes('Leads')) return <Users className="h-5 w-5 text-violet-400" />;
    return <Activity className="h-5 w-5 text-orange-400" />;
  };

  const getGradient = (label: string) => {
    if (label.includes('Conversões')) return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20';
    if (label.includes('Atendimentos')) return 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20';
    if (label.includes('Leads')) return 'from-violet-500/20 to-violet-500/5 border-violet-500/20';
    return 'from-orange-500/20 to-orange-500/5 border-orange-500/20';
  };

  const getMetricLabel = (baseLabel: string) => {
    if (baseLabel.includes('Atendimentos')) {
      return period === 'today' ? 'Atendimentos Hoje' : `Atendimentos (${periodLabels[period]})`;
    }
    if (baseLabel.includes('Leads')) {
      return period === 'today' ? 'Novos Leads' : `Novos Leads (${periodLabels[period]})`;
    }
    return baseLabel;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
             <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full"></div>
             <Loader2 className="h-10 w-10 animate-spin text-cyan-400 relative z-10" />
          </div>
          <p className="text-sm text-slate-400 font-medium animate-pulse">Carregando insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full bg-slate-950 text-slate-50 custom-scrollbar">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          <p className="text-slate-400 mt-1">
            Visão geral da performance da sua IA {period === 'today' ? 'hoje' : `nos últimos ${periodLabels[period].toLowerCase()}`}.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(['today', '7days', '30days'] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((stat, index) => (
          <div 
            key={index} 
            className={`relative overflow-hidden rounded-2xl border bg-slate-900/50 backdrop-blur-sm p-6 shadow-xl transition-all duration-300 hover:translate-y-[-2px] hover:bg-slate-900 group ${getGradient(stat.label)}`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="text-sm font-medium text-slate-400">{getMetricLabel(stat.label)}</div>
              <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 group-hover:border-slate-600 transition-colors">
                 {getIcon(stat.label)}
              </div>
            </div>
            <div className="flex items-end justify-between">
                <div className="text-3xl font-bold text-white tracking-tight">{stat.value}</div>
                <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stat.trendUp ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {stat.trendUp ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {stat.trend}
                </div>
            </div>
            {/* Decorative Glow */}
            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-white/5 blur-2xl rounded-full group-hover:bg-white/10 transition-all"></div>
          </div>
        ))}
      </div>

      {/* WhatsApp Template Cost Card */}
      {collectionWhatsAppMetrics && (
        <div className="relative overflow-hidden rounded-2xl border border-green-500/30 bg-gradient-to-br from-green-900/40 via-emerald-900/30 to-slate-900 p-6 shadow-xl">
          {/* Decorative background */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl"></div>
          
          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <MessageCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">WhatsApp Templates</h3>
                  <p className="text-xs text-green-400/80">Custo Meta Business</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-400">
                  R$ {(collectionWhatsAppMetrics.totalSent * costPerMessage).toFixed(2).replace('.', ',')}
                </p>
                <p className="text-xs text-slate-400">custo total</p>
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-2xl font-bold text-white">{collectionWhatsAppMetrics.totalSent}</p>
                <p className="text-xs text-slate-400">Enviados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-2xl font-bold text-emerald-400">{collectionWhatsAppMetrics.delivered}</p>
                <p className="text-xs text-slate-400">Entregues</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-2xl font-bold text-white">
                  {collectionWhatsAppMetrics.totalSent > 0 
                    ? Math.round((collectionWhatsAppMetrics.delivered / collectionWhatsAppMetrics.totalSent) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-slate-400">Taxa Entrega</p>
              </div>
            </div>
            
            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700/50">
              <span className="text-xs text-slate-500">
                Custo unitário: R$ {costPerMessage.toFixed(2).replace('.', ',')}
              </span>
              {collectionWhatsAppMetrics.failed > 0 && (
                <span className="text-xs text-rose-400">
                  {collectionWhatsAppMetrics.failed} falha(s)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-7">
        {/* Main Chart */}
        <div className="col-span-4 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <div>
                <h3 className="text-lg font-semibold text-white">Volume de Atendimentos</h3>
                <p className="text-sm text-slate-400">
                  Interações da IA {period === 'today' ? 'hoje' : `nos últimos ${periodDays[period]} dias`}
                </p>
            </div>
            <button className="text-cyan-400 hover:text-cyan-300 transition-colors p-2 hover:bg-cyan-950/30 rounded-lg">
                <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tickMargin={10} 
                    fontSize={12} 
                    stroke="#64748b"
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12} 
                    stroke="#64748b"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} 
                  itemStyle={{ color: '#06b6d4' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="chats" 
                  stroke="#06b6d4" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorChats)" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>


      {/* Seller Calls Section */}
      {callMetrics && callMetrics.totalCalls > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-700/50 to-transparent"></div>
            <h3 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
              <PhoneCall className="w-5 h-5 text-amber-400" />
              Ligações dos Vendedores
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-700/50 to-transparent"></div>
          </div>

          {/* Call KPI Cards */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-slate-400">Total Ligações</span>
              </div>
              <p className="text-2xl font-bold text-white">{callMetrics.totalCalls}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <PhoneCall className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">Completadas</span>
              </div>
              <p className="text-2xl font-bold text-white">{callMetrics.completedCalls}</p>
              <p className="text-xs text-emerald-400/80 mt-1">{callMetrics.completionRate}% sucesso</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-rose-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <PhoneMissed className="w-4 h-4 text-rose-400" />
                <span className="text-xs text-slate-400">Não Atendidas</span>
              </div>
              <p className="text-2xl font-bold text-white">{callMetrics.noAnswerCalls}</p>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-cyan-400" />
                <span className="text-xs text-slate-400">Duração Média</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {callMetrics.avgDuration >= 60 
                  ? `${Math.floor(callMetrics.avgDuration / 60)}m${callMetrics.avgDuration % 60}s`
                  : `${callMetrics.avgDuration}s`
                }
              </p>
            </div>
          </div>

          {/* Seller Performance Table and Chart */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Performance Table */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
              <h4 className="text-sm font-medium text-amber-400 uppercase tracking-wider mb-4">Performance por Vendedor</h4>
              <div className="space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
                {sellerCallData.map((seller) => (
                  <div key={seller.extension} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-amber-500/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-sm font-medium text-white">
                          {seller.sellerName || `Ramal ${seller.extension}`}
                        </span>
                        {seller.sellerName && (
                          <span className="ml-2 text-xs text-slate-500">({seller.extension})</span>
                        )}
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 font-medium">
                        {seller.total} ligações
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <PhoneCall className="w-3 h-3 text-emerald-400" />
                        {seller.completed} ok
                      </span>
                      <span className="flex items-center gap-1">
                        <PhoneMissed className="w-3 h-3 text-rose-400" />
                        {seller.noAnswer} s/atend
                      </span>
                      <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3 text-cyan-400" />
                        {seller.avgDuration}s média
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                        style={{ width: `${seller.completionRate}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-xs text-amber-400/80">{seller.completionRate}% sucesso</div>
                  </div>
                ))}
                {sellerCallData.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-4">Nenhuma ligação no período</p>
                )}
              </div>
            </div>

            {/* Daily Calls Chart */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
              <h4 className="text-sm font-medium text-amber-400 uppercase tracking-wider mb-4">Evolução de Ligações</h4>
              <div className="flex items-center gap-4 text-xs mb-4">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                  Total
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  Completadas
                </span>
              </div>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyCallData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tickMargin={10} 
                      fontSize={12} 
                      stroke="#64748b"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={12} 
                      stroke="#64748b"
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
                      labelStyle={{ color: '#94a3b8', marginBottom: '8px' }}
                    />
                    <Bar dataKey="total" name="Total" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completadas" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collection Emails Section */}
      {collectionEmailMetrics && collectionEmailMetrics.totalSent > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-700/50 to-transparent"></div>
            <h3 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" />
              Emails de Cobrança
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-700/50 to-transparent"></div>
          </div>

          {/* Email KPI Cards */}
          <div className="grid gap-4 grid-cols-3">
            <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Send className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-slate-400">Total Enviados</span>
              </div>
              <p className="text-2xl font-bold text-white">{collectionEmailMetrics.totalSent}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">Sucesso</span>
              </div>
              <p className="text-2xl font-bold text-white">{collectionEmailMetrics.successful}</p>
              <p className="text-xs text-emerald-400/80 mt-1">
                {collectionEmailMetrics.totalSent > 0 
                  ? Math.round((collectionEmailMetrics.successful / collectionEmailMetrics.totalSent) * 100)
                  : 0}% taxa
              </p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-rose-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-xs text-slate-400">Falhas</span>
              </div>
              <p className="text-2xl font-bold text-white">{collectionEmailMetrics.failed}</p>
            </div>
          </div>

          {/* Daily Email Chart */}
          {collectionEmailMetrics.byDay.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
              <h4 className="text-sm font-medium text-blue-400 uppercase tracking-wider mb-4">Emails por Dia</h4>
              <div className="flex items-center gap-4 text-xs mb-4">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  Enviados
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  Falhas
                </span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={collectionEmailMetrics.byDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tickMargin={10} 
                      fontSize={12} 
                      stroke="#64748b"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={12} 
                      stroke="#64748b"
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
                      labelStyle={{ color: '#94a3b8', marginBottom: '8px' }}
                    />
                    <Bar dataKey="sent" name="Enviados" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" name="Falhas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp de Cobrança Section */}
      {collectionWhatsAppMetrics && collectionWhatsAppMetrics.totalSent > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-green-700/50 to-transparent"></div>
            <h3 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-400" />
              WhatsApp de Cobrança
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-green-700/50 to-transparent"></div>
          </div>

          {/* WhatsApp KPI Cards */}
          <div className="grid gap-4 grid-cols-3">
            <div className="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Send className="w-4 h-4 text-green-400" />
                <span className="text-xs text-slate-400">Total Enviados</span>
              </div>
              <p className="text-2xl font-bold text-white">{collectionWhatsAppMetrics.totalSent}</p>
              <p className="text-sm font-medium text-green-400 mt-1">
                R$ {(collectionWhatsAppMetrics.totalSent * costPerMessage).toFixed(2).replace('.', ',')}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400">Entregues</span>
              </div>
              <p className="text-2xl font-bold text-white">{collectionWhatsAppMetrics.delivered}</p>
              <p className="text-xs text-emerald-400/80 mt-1">
                {collectionWhatsAppMetrics.totalSent > 0 
                  ? Math.round((collectionWhatsAppMetrics.delivered / collectionWhatsAppMetrics.totalSent) * 100)
                  : 0}% taxa
              </p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 to-rose-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-xs text-slate-400">Falhas</span>
              </div>
              <p className="text-2xl font-bold text-white">{collectionWhatsAppMetrics.failed}</p>
            </div>
          </div>

          {/* Templates Mais Usados */}
          {collectionWhatsAppMetrics.byTemplate.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
              <h4 className="text-sm font-medium text-green-400 uppercase tracking-wider mb-4">Templates Mais Usados</h4>
              <div className="space-y-2">
                {collectionWhatsAppMetrics.byTemplate.slice(0, 5).map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                    <span className="text-sm text-slate-300 truncate">{t.template}</span>
                    <span className="text-sm font-medium text-green-400">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily WhatsApp Chart */}
          {collectionWhatsAppMetrics.byDay.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
              <h4 className="text-sm font-medium text-green-400 uppercase tracking-wider mb-4">WhatsApp por Dia</h4>
              <div className="flex items-center gap-4 text-xs mb-4">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  Enviados
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  Falhas
                </span>
              </div>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={collectionWhatsAppMetrics.byDay} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tickMargin={10} 
                      fontSize={12} 
                      stroke="#64748b"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={12} 
                      stroke="#64748b"
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }}
                      labelStyle={{ color: '#94a3b8', marginBottom: '8px' }}
                    />
                    <Bar dataKey="sent" name="Enviados" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="failed" name="Falhas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Cost Evolution Chart */}
          {collectionWhatsAppMetrics.byDay.length > 1 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-medium text-green-400 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Evolução de Custos WhatsApp Template
                </h4>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total no Período</p>
                  <p className="text-lg font-bold text-green-400">
                    R$ {(collectionWhatsAppMetrics.totalSent * costPerMessage).toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={collectionWhatsAppMetrics.byDay} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tickMargin={10} 
                      fontSize={12} 
                      stroke="#64748b"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      fontSize={12} 
                      stroke="#64748b"
                      tickFormatter={(value) => `R$${value.toFixed(0)}`}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`R$ ${value.toFixed(2).replace('.', ',')}`, 'Custo']}
                      contentStyle={{ 
                        backgroundColor: '#0f172a', 
                        borderRadius: '12px', 
                        border: '1px solid #1e293b', 
                        color: '#f8fafc',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                      }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="cost" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      fill="url(#costGradient)" 
                      name="Custo"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* System Metrics Section */}
      {systemMetrics && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
            <h3 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Métricas do Sistema
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
          </div>

          {/* Communication Metrics */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-cyan-400 uppercase tracking-wider">Comunicação</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Mensagens</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalMessages}</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Respostas IA</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.aiMessages}</p>
                <p className="text-xs text-cyan-400/80 mt-1">
                  {systemMetrics.totalMessages > 0 ? Math.round((systemMetrics.aiMessages / systemMetrics.totalMessages) * 100) : 0}% do total
                </p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Contatos</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalContacts}</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Tempo IA</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.avgResponseTime}s</p>
              </div>
            </div>
          </div>

          {/* Operations Metrics */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-violet-400 uppercase tracking-wider">Operações</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Contatos</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalContacts}</p>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Conversas</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalConversations}</p>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Chamadas</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalCalls}</p>
              </div>
            </div>
          </div>

          {/* Infrastructure Metrics */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-emerald-400 uppercase tracking-wider">Infraestrutura</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Agentes IA</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalAgents}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Automações</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.activeAutomations}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Templates</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.approvedTemplates}</p>
              </div>
            </div>
          </div>

          {/* Active Integrations */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-rose-400 uppercase tracking-wider">Integrações Ativas</h4>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex flex-wrap gap-3">
                {[
                  { name: 'WhatsApp', active: systemMetrics.integrations.whatsapp },
                  { name: 'ElevenLabs', active: systemMetrics.integrations.elevenlabs },
                  { name: 'Resend', active: systemMetrics.integrations.resend },
                  { name: 'API4Com', active: systemMetrics.integrations.api4com },
                  { name: 'Pipedrive', active: systemMetrics.integrations.pipedrive }
                ].map((integration) => (
                  <div
                    key={integration.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      integration.active
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-800/50 border-slate-700 text-slate-500'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${integration.active ? 'bg-emerald-400' : 'bg-slate-600'}`}></div>
                    <span className="text-sm font-medium">{integration.name}</span>
                  </div>
                ))}
              </div>
              {systemMetrics.systemStartDate && (
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <p className="text-xs text-slate-500">
                    Sistema iniciado em: {new Date(systemMetrics.systemStartDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;