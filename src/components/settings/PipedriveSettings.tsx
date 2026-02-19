import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Eye, EyeOff, CheckCircle, XCircle, Loader2, ArrowRightLeft, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/Button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

export interface PipedriveSettingsRef {
  save: () => Promise<void>;
  cancel: () => void;
  isSaving: boolean;
}

interface FieldMapping {
  person_fields: Record<string, string>;
}

interface PipedriveSettings {
  pipedrive_api_token: string | null;
  pipedrive_domain: string | null;
  pipedrive_enabled: boolean;
  pipedrive_min_score: number;
  pipedrive_default_pipeline_id: string | null;
  pipedrive_field_mappings: FieldMapping | null;
}

const defaultFieldMappings: FieldMapping = {
  person_fields: {
    name: 'name',
    phone_number: 'phone',
    email: 'email',
    company: 'org_name',
    cnpj: '',
    tags: '',
    owner: '',
    cep: '',
    address: '',
    city: '',
    state: ''
  }
};

const SYSTEM_PERSON_FIELDS = [
  { key: 'name', label: 'Nome', description: 'Campo padrão: name' },
  { key: 'phone_number', label: 'Telefone', description: 'Campo padrão: phone' },
  { key: 'email', label: 'Email', description: 'Campo padrão: email' },
  { key: 'company', label: 'Empresa', description: 'Campo padrão: org_name' },
  { key: 'cnpj', label: 'CNPJ', description: 'Campo customizado - use o ID do Pipedrive' },
  { key: 'tags', label: 'Etiquetas', description: 'Tags do contato' },
  { key: 'owner', label: 'Responsável', description: 'Dono do negócio vinculado' },
  { key: 'cep', label: 'CEP', description: 'Campo customizado - use o ID do Pipedrive' },
  { key: 'address', label: 'Endereço Completo', description: 'Logradouro + Número + Complemento + Bairro' },
  { key: 'city', label: 'Cidade', description: 'Campo customizado - use o ID do Pipedrive' },
  { key: 'state', label: 'Estado', description: 'Campo customizado - use o ID do Pipedrive' }
];

