import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { 
  Sparkles, 
  Loader2, 
  Mail, 
  ChevronDown, 
  ChevronUp, 
  Send, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface GeneratedEmail {
  contactId: string;
  contactName: string;
  email: string;
  subject: string;
  bodyHtml: string;
  installments: Array<{
    id: string;
    value: number;
    dueDate: string;
    daysOverdue: number;
  }>;
  totalValue: number;
  installmentCount: number;
  sellerEmail?: string;
  sellerName?: string;
  companyId?: string;
  companyName?: string;
  isBillingContact?: boolean;
}

type RecipientMode = 'billing' | 'all' | 'select';

interface CollectionEmailCampaignProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: {
    range?: string;
    selectedInstallmentIds?: string[];
  };
  batchId?: string;
}

type Step = 'config' | 'preview' | 'sending' | 'done';

export const CollectionEmailCampaign: React.FC<CollectionEmailCampaignProps> = ({
  open,
  onOpenChange,
  filters,
  batchId
}) => {
  const [step, setStep] = useState<Step>('config');
  const [emailTone, setEmailTone] = useState<'friendly' | 'reminder' | 'urgent' | 'final'>('friendly');
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('billing');
  const [ccSeller, setCcSeller] = useState(true);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [expandedEmails, setExpandedEmails] = useState<Set<string>>(new Set());
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [skippedCount, setSkippedCount] = useState(0);
  const [sendProgress, setSendProgress] = useState(0);
  const [sendResults, setSendResults] = useState<{ sent: number; failed: number; results: any[] }>({ sent: 0, failed: 0, results: [] });
  const queryClient = useQueryClient();

  const generateEmailsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-collection-emails', {
        body: {
          filters: {
            ...filters,
            status: ['overdue', 'negotiating'],
            installmentIds: filters.selectedInstallmentIds
          },
          emailTone,
          recipientMode,
          batchId
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.generated && data.generated.length > 0) {
        setGeneratedEmails(data.generated);
        // For 'select' mode, only pre-select billing contacts; for others, select all
        if (recipientMode === 'select') {
          const billingOnly = data.generated
            .filter((e: GeneratedEmail) => e.isBillingContact)
            .map((e: GeneratedEmail) => `${e.contactId}-${e.email}`);
          setSelectedEmails(new Set(billingOnly));
        } else {
          setSelectedEmails(new Set(data.generated.map((e: GeneratedEmail) => `${e.contactId}-${e.email}`)));
        }
        setSkippedCount(data.skipped || 0);
        setStep('preview');
        toast.success(`${data.generated.length} emails gerados com sucesso!`);
      } else {
        toast.warning('Nenhum segurado com email encontrado para os filtros selecionados');
      }
    },
    onError: (error: any) => {
      console.error('Error generating emails:', error);
      toast.error('Erro ao gerar emails: ' + (error.message || 'Erro desconhecido'));
    }
  });

  const sendEmailsMutation = useMutation({
    mutationFn: async () => {
      const emailsToSend = generatedEmails.filter(e => selectedEmails.has(`${e.contactId}-${e.email}`));
      
      const { data, error } = await supabase.functions.invoke('send-collection-emails', {
        body: {
          batchId,
          emails: emailsToSend,
          ccSeller
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSendResults(data);
      setStep('done');
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
      toast.success(`${data.sent} emails enviados com sucesso!`);
    },
    onError: (error: any) => {
      console.error('Error sending emails:', error);
      toast.error('Erro ao enviar emails: ' + (error.message || 'Erro desconhecido'));
    }
  });

  const handleClose = () => {
    setStep('config');
    setGeneratedEmails([]);
    setSelectedEmails(new Set());
    setExpandedEmails(new Set());
    setExpandedCompanies(new Set());
    setSendProgress(0);
    setSendResults({ sent: 0, failed: 0, results: [] });
    setCcSeller(true);
    setRecipientMode('billing');
    onOpenChange(false);
  };

  const getEmailKey = (email: GeneratedEmail) => `${email.contactId}-${email.email}`;

  const toggleEmailSelection = (email: GeneratedEmail) => {
    const key = getEmailKey(email);
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedEmails(newSelected);
  };

  const toggleEmailExpanded = (email: GeneratedEmail) => {
    const key = getEmailKey(email);
    const newExpanded = new Set(expandedEmails);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedEmails(newExpanded);
  };

  const toggleCompanyExpanded = (companyId: string) => {
    const newExpanded = new Set(expandedCompanies);
    if (newExpanded.has(companyId)) {
      newExpanded.delete(companyId);
    } else {
      newExpanded.add(companyId);
    }
    setExpandedCompanies(newExpanded);
  };

  const selectAll = () => {
    setSelectedEmails(new Set(generatedEmails.map(e => getEmailKey(e))));
  };

  const deselectAll = () => {
    setSelectedEmails(new Set());
  };

  const selectBillingOnly = () => {
    const billingEmails = generatedEmails
      .filter(e => e.isBillingContact)
      .map(e => getEmailKey(e));
    setSelectedEmails(new Set(billingEmails));
  };

  // Group emails by company for better visualization
  const emailsByCompany = generatedEmails.reduce((acc, email) => {
    const companyKey = email.companyId || 'no-company';
    if (!acc[companyKey]) {
      acc[companyKey] = {
        companyName: email.companyName || 'Sem Empresa',
        emails: []
      };
    }
    acc[companyKey].emails.push(email);
    return acc;
  }, {} as Record<string, { companyName: string; emails: GeneratedEmail[] }>);

  const startSending = () => {
    setStep('sending');
    sendEmailsMutation.mutate();
  };

  const renderConfigStep = () => (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <Label>Tom da Mensagem</Label>
        <Select value={emailTone} onValueChange={(v: any) => setEmailTone(v)}>
          <SelectTrigger className="bg-slate-800/50 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="friendly">
              <div className="flex flex-col">
                <span>😊 Amigável</span>
                <span className="text-xs text-slate-400">Primeiro contato, tom acolhedor</span>
              </div>
            </SelectItem>
            <SelectItem value="reminder">
              <div className="flex flex-col">
                <span>📋 Lembrete</span>
                <span className="text-xs text-slate-400">Segundo contato, mais direto</span>
              </div>
            </SelectItem>
            <SelectItem value="urgent">
              <div className="flex flex-col">
                <span>⚠️ Urgente</span>
                <span className="text-xs text-slate-400">Senso de urgência, riscos</span>
              </div>
            </SelectItem>
            <SelectItem value="final">
              <div className="flex flex-col">
                <span>🚨 Aviso Final</span>
                <span className="text-xs text-slate-400">Último contato antes de ações</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Destinatários</Label>
        <Select value={recipientMode} onValueChange={(v: RecipientMode) => setRecipientMode(v)}>
          <SelectTrigger className="bg-slate-800/50 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="billing">
              <div className="flex flex-col">
                <span>👤 Contato Principal</span>
                <span className="text-xs text-slate-400">1 email por empresa (contato de cobrança)</span>
              </div>
            </SelectItem>
            <SelectItem value="all">
              <div className="flex flex-col">
                <span>👥 Todos os Contatos</span>
                <span className="text-xs text-slate-400">Email para todos os contatos com email da empresa</span>
              </div>
            </SelectItem>
            <SelectItem value="select">
              <div className="flex flex-col">
                <span>☑️ Selecionar Manualmente</span>
                <span className="text-xs text-slate-400">Escolher quais contatos receberão o email</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox 
          id="ccSeller" 
          checked={ccSeller} 
          onCheckedChange={(checked) => setCcSeller(checked === true)}
        />
        <Label htmlFor="ccSeller" className="text-sm text-slate-300 cursor-pointer">
          Copiar vendedor responsável no email (CC)
        </Label>
      </div>

      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
          <div>
            <p className="text-sm text-amber-200 font-medium">Filtros aplicados</p>
            {filters.selectedInstallmentIds && filters.selectedInstallmentIds.length > 0 ? (
              <p className="text-sm text-amber-300/70">
                {filters.selectedInstallmentIds.length} parcela(s) selecionada(s)
              </p>
            ) : (
              <p className="text-sm text-amber-300/70">
                Faixa de atraso: {filters.range === 'all' ? 'Todas' : filters.range || 'Não especificado'}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-2">
              {recipientMode === 'billing' 
                ? 'A IA irá gerar um email por empresa, para o contato principal de cobrança.'
                : recipientMode === 'all'
                ? 'A IA irá gerar emails para TODOS os contatos com email de cada empresa.'
                : 'A IA irá gerar emails para todos os contatos. Você poderá selecionar quais enviar.'}
            </p>
          </div>
        </div>
      </div>

      <Button 
        onClick={() => generateEmailsMutation.mutate()}
        disabled={generateEmailsMutation.isPending}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
      >
        {generateEmailsMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Gerando emails com IA...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4 mr-2" />
            Gerar Emails com IA
          </>
        )}
      </Button>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="flex flex-col h-full">
      {/* Header stats */}
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              {generatedEmails.length} emails gerados
            </Badge>
            {skippedCount > 0 && (
              <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                {skippedCount} sem email
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>
              Todos
            </Button>
            {recipientMode === 'select' && (
              <Button variant="ghost" size="sm" onClick={selectBillingOnly}>
                Apenas Principais
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={deselectAll}>
              Limpar
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          {selectedEmails.size} de {generatedEmails.length} selecionados para envio
        </p>
      </div>

      {/* Email list - Grouped by company when multiple contacts */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {Object.entries(emailsByCompany).map(([companyId, { companyName, emails }]) => (
            <div key={companyId} className="rounded-lg border border-white/10 bg-slate-800/20 overflow-hidden">
              {/* Company header */}
              <div 
                className="flex items-center gap-3 p-3 bg-slate-800/50 cursor-pointer"
                onClick={() => toggleCompanyExpanded(companyId)}
              >
                <Building2 className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-slate-200 flex-1">{companyName}</span>
                <Badge variant="outline" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {emails.length} contato(s)
                </Badge>
                {expandedCompanies.has(companyId) ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
              
              {/* Contacts list - always show but can be collapsed */}
              <div className={expandedCompanies.has(companyId) || emails.length === 1 ? '' : 'hidden'}>
                {emails.map((email) => {
                  const emailKey = getEmailKey(email);
                  return (
                    <Collapsible 
                      key={emailKey}
                      open={expandedEmails.has(emailKey)}
                      onOpenChange={() => toggleEmailExpanded(email)}
                    >
                      <div className="border-t border-white/5">
                        <div className="flex items-center gap-3 p-3 pl-6">
                          <Checkbox 
                            checked={selectedEmails.has(emailKey)}
                            onCheckedChange={() => toggleEmailSelection(email)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-slate-400" />
                              <span className="font-medium text-slate-200 truncate">{email.contactName}</span>
                              {email.isBillingContact && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-blue-500/20 text-blue-300 border-blue-500/30">
                                  Cobrança
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-400 truncate">{email.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-amber-400">
                              R$ {email.totalValue.toFixed(2)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {email.installmentCount} parcela(s)
                            </p>
                          </div>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {expandedEmails.has(emailKey) ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                        </div>
                        <CollapsibleContent>
                          <div className="border-t border-white/10 p-4 ml-6 space-y-3">
                            <div>
                              <Label className="text-xs text-slate-500">Assunto</Label>
                              <p className="text-sm text-slate-300">{email.subject}</p>
                            </div>
                            <div>
                              <Label className="text-xs text-slate-500">Preview</Label>
                              <div 
                                className="mt-1 p-3 rounded bg-white text-slate-900 text-sm max-h-[300px] overflow-y-auto"
                                dangerouslySetInnerHTML={{ 
                                  __html: DOMPurify.sanitize(email.bodyHtml, {
                                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'div', 'span'],
                                    ALLOWED_ATTR: ['href', 'target', 'class', 'style'],
                                    ALLOW_DATA_ATTR: false,
                                    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i
                                  })
                                }}
                              />
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="p-4 border-t border-white/10 flex items-center justify-between">
        <Button 
          variant="outline" 
          onClick={() => setStep('config')}
          className="border-white/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Button>
        <Button 
          onClick={startSending}
          disabled={selectedEmails.size === 0}
          className="bg-amber-600 hover:bg-amber-700"
        >
          <Send className="w-4 h-4 mr-2" />
          Enviar {selectedEmails.size} emails
        </Button>
      </div>
    </div>
  );

  const renderSendingStep = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 space-y-6">
      <Loader2 className="w-16 h-16 text-amber-400 animate-spin" />
      <div className="text-center">
        <h3 className="text-lg font-semibold text-slate-200">Enviando emails...</h3>
        <p className="text-sm text-slate-400 mt-1">
          Aguarde enquanto processamos o envio
        </p>
      </div>
      <div className="w-full max-w-xs">
        <Progress value={sendProgress} className="h-2" />
        <p className="text-center text-sm text-slate-500 mt-2">
          {Math.round(sendProgress)}%
        </p>
      </div>
    </div>
  );

  const renderDoneStep = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-semibold text-slate-200">Envio Concluído!</h3>
          <p className="text-sm text-slate-400 mt-2">
            {sendResults.sent} emails enviados com sucesso
          </p>
        </div>

        <div className="flex gap-4">
          <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-2xl font-bold text-green-400">{sendResults.sent}</p>
            <p className="text-sm text-green-400/70">Enviados</p>
          </div>
          {sendResults.failed > 0 && (
            <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-2xl font-bold text-red-400">{sendResults.failed}</p>
              <p className="text-sm text-red-400/70">Falhas</p>
            </div>
          )}
        </div>

        {sendResults.failed > 0 && (
          <div className="w-full max-w-md">
            <Label className="text-sm text-slate-400 mb-2 block">Erros:</Label>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {sendResults.results
                  .filter(r => r.status === 'failed')
                  .map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-slate-300">{r.email}</span>
                      <span className="text-slate-500">- {r.error}</span>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/10 flex justify-center">
        <Button onClick={handleClose} className="bg-slate-700 hover:bg-slate-600">
          Fechar
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-full sm:max-w-xl bg-slate-900 border-white/10 p-0">
        <SheetHeader className="p-4 border-b border-white/10">
          <SheetTitle className="flex items-center gap-2 text-slate-200">
            <Mail className="w-5 h-5 text-amber-400" />
            Campanha de Email com IA
          </SheetTitle>
        </SheetHeader>
        
        <div className="h-[calc(100vh-80px)]">
          {step === 'config' && renderConfigStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'sending' && renderSendingStep()}
          {step === 'done' && renderDoneStep()}
        </div>
      </SheetContent>
    </Sheet>
  );
};
