import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Clock, Zap, History, Play, BarChart3, MessageSquare, FileText, Timer, Sparkles, Bot, Wand2, Loader2, ChevronUp, ChevronDown, ArrowRight, ListChecks } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import AutomationsDashboard from './AutomationsDashboard';

interface Template {
  id: string;
  name: string;
  status: string;
}

interface MessageSequenceItem {
  attempt?: number;
  type: 'manual' | 'ai_generated';
  content?: string;
  ai_prompt_type?: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call';
  [key: string]: string | number | undefined;
}

// Template de sequência recomendada
const RECOMMENDED_SEQUENCE: MessageSequenceItem[] = [
  { attempt: 1, type: 'manual', content: 'Oi {nome}! Vi que você tinha interesse em nossos serviços. Qual sua principal necessidade hoje?' },
  { attempt: 2, type: 'ai_generated', ai_prompt_type: 'schedule_call' },
  { attempt: 3, type: 'ai_generated', ai_prompt_type: 'last_chance' },
];

const AI_PROMPT_TYPE_LABELS: Record<string, { emoji: string; label: string; short: string }> = {
  'qualification': { emoji: '🎯', label: 'Qualificação', short: 'Qualifica' },
  'urgency': { emoji: '⏰', label: 'Urgência', short: 'Urgência' },
  'budget': { emoji: '💰', label: 'Budget', short: 'Orçamento' },
  'decision': { emoji: '👔', label: 'Decisão', short: 'Decisão' },
  'soft_reengagement': { emoji: '💬', label: 'Retomada suave', short: 'Retomada' },
  'last_chance': { emoji: '🔔', label: 'Última chance', short: 'Encerramento' },
  'schedule_call': { emoji: '📞', label: 'Agendar conversa', short: 'Ligação' },
};

interface Automation {
  id: string;
  name: string;
  description: string | null;
  hours_without_response: number;
  time_unit: 'hours' | 'minutes';
  automation_type: 'template' | 'free_text' | 'window_expiring';
  template_id: string | null;
  template_variables: Record<string, string>;
  free_text_message: string | null;
  agent_messages: Record<string, string> | null;
  within_window_only: boolean;
  conversation_statuses: string[];
  max_attempts: number;
  cooldown_hours: number;
  active_hours_start: string;
  active_hours_end: string;
  active_days: number[];
  is_active: boolean;
  created_at: string;
  minutes_before_expiry: number;
  only_if_no_client_response: boolean;
  messages_sequence: MessageSequenceItem[] | null;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty?: string;
  is_active: boolean;
}

