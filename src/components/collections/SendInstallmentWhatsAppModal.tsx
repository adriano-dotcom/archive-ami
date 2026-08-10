import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Send, Loader2, MessageSquare, User, Building, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  components: any[] | null;
}

interface Contact {
  id: string;
  name: string | null;
  phone_number: string;
  is_billing_contact: boolean | null;
  role: string | null;
}

interface Installment {
  id: string;
  installment_number: number;
  value: number;
  due_date: string;
  status: string;
  days_overdue: number;
  contact: {
    id: string;
    name: string;
    phone_number: string;
  } | null;
  policy: {
    id: string;
    policy_number: string;
    insurer: string;
    company: {
      id: string;
      razao_social: string;
      nome_fantasia: string | null;
    } | null;
  } | null;
}

interface SendInstallmentWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  installment: Installment | null;
  onSent?: () => void;
}

export const SendInstallmentWhatsAppModal: React.FC<SendInstallmentWhatsAppModalProps> = ({
  isOpen,
  onClose,
  installment,
  onSent,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const queryClient = useQueryClient();

  // Get company ID from policy
  const companyId = installment?.policy?.company?.id;

  // Fetch approved templates
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['whatsapp-templates-approved'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('name');

      if (error) throw error;
      return data as WhatsAppTemplate[];
    },
    enabled: isOpen,
  });

  // Fetch company contacts
  const { data: companyContacts, isLoading: contactsLoading } = useQuery({
    queryKey: ['company-contacts', companyId],
    queryFn: async () => {
      if (!companyId) return [];

      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone_number, is_billing_contact, role')
        .eq('company_id', companyId)
        .order('is_billing_contact', { ascending: false });

      if (error) throw error;
      return data as Contact[];
    },
    enabled: isOpen && !!companyId,
  });

  // Auto-select best contact when contacts are loaded
  useEffect(() => {
    if (companyContacts && companyContacts.length > 0) {
      // Prioritize billing contact
      const billingContact = companyContacts.find(c => c.is_billing_contact);
      setSelectedContact(billingContact || companyContacts[0]);
    } else if (installment?.contact) {
      // Fallback to installment contact
      setSelectedContact({
        id: installment.contact.id,
        name: installment.contact.name,
        phone_number: installment.contact.phone_number,
        is_billing_contact: null,
        role: null,
      });
    }
  }, [companyContacts, installment]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTemplate(null);
      setSelectedContact(null);
    }
  }, [isOpen]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate || !selectedContact || !installment) {
        throw new Error('Dados incompletos');
      }

      // Validate phone number
      if (!selectedContact.phone_number || selectedContact.phone_number.startsWith('PENDENTE_')) {
        throw new Error('Contato não possui telefone válido');
      }

      // Get or create conversation
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', selectedContact.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      let conversationId = existingConv?.id;

      if (!conversationId) {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert([{
            contact_id: selectedContact.id,
            status: 'human' as const,
          }])
          .select()
          .single();

        if (convError) throw convError;
        conversationId = newConv.id;
      }

      // Prepare variables
      const firstName = selectedContact.name?.split(' ')[0] || 'Cliente';
      const companyName = installment.policy?.company?.nome_fantasia || 
                          installment.policy?.company?.razao_social || 
                          selectedContact.name || 'N/A';
      const policyNumber = installment.policy?.policy_number || 'N/A';
      const value = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(installment.value);
      const dueDate = format(parseISO(installment.due_date), 'dd/MM/yyyy', { locale: ptBR });

      // Send via edge function
      const { data, error } = await supabase.functions.invoke('send-whatsapp-template', {
        body: {
          contact_id: selectedContact.id,
          conversation_id: conversationId,
          template_name: selectedTemplate.name,
          language: selectedTemplate.language,
          header_variables: [firstName],
          variables: [companyName, policyNumber, value, dueDate],
        },
      });

      if (error) throw error;

      // Log attempt
      await supabase.from('collection_attempts').insert({
        installment_id: installment.id,
        contact_id: selectedContact.id,
        channel: 'whatsapp',
        status: 'sent',
        template_name: selectedTemplate.name,
        message_id: data?.message_id,
        sent_at: new Date().toISOString(),
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments'] });
      queryClient.invalidateQueries({ queryKey: ['collection-attempts'] });
      toast.success('Mensagem de cobrança enviada!');
      onSent?.();
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar mensagem');
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getTemplatePreview = () => {
    if (!selectedTemplate?.components || !installment) return null;

    const header = selectedTemplate.components.find((c: any) => c.type === 'HEADER');
    const body = selectedTemplate.components.find((c: any) => c.type === 'BODY');

    const firstName = selectedContact?.name?.split(' ')[0] || 'Cliente';
    const companyName = installment.policy?.company?.nome_fantasia || 
                        installment.policy?.company?.razao_social || 
                        selectedContact?.name || 'N/A';
    const policyNumber = installment.policy?.policy_number || 'N/A';
    const value = formatCurrency(installment.value);
    const dueDate = format(parseISO(installment.due_date), 'dd/MM/yyyy', { locale: ptBR });

    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 space-y-2">
        <p className="text-xs text-slate-500 mb-2">Preview da mensagem:</p>
        {header?.text && (
          <div className="text-sm font-semibold text-white">
            {header.text.replace('{{1}}', firstName)}
          </div>
        )}
        {body?.text && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap">
            {body.text
              .replace('{{1}}', companyName)
              .replace('{{2}}', policyNumber)
              .replace('{{3}}', value)
              .replace('{{4}}', dueDate)
            }
          </div>
        )}
      </div>
    );
  };

  if (!installment) return null;

  const companyName = installment.policy?.company?.nome_fantasia || 
                      installment.policy?.company?.razao_social || 
                      'Empresa não vinculada';

  const allContacts = companyContacts && companyContacts.length > 0 
    ? companyContacts 
    : installment.contact 
      ? [{
          id: installment.contact.id,
          name: installment.contact.name,
          phone_number: installment.contact.phone_number,
          is_billing_contact: null,
          role: null,
        }]
      : [];

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Enviar Cobrança via WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Installment Info */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Building className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-white">{companyName}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Apólice:</span>
                <span className="text-white ml-2">{installment.policy?.policy_number || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500">Parcela:</span>
                <span className="text-white ml-2">{installment.installment_number}</span>
              </div>
              <div>
                <span className="text-slate-500">Valor:</span>
                <span className="text-amber-400 ml-2 font-medium">{formatCurrency(installment.value)}</span>
              </div>
              <div>
                <span className="text-slate-500">Vencimento:</span>
                <span className="text-white ml-2">
                  {format(parseISO(installment.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                </span>
              </div>
            </div>
            {installment.days_overdue > 0 && (
              <Badge className="mt-3 bg-rose-500/20 text-rose-400 border-rose-500/30">
                {installment.days_overdue} dias de atraso
              </Badge>
            )}
          </div>

          {/* Contact Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              Contato
            </Label>
            {contactsLoading ? (
              <div className="h-10 bg-slate-800/50 rounded animate-pulse" />
            ) : allContacts.length > 0 ? (
              <Select
                value={selectedContact?.id || ''}
                onValueChange={(value) => {
                  const contact = allContacts.find(c => c.id === value);
                  setSelectedContact(contact || null);
                }}
              >
                <SelectTrigger className="bg-slate-800/50 border-white/10">
                  <SelectValue placeholder="Selecione o contato" />
                </SelectTrigger>
                <SelectContent>
                  {allContacts.map(contact => (
                    <SelectItem key={contact.id} value={contact.id}>
                      <div className="flex items-center gap-2">
                        {contact.is_billing_contact && (
                          <span className="text-amber-400">★</span>
                        )}
                        <span>{contact.name || 'Sem nome'}</span>
                        <span className="text-slate-500">{contact.phone_number}</span>
                        {contact.role && (
                          <Badge variant="outline" className="text-xs ml-2">
                            {contact.role}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex items-center gap-2 text-amber-400 text-sm p-3 bg-amber-500/10 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                Nenhum contato vinculado
              </div>
            )}
          </div>

          {/* Template Selector */}
          <div className="space-y-2">
            <Label>Template do Meta</Label>
            {templatesLoading ? (
              <div className="h-10 bg-slate-800/50 rounded animate-pulse" />
            ) : (
              <Select
                value={selectedTemplate?.id || ''}
                onValueChange={(value) => {
                  const template = templates?.find(t => t.id === value);
                  setSelectedTemplate(template || null);
                }}
              >
                <SelectTrigger className="bg-slate-800/50 border-white/10">
                  <SelectValue placeholder="Selecione um template aprovado" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <span>{template.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {template.category}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Template Preview */}
          {selectedTemplate && getTemplatePreview()}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose} className="border-white/10">
              Cancelar
            </Button>
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={!selectedTemplate || !selectedContact || sendMutation.isPending}
              className="bg-green-600 hover:bg-green-700 gap-2"
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
