import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Lightbulb,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  Users,
  Mail,
  Building2,
  Phone,
  MessageSquare,
  UserCheck,
  UserX,
  FileText,
  Sparkles
} from 'lucide-react';
import LearningInsightsCard from './LearningInsightsCard';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface StrengthItem {
  title: string;
  description: string;
  example?: string;
}

interface ImprovementItem {
  title: string;
  description: string;
  example?: string;
  suggestion?: string;
}

interface ActionItem {
  priority: number;
  action: string;
  impact: string;
  category?: string;
}

interface ExampleItem {
  conversation_id?: string;
  excerpt: string;
  why_good?: string;
  why_bad?: string;
  better_response?: string;
}

interface ProspectingMetrics {
  templates_sent: number;
  responses_received: number;
  positive_responses: number;
  rejections: number;
  response_rate: number;
  rejection_rate: number;
  positive_rate: number;
  conversion_rate: number;
  deals_qualified: number;
  deals_in_qualification: number;
  deals_lost: number;
}

interface CoachingReport {
  id: string;
  agent_id: string | null;
  pipeline_id: string | null;
  pipeline_name: string | null;
  report_type: string;
  analysis_period_start: string;
  analysis_period_end: string;
  conversations_analyzed: number;
  calls_analyzed: number;
  human_interactions_analyzed: number;
  strengths: StrengthItem[];
  improvement_areas: ImprovementItem[];
  recommended_actions: ActionItem[];
  prompt_suggestions: string | null;
  good_examples: ExampleItem[];
  bad_examples: ExampleItem[];
  overall_score: number | null;
  qualification_effectiveness: number | null;
  objection_handling_score: number | null;
  closing_skills_score: number | null;
  is_applied: boolean;
  alert_sent: boolean;
  created_at: string;
  prospecting_metrics: ProspectingMetrics | null;
}

interface Agent {
  id: string;
  name: string;
  specialty: string | null;
}

interface Pipeline {
  id: string;
  name: string;
  icon: string | null;
  agent_id: string | null;
}

