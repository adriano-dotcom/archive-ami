import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Bot, Plus, Trash2, Edit2, Check, X, Loader2, 
  MessageSquare, Sparkles, Star, Users, FlaskConical, ArrowRight, Volume2,
  ChevronDown, ChevronUp, Play, Settings2, UserCheck, RefreshCw,
  Calendar, Building2, Wifi, WifiOff
} from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../Button';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import PromptGeneratorSheet from './PromptGeneratorSheet';
import { useCompanySettings } from '@/hooks/useCompanySettings';

// --- Types ---

interface GlobalSettings {
  id?: string;
  system_prompt_override: string | null;
  is_active: boolean;
  auto_response_enabled: boolean;
  ai_model_mode: 'flash' | 'pro' | 'pro3' | 'adaptive';
  message_breaking_enabled: boolean;
  response_delay_min: number;
  response_delay_max: number;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  company_name: string | null;
  sdr_name: string | null;
}

interface TestResult {
  success: boolean;
  detectedAgent: string | null;
  previousAgent: string | null;
  handoffOccurred: boolean;
  message: string;
  matchedKeyword: string | null;
  testedMessage: string;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  description: string | null;
  system_prompt: string;
  is_default: boolean;
  is_active: boolean;
  detection_keywords: string[];
  greeting_message: string | null;
  handoff_message: string | null;
  qualification_questions: Array<{ order: number; question: string }>;
  audio_response_enabled: boolean;
  elevenlabs_voice_id: string | null;
  elevenlabs_model: string | null;
  elevenlabs_stability: number | null;
  elevenlabs_similarity_boost: number | null;
  elevenlabs_style: number | null;
  elevenlabs_speed: number | null;
  elevenlabs_speaker_boost: boolean | null;
  owner_distribution_type: 'fixed' | 'round_robin' | null;
  default_owner_id: string | null;
  owner_rotation_ids: string[];
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  status: string;
}

export interface AgentsSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
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

const VOICES = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'Feminina' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'Masculina' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'Feminina' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'Feminina' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'Masculina' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'Masculina' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'Masculina' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', gender: 'Neutra' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'Masculina' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'Feminina' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'Feminina' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'Feminina' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'Masculina' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'Feminina' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'Masculina' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'Masculina' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'Masculina' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'Masculina' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'Feminina' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'Masculina' },
];