interface FollowupLog {
  id: string;
  automation_id: string;
  template_name: string | null;
  status: string;
  hours_waited: number | null;
  created_at: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

const VARIABLE_OPTIONS = [
  { value: 'contact.name', label: 'Nome do contato' },
  { value: 'contact.call_name', label: 'Nome de tratamento' },
  { value: 'contact.company', label: 'Empresa' },
  { value: 'hours_waiting', label: 'Horas aguardando' },
];

const FREE_TEXT_VARIABLES = [
  { placeholder: '{nome}', description: 'Nome do contato' },
  { placeholder: '{empresa}', description: 'Empresa do contato' },
];

// Sugestões de mensagens pré-preenchidas por agente (baseadas no contexto do produto)
const AGENT_MESSAGE_SUGGESTIONS: Record<string, string> = {
  'orbi': 'Oi {nome}! Nossa conversa sobre plano de saúde pet está prestes a expirar. Me responde qualquer coisa pra gente continuar falando sobre o cuidado do seu pet!',
  'default': 'Oi {nome}! Nossa conversa está prestes a expirar. Me responde qualquer coisa pra gente continuar!',
};

export default function FollowupAutomationsSettings() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [logs, setLogs] = useState<FollowupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    hours_without_response: 2,
    time_unit: 'hours' as 'hours' | 'minutes',
    automation_type: 'free_text' as 'template' | 'free_text' | 'window_expiring',
    template_id: '',
    template_variables: {} as Record<string, string>,
    free_text_message: 'Oi {nome}, ainda consegue continuar?',
    agent_messages: {} as Record<string, string>,
    within_window_only: true,
    conversation_statuses: ['nina', 'human'],
    max_attempts: 3,
    cooldown_hours: 4,
    active_hours_start: '09:00',
    active_hours_end: '18:00',
    active_days: [1, 2, 3, 4, 5],
    minutes_before_expiry: 10,
    only_if_no_client_response: true,
    messages_sequence: [] as MessageSequenceItem[],
  });
  
  const [isGeneratingMessage, setIsGeneratingMessage] = useState<number | null>(null);

  const AI_PROMPT_TYPES = [
    { value: 'qualification', label: 'Qualificação', desc: 'Pergunta sobre necessidade/dor' },
    { value: 'urgency', label: 'Urgência', desc: 'Pergunta sobre prazo' },
    { value: 'soft_reengagement', label: 'Retomada Suave', desc: 'Mensagem amigável' },
    { value: 'last_chance', label: 'Última Chance', desc: 'Encerramento amigável' },
    { value: 'schedule_call', label: 'Agendar Conversa', desc: 'Perguntar melhor horário para ligar' },
  ];

  // Função para mover item na sequência
  const moveSequenceItem = (index: number, direction: 'up' | 'down') => {
    const newSequence = [...formData.messages_sequence];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= newSequence.length) return;
    
    // Swap items
    [newSequence[index], newSequence[newIndex]] = [newSequence[newIndex], newSequence[index]];
    
    // Update attempt numbers
    const updatedSequence = newSequence.map((item, i) => ({
      ...item,
      attempt: i + 1
    }));
    
    setFormData(prev => ({ ...prev, messages_sequence: updatedSequence }));
  };

  // Função para aplicar template recomendado
  const applyRecommendedTemplate = () => {
    setFormData(prev => ({
      ...prev,
      messages_sequence: RECOMMENDED_SEQUENCE.map((item, index) => ({
        ...item,
        attempt: index + 1
      })),
      max_attempts: 3
    }));
    toast.success('Template recomendado aplicado!');
  };

  // Renderizar resumo visual do fluxo
  const renderFlowSummary = () => {
    if (formData.messages_sequence.length === 0) return null;
    
    return (
      <div className="flex items-center gap-2 flex-wrap p-3 bg-white/[0.04] rounded-lg border border-white/10 mb-4">
        <span className="text-xs text-muted-foreground">Fluxo:</span>
        {formData.messages_sequence.map((item, index) => {
          const promptInfo = item.type === 'ai_generated' && item.ai_prompt_type 
            ? AI_PROMPT_TYPE_LABELS[item.ai_prompt_type] || { emoji: '🤖', short: 'IA' }
            : { emoji: '✏️', short: 'Manual' };
          
          return (
            <div key={index} className="flex items-center gap-1">
              <div className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded text-xs">
                <span>{promptInfo.emoji}</span>
                <span className="font-medium">Msg {index + 1}</span>
                <span className="text-muted-foreground">({promptInfo.short})</span>
              </div>
              {index < formData.messages_sequence.length - 1 && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ArrowRight className="h-3 w-3" />
                  <span className="text-xs">+{formData.cooldown_hours}h</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [automationsRes, templatesRes, agentsRes] = await Promise.all([
        supabase.from('followup_automations').select('*').order('created_at', { ascending: false }),
        supabase.from('whatsapp_templates').select('id, name, status').eq('status', 'APPROVED'),
        supabase.from('agents').select('id, name, slug, is_active').eq('is_active', true),
      ]);

      if (automationsRes.error) throw automationsRes.error;
      if (templatesRes.error) throw templatesRes.error;
      if (agentsRes.error) throw agentsRes.error;

      const mappedAutomations: Automation[] = ((automationsRes.data || []).map(a => ({
        ...a,
        conversation_statuses: a.conversation_statuses ?? [],
        max_attempts: a.max_attempts ?? 1,
        cooldown_hours: a.cooldown_hours ?? 24,
        active_hours_start: a.active_hours_start ?? '09:00:00',
        active_hours_end: a.active_hours_end ?? '18:00:00',
        active_days: a.active_days ?? [1,2,3,4,5],
        template_variables: (a.template_variables as Record<string, string>) || {},
        agent_messages: (a.agent_messages as Record<string, string>) || {},
        time_unit: (a.time_unit || 'hours') as 'hours' | 'minutes',
        automation_type: (a.automation_type || 'template') as 'template' | 'free_text' | 'window_expiring',
        free_text_message: a.free_text_message || null,
        within_window_only: a.within_window_only ?? false,
        minutes_before_expiry: a.minutes_before_expiry ?? 10,
        only_if_no_client_response: a.only_if_no_client_response ?? true,
        messages_sequence: Array.isArray(a.messages_sequence) ? (a.messages_sequence as unknown as MessageSequenceItem[]) : null,
      })) as any) as Automation[];

      setAutomations(mappedAutomations);
      setTemplates((templatesRes.data || []) as any);
      setAgents((agentsRes.data || []) as any);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erro ao carregar automações');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('followup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data || []) as any);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Erro ao carregar logs');
    }
  };

  const openCreateModal = () => {
    setEditingAutomation(null);
    setFormData({
      name: '',
      description: '',
      hours_without_response: 2,
      time_unit: 'hours',
      automation_type: 'free_text',
      template_id: '',
      template_variables: {},
      free_text_message: 'Oi {nome}, ainda consegue continuar?',
      agent_messages: {},
      within_window_only: true,
      conversation_statuses: ['nina', 'human'],
      max_attempts: 2,
      cooldown_hours: 4,
      active_hours_start: '09:00',
      active_hours_end: '18:00',
      active_days: [1, 2, 3, 4, 5],
      minutes_before_expiry: 10,
      only_if_no_client_response: true,
      messages_sequence: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (automation: Automation) => {
    setEditingAutomation(automation);
    setFormData({
      name: automation.name,
      description: automation.description || '',
      hours_without_response: automation.hours_without_response,
      time_unit: automation.time_unit || 'hours',
      automation_type: automation.automation_type || 'template',
      template_id: automation.template_id || '',
      template_variables: automation.template_variables || {},
      free_text_message: automation.free_text_message || 'Oi {nome}, ainda consegue continuar?',
      agent_messages: automation.agent_messages || {},
      within_window_only: automation.within_window_only ?? false,
      conversation_statuses: automation.conversation_statuses,
      max_attempts: automation.max_attempts,
      cooldown_hours: automation.cooldown_hours,
      active_hours_start: automation.active_hours_start,
      active_hours_end: automation.active_hours_end,
      active_days: automation.active_days,
      minutes_before_expiry: automation.minutes_before_expiry ?? 10,
      only_if_no_client_response: automation.only_if_no_client_response ?? true,
      messages_sequence: (automation.messages_sequence as MessageSequenceItem[]) || [],
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (formData.automation_type === 'template' && !formData.template_id) {
      toast.error('Selecione um template para automações do tipo Template');
      return;
    }

    if ((formData.automation_type === 'free_text' || formData.automation_type === 'window_expiring') && !formData.free_text_message?.trim()) {
      toast.error('Mensagem é obrigatória');
      return;
    }

    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        hours_without_response: formData.hours_without_response,
        time_unit: formData.time_unit,
        automation_type: formData.automation_type,
        template_id: formData.automation_type === 'template' ? formData.template_id : null,
        template_variables: formData.automation_type === 'template' ? formData.template_variables : {},
        free_text_message: (formData.automation_type === 'free_text' || formData.automation_type === 'window_expiring') ? formData.free_text_message : null,
        agent_messages: formData.automation_type === 'window_expiring' ? formData.agent_messages : {},
        within_window_only: formData.automation_type === 'window_expiring' ? true : formData.within_window_only,
        conversation_statuses: formData.conversation_statuses,
        max_attempts: formData.messages_sequence.length > 0 ? formData.messages_sequence.length : formData.max_attempts,
        cooldown_hours: formData.cooldown_hours,
        active_hours_start: formData.active_hours_start,
        active_hours_end: formData.active_hours_end,
        active_days: formData.active_days,
        minutes_before_expiry: formData.automation_type === 'window_expiring' ? formData.minutes_before_expiry : 10,
        only_if_no_client_response: formData.automation_type === 'window_expiring' ? formData.only_if_no_client_response : true,
        messages_sequence: formData.messages_sequence,
      };

      if (editingAutomation) {
        const { error } = await supabase
          .from('followup_automations')
          .update(payload)
          .eq('id', editingAutomation.id);

        if (error) throw error;
        toast.success('Automação atualizada');
      } else {
        const { error } = await supabase
          .from('followup_automations')
          .insert(payload);

        if (error) throw error;
        toast.success('Automação criada');
      }

      setIsModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Error saving automation:', error);
      toast.error('Erro ao salvar automação');
    }
  };

  const handleToggleActive = async (automation: Automation) => {
    try {
      const { error } = await supabase
        .from('followup_automations')
        .update({ is_active: !automation.is_active })
        .eq('id', automation.id);

      if (error) throw error;
      
      setAutomations(prev =>
        prev.map(a => a.id === automation.id ? { ...a, is_active: !a.is_active } : a)
      );
      
      toast.success(automation.is_active ? 'Automação desativada' : 'Automação ativada');
    } catch (error) {
      console.error('Error toggling automation:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Excluir automação "${automation.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('followup_automations')
        .delete()
        .eq('id', automation.id);

      if (error) throw error;
      
      setAutomations(prev => prev.filter(a => a.id !== automation.id));
      toast.success('Automação excluída');
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error('Erro ao excluir automação');
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-followups', {});
      
      if (error) throw error;
      
      toast.success(`Processamento concluído: ${data.processed} follow-ups enviados`);
      loadLogs();
    } catch (error) {
      console.error('Error running followups:', error);
      toast.error('Erro ao executar follow-ups');
    } finally {
      setIsRunning(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      active_days: prev.active_days.includes(day)
        ? prev.active_days.filter(d => d !== day)
        : [...prev.active_days, day].sort(),
    }));
  };

  const toggleStatus = (status: string) => {
    setFormData(prev => ({
      ...prev,
      conversation_statuses: prev.conversation_statuses.includes(status)
        ? prev.conversation_statuses.filter(s => s !== status)
        : [...prev.conversation_statuses, status],
    }));
  };

  const getTemplateName = (templateId: string | null) => {
    if (!templateId) return '-';
    return templates.find(t => t.id === templateId)?.name || 'Template removido';
  };

  const formatTimeDisplay = (automation: Automation) => {
    if (automation.automation_type === 'window_expiring') {
      return `${automation.minutes_before_expiry} min antes da janela expirar`;
    }
    const unit = automation.time_unit === 'minutes' ? 'min' : 'h';
    return `Após ${automation.hours_without_response}${unit} sem resposta`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

    return (
    <Tabs defaultValue="rules" className="space-y-6">
      <TabsList className="bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-xl">
        <TabsTrigger value="rules" className="text-gray-300 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
          <Zap className="h-4 w-4 mr-2" />
          Regras
        </TabsTrigger>
        <TabsTrigger value="dashboard" className="text-gray-300 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
          <BarChart3 className="h-4 w-4 mr-2" />
          Dashboard
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard">
        <AutomationsDashboard />
      </TabsContent>

      <TabsContent value="rules" className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Automações de Follow-up</h3>
            <p className="text-sm text-gray-300">
              Configure disparos automáticos quando leads ficam sem responder
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                loadLogs();
                setIsLogsModalOpen(true);
              }}
              className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white backdrop-blur-xl"
            >
              <History className="h-4 w-4 mr-2" />
              Histórico
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRunNow}
              disabled={isRunning}
              className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white backdrop-blur-xl"
            >
              <Play className="h-4 w-4 mr-2" />
              {isRunning ? 'Executando...' : 'Executar Agora'}
            </Button>
            <Button onClick={openCreateModal} className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25">
              <Plus className="h-4 w-4 mr-2" />
              Nova Automação
            </Button>
          </div>
        </div>

      {/* List */}
      {automations.length === 0 ? (
        <div className="text-center py-12 border border-white/10 rounded-2xl bg-white/[0.04] backdrop-blur-xl">
          <Zap className="h-12 w-12 mx-auto text-emerald-400 mb-4" />
          <p className="text-gray-300">Nenhuma automação configurada</p>
          <Button onClick={openCreateModal} className="mt-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25">
            Criar primeira automação
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {automations.map(automation => (
            <div
              key={automation.id}
              className="border border-white/10 rounded-2xl p-5 flex items-center justify-between bg-white/[0.04] backdrop-blur-xl hover:bg-white/[0.08] transition-all duration-300 shadow-xl shadow-black/10"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="font-semibold text-white">{automation.name}</h4>
                  <span className={
                    `text-xs px-2.5 py-1 rounded-full font-bold shadow-sm ${
                      automation.is_active
                        ? 'bg-emerald-600 text-white shadow-emerald-500/30'
                        : 'bg-gray-600 text-white'
                    }`
                  }>
                    {automation.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                  <span className={
                    `text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-bold shadow-sm ${
                      automation.automation_type === 'free_text'
                        ? 'bg-blue-600 text-white shadow-blue-500/30'
                        : automation.automation_type === 'window_expiring'
                          ? 'bg-amber-500 text-white shadow-amber-400/30'
                          : 'bg-violet-600 text-white shadow-violet-500/30'
                    }`
                  }>
                    {automation.automation_type === 'free_text' ? (
                      <>
                        <MessageSquare className="h-3 w-3" /> Texto Livre
                      </>
                    ) : automation.automation_type === 'window_expiring' ? (
                      <>
                        <Timer className="h-3 w-3" /> Última Chance
                      </>
                    ) : (
                      <>
                        <FileText className="h-3 w-3" /> Template
                      </>
                    )}
                  </span>
                  {automation.within_window_only && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-orange-600 text-white shadow-sm shadow-orange-500/30">
                      Janela 24h
                    </span>
                  )}
                </div>
                {automation.description && (
                  <p className="text-sm text-gray-300 mb-2">{automation.description}</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeDisplay(automation)}
                  </span>
                  {automation.automation_type === 'template' && (
                    <span>Template: {getTemplateName(automation.template_id)}</span>
                  )}
                  <span>Máx: {automation.max_attempts}x</span>
                  <span>Horário: {automation.active_hours_start}-{automation.active_hours_end}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={automation.is_active} onCheckedChange={() => handleToggleActive(automation)} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditModal(automation)}
                  className="text-gray-400 hover:text-white hover:bg-white/10"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(automation)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAutomation ? 'Editar Automação' : 'Nova Automação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Continuar qualificação (2h)"
                />
              </div>

              <div className="col-span-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição opcional..."
                  rows={2}
                />
              </div>

              {/* Automation Type Toggle */}
              <div className="col-span-2">
                <Label>Tipo de automação</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    type="button"
                    variant={formData.automation_type === 'free_text' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, automation_type: 'free_text', within_window_only: true }))}
                    className="flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Texto Livre (Janela 24h)
                  </Button>
                  <Button
                    type="button"
                    variant={formData.automation_type === 'template' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData(prev => ({ ...prev, automation_type: 'template' }))}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    Template WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant={formData.automation_type === 'window_expiring' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFormData(prev => ({ 
                      ...prev, 
                      automation_type: 'window_expiring', 
                      within_window_only: true,
                      free_text_message: prev.free_text_message || 'Olá {nome}! Caso precise de ajuda com seu seguro, estou aqui. Me responde qualquer coisa pra gente continuar a conversa!'
                    }))}
                    className="flex items-center gap-2"
                  >
                    <Timer className="h-4 w-4" />
                    Última Chance (Janela Expirando)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {formData.automation_type === 'free_text' 
                    ? 'Envia mensagem de texto livre. Funciona apenas dentro da janela de 24h do WhatsApp.' 
                    : formData.automation_type === 'window_expiring'
                      ? 'Envia mensagem minutos antes da janela de 24h expirar. Última tentativa de reengajar o lead.'
                      : 'Envia template aprovado pelo WhatsApp. Funciona mesmo fora da janela de 24h.'}
                </p>
              </div>

              {/* Window Expiring Specific Fields */}
              {formData.automation_type === 'window_expiring' && (
                <>
                  <div>
                    <Label>Minutos antes de expirar</Label>
                    <Input
                      type="number"
                      min={5}
                      max={30}
                      value={formData.minutes_before_expiry}
                      onChange={e => setFormData(prev => ({ ...prev, minutes_before_expiry: parseInt(e.target.value) || 10 }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Dispara {formData.minutes_before_expiry} minutos antes da janela de 24h fechar
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.only_if_no_client_response}
                      onCheckedChange={checked => setFormData(prev => ({ ...prev, only_if_no_client_response: checked }))}
                    />
                    <Label className="text-sm">Apenas se todas as tentativas foram frustradas</Label>
                  </div>
                </>
              )}

              {/* Time Configuration - only for non-window_expiring */}
              {formData.automation_type !== 'window_expiring' && (
              <div>
                <Label>Tempo sem resposta</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={formData.hours_without_response}
                    onChange={e => setFormData(prev => ({ ...prev, hours_without_response: parseInt(e.target.value) || 1 }))}
                    className="flex-1"
                  />
                  <Select
                    value={formData.time_unit}
                    onValueChange={(value: 'hours' | 'minutes') => setFormData(prev => ({ ...prev, time_unit: value }))}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Horas</SelectItem>
                      <SelectItem value="minutes">Minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              )}

              {/* Within Window Only Checkbox - only for templates */}
              {formData.automation_type === 'template' && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.within_window_only}
                    onCheckedChange={checked => setFormData(prev => ({ ...prev, within_window_only: checked }))}
                  />
                  <Label className="text-sm">Apenas dentro da janela 24h</Label>
                </div>
              )}

              {/* Free Text Message - for free_text only */}
              {formData.automation_type === 'free_text' && (
                <div className="col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-medium">Sequência de Mensagens</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Configure até 3 mensagens diferentes para tentativas de retomada. Pode usar texto manual ou gerado por IA.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {formData.messages_sequence.length === 0 && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={applyRecommendedTemplate}
                          className="gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        >
                          <ListChecks className="h-4 w-4" />
                          Usar Template Recomendado
                        </Button>
                      )}
                      {formData.messages_sequence.length < 3 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            messages_sequence: [
                              ...prev.messages_sequence,
                              { 
                                attempt: prev.messages_sequence.length + 1,
                                type: 'manual', 
                                content: '', 
                                ai_prompt_type: 'qualification' 
                              }
                            ]
                          }))}
                          className="gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar Mensagem
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Visual Flow Summary */}
                  {renderFlowSummary()}

                  {formData.messages_sequence.length === 0 ? (
                    <div className="border border-dashed border-white/20 rounded-lg p-6 text-center">
                      <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-3">
                        Nenhuma mensagem na sequência. Use o template recomendado ou adicione mensagens manualmente.
                      </p>
                      <div className="flex gap-2 justify-center">
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          onClick={applyRecommendedTemplate}
                          className="gap-1 bg-emerald-500 hover:bg-emerald-600"
                        >
                          <ListChecks className="h-4 w-4" />
                          Usar Template Recomendado
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setFormData(prev => ({
                            ...prev,
                            messages_sequence: [
                              { attempt: 1, type: 'manual', content: 'Oi {nome}, ainda consegue continuar?', ai_prompt_type: 'qualification' }
                            ]
                          }))}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Criar do zero
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.messages_sequence.map((item, index) => (
                        <div key={index} className="border border-white/10 rounded-lg p-4 bg-white/[0.02] space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-1 rounded">
                                Mensagem {index + 1}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {index === 0 
                                  ? `Após ${formData.hours_without_response}${formData.time_unit === 'hours' ? 'h' : 'min'} sem resposta`
                                  : `+${formData.cooldown_hours}h após tentativa anterior`
                                }
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Move Up Button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveSequenceItem(index, 'up')}
                                disabled={index === 0}
                                className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30"
                                title="Mover para cima"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              {/* Move Down Button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveSequenceItem(index, 'down')}
                                disabled={index === formData.messages_sequence.length - 1}
                                className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30"
                                title="Mover para baixo"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              {/* Delete Button */}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const newSequence = formData.messages_sequence.filter((_, i) => i !== index);
                                  // Re-number attempts after deletion
                                  const updatedSequence = newSequence.map((item, i) => ({
                                    ...item,
                                    attempt: i + 1
                                  }));
                                  setFormData(prev => ({ ...prev, messages_sequence: updatedSequence }));
                                }}
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant={item.type === 'manual' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                const updated = [...formData.messages_sequence];
                                updated[index] = { ...updated[index], type: 'manual' };
                                setFormData(prev => ({ ...prev, messages_sequence: updated }));
                              }}
                              className="gap-1"
                            >
                              <MessageSquare className="h-3 w-3" />
                              Manual
                            </Button>
                            <Button
                              type="button"
                              variant={item.type === 'ai_generated' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                const updated = [...formData.messages_sequence];
                                updated[index] = { ...updated[index], type: 'ai_generated' };
                                setFormData(prev => ({ ...prev, messages_sequence: updated }));
                              }}
                              className="gap-1"
                            >
                              <Bot className="h-3 w-3" />
                              Gerada por IA
                            </Button>
                          </div>

                          {item.type === 'manual' ? (
                            <div>
                              <Textarea
                                value={item.content || ''}
                                onChange={e => {
                                  const updated = [...formData.messages_sequence];
                                  updated[index] = { ...updated[index], content: e.target.value };
                                  setFormData(prev => ({ ...prev, messages_sequence: updated }));
                                }}
                                placeholder="Digite a mensagem de retomada..."
                                rows={2}
                              />
                              <div className="flex flex-wrap gap-1 mt-2">
                                {FREE_TEXT_VARIABLES.map(v => (
                                  <span 
                                    key={v.placeholder} 
                                    className="text-xs px-1.5 py-0.5 bg-muted rounded cursor-pointer hover:bg-muted/80"
                                    onClick={() => {
                                      const updated = [...formData.messages_sequence];
                                      updated[index] = { 
                                        ...updated[index], 
                                        content: (updated[index].content || '') + ' ' + v.placeholder 
                                      };
                                      setFormData(prev => ({ ...prev, messages_sequence: updated }));
                                    }}
                                  >
                                    {v.placeholder}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <Label className="text-xs">Tipo de pergunta</Label>
                                <Select
                                  value={item.ai_prompt_type || 'qualification'}
                                  onValueChange={(value: string) => {
                                    const updated = [...formData.messages_sequence];
                                    updated[index] = { ...updated[index], ai_prompt_type: value as MessageSequenceItem['ai_prompt_type'] };
                                    setFormData(prev => ({ ...prev, messages_sequence: updated }));
                                  }}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="qualification">🎯 Qualificação - "Qual sua principal necessidade?"</SelectItem>
                                    <SelectItem value="urgency">⏰ Urgência - "Precisa resolver em quanto tempo?"</SelectItem>
                                    <SelectItem value="budget">💰 Budget - "Qual seu orçamento aproximado?"</SelectItem>
                                    <SelectItem value="decision">👔 Decisão - "Você decide sobre isso?"</SelectItem>
                                    <SelectItem value="soft_reengagement">💬 Retomada suave - "Posso ajudar com mais algo?"</SelectItem>
                                    <SelectItem value="last_chance">🔔 Última chance - "Vou encerrar, posso te ligar?"</SelectItem>
                                    <SelectItem value="schedule_call">📞 Agendar conversa - "Qual melhor horário pra gente conversar?"</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={isGeneratingMessage === index}
                                onClick={async () => {
                                  setIsGeneratingMessage(index);
                                  try {
                                    const { data, error } = await supabase.functions.invoke('generate-followup-message', {
                                      body: {
                                        promptType: item.ai_prompt_type || 'qualification',
                                        contactName: 'João',
                                        agentName: agents[0]?.name || 'Assistente',
                                        agentSpecialty: agents[0]?.specialty || 'atendimento',
                                        hoursWithoutResponse: formData.hours_without_response
                                      }
                                    });
                                    if (error) throw error;
                                    const updated = [...formData.messages_sequence];
                                    updated[index] = { ...updated[index], content: data.message };
                                    setFormData(prev => ({ ...prev, messages_sequence: updated }));
                                    toast.success('Mensagem gerada com sucesso!');
                                  } catch (error) {
                                    console.error('Error generating message:', error);
                                    toast.error('Erro ao gerar mensagem');
                                  } finally {
                                    setIsGeneratingMessage(null);
                                  }
                                }}
                                className="gap-1"
                              >
                                {isGeneratingMessage === index ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Gerando...
                                  </>
                                ) : (
                                  <>
                                    <Wand2 className="h-3 w-3" />
                                    Gerar Preview com IA
                                  </>
                                )}
                              </Button>

                              {item.content && (
                                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                  <p className="text-xs text-emerald-400 font-medium mb-1">Preview da mensagem:</p>
                                  <p className="text-sm text-white/80">{item.content}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Legacy single message fallback */}
                  {formData.messages_sequence.length === 0 && (
                    <div className="border-t border-white/10 pt-4 mt-4">
                      <Label>Mensagem única (legado) *</Label>
                      <Textarea
                        value={formData.free_text_message}
                        onChange={e => setFormData(prev => ({ ...prev, free_text_message: e.target.value }))}
                        placeholder="Oi {nome}, ainda consegue continuar?"
                        rows={3}
                      />
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Variáveis disponíveis:</span>
                        {FREE_TEXT_VARIABLES.map(v => (
                          <span 
                            key={v.placeholder} 
                            className="text-xs px-2 py-0.5 bg-muted rounded cursor-pointer hover:bg-muted/80"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              free_text_message: prev.free_text_message + ' ' + v.placeholder 
                            }))}
                            title={`Clique para inserir: ${v.description}`}
                          >
                            {v.placeholder}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Agent Messages - for window_expiring */}
              {formData.automation_type === 'window_expiring' && agents.length > 0 && (
                <div className="col-span-2 space-y-4">
                  <div>
                    <Label className="text-base font-medium">Mensagens por Agente</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure mensagens personalizadas para cada agente. Se não definir, usará a mensagem padrão.
                    </p>
                  </div>
                  
                  {agents.map(agent => {
                    const suggestion = AGENT_MESSAGE_SUGGESTIONS[agent.slug] || AGENT_MESSAGE_SUGGESTIONS['default'];
                    return (
                      <div key={agent.id} className="space-y-2 p-3 border rounded-lg bg-muted/20">
                        <Label className="flex items-center gap-2">
                          <span className="text-lg">{agent.slug === 'iris' ? '🚛' : agent.slug === 'clara' ? '🏥' : '🤖'}</span>
                          {agent.name}
                        </Label>
                        <Textarea
                          value={formData.agent_messages[agent.id] || ''}
                          onChange={e => setFormData(prev => ({ 
                            ...prev, 
                            agent_messages: { ...prev.agent_messages, [agent.id]: e.target.value } 
                          }))}
                          placeholder={`Mensagem específica para ${agent.name}...`}
                          rows={2}
                        />
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1">
                            {FREE_TEXT_VARIABLES.map(v => (
                              <span 
                                key={v.placeholder} 
                                className="text-xs px-1.5 py-0.5 bg-muted rounded cursor-pointer hover:bg-muted/80"
                                onClick={() => setFormData(prev => ({ 
                                  ...prev, 
                                  agent_messages: { 
                                    ...prev.agent_messages, 
                                    [agent.id]: (prev.agent_messages[agent.id] || '') + ' ' + v.placeholder 
                                  } 
                                }))}
                              >
                                {v.placeholder}
                              </span>
                            ))}
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1 shrink-0"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              agent_messages: { ...prev.agent_messages, [agent.id]: suggestion } 
                            }))}
                          >
                            <Sparkles className="h-3 w-3" />
                            Usar sugestão
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Fallback Message */}
                  <div className="space-y-2 p-3 border rounded-lg bg-amber-500/10 border-amber-500/30">
                    <Label className="flex items-center gap-2">
                      <span className="text-lg">📋</span>
                      Mensagem Padrão (fallback)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Usada quando o agente não tem mensagem específica ou não está identificado na conversa
                    </p>
                    <Textarea
                      value={formData.free_text_message}
                      onChange={e => setFormData(prev => ({ ...prev, free_text_message: e.target.value }))}
                      placeholder="Olá {nome}! Caso precise de ajuda, estou aqui. Me responde qualquer coisa pra gente continuar a conversa!"
                      rows={2}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {FREE_TEXT_VARIABLES.map(v => (
                          <span 
                            key={v.placeholder} 
                            className="text-xs px-1.5 py-0.5 bg-muted rounded cursor-pointer hover:bg-muted/80"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              free_text_message: prev.free_text_message + ' ' + v.placeholder 
                            }))}
                          >
                            {v.placeholder}
                          </span>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 shrink-0"
                        onClick={() => setFormData(prev => ({ 
                          ...prev, 
                          free_text_message: AGENT_MESSAGE_SUGGESTIONS['default']
                        }))}
                      >
                        <Sparkles className="h-3 w-3" />
                        Usar sugestão
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Template Selection - only for template type */}
              {formData.automation_type === 'template' && (
                <>
                  <div className="col-span-2">
                    <Label>Template WhatsApp *</Label>
                    <Select
                      value={formData.template_id}
                      onValueChange={value => setFormData(prev => ({ ...prev, template_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.filter(t => t.id && t.id.trim() !== '').map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label>Variáveis do template</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Mapeie as variáveis do template para dados do contato
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground w-12">{`{${i}}`}</span>
                          <Select
                            value={formData.template_variables[i.toString()] || ''}
                            onValueChange={value => setFormData(prev => ({
                              ...prev,
                              template_variables: { ...prev.template_variables, [i.toString()]: value === '__none__' ? '' : value }
                            }))}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Não usar</SelectItem>
                              {VARIABLE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label>Máximo de tentativas</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.max_attempts}
                  onChange={e => setFormData(prev => ({ ...prev, max_attempts: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <Label>Cooldown (horas entre disparos)</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.cooldown_hours}
                  onChange={e => setFormData(prev => ({ ...prev, cooldown_hours: parseInt(e.target.value) || 4 }))}
                />
              </div>

              <div>
                <Label>Horário início</Label>
                <Input
                  type="time"
                  value={formData.active_hours_start}
                  onChange={e => setFormData(prev => ({ ...prev, active_hours_start: e.target.value }))}
                />
              </div>

              <div>
                <Label>Horário fim</Label>
                <Input
                  type="time"
                  value={formData.active_hours_end}
                  onChange={e => setFormData(prev => ({ ...prev, active_hours_end: e.target.value }))}
                />
              </div>

              <div className="col-span-2">
                <Label>Dias ativos</Label>
                <div className="flex gap-2 mt-2">
                  {DAYS_OF_WEEK.map(day => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={formData.active_days.includes(day.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <Label>Status de conversa permitidos</Label>
                <div className="flex gap-2 mt-2">
                  {['nina', 'human', 'paused'].map(status => (
                    <Button
                      key={status}
                      type="button"
                      variant={formData.conversation_statuses.includes(status) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleStatus(status)}
                    >
                      {status === 'nina' ? '🤖 Nina' : status === 'human' ? '👤 Humano' : '⏸ Pausado'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingAutomation ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Modal */}
      <Dialog open={isLogsModalOpen} onOpenChange={setIsLogsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Follow-ups</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum follow-up enviado ainda
              </p>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 border rounded-lg text-sm"
                >
                  <div>
                    <span className="font-medium">{log.template_name || 'Mensagem'}</span>
                    <span className="text-muted-foreground ml-2">
                      após {log.hours_waited?.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      log.status === 'sent' 
                        ? 'bg-green-500/20 text-green-600' 
                        : 'bg-red-500/20 text-red-600'
                    }`}>
                      {log.status === 'sent' ? 'Enviado' : 'Falhou'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
      </TabsContent>
    </Tabs>
  );
}