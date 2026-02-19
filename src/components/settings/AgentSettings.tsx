import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Bot, Loader2, Calendar, Sparkles, Building2 } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import PromptGeneratorSheet from './PromptGeneratorSheet';

interface AgentSettings {
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

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

const DEFAULT_PROMPT = `Você é um assistente virtual profissional. Seja prestativo, amigável e eficiente no atendimento.`;

export interface AgentSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

const AgentSettings = forwardRef<AgentSettingsRef, {}>((props, ref) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>({
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

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: loadSettings,
    isSaving: saving
  }));

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('nina_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      // Se não existe registro, criar um padrão automaticamente
      if (!data) {
        console.log('[AgentSettings] No settings found, creating default...');
        const { data: newData, error: insertError } = await supabase
          .from('nina_settings')
          .insert({})
          .select('*')
          .single();

        if (insertError) {
          console.error('[AgentSettings] Error creating default settings:', insertError);
          toast.error('Erro ao criar configurações iniciais');
        } else if (newData) {
          setSettings({
            id: newData.id,
            system_prompt_override: newData.system_prompt_override,
            is_active: newData.is_active,
            auto_response_enabled: newData.auto_response_enabled,
            ai_model_mode: (newData.ai_model_mode === 'flash' || newData.ai_model_mode === 'pro' || newData.ai_model_mode === 'pro3' || newData.ai_model_mode === 'adaptive') 
              ? newData.ai_model_mode 
              : 'flash',
            message_breaking_enabled: newData.message_breaking_enabled,
            response_delay_min: newData.response_delay_min,
            response_delay_max: newData.response_delay_max,
            business_hours_start: newData.business_hours_start,
            business_hours_end: newData.business_hours_end,
            business_days: newData.business_days,
            company_name: newData.company_name,
            sdr_name: newData.sdr_name,
          });
        }
      } else {
        setSettings({
          id: data.id,
          system_prompt_override: data.system_prompt_override,
          is_active: data.is_active,
          auto_response_enabled: data.auto_response_enabled,
          ai_model_mode: (data.ai_model_mode === 'flash' || data.ai_model_mode === 'pro' || data.ai_model_mode === 'pro3' || data.ai_model_mode === 'adaptive') 
            ? data.ai_model_mode 
            : 'flash',
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
      console.error('[AgentSettings] Error loading settings:', error);
      toast.error('Erro ao carregar configurações do agente');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('nina_settings')
        .update({
          system_prompt_override: settings.system_prompt_override,
          is_active: settings.is_active,
          auto_response_enabled: settings.auto_response_enabled,
          ai_model_mode: settings.ai_model_mode,
          message_breaking_enabled: settings.message_breaking_enabled,
          response_delay_min: settings.response_delay_min,
          response_delay_max: settings.response_delay_max,
          business_hours_start: settings.business_hours_start,
          business_hours_end: settings.business_hours_end,
          business_days: settings.business_days,
          company_name: settings.company_name,
          sdr_name: settings.sdr_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id!);

      if (error) throw error;

      toast.success('Configurações do agente salvas com sucesso!');
    } catch (error) {
      console.error('Error saving agent settings:', error);
      toast.error('Erro ao salvar configurações do agente');
    } finally {
      setSaving(false);
    }
  };

  const toggleBusinessDay = (day: number) => {
    setSettings(prev => ({
      ...prev,
      business_days: prev.business_days.includes(day)
        ? prev.business_days.filter(d => d !== day)
        : [...prev.business_days, day].sort()
    }));
  };

  const handlePromptGenerated = (prompt: string) => {
    setSettings(prev => ({ ...prev, system_prompt_override: prompt }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <>
      <PromptGeneratorSheet
        open={isGeneratorOpen}
        onOpenChange={setIsGeneratorOpen}
        onPromptGenerated={handlePromptGenerated}
      />
      
      <div className="space-y-6">
        {/* System Prompt - PRIMEIRA SEÇÃO */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Bot className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-white">Prompt do Sistema</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsGeneratorOpen(true)}
              className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar com IA
            </Button>
          </div>
          <textarea
            value={settings.system_prompt_override || ''}
            onChange={(e) => setSettings({ ...settings, system_prompt_override: e.target.value || null })}
            placeholder={DEFAULT_PROMPT}
            rows={4}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none font-mono"
          />
          <p className="text-xs text-slate-500 mt-2">
            Deixe em branco para usar o prompt padrão. Defina personalidade, tom e instruções específicas.
          </p>
          <details className="mt-3">
            <summary className="text-xs text-cyan-400 cursor-pointer hover:text-cyan-300 flex items-center gap-2">
              <span>📋</span> Variáveis dinâmicas disponíveis
            </summary>
            <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
              <div><span className="text-cyan-400">{"{{ data_hora }}"}</span> → Data e hora atual (ex: 29/11/2024 14:35:22)</div>
              <div><span className="text-cyan-400">{"{{ data }}"}</span> → Apenas data (ex: 29/11/2024)</div>
              <div><span className="text-cyan-400">{"{{ hora }}"}</span> → Apenas hora (ex: 14:35:22)</div>
              <div><span className="text-cyan-400">{"{{ dia_semana }}"}</span> → Dia da semana por extenso (ex: sexta-feira)</div>
              <div><span className="text-cyan-400">{"{{ cliente_nome }}"}</span> → Nome do cliente na conversa</div>
              <div><span className="text-cyan-400">{"{{ cliente_telefone }}"}</span> → Telefone do cliente</div>
            </div>
          </details>
        </div>

        {/* 2-Column Grid: Company Info + Business Hours */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Info */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-white">Informações da Empresa</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome da Empresa</label>
                <input
                  type="text"
                  value={settings.company_name || ''}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value || null })}
                  placeholder="Ex: Viver de IA"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome do SDR</label>
                <input
                  type="text"
                  value={settings.sdr_name || ''}
                  onChange={(e) => setSettings({ ...settings, sdr_name: e.target.value || null })}
                  placeholder="Ex: Lucas"
                  className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>

          {/* Business Hours */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-white">Horário de Atendimento</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Início</label>
                  <input
                    type="time"
                    value={settings.business_hours_start}
                    onChange={(e) => setSettings({ ...settings, business_hours_start: e.target.value })}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">Fim</label>
                  <input
                    type="time"
                    value={settings.business_hours_end}
                    onChange={(e) => setSettings({ ...settings, business_hours_end: e.target.value })}
                    className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Dias da Semana</label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      onClick={() => toggleBusinessDay(day.value)}
                      className={`flex-1 h-9 text-xs font-medium rounded-lg transition-all ${
                        settings.business_days.includes(day.value)
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Behavior & Timing Combined */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bot className="w-5 h-5 text-violet-400" />
            <h3 className="font-semibold text-white">Comportamento & Timing</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Model Selection + Toggles */}
            <div className="space-y-3">
              {/* AI Model Selection */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-400">Modelo de IA</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ai_model_mode: 'flash' })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                      settings.ai_model_mode === 'flash'
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">⚡</span>
                    <span className="text-xs font-medium">Flash</span>
                    <span className="text-[10px] text-center opacity-70">Rápido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ai_model_mode: 'pro' })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                      settings.ai_model_mode === 'pro'
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">🧠</span>
                    <span className="text-xs font-medium">Pro 2.5</span>
                    <span className="text-[10px] text-center opacity-70">Inteligente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ai_model_mode: 'pro3' })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                      settings.ai_model_mode === 'pro3'
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">🚀</span>
                    <span className="text-xs font-medium">Pro 3</span>
                    <span className="text-[10px] text-center opacity-70">Mais Recente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, ai_model_mode: 'adaptive' })}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-all ${
                      settings.ai_model_mode === 'adaptive'
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">🎯</span>
                    <span className="text-xs font-medium">Adaptativo</span>
                    <span className="text-[10px] text-center opacity-70">Contexto</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {settings.ai_model_mode === 'flash' && 'Gemini 2.5 Flash: respostas rápidas e econômicas'}
                  {settings.ai_model_mode === 'pro' && 'Gemini 2.5 Pro: respostas elaboradas e inteligentes'}
                  {settings.ai_model_mode === 'pro3' && 'Gemini 3 Pro: modelo mais recente e avançado'}
                  {settings.ai_model_mode === 'adaptive' && 'Alterna automaticamente baseado no contexto da conversa'}
                </p>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-sm text-slate-300">Nina Ativa</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.is_active}
                    onChange={(e) => setSettings({ ...settings, is_active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-sm text-slate-300">Resposta Automática</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.auto_response_enabled}
                    onChange={(e) => setSettings({ ...settings, auto_response_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800">
                <span className="text-sm text-slate-300">Quebrar Mensagens</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.message_breaking_enabled}
                    onChange={(e) => setSettings({ ...settings, message_breaking_enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
            </div>

            {/* Timing Sliders */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-400">Delay Mínimo</label>
                  <span className="text-sm font-mono text-cyan-400">{settings.response_delay_min}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={settings.response_delay_min}
                  onChange={(e) => setSettings({ ...settings, response_delay_min: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium text-slate-400">Delay Máximo</label>
                  <span className="text-sm font-mono text-cyan-400">{settings.response_delay_max}s</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={settings.response_delay_max}
                  onChange={(e) => setSettings({ ...settings, response_delay_max: parseInt(e.target.value) })}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
});

AgentSettings.displayName = 'AgentSettings';

export default AgentSettings;