const MODELS = [
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 (Recomendado)', description: 'Mais rápido e econômico' },
  { id: 'eleven_turbo_v2', name: 'Turbo v2', description: 'Rápido' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Qualidade máxima' },
];

const AgentsSettings = forwardRef<AgentsSettingsRef>((_, ref) => {
  const { refetch: refetchCompany } = useCompanySettings();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newQuestion, setNewQuestion] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testMessage, setTestMessage] = useState('Olá, quero saber sobre plano de saúde');
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  
  // Global settings state (from nina_settings)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    system_prompt_override: null,
    is_active: true,
    auto_response_enabled: true,
    ai_model_mode: 'flash',
    message_breaking_enabled: true,
    response_delay_min: 2,
    response_delay_max: 5,
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    business_days: [1, 2, 3, 4, 5],
    company_name: null,
    sdr_name: null,
  });
  const [showGlobalConfig, setShowGlobalConfig] = useState(false);
  
  // Voice settings UI state
  const [showAdvancedVoice, setShowAdvancedVoice] = useState(false);
  const [showAudioTest, setShowAudioTest] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [audioTestText, setAudioTestText] = useState('Olá! Sou a assistente virtual da OrbePet. Como posso ajudar?');
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: handleCancel,
    isSaving: saving
  }));

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadAgents(), loadTeamMembers(), loadGlobalSettings()]);
    setLoading(false);
  };

  const loadGlobalSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('nina_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setGlobalSettings({
          id: data.id,
          system_prompt_override: data.system_prompt_override,
          is_active: data.is_active,
          auto_response_enabled: data.auto_response_enabled,
          ai_model_mode: (['flash', 'pro', 'pro3', 'adaptive'].includes(data.ai_model_mode || '') 
            ? data.ai_model_mode as GlobalSettings['ai_model_mode']
            : 'flash'),
          message_breaking_enabled: data.message_breaking_enabled,
          response_delay_min: data.response_delay_min,
          response_delay_max: data.response_delay_max,
          business_hours_start: data.business_hours_start,
          business_hours_end: data.business_hours_end,
          business_days: data.business_days,
          company_name: data.company_name,
          sdr_name: data.sdr_name,
        });
      }
    } catch (error) {
      console.error('[AgentsSettings] Error loading global settings:', error);
    }
  };

  const loadTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, status')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error('Erro ao carregar membros da equipe:', error);
    }
  };

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      const parsed = (data || []).map(agent => ({
        ...agent,
        qualification_questions: Array.isArray(agent.qualification_questions) 
          ? (agent.qualification_questions as Array<{ order: number; question: string }>)
          : []
      })) as Agent[];
      
      setAgents(parsed);
    } catch (error) {
      console.error('Erro ao carregar agentes:', error);
      toast.error('Erro ao carregar agentes');
    }
  };

  // --- Save / Cancel ---

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save global settings
      if (globalSettings.id) {
        const { error: globalError } = await supabase
          .from('nina_settings')
          .update({
            system_prompt_override: globalSettings.system_prompt_override,
            is_active: globalSettings.is_active,
            auto_response_enabled: globalSettings.auto_response_enabled,
            ai_model_mode: globalSettings.ai_model_mode,
            message_breaking_enabled: globalSettings.message_breaking_enabled,
            response_delay_min: globalSettings.response_delay_min,
            response_delay_max: globalSettings.response_delay_max,
            business_hours_start: globalSettings.business_hours_start,
            business_hours_end: globalSettings.business_hours_end,
            business_days: globalSettings.business_days,
            company_name: globalSettings.company_name,
            sdr_name: globalSettings.sdr_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', globalSettings.id);
        if (globalError) throw globalError;
      }

      // Save editing agent if any
      if (editingAgent && !isCreating) {
        const { error } = await supabase
          .from('agents')
          .update({
            name: editingAgent.name,
            slug: editingAgent.slug,
            specialty: editingAgent.specialty,
            description: editingAgent.description,
            system_prompt: editingAgent.system_prompt,
            is_active: editingAgent.is_active,
            detection_keywords: editingAgent.detection_keywords,
            greeting_message: editingAgent.greeting_message,
            handoff_message: editingAgent.handoff_message,
            qualification_questions: editingAgent.qualification_questions,
            audio_response_enabled: editingAgent.audio_response_enabled,
            elevenlabs_voice_id: editingAgent.elevenlabs_voice_id || null,
            elevenlabs_model: editingAgent.elevenlabs_model,
            elevenlabs_stability: editingAgent.elevenlabs_stability,
            elevenlabs_similarity_boost: editingAgent.elevenlabs_similarity_boost,
            elevenlabs_style: editingAgent.elevenlabs_style,
            elevenlabs_speed: editingAgent.elevenlabs_speed,
            elevenlabs_speaker_boost: editingAgent.elevenlabs_speaker_boost,
            owner_distribution_type: editingAgent.owner_distribution_type,
            default_owner_id: editingAgent.default_owner_id,
            owner_rotation_ids: editingAgent.owner_rotation_ids
          })
          .eq('id', editingAgent.id);
        if (error) throw error;
        setEditingAgent(null);
        setShowAdvancedVoice(false);
        setShowAudioTest(false);
        setAudioUrl(null);
        await loadAgents();
      }

      toast.success('Configurações salvas!');
      refetchCompany();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingAgent(null);
    setIsCreating(false);
    setShowAdvancedVoice(false);
    setShowAudioTest(false);
    setAudioUrl(null);
    loadGlobalSettings();
  };

  const handleCreate = async () => {
    if (!editingAgent) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agents')
        .insert({
          name: editingAgent.name,
          slug: editingAgent.slug.toLowerCase().replace(/\s+/g, '-'),
          specialty: editingAgent.specialty,
          description: editingAgent.description,
          system_prompt: editingAgent.system_prompt,
          is_default: false,
          is_active: true,
          detection_keywords: editingAgent.detection_keywords,
          greeting_message: editingAgent.greeting_message,
          handoff_message: editingAgent.handoff_message,
          qualification_questions: editingAgent.qualification_questions,
          audio_response_enabled: editingAgent.audio_response_enabled,
          elevenlabs_voice_id: editingAgent.elevenlabs_voice_id || null,
          elevenlabs_model: editingAgent.elevenlabs_model,
          elevenlabs_stability: editingAgent.elevenlabs_stability,
          elevenlabs_similarity_boost: editingAgent.elevenlabs_similarity_boost,
          elevenlabs_style: editingAgent.elevenlabs_style,
          elevenlabs_speed: editingAgent.elevenlabs_speed,
          elevenlabs_speaker_boost: editingAgent.elevenlabs_speaker_boost,
          owner_distribution_type: editingAgent.owner_distribution_type,
          default_owner_id: editingAgent.default_owner_id,
          owner_rotation_ids: editingAgent.owner_rotation_ids
        });

      if (error) throw error;
      toast.success('Agente criado!');
      setEditingAgent(null);
      setIsCreating(false);
      setShowAdvancedVoice(false);
      setShowAudioTest(false);
      await loadAgents();
    } catch (error) {
      console.error('Erro ao criar agente:', error);
      toast.error('Erro ao criar agente');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (agent?.is_default) {
      toast.error('Não é possível excluir o agente padrão');
      return;
    }
    if (!confirm('Tem certeza que deseja excluir este agente?')) return;
    try {
      const { error } = await supabase.from('agents').delete().eq('id', agentId);
      if (error) throw error;
      toast.success('Agente excluído');
      await loadAgents();
    } catch (error) {
      console.error('Erro ao excluir agente:', error);
      toast.error('Erro ao excluir agente');
    }
  };

  const handleToggleActive = async (agentId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from('agents').update({ is_active: isActive }).eq('id', agentId);
      if (error) throw error;
      toast.success(isActive ? 'Agente ativado' : 'Agente desativado');
      await loadAgents();
    } catch (error) {
      console.error('Erro ao atualizar agente:', error);
      toast.error('Erro ao atualizar agente');
    }
  };

  const toggleWhatsAppActive = async () => {
    if (!globalSettings.id) return;
    const newValue = !globalSettings.is_active;
    try {
      const { error } = await supabase
        .from('nina_settings')
        .update({ is_active: newValue, updated_at: new Date().toISOString() })
        .eq('id', globalSettings.id);
      if (error) throw error;
      setGlobalSettings(prev => ({ ...prev, is_active: newValue }));
      toast.success(newValue ? 'Agente ativado para WhatsApp' : 'Agente desativado para WhatsApp');
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const startCreating = () => {
    setEditingAgent({
      id: '', name: '', slug: '', specialty: '', description: '',
      system_prompt: '', is_default: false, is_active: true,
      detection_keywords: [], greeting_message: '', handoff_message: '',
      cargo_focused_greeting: '', qualification_questions: [],
      audio_response_enabled: false,
      elevenlabs_voice_id: 'FGY2WhTYpPnrIDTdsKH5',
      elevenlabs_model: 'eleven_turbo_v2_5',
      elevenlabs_stability: 0.75, elevenlabs_similarity_boost: 0.80,
      elevenlabs_style: 0.30, elevenlabs_speed: 1.0, elevenlabs_speaker_boost: true,
      owner_distribution_type: 'fixed', default_owner_id: null, owner_rotation_ids: [],
      created_at: '', updated_at: ''
    });
    setIsCreating(true);
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !editingAgent) return;
    setEditingAgent({ ...editingAgent, detection_keywords: [...editingAgent.detection_keywords, newKeyword.trim().toLowerCase()] });
    setNewKeyword('');
  };

  const removeKeyword = (keyword: string) => {
    if (!editingAgent) return;
    setEditingAgent({ ...editingAgent, detection_keywords: editingAgent.detection_keywords.filter(k => k !== keyword) });
  };

  const addQuestion = () => {
    if (!newQuestion.trim() || !editingAgent) return;
    const nextOrder = (editingAgent.qualification_questions?.length || 0) + 1;
    setEditingAgent({
      ...editingAgent,
      qualification_questions: [...(editingAgent.qualification_questions || []), { order: nextOrder, question: newQuestion.trim() }]
    });
    setNewQuestion('');
  };

  const removeQuestion = (order: number) => {
    if (!editingAgent) return;
    setEditingAgent({
      ...editingAgent,
      qualification_questions: editingAgent.qualification_questions.filter(q => q.order !== order).map((q, idx) => ({ ...q, order: idx + 1 }))
    });
  };

  const toggleBusinessDay = (day: number) => {
    setGlobalSettings(prev => ({
      ...prev,
      business_days: prev.business_days.includes(day)
        ? prev.business_days.filter(d => d !== day)
        : [...prev.business_days, day].sort()
    }));
  };

  const handlePromptGenerated = (prompt: string) => {
    setGlobalSettings(prev => ({ ...prev, system_prompt_override: prompt }));
  };

  const testHandoff = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const activeAgents = agents.filter(a => a.is_active);
      const messageLower = testMessage.toLowerCase();
      const defaultAgent = activeAgents.find(a => a.is_default);
      let detectedAgent: Agent | null = null;
      let matchedKeyword: string | null = null;
      for (const agent of activeAgents) {
        if (!agent.is_default && agent.detection_keywords?.length > 0) {
          const foundKeyword = agent.detection_keywords.find(kw => messageLower.includes(kw.toLowerCase()));
          if (foundKeyword) { detectedAgent = agent; matchedKeyword = foundKeyword; break; }
        }
      }
      const handoffOccurred = detectedAgent !== null && detectedAgent.id !== defaultAgent?.id;
      setTestResult({
        success: true,
        detectedAgent: detectedAgent?.name || defaultAgent?.name || 'Nenhum',
        previousAgent: defaultAgent?.name || 'Nenhum',
        handoffOccurred, matchedKeyword, testedMessage: testMessage,
        message: handoffOccurred 
          ? `Handoff detectado! Transferência de ${defaultAgent?.name || 'padrão'} → ${detectedAgent?.name}`
          : `Sem handoff. Mensagem seria tratada pelo agente padrão: ${defaultAgent?.name || 'Nenhum configurado'}`
      });
      toast.success(handoffOccurred ? 'Handoff detectado!' : 'Teste concluído - sem handoff');
    } catch (error) {
      console.error('Erro no teste de handoff:', error);
      setTestResult({ success: false, detectedAgent: null, previousAgent: null, handoffOccurred: false, matchedKeyword: null, testedMessage: testMessage, message: `Erro ao testar: ${error instanceof Error ? error.message : 'Erro desconhecido'}` });
      toast.error('Erro ao testar handoff');
    } finally { setTesting(false); }
  };

  const testAudio = async () => {
    if (!editingAgent || !audioTestText.trim()) return;
    setGeneratingAudio(true);
    setAudioUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke('test-elevenlabs-tts', {
        body: { text: audioTestText, voiceId: editingAgent.elevenlabs_voice_id, model: editingAgent.elevenlabs_model, stability: editingAgent.elevenlabs_stability, similarity: editingAgent.elevenlabs_similarity_boost, style: editingAgent.elevenlabs_style, speed: editingAgent.elevenlabs_speed, speakerBoost: editingAgent.elevenlabs_speaker_boost }
      });
      if (error) throw error;
      if (data?.audioContent) {
        const audioBlob = new Blob([Uint8Array.from(atob(data.audioContent), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
        setAudioUrl(URL.createObjectURL(audioBlob));
        toast.success('Áudio gerado!');
      } else { throw new Error('Sem conteúdo de áudio na resposta'); }
    } catch (error) {
      console.error('Erro ao gerar áudio:', error);
      toast.error('Erro ao gerar áudio. Verifique a API Key do ElevenLabs.');
    } finally { setGeneratingAudio(false); }
  };

  const getVoiceName = (voiceId: string | null) => {
    if (!voiceId) return 'Voz do Sistema';
    const voice = VOICES.find(v => v.id === voiceId);
    return voice ? `${voice.name} (${voice.gender})` : voiceId;
  };

  const getDistributionBadge = (agent: Agent) => {
    if (agent.owner_distribution_type === 'round_robin' && agent.owner_rotation_ids?.length > 0) {
      const names = agent.owner_rotation_ids.map(id => teamMembers.find(m => m.id === id)?.name).filter(Boolean).slice(0, 2);
      const extra = agent.owner_rotation_ids.length - 2;
      return (
        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {names.join(', ')}{extra > 0 ? ` +${extra}` : ''}
        </span>
      );
    }
    if (agent.owner_distribution_type === 'fixed' && agent.default_owner_id) {
      const owner = teamMembers.find(m => m.id === agent.default_owner_id);
      if (owner) {
        return (
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full flex items-center gap-1">
            <UserCheck className="w-3 h-3" />
            {owner.name}
          </span>
        );
      }
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ====== EDIT / CREATE FORM ======
  if (editingAgent) {
    return (
      <div className="space-y-6 bg-card/50 border border-border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            {isCreating ? 'Novo Agente' : `Editando: ${editingAgent.name}`}
          </h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={isCreating ? handleCreate : handleSave} disabled={saving || !editingAgent.name || !editingAgent.slug || !editingAgent.system_prompt}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
              {isCreating ? 'Criar' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Nome do Agente *</label>
            <input type="text" value={editingAgent.name} onChange={(e) => setEditingAgent({ ...editingAgent, name: e.target.value })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground" placeholder="Ex: Orbi" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Slug (identificador único) *</label>
            <input type="text" value={editingAgent.slug} onChange={(e) => setEditingAgent({ ...editingAgent, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground" placeholder="Ex: orbi" disabled={!isCreating} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Especialidade</label>
            <input type="text" value={editingAgent.specialty || ''} onChange={(e) => setEditingAgent({ ...editingAgent, specialty: e.target.value })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground" placeholder="Ex: planos_saude" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Descrição</label>
            <input type="text" value={editingAgent.description || ''} onChange={(e) => setEditingAgent({ ...editingAgent, description: e.target.value })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground" placeholder="Ex: Especialista em planos de saúde" />
          </div>
        </div>

        {/* System Prompt */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Prompt do Sistema *</label>
          <textarea value={editingAgent.system_prompt} onChange={(e) => setEditingAgent({ ...editingAgent, system_prompt: e.target.value })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground h-40" placeholder="Instruções para o agente..." />
        </div>

        {/* Messages */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Mensagem de Saudação</label>
            <textarea value={editingAgent.greeting_message || ''} onChange={(e) => setEditingAgent({ ...editingAgent, greeting_message: e.target.value })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground h-20" placeholder="Mensagem inicial..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Mensagem de Handoff</label>
            <textarea value={editingAgent.handoff_message || ''} onChange={(e) => setEditingAgent({ ...editingAgent, handoff_message: e.target.value })} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground h-20" placeholder="Mensagem de transferência..." />
          </div>
        </div>

        {/* Audio Response Settings */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" />
            Resposta em Áudio
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Voz</label>
              <Select value={editingAgent.elevenlabs_voice_id || 'FGY2WhTYpPnrIDTdsKH5'} onValueChange={(value) => setEditingAgent({ ...editingAgent, elevenlabs_voice_id: value })}>
                <SelectTrigger><SelectValue placeholder="Selecione uma voz" /></SelectTrigger>
                <SelectContent>
                  {VOICES.map((voice) => (<SelectItem key={voice.id} value={voice.id}>{voice.name} - {voice.gender}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Modelo</label>
              <Select value={editingAgent.elevenlabs_model || 'eleven_turbo_v2_5'} onValueChange={(value) => setEditingAgent({ ...editingAgent, elevenlabs_model: value })}>
                <SelectTrigger><SelectValue placeholder="Selecione um modelo" /></SelectTrigger>
                <SelectContent>
                  {MODELS.map((model) => (<SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border">
            <div>
              <p className="text-sm text-foreground">Responder em áudio quando cliente envia áudio</p>
              <p className="text-xs text-muted-foreground">Quando ativado, o agente responderá com áudio se o cliente enviar mensagem de voz</p>
            </div>
            <Switch checked={editingAgent.audio_response_enabled} onCheckedChange={(checked) => setEditingAgent({ ...editingAgent, audio_response_enabled: checked })} />
          </div>

          {/* Advanced Voice Settings */}
          <div className="border-t border-border pt-3">
            <button onClick={() => setShowAdvancedVoice(!showAdvancedVoice)} className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
              <span className="flex items-center gap-2"><Settings2 className="w-4 h-4" /> Configurações Avançadas de Voz</span>
              {showAdvancedVoice ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAdvancedVoice && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex justify-between text-xs font-medium text-muted-foreground mb-2"><span>Stability</span><span className="text-primary">{(editingAgent.elevenlabs_stability ?? 0.75).toFixed(2)}</span></label>
                    <Slider value={[editingAgent.elevenlabs_stability ?? 0.75]} onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_stability: value })} min={0} max={1} step={0.01} />
                    <p className="text-xs text-muted-foreground mt-1">Menor = mais expressivo, Maior = mais consistente</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-muted-foreground mb-2"><span>Similarity</span><span className="text-primary">{(editingAgent.elevenlabs_similarity_boost ?? 0.80).toFixed(2)}</span></label>
                    <Slider value={[editingAgent.elevenlabs_similarity_boost ?? 0.80]} onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_similarity_boost: value })} min={0} max={1} step={0.01} />
                    <p className="text-xs text-muted-foreground mt-1">Quão próximo da voz original</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex justify-between text-xs font-medium text-muted-foreground mb-2"><span>Style</span><span className="text-primary">{(editingAgent.elevenlabs_style ?? 0.30).toFixed(2)}</span></label>
                    <Slider value={[editingAgent.elevenlabs_style ?? 0.30]} onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_style: value })} min={0} max={1} step={0.01} />
                    <p className="text-xs text-muted-foreground mt-1">Intensidade de estilo/emoção</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-muted-foreground mb-2"><span>Speed</span><span className="text-primary">{(editingAgent.elevenlabs_speed ?? 1.0).toFixed(2)}x</span></label>
                    <Slider value={[editingAgent.elevenlabs_speed ?? 1.0]} onValueChange={([value]) => setEditingAgent({ ...editingAgent, elevenlabs_speed: value })} min={0.7} max={1.2} step={0.05} />
                    <p className="text-xs text-muted-foreground mt-1">Velocidade da fala</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div><p className="text-sm text-foreground">Speaker Boost</p><p className="text-xs text-muted-foreground">Aumenta clareza e fidelidade da voz</p></div>
                  <Switch checked={editingAgent.elevenlabs_speaker_boost ?? true} onCheckedChange={(checked) => setEditingAgent({ ...editingAgent, elevenlabs_speaker_boost: checked })} />
                </div>
              </div>
            )}
          </div>

          {/* Audio Test */}
          <div className="border-t border-border pt-3">
            <button onClick={() => setShowAudioTest(!showAudioTest)} className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
              <span className="flex items-center gap-2"><Play className="w-4 h-4" /> Testar Áudio</span>
              {showAudioTest ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAudioTest && (
              <div className="mt-4 space-y-3">
                <textarea value={audioTestText} onChange={(e) => setAudioTestText(e.target.value)} className="w-full bg-muted border border-border rounded px-3 py-2 text-sm text-foreground h-20" placeholder="Texto para testar a voz..." />
                <div className="flex items-center gap-3">
                  <Button variant="primary" size="sm" onClick={testAudio} disabled={generatingAudio || !audioTestText.trim()}>
                    {generatingAudio ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Volume2 className="w-4 h-4 mr-1" />}
                    {generatingAudio ? 'Gerando...' : 'Gerar Áudio'}
                  </Button>
                  {audioUrl && <audio controls src={audioUrl} className="h-8 flex-1">Seu navegador não suporta o elemento de áudio.</audio>}
                </div>
                <p className="text-xs text-muted-foreground">Requer API Key do ElevenLabs configurada em Configurações → APIs</p>
              </div>
            )}
          </div>
        </div>

        {/* Detection Keywords */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Keywords de Detecção <span className="opacity-60 ml-1">(palavras que ativam este agente)</span></label>
          <div className="flex flex-wrap gap-2 mb-2">
            {editingAgent.detection_keywords.map((kw, idx) => (
              <span key={idx} className="px-2 py-1 bg-primary/20 text-primary text-xs rounded-full flex items-center gap-1">
                {kw}
                <button onClick={() => removeKeyword(kw)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())} className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm text-foreground" placeholder="Adicionar keyword..." />
            <Button variant="ghost" size="sm" onClick={addKeyword}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Qualification Questions */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Perguntas de Qualificação <span className="opacity-60 ml-1">(perguntas para qualificar o lead)</span></label>
          <div className="space-y-2 mb-2">
            {(editingAgent.qualification_questions || []).map((q) => (
              <div key={q.order} className="flex items-center gap-2 bg-muted/50 rounded px-3 py-2">
                <span className="text-primary text-xs font-mono">{q.order}.</span>
                <span className="flex-1 text-sm text-muted-foreground">{q.question}</span>
                <button onClick={() => removeQuestion(q.order)} className="text-muted-foreground hover:text-red-400"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newQuestion} onChange={(e) => setNewQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addQuestion())} className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm text-foreground" placeholder="Adicionar pergunta..." />
            <Button variant="ghost" size="sm" onClick={addQuestion}><Plus className="w-4 h-4" /></Button>
          </div>
        </div>

        {/* Lead Distribution Settings */}
        <div className="bg-muted/30 rounded-lg p-4 space-y-4">
          <button type="button" onClick={() => setShowDistribution(!showDistribution)} className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <span className="flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Distribuição de Responsáveis</span>
            {showDistribution ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showDistribution && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Tipo de Distribuição</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="distribution_type" checked={editingAgent.owner_distribution_type === 'fixed' || !editingAgent.owner_distribution_type} onChange={() => setEditingAgent({ ...editingAgent, owner_distribution_type: 'fixed', owner_rotation_ids: [] })} className="text-primary" />
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><UserCheck className="w-4 h-4" /> Fixo</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="distribution_type" checked={editingAgent.owner_distribution_type === 'round_robin'} onChange={() => setEditingAgent({ ...editingAgent, owner_distribution_type: 'round_robin', default_owner_id: null })} className="text-primary" />
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><RefreshCw className="w-4 h-4" /> Rodízio</span>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {editingAgent.owner_distribution_type === 'round_robin' ? 'Leads são distribuídos alternadamente entre os responsáveis selecionados' : 'Todos os leads são atribuídos ao mesmo responsável'}
                </p>
              </div>
              {(editingAgent.owner_distribution_type === 'fixed' || !editingAgent.owner_distribution_type) && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Responsável Padrão</label>
                  <Select value={editingAgent.default_owner_id || ''} onValueChange={(value) => setEditingAgent({ ...editingAgent, default_owner_id: value || null })}>
                    <SelectTrigger><SelectValue placeholder="Selecione um responsável" /></SelectTrigger>
                    <SelectContent>{teamMembers.map((member) => (<SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
              )}
              {editingAgent.owner_distribution_type === 'round_robin' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">Responsáveis para Rotação</label>
                  <div className="space-y-2 max-h-48 overflow-y-auto bg-muted/50 rounded-lg p-3">
                    {teamMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum membro da equipe ativo</p>
                    ) : (
                      teamMembers.map((member) => {
                        const isSelected = editingAgent.owner_rotation_ids?.includes(member.id);
                        return (
                          <label key={member.id} className="flex items-center gap-3 p-2 rounded hover:bg-accent cursor-pointer">
                            <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                              const newIds = checked ? [...(editingAgent.owner_rotation_ids || []), member.id] : (editingAgent.owner_rotation_ids || []).filter(id => id !== member.id);
                              setEditingAgent({ ...editingAgent, owner_rotation_ids: newIds });
                            }} />
                            <span className="text-sm text-muted-foreground">{member.name}</span>
                            <span className="text-xs text-muted-foreground opacity-60">{member.email}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {editingAgent.owner_rotation_ids?.length > 0 && (
                    <p className="text-xs text-primary mt-2">{editingAgent.owner_rotation_ids.length} responsável(eis) selecionado(s)</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====== MAIN VIEW ======
  return (
    <>
      <PromptGeneratorSheet open={isGeneratorOpen} onOpenChange={setIsGeneratorOpen} onPromptGenerated={handlePromptGenerated} />

      <div className="space-y-6">
        {/* ===== WhatsApp Status Card ===== */}
        <div className={`rounded-xl border p-4 flex items-center justify-between transition-colors ${
          globalSettings.is_active 
            ? 'bg-emerald-500/10 border-emerald-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {globalSettings.is_active ? <Wifi className="w-5 h-5 text-emerald-400" /> : <WifiOff className="w-5 h-5 text-red-400" />}
            <div>
              <p className="text-sm font-medium text-foreground">
                {globalSettings.is_active ? 'Agente ativo — respondendo WhatsApp' : 'Agente inativo — não responde WhatsApp'}
              </p>
              <p className="text-xs text-muted-foreground">
                {globalSettings.is_active 
                  ? `Resposta automática ${globalSettings.auto_response_enabled ? 'habilitada' : 'desabilitada'} · Modelo: ${globalSettings.ai_model_mode}`
                  : 'Ative para que o agente responda mensagens automaticamente'}
              </p>
            </div>
          </div>
          <Switch checked={globalSettings.is_active} onCheckedChange={toggleWhatsAppActive} />
        </div>

        {/* ===== Global Config (collapsible) ===== */}
        <div className="rounded-xl border border-border bg-card/50">
          <button onClick={() => setShowGlobalConfig(!showGlobalConfig)} className="w-full flex items-center justify-between p-4 text-left">
            <div className="flex items-center gap-3">
              <Settings2 className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground text-sm">Configurações Globais</h3>
                <p className="text-xs text-muted-foreground">Prompt, modelo IA, horários, delays e empresa</p>
              </div>
            </div>
            {showGlobalConfig ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {showGlobalConfig && (
            <div className="px-4 pb-6 space-y-6 border-t border-border pt-4">
              {/* System Prompt */}
              <div className="rounded-xl border border-border bg-card/50 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-foreground">Prompt do Sistema</h3>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setIsGeneratorOpen(true)} className="text-primary hover:text-primary/80 hover:bg-primary/10">
                    <Sparkles className="w-4 h-4 mr-2" /> Gerar com IA
                  </Button>
                </div>
                <textarea
                  value={globalSettings.system_prompt_override || ''}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, system_prompt_override: e.target.value || null })}
                  placeholder="Defina personalidade, tom e instruções específicas..."
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono"
                />
                <p className="text-xs text-muted-foreground mt-2">Deixe em branco para usar o prompt padrão.</p>
                <details className="mt-3">
                  <summary className="text-xs text-primary cursor-pointer hover:text-primary/80 flex items-center gap-2">
                    <span>📋</span> Variáveis dinâmicas disponíveis
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-background border border-border text-xs font-mono space-y-1">
                    <div><span className="text-primary">{"{{ data_hora }}"}</span> → Data e hora atual</div>
                    <div><span className="text-primary">{"{{ data }}"}</span> → Apenas data</div>
                    <div><span className="text-primary">{"{{ hora }}"}</span> → Apenas hora</div>
                    <div><span className="text-primary">{"{{ dia_semana }}"}</span> → Dia da semana</div>
                    <div><span className="text-primary">{"{{ cliente_nome }}"}</span> → Nome do cliente</div>
                    <div><span className="text-primary">{"{{ cliente_telefone }}"}</span> → Telefone do cliente</div>
                  </div>
                </details>
              </div>

              {/* Company Info + Business Hours */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-border bg-card/50 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Building2 className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-foreground">Informações da Empresa</h3>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome da Empresa</label>
                      <input type="text" value={globalSettings.company_name || ''} onChange={(e) => setGlobalSettings({ ...globalSettings, company_name: e.target.value || null })} placeholder="Ex: OrbePet" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome do Agente</label>
                      <input type="text" value={globalSettings.sdr_name || ''} onChange={(e) => setGlobalSettings({ ...globalSettings, sdr_name: e.target.value || null })} placeholder="Ex: Orbi" className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-card/50 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Calendar className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-semibold text-foreground">Horário de Atendimento</h3>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Início</label>
                        <input type="time" value={globalSettings.business_hours_start} onChange={(e) => setGlobalSettings({ ...globalSettings, business_hours_start: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Fim</label>
                        <input type="time" value={globalSettings.business_hours_end} onChange={(e) => setGlobalSettings({ ...globalSettings, business_hours_end: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Dias da Semana</label>
                      <div className="flex gap-2">
                        {DAYS_OF_WEEK.map(day => (
                          <button key={day.value} onClick={() => toggleBusinessDay(day.value)} className={`flex-1 h-9 text-xs font-medium rounded-lg transition-all ${globalSettings.business_days.includes(day.value) ? 'bg-indigo-500 text-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Behavior & Timing */}
              <div className="rounded-xl border border-border bg-card/50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Bot className="w-5 h-5 text-violet-400" />
                  <h3 className="font-semibold text-foreground">Comportamento & Timing</h3>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {/* AI Model Selection */}
                    <div className="space-y-3">
                      <label className="text-xs font-medium text-muted-foreground">Modelo de IA</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: 'flash' as const, icon: '⚡', label: 'Flash', desc: 'Rápido' },
                          { key: 'pro' as const, icon: '🧠', label: 'Pro 2.5', desc: 'Inteligente' },
                          { key: 'pro3' as const, icon: '🚀', label: 'Pro 3', desc: 'Mais Recente' },
                          { key: 'adaptive' as const, icon: '🎯', label: 'Adaptativo', desc: 'Contexto' },
                        ]).map(m => (
                          <button key={m.key} type="button" onClick={() => setGlobalSettings({ ...globalSettings, ai_model_mode: m.key })}
                            className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${globalSettings.ai_model_mode === m.key ? 'bg-violet-500/20 border-violet-500 text-violet-300' : 'bg-background/50 border-border text-muted-foreground hover:bg-accent'}`}>
                            <span className="text-lg">{m.icon}</span>
                            <span className="text-xs font-medium">{m.label}</span>
                            <span className="text-[10px] text-center opacity-70">{m.desc}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {globalSettings.ai_model_mode === 'flash' && 'Gemini 2.5 Flash: respostas rápidas e econômicas'}
                        {globalSettings.ai_model_mode === 'pro' && 'Gemini 2.5 Pro: respostas elaboradas e inteligentes'}
                        {globalSettings.ai_model_mode === 'pro3' && 'Gemini 3 Pro: modelo mais recente e avançado'}
                        {globalSettings.ai_model_mode === 'adaptive' && 'Alterna automaticamente baseado no contexto da conversa'}
                      </p>
                    </div>
                    {/* Toggles */}
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-background/50 border border-border">
                      <span className="text-sm text-muted-foreground">Resposta Automática</span>
                      <Switch checked={globalSettings.auto_response_enabled} onCheckedChange={(checked) => setGlobalSettings({ ...globalSettings, auto_response_enabled: checked })} />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-background/50 border border-border">
                      <span className="text-sm text-muted-foreground">Quebrar Mensagens</span>
                      <Switch checked={globalSettings.message_breaking_enabled} onCheckedChange={(checked) => setGlobalSettings({ ...globalSettings, message_breaking_enabled: checked })} />
                    </div>
                  </div>
                  {/* Timing Sliders */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium text-muted-foreground">Delay Mínimo</label>
                        <span className="text-sm font-mono text-primary">{globalSettings.response_delay_min}s</span>
                      </div>
                      <input type="range" min="0" max="30" step="1" value={globalSettings.response_delay_min} onChange={(e) => setGlobalSettings({ ...globalSettings, response_delay_min: parseInt(e.target.value) })} className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-medium text-muted-foreground">Delay Máximo</label>
                        <span className="text-sm font-mono text-primary">{globalSettings.response_delay_max}s</span>
                      </div>
                      <input type="range" min="0" max="60" step="1" value={globalSettings.response_delay_max} onChange={(e) => setGlobalSettings({ ...globalSettings, response_delay_max: parseInt(e.target.value) })} className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ===== Agents Header ===== */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Agentes
            </h3>
            <p className="text-sm text-muted-foreground mt-1">Configure agentes especializados para diferentes tipos de atendimento.</p>
          </div>
          <Button variant="primary" size="sm" onClick={startCreating}>
            <Plus className="w-4 h-4 mr-1" /> Novo Agente
          </Button>
        </div>

        {/* Handoff Test */}
        <div className="bg-muted/50 border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Testar Detecção de Agente</span>
          </div>
          <div className="flex gap-2">
            <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !testing && testMessage.trim() && testHandoff()} className="flex-1 bg-card border border-border rounded px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Digite uma mensagem para testar..." />
            <Button variant="primary" size="sm" onClick={testHandoff} disabled={testing || agents.length === 0 || !testMessage.trim()}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
              Testar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Exemplos: "plano de saúde", "seguro de carga", "rctr-c", "convênio médico"</p>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`p-4 rounded-lg border ${testResult.success ? testResult.handoffOccurred ? 'bg-green-500/10 border-green-500/30' : 'bg-muted/50 border-border' : 'bg-red-500/10 border-red-500/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className={`w-4 h-4 ${testResult.success ? testResult.handoffOccurred ? 'text-green-400' : 'text-muted-foreground' : 'text-red-400'}`} />
              <span className="text-sm font-medium text-foreground">Resultado do Teste</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{testResult.message}</p>
            {testResult.success && (
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Mensagem:</span>
                  <code className="px-2 py-1 bg-muted rounded text-primary max-w-xs truncate">"{testResult.testedMessage}"</code>
                </div>
                {testResult.matchedKeyword && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Keyword:</span>
                    <code className="px-2 py-1 bg-primary/20 rounded text-primary">{testResult.matchedKeyword}</code>
                  </div>
                )}
                {testResult.handoffOccurred && (
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded">{testResult.previousAgent}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">{testResult.detectedAgent}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Agent Cards */}
        <div className="grid gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className={`bg-card/50 border rounded-lg p-4 ${agent.is_active ? 'border-border' : 'border-border opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${agent.is_default ? 'bg-amber-500/20' : 'bg-primary/20'}`}>
                    <Bot className={`w-5 h-5 ${agent.is_default ? 'text-amber-400' : 'text-primary'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground">{agent.name}</h4>
                      {agent.is_default && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Padrão</span>
                      )}
                      {!agent.is_active && (
                        <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">Inativo</span>
                      )}
                      {agent.audio_response_enabled && (
                        <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs rounded-full flex items-center gap-1"><Volume2 className="w-3 h-3" /> {getVoiceName(agent.elevenlabs_voice_id)}</span>
                      )}
                      {getDistributionBadge(agent as Agent)}
                    </div>
                    <p className="text-sm text-muted-foreground">{agent.description || agent.specialty}</p>
                    {agent.detection_keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {agent.detection_keywords.slice(0, 5).map((kw, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded">{kw}</span>
                        ))}
                        {agent.detection_keywords.length > 5 && (
                          <span className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded">+{agent.detection_keywords.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggleActive(agent.id, !agent.is_active)} className={`px-3 py-1 text-xs rounded ${agent.is_active ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                    {agent.is_active ? 'Ativo' : 'Inativo'}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => setEditingAgent(agent as Agent)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  {!agent.is_default && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(agent.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              {agent.qualification_questions && agent.qualification_questions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {agent.qualification_questions.length} perguntas de qualificação
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {agents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum agente configurado</p>
            <p className="text-sm">Crie seu primeiro agente para começar</p>
          </div>
        )}
      </div>
    </>
  );
});

AgentsSettings.displayName = 'AgentsSettings';

export default AgentsSettings;
