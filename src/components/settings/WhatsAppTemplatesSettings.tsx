import React, { useState, useEffect } from 'react';
import { RefreshCw, Loader2, Check, Clock, X, AlertCircle, MessageSquare, FileText, Trash2, Activity, CheckCircle2, AlertTriangle, XCircle, Wifi, Database, Shield } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { TemplateNotificationBell } from './TemplateNotificationBell';

interface WhatsAppTemplate {
  id: string;
  meta_template_id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  components: any[] | null;
  variables_count: number | null;
  last_synced_at: string | null;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    configuration?: {
      status: 'ok' | 'warning' | 'error';
      details?: {
        has_access_token: boolean;
        has_phone_number_id: boolean;
        has_waba_id: boolean;
        has_verify_token: boolean;
        token_length: number;
      };
      error?: string;
    };
    whatsapp_api?: {
      status: 'ok' | 'error' | 'skipped';
      phone_number_id?: string;
      waba_id?: string;
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: string;
    };
    webhook?: {
      status: 'ok' | 'warning';
      callback_url?: string;
      verify_token_configured?: boolean;
    };
  };
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
  };
}

const WhatsAppTemplatesSettings: React.FC = () => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<HealthCheckResult | null>(null);
  const [showHealthSheet, setShowHealthSheet] = useState(false);

  const disabledCount = templates.filter(t => t.status === 'DISABLED').length;

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .order('name');

      if (error) throw error;
      setTemplates((data || []) as unknown as WhatsAppTemplate[]);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-whatsapp-templates');

      if (error) throw error;

      if (data.success) {
        toast.success(`Sincronização concluída: ${data.synced} templates`);
        await fetchTemplates();
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Error syncing templates:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar templates');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteDisabled = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('whatsapp_templates')
        .delete()
        .eq('status', 'DISABLED');

      if (error) throw error;

      toast.success(`${disabledCount} templates desativados excluídos`);
      await fetchTemplates();
    } catch (error) {
      console.error('Error deleting disabled templates:', error);
      toast.error('Erro ao excluir templates desativados');
    } finally {
      setDeleting(false);
    }
  };

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-webhook-health');
      
      if (error) throw error;
      
      setHealthResult(data);
      setShowHealthSheet(true);
      
      if (data.status === 'healthy') {
        toast.success('Webhook saudável! Todas as verificações passaram.');
      } else if (data.status === 'degraded') {
        toast.warning('Webhook com problemas parciais.');
      } else {
        toast.error('Webhook com falhas críticas!');
      }
    } catch (error) {
      console.error('Error checking health:', error);
      toast.error('Erro ao verificar saúde do webhook');
    } finally {
      setCheckingHealth(false);
    }
  };

  const getHealthStatusConfig = (status: string) => {
    const configs = {
      healthy: {
        icon: <CheckCircle2 className="w-8 h-8" />,
        color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        label: 'Saudável',
        description: 'Todas as verificações passaram'
      },
      degraded: {
        icon: <AlertTriangle className="w-8 h-8" />,
        color: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        label: 'Degradado',
        description: 'Alguns problemas detectados'
      },
      unhealthy: {
        icon: <XCircle className="w-8 h-8" />,
        color: 'bg-red-500/10 border-red-500/30 text-red-400',
        label: 'Com Falhas',
        description: 'Problemas críticos encontrados'
      }
    };
    return configs[status as keyof typeof configs] || configs.unhealthy;
  };

  const getCheckStatusIcon = (status: string) => {
    if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    if (status === 'skipped') return <Clock className="w-4 h-4 text-slate-400" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  const getStatusBadge = (status: string | null) => {
    const configs: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
      APPROVED: { icon: <Check className="w-3 h-3" />, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Aprovado' },
      PENDING: { icon: <Clock className="w-3 h-3" />, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Pendente' },
      REJECTED: { icon: <X className="w-3 h-3" />, color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Rejeitado' },
      DISABLED: { icon: <AlertCircle className="w-3 h-3" />, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Desativado' },
    };
    const config = configs[status || 'PENDING'] || configs.PENDING;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  const getCategoryBadge = (category: string | null) => {
    const configs: Record<string, { color: string; label: string }> = {
      MARKETING: { color: 'bg-purple-500/20 text-purple-400', label: 'Marketing' },
      UTILITY: { color: 'bg-blue-500/20 text-blue-400', label: 'Utilitário' },
      AUTHENTICATION: { color: 'bg-cyan-500/20 text-cyan-400', label: 'Autenticação' },
    };
    const config = configs[category || 'UTILITY'] || { color: 'bg-slate-500/20 text-slate-400', label: category || 'Outro' };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const renderTemplatePreview = (template: WhatsAppTemplate) => {
    const header = template.components?.find((c: any) => c.type === 'HEADER');
    const body = template.components?.find((c: any) => c.type === 'BODY');
    const footer = template.components?.find((c: any) => c.type === 'FOOTER');
    const buttons = template.components?.find((c: any) => c.type === 'BUTTONS');

    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 max-w-sm">
        {/* Header */}
        {header && (
          <div className="mb-2 font-medium text-slate-200">
            {header.format === 'TEXT' && header.text}
            {header.format === 'IMAGE' && (
              <div className="bg-slate-700/50 rounded h-32 flex items-center justify-center text-slate-500">
                [Imagem]
              </div>
            )}
          </div>
        )}
        
        {/* Body */}
        {body && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap">
            {body.text}
          </div>
        )}
        
        {/* Footer */}
        {footer && (
          <div className="mt-2 text-xs text-slate-500">
            {footer.text}
          </div>
        )}
        
        {/* Buttons */}
        {buttons && buttons.buttons && (
          <div className="mt-3 flex flex-col gap-1">
            {buttons.buttons.map((btn: any, i: number) => (
              <div key={i} className="text-center py-1.5 text-sm text-cyan-400 border border-cyan-500/30 rounded">
                {btn.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Templates WhatsApp
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie templates de mensagem aprovados pela Meta para campanhas ativas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TemplateNotificationBell />
          {disabledCount > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="secondary"
                  disabled={deleting}
                  className="gap-2 border-red-500/30 text-red-400 hover:bg-red-500/10"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Excluir Desativados ({disabledCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-900 border-slate-700">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Excluir templates desativados?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    Isso irá excluir permanentemente {disabledCount} template{disabledCount > 1 ? 's' : ''} desativado{disabledCount > 1 ? 's' : ''} do banco de dados.
                    Eles podem ser reimportados sincronizando com a Meta novamente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
                    Cancelar
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteDisabled}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Excluir {disabledCount} template{disabledCount > 1 ? 's' : ''}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            variant="secondary"
            onClick={handleCheckHealth}
            disabled={checkingHealth}
            className="gap-2 border-green-500/30 text-green-400 hover:bg-green-500/10"
          >
            {checkingHealth ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Activity className="w-4 h-4" />
            )}
            Verificar Webhook
          </Button>
          <Button
            variant="secondary"
            onClick={handleSync}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Sincronizar com Meta
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-4">
        <div className="flex gap-3">
          <FileText className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-green-400 mb-1">Como funciona</p>
            <p>
              Os templates são criados e aprovados no{' '}
              <a 
                href="https://business.facebook.com/wa/manage/message-templates" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                WhatsApp Manager da Meta
              </a>
              . Clique em "Sincronizar" para importar os templates aprovados e usá-los no chat.
            </p>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-300 mb-1">Nenhum template encontrado</h3>
          <p className="text-sm text-slate-500 mb-4">
            Clique em "Sincronizar com Meta" para importar seus templates
          </p>
          <Button variant="secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              className={`bg-slate-800/50 border rounded-lg p-4 cursor-pointer transition-all hover:border-cyan-500/50 ${
                selectedTemplate?.id === template.id ? 'border-cyan-500' : 'border-slate-700/50'
              }`}
              onClick={() => setSelectedTemplate(selectedTemplate?.id === template.id ? null : template)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-white">{template.name}</h4>
                    {getStatusBadge(template.status)}
                    {getCategoryBadge(template.category)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>Idioma: {template.language}</span>
                    <span>Variáveis: {template.variables_count}</span>
                    {template.last_synced_at && (
                      <span>
                        Sincronizado: {new Date(template.last_synced_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Expanded preview */}
              {selectedTemplate?.id === template.id && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 mb-2">Preview do template:</p>
                  {renderTemplatePreview(template)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {templates.length > 0 && (
        <div className="flex gap-4 text-sm text-slate-400">
          <span>Total: {templates.length}</span>
          <span>Aprovados: {templates.filter(t => t.status === 'APPROVED').length}</span>
          <span>Pendentes: {templates.filter(t => t.status === 'PENDING').length}</span>
          {disabledCount > 0 && (
            <span className="text-red-400/70">Desativados: {disabledCount}</span>
          )}
        </div>
      )}

      {/* Health Check Sheet */}
      <Sheet open={showHealthSheet} onOpenChange={setShowHealthSheet}>
        <SheetContent className="bg-slate-900 border-slate-700 w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              Saúde do Webhook WhatsApp
            </SheetTitle>
          </SheetHeader>
          
          {healthResult && (
            <div className="mt-6 space-y-6">
              {/* Status Geral */}
              <div className={`p-4 rounded-lg border ${getHealthStatusConfig(healthResult.status).color}`}>
                <div className="flex items-center gap-4">
                  {getHealthStatusConfig(healthResult.status).icon}
                  <div>
                    <h3 className="font-semibold text-lg">{getHealthStatusConfig(healthResult.status).label}</h3>
                    <p className="text-sm opacity-70">
                      {healthResult.summary.passed}/{healthResult.summary.total_checks} verificações OK
                    </p>
                  </div>
                </div>
              </div>

              {/* Verificações Detalhadas */}
              <div className="space-y-4">
                {/* Configuração */}
                {healthResult.checks.configuration && (
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Database className="w-4 h-4 text-slate-400" />
                      <h4 className="font-medium text-white">Configuração</h4>
                      {getCheckStatusIcon(healthResult.checks.configuration.status)}
                    </div>
                    {healthResult.checks.configuration.details && (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Access Token</span>
                          <span className={healthResult.checks.configuration.details.has_access_token ? 'text-emerald-400' : 'text-red-400'}>
                            {healthResult.checks.configuration.details.has_access_token 
                              ? `✓ Configurado (${healthResult.checks.configuration.details.token_length} chars)` 
                              : '✗ Não configurado'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Phone Number ID</span>
                          <span className={healthResult.checks.configuration.details.has_phone_number_id ? 'text-emerald-400' : 'text-red-400'}>
                            {healthResult.checks.configuration.details.has_phone_number_id ? '✓ Configurado' : '✗ Não configurado'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>WABA ID</span>
                          <span className={healthResult.checks.configuration.details.has_waba_id ? 'text-emerald-400' : 'text-red-400'}>
                            {healthResult.checks.configuration.details.has_waba_id ? '✓ Configurado' : '✗ Não configurado'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Verify Token</span>
                          <span className={healthResult.checks.configuration.details.has_verify_token ? 'text-emerald-400' : 'text-amber-400'}>
                            {healthResult.checks.configuration.details.has_verify_token ? '✓ Configurado' : '⚠ Não configurado'}
                          </span>
                        </div>
                      </div>
                    )}
                    {healthResult.checks.configuration.error && (
                      <p className="text-sm text-red-400 mt-2">{healthResult.checks.configuration.error}</p>
                    )}
                  </div>
                )}

                {/* API WhatsApp */}
                {healthResult.checks.whatsapp_api && (
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Wifi className="w-4 h-4 text-slate-400" />
                      <h4 className="font-medium text-white">API WhatsApp</h4>
                      {getCheckStatusIcon(healthResult.checks.whatsapp_api.status)}
                    </div>
                    {healthResult.checks.whatsapp_api.status === 'ok' && (
                      <div className="space-y-2 text-sm">
                        {healthResult.checks.whatsapp_api.display_phone_number && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Número</span>
                            <span className="text-white font-mono">{healthResult.checks.whatsapp_api.display_phone_number}</span>
                          </div>
                        )}
                        {healthResult.checks.whatsapp_api.verified_name && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Nome Verificado</span>
                            <span className="text-emerald-400">{healthResult.checks.whatsapp_api.verified_name}</span>
                          </div>
                        )}
                        {healthResult.checks.whatsapp_api.quality_rating && (
                          <div className="flex items-center justify-between text-slate-400">
                            <span>Qualidade</span>
                            <span className={
                              healthResult.checks.whatsapp_api.quality_rating === 'GREEN' ? 'text-emerald-400' :
                              healthResult.checks.whatsapp_api.quality_rating === 'YELLOW' ? 'text-amber-400' : 'text-red-400'
                            }>
                              {healthResult.checks.whatsapp_api.quality_rating}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    {healthResult.checks.whatsapp_api.status === 'skipped' && (
                      <p className="text-sm text-slate-500">Verificação ignorada (configuração ausente)</p>
                    )}
                    {healthResult.checks.whatsapp_api.error && (
                      <p className="text-sm text-red-400 mt-2">{healthResult.checks.whatsapp_api.error}</p>
                    )}
                  </div>
                )}

                {/* Webhook */}
                {healthResult.checks.webhook && (
                  <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-slate-400" />
                      <h4 className="font-medium text-white">Webhook</h4>
                      {getCheckStatusIcon(healthResult.checks.webhook.status)}
                    </div>
                    <div className="space-y-2 text-sm">
                      {healthResult.checks.webhook.callback_url && (
                        <div className="text-slate-400">
                          <span className="block text-xs text-slate-500 mb-1">URL do Callback</span>
                          <span className="text-xs font-mono text-slate-300 break-all">
                            {healthResult.checks.webhook.callback_url}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Verify Token</span>
                        <span className={healthResult.checks.webhook.verify_token_configured ? 'text-emerald-400' : 'text-amber-400'}>
                          {healthResult.checks.webhook.verify_token_configured ? '✓ Configurado' : '⚠ Não configurado'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <div className="text-xs text-slate-500 text-center pt-4 border-t border-slate-700/50">
                Verificado em: {new Date(healthResult.timestamp).toLocaleString('pt-BR')}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default WhatsAppTemplatesSettings;
