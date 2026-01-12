import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Send, Loader2, MessageSquare, AlertCircle, Users, DollarSign, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  components: any[] | null;
}

interface InstallmentPreview {
  id: string;
  contact_name: string;
  contact_phone: string;
  company_name: string;
  policy_number: string;
  value: number;
  due_date: string;
  days_overdue: number;
}

interface ConsolidatedContact {
  contact_name: string;
  contact_phone: string;
  company_name: string;
  first_policy: string;
  oldest_due_date: string;
  total_value: number;
  installment_count: number;
  max_days_overdue: number;
}

interface SendCollectionTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  rangeFilter: string;
  installmentIds?: string[];
  onSent?: () => void;
}

export const SendCollectionTemplateModal: React.FC<SendCollectionTemplateModalProps> = ({
  isOpen,
  onClose,
  rangeFilter,
  installmentIds,
  onSent,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [delaySeconds, setDelaySeconds] = useState(2);
  const queryClient = useQueryClient();

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

  // Fetch installments preview
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ['collection-preview', rangeFilter, installmentIds],
    queryFn: async () => {
      let query = supabase
        .from('installments')
        .select(`
          id,
          value,
          due_date,
          days_overdue,
          contact:contacts(id, name, phone_number, company_id),
          policy:policies(id, policy_number, company_id)
        `)
        .in('status', ['overdue', 'negotiating']);

      if (installmentIds && installmentIds.length > 0) {
        query = query.in('id', installmentIds);
      } else if (rangeFilter !== 'all') {
        switch (rangeFilter) {
          case '1-30':
            query = query.gte('days_overdue', 1).lte('days_overdue', 30);
            break;
          case '31-60':
            query = query.gte('days_overdue', 31).lte('days_overdue', 60);
            break;
          case '61-90':
            query = query.gte('days_overdue', 61).lte('days_overdue', 90);
            break;
          case '90+':
            query = query.gt('days_overdue', 90);
            break;
        }
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;

      // Get company names
      const companyIds = new Set<string>();
      data?.forEach((inst: any) => {
        if (inst.contact?.company_id) companyIds.add(inst.contact.company_id);
        if (inst.policy?.company_id) companyIds.add(inst.policy.company_id);
      });

      const { data: companies } = await supabase
        .from('companies')
        .select('id, razao_social, nome_fantasia')
        .in('id', Array.from(companyIds));

      const companyMap = new Map(companies?.map(c => [c.id, c]) || []);

      // Map to preview format
      const previews: InstallmentPreview[] = (data || []).map((inst: any) => {
        const companyId = inst.policy?.company_id || inst.contact?.company_id;
        const company = companyId ? companyMap.get(companyId) : null;

        return {
          id: inst.id,
          contact_name: inst.contact?.name || 'N/A',
          contact_phone: inst.contact?.phone_number || 'N/A',
          company_name: company?.nome_fantasia || company?.razao_social || inst.contact?.name || 'N/A',
          policy_number: inst.policy?.policy_number || 'N/A',
          value: inst.value,
          due_date: inst.due_date,
          days_overdue: inst.days_overdue || 0,
        };
      });

      // ============ CONSOLIDATE BY CONTACT ============
      // Group installments by contact and consolidate values
      const contactGroups = new Map<string, ConsolidatedContact>();

      previews.forEach(p => {
        if (!contactGroups.has(p.contact_phone)) {
          contactGroups.set(p.contact_phone, {
            contact_name: p.contact_name,
            contact_phone: p.contact_phone,
            company_name: p.company_name,
            first_policy: p.policy_number,
            oldest_due_date: p.due_date,
            total_value: p.value,
            installment_count: 1,
            max_days_overdue: p.days_overdue,
          });
        } else {
          const group = contactGroups.get(p.contact_phone)!;
          group.total_value += p.value;
          group.installment_count++;
          
          // Use oldest due date and its policy
          if (new Date(p.due_date) < new Date(group.oldest_due_date)) {
            group.oldest_due_date = p.due_date;
            group.first_policy = p.policy_number;
          }
          
          // Track max days overdue
          if (p.days_overdue > group.max_days_overdue) {
            group.max_days_overdue = p.days_overdue;
          }
        }
      });

      const consolidatedContacts = Array.from(contactGroups.values());

      return {
        total: previews.length,
        uniqueContacts: consolidatedContacts.length,
        totalValue: previews.reduce((sum, p) => sum + p.value, 0),
        samples: consolidatedContacts.slice(0, 5),
      };
    },
    enabled: isOpen,
  });

  // Send campaign mutation
  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('Selecione um template');

      // Create batch
      const { data: batch, error: batchError } = await supabase
        .from('collection_batches')
        .insert({
          name: `Cobrança WhatsApp - ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
          description: `Template: ${selectedTemplate.name}`,
          channel: 'whatsapp',
          template_name: selectedTemplate.name,
          filters: { range: rangeFilter },
          total_count: previewData?.uniqueContacts || 0,
          status: 'processing',
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Trigger edge function
      const { data, error } = await supabase.functions.invoke('send-collection-whatsapp', {
        body: {
          batch_id: batch.id,
          template_name: selectedTemplate.name,
          language: selectedTemplate.language,
          installment_ids: installmentIds,
          filters: { range: rangeFilter, status: ['overdue', 'negotiating'] },
          delay_between_ms: delaySeconds * 1000,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collection-batches'] });
      toast.success(`Campanha iniciada! ${data.sent} mensagens enviadas.`);
      onSent?.();
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar campanha');
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getTemplatePreview = () => {
    if (!selectedTemplate?.components) return null;

    const header = selectedTemplate.components.find((c: any) => c.type === 'HEADER');
    const body = selectedTemplate.components.find((c: any) => c.type === 'BODY');

    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 space-y-2">
        <p className="text-xs text-slate-500 mb-2">Preview com dados de exemplo:</p>
        {header?.text && (
          <div className="text-sm font-semibold text-white">
            {header.text
              .replace('{{1}}', 'João')
            }
          </div>
        )}
        {body?.text && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap">
            {body.text
              .replace('{{1}}', 'Empresa ABC Ltda')
              .replace('{{2}}', 'POL-2025-001')
              .replace('{{3}}', 'R$ 1.500,00')
              .replace('{{4}}', '10/01/2025')
            }
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-slate-900 border-white/10">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Enviar Template de Cobrança via WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 mt-4 pr-2">
          {/* Stats Summary */}
          {previewLoading ? (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 bg-slate-800/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : previewData && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Users className="w-4 h-4" />
                  Contatos
                </div>
                <p className="text-2xl font-bold text-white">{previewData.uniqueContacts}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Calendar className="w-4 h-4" />
                  Parcelas
                </div>
                <p className="text-2xl font-bold text-white">{previewData.total}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Valor Total
                </div>
                <p className="text-lg font-bold text-amber-400">
                  {formatCurrency(previewData.totalValue)}
                </p>
              </div>
            </div>
          )}

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

          {/* Send Cadence Selector */}
          <div className="space-y-2">
            <Label>Intervalo entre Envios (Cadência)</Label>
            <Select
              value={delaySeconds.toString()}
              onValueChange={(value) => setDelaySeconds(Number(value))}
            >
              <SelectTrigger className="bg-slate-800/50 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">Rápido (2 segundos)</SelectItem>
                <SelectItem value="5">Normal (5 segundos)</SelectItem>
                <SelectItem value="10">Moderado (10 segundos)</SelectItem>
                <SelectItem value="30">Lento (30 segundos)</SelectItem>
                <SelectItem value="60">Muito Lento (1 minuto)</SelectItem>
              </SelectContent>
            </Select>
            {previewData && (
              <p className="text-xs text-slate-500">
                Tempo estimado: ~{Math.ceil((previewData.uniqueContacts * delaySeconds) / 60)} minuto(s)
              </p>
            )}
          </div>

          {/* Variable Mapping Info */}
          {selectedTemplate && (
            <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/20">
              <p className="text-sm font-medium text-emerald-300 mb-2">
                Mapeamento Automático de Variáveis:
              </p>
              <ul className="text-sm text-slate-400 space-y-1">
                <li>• <span className="text-white">Header {`{{1}}`}</span> → Primeiro nome do contato</li>
                <li className="text-xs text-slate-500 italic">O body se ajusta automaticamente ao template:</li>
                <li>• <span className="text-blue-300">Templates PF (3 vars):</span> Apólice, Valor, Vencimento</li>
                <li>• <span className="text-purple-300">Templates PJ (4 vars):</span> Empresa, Apólice, Valor, Vencimento</li>
              </ul>
            </div>
          )}

          {/* Sample Recipients */}
          {previewData && previewData.samples.length > 0 && (
            <div className="space-y-2">
              <Label className="text-slate-400">Exemplo de Destinatários:</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {previewData.samples.map((sample, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-2 bg-slate-800/30 rounded-lg text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white">{sample.contact_name}</span>
                      {sample.installment_count > 1 && (
                        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                          {sample.installment_count} parcelas
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-amber-400 font-semibold">{formatCurrency(sample.total_value)}</span>
                      <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs">
                        {sample.max_days_overdue}d
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              {previewData.uniqueContacts > 5 && (
                <p className="text-xs text-slate-500">
                  E mais {previewData.uniqueContacts - 5} contatos...
                </p>
              )}
            </div>
          )}

          {/* Warning */}
          <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5" />
            <div className="text-sm">
              <p className="text-amber-300 font-medium">Atenção</p>
              <p className="text-slate-400">
                Serão enviadas mensagens para {previewData?.uniqueContacts || 0} contatos únicos.
                Contatos que receberam cobrança nas últimas 24h serão ignorados.
              </p>
            </div>
          </div>

        </div>

        {/* Fixed Footer with Actions */}
        <div className="flex-shrink-0 flex justify-end gap-3 pt-4 border-t border-white/10 mt-4">
          <Button variant="outline" onClick={onClose} className="border-white/10">
            Cancelar
          </Button>
          <Button
            onClick={() => sendCampaignMutation.mutate()}
            disabled={!selectedTemplate || sendCampaignMutation.isPending}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            {sendCampaignMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Iniciar Envio ({previewData?.uniqueContacts || 0} contatos)
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