export default function SalesCoachingSettings() {
  const [reports, setReports] = useState<CoachingReport[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [reportType, setReportType] = useState<string>('daily');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('id, name, specialty')
      .eq('is_active', true);
    setAgents(data || []);
  };

  const fetchReports = async () => {
    setIsLoading(true);
    let query = supabase
      .from('sales_coaching_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (selectedAgent !== 'all') {
      query = query.eq('agent_id', selectedAgent);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar relatórios');
      console.error(error);
    } else {
      const typedReports = (data || []).map(r => ({
        ...r,
        strengths: (r.strengths || []) as unknown as StrengthItem[],
        improvement_areas: (r.improvement_areas || []) as unknown as ImprovementItem[],
        recommended_actions: (r.recommended_actions || []) as unknown as ActionItem[],
        good_examples: (r.good_examples || []) as unknown as ExampleItem[],
        bad_examples: (r.bad_examples || []) as unknown as ExampleItem[],
        prospecting_metrics: (r.prospecting_metrics || null) as unknown as ProspectingMetrics | null,
      }));
      setReports(typedReports);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, [selectedAgent]);

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const days = reportType === 'weekly' ? 7 : 1;
      const generateAll = selectedAgent === 'all';
      
      const { data, error } = await supabase.functions.invoke('sales-coaching-analysis', {
        body: {
          report_type: reportType,
          agent_id: selectedAgent === 'all' ? null : selectedAgent,
          days,
          generate_all: generateAll,
          send_alerts: true
        }
      });

      if (error) throw error;

      const reportsCount = data?.reports_count || 1;
      const alertsSent = data?.alerts_sent?.length || 0;
      
      let message = `${reportsCount} relatório(s) gerado(s) com sucesso!`;
      if (alertsSent > 0) {
        message += ` ${alertsSent} alerta(s) enviado(s) por email.`;
      }
      
      toast.success(message);
      fetchReports();
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setIsGenerating(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-slate-400';
    if (score >= 80) return 'text-emerald-400';
    if (score >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number | null) => {
    if (!score) return 'bg-slate-800/60';
    if (score >= 80) return 'bg-emerald-500/20';
    if (score >= 70) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  };

  const getScoreGlow = (score: number | null) => {
    if (!score) return '';
    if (score >= 80) return 'shadow-lg shadow-emerald-500/25';
    if (score >= 70) return 'shadow-lg shadow-amber-500/25';
    return 'shadow-lg shadow-red-500/25 animate-pulse';
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Todos';
    return agents.find(a => a.id === agentId)?.name || 'Desconhecido';
  };

  const ScoreCard = ({ label, score }: { label: string; score: number | null }) => (
    <div className={cn(
      "p-4 rounded-xl backdrop-blur-sm border border-slate-700/30 transition-all duration-300",
      getScoreBg(score),
      getScoreGlow(score)
    )}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={cn("text-3xl font-bold", getScoreColor(score))}>
        {score ?? '—'}
      </p>
    </div>
  );

  // Group reports by agent for summary view
  const latestReportsByAgent = agents.map(agent => {
    const agentReports = reports.filter(r => r.agent_id === agent.id);
    const latestReport = agentReports[0];
    return {
      agent,
      latestReport
    };
  }).filter(item => item.latestReport);

  return (
    <div className="space-y-6">
      {/* Header with glassmorphism */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/40 backdrop-blur-xl border border-slate-700/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30 shadow-lg shadow-violet-500/20">
            <Brain className="h-5 w-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              Gerente de Vendas IA
              <Sparkles className="h-4 w-4 text-violet-400" />
            </h3>
            <p className="text-sm text-slate-400">
              Análise automática de performance por agente e departamento
            </p>
          </div>
        </div>
      </div>

      {/* Learning Insights Card - Knowledge Base */}
      <LearningInsightsCard agents={agents} />

      {/* Agent/Department Summary Cards - iOS 18 Style */}
      {latestReportsByAgent.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {latestReportsByAgent.map(({ agent, latestReport }) => {
            const isAlert = latestReport.overall_score && latestReport.overall_score < 70;
            return (
              <Card 
                key={agent.id} 
                className={cn(
                  "relative overflow-hidden transition-all duration-300 glass-card-hover",
                  "bg-slate-900/60 backdrop-blur-xl border-slate-700/50",
                  "shadow-xl shadow-black/20",
                  isAlert && "ring-2 ring-red-500/40 shadow-red-500/10"
                )}
              >
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800/30 via-transparent to-slate-800/20 pointer-events-none" />
                
                <CardHeader className="pb-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                        <Brain className="h-5 w-5 text-cyan-400" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">{agent.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1 text-slate-400">
                          <Building2 className="h-3 w-3" />
                          {agent.specialty || 'Agente'}
                        </CardDescription>
                      </div>
                    </div>
                    <div className={cn(
                      "p-3 rounded-xl backdrop-blur-sm border border-slate-700/30 transition-all",
                      getScoreBg(latestReport.overall_score),
                      getScoreGlow(latestReport.overall_score)
                    )}>
                      <span className={cn("text-2xl font-bold", getScoreColor(latestReport.overall_score))}>
                        {latestReport.overall_score ?? '—'}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Qualificação', score: latestReport.qualification_effectiveness },
                      { label: 'Objeções', score: latestReport.objection_handling_score },
                      { label: 'Fechamento', score: latestReport.closing_skills_score },
                    ].map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-800/60 backdrop-blur-sm border border-slate-700/30">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wide">{item.label}</p>
                        <p className={cn("font-bold text-lg", getScoreColor(item.score))}>
                          {item.score ?? '—'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Prospecting Metrics for Atlas */}
                  {agent.specialty === 'prospeccao_ativa' && latestReport.prospecting_metrics && (
                    <div className="mt-3 pt-3 border-t border-slate-700/30">
                      <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                        <Phone className="h-3 w-3 text-cyan-400" />
                        Métricas de Prospecção
                      </p>
                      <div className="grid grid-cols-4 gap-1.5 text-center">
                        <div className="p-2 rounded-lg bg-slate-800/60 backdrop-blur-sm border border-slate-700/30">
                          <p className="text-[10px] text-slate-500">Templates</p>
                          <p className="font-bold text-sm text-white">{latestReport.prospecting_metrics.templates_sent}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30 shadow-lg shadow-blue-500/10">
                          <p className="text-[10px] text-blue-400">Respostas</p>
                          <p className="font-bold text-sm text-blue-400">
                            {latestReport.prospecting_metrics.response_rate.toFixed(0)}%
                          </p>
                        </div>
                        <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 shadow-lg shadow-red-500/10">
                          <p className="text-[10px] text-red-400">Rejeições</p>
                          <p className="font-bold text-sm text-red-400">
                            {latestReport.prospecting_metrics.rejection_rate.toFixed(0)}%
                          </p>
                        </div>
                        <div className={cn(
                          "p-2 rounded-lg border",
                          latestReport.prospecting_metrics.conversion_rate >= 15 
                            ? 'bg-emerald-500/15 border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                            : latestReport.prospecting_metrics.conversion_rate >= 10 
                            ? 'bg-amber-500/15 border-amber-500/30 shadow-lg shadow-amber-500/10' 
                            : 'bg-red-500/15 border-red-500/30 shadow-lg shadow-red-500/10'
                        )}>
                          <p className="text-[10px] text-slate-400">Conversão</p>
                          <p className={cn(
                            "font-bold text-sm",
                            latestReport.prospecting_metrics.conversion_rate >= 15 ? 'text-emerald-400' :
                            latestReport.prospecting_metrics.conversion_rate >= 10 ? 'text-amber-400' : 'text-red-400'
                          )}>
                            {latestReport.prospecting_metrics.conversion_rate.toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(latestReport.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                    {latestReport.alert_sent && (
                      <span className="flex items-center gap-1 text-red-400 bg-red-500/20 px-2 py-0.5 rounded-full">
                        <Mail className="h-3 w-3" />
                        Alerta enviado
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Generate Report Section - iOS 18 Style */}
      <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/90 backdrop-blur-xl border-slate-700/50 shadow-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5 pointer-events-none" />
        <CardHeader className="border-b border-slate-700/30 relative">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 shadow-lg shadow-cyan-500/20">
              <Brain className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">Gerar Novo Relatório</CardTitle>
              <CardDescription className="text-slate-400">
                Analise as conversas e ligações por agente/departamento
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 relative">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Agente</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[180px] bg-slate-800/80 border-slate-600 text-white hover:bg-slate-700/80 transition-colors">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-cyan-400" />
                      Todos os agentes
                    </span>
                  </SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id} className="text-white hover:bg-slate-700">
                      <span className="flex items-center gap-2">
                        {agent.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Período</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[180px] bg-slate-800/80 border-slate-600 text-white hover:bg-slate-700/80 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="daily" className="text-white hover:bg-slate-700">Últimas 24h</SelectItem>
                  <SelectItem value="weekly" className="text-white hover:bg-slate-700">Últimos 7 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={generateReport} 
              disabled={isGenerating}
              className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25 border-0 text-white font-medium"
            >
              {isGenerating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {isGenerating ? 'Analisando...' : selectedAgent === 'all' ? 'Gerar para Todos' : 'Gerar Análise'}
            </Button>
          </div>
          
          <p className="text-xs text-slate-500 mt-4 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            Relatórios com score abaixo de 70 enviam alerta automático por email
          </p>
        </CardContent>
      </Card>

      {/* Reports List - iOS 18 Style */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/30">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Relatórios Recentes
          </h4>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchReports} 
              disabled={isLoading}
              className="text-slate-400 hover:text-white hover:bg-slate-700/50"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {reports.length === 0 ? (
          <Card className="bg-slate-900/50 backdrop-blur-xl border-slate-700/50">
            <CardContent className="py-12 text-center">
              <div className="p-4 rounded-2xl bg-slate-800/60 w-fit mx-auto mb-4">
                <Brain className="h-12 w-12 text-slate-600" />
              </div>
              <p className="text-slate-400">Nenhum relatório gerado ainda</p>
              <p className="text-sm text-slate-500">Clique em "Gerar Análise" para começar</p>
            </CardContent>
          </Card>
        ) : (
          reports.map(report => (
            <Card 
              key={report.id} 
              className={cn(
                "overflow-hidden transition-all duration-300",
                "bg-slate-900/50 backdrop-blur-xl border-slate-700/40",
                "hover:bg-slate-800/60",
                report.alert_sent && "border-l-4 border-l-red-500"
              )}
            >
              <CardHeader 
                className="cursor-pointer hover:bg-slate-800/30 transition-colors"
                onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "p-3 rounded-xl backdrop-blur-sm border border-slate-700/30",
                      getScoreBg(report.overall_score),
                      getScoreGlow(report.overall_score)
                    )}>
                      <span className={cn("text-xl font-bold", getScoreColor(report.overall_score))}>
                        {report.overall_score ?? '—'}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap text-white">
                        <span className="flex items-center gap-1">
                          {getAgentName(report.agent_id)}
                        </span>
                        <span className="text-xs font-normal px-2 py-0.5 bg-slate-700/60 rounded-full text-slate-300">
                          {report.report_type === 'daily' ? 'Diário' : 'Semanal'}
                        </span>
                        <span className="text-xs font-normal text-slate-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(report.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        {report.alert_sent && (
                          <span className="text-xs font-normal text-red-400 flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            Alerta
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1 text-slate-500">
                        {report.pipeline_name && <span>{report.pipeline_name}</span>}
                        <span>{report.conversations_analyzed} conversas</span>
                        <span>{report.calls_analyzed} ligações</span>
                        <span>{report.human_interactions_analyzed} msg humanas</span>
                      </CardDescription>
                    </div>
                  </div>
                  {expandedReport === report.id ? (
                    <ChevronUp className="h-5 w-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-500" />
                  )}
                </div>
              </CardHeader>

              {expandedReport === report.id && (
                <CardContent className="border-t border-slate-700/30 space-y-6 pt-6">
                  {/* Scores Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ScoreCard label="Score Geral" score={report.overall_score} />
                    <ScoreCard label="Qualificação" score={report.qualification_effectiveness} />
                    <ScoreCard label="Objeções" score={report.objection_handling_score} />
                    <ScoreCard label="Fechamento" score={report.closing_skills_score} />
                  </div>

                  {/* Prospecting Funnel - Only for prospecting agents */}
                  {report.prospecting_metrics && report.prospecting_metrics.templates_sent > 0 && (
                    <div className="p-5 bg-slate-800/40 backdrop-blur-sm rounded-xl border border-slate-700/30">
                      <h5 className="font-medium flex items-center gap-2 mb-4 text-white">
                        <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
                          <Phone className="h-4 w-4 text-cyan-400" />
                        </div>
                        Funil de Prospecção
                      </h5>
                      
                      {/* Funnel Visualization */}
                      <div className="space-y-3">
                        {[
                          { label: 'Templates Enviados', value: report.prospecting_metrics.templates_sent, icon: MessageSquare, color: 'bg-slate-500', textColor: 'text-slate-300' },
                          { label: 'Respostas', value: report.prospecting_metrics.responses_received, icon: MessageSquare, color: 'bg-blue-500', textColor: 'text-blue-400', pct: report.prospecting_metrics.response_rate },
                          { label: 'Respostas Positivas', value: report.prospecting_metrics.positive_responses, icon: UserCheck, color: 'bg-green-500', textColor: 'text-green-400', pct: report.prospecting_metrics.positive_rate },
                          { label: 'Em Qualificação', value: report.prospecting_metrics.deals_in_qualification, icon: Target, color: 'bg-amber-500', textColor: 'text-amber-400' },
                          { label: 'Qualificados', value: report.prospecting_metrics.deals_qualified, icon: CheckCircle, color: 'bg-emerald-500', textColor: 'text-emerald-400', pct: report.prospecting_metrics.conversion_rate },
                        ].map((step, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <step.icon className={cn("h-4 w-4 shrink-0", step.textColor)} />
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1.5">
                                <span className="text-slate-300">{step.label}</span>
                                <span className="font-medium text-white">
                                  {step.value}
                                  {step.pct !== undefined && (
                                    <span className="text-slate-500 ml-1">({step.pct.toFixed(1)}%)</span>
                                  )}
                                </span>
                              </div>
                              <div className="h-2.5 bg-slate-700/50 rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full rounded-full transition-all", step.color)}
                                  style={{ 
                                    width: `${report.prospecting_metrics.templates_sent > 0 
                                      ? (step.value / report.prospecting_metrics.templates_sent) * 100 
                                      : 0}%` 
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* Rejections */}
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/30">
                          <UserX className="h-4 w-4 text-red-400 shrink-0" />
                          <div className="flex-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-red-400">Rejeições</span>
                              <span className="font-medium text-red-400">
                                {report.prospecting_metrics.rejections}
                                <span className="text-slate-500 ml-1">
                                  ({report.prospecting_metrics.rejection_rate.toFixed(1)}%)
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* KPI Summary */}
                      <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-700/30">
                        {[
                          { value: report.prospecting_metrics.response_rate, label: 'Taxa de Resposta', color: 'text-blue-400', glow: 'shadow-blue-500/20' },
                          { value: report.prospecting_metrics.conversion_rate, label: 'Taxa de Conversão', color: report.prospecting_metrics.conversion_rate >= 15 ? 'text-emerald-400' : report.prospecting_metrics.conversion_rate >= 10 ? 'text-amber-400' : 'text-red-400', glow: report.prospecting_metrics.conversion_rate >= 15 ? 'shadow-emerald-500/20' : report.prospecting_metrics.conversion_rate >= 10 ? 'shadow-amber-500/20' : 'shadow-red-500/20' },
                          { value: report.prospecting_metrics.rejection_rate, label: 'Taxa de Rejeição', color: 'text-red-400', glow: 'shadow-red-500/20' },
                        ].map((kpi, idx) => (
                          <div key={idx} className={cn("text-center p-3 rounded-xl bg-slate-800/60 shadow-lg", kpi.glow)}>
                            <p className={cn("text-2xl font-bold", kpi.color)}>
                              {kpi.value.toFixed(1)}%
                            </p>
                            <p className="text-xs text-slate-500">{kpi.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths */}
                  {report.strengths?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-emerald-400">
                        <TrendingUp className="h-4 w-4" />
                        Pontos Fortes
                      </h5>
                      <div className="space-y-2">
                        {report.strengths.map((s, i) => (
                          <div key={i} className="p-4 bg-emerald-500/10 backdrop-blur-sm rounded-xl border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                            <p className="font-medium text-sm text-emerald-300">{s.title}</p>
                            <p className="text-sm text-slate-400 mt-1">{s.description}</p>
                            {s.example && (
                              <p className="text-xs mt-2 italic text-slate-500">"{s.example}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Improvement Areas */}
                  {report.improvement_areas?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-amber-400">
                        <TrendingDown className="h-4 w-4" />
                        Áreas de Melhoria
                      </h5>
                      <div className="space-y-2">
                        {report.improvement_areas.map((area, i) => (
                          <div key={i} className="p-4 bg-amber-500/10 backdrop-blur-sm rounded-xl border border-amber-500/30 shadow-lg shadow-amber-500/10">
                            <p className="font-medium text-sm text-amber-300">{area.title}</p>
                            <p className="text-sm text-slate-400 mt-1">{area.description}</p>
                            {area.suggestion && (
                              <p className="text-xs mt-2 text-amber-400">
                                💡 Sugestão: {area.suggestion}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Actions */}
                  {report.recommended_actions?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-white">
                        <Target className="h-4 w-4 text-cyan-400" />
                        Ações Recomendadas
                      </h5>
                      <div className="space-y-2">
                        {report.recommended_actions
                          .sort((a, b) => a.priority - b.priority)
                          .map((action, i) => (
                            <div key={i} className="p-4 bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/30 flex items-start gap-3">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-xs font-bold",
                                action.priority === 1 ? 'bg-red-500/20 text-red-400 shadow-lg shadow-red-500/20' :
                                action.priority === 2 ? 'bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/20' :
                                'bg-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/20'
                              )}>
                                P{action.priority}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm text-white">{action.action}</p>
                                <p className="text-xs text-slate-500 mt-1">
                                  Impacto: {action.impact}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Prompt Suggestions */}
                  {report.prompt_suggestions && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-white">
                        <Lightbulb className="h-4 w-4 text-amber-400" />
                        Sugestões para o Prompt
                      </h5>
                      <div className="p-4 bg-gradient-to-br from-violet-500/10 to-purple-500/10 backdrop-blur-sm rounded-xl border border-violet-500/30 shadow-lg shadow-violet-500/10">
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{report.prompt_suggestions}</p>
                      </div>
                    </div>
                  )}

                  {/* Good Examples */}
                  {report.good_examples?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-emerald-400">
                        <CheckCircle className="h-4 w-4" />
                        Exemplos Positivos
                      </h5>
                      <div className="space-y-2">
                        {report.good_examples.map((ex, i) => (
                          <div key={i} className="p-4 bg-emerald-500/5 backdrop-blur-sm rounded-xl border border-emerald-500/20">
                            <p className="text-sm italic text-slate-300">"{ex.excerpt}"</p>
                            <p className="text-xs text-emerald-400 mt-2">✓ {ex.why_good}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bad Examples */}
                  {report.bad_examples?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-red-400">
                        <AlertTriangle className="h-4 w-4" />
                        Exemplos a Melhorar
                      </h5>
                      <div className="space-y-2">
                        {report.bad_examples.map((ex, i) => (
                          <div key={i} className="p-4 bg-red-500/5 backdrop-blur-sm rounded-xl border border-red-500/20">
                            <p className="text-sm italic text-slate-300">"{ex.excerpt}"</p>
                            <p className="text-xs text-red-400 mt-2">✗ {ex.why_bad}</p>
                            {ex.better_response && (
                              <p className="text-xs text-emerald-400 mt-1">
                                ✓ Melhor: "{ex.better_response}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
