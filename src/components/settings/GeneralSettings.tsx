import React, { useState, useEffect } from 'react';
import { Bell, Volume2, VolumeX, Facebook, MessageSquare, Mail, Pencil, Search, Receipt } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { playNotificationSound, isNotificationSoundEnabled, setNotificationSoundEnabled } from '@/utils/notificationSound';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import EmailTemplateEditorModal from './EmailTemplateEditorModal';

interface EmailTemplate {
  id: string;
  name: string;
}

interface FullEmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string | null;
  is_active: boolean | null;
}

const GeneralSettings: React.FC = () => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [facebookTemplate, setFacebookTemplate] = useState('lead_facebook_meta');
  const [emailTemplateId, setEmailTemplateId] = useState<string>('none');
  const [googleTemplate, setGoogleTemplate] = useState('lead_google_ads');
  const [googleEmailTemplateId, setGoogleEmailTemplateId] = useState<string>('none');
  const [approvedTemplates, setApprovedTemplates] = useState<{ name: string }[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Channel enable states
  const [facebookWhatsappEnabled, setFacebookWhatsappEnabled] = useState(true);
  const [facebookEmailEnabled, setFacebookEmailEnabled] = useState(true);
  const [googleWhatsappEnabled, setGoogleWhatsappEnabled] = useState(true);
  const [googleEmailEnabled, setGoogleEmailEnabled] = useState(true);
  
  // Editor modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<FullEmailTemplate | null>(null);
  
  // Collection email settings
  const [collectionEmailFrom, setCollectionEmailFrom] = useState('');
  const [collectionEmailBcc, setCollectionEmailBcc] = useState('');
  const [savingCollectionEmail, setSavingCollectionEmail] = useState(false);

  useEffect(() => {
    setSoundEnabled(isNotificationSoundEnabled());
    fetchSettings();
    fetchTemplates();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('nina_settings')
      .select('facebook_lead_template, facebook_lead_email_template, google_lead_template, google_lead_email_template, facebook_whatsapp_enabled, facebook_email_enabled, google_whatsapp_enabled, google_email_enabled, collection_email_from, collection_email_bcc')
      .single();
    
    if (data?.facebook_lead_template) {
      setFacebookTemplate(data.facebook_lead_template);
    }
    if (data?.facebook_lead_email_template) {
      setEmailTemplateId(data.facebook_lead_email_template);
    } else {
      setEmailTemplateId('none');
    }
    if (data?.google_lead_template) {
      setGoogleTemplate(data.google_lead_template);
    }
    if (data?.google_lead_email_template) {
      setGoogleEmailTemplateId(data.google_lead_email_template);
    } else {
      setGoogleEmailTemplateId('none');
    }
    
    // Load channel enable states (default to true if not set)
    setFacebookWhatsappEnabled(data?.facebook_whatsapp_enabled ?? true);
    setFacebookEmailEnabled(data?.facebook_email_enabled ?? true);
    setGoogleWhatsappEnabled(data?.google_whatsapp_enabled ?? true);
    setGoogleEmailEnabled(data?.google_email_enabled ?? true);
    
    // Load collection email settings
    if (data?.collection_email_from) {
      setCollectionEmailFrom(data.collection_email_from);
    }
    if (data?.collection_email_bcc) {
      setCollectionEmailBcc((data.collection_email_bcc as string[]).join(', '));
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    
    // Fetch WhatsApp templates
    const { data: waTemplates } = await supabase
      .from('whatsapp_templates')
      .select('name')
      .eq('status', 'APPROVED')
      .order('name');
    
    if (waTemplates) {
      setApprovedTemplates(waTemplates);
    }
    
    // Fetch Email templates
    const { data: emTemplates } = await supabase
      .from('email_templates')
      .select('id, name')
      .eq('is_active', true)
      .order('name');
    
    if (emTemplates) {
      setEmailTemplates(emTemplates);
    }
    
    setLoading(false);
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);
    
    if (enabled) {
      playNotificationSound();
      toast.success('Som de notificação ativado');
    } else {
      toast.info('Som de notificação desativado');
    }
  };

  const handleTestSound = () => {
    if (soundEnabled) {
      playNotificationSound();
    }
  };

  const handleToggleChannel = async (source: 'facebook' | 'google', channel: 'whatsapp' | 'email', enabled: boolean) => {
    const fieldName = `${source}_${channel}_enabled`;
    
    try {
      const { error } = await supabase
        .from('nina_settings')
        .update({ [fieldName]: enabled })
        .not('id', 'is', null);
      
      if (error) throw error;
      
      // Update local state
      if (source === 'facebook' && channel === 'whatsapp') setFacebookWhatsappEnabled(enabled);
      if (source === 'facebook' && channel === 'email') setFacebookEmailEnabled(enabled);
      if (source === 'google' && channel === 'whatsapp') setGoogleWhatsappEnabled(enabled);
      if (source === 'google' && channel === 'email') setGoogleEmailEnabled(enabled);
      
      const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'Email';
      const sourceLabel = source === 'facebook' ? 'Facebook' : 'Google';
      
      toast.success(`${channelLabel} ${sourceLabel} ${enabled ? 'ativado' : 'pausado'}`);
    } catch (error) {
      console.error('Error toggling channel:', error);
      toast.error('Erro ao alterar configuração');
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('nina_settings')
        .update({ 
          facebook_lead_template: facebookTemplate,
          facebook_lead_email_template: emailTemplateId === 'none' ? null : emailTemplateId,
          google_lead_template: googleTemplate,
          google_lead_email_template: googleEmailTemplateId === 'none' ? null : googleEmailTemplateId
        })
        .not('id', 'is', null);
      
      if (error) throw error;
      toast.success('Configurações salvas com sucesso');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCollectionEmailSettings = async () => {
    setSavingCollectionEmail(true);
    try {
      const bccArray = collectionEmailBcc
        .split(',')
        .map(e => e.trim())
        .filter(e => e.length > 0);
      
      const { error } = await supabase
        .from('nina_settings')
        .update({
          collection_email_from: collectionEmailFrom || null,
          collection_email_bcc: bccArray.length > 0 ? bccArray : null
        })
        .not('id', 'is', null);
      
      if (error) throw error;
      toast.success('Configurações de email de cobrança salvas');
    } catch (error) {
      console.error('Error saving collection email settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSavingCollectionEmail(false);
    }
  };

  const handleEditTemplate = async () => {
    if (emailTemplateId === 'none') {
      toast.error('Selecione um template para editar');
      return;
    }
    
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', emailTemplateId)
      .single();
    
    if (error) {
      toast.error('Erro ao carregar template');
      return;
    }
    
    if (data) {
      setSelectedTemplate(data as FullEmailTemplate);
      setIsEditorOpen(true);
    }
  };

  const handleSaveTemplate = async (template: Partial<FullEmailTemplate>) => {
    if (!selectedTemplate?.id) {
      throw new Error('Nenhum template selecionado');
    }
    
    const { error } = await supabase
      .from('email_templates')
      .update({
        name: template.name,
        subject: template.subject,
        body_html: template.body_html,
        category: template.category
      })
      .eq('id', selectedTemplate.id);
    
    if (error) {
      throw new Error(error.message || 'Erro ao atualizar template');
    }
    
    // Refresh templates list
    await fetchTemplates();
  };

  return (
    <div className="space-y-6">
      {/* Notificações */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-cyan-400" />
          Notificações
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-cyan-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <Label htmlFor="notification-sound" className="text-sm font-medium text-white cursor-pointer">
                  Som de notificação
                </Label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tocar som ao receber novas mensagens de clientes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {soundEnabled && (
                <button
                  onClick={handleTestSound}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Testar
                </button>
              )}
              <Switch
                id="notification-sound"
                checked={soundEnabled}
                onCheckedChange={handleSoundToggle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Automação Facebook Leads */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Facebook className="w-5 h-5 text-blue-400" />
          Automação Facebook Leads
        </h3>
        
        <div className="space-y-4">
          {/* WhatsApp Template */}
          <div className={`p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 transition-opacity ${!facebookWhatsappEnabled ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-green-400 mt-0.5" />
                <div className="flex-1">
                  <Label className="text-sm font-medium text-white">
                    Template WhatsApp para novos leads
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enviado automaticamente quando lead do Facebook chega via Zapier
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${facebookWhatsappEnabled ? 'text-green-400' : 'text-red-400'}`}>
                  {facebookWhatsappEnabled ? 'Ativo' : 'Pausado'}
                </span>
                <Switch
                  checked={facebookWhatsappEnabled}
                  onCheckedChange={(enabled) => handleToggleChannel('facebook', 'whatsapp', enabled)}
                />
              </div>
            </div>
            
            <Select 
              value={facebookTemplate} 
              onValueChange={setFacebookTemplate}
              disabled={loading || !facebookWhatsappEnabled}
            >
              <SelectTrigger className="bg-slate-900/50 border-slate-700">
                <SelectValue placeholder="Selecione um template..." />
              </SelectTrigger>
              <SelectContent>
                {approvedTemplates.map((template) => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-2">
              {approvedTemplates.length} templates aprovados disponíveis
            </p>
          </div>

          {/* Email Template */}
          <div className={`p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 transition-opacity ${!facebookEmailEnabled ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-orange-400 mt-0.5" />
                <div className="flex-1">
                  <Label className="text-sm font-medium text-white">
                    Template de Email para novos leads
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enviado automaticamente após WhatsApp (se lead tiver email)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${facebookEmailEnabled ? 'text-green-400' : 'text-red-400'}`}>
                  {facebookEmailEnabled ? 'Ativo' : 'Pausado'}
                </span>
                <Switch
                  checked={facebookEmailEnabled}
                  onCheckedChange={(enabled) => handleToggleChannel('facebook', 'email', enabled)}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Select 
                value={emailTemplateId} 
                onValueChange={setEmailTemplateId}
                disabled={loading || !facebookEmailEnabled}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-700 flex-1">
                  <SelectValue placeholder="Não enviar email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não enviar email</SelectItem>
                  {emailTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {emailTemplateId !== 'none' && facebookEmailEnabled && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleEditTemplate}
                  className="border-slate-700 hover:bg-slate-800 shrink-0"
                  title="Editar template selecionado"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {emailTemplates.length} templates de email disponíveis
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </div>
      </div>

      {/* Automação Google Leads */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Search className="w-5 h-5 text-red-400" />
          Automação Google Leads
        </h3>
        
        <div className="space-y-4">
          {/* WhatsApp Template Google */}
          <div className={`p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 transition-opacity ${!googleWhatsappEnabled ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-green-400 mt-0.5" />
                <div className="flex-1">
                  <Label className="text-sm font-medium text-white">
                    Template WhatsApp para novos leads
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enviado automaticamente quando lead do Google chega via webhook
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${googleWhatsappEnabled ? 'text-green-400' : 'text-red-400'}`}>
                  {googleWhatsappEnabled ? 'Ativo' : 'Pausado'}
                </span>
                <Switch
                  checked={googleWhatsappEnabled}
                  onCheckedChange={(enabled) => handleToggleChannel('google', 'whatsapp', enabled)}
                />
              </div>
            </div>
            
            <Select 
              value={googleTemplate} 
              onValueChange={setGoogleTemplate}
              disabled={loading || !googleWhatsappEnabled}
            >
              <SelectTrigger className="bg-slate-900/50 border-slate-700">
                <SelectValue placeholder="Selecione um template..." />
              </SelectTrigger>
              <SelectContent>
                {approvedTemplates.map((template) => (
                  <SelectItem key={template.name} value={template.name}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-2">
              {approvedTemplates.length} templates aprovados disponíveis
            </p>
          </div>

          {/* Email Template Google */}
          <div className={`p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 transition-opacity ${!googleEmailEnabled ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-orange-400 mt-0.5" />
                <div className="flex-1">
                  <Label className="text-sm font-medium text-white">
                    Template de Email para novos leads
                  </Label>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Enviado automaticamente após WhatsApp (se lead tiver email)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${googleEmailEnabled ? 'text-green-400' : 'text-red-400'}`}>
                  {googleEmailEnabled ? 'Ativo' : 'Pausado'}
                </span>
                <Switch
                  checked={googleEmailEnabled}
                  onCheckedChange={(enabled) => handleToggleChannel('google', 'email', enabled)}
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Select 
                value={googleEmailTemplateId} 
                onValueChange={setGoogleEmailTemplateId}
                disabled={loading || !googleEmailEnabled}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-700 flex-1">
                  <SelectValue placeholder="Não enviar email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não enviar email</SelectItem>
                  {emailTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {googleEmailTemplateId !== 'none' && googleEmailEnabled && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    const template = emailTemplates.find(t => t.id === googleEmailTemplateId);
                    if (template) {
                      supabase
                        .from('email_templates')
                        .select('*')
                        .eq('id', googleEmailTemplateId)
                        .single()
                        .then(({ data }) => {
                          if (data) {
                            setSelectedTemplate(data as FullEmailTemplate);
                            setIsEditorOpen(true);
                          }
                        });
                    }
                  }}
                  className="border-slate-700 hover:bg-slate-800 shrink-0"
                  title="Editar template selecionado"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {emailTemplates.length} templates de email disponíveis
            </p>
          </div>

          {/* Save Button Google */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveSettings}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700"
            >
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </div>
      </div>

      {/* Configurações de Email de Cobrança */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-amber-400" />
          Configurações de Email de Cobrança
        </h3>
        
        <div className="space-y-4">
          {/* Email Remetente */}
          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Label className="text-sm font-medium text-white">
              Email Remetente
            </Label>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              Formato: Nome Empresa &lt;email@dominio.com&gt;
            </p>
            <Input
              value={collectionEmailFrom}
              onChange={(e) => setCollectionEmailFrom(e.target.value)}
              placeholder="Jacometo Seguros <jacometo@jacometo.com.br>"
              className="bg-slate-900/50 border-slate-700"
            />
          </div>
          
          {/* Emails BCC */}
          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <Label className="text-sm font-medium text-white">
              Cópia Oculta (BCC)
            </Label>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              Emails que receberão cópia de toda cobrança enviada (separar por vírgula)
            </p>
            <Input
              value={collectionEmailBcc}
              onChange={(e) => setCollectionEmailBcc(e.target.value)}
              placeholder="joao.pedro@jacometo.com.br, outro@email.com"
              className="bg-slate-900/50 border-slate-700"
            />
          </div>
          
          {/* Botão Salvar */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveCollectionEmailSettings}
              disabled={savingCollectionEmail}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {savingCollectionEmail ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </div>
      </div>

      {/* Email Template Editor Modal */}
      <EmailTemplateEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setSelectedTemplate(null);
        }}
        template={selectedTemplate}
        onSave={handleSaveTemplate}
      />
    </div>
  );
};

export default GeneralSettings;