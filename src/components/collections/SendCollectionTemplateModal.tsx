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

      // Group by contact (unique phones)
      const uniqueContacts = new Map<string, InstallmentPreview>();
      previews.forEach(p => {
        if (!uniqueContacts.has(p.contact_phone)) {
          uniqueContacts.set(p.contact_phone, p);
        }
      });

      return {
        total: previews.length,
        uniqueContacts: uniqueContacts.size,
        totalValue: previews.reduce((sum, p) => sum + p.value, 0),
        samples: Array.from(uniqueContacts.values()).slice(0, 5),
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
          delay_between_ms: 2000,
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
      <DialogContent className="max-w-2xl bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Enviar Template de Cobrança via WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
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

          {/* Variable Mapping Info */}
          {selectedTemplate && (
            <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/20">
              <p className="text-sm font-medium text-emerald-300 mb-2">
                Mapeamento Automático de Variáveis:
              </p>
              <ul className="text-sm text-slate-400 space-y-1">
                <li>• <span className="text-white">Header {`{{1}}`}</span> → Primeiro nome do contato</li>
                <li>• <span className="text-white">Body {`{{1}}`}</span> → Nome da empresa/segurado</li>
                <li>• <span className="text-white">Body {`{{2}}`}</span> → Número da apólice</li>
                <li>• <span className="text-white">Body {`{{3}}`}</span> → Valor da parcela (R$)</li>
                <li>• <span className="text-white">Body {`{{4}}`}</span> → Data de vencimento</li>
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
                    <div>
                      <span className="text-white">{sample.contact_name}</span>
                      <span className="text-slate-500 ml-2">{sample.contact_phone}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">{formatCurrency(sample.value)}</span>
                      <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs">
                        {sample.days_overdue}d atraso
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};