const PipedriveSettings = forwardRef<PipedriveSettingsRef>((_, ref) => {
  const [settings, setSettings] = useState<PipedriveSettings>({
    pipedrive_api_token: '',
    pipedrive_domain: '',
    pipedrive_enabled: false,
    pipedrive_min_score: 70,
    pipedrive_default_pipeline_id: '',
    pipedrive_field_mappings: defaultFieldMappings
  });
  const [originalSettings, setOriginalSettings] = useState<PipedriveSettings | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pipelines, setPipelines] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('nina_settings')
      .select('pipedrive_api_token, pipedrive_domain, pipedrive_enabled, pipedrive_min_score, pipedrive_default_pipeline_id, pipedrive_field_mappings')
      .single();

    if (error) {
      console.error('Error fetching pipedrive settings:', error);
      return;
    }

    if (data) {
      const loadedSettings: PipedriveSettings = {
        pipedrive_api_token: data.pipedrive_api_token || '',
        pipedrive_domain: data.pipedrive_domain || '',
        pipedrive_enabled: data.pipedrive_enabled || false,
        pipedrive_min_score: data.pipedrive_min_score || 70,
        pipedrive_default_pipeline_id: data.pipedrive_default_pipeline_id || '',
        pipedrive_field_mappings: (data.pipedrive_field_mappings as unknown as FieldMapping) || defaultFieldMappings
      };
      setSettings(loadedSettings);
      setOriginalSettings(loadedSettings);
    }
  };

  const testConnection = async () => {
    if (!settings.pipedrive_api_token || !settings.pipedrive_domain) {
      toast.error('Preencha o token e o domínio do Pipedrive');
      return;
    }

    setIsTesting(true);
    setConnectionStatus('idle');

    try {
      const domain = settings.pipedrive_domain.replace('.pipedrive.com', '').replace('https://', '');
      const response = await fetch(
        `https://${domain}.pipedrive.com/api/v1/users/me?api_token=${settings.pipedrive_api_token}`
      );

      if (response.ok) {
        setConnectionStatus('success');
        toast.success('Conexão com Pipedrive estabelecida com sucesso!');
        fetchPipelines();
      } else {
        setConnectionStatus('error');
        toast.error('Falha na conexão. Verifique suas credenciais.');
      }
    } catch (error) {
      setConnectionStatus('error');
      toast.error('Erro ao conectar com Pipedrive');
    } finally {
      setIsTesting(false);
    }
  };

  const fetchPipelines = async () => {
    if (!settings.pipedrive_api_token || !settings.pipedrive_domain) return;

    setIsLoadingPipelines(true);
    try {
      const domain = settings.pipedrive_domain.replace('.pipedrive.com', '').replace('https://', '');
      const response = await fetch(
        `https://${domain}.pipedrive.com/api/v1/pipelines?api_token=${settings.pipedrive_api_token}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setPipelines(data.data.map((p: any) => ({ id: String(p.id), name: p.name })));
        }
      }
    } catch (error) {
      console.error('Error fetching pipelines:', error);
    } finally {
      setIsLoadingPipelines(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('nina_settings')
        .update({
          pipedrive_api_token: settings.pipedrive_api_token || null,
          pipedrive_domain: settings.pipedrive_domain || null,
          pipedrive_enabled: settings.pipedrive_enabled,
          pipedrive_min_score: settings.pipedrive_min_score,
          pipedrive_default_pipeline_id: settings.pipedrive_default_pipeline_id || null,
          pipedrive_field_mappings: settings.pipedrive_field_mappings as unknown as Json
        })
        .eq('id', (await supabase.from('nina_settings').select('id').single()).data?.id!);

      if (error) throw error;

      setOriginalSettings(settings);
      toast.success('Configurações do Pipedrive salvas com sucesso!');
    } catch (error) {
      console.error('Error saving pipedrive settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (originalSettings) {
      setSettings(originalSettings);
    }
  };

  const updateFieldMapping = (systemField: string, pipedriveField: string) => {
    setSettings(prev => ({
      ...prev,
      pipedrive_field_mappings: {
        ...prev.pipedrive_field_mappings!,
        person_fields: {
          ...prev.pipedrive_field_mappings!.person_fields,
          [systemField]: pipedriveField
        }
      }
    }));
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
    cancel: handleCancel,
    isSaving
  }));

  return (
    <div className="space-y-8">
      {/* Seção de Credenciais */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          🔑 Credenciais da API
        </h3>
        
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="pipedrive_domain" className="text-slate-300">Domínio Pipedrive</Label>
            <Input
              id="pipedrive_domain"
              value={settings.pipedrive_domain || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, pipedrive_domain: e.target.value }))}
              placeholder="empresa"
              className="bg-slate-800 border-slate-700 text-white"
            />
            <p className="text-xs text-slate-500">Apenas o subdomínio (ex: empresa, não empresa.pipedrive.com)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pipedrive_api_token" className="text-slate-300">API Token</Label>
            <div className="relative">
              <Input
                id="pipedrive_api_token"
                type={showToken ? 'text' : 'password'}
                value={settings.pipedrive_api_token || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, pipedrive_api_token: e.target.value }))}
                placeholder="Seu token de API do Pipedrive"
                className="bg-slate-800 border-slate-700 text-white pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-500">Encontrado em Configurações → Informações pessoais → API</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={testConnection}
              disabled={isTesting || !settings.pipedrive_api_token || !settings.pipedrive_domain}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Testar Conexão
            </Button>
            
            {connectionStatus === 'success' && (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" /> Conectado
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="flex items-center gap-1 text-red-400 text-sm">
                <XCircle className="w-4 h-4" /> Falha na conexão
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Seção de Sincronização */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          ⚡ Sincronização Automática
        </h3>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-slate-300">Habilitar Integração</Label>
              <p className="text-xs text-slate-500 mt-1">
                Sincroniza automaticamente leads qualificados para o Pipedrive
              </p>
            </div>
            <Switch
              checked={settings.pipedrive_enabled}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, pipedrive_enabled: checked }))}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">Score Mínimo de Qualificação</Label>
              <span className="text-cyan-400 font-mono">{settings.pipedrive_min_score}%</span>
            </div>
            <Slider
              value={[settings.pipedrive_min_score]}
              onValueChange={([value]) => setSettings(prev => ({ ...prev, pipedrive_min_score: value }))}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-slate-500">
              Leads com score igual ou superior serão sincronizados automaticamente
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Pipeline Padrão no Pipedrive</Label>
            <select
              value={settings.pipedrive_default_pipeline_id || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, pipedrive_default_pipeline_id: e.target.value }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white"
              disabled={pipelines.length === 0}
            >
              <option value="">Selecione um pipeline</option>
              {pipelines.map(pipeline => (
                <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>
              ))}
            </select>
            {pipelines.length === 0 && (
              <p className="text-xs text-slate-500">
                Teste a conexão primeiro para carregar os pipelines disponíveis
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Seção de Mapeamento de Campos */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5" />
          Mapeamento de Campos
        </h3>

        <div className="space-y-6">
          {/* Campos de Pessoa */}
          <div>
            <h4 className="text-sm font-medium text-slate-400 mb-3">Campos de Pessoa (Contato)</h4>
            <div className="bg-slate-800/50 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-xs text-slate-400 px-4 py-2">Campo do Sistema</th>
                    <th className="text-center text-xs text-slate-400 px-4 py-2">→</th>
                    <th className="text-left text-xs text-slate-400 px-4 py-2">Campo no Pipedrive</th>
                  </tr>
                </thead>
                <tbody>
                  {SYSTEM_PERSON_FIELDS.map(field => (
                    <tr key={field.key} className="border-b border-slate-700/50 last:border-0">
                      <td className="px-4 py-2">
                        <div>
                          <span className="text-slate-300">{field.label}</span>
                          <p className="text-xs text-slate-500">{field.description}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center text-slate-500">→</td>
                      <td className="px-4 py-2">
                        <Input
                          value={settings.pipedrive_field_mappings?.person_fields?.[field.key] || ''}
                          onChange={(e) => updateFieldMapping(field.key, e.target.value)}
                          placeholder={['cnpj', 'cep', 'address', 'city', 'state', 'tags', 'owner'].includes(field.key) ? 'ID do campo customizado' : 'nome_campo_pipedrive'}
                          className="bg-slate-700 border-slate-600 text-white text-sm h-8"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


          <p className="text-xs text-slate-500">
            Para campos customizados do Pipedrive, use o identificador do campo (ex: "12345abcd" para um campo personalizado).
          </p>
        </div>
      </div>
    </div>
  );
});

PipedriveSettings.displayName = 'PipedriveSettings';

export default PipedriveSettings;
