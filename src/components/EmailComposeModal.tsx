import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, ChevronDown, Sparkles, User, Building2, MapPin, Package, FileText, TrendingUp, Pencil, Eye } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClientMemory } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import DOMPurify from 'dompurify';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
}

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  contactEmail?: string;
  contactName?: string;
  company?: string;
  value?: number;
  onEmailSent?: () => void;
  // Context props for AI assistant
  ninaContext?: Record<string, any> | null;
  clientMemory?: ClientMemory | null;
  conversationHistory?: string;
  agentSlug?: string | null;
  contactPhone?: string;
  contactCnpj?: string | null;
}

const EMAIL_TYPES = [
  { value: 'follow-up', label: 'Follow-up', icon: '📬' },
  { value: 'proposta', label: 'Proposta Comercial', icon: '📋' },
  { value: 'cotacao', label: 'Envio de Cotação', icon: '💰' },
  { value: 'boas-vindas', label: 'Boas-vindas', icon: '🎉' },
  { value: 'renewal', label: 'Renovação', icon: '🔄' },
];

export const EmailComposeModal: React.FC<EmailComposeModalProps> = ({
  isOpen,
  onClose,
  dealId,
  contactEmail = '',
  contactName = '',
  company = '',
  value = 0,
  onEmailSent,
  ninaContext,
  clientMemory,
  conversationHistory,
  agentSlug,
  contactPhone,
  contactCnpj,
}) => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [to, setTo] = useState(contactEmail);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [senderName, setSenderName] = useState('');
  
  // AI Assistant state
  const [selectedEmailType, setSelectedEmailType] = useState('follow-up');
  const [customContext, setCustomContext] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [showAIAssistant, setShowAIAssistant] = useState(true);

  // Extract qualification data
  const qualificationAnswers = ninaContext?.qualification_answers || {};
  const qualificationScore = clientMemory?.lead_profile?.qualification_score || 0;
  const interests = clientMemory?.lead_profile?.interests || [];
  const painPoints = clientMemory?.sales_intelligence?.pain_points || [];

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setTo(contactEmail);
    }
  }, [isOpen, contactEmail]);

  // Carregar nome do operador quando user estiver disponível
  useEffect(() => {
    if (isOpen && user?.email) {
      loadSenderName();
    }
  }, [isOpen, user?.email]);

  const loadSenderName = async () => {
    if (!user?.email) return;
    
    try {
      const { data } = await supabase
        .from('team_members')
        .select('name')
        .eq('email', user.email)
        .single();
      
      if (data?.name) {
        setSenderName(data.name);
      } else {
        // Fallback: extrair do email
        const namePart = user.email.split('@')[0];
        const formattedName = namePart
          .split('.')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        setSenderName(formattedName);
      }
    } catch (error) {
      console.error('Erro ao buscar nome do operador:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const replaceVariables = (text: string): string => {
    return text
      .replace(/\{\{nome\}\}/g, contactName || 'Cliente')
      .replace(/\{\{empresa\}\}/g, company || 'Empresa')
      .replace(/\{\{valor\}\}/g, value ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) : 'A definir')
      .replace(/\{\{email\}\}/g, contactEmail || '')
      .replace(/\{\{telefone\}\}/g, contactPhone || '');
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    
    if (templateId === '') {
      setSubject('');
      setBody('');
      return;
    }

    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(replaceVariables(template.subject));
      // Limpa assinatura genérica imediatamente ao carregar template
      const cleanedBody = cleanGenericSignature(replaceVariables(template.body_html));
      setBody(cleanedBody);
    }
  };

  const getVertical = () => {
    if (agentSlug === 'clara') return 'saude';
    if (agentSlug === 'atlas') return 'prospeccao';
    return 'transporte';
  };

  const handleGenerateWithAI = async () => {
    setGeneratingAI(true);
    try {
      const leadContext = {
        name: contactName,
        company: company,
        cnpj: contactCnpj,
        phone: contactPhone,
        email: contactEmail,
        qualification_score: qualificationScore,
        qualification_answers: qualificationAnswers,
        interests: interests,
        pain_points: painPoints,
        conversation_summary: conversationHistory,
      };

      // Build a detailed briefing from lead context
      let briefingParts: string[] = [];
      
      if (customContext) {
        briefingParts.push(`Contexto adicional do operador: ${customContext}`);
      }
      
      if (contactName) briefingParts.push(`Nome do lead: ${contactName}`);
      if (company) briefingParts.push(`Empresa: ${company}`);
      if (contactCnpj) briefingParts.push(`CNPJ: ${contactCnpj}`);
      
      // Add qualification answers
      const qaLabels: Record<string, string> = {
        contratacao: 'Tipo de contratação',
        tipo_carga: 'Tipo de carga',
        estados: 'Estados atendidos',
        viagens_mes: 'Viagens por mês',
        valor_medio: 'Valor médio por carga',
        maior_valor: 'Maior valor transportado',
        tipo_frota: 'Tipo de frota',
        antt: 'ANTT',
        cte: 'CT-e',
      };
      
      Object.entries(qualificationAnswers).forEach(([key, val]) => {
        if (val && qaLabels[key]) {
          briefingParts.push(`${qaLabels[key]}: ${val}`);
        }
      });
      
      if (qualificationScore > 0) {
        briefingParts.push(`Score de qualificação: ${qualificationScore}%`);
      }
      
      if (interests.length > 0) {
        briefingParts.push(`Interesses do lead: ${interests.join(', ')}`);
      }
      
      if (painPoints.length > 0) {
        briefingParts.push(`Dores identificadas: ${painPoints.join(', ')}`);
      }
      
      if (conversationHistory) {
        briefingParts.push(`\nResumo da conversa:\n${conversationHistory}`);
      }

      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          vertical: getVertical(),
          emailType: selectedEmailType,
          briefing: briefingParts.join('\n'),
          leadContext,
        }
      });

      if (error) throw error;

      if (data?.subject) {
        setSubject(replaceVariables(data.subject));
      }
      if (data?.body_html) {
        // Limpa assinatura genérica imediatamente ao gerar com IA
        const cleanedBody = cleanGenericSignature(replaceVariables(data.body_html));
        setBody(cleanedBody);
      }
      
      setSelectedTemplateId(''); // Clear template selection
      toast.success('Email gerado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao gerar email com IA:', error);
      toast.error(error.message || 'Erro ao gerar email com IA');
    } finally {
      setGeneratingAI(false);
    }
  };

  // Remove assinaturas genéricas embutidas nos templates antes de adicionar a personalizada
  const cleanGenericSignature = (html: string): string => {
    return html
      // Remove padrão: <p>Atenciosamente,</p><p>Equipe Jacometo...</p> (com ou sem estilos)
      .replace(/<p[^>]*>Atenciosamente[,.]?<\/p>\s*<p[^>]*>Equipe Jacometo[^<]*<\/p>/gi, '')
      // Remove "Atenciosamente, Equipe Jacometo Seguros" com <br> e <strong>
      .replace(/Atenciosamente[,.]?\s*<br\s*\/?>\s*<strong>Equipe Jacometo.*?<\/strong>/gi, '')
      // Remove "Com carinho, Equipe Jacometo Seguros"
      .replace(/Com carinho[,.]?\s*<br\s*\/?>\s*<strong>Equipe Jacometo.*?<\/strong>/gi, '')
      // Remove "<p>Equipe Jacometo Seguros</p>" (com qualquer estilo)
      .replace(/<p[^>]*>Equipe Jacometo[^<]*<\/p>/gi, '')
      // Remove "Equipe Jacometo" genérico em tags strong
      .replace(/<strong>Equipe Jacometo[^<]*<\/strong>/gi, '')
      // Remove "Equipe Jacometo" em texto puro (sem tags)
      .replace(/Equipe Jacometo\s*Seguros?/gi, '')
      // Remove "Atenciosamente," seguido de "Equipe Jacometo" em texto puro
      .replace(/Atenciosamente[,.]?\s*Equipe Jacometo[^\n<]*/gi, '')
      // Remove "Atenciosamente," seguido de quebra de linha e "Equipe"
      .replace(/Atenciosamente[,.]?\s*[\n\r]+\s*Equipe[^\n<]*/gi, '')
      // Remove bloco de assinatura com "Atenciosamente" em qualquer formato
      .replace(/<p[^>]*>\s*Atenciosamente[,.]?\s*<\/p>/gi, '')
      // Remove "Equipe" sozinho seguido de nome da empresa
      .replace(/<p[^>]*>\s*Equipe\s+[^<]+<\/p>/gi, '')
      // Remove assinatura dentro de div/span
      .replace(/<(div|span)[^>]*>Equipe Jacometo[^<]*<\/(div|span)>/gi, '')
      // Remove "Abraços, Equipe Jacometo"
      .replace(/Abraços[,.]?\s*(<br\s*\/?>)?\s*(Equipe Jacometo[^<\n]*)?/gi, '')
      // Remove linhas vazias extras no final
      .replace(/(<br\s*\/?>\s*)+$/gi, '')
      .replace(/(<p[^>]*>\s*<\/p>\s*)+$/gi, '');
  };

  const addSignature = (htmlBody: string): string => {
    // Primeiro limpa assinaturas genéricas existentes
    const cleanedBody = cleanGenericSignature(htmlBody);
    
    const signature = `
<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">${senderName || 'Adriano Jacometo'}</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 9 9143 4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321‑5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 R. Sen. Souza Naves, 612 - Sala 51 - Centro - Londrina/PR - CEP: 86010-160</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>`;
    return cleanedBody + signature;
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error('Preencha todos os campos');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      toast.error('Email inválido');
      return;
    }

    setSending(true);
    try {
      const bodyWithSignature = addSignature(body);
      
      // CCO: admin fixo + operador logado
      const bccList = ['adriano@jacometo.com.br'];
      if (user?.email && user.email !== 'adriano@jacometo.com.br') {
        bccList.push(user.email);
      }

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { 
          to, 
          subject, 
          html: bodyWithSignature,
          bcc: bccList
        }
      });

      if (error) throw error;

      // Registrar atividade no deal
      const { error: activityError } = await supabase
        .from('deal_activities')
        .insert({
          deal_id: dealId,
          type: 'email',
          title: `Email enviado: ${subject}`,
          description: `Para: ${to}`
        });

      if (activityError) {
        console.error('Erro ao registrar atividade:', activityError);
      }

      toast.success('Email enviado com sucesso!');
      onEmailSent?.();
      onClose();
      
      // Reset form
      setSubject('');
      setBody('');
      setSelectedTemplateId('');
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      toast.error(error.message || 'Erro ao enviar email');
    } finally {
      setSending(false);
    }
  };

  // Get visible lead data for preview
  const getLeadDataPreview = () => {
    const items: { icon: React.ReactNode; label: string; value: string }[] = [];
    
    if (company) items.push({ icon: <Building2 className="w-3.5 h-3.5" />, label: 'Empresa', value: company });
    if (contactCnpj) items.push({ icon: <FileText className="w-3.5 h-3.5" />, label: 'CNPJ', value: contactCnpj });
    if (qualificationAnswers.tipo_carga) items.push({ icon: <Package className="w-3.5 h-3.5" />, label: 'Carga', value: String(qualificationAnswers.tipo_carga) });
    if (qualificationAnswers.estados) items.push({ icon: <MapPin className="w-3.5 h-3.5" />, label: 'Estados', value: String(qualificationAnswers.estados) });
    
    return items;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-violet-500" />
            Enviar Email
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* AI Assistant Section */}
          <div className="bg-gradient-to-br from-violet-900/30 to-purple-900/20 border border-violet-500/30 rounded-xl p-4 space-y-3">
            <button
              onClick={() => setShowAIAssistant(!showAIAssistant)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <span className="font-semibold text-white">Assistente de Copywriting</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showAIAssistant ? 'rotate-180' : ''}`} />
            </button>
            
            {showAIAssistant && (
              <div className="space-y-3 pt-2">
                {/* Email Type Selector */}
                <div>
                  <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
                    Tipo de Email
                  </label>
                  <div className="relative">
                    <select
                      value={selectedEmailType}
                      onChange={(e) => setSelectedEmailType(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white appearance-none focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
                    >
                      {EMAIL_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.icon} {type.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                
                {/* Custom Context */}
                <div>
                  <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
                    Contexto Adicional (opcional)
                  </label>
                  <input
                    type="text"
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                    placeholder="Ex: Mencionar que ele tem frota própria..."
                    className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  />
                </div>
                
                {/* Lead Data Preview */}
                {(getLeadDataPreview().length > 0 || qualificationScore > 0) && (
                  <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase">
                      <User className="w-3.5 h-3.5" />
                      Dados do Lead (detectados)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getLeadDataPreview().map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-slate-700/50 px-2 py-1 rounded text-xs">
                          <span className="text-slate-400">{item.icon}</span>
                          <span className="text-slate-300">{item.value}</span>
                        </div>
                      ))}
                      {qualificationScore > 0 && (
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                          qualificationScore >= 70 ? 'bg-emerald-500/20 text-emerald-400' :
                          qualificationScore >= 40 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-700/50 text-slate-400'
                        }`}>
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>{qualificationScore}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Generate Button */}
                <Button
                  onClick={handleGenerateWithAI}
                  disabled={generatingAI}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                >
                  {generatingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Gerar Email Personalizado
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Para */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Para
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Ou escolha um Template
            </label>
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={loadingTemplates}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white appearance-none focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
              >
                <option value="">📝 Sem template (personalizado)</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.category === 'follow-up' ? '📬' : 
                     template.category === 'proposal' ? '📋' : 
                     template.category === 'welcome' ? '🎉' : '📧'} {template.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Assunto */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto do email..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Corpo com Tabs Edit/Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wide">
                Mensagem
              </label>
              {/* Edit/Preview Toggle */}
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('edit')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'edit'
                      ? 'bg-violet-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'preview'
                      ? 'bg-violet-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>
              </div>
            </div>
            
            {viewMode === 'edit' ? (
              <>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escreva sua mensagem ou use IA para gerar..."
                  rows={12}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:ring-1 focus:ring-violet-500 outline-none resize-none font-mono"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Variáveis disponíveis: {'{{nome}}'}, {'{{empresa}}'}, {'{{valor}}'}, {'{{email}}'}, {'{{telefone}}'}
                </p>
              </>
            ) : (
              <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                {/* Email Header Preview */}
                <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 font-medium w-16">Para:</span>
                    <span className="text-slate-700">{to || 'destinatário@email.com'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 font-medium w-16">Assunto:</span>
                    <span className="text-slate-900 font-semibold">{subject || '(Sem assunto)'}</span>
                  </div>
                </div>
                {/* Email Body Preview */}
                <div 
                  className="p-6 prose prose-sm max-w-none text-slate-800 min-h-[280px] max-h-[400px] overflow-y-auto"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(
                      replaceVariables(body) || '<p class="text-slate-400 italic">O conteúdo do email aparecerá aqui...</p>',
                      {
                        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'div', 'span', 'img'],
                        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'target'],
                        ALLOW_DATA_ATTR: false
                      }
                    )
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSend}
            disabled={sending || !to || !subject || !body}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Email
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
