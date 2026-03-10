import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, Code, Variable, Loader2, Sparkles, Truck, HeartPulse, Phone } from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
  is_active: boolean;
}

interface EmailTemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: EmailTemplate | null;
  onSave: (template: Partial<EmailTemplate>) => Promise<void>;
}

const EXAMPLE_VARIABLES: Record<string, string> = {
  '{{nome}}': 'João Silva',
  '{{empresa}}': 'Transportes ABC',
  '{{valor}}': 'R$ 2.500,00',
  '{{email}}': 'joao@transportesabc.com.br',
  '{{telefone}}': '(43) 99999-0000',
};

const DEFAULT_HTML = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">Olá {{nome}}!</h2>
  
  <p style="color: #666; line-height: 1.6;">
    Escreva seu conteúdo aqui...
  </p>
  
  <p style="color: #666; line-height: 1.6;">
    Atenciosamente,<br>
    <strong>Equipe OrbePet</strong>
  </p>
</div>`;

const VERTICALS = [
  { value: 'transporte', label: 'Transporte', icon: Truck, color: 'text-amber-400' },
  { value: 'saude', label: 'Saúde', icon: HeartPulse, color: 'text-rose-400' },
  { value: 'prospeccao', label: 'Prospecção', icon: Phone, color: 'text-cyan-400' },
];

const EMAIL_TYPES = [
  { value: 'follow-up', label: '📬 Follow-up' },
  { value: 'proposta', label: '📋 Proposta' },
  { value: 'boas-vindas', label: '🎉 Boas-vindas' },
  { value: 'renewal', label: '🔄 Renovação' },
  { value: 'cotacao', label: '💰 Cotação' },
];

const EmailTemplateEditorModal: React.FC<EmailTemplateEditorModalProps> = ({
  isOpen,
  onClose,
  template,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_HTML);
  const [category, setCategory] = useState('general');
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'code' | 'preview'>('code');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // AI Copywriting states
  const [selectedVertical, setSelectedVertical] = useState<string>('transporte');
  const [selectedEmailType, setSelectedEmailType] = useState<string>('follow-up');
  const [briefing, setBriefing] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name || '');
      setSubject(template.subject || '');
      setBodyHtml(template.body_html || DEFAULT_HTML);
      setCategory(template.category || 'general');
    } else {
      setName('');
      setSubject('');
      setBodyHtml(DEFAULT_HTML);
      setCategory('general');
    }
    // Reset to code view when opening to ensure preview refreshes correctly
    if (isOpen) {
      setActiveView('code');
    }
  }, [template, isOpen]);

  useEffect(() => {
    if (iframeRef.current && activeView === 'preview') {
      const previewHtml = replaceVariables(bodyHtml || '');
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { 
                margin: 0; 
                padding: 16px; 
                font-family: Arial, sans-serif;
                background: #ffffff;
                color: #333;
              }
            </style>
          </head>
          <body>${previewHtml}</body>
          </html>
        `);
        doc.close();
      }
    }
  }, [bodyHtml, activeView]);

  const replaceVariables = (html: string): string => {
    let result = html;
    Object.entries(EXAMPLE_VARIABLES).forEach(([variable, value]) => {
      result = result.replaceAll(variable, value);
    });
    return result;
  };

  const insertVariable = (variable: string) => {
    setBodyHtml((prev) => prev + variable);
  };

  const handleGenerateWithAI = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          vertical: selectedVertical,
          emailType: selectedEmailType,
          briefing: briefing.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data?.subject) {
        setSubject(data.subject);
      }
      if (data?.body_html) {
        setBodyHtml(data.body_html);
      }

      // Auto-set category based on email type
      if (selectedEmailType === 'follow-up') setCategory('follow-up');
      else if (selectedEmailType === 'proposta' || selectedEmailType === 'cotacao') setCategory('proposal');
      else if (selectedEmailType === 'boas-vindas') setCategory('welcome');
      else setCategory('general');

      // Auto-generate name if empty
      if (!name.trim()) {
        const verticalLabel = VERTICALS.find(v => v.value === selectedVertical)?.label || selectedVertical;
        const typeLabel = EMAIL_TYPES.find(t => t.value === selectedEmailType)?.label.replace(/[^\w\s]/g, '').trim() || selectedEmailType;
        setName(`${typeLabel} - ${verticalLabel}`);
      }

      toast.success('Email gerado com sucesso!');
      setActiveView('preview');
    } catch (error: any) {
      console.error('Erro ao gerar email:', error);
      toast.error(error.message || 'Erro ao gerar email com IA');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        subject: subject.trim(),
        body_html: bodyHtml,
        category,
      });
      toast.success('Template salvo com sucesso!');
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar template:', error);
      toast.error(error.message || 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col bg-slate-900 border-slate-700 p-0">
        <DialogHeader className="px-6 py-4 border-b border-slate-700">
          <DialogTitle className="text-white flex items-center gap-2">
            {template ? '✏️ Editar Template' : '➕ Novo Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col px-6 py-4 gap-4">
          {/* AI Copywriting Assistant */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-cyan-500/10 border border-violet-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <h3 className="font-semibold text-white">Assistente de Copywriting</h3>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-3">
              {/* Vertical Selection */}
              <div>
                <Label className="text-slate-200 text-xs font-medium mb-2 block">Vertical</Label>
                <div className="flex gap-2">
                  {VERTICALS.map((vertical) => {
                    const Icon = vertical.icon;
                    const isSelected = selectedVertical === vertical.value;
                    return (
                      <button
                        key={vertical.value}
                        onClick={() => setSelectedVertical(vertical.value)}
                        className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-slate-800 border-violet-500/50 ring-1 ring-violet-500/30'
                            : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? vertical.color : 'text-slate-400'}`} />
                        <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {vertical.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Email Type */}
              <div>
                <Label className="text-slate-200 text-xs font-medium mb-2 block">Tipo de Email</Label>
                <Select value={selectedEmailType} onValueChange={setSelectedEmailType}>
                  <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Generate Button */}
              <div className="flex items-end">
                <Button
                  variant="primary"
                  onClick={handleGenerateWithAI}
                  disabled={generating}
                  className="w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500"
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar Email
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Briefing */}
            <div>
              <Label className="text-slate-200 text-xs font-medium mb-1 block">
                Briefing (opcional) - Descreva o contexto ou objetivo específico
              </Label>
              <Input
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                placeholder="Ex: Email para tutor que pediu cotação de plano de saúde pet..."
                className="bg-slate-800/50 border-slate-700 text-sm text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label className="text-slate-100 font-medium mb-2 block">Nome do Template</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Follow-up Inicial"
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <Label className="text-slate-100 font-medium mb-2 block">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow-up">📬 Follow-up</SelectItem>
                  <SelectItem value="proposal">📋 Proposta</SelectItem>
                  <SelectItem value="welcome">🎉 Boas-vindas</SelectItem>
                  <SelectItem value="general">📧 Geral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-slate-100 font-medium mb-2 block">Assunto do Email</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Obrigado pelo seu interesse!"
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-400"
            />
          </div>

          {/* Variables Helper */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-300 flex items-center gap-1">
              <Variable className="w-3 h-3" /> Variáveis:
            </span>
            {Object.keys(EXAMPLE_VARIABLES).map((variable) => (
              <button
                key={variable}
                onClick={() => insertVariable(variable)}
                className="px-2 py-1 text-xs rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
              >
                {variable}
              </button>
            ))}
          </div>

          {/* Editor / Preview */}
          <div className="flex-1 min-h-0">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'code' | 'preview')} className="h-full flex flex-col">
              <TabsList className="mb-2">
                <TabsTrigger value="code" className="gap-2">
                  <Code className="w-4 h-4" />
                  Editor HTML
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="code" className="flex-1 m-0">
                <Textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  className="h-full min-h-[250px] font-mono text-sm bg-slate-800/50 border-slate-700 resize-none text-slate-100 placeholder:text-slate-400"
                  placeholder="Digite o HTML do email..."
                />
              </TabsContent>

              <TabsContent value="preview" className="flex-1 m-0">
                <div className="h-full min-h-[250px] rounded-lg border border-slate-700 bg-white overflow-hidden">
                  <iframe
                    ref={iframeRef}
                    title="Email Preview"
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            💡 Use variáveis como {"{{nome}}"} que serão substituídas ao enviar
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || !name.trim()} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                '💾 Salvar Template'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmailTemplateEditorModal;
